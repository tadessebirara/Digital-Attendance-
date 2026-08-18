const { resolveAccessTokenUser } = require('./auth.middleware');
const logger = require('../utils/logger');

/**
 * Socket.IO handshake auth — same JWT validity as HTTP (blacklist + token_version).
 */
const socketAuth = async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

  if (!token) {
    logger.error('Socket Auth Error: No token provided');
    return next(new Error('Authentication error: Token required'));
  }

  try {
    const user = await resolveAccessTokenUser(token);
    socket.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status
    };
    logger.info(`Socket Authenticated: User ${user.id} (${user.role}) connected`);
    next();
  } catch (error) {
    const msg = error.code === 'TOKEN_VERSION_MISMATCH'
      ? 'Authentication error: Session invalidated'
      : error.name === 'TokenExpiredError'
      ? 'Authentication error: Token expired'
      : 'Authentication error: Invalid session';
    logger.error(`Socket Auth Error: ${error.message || error} (code: ${error.code || error.name})`);
    next(new Error(msg));
  }
};

module.exports = socketAuth;
