const { query } = require('../../config/database');
const logger = require('../../utils/logger');

// ─── Derive category from action ─────────────────────────────────────────────
function getCategory(action = '') {
  const a = action.toUpperCase();
  if (a.includes('LOGIN') || a.includes('LOGOUT') || a.includes('PASSWORD') || a.includes('TOKEN') || a.includes('AUTH')) return 'AUTH';
  if (a.includes('USER') || a.includes('PROFILE') || a.includes('EMPLOYEE')) return 'USER';
  if (a.includes('CHECKIN') || a.includes('CHECKOUT') || a.includes('ATTENDANCE')) return 'ATTENDANCE';
  if (a.includes('LEAVE')) return 'LEAVE';
  if (a.includes('ANNOUNCEMENT')) return 'ANNOUNCEMENT';
  if (a.includes('ROLE') || a.includes('PERMISSION')) return 'SECURITY';
  if (a.includes('SETTING') || a.includes('SYSTEM') || a.includes('INTEGRATION')) return 'SYSTEM';
  if (a.includes('DEVICE')) return 'DEVICE';
  return 'SYSTEM';
}

// ─── Derive severity from action ─────────────────────────────────────────────
function getSeverity(action = '') {
  const a = action.toUpperCase();
  if (
    a.includes('FAILED') || a.includes('DELETE') || a.includes('BLOCKED') ||
    a.includes('UNAUTHORIZED') || a.includes('BREACH') || a.includes('CRITICAL')
  ) return 'CRITICAL';
  if (
    a.includes('UPDATE') || a.includes('CHANGE') || a.includes('RESET') ||
    a.includes('MANUAL') || a.includes('OVERRIDE') || a.includes('APPROVE') ||
    a.includes('REJECT')
  ) return 'WARNING';
  return 'INFO';
}

// ─── Build human-readable description ────────────────────────────────────────
function buildDescription(action = '', entity = '', details = {}) {
  const d = details || {};
  const a = action.toUpperCase();

  // Auth events
  if (a === 'LOGIN_SUCCESS') return `User logged in successfully`;
  if (a === 'LOGIN_FAILED' || a === 'FAILED_LOGIN') return `Failed login attempt${d.email ? ` for ${d.email}` : ''}`;
  if (a === 'LOGOUT') return `User logged out`;
  if (a === 'PASSWORD_CHANGED') return `Password was changed`;
  if (a === 'PASSWORD_RESET_REQUESTED') return `Password reset token sent${d.email ? ` to ${d.email}` : ''}`;
  if (a === 'PASSWORD_RESET_COMPLETED') return `Password reset completed`;
  if (a === 'FORGOT_PASSWORD') return `Forgot password request${d.email ? ` for ${d.email}` : ''}`;

  // User/Profile events
  if (a === 'USER_CREATED') return `New user created${d.email ? `: ${d.email}` : ''}${d.role ? ` (${d.role})` : ''}`;
  if (a === 'USER_UPDATED' || a === 'PROFILE_UPDATED') {
    const changes = [];
    if (d.nameChanged || (d.oldName && d.newName)) changes.push(`name changed from "${d.oldName}" to "${d.newName}"`);
    if (d.emailChanged || (d.oldEmail && d.newEmail)) changes.push(`email changed from "${d.oldEmail}" to "${d.newEmail}"`);
    if (d.roleChanged || (d.oldRole && d.newRole)) changes.push(`role changed from ${d.oldRole} to ${d.newRole}`);
    if (d.statusChanged || (d.oldStatus && d.newStatus)) changes.push(`status changed from ${d.oldStatus} to ${d.newStatus}`);
    return changes.length > 0 ? `Profile updated: ${changes.join(', ')}` : `Profile updated${d.targetUser ? ` for ${d.targetUser}` : ''}`;
  }
  if (a === 'USER_DELETED') return `User deleted${d.deletedUser ? `: ${d.deletedUser}` : ''}${d.deletedEmail ? ` (${d.deletedEmail})` : ''}`;
  if (a === 'AVATAR_UPDATED') return `Profile picture updated`;

  // Attendance events
  if (a === 'MANUAL_CHECKIN') return `Manual check-in recorded${d.employeeName ? ` for ${d.employeeName}` : ''}${d.location ? ` at ${d.location}` : ''}${d.checkTime ? ` at ${new Date(d.checkTime).toLocaleTimeString()}` : ''}`;
  if (a === 'MANUAL_CHECKOUT') return `Manual check-out recorded${d.employeeName ? ` for ${d.employeeName}` : ''}${d.location ? ` at ${d.location}` : ''}`;
  if (a === 'CHECKIN') return `Employee checked in${d.location ? ` at ${d.location}` : ''}`;
  if (a === 'CHECKOUT') return `Employee checked out${d.location ? ` at ${d.location}` : ''}`;
  if (a === 'ATTENDANCE_OVERRIDE') return `Attendance record overridden${d.employeeName ? ` for ${d.employeeName}` : ''}`;

  // Leave events
  if (a === 'LEAVE_REQUESTED') return `Leave request submitted${d.type ? ` (${d.type})` : ''}${d.days ? ` for ${d.days} days` : ''}`;
  if (a === 'LEAVE_APPROVED') return `Leave request approved${d.employeeName ? ` for ${d.employeeName}` : ''}`;
  if (a === 'LEAVE_REJECTED') return `Leave request rejected${d.employeeName ? ` for ${d.employeeName}` : ''}`;

  // Security events
  if (a === 'ROLE_CHANGED') return `Role changed${d.targetUser ? ` for ${d.targetUser}` : ''}${d.oldRole && d.newRole ? ` from ${d.oldRole} to ${d.newRole}` : ''}`;
  if (a === 'DEVICE_APPROVED') return `Device approved${d.deviceName ? `: ${d.deviceName}` : ''}`;
  if (a === 'DEVICE_BLOCKED') return `Device blocked${d.deviceName ? `: ${d.deviceName}` : ''}`;
  if (a === 'ACCOUNT_LOCKED') return `Account locked${d.reason ? `: ${d.reason}` : ''}`;

  // Announcement events
  if (a === 'ANNOUNCEMENT_CREATED') return `Announcement created: "${d.title || ''}"`;
  if (a === 'ANNOUNCEMENT_UPDATED') return `Announcement updated: "${d.title || ''}"`;
  if (a === 'ANNOUNCEMENT_DELETED') return `Announcement deleted: "${d.title || ''}"`;

  // System events
  if (a === 'SETTINGS_UPDATED') return `System settings updated`;
  if (a === 'EXPORT_DATA') return `Data exported${d.type ? ` (${d.type})` : ''}`;

  // Fallback
  return `${action.replace(/_/g, ' ')}${entity ? ` on ${entity}` : ''}`;
}

