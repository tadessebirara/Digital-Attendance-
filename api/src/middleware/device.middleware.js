const { query } = require('../config/database');
const logger = require('../utils/logger');
const CryptoUtils = require('../utils/crypto');
const crypto = require('crypto');

/**
 * Device validation middleware.
 *
 * Security model:
 *   1. Per-device HMAC key (from device_keys table) — compromise of one device
 *      key does not compromise any other device.
 *   2. device_version check — mirrors token_version on users. When a key is
 *      rotated or an admin revokes a device, device_version is incremented.
 *      The device must embed the current version in its signature payload.
 *      Any in-flight request carrying a stale version is rejected immediately,
 *      closing the race window that existed before this fix.
 *
 * Signature payload format (HMAC-SHA256):
 *   `${deviceId}:${userId}:${deviceVersion}`
 */
const validateDevice = async (req, res, next) => {
  try {
    const deviceId = req.headers['x-device-id'];
    const signature = req.headers['x-device-signature'];
    // Client must send the version it believes is current
    const clientVersion = req.headers['x-device-version'];
    const userId = req.user?.id;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Device ID required' });
    }

    if (req.user?.role === 'EMPLOYEE') {
      // Skip device signature check in development mode or for web clients
      // Flutter web cannot do native crypto signing
      const isDev = process.env.NODE_ENV !== 'production';
      const userAgent = req.headers['user-agent'] || '';
      const isWebClient = userAgent.includes('Mozilla') && !userAgent.includes('Dart');

      if (isDev || isWebClient) {
        req.deviceId = deviceId;
        return next();
      }

      if (!signature) {
        return res.status(403).json({
          success: false,
          error: 'Device signature required',
          code: 'MISSING_DEVICE_SIGNATURE',
        });
      }

      // ── 1. Fetch device record — includes current device_version ─────────────
      const { rows: deviceRows } = await query(
        `SELECT ud.status, ud.device_version, dk.device_key
         FROM user_devices ud
         LEFT JOIN device_keys dk
           ON dk.user_id = ud.user_id
          AND dk.device_id = ud.device_id
          AND dk.revoked_at IS NULL
         WHERE ud.user_id = $1 AND ud.device_id = $2`,
        [userId, deviceId]
      );

      if (deviceRows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Device not registered',
          code: 'DEVICE_NOT_REGISTERED',
        });
      }

      const { status, device_version: currentVersion, device_key: deviceKey } = deviceRows[0];

      // ── 2. Status gate ────────────────────────────────────────────────────────
      if (status !== 'APPROVED') {
        return res.status(403).json({
          success: false,
          error: `Device status: ${status}`,
          code: 'DEVICE_NOT_APPROVED',
        });
      }

      // ── 3. Key provisioned? ───────────────────────────────────────────────────
      if (!deviceKey) {
        return res.status(403).json({
          success: false,
          error: 'Device key not provisioned. Please re-register your device.',
          code: 'DEVICE_KEY_NOT_PROVISIONED',
        });
      }

      // ── 4. device_version check (closes the revocation race window) ───────────
      // The client embeds the version it was provisioned with in the request
      // header. If it doesn't match the DB value, the key has been rotated or
      // the device has been revoked since this request was signed.
      //
      // Backward compatibility — time-bound grace period:
      //   Set DEVICE_VERSION_GRACE_UNTIL to an ISO timestamp (e.g. "2025-08-01T00:00:00Z").
      //   Until that time, requests missing x-device-version are allowed through
      //   with a warning so old clients can update without being locked out.
      //   After that time, the header is required unconditionally.
      //   This prevents "temporary compatibility" from becoming a permanent
      //   attack surface — the grace window has a hard expiry baked into config.
      const graceUntilEnv = process.env.DEVICE_VERSION_GRACE_UNTIL;
      const graceActive = graceUntilEnv
        ? new Date() < new Date(graceUntilEnv)
        : false; // no grace by default — must be explicitly configured

      const parsedClientVersion = clientVersion !== undefined ? parseInt(clientVersion, 10) : null;

      if (parsedClientVersion === null) {
        if (graceActive) {
          // Grace path — old client within the allowed window
          logger.warn(
            `[Device] x-device-version missing for User ${userId}, Device ${deviceId} — ` +
            `allowing until grace period ends at ${graceUntilEnv}.`
          );
        } else {
          // Grace expired or never configured — hard reject
          return res.status(403).json({
            success: false,
            error: 'Device version header required. Please update your app.',
            code: 'DEVICE_VERSION_MISSING',
          });
        }
      } else if (parsedClientVersion !== currentVersion) {
        logger.warn(
          `[Security] Device version mismatch for User ${userId}, Device ${deviceId}: ` +
          `client=${parsedClientVersion}, db=${currentVersion}`
        );
        return res.status(403).json({
          success: false,
          error: 'Device credential outdated. Please re-provision your device key.',
          code: 'DEVICE_VERSION_MISMATCH',
        });
      }

      // ── 5. HMAC signature verification ───────────────────────────────────────
      // Payload includes device_version so a signature from before a rotation
      // is cryptographically invalid even if the version header were spoofed.
      // Grace path: if client didn't send a version, fall back to the old
      // payload format (deviceId:userId) so old clients still authenticate.
      const signaturePayload = parsedClientVersion !== null
        ? `${deviceId}:${userId}:${currentVersion}`
        : `${deviceId}:${userId}`;

      const expected = crypto
        .createHmac('sha256', deviceKey)
        .update(signaturePayload)
        .digest('hex');

      const expectedBuf = Buffer.from(expected, 'hex');
      let sigBuf;
      try {
        sigBuf = Buffer.from(signature, 'hex');
      } catch {
        return res.status(403).json({
          success: false,
          error: 'Device integrity check failed',
          code: 'INVALID_DEVICE_SIGNATURE',
        });
      }

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        logger.warn(`[Security] Invalid device signature for User ${userId}, Device ${deviceId}`);
        return res.status(403).json({
          success: false,
          error: 'Device integrity check failed',
          code: 'INVALID_DEVICE_SIGNATURE',
        });
      }
    }

    req.deviceId = deviceId;
    next();
  } catch (error) {
    logger.error('Device validation error:', error);
    return res.status(500).json({ success: false, error: 'Device validation failed' });
  }
};

const requireDeviceForEmployee = (req, res, next) => {
  if (req.user?.role === 'EMPLOYEE') {
    return validateDevice(req, res, next);
  }
  next();
};

module.exports = { validateDevice, requireDeviceForEmployee };
