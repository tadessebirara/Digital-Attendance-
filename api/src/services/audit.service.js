const { query } = require('../config/database');
const logger = require('../utils/logger');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const socketService = require('./socket.service');

// Create audit log
const auditLog = async (userId, action, entity, entityId, details, req) => {
  try {
    const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown';
    const userAgent = req?.headers?.['user-agent'];
    
    // Parse user agent
    const ua = userAgent ? UAParser(userAgent) : null;
    
    // Get geo info
    const geo = ipAddress && ipAddress !== 'unknown' ? geoip.lookup(ipAddress) : null;

    const metadata = {
      userAgent: ua ? {
        browser: `${ua.browser.name} ${ua.browser.version}`,
        os: `${ua.os.name} ${ua.os.version}`,
        device: ua.device.model || 'Unknown'
      } : null,
      location: geo ? {
        country: geo.country,
        city: geo.city,
        timezone: geo.timezone
      } : null,
      ...details
    };

    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip_address, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId, action, entity, entityId, JSON.stringify(details), ipAddress, metadata]
    );

    // Emit real-time audit event to admin/HR rooms
    socketService.emitAuditEvent({
      userId,
      action,
      entity,
      entityId,
      details,
      ipAddress,
      metadata,
      createdAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Audit log error:', error);
    // Don't throw - audit logging should not break the main flow
  }
};

module.exports = {
  auditLog
};
