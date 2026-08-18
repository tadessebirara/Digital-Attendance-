const logger = require('../utils/logger');

/**
 * Enterprise Error Handler
 * Standardizes all application errors and logs them for observability.
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Enhanced Logging
  logger.error({
    message: err.message,
    stack: !isProduction ? err.stack : undefined,
    path: req.path,
    method: req.method,
    user: req.user ? req.user.id : 'anonymous',
    ip: req.ip,
    body: req.method !== 'GET' ? { ...req.body, password: '***', currentPassword: '***', newPassword: '***' } : undefined
  });

  res.status(statusCode).json({
    success: false,
    message: isProduction && statusCode === 500 ? 'Internal Server Error' : err.message,
    // Never expose stack traces or internal error details in API responses — logged internally only
    code: err.code || 'INTERNAL_ERROR'
  });
};

module.exports = errorHandler;
