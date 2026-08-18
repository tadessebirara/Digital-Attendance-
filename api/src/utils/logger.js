const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

/**
 * Enterprise Production Logger
 * - Structured JSON for ELK/Datadog/CloudWatch
 * - Sensitive field masking
 * - Request correlation
 */

// Fields to mask in logs
const SENSITIVE_FIELDS = ['password', 'token', 'refreshToken', 'currentPassword', 'newPassword', 'otpCode', 'qrData'];

const maskSensitiveData = winston.format((info) => {
  const mask = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const newObj = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key in newObj) {
      if (SENSITIVE_FIELDS.includes(key)) {
        newObj[key] = '********';
      } else if (typeof newObj[key] === 'object') {
        newObj[key] = mask(newObj[key]);
      }
    }
    return newObj;
  };
  
  if (info.metadata) info.metadata = mask(info.metadata);
  if (info.body) info.body = mask(info.body);
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    maskSensitiveData(),
    winston.format.json()
  ),
  defaultMeta: { service: 'attendance-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    })
  ]
});

// Production transport for cloud logging
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}

module.exports = logger;
