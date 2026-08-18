const { query } = require('../config/database');
const logger = require('../utils/logger');

// Validate device for user
const validateDevice = async (userId, deviceId) => {
  try {
    const { rows: devices } = await query(
      'SELECT id, status, approved_at FROM user_devices WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId]
    );

    if (devices.length === 0) {
      return { valid: false, status: 'NOT_REGISTERED' };
    }

    const device = devices[0];

    if (device.status === 'REJECTED' || device.status === 'REVOKED') {
      return { valid: false, status: device.status };
    }

    if (device.status === 'PENDING') {
      return { valid: false, status: 'PENDING' };
    }

    return { 
      valid: true, 
      status: 'APPROVED',
      deviceId: device.id
    };
  } catch (error) {
    logger.error('Device validation error:', error);
    return { valid: false, status: 'ERROR' };
  }
};

// Register new device
const registerDevice = async (userId, deviceInfo) => {
  try {
    const { deviceId, deviceName, deviceModel, platform, osVersion } = deviceInfo;

    // Check if device already exists
    const { rows: existing } = await query(
      'SELECT id, status FROM user_devices WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId]
    );

    if (existing.length > 0) {
      return { 
        success: false, 
        message: 'Device already registered',
        status: existing[0].status
      };
    }

    // Insert device
    await query(
      `INSERT INTO user_devices (user_id, device_id, device_name, device_model, platform, os_version, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [userId, deviceId, deviceName, deviceModel, platform, osVersion]
    );

    // Create approval request
    await query(
      `INSERT INTO device_approval_requests (user_id, device_id, request_type, status, requested_at)
       VALUES ($1, $2, 'REGISTRATION', 'PENDING', NOW())`,
      [userId, deviceId]
    );

    return { success: true, message: 'Device registration request submitted' };
  } catch (error) {
    logger.error('Device registration error:', error);
    return { success: false, message: 'Device registration failed' };
  }
};

module.exports = {
  validateDevice,
  registerDevice
};
