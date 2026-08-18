const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Request Tracking Middleware
 * - Injects unique X-Request-ID
 * - Tracks response time
 * - Correlates logs with request ID
 */
const requestTracker = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);

  const startTime = process.hrtime();

  // Log request start (debug level — Morgan handles info-level access logs in production)
  logger.debug(`Incoming Request: ${req.method} ${req.url}`, {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Track response
  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const timeInMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

    logger.debug(`Request Completed: ${req.method} ${req.url}`, {
      requestId,
      statusCode: res.statusCode,
      durationMs: timeInMs
    });
  });

  next();
};

module.exports = requestTracker;
