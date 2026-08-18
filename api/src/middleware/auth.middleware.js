const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[SECURITY] JWT_SECRET environment variable is not set.');
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '10m';

const validateTrackedSession = async (decoded, userId) => {
  if (!decoded.sessionId) {
    return true;
  }

  const { rows } = await query(
    `SELECT session_id
     FROM session_tracking
     WHERE session_id = $1
       AND user_id = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [decoded.sessionId, userId]
  );

  return rows.length > 0;
};

const generateToken = (user) => {
  if (user.token_version === undefined || user.token_version === null) {
    throw new Error(`[SECURITY] Cannot generate token: token_version missing for user ${user.id}`);
  }

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      version: user.token_version,
      sessionId: user.session_id || null
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { rows: blacklisted } = await query(
      'SELECT id FROM token_blacklist WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    if (blacklisted.length > 0) {
      return res.status(401).json({ success: false, error: 'Session revoked' });
    }

    const { rows: users } = await query(
      `SELECT id, email, role, status, token_version, first_name, last_name,
              profile_picture, department, position, employee_id
       FROM users
       WHERE id = $1`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const user = users[0];
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: `Account is ${String(user.status).toLowerCase()}`,
        code: 'ACCOUNT_NOT_ACTIVE'
      });
    }

    if (decoded.version === undefined || decoded.version === null) {
      return res.status(401).json({
        success: false,
        error: 'Session invalid: legacy token. Please log in again.',
        code: 'TOKEN_VERSION_MISSING'
      });
    }

    if (decoded.version !== user.token_version) {
      return res.status(401).json({
        success: false,
        error: 'Session expired (security event detected). Please log in again.',
        code: 'TOKEN_VERSION_MISMATCH'
      });
    }

    const trackedSessionIsValid = await validateTrackedSession(decoded, user.id);
    if (!trackedSessionIsValid) {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please log in again.',
        code: 'SESSION_EXPIRED'
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: `${user.first_name} ${user.last_name}`.trim(),
      firstName: user.first_name,
      lastName: user.last_name,
      department: user.department,
      position: user.position,
      employeeId: user.employee_id,
      tokenVersion: user.token_version,
      sessionId: decoded.sessionId || null
    };
    req.token = token;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid session signature' });
    }
    logger.error('Authentication Error:', error);
    return res.status(500).json({ success: false, error: 'Authentication processing error' });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
    next();
  };
};

const requirePermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (req.user.role === 'ADMIN') {
      return next();
    }

    try {
      const { rows } = await query(
        `SELECT p.id
         FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN roles r ON rp.role_id = r.id
         WHERE r.name = $1 AND p.name = $2`,
        [req.user.role, permission]
      );

      if (rows.length === 0) {
        return res.status(403).json({ success: false, error: 'Permission denied', code: 'PERMISSION_DENIED' });
      }
      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({ success: false, error: 'Authorization error' });
    }
  };
};

const resolveAccessTokenUser = async (token) => {
  const decoded = jwt.verify(token, JWT_SECRET);

  const { rows: blacklisted } = await query(
    'SELECT id FROM token_blacklist WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  if (blacklisted.length > 0) {
    const err = new Error('Session revoked');
    err.name = 'AuthError';
    err.code = 'SESSION_REVOKED';
    throw err;
  }

  const { rows: users } = await query(
    `SELECT id, email, role, status, token_version
     FROM users
     WHERE id = $1`,
    [decoded.userId]
  );

  if (users.length === 0) {
    const err = new Error('User not found');
    err.name = 'AuthError';
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const user = users[0];
  if (user.status !== 'ACTIVE') {
    const err = new Error(`Account is ${user.status}`);
    err.name = 'AuthError';
    err.code = 'ACCOUNT_NOT_ACTIVE';
    throw err;
  }

  if (decoded.version === undefined || decoded.version === null) {
    const err = new Error('Legacy token');
    err.name = 'AuthError';
    err.code = 'TOKEN_VERSION_MISSING';
    throw err;
  }

  if (decoded.version !== user.token_version) {
    const err = new Error('Token version mismatch');
    err.name = 'AuthError';
    err.code = 'TOKEN_VERSION_MISMATCH';
    throw err;
  }

  const trackedSessionIsValid = await validateTrackedSession(decoded, user.id);
  if (!trackedSessionIsValid) {
    const err = new Error('Session expired');
    err.name = 'AuthError';
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    sessionId: decoded.sessionId || null
  };
};

module.exports = {
  authenticate,
  authorize,
  requirePermission,
  generateToken,
  resolveAccessTokenUser,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
