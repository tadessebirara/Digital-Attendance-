const { query, transaction } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');
const CryptoUtils = require('../../utils/crypto');
const crypto = require('crypto');

const buildLegacyDeviceHash = (deviceId) =>
  crypto.createHash('sha256').update(deviceId).digest('hex');

// FIX 1: Provision a per-device HMAC signing key.
// The key is derived from the master DEVICE_SECRET (server-side only).
// It is returned once to the authenticated device and stored in the
// platform keystore (iOS Keychain / Android Keystore).
const provisionDeviceKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId required' });
    }

    // Verify the device is approved for this user
    const { rows: devices } = await query(
      `SELECT id, status FROM user_devices WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );

    if (devices.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not registered' });
    }
    if (devices[0].status !== 'APPROVED') {
      return res.status(403).json({ success: false, error: `Device is ${devices[0].status}` });
    }

    // Generate per-device key (derived from master secret — never the master itself)
    const deviceKey = CryptoUtils.generateDeviceKey(deviceId, userId);

    // Upsert into device_keys table
    await query(
      `INSERT INTO device_keys (user_id, device_id, device_key, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET device_key = $3, created_at = NOW(), revoked_at = NULL`,
      [userId, deviceId, deviceKey]
    );

    await auditLog(userId, 'DEVICE_KEY_PROVISIONED', 'device_keys', userId, { deviceId }, req);

    const { rows: dvRows } = await query(
      `SELECT device_version FROM user_devices WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );

    res.json({
      success: true,
      message: 'Device key provisioned. Store securely in platform keystore.',
      data: {
        deviceKey,
        deviceVersion: dvRows[0]?.device_version ?? 0
      }
    });
  } catch (error) {
    logger.error('Provision device key error:', error);
    res.status(500).json({ success: false, error: 'Failed to provision device key' });
  }
};

// FIX 1 (device lifecycle): Rotate the per-device key.
// Called periodically (e.g. every 30 days) or after a security event.
// The old key is immediately invalidated — the device must use the new key.
// device_version is incremented atomically so any in-flight request signed
// with the old key fails the version check in device.middleware.js.
const rotateDeviceKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId required' });
    }

    const { rows: existing } = await query(
      `SELECT id FROM device_keys WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [userId, deviceId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'No active device key found. Provision first.' });
    }

    // Derive a new key — include a rotation counter to ensure uniqueness
    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM device_keys WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );
    const rotationCount = parseInt(countRows[0].count);
    const crypto = require('crypto');
    const newDeviceKey = crypto
      .createHmac('sha256', process.env.DEVICE_SECRET)
      .update(`DEVICE_KEY:${deviceId}:${userId}:rotation:${rotationCount}`)
      .digest('hex');

    let newVersion;
    await transaction(async (client) => {
      // Revoke old key
      await client.query(
        `UPDATE device_keys SET revoked_at = NOW() WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
        [userId, deviceId]
      );
      // Insert new key
      await client.query(
        `INSERT INTO device_keys (user_id, device_id, device_key, created_at) VALUES ($1, $2, $3, NOW())`,
        [userId, deviceId, newDeviceKey]
      );
      // Increment device_version — closes the race window for in-flight requests
      const { rows: versionRows } = await client.query(
        `UPDATE user_devices
         SET device_version = device_version + 1
         WHERE user_id = $1 AND device_id = $2
         RETURNING device_version`,
        [userId, deviceId]
      );
      newVersion = versionRows[0]?.device_version;
    });

    await auditLog(userId, 'DEVICE_KEY_ROTATED', 'device_keys', userId, { deviceId, rotationCount, newVersion }, req);

    res.json({
      success: true,
      message: 'Device key rotated. Update your stored key and version immediately.',
      data: { deviceKey: newDeviceKey, deviceVersion: newVersion }
    });
  } catch (error) {
    logger.error('Rotate device key error:', error);
    res.status(500).json({ success: false, error: 'Failed to rotate device key' });
  }
};

