const { query } = require('../config/database');
const { sendEmployeeActivationEmail } = require('./email.service');

const ACTIVATION_OTP_MINUTES = parseInt(process.env.ACTIVATION_OTP_MINUTES || '15', 10);

function activationDeviceId(userId) {
  return `acct_activation:${userId}`;
}

/**
 * Issue a fresh 6-digit OTP and send the employee activation email (deep link + code).
 * @param {{ id: number, email: string, first_name: string }} user
 */
async function issueEmployeeActivationOtp(user) {
  const userId = user.id;
  const deviceId = activationDeviceId(userId);
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + ACTIVATION_OTP_MINUTES * 60 * 1000);

  await query(
    `UPDATE device_otp SET verified_at = NOW() WHERE device_id = $1 AND verified_at IS NULL`,
    [deviceId]
  );
  await query(
    `INSERT INTO device_otp (user_id, device_id, otp_code, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, deviceId, otpCode, expiresAt]
  );

  const mobileVerifyBase = process.env.MOBILE_VERIFY_EMAIL_URL || 'alyah://verify-email';
  const deepLink = `${mobileVerifyBase}?email=${encodeURIComponent(user.email)}`;

  await sendEmployeeActivationEmail({
    to: user.email,
    firstName: user.first_name,
    otpCode,
    deepLink,
    expiresInMinutes: ACTIVATION_OTP_MINUTES,
  });

  return { expiresInMinutes: ACTIVATION_OTP_MINUTES };
}

module.exports = {
  activationDeviceId,
  issueEmployeeActivationOtp,
  ACTIVATION_OTP_MINUTES,
};
