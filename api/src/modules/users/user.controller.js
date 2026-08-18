const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, transaction } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');
const { issueEmployeeActivationOtp } = require('../../services/employee-activation.service');
const { sendEmailChangeOtp } = require('../../services/email.service');

// Get all users with pagination and filters
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, search, department } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (role) {
      whereConditions.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (status) {
      whereConditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (department) {
      whereConditions.push(`department = $${paramIndex++}`);
      params.push(department);
    }

    if (search) {
      whereConditions.push(`(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR employee_id ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // HR can only see employees, not other HRs or admins
    if (req.user.role === 'HR') {
      whereConditions.push(`role = 'EMPLOYEE'`);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const { rows: countRows } = await query(countQuery, params);
    const total = parseInt(countRows[0].count);

    // Get users
    const usersQuery = `
      SELECT id, email, first_name, last_name, role, status, profile_picture, 
             phone, department, position, employee_id, last_login_at, created_at,
             working_time_type, working_days_per_week, working_hours_per_day,
             monthly_salary, account_locked_until, failed_login_attempts
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(parseInt(limit), offset);

    const { rows: users } = await query(usersQuery, params);

    res.json({
      success: true,
      data: users.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        fullName: `${u.first_name} ${u.last_name}`,
        role: u.role,
        status: u.status,
        profilePicture: u.profile_picture,
        phone: u.phone,
        department: u.department,
        position: u.position,
        employeeId: u.employee_id,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at,
        workingTimeType: u.working_time_type,
        workingDaysPerWeek: u.working_days_per_week,
        workingHoursPerDay: u.working_hours_per_day,
        monthlySalary: parseFloat(u.monthly_salary || '0'),
        accountLockedUntil: u.account_locked_until || null,
        failedLoginAttempts: u.failed_login_attempts || 0,
      })),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: offset + users.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    // Users can only see their own profile unless they're Admin/HR
    if (parseInt(id) !== requesterId && !['ADMIN', 'HR'].includes(requesterRole)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { rows: users } = await query(
      `SELECT id, email, first_name, last_name, role, status, profile_picture,
              phone, department, position, employee_id, last_login_at, created_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (requesterRole === 'HR' && parseInt(id) !== requesterId && users[0].role !== 'EMPLOYEE') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'HR_SCOPE'
      });
    }

    const u = users[0];

    res.json({
      success: true,
      data: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        fullName: `${u.first_name} ${u.last_name}`,
        role: u.role,
        status: u.status,
        profilePicture: u.profile_picture,
        phone: u.phone,
        department: u.department,
        position: u.position,
        employeeId: u.employee_id,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at
      }
    });
  } catch (error) {
    logger.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user'
    });
  }
};

// Create user (Admin/HR)
const createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, phone, department, position, workSchedule, workingTimeType } = req.body;

    // HR can only create EMPLOYEE accounts
    if (req.user.role === 'HR' && role !== 'EMPLOYEE') {
      return res.status(403).json({ success: false, error: 'HR can only create employee accounts' });
    }

    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const isEmployee = role === 'EMPLOYEE';
    const provisionalSecret = isEmployee ? crypto.randomBytes(32).toString('hex') : password;
    const hashedPassword = await bcrypt.hash(provisionalSecret, 12);
    const status = isEmployee ? 'PENDING_ACTIVATION' : 'ACTIVE';
    const emailVerified = !isEmployee;
    const activationRequiresPassword = isEmployee;

    const year = new Date().getFullYear();
    const prefix = `EMP${year}`;
    const { rows: maxRows } = await query(
      `SELECT MAX(CAST(SUBSTRING(employee_id FROM ${prefix.length + 1}) AS INTEGER)) AS max_seq
       FROM users WHERE employee_id LIKE $1`,
      [`${prefix}%`]
    );
    const nextSeq = (maxRows[0].max_seq || 0) + 1;
    const employeeId = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    const { rows: newUser } = await query(
      `INSERT INTO users (email, password, first_name, last_name, role, status, phone, department, position, employee_id,
                          working_time_type, working_days_per_week, working_hours_per_day, created_by, first_login,
                          email_verified, activation_requires_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ADMIN', $14, $15, $16)
       RETURNING id, email, first_name, last_name, role, status, employee_id, created_at`,
      [
        email.toLowerCase(), hashedPassword, firstName, lastName, role, status,
        phone, department, position, employeeId,
        (workingTimeType || workSchedule?.shiftType || 'REGULAR').toUpperCase(),
        workSchedule?.workDays?.length || 5,
        workSchedule ? (workSchedule.endTime && workSchedule.startTime
          ? (() => {
              const [sh, sm] = (workSchedule.startTime || '09:00').split(':').map(Number);
              const [eh, em] = (workSchedule.endTime || '17:00').split(':').map(Number);
              return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
            })()
          : 8) : 8,
        isEmployee ? true : false,
        emailVerified,
        activationRequiresPassword
      ]
    );

    const u = newUser[0];

    if (isEmployee) {
      try {
        await issueEmployeeActivationOtp({
          id: u.id,
          email: u.email,
          first_name: u.first_name,
        });
      } catch (e) {
        logger.error('[createUser] Activation email failed:', e);
      }
    }

    // Save work schedule to user_schedules table
    if (workSchedule) {
      const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
      const scheduleType = (workSchedule.shiftType || 'Regular').toUpperCase();
      const allDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const scheduleRows = allDays.map(day => ({
        dayOfWeek: dayMap[day],
        workStartTime: workSchedule.startTime || '09:00',
        workEndTime: workSchedule.endTime || '17:00',
        lateThresholdMinutes: workSchedule.gracePeriod || 15,
        isWorkingDay: (workSchedule.workDays || []).includes(day),
      }));

      for (const s of scheduleRows) {
        await query(
          `INSERT INTO user_schedules
             (user_id, day_of_week, work_start_time, work_end_time,
              late_threshold_minutes, is_working_day, schedule_type, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
          [u.id, s.dayOfWeek, s.workStartTime, s.workEndTime, s.lateThresholdMinutes, s.isWorkingDay, scheduleType]
        );
      }
    }

    await auditLog(req.user.id, 'USER_CREATED', 'users', u.id, { email, role }, req);

    res.status(201).json({
      success: true,
      message: isEmployee
        ? 'Employee created. An activation email with a verification code has been sent.'
        : 'User created successfully',
      data: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        status: u.status,
        employeeId: u.employee_id,
        createdAt: u.created_at
      }
    });
  } catch (error) {
    logger.error('Create user error:', error);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;
    const { firstName, lastName, phone, department, position, workingTimeType, workingDaysPerWeek, workingHoursPerDay } = req.body;

    // Check permissions
    if (parseInt(id) !== requesterId && requesterRole !== 'ADMIN') {
      if (requesterRole === 'HR') {
        // HR can only update employees
        const { rows: targetUser } = await query('SELECT role FROM users WHERE id = $1', [id]);
        if (targetUser.length === 0 || targetUser[0].role !== 'EMPLOYEE') {
          return res.status(403).json({
            success: false,
            error: 'HR can only update employee profiles'
          });
        }
      } else {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (firstName !== undefined) { updates.push(`first_name = $${paramIndex++}`); params.push(firstName); }
    if (lastName !== undefined)  { updates.push(`last_name = $${paramIndex++}`);  params.push(lastName); }
    if (phone !== undefined)     { updates.push(`phone = $${paramIndex++}`);       params.push(phone); }
    if (department !== undefined){ updates.push(`department = $${paramIndex++}`);  params.push(department); }
    if (position !== undefined)  { updates.push(`position = $${paramIndex++}`);    params.push(position); }
    if (workingTimeType !== undefined)    { updates.push(`working_time_type = $${paramIndex++}`);     params.push(workingTimeType); }
    if (workingDaysPerWeek !== undefined) { updates.push(`working_days_per_week = $${paramIndex++}`); params.push(workingDaysPerWeek); }
    if (workingHoursPerDay !== undefined) { updates.push(`working_hours_per_day = $${paramIndex++}`); params.push(workingHoursPerDay); }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    params.push(id);

    const { rows: updated } = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, first_name, last_name, role, status, profile_picture, phone, department, position, employee_id, updated_at`,
      params
    );

    if (updated.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const u = updated[0];

    await auditLog(requesterId, 'USER_UPDATED', 'users', u.id, { 
      oldValues: req.body,
      updatedFields: Object.keys(req.body)
    }, req);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        status: u.status,
        profilePicture: u.profile_picture,
        phone: u.phone,
        department: u.department,
        position: u.position,
        employeeId: u.employee_id,
        updatedAt: u.updated_at
      }
    });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
};

// Update user status
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    // Get old status
    const { rows: users } = await query('SELECT status, role, email FROM users WHERE id = $1', [id]);
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];
    const oldStatus = user.status;

    // HR cannot change status of other HRs or Admins
    if (req.user.role === 'HR' && user.role !== 'EMPLOYEE') {
      return res.status(403).json({
        success: false,
        error: 'HR can only manage employee status'
      });
    }

    // Cannot deactivate the last admin
    if (status === 'INACTIVE' && user.role === 'ADMIN') {
      const { rows: adminCount } = await query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'");
      if (parseInt(adminCount[0].count) <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot deactivate the last active admin'
        });
      }
    }

    await query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );

    await auditLog(req.user.id, 'USER_STATUS_CHANGED', 'users', parseInt(id), {
      oldStatus,
      newStatus: status,
      reason
    }, req);

    // Notify user via socket
    const io = req.app.get('io');
    io.to(`user_${id}`).emit('account_status_changed', { status });

    res.json({
      success: true,
      message: `User status updated to ${status}`,
      data: { id: parseInt(id), status, previousStatus: oldStatus }
    });
  } catch (error) {
    logger.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user status'
    });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Cannot delete yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    // Get user info before deletion
    const { rows: users } = await query('SELECT email, role FROM users WHERE id = $1', [id]);
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    // Cannot delete last admin
    if (user.role === 'ADMIN') {
      const { rows: adminCount } = await query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'");
      if (parseInt(adminCount[0].count) <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete the last admin'
        });
      }
    }

    await query('DELETE FROM users WHERE id = $1', [id]);

    await auditLog(req.user.id, 'USER_DELETED', 'users', parseInt(id), { email: user.email }, req);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
};

// Get my profile
const getMyProfile = async (req, res) => {
  try {
    const { rows: users } = await query(
      `SELECT id, email, first_name, last_name, role, status, profile_picture,
              phone, department, position, employee_id, last_login_at, created_at,
              working_time_type, working_days_per_week,
              preferences, two_factor_enabled, two_factor_method, biometric_enabled
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    const u = users[0];

    // Fetch schedule
    const { rows: schedules } = await query(
      `SELECT day_of_week, work_start_time, work_end_time, late_threshold_minutes, is_working_day, schedule_type
       FROM user_schedules WHERE user_id = $1 ORDER BY day_of_week`,
      [req.user.id]
    );

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    res.json({
      success: true,
      data: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        fullName: `${u.first_name} ${u.last_name}`,
        role: u.role,
        status: u.status,
        profilePicture: u.profile_picture,
        phone: u.phone,
        department: u.department,
        position: u.position,
        employeeId: u.employee_id,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at,
        workingTimeType: u.working_time_type,
        workingDaysPerWeek: u.working_days_per_week,
        preferences: u.preferences || {},
        twoFactorEnabled: u.two_factor_enabled,
        twoFactorMethod: u.two_factor_method || 'email',
        biometricEnabled: u.biometric_enabled,
        schedule: schedules.map(s => ({
          dayOfWeek: s.day_of_week,
          dayName: dayNames[s.day_of_week],
          workStartTime: s.work_start_time,
          workEndTime: s.work_end_time,
          lateThresholdMinutes: s.late_threshold_minutes,
          isWorkingDay: s.is_working_day,
          scheduleType: s.schedule_type,
        }))
      }
    });
  } catch (error) {
    logger.error('Get my profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

// Update my profile
const updateMyProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    const userId = req.user.id;

    const { rows: oldData } = await query(
      'SELECT first_name, last_name, phone FROM users WHERE id = $1',
      [userId]
    );

    const { rows: updated } = await query(
      `UPDATE users 
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           phone = COALESCE($3, phone),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [firstName, lastName, phone, userId]
    );

    const u = updated[0];

    await auditLog(userId, 'PROFILE_UPDATED', 'users', userId, {
      old: oldData[0],
      new: { first_name: firstName, last_name: lastName, phone }
    }, req);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        phone: u.phone,
        profilePicture: u.profile_picture
      }
    });
  } catch (error) {
    logger.error('Update my profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
};

// Upload profile picture â€” stores as base64 data URL in the DB (no filesystem needed)
// Upload profile picture - stores as base64 data URL in the DB
const multer = require('multer');
const _avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
}).single('avatar');

const uploadProfilePicture = (req, res) => {
  _avatarUpload(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
      if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });
      const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      await query('UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE id = $2', [base64, req.user.id]);
      await auditLog(req.user.id, 'PROFILE_PICTURE_UPDATED', 'users', req.user.id, { ip: req.ip }, req);
      res.json({ success: true, message: 'Profile picture updated', data: { profilePicture: base64 } });
    } catch (error) {
      logger.error('Upload profile picture error:', error);
      res.status(500).json({ success: false, error: 'Failed to upload profile picture' });
    }
  });
};

// Upload profile picture via base64 JSON (for mobile web / Flutter web)
const uploadProfilePictureBase64 = async (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData || !imageData.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'Invalid image data' });
    }
    // Limit to ~10MB base64 string (~7.5MB actual)
    if (imageData.length > 14 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Image too large (max 10MB)' });
    }
    await query(
      'UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE id = $2',
      [imageData, req.user.id]
    );
    await auditLog(req.user.id, 'PROFILE_PICTURE_UPDATED', 'users', req.user.id, { ip: req.ip }, req);
    res.json({ success: true, message: 'Profile picture updated', data: { profilePicture: imageData } });
  } catch (error) {
    logger.error('Upload profile picture base64 error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload profile picture' });
  }
};

// Admin reset user password
const adminResetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const { rows: users } = await query('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Bump token_version to invalidate all existing sessions
    await query(
      'UPDATE users SET password = $1, token_version = token_version + 1, failed_login_attempts = 0, account_locked_until = NULL, updated_at = NOW() WHERE id = $2',
      [hashedPassword, id]
    );

    // Revoke all refresh tokens
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    await query('DELETE FROM session_tracking WHERE user_id = $1', [id]);

    await auditLog(req.user.id, 'ADMIN_PASSWORD_RESET', 'users', parseInt(id), {
      targetEmail: users[0].email,
      targetRole: users[0].role,
      resetBy: req.user.email,
    }, req);

    res.json({ success: true, message: `Password reset successfully for ${users[0].email}` });
  } catch (error) {
    logger.error('Admin reset password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
};

// ─── Get user preferences ─────────────────────────────────────────────────────
const getPreferences = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT preferences, two_factor_enabled, two_factor_method, biometric_enabled
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    const u = rows[0];
    res.json({
      success: true,
      data: {
        preferences: u.preferences || {},
        twoFactorEnabled: u.two_factor_enabled,
        twoFactorMethod: u.two_factor_method || 'email',
        biometricEnabled: u.biometric_enabled,
      }
    });
  } catch (error) {
    logger.error('Get preferences error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch preferences' });
  }
};

// ─── Update user preferences (theme, language, notifications, etc.) ───────────
const updatePreferences = async (req, res) => {
  try {
    const { theme, accentColor, fontSize, uiStyle, language, notifications } = req.body;

    // Build a partial JSONB merge — only update keys that were sent
    const patch = {};
    if (theme        !== undefined) patch.theme        = theme;
    if (accentColor  !== undefined) patch.accentColor  = accentColor;
    if (fontSize     !== undefined) patch.fontSize     = fontSize;
    if (uiStyle      !== undefined) patch.uiStyle      = uiStyle;
    if (language     !== undefined) patch.language     = language;
    if (notifications !== undefined) patch.notifications = notifications;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, error: 'No preference fields provided' });
    }

    // Merge into existing JSONB using || operator (PostgreSQL 9.5+)
    const { rows } = await query(
      `UPDATE users
       SET preferences = preferences || $1::jsonb,
           updated_at  = NOW()
       WHERE id = $2
       RETURNING preferences`,
      [JSON.stringify(patch), req.user.id]
    );

    res.json({
      success: true,
      message: 'Preferences updated',
      data: { preferences: rows[0].preferences }
    });
  } catch (error) {
    logger.error('Update preferences error:', error);
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
};

// ─── Update 2FA settings ──────────────────────────────────────────────────────
const updateTwoFactor = async (req, res) => {
  try {
    const { enabled, method } = req.body;

    const validMethods = ['sms', 'email', 'app'];
    if (method !== undefined && !validMethods.includes(method)) {
      return res.status(400).json({ success: false, error: 'Invalid 2FA method. Must be sms, email, or app' });
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (enabled !== undefined) { updates.push(`two_factor_enabled = $${idx++}`); params.push(Boolean(enabled)); }
    if (method  !== undefined) { updates.push(`two_factor_method  = $${idx++}`); params.push(method); }
    updates.push(`updated_at = NOW()`);
    params.push(req.user.id);

    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING two_factor_enabled, two_factor_method`,
      params
    );

    await auditLog(req.user.id, 'TWO_FACTOR_UPDATED', 'users', req.user.id, {
      enabled, method, ip: req.ip
    }, req);

    res.json({
      success: true,
      message: `Two-factor authentication ${rows[0].two_factor_enabled ? 'enabled' : 'disabled'}`,
      data: {
        twoFactorEnabled: rows[0].two_factor_enabled,
        twoFactorMethod:  rows[0].two_factor_method,
      }
    });
  } catch (error) {
    logger.error('Update 2FA error:', error);
    res.status(500).json({ success: false, error: 'Failed to update 2FA settings' });
  }
};

// ─── Update biometric setting ─────────────────────────────────────────────────
const updateBiometric = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
    }

    await query(
      'UPDATE users SET biometric_enabled = $1, updated_at = NOW() WHERE id = $2',
      [enabled, req.user.id]
    );

    await auditLog(req.user.id, 'BIOMETRIC_UPDATED', 'users', req.user.id, {
      enabled, ip: req.ip
    }, req);

    res.json({
      success: true,
      message: `Biometric login ${enabled ? 'enabled' : 'disabled'}`,
      data: { biometricEnabled: enabled }
    });
  } catch (error) {
    logger.error('Update biometric error:', error);
    res.status(500).json({ success: false, error: 'Failed to update biometric setting' });
  }
};

