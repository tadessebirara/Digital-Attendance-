const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');
const { issueEmployeeActivationOtp } = require('../../services/employee-activation.service');

// Get all employees
const getAllEmployees = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, department, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = ["role = 'EMPLOYEE'"];
    let params = [];
    let paramIndex = 1;

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

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].count);

    const { rows: employees } = await query(
      `SELECT id, email, first_name, last_name, status, profile_picture, 
              phone, department, position, employee_id, last_login_at, created_at,
              working_time_type, working_days_per_week, working_hours_per_day,
              monthly_salary
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: employees.map(e => ({
        id: e.id,
        email: e.email,
        firstName: e.first_name,
        lastName: e.last_name,
        fullName: `${e.first_name} ${e.last_name}`,
        status: e.status,
        profilePicture: e.profile_picture,
        phone: e.phone,
        department: e.department,
        position: e.position,
        employeeId: e.employee_id,
        lastLoginAt: e.last_login_at,
        createdAt: e.created_at,
        workingTimeType: e.working_time_type,
        workingDaysPerWeek: e.working_days_per_week,
        workingHoursPerDay: e.working_hours_per_day,
        monthlySalary: parseFloat(e.monthly_salary || '0'),
      })),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: offset + employees.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Get all employees error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employees' });
  }
};

// Get pending employees
const getPendingEmployees = async (req, res) => {
  try {
    const { rows: employees } = await query(
      `SELECT id, email, first_name, last_name, phone, department, position, 
              employee_id, created_at
       FROM users 
       WHERE role = 'EMPLOYEE' AND status = 'PENDING_APPROVAL'
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: employees.map(e => ({
        id: e.id,
        email: e.email,
        firstName: e.first_name,
        lastName: e.last_name,
        phone: e.phone,
        department: e.department,
        position: e.position,
        employeeId: e.employee_id,
        createdAt: e.created_at
      }))
    });
  } catch (error) {
    logger.error('Get pending employees error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending employees' });
  }
};

// Approve employee
const approveEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: employees } = await query(
      'SELECT * FROM users WHERE id = $1 AND role = $2',
      [id, 'EMPLOYEE']
    );

    if (employees.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    if (!['PENDING_APPROVAL', 'PENDING_ACTIVATION'].includes(employees[0].status)) {
      return res.status(400).json({
        success: false,
        error: `Employee is already ${employees[0].status.toLowerCase()}`
      });
    }

    await query(
      "UPDATE users SET status = 'ACTIVE', email_verified = TRUE, first_login = TRUE, updated_at = NOW() WHERE id = $1",
      [id]
    );

    await auditLog(req.user.id, 'EMPLOYEE_APPROVED', 'users', parseInt(id), {}, req);

    // Notify user
    const io = req.app.get('io');
    io.to(`user_${id}`).emit('account_status_changed', {
      status: 'ACTIVE',
      message: 'Your account has been approved! You can now sign in.'
    });

    res.json({ success: true, message: 'Employee approved' });
  } catch (error) {
    logger.error('Approve employee error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve employee' });
  }
};

// Reject employee
const rejectEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { rows: employees } = await query(
      "SELECT id, email, first_name, status FROM users WHERE id = $1 AND role = 'EMPLOYEE'",
      [id]
    );

    if (employees.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    await query(
      "UPDATE users SET status = 'REJECTED', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await auditLog(req.user.id, 'EMPLOYEE_REJECTED', 'users', parseInt(id), { reason }, req);

    // Notify user via socket
    const io = req.app.get('io');
    io.to(`user_${id}`).emit('account_status_changed', {
      status: 'REJECTED',
      message: `Your account has been rejected. ${reason ? 'Reason: ' + reason : 'Please contact HR for details.'}`
    });

    res.json({ success: true, message: 'Employee rejected' });
  } catch (error) {
    logger.error('Reject employee error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject employee' });
  }
};