// FIX 1 (device lifecycle): Revoke a device key (Admin/HR action).
// Used when a device is lost, stolen, or an employee is terminated.
// device_version is incremented so any in-flight request with the old
// key fails the version check in device.middleware.js immediately.
const revokeDeviceKeyByAdmin = async (req, res) => {
  try {
    const { userId, deviceId } = req.body;

    if (!userId || !deviceId) {
      return res.status(400).json({ success: false, error: 'userId and deviceId required' });
    }

    await transaction(async (client) => {
      // Revoke the key
      await client.query(
        `UPDATE device_keys SET revoked_at = NOW() WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
        [userId, deviceId]
      );
      // Revoke the device itself and increment device_version atomically
      // The version bump closes the race window: any request already past
      // the DB query but not yet past the version check will be rejected.
      await client.query(
        `UPDATE user_devices
         SET status = 'REVOKED', device_version = device_version + 1
         WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId]
      );
      // Revoke all refresh tokens for this device
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
        [userId, deviceId]
      );
    });

    await auditLog(req.user.id, 'DEVICE_KEY_REVOKED_BY_ADMIN', 'device_keys', parseInt(userId), {
      targetUserId: userId, deviceId, revokedBy: req.user.email
    }, req);

    // Notify the user's socket session
    const io = req.app.get('io');
    io.to(`user_${userId}`).emit('device_revoked', { deviceId, reason: 'Revoked by administrator' });

    res.json({ success: true, message: 'Device key and access revoked' });
  } catch (error) {
    logger.error('Revoke device key error:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke device key' });
  }
};

// Get my devices
const getMyDevices = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows: devices } = await query(
      `SELECT id, device_id, device_name, device_model, platform, os_version,
              status, registered_at, approved_at, device_version
       FROM user_devices WHERE user_id = $1
       ORDER BY registered_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: devices.map(d => ({
        id: d.id,
        deviceId: d.device_id,
        deviceName: d.device_name,
        deviceModel: d.device_model,
        platform: d.platform,
        osVersion: d.os_version,
        status: d.status,
        deviceVersion: d.device_version,
        registeredAt: d.registered_at,
        approvedAt: d.approved_at
      }))
    });
  } catch (error) {
    logger.error('Get my devices error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch devices' });
  }
};

// Get all devices (Admin/HR)
const getAllDevices = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`d.status = $${paramIndex++}`);
      params.push(status);
    }
    if (userId) {
      whereConditions.push(`d.user_id = $${paramIndex++}`);
      params.push(parseInt(userId));
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM user_devices d ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].count);

    const { rows: devices } = await query(
      `SELECT d.*, u.first_name, u.last_name, u.email, u.employee_id
       FROM user_devices d
       JOIN users u ON d.user_id = u.id
       ${whereClause}
       ORDER BY d.registered_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: devices.map(d => ({
        id: d.id,
        userId: d.user_id,
        user: {
          id: d.user_id,
          firstName: d.first_name,
          lastName: d.last_name,
          fullName: `${d.first_name} ${d.last_name}`,
          email: d.email,
          employeeId: d.employee_id
        },
        deviceId: d.device_id,
        deviceName: d.device_name,
        deviceModel: d.device_model,
        platform: d.platform,
        osVersion: d.os_version,
        status: d.status,
        registeredAt: d.registered_at,
        approvedAt: d.approved_at
      })),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: offset + devices.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Get all devices error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch devices' });
  }
};

// Get pending device requests
const getPendingRequests = async (req, res) => {
  try {
    const { rows: requests } = await query(
      `SELECT dar.*, u.first_name, u.last_name, u.email, u.employee_id, u.department
       FROM device_approval_requests dar
       JOIN users u ON dar.user_id = u.id
       WHERE dar.status = 'PENDING'
       ORDER BY dar.requested_at DESC`
    );

    res.json({
      success: true,
      data: requests.map(r => ({
        id: r.id,
        userId: r.user_id,
        user: {
          id: r.user_id,
          firstName: r.first_name,
          lastName: r.last_name,
          fullName: `${r.first_name} ${r.last_name}`,
          email: r.email,
          employeeId: r.employee_id,
          department: r.department
        },
        deviceId: r.device_id,
        requestType: r.request_type,
        status: r.status,
        requestedAt: r.requested_at
      }))
    });
  } catch (error) {
    logger.error('Get pending requests error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending requests' });
  }
};

