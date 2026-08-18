const { query } = require('../config/database');
const logger = require('../utils/logger');

// ─── Log a login attempt ──────────────────────────────────────────────────────
const logLoginAttempt = async ({ userId, email, ip, deviceId, userAgent, status, reason }) => {
  try {
    await query(
      `INSERT INTO login_attempts (user_id, email, ip_address, device_id, user_agent, status, failure_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId || null, email, ip, deviceId || null, userAgent, status, reason || null]
    );
  } catch (e) {
    logger.error('logLoginAttempt error:', e.message);
  }
};

// ─── Create a security alert (stored + real-time push to admin) ───────────────
const createSecurityAlert = async (app, {
  userId, alertType, severity = 'MEDIUM', title, message, metadata = {}, ip, deviceId
}) => {
  try {
    const { rows } = await query(
      `INSERT INTO security_alerts (user_id, alert_type, severity, title, message, metadata, ip_address, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [userId || null, alertType, severity, title, message, JSON.stringify(metadata), ip || null, deviceId || null]
    );

    const alertId = rows[0].id;

    // Bulk INSERT notification for all ADMIN users — single query instead of N+1
    await query(
      `INSERT INTO notifications (user_id, title, message, type, category, severity, metadata)
       SELECT id, $1, $2, 'SECURITY_ALERT', 'SECURITY', $3, $4
       FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`,
      [title, message, severity, JSON.stringify({ alertId, alertType, ...metadata })]
    );

    // Real-time push to admin room via Socket.IO
    if (app) {
      const io = app.get('io');
      if (io) {
        io.to('admin_room').emit('security_alert', {
          id: alertId,
          alertType,
          severity,
          title,
          message,
          metadata,
          ip,
          deviceId,
          userId,
          createdAt: new Date().toISOString()
        });
      }
    }

    return alertId;
  } catch (e) {
    logger.error('createSecurityAlert error:', e.message);
    return null;
  }
};

// ─── Check if account should be locked (soft or hard) ────────────────────────
// NOTE: Never called for ADMIN users (guarded in auth.controller.js).
//       This function only handles non-admin accounts.
const checkLockThreshold = async (userId, email, ip, app, req) => {
  try {
    // Count failures in last 10 minutes for this user
    const { rows: recentFails } = await query(
      `SELECT COUNT(*) FROM login_attempts
       WHERE (user_id = $1 OR email = $2)
         AND status = 'FAILED'
         AND created_at > NOW() - INTERVAL '10 minutes'`,
      [userId || 0, email]
    );
    const failCount = parseInt(recentFails[0].count);

    // Safety guard: never lock an ADMIN even if called accidentally
    if (userId) {
      const { rows: userRows } = await query('SELECT role FROM users WHERE id=$1', [userId]);
      if (userRows.length > 0 && userRows[0].role === 'ADMIN') return failCount;
    }

    // Soft lock: 3 failures in 10 min → lock 15 min
    if (failCount >= 3 && failCount < 5) {
      if (userId) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await query(
          'UPDATE users SET account_locked_until=$1 WHERE id=$2',
          [lockUntil, userId]
        );
      }
      await createSecurityAlert(app, {
        userId, alertType: 'SOFT_LOCK', severity: 'MEDIUM',
        title: '⚠️ Account Soft Locked',
        message: `${failCount} failed login attempts for ${email} from IP ${ip}. Account locked for 15 minutes.`,
        metadata: { failCount, email, ip },
        ip
      });
    }

    // Hard lock: 5+ failures → lock + revoke all sessions + alert
    if (failCount >= 5) {
      if (userId) {
        const lockUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await query(
          'UPDATE users SET account_locked_until=$1, failed_login_attempts=$2 WHERE id=$3',
          [lockUntil, failCount, userId]
        );
        // Revoke all refresh tokens
        await query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
        // Clear sessions
        await query('DELETE FROM session_tracking WHERE user_id=$1', [userId]);
      }
      await createSecurityAlert(app, {
        userId, alertType: 'HARD_LOCK', severity: 'CRITICAL',
        title: '🚨 Account Hard Locked — Possible Attack',
        message: `${failCount} failed login attempts for ${email} from IP ${ip}. All sessions revoked. Account locked 1 hour.`,
        metadata: { failCount, email, ip },
        ip
      });
    }

    return failCount;
  } catch (e) {
    logger.error('checkLockThreshold error:', e.message);
    return 0;
  }
};

// ─── Get security stats for dashboard ────────────────────────────────────────
const getSecurityStats = async () => {
  try {
    const [failedToday, lockedAccounts, unresolvedAlerts, tokenReuse] = await Promise.all([
      query(`SELECT COUNT(*) FROM login_attempts WHERE status='FAILED' AND created_at > NOW() - INTERVAL '24 hours'`),
      query(`SELECT COUNT(*) FROM users WHERE account_locked_until > NOW()`),
      query(`SELECT COUNT(*) FROM security_alerts WHERE is_resolved=FALSE`),
      query(`SELECT COUNT(*) FROM refresh_tokens WHERE reuse_detected=TRUE AND created_at > NOW() - INTERVAL '24 hours'`)
    ]);

    return {
      failedLoginsToday: parseInt(failedToday.rows[0].count),
      lockedAccounts: parseInt(lockedAccounts.rows[0].count),
      unresolvedAlerts: parseInt(unresolvedAlerts.rows[0].count),
      tokenReuseToday: parseInt(tokenReuse.rows[0].count)
    };
  } catch (e) {
    logger.error('getSecurityStats error:', e.message);
    return { failedLoginsToday: 0, lockedAccounts: 0, unresolvedAlerts: 0, tokenReuseToday: 0 };
  }
};

module.exports = { logLoginAttempt, createSecurityAlert, checkLockThreshold, getSecurityStats };