// ─── HR Notes ─────────────────────────────────────────────────────────────────
// Internal HR-only notes about an employee — never visible to the employee.

const getHrNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT hr_notes FROM users WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: { notes: rows[0].hr_notes || '' } });
  } catch (error) {
    logger.error('getHrNotes error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch HR notes' });
  }
};

const saveHrNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    if (typeof notes !== 'string') {
      return res.status(400).json({ success: false, error: 'notes must be a string' });
    }
    const { rows } = await query(
      `UPDATE users SET hr_notes = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [notes.trim(), id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
    await auditLog(req.user.id, 'HR_NOTES_UPDATED', 'users', parseInt(id), {}, req);
    res.json({ success: true, message: 'HR notes saved' });
  } catch (error) {
    logger.error('saveHrNotes error:', error);
    res.status(500).json({ success: false, error: 'Failed to save HR notes' });
  }
};

// ─── Performance Ratings ──────────────────────────────────────────────────────
// Returns attendance-based KPIs + any HR-entered ratings for an employee.

const getPerformance = async (req, res) => {
  try {
    const { id } = req.params;
    const { months = 3 } = req.query;
    const limit = Math.min(Math.max(parseInt(months) || 3, 1), 12);

    // ── Attendance KPIs from attendance_records ───────────────────────────────
    const { rows: kpi } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'PRESENT')                        AS present,
         COUNT(*) FILTER (WHERE status = 'LATE')                           AS late,
         COUNT(*) FILTER (WHERE status = 'ABSENT')                         AS absent,
         COUNT(*) FILTER (WHERE status = 'HALF_DAY')                       AS half_day,
         COUNT(*) FILTER (WHERE status = 'EARLY_LEAVE')                    AS early_leave,
         COUNT(*) FILTER (WHERE clock_out_time IS NOT NULL)                 AS completed,
         ROUND(AVG(hours_worked) FILTER (WHERE hours_worked > 0), 2)       AS avg_hours,
         COUNT(*)                                                           AS total
       FROM attendance_records
       WHERE user_id = $1
         AND clock_in_time >= NOW() - ($2 || ' months')::interval`,
      [id, limit]
    );

    // ── HR-entered performance ratings ────────────────────────────────────────
    const { rows: ratings } = await query(
      `SELECT pr.id, pr.period, pr.rating, pr.category, pr.notes,
              pr.created_at, u.first_name || ' ' || u.last_name AS rated_by_name
       FROM performance_ratings pr
       JOIN users u ON u.id = pr.rated_by
       WHERE pr.user_id = $1
       ORDER BY pr.period DESC, pr.category`,
      [id]
    );

    const k = kpi[0];
    const total    = parseInt(k.total)    || 0;
    const present  = parseInt(k.present)  || 0;
    const late     = parseInt(k.late)     || 0;
    const absent   = parseInt(k.absent)   || 0;

    res.json({
      success: true,
      data: {
        period: `Last ${limit} month${limit === 1 ? '' : 's'}`,
        kpi: {
          total,
          present,
          late,
          absent,
          halfDay:     parseInt(k.half_day)    || 0,
          earlyLeave:  parseInt(k.early_leave) || 0,
          completed:   parseInt(k.completed)   || 0,
          avgHours:    parseFloat(k.avg_hours) || 0,
          attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : null,
          punctualityRate: (present + late) > 0 ? Math.round((present / (present + late)) * 100) : null,
        },
        ratings,
      },
    });
  } catch (error) {
    logger.error('getPerformance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch performance data' });
  }
};

const upsertPerformanceRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { period, rating, category = 'OVERALL', notes } = req.body;

    if (!period || !/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ success: false, error: 'period must be YYYY-MM' });
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ success: false, error: 'rating must be 1–5' });

    const { rows } = await query(
      `INSERT INTO performance_ratings (user_id, rated_by, period, rating, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, period, category)
       DO UPDATE SET rating = $4, notes = $6, rated_by = $2, updated_at = NOW()
       RETURNING *`,
      [id, req.user.id, period, rating, category, notes || null]
    );

    await auditLog(req.user.id, 'PERFORMANCE_RATING_UPSERTED', 'performance_ratings', rows[0].id,
      { userId: id, period, rating, category }, req);

    res.json({ success: true, data: rows[0], message: 'Rating saved' });
  } catch (error) {
    logger.error('upsertPerformanceRating error:', error);
    res.status(500).json({ success: false, error: 'Failed to save rating' });
  }
};

const deletePerformanceRating = async (req, res) => {
  try {
    const { id, rid } = req.params;
    const { rows } = await query(
      `DELETE FROM performance_ratings WHERE id = $1 AND user_id = $2 RETURNING id`,
      [rid, id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Rating not found' });
    res.json({ success: true, message: 'Rating deleted' });
  } catch (error) {
    logger.error('deletePerformanceRating error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete rating' });
  }
};

// ─── Unlock Account ───────────────────────────────────────────────────────────
// POST /users/:id/unlock-account  (Admin + HR)
// Clears brute-force lock: resets failed_login_attempts + account_locked_until.
const unlockAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await query(
      'SELECT id, email, role, failed_login_attempts, account_locked_until FROM users WHERE id = $1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found.' });

    const u = rows[0];

    // HR cannot unlock other HRs or Admins
    if (req.user.role === 'HR' && u.role !== 'EMPLOYEE') {
      return res.status(403).json({ success: false, error: 'HR can only unlock employee accounts.' });
    }

    await query(
      `UPDATE users
       SET failed_login_attempts = 0,
           account_locked_until  = NULL,
           updated_at            = NOW()
       WHERE id = $1`,
      [id]
    );

    await auditLog(req.user.id, 'ACCOUNT_UNLOCKED', 'users', parseInt(id), {
      targetEmail: u.email,
      previousAttempts: u.failed_login_attempts,
      previousLockedUntil: u.account_locked_until,
      unlockedBy: req.user.email,
    }, req);

    // Notify the user via socket so their app can react in real-time
    const io = req.app.get('io');
    if (io) io.to(`user_${id}`).emit('account_unlocked', { userId: parseInt(id) });

    res.json({
      success: true,
      message: `Account unlocked successfully for ${u.email}`,
      data: { id: parseInt(id), email: u.email, accountLockedUntil: null, failedLoginAttempts: 0 },
    });
  } catch (error) {
    logger.error('unlockAccount error:', error);
    res.status(500).json({ success: false, error: 'Failed to unlock account.' });
  }
};
// POST /users/profile/request-email-change
// Sends a 6-digit OTP to the *new* email. OTP stored in email_change_otp / email_change_otp_expires.

