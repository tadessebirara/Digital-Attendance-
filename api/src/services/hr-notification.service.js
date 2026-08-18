const { query } = require('../config/database');
const logger = require('../utils/logger');

// ─── Send notification to all HR users ───────────────────────────────────────
const notifyHR = async (app, { type, category, severity = 'INFO', title, message, metadata = {}, relatedUserId }) => {
  try {
    // Bulk INSERT notification for all active HR users — single query instead of N+1
    await query(
      `INSERT INTO notifications (user_id, title, message, type, category, severity, metadata, is_read)
       SELECT id, $1, $2, $3, $4, $5, $6, FALSE
       FROM users WHERE role = 'HR' AND status = 'ACTIVE'`,
      [title, message, type, category, severity, JSON.stringify({ ...metadata, relatedUserId })]
    );

    // Real-time push to HR room
    if (app) {
      const io = app.get('io');
      if (io) {
        io.to('hr_room').emit('hr_notification', {
          type, category, severity, title, message, metadata, relatedUserId,
          createdAt: new Date().toISOString()
        });
      }
    }
  } catch (e) {
    logger.error('notifyHR error:', e.message);
  }
};

// ─── Check for 3 consecutive absences ────────────────────────────────────────
const checkConsecutiveAbsences = async (app, userId, userName) => {
  try {
    // Get last 3 working days attendance
    const { rows } = await query(
      `SELECT status, DATE(clock_in_time) as date
       FROM attendance_records
       WHERE user_id = $1
       ORDER BY clock_in_time DESC
       LIMIT 3`,
      [userId]
    );

    if (rows.length >= 3 && rows.every(r => r.status === 'ABSENT')) {
      await notifyHR(app, {
        type: 'ABSENCE_ALERT',
        category: 'ATTENDANCE',
        severity: 'HIGH',
        title: `⚠️ 3 Consecutive Absences — ${userName}`,
        message: `${userName} has been absent for 3 consecutive days. Immediate follow-up required.`,
        metadata: { userId, userName, dates: rows.map(r => r.date) },
        relatedUserId: userId
      });
    }
  } catch (e) {
    logger.error('checkConsecutiveAbsences error:', e.message);
  }
};

// ─── Notify HR of late check-in ──────────────────────────────────────────────
const notifyLateCheckIn = async (app, { userId, userName, checkInTime, minutesLate }) => {
  await notifyHR(app, {
    type: 'LATE_CHECKIN',
    category: 'ATTENDANCE',
    severity: 'LOW',
    title: `🕐 Late Check-In — ${userName}`,
    message: `${userName} checked in ${minutesLate} minutes late at ${new Date(checkInTime).toLocaleTimeString()}.`,
    metadata: { userId, userName, checkInTime, minutesLate },
    relatedUserId: userId
  });
};

// ─── Notify HR of absence ─────────────────────────────────────────────────────
const notifyAbsence = async (app, { userId, userName, date }) => {
  await notifyHR(app, {
    type: 'ABSENCE',
    category: 'ATTENDANCE',
    severity: 'MEDIUM',
    title: `❌ Absence — ${userName}`,
    message: `${userName} did not check in on ${date}. Marked as absent.`,
    metadata: { userId, userName, date },
    relatedUserId: userId
  });
};

// ─── Notify HR of new leave request ──────────────────────────────────────────
const notifyLeaveRequest = async (app, { userId, userName, leaveType, startDate, endDate, days }) => {
  await notifyHR(app, {
    type: 'LEAVE_REQUEST',
    category: 'LEAVE',
    severity: 'INFO',
    title: `📋 Leave Request — ${userName}`,
    message: `${userName} requested ${days} day(s) of ${leaveType.replace('_', ' ')} leave from ${startDate} to ${endDate}.`,
    metadata: { userId, userName, leaveType, startDate, endDate, days },
    relatedUserId: userId
  });
};

// ─── Notify HR of new employee pending approval ───────────────────────────────
const notifyNewEmployeePending = async (app, { userId, firstName, lastName, email }) => {
  await notifyHR(app, {
    type: 'NEW_EMPLOYEE_PENDING',
    category: 'EMPLOYEE',
    severity: 'MEDIUM',
    title: `👤 New Employee Registration — ${firstName} ${lastName}`,
    message: `${firstName} ${lastName} (${email}) has registered and is awaiting your approval.`,
    metadata: { userId, firstName, lastName, email },
    relatedUserId: userId
  });
};

// ─── Notify HR of device registration request ────────────────────────────────
const notifyDeviceRequest = async (app, { userId, userName, deviceName, platform }) => {
  await notifyHR(app, {
    type: 'DEVICE_REQUEST',
    category: 'DEVICE',
    severity: 'LOW',
    title: `📱 Device Registration — ${userName}`,
    message: `${userName} is requesting to register a new device: ${deviceName || 'Unknown'} (${platform || 'Unknown'}).`,
    metadata: { userId, userName, deviceName, platform },
    relatedUserId: userId
  });
};

module.exports = {
  notifyHR,
  checkConsecutiveAbsences,
  notifyLateCheckIn,
  notifyAbsence,
  notifyLeaveRequest,
  notifyNewEmployeePending,
  notifyDeviceRequest
};
