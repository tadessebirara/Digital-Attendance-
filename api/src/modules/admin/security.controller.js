const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { getSecurityStats } = require('../../services/security.service');

// Get all security alerts
const getSecurityAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 50, severity, resolved, type } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = [];
    let params = [];
    let idx = 1;

    if (severity) { where.push(`sa.severity = $${idx++}`); params.push(severity); }
    if (resolved !== undefined) { where.push(`sa.is_resolved = $${idx++}`); params.push(resolved === 'true'); }
    if (type) { where.push(`sa.alert_type = $${idx++}`); params.push(type); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows: countRows } = await query(`SELECT COUNT(*) FROM security_alerts sa ${whereClause}`, params);
    const total = parseInt(countRows[0].count);

    const { rows: alerts } = await query(
      `SELECT sa.*, u.first_name, u.last_name, u.email as user_email
       FROM security_alerts sa
       LEFT JOIN users u ON sa.user_id = u.id
       ${whereClause}
       ORDER BY sa.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: alerts.map(a => ({
        id: a.id,
        alertType: a.alert_type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        metadata: a.metadata,
        ipAddress: a.ip_address,
        deviceId: a.device_id,
        isRead: a.is_read,
        isResolved: a.is_resolved,
        resolvedAt: a.resolved_at,
        createdAt: a.created_at,
        user: a.first_name ? {
          id: a.user_id,
          name: `${a.first_name} ${a.last_name}`,
          email: a.user_email
        } : null
      })),
      meta: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    logger.error('getSecurityAlerts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch security alerts' });
  }
};

// Mark alert as read
const markAlertRead = async (req, res) => {
  try {
    await query('UPDATE security_alerts SET is_read=TRUE WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to mark alert as read' });
  }
};

// Resolve alert
const resolveAlert = async (req, res) => {
  try {
    await query(
      'UPDATE security_alerts SET is_resolved=TRUE, resolved_by=$1, resolved_at=NOW() WHERE id=$2',
      [req.user.id, req.params.id]
    );
    res.json({ success: true, message: 'Alert resolved' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to resolve alert' });
  }
};

// Get login attempts (recent)
const getLoginAttempts = async (req, res) => {
  try {
    const { limit = 100, status, email, ip } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    if (status) { where.push(`la.status = $${idx++}`); params.push(status); }
    if (email) { where.push(`la.email ILIKE $${idx++}`); params.push(`%${email}%`); }
    if (ip) { where.push(`la.ip_address = $${idx++}`); params.push(ip); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT la.*, u.first_name, u.last_name
       FROM login_attempts la
       LEFT JOIN users u ON la.user_id = u.id
       ${whereClause}
       ORDER BY la.created_at DESC
       LIMIT $${idx++}`,
      [...params, parseInt(limit)]
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id,
        email: r.email,
        ipAddress: r.ip_address,
        deviceId: r.device_id,
        status: r.status,
        failureReason: r.failure_reason,
        createdAt: r.created_at,
        user: r.first_name ? { name: `${r.first_name} ${r.last_name}` } : null
      }))
    });
  } catch (error) {
    logger.error('getLoginAttempts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch login attempts' });
  }
};

// Get security dashboard stats
const getSecurityDashboard = async (req, res) => {
  try {
    const stats = await getSecurityStats();

    // Recent alerts (last 10)
    const { rows: recentAlerts } = await query(
      `SELECT id, alert_type, severity, title, message, ip_address, created_at
       FROM security_alerts ORDER BY created_at DESC LIMIT 10`
    );

    // Failed logins by hour (last 24h)
    const { rows: failsByHour } = await query(
      `SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as count
       FROM login_attempts
       WHERE status='FAILED' AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY hour ORDER BY hour`
    );

    // Top suspicious IPs
    const { rows: suspiciousIPs } = await query(
      `SELECT ip_address, COUNT(*) as attempts
       FROM login_attempts
       WHERE status='FAILED' AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY ip_address ORDER BY attempts DESC LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        stats,
        recentAlerts: recentAlerts.map(a => ({
          id: a.id, alertType: a.alert_type, severity: a.severity,
          title: a.title, message: a.message, ip: a.ip_address, createdAt: a.created_at
        })),
        failsByHour: failsByHour.map(r => ({ hour: r.hour, count: parseInt(r.count) })),
        suspiciousIPs: suspiciousIPs.map(r => ({ ip: r.ip_address, attempts: parseInt(r.attempts) }))
      }
    });
  } catch (error) {
    logger.error('getSecurityDashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch security dashboard' });
  }
};

module.exports = { getSecurityAlerts, markAlertRead, resolveAlert, getLoginAttempts, getSecurityDashboard };