// Register new device
const registerDevice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId, deviceName, deviceModel, platform, osVersion } = req.body;

    // Check if device already exists
    const { rows: existing } = await query(
      'SELECT id, status FROM user_devices WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Device already registered',
        status: existing[0].status
      });
    }

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO user_devices (
           user_id, device_id, device_hash, device_name, device_model, device_os,
           platform, os_version, device_type, status, last_used, is_trusted
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', NOW(), FALSE)`,
        [
          userId,
          deviceId,
          buildLegacyDeviceHash(deviceId),
          deviceName || null,
          deviceModel || null,
          osVersion || null,
          platform || null,
          osVersion || null,
          platform || 'mobile'
        ]
      );

      await client.query(
        `INSERT INTO device_approval_requests (user_id, device_id, request_type, status, requested_at)
         VALUES ($1, $2, 'REGISTRATION', 'PENDING', NOW())`,
        [userId, deviceId]
      );
    });

    // Notify HR/Admin
    const io = req.app.get('io');
    io.to('hr_room').emit('device_registration_request', {
      userId,
      userName: req.user.fullName,
      deviceId,
      deviceName
    });

    res.status(201).json({
      success: true,
      message: 'Device registration request submitted. Awaiting approval.',
      status: 'PENDING'
    });
  } catch (error) {
    logger.error('Register device error:', error);
    res.status(500).json({ success: false, error: 'Failed to register device' });
  }
};

// Approve device
const approveDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const approverId = req.user.id;

    const { rows: devices } = await query(
      'SELECT * FROM user_devices WHERE id = $1',
      [id]
    );

    if (devices.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const device = devices[0];

    await transaction(async (client) => {
      await client.query(
        'UPDATE user_devices SET status = $1, approved_at = NOW(), approved_by = $2, is_trusted = TRUE, last_used = NOW() WHERE id = $3',
        ['APPROVED', approverId, id]
      );

      await client.query(
        `UPDATE device_approval_requests 
         SET status = $1, processed_at = NOW(), processed_by = $2 
         WHERE user_id = $3 AND device_id = $4 AND status = 'PENDING'`,
        ['APPROVED', approverId, device.user_id, device.device_id]
      );
    });

    await auditLog(approverId, 'DEVICE_APPROVED', 'user_devices', parseInt(id), {
      deviceId: device.device_id,
      userId: device.user_id
    }, req);

    // Notify user
    const io = req.app.get('io');
    io.to(`user_${device.user_id}`).emit('device_approved', {
      deviceId: device.device_id,
      approvedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Device approved successfully'
    });
  } catch (error) {
    logger.error('Approve device error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve device' });
  }
};

// Reject device
const rejectDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const approverId = req.user.id;

    const { rows: devices } = await query(
      'SELECT * FROM user_devices WHERE id = $1',
      [id]
    );

    if (devices.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const device = devices[0];

    await transaction(async (client) => {
      await client.query(
        'UPDATE user_devices SET status = $1 WHERE id = $2',
        ['REJECTED', id]
      );

      await client.query(
        `UPDATE device_approval_requests 
         SET status = $1, processed_at = NOW(), processed_by = $2, notes = $3
         WHERE user_id = $4 AND device_id = $5 AND status = 'PENDING'`,
        ['REJECTED', approverId, reason, device.user_id, device.device_id]
      );
    });

    await auditLog(approverId, 'DEVICE_REJECTED', 'user_devices', parseInt(id), {
      deviceId: device.device_id,
      userId: device.user_id,
      reason
    }, req);

    // Notify user
    const io = req.app.get('io');
    io.to(`user_${device.user_id}`).emit('device_rejected', {
      deviceId: device.device_id,
      reason
    });

    res.json({
      success: true,
      message: 'Device rejected'
    });
  } catch (error) {
    logger.error('Reject device error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject device' });
  }
};