const requestEmailChange = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const userId = req.user.id;

    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }

    const normalised = newEmail.trim().toLowerCase();

    // Must differ from current email
    const { rows: self } = await query('SELECT email, first_name FROM users WHERE id = $1', [userId]);
    if (!self.length) return res.status(404).json({ success: false, error: 'User not found.' });
    if (self[0].email === normalised) {
      return res.status(400).json({ success: false, error: 'New email must differ from your current email.' });
    }

    // Must not already be taken
    const { rows: taken } = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [normalised, userId]);
    if (taken.length) {
      return res.status(409).json({ success: false, error: 'That email address is already in use by another account.' });
    }

    // Generate 6-digit OTP
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    // Store OTP + pending email in DB (columns added by migration below)
    await query(
      `UPDATE users
       SET email_change_pending  = $1,
           email_change_otp      = $2,
           email_change_otp_exp  = $3,
           updated_at            = NOW()
       WHERE id = $4`,
      [normalised, otpCode, expiresAt, userId]
    );

    // Send OTP to the NEW email
    await sendEmailChangeOtp({
      to: normalised,
      firstName: self[0].first_name,
      otpCode,
      expiresInMinutes: 15,
    });

    await auditLog(userId, 'EMAIL_CHANGE_REQUESTED', 'users', userId, {
      newEmail: normalised,
      ip: req.ip,
    }, req);

    res.json({
      success: true,
      message: `A verification code has been sent to ${normalised}. It expires in 15 minutes.`,
    });
  } catch (error) {
    logger.error('requestEmailChange error:', error);
    res.status(500).json({ success: false, error: 'Failed to send verification code.' });
  }
};