// ─── Get audit logs ───────────────────────────────────────────────────────────
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1, limit = 100,
      action, userId, category, severity,
      startDate, endDate, search
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (action) {
      whereConditions.push(`al.action ILIKE $${paramIndex++}`);
      params.push(`%${action}%`);
    }
    if (userId) {
      whereConditions.push(`al.user_id = $${paramIndex++}`);
      params.push(parseInt(userId));
    }
    if (startDate) {
      whereConditions.push(`al.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push(`al.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (search) {
      whereConditions.push(`(al.action ILIKE $${paramIndex} OR al.entity ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const { rows: logs } = await query(
      `SELECT al.id, al.user_id, al.action, al.entity, al.entity_id,
              al.details, al.ip_address, al.metadata, al.created_at,
              u.first_name, u.last_name, u.email as user_email, u.role as user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parseInt(limit), offset]
    );

    const enriched = logs.map(l => {
      let details = {};
      try {
        details = typeof l.details === 'string' ? JSON.parse(l.details) : (l.details || {});
      } catch { details = {}; }

      let metadata = {};
      try {
        metadata = typeof l.metadata === 'string' ? JSON.parse(l.metadata) : (l.metadata || {});
      } catch { metadata = {}; }

      const cat = getCategory(l.action);
      const sev = getSeverity(l.action);
      const desc = buildDescription(l.action, l.entity, details);

      // Filter by derived category/severity if requested
      if (category && category !== 'ALL' && cat !== category) return null;
      if (severity && severity !== 'ALL' && sev !== severity) return null;

      return {
        id: l.id,
        timestamp: l.created_at,
        userId: l.user_id,
        user: l.first_name
          ? `${l.first_name} ${l.last_name}`.trim()
          : (l.user_email || `User #${l.user_id}`),
        userEmail: l.user_email,
        userRole: l.user_role,
        action: l.action,
        category: cat,
        severity: sev,
        description: desc,
        entity: l.entity,
        entityId: l.entity_id,
        details,
        metadata,
        ipAddress: l.ip_address,
      };
    }).filter(Boolean);

    res.json({ success: true, data: enriched });
  } catch (error) {
    logger.error('Get audit logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
};

// ─── Get user audit trail ─────────────────────────────────────────────────────
const getUserAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows: logs } = await query(
      `SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [id, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: logs.map(l => {
        let details = {};
        try { details = typeof l.details === 'string' ? JSON.parse(l.details) : (l.details || {}); } catch { details = {}; }
        return {
          id: l.id,
          timestamp: l.created_at,
          action: l.action,
          category: getCategory(l.action),
          severity: getSeverity(l.action),
          description: buildDescription(l.action, l.entity, details),
          entity: l.entity,
          details,
          ipAddress: l.ip_address,
        };
      }),
    });
  } catch (error) {
    logger.error('Get user audit trail error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audit trail' });
  }
};

module.exports = { getAuditLogs, getUserAuditTrail };
