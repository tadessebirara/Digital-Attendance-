const { query } = require('../config/database');
const logger = require('../utils/logger');
const socketService = require('./socket.service');

/**
 * Structured attendance security / audit events (GPS, QR, device, sequence violations).
 */
async function logAttendanceSecurityEvent({
  userId = null,
  deviceId = null,
  eventType,
  severity = 'MEDIUM',
  reason,
  metadata = {},
  ip = null,
  latitude = null,
  longitude = null,
  officeId = null,
  app = null,
}) {
  try {
    const { rows } = await query(
      `INSERT INTO attendance_security_events
         (user_id, device_id, event_type, severity, reason, metadata, ip_address, latitude, longitude, office_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       RETURNING id, created_at`,
      [
        userId,
        deviceId,
        eventType,
        severity,
        reason,
        JSON.stringify(metadata),
        ip,
        latitude,
        longitude,
        officeId,
      ]
    );

    const event = rows[0];

    await query(
      `INSERT INTO suspicious_activities (user_id, activity_type, details, ip_address, severity)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        eventType,
        JSON.stringify({ reason, ...metadata }),
        ip,
        severity,
      ]
    );

    if (app) {
      const io = app.get('io');
      if (io) {
        const payload = {
          id: event.id,
          eventType,
          severity,
          reason,
          userId,
          createdAt: event.created_at,
        };
        io.to('hr_room').emit('security_alert', payload);
        if (userId) io.to(`user_${userId}`).emit('security_alert', payload);
      }
    }

    return event;
  } catch (err) {
    logger.error('[AttendanceSecurity] log failed:', err.message);
    return null;
  }
}

module.exports = { logAttendanceSecurityEvent };