// ─── Confirm Email Change ─────────────────────────────────────────────────────
// POST /users/profile/confirm-email-change
// Validates OTP, updates email, clears pending fields, bumps token_version.
const confirmEmailChange = async (req, res) => {
  try {
    const { otpCode } = req.body;
    const userId = req.user.id;

    if (!otpCode || !/^\d{6}$/.test(otpCode.trim())) {
      return res.status(400).json({ success: false, error: 'Please enter the 6-digit verification code.' });
    }

    const { rows } = await query(
      `SELECT email, first_name, email_change_pending, email_change_otp, email_change_otp_exp
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found.' });

    const u = rows[0];

    if (!u.email_change_pending || !u.email_change_otp) {
      return res.status(400).json({ success: false, error: 'No email change request found. Please start the process again.' });
    }

    if (new Date() > new Date(u.email_change_otp_exp)) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    if (u.email_change_otp !== otpCode.trim()) {
      return res.status(400).json({ success: false, error: 'Incorrect verification code. Please try again.' });
    }

    // Double-check new email not taken (race condition guard)
    const { rows: taken } = await query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [u.email_change_pending, userId]
    );
    if (taken.length) {
      return res.status(409).json({ success: false, error: 'That email address was just taken by another account.' });
    }

    const oldEmail = u.email;

    // Commit the change — bump token_version to invalidate all existing sessions
    await query(
      `UPDATE users
       SET email                = $1,
           email_verified       = TRUE,
           email_change_pending = NULL,
           email_change_otp     = NULL,
           email_change_otp_exp = NULL,
           token_version        = token_version + 1,
           updated_at           = NOW()
       WHERE id = $2`,
      [u.email_change_pending, userId]
    );

    // Revoke all refresh tokens — user must re-login on other devices
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    await query('DELETE FROM session_tracking WHERE user_id = $1', [userId]);

    await auditLog(userId, 'EMAIL_CHANGED', 'users', userId, {
      oldEmail,
      newEmail: u.email_change_pending,
      ip: req.ip,
    }, req);

    res.json({
      success: true,
      message: 'Email address updated successfully. Please sign in again with your new email.',
      data: { email: u.email_change_pending },
    });
  } catch (error) {
    logger.error('confirmEmailChange error:', error);
    res.status(500).json({ success: false, error: 'Failed to update email address.' });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  getMyProfile,
  updateMyProfile,
  uploadProfilePicture,
  uploadProfilePictureBase64,
  adminResetPassword,
  getPreferences,
  updatePreferences,
  updateTwoFactor,
  updateBiometric,
  getHrNotes,
  saveHrNotes,
  getPerformance,
  upsertPerformanceRating,
  deletePerformanceRating,
  requestEmailChange,
  confirmEmailChange,
  unlockAccount,
};