// Revoke device
const revokeDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const approverId = req.user.id;

    const { rows: devices } = await query(
      'SELECT * FROM user_devices WHERE id = $1',
      [id]
    );

    if (devices.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    await query(
      'UPDATE user_devices SET status = $1 WHERE id = $2',
      ['REVOKED', id]
    );

    await auditLog(approverId, 'DEVICE_REVOKED', 'user_devices', parseInt(id), {
      deviceId: devices[0].device_id,
      userId: devices[0].user_id,
      reason
    }, req);

    // Notify user
    const io = req.app.get('io');
    io.to(`user_${devices[0].user_id}`).emit('device_revoked', {
      deviceId: devices[0].device_id,
      reason
    });

    res.json({
      success: true,
      message: 'Device access revoked'
    });
  } catch (error) {
    logger.error('Revoke device error:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke device' });
  }
};

// Delete device
const deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM user_devices WHERE id = $1', [id]);

    await auditLog(req.user.id, 'DEVICE_DELETED', 'user_devices', parseInt(id), {}, req);

    res.json({
      success: true,
      message: 'Device deleted'
    });
  } catch (error) {
    logger.error('Delete device error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete device' });
  }
};

// HR/Admin: force-reset an employee's primary device
// Used when phone is stolen/lost and employee can't self-serve (e.g. no email access).
// After this, the employee's next login on any device will be treated as first login.
const resetPrimaryDevice = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const { rows: users } = await query(
      'SELECT id, email, first_name, last_name, primary_device_id FROM users WHERE id = $1',
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = users[0];
    const oldDeviceId = user.primary_device_id;

    await transaction(async (client) => {
      // Clear primary device + reset first_login so next login auto-registers new device
      await client.query(
        `UPDATE users
         SET primary_device_id = NULL,
             first_login = TRUE,
             token_version = token_version + 1
         WHERE id = $1`,
        [userId]
      );

      // Mark all existing devices as REPLACED
      await client.query(
        `UPDATE user_devices SET status = 'REPLACED'
         WHERE user_id = $1 AND status IN ('APPROVED', 'PENDING')`,
        [userId]
      );

      // Revoke all device keys
      await client.query(
        `UPDATE device_keys SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );

      // Revoke all sessions — old phone is immediately locked out
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
      await client.query(
        `DELETE FROM session_tracking WHERE user_id = $1`,
        [userId]
      );
    });

    await auditLog(req.user.id, 'DEVICE_PRIMARY_RESET_BY_ADMIN', 'user_devices', parseInt(userId), {
      targetUser: `${user.first_name} ${user.last_name}`,
      targetEmail: user.email,
      oldDeviceId,
      reason: reason || 'Not specified',
      resetBy: req.user.email
    }, req);

    // Notify the user via socket if they're connected
    const io = req.app.get('io');
    io.to(`user_${userId}`).emit('device_reset', {
      message: 'Your device registration has been reset by HR. Please log in again on your new device.',
      reason: reason || null
    });

    logger.info(`[Device] Primary device reset for user ${userId} by admin ${req.user.id}. Old device: ${oldDeviceId}`);

    res.json({
      success: true,
      message: `Device registration reset for ${user.first_name} ${user.last_name}. They can now register a new device on next login.`,
      data: { userId: parseInt(userId), oldDeviceId, allSessionsRevoked: true }
    });
  } catch (error) {
    logger.error('Reset primary device error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset device' });
  }
};

module.exports = {
  getMyDevices,
  getAllDevices,
  getPendingRequests,
  provisionDeviceKey,
  rotateDeviceKey,
  revokeDeviceKeyByAdmin,
  resetPrimaryDevice,
  registerDevice,
  approveDevice,
  rejectDevice,
  revokeDevice,
  deleteDevice
};