// Create employee (HR creates directly — role fixed to EMPLOYEE)
const createEmployee = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, department, position,
            workingTimeType, workingDaysPerWeek, workingHoursPerDay, workSchedule,
            monthlySalary } = req.body;

    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const provisionalSecret = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(provisionalSecret, 12);
    const year = new Date().getFullYear();
    const prefix = `EMP${year}`;
    const { rows: maxRows } = await query(
      `SELECT MAX(CAST(SUBSTRING(employee_id FROM ${prefix.length + 1}) AS INTEGER)) AS max_seq
       FROM users WHERE employee_id LIKE $1`,
      [`${prefix}%`]
    );
    const nextSeq = (maxRows[0].max_seq || 0) + 1;
    const employeeId = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    // Derive hours per day from schedule times if not explicitly provided
    let hoursPerDay = workingHoursPerDay ?? 8;
    if (workSchedule?.startTime && workSchedule?.endTime) {
      const [sh, sm] = workSchedule.startTime.split(':').map(Number);
      const [eh, em] = workSchedule.endTime.split(':').map(Number);
      hoursPerDay = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    }

    const { rows: newUser } = await query(
      `INSERT INTO users
         (email, password, first_name, last_name, role, status,
          phone, department, position, employee_id, created_by, first_login,
          working_time_type, working_days_per_week, working_hours_per_day,
          email_verified, activation_requires_password, monthly_salary)
       VALUES ($1,$2,$3,$4,'EMPLOYEE','PENDING_ACTIVATION',$5,$6,$7,$8,$9,TRUE,$10,$11,$12,FALSE,TRUE,$13)
       RETURNING id, email, first_name, last_name, role, status, employee_id, created_at`,
      [email.toLowerCase(), hashedPassword, firstName, lastName,
       phone || null, department || null, position || null,
       employeeId, req.user.id,
       workingTimeType || workSchedule?.shiftType || 'FULL_TIME',
       workSchedule?.workDays?.length ?? workingDaysPerWeek ?? 5,
       hoursPerDay,
       parseFloat(monthlySalary || '0')]
    );

    const u = newUser[0];

    try {
      await issueEmployeeActivationOtp({
        id: u.id,
        email: u.email,
        first_name: u.first_name,
      });
    } catch (e) {
      logger.error('[createEmployee] Activation email failed:', e);
    }

    // Save work schedule to user_schedules so the employee sees their schedule immediately
    if (workSchedule) {
      const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const scheduleType = (workSchedule.shiftType || 'REGULAR').toUpperCase();
      const allDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const grace = workSchedule.gracePeriod || 15;

      for (const day of allDays) {
        const isWorking = (workSchedule.workDays || []).includes(day);
        await query(
          `INSERT INTO user_schedules
             (user_id, day_of_week, work_start_time, work_end_time,
              late_threshold_minutes, grace_minutes, is_working_day, schedule_type, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (user_id, day_of_week) DO UPDATE
             SET work_start_time      = EXCLUDED.work_start_time,
                 work_end_time        = EXCLUDED.work_end_time,
                 late_threshold_minutes = EXCLUDED.late_threshold_minutes,
                 grace_minutes        = EXCLUDED.grace_minutes,
                 is_working_day       = EXCLUDED.is_working_day,
                 schedule_type        = EXCLUDED.schedule_type,
                 updated_at           = NOW()`,
          [
            u.id,
            dayMap[day],
            workSchedule.startTime || '09:00',
            workSchedule.endTime || '17:00',
            grace,
            isWorking,
            scheduleType,
          ]
        );
      }

      // Upsert employee_schedule_settings for policy-level overrides
      await query(
        `INSERT INTO employee_schedule_settings (user_id, grace_minutes, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET grace_minutes = $2, updated_at = NOW()`,
        [u.id, grace]
      );
    }

    await auditLog(req.user.id, 'EMPLOYEE_CREATED', 'users', u.id, { email, role: 'EMPLOYEE' }, req);

    res.status(201).json({
      success: true,
      message: 'Employee created. Activation email sent — they must verify and set a password in the mobile app.',
      data: {
        id: u.id, email: u.email,
        firstName: u.first_name, lastName: u.last_name,
        role: u.role, status: u.status,
        employeeId: u.employee_id, createdAt: u.created_at,
      },
    });
  } catch (error) {
    logger.error('Create employee error:', error);
    res.status(500).json({ success: false, error: 'Failed to create employee' });
  }
};

// Get HR stats
const getHRStats = async (req, res) => {
  try {
    const [{ rows: userStats }, { rows: leaveStats }, { rows: deviceStats }] = await Promise.all([
      query(`SELECT
        COUNT(*) FILTER (WHERE role = 'EMPLOYEE') AS total_employees,
        COUNT(*) FILTER (WHERE role = 'EMPLOYEE' AND status = 'ACTIVE') AS active_employees,
        COUNT(*) FILTER (WHERE role = 'EMPLOYEE' AND status = 'PENDING_APPROVAL') AS pending_employees,
        COUNT(DISTINCT CASE WHEN role = 'EMPLOYEE' THEN department END) AS total_departments
        FROM users`),
      query(`SELECT COUNT(*) AS pending_leaves FROM leave_requests WHERE status = 'PENDING'`),
      query(`SELECT COUNT(*) AS pending_devices FROM device_approval_requests WHERE status = 'PENDING'`),
    ]);

    res.json({
      success: true,
      data: {
        totalEmployees: parseInt(userStats[0].total_employees),
        activeEmployees: parseInt(userStats[0].active_employees),
        pendingEmployees: parseInt(userStats[0].pending_employees),
        pendingLeaves: parseInt(leaveStats[0].pending_leaves),
        pendingDevices: parseInt(deviceStats[0].pending_devices),
        totalDepartments: parseInt(userStats[0].total_departments)
      }
    });
  } catch (error) {
    logger.error('Get HR stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
};

module.exports = {
  getAllEmployees,
  getPendingEmployees,
  approveEmployee,
  rejectEmployee,
  getHRStats,
  createEmployee,
};