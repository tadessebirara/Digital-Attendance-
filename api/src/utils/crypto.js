const crypto = require('crypto');

// FIX 1: HMAC secret MUST be set via environment variable — no fallback allowed.
// Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
const DEVICE_SECRET = process.env.DEVICE_SECRET;
if (!DEVICE_SECRET) {
  throw new Error(
    '[SECURITY] DEVICE_SECRET environment variable is not set. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
  );
}

/**
 * Enterprise Device Cryptography
 * Signs deviceId:userId pairs with a server-side HMAC secret.
 * The secret is NEVER sent to clients — mobile derives signatures
 * using a per-device key provisioned at registration (see /devices/provision-key).
 */
class CryptoUtils {
  static signDeviceId(deviceId, userId) {
    return crypto
      .createHmac('sha256', DEVICE_SECRET)
      .update(`${deviceId}:${userId}`)
      .digest('hex');
  }

  static verifyDeviceSignature(deviceId, userId, signature) {
    const expected = this.signDeviceId(deviceId, userId);
    // Both buffers must be same length for timingSafeEqual
    const expectedBuf = Buffer.from(expected, 'hex');
    let sigBuf;
    try {
      sigBuf = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }

  /**
   * Generate a per-device signing key derived from the master DEVICE_SECRET.
   * This key is provisioned to the device at registration and stored in
   * iOS Keychain / Android Keystore — never hardcoded in the app binary.
   */
  static generateDeviceKey(deviceId, userId) {
    return crypto
      .createHmac('sha256', DEVICE_SECRET)
      .update(`DEVICE_KEY:${deviceId}:${userId}`)
      .digest('hex');
  }

  /**
   * Verify a signature produced with the per-device key (not the master secret).
   * Used when the mobile app signs requests with its provisioned key.
   */
  static verifyWithDeviceKey(deviceId, userId, signature, deviceKey) {
    const expected = crypto
      .createHmac('sha256', deviceKey)
      .update(`${deviceId}:${userId}`)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    let sigBuf;
    try {
      sigBuf = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }

  /**
   * Sign a QR payload with HMAC-SHA256.
   * payload must be a deterministic string (JSON.stringify with sorted keys).
   */
  static signQRPayload(payload) {
    return crypto
      .createHmac('sha256', DEVICE_SECRET)
      .update(payload)
      .digest('hex');
  }

  static verifyQRSignature(payload, signature) {
    const expected = this.signQRPayload(payload);
    const expectedBuf = Buffer.from(expected, 'hex');
    let sigBuf;
    try {
      sigBuf = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }
}

module.exports = CryptoUtils;
