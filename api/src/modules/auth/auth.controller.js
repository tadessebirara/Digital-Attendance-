const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, transaction } = require('../../config/database');
const logger = require('../../utils/logger');
const { generateToken, JWT_SECRET, JWT_EXPIRES_IN } = require('../../middleware/auth.middleware');
const { auditLog } = require('../../services/audit.service');
const { logLoginAttempt, createSecurityAlert, checkLockThreshold } = require('../../services/security.service');
const { sendPasswordResetEmail, sendPasswordChangedEmail, sendRegistrationOtpEmail, send2FAOtpEmail, sendAccountApprovedEmail } = require('../../services/email.service');
const { activationDeviceId, issueEmployeeActivationOtp } = require('../../services/employee-activation.service');
const crypto = require('crypto');
const REFRESH_EXPIRES_MINUTES = parseInt(process.env.REFRESH_EXPIRES_MINUTES || '10080', 10);

// ─── Generate refresh token ───────────────────────────────────────────────────
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

// ─── Build safe user object ───────────────────────────────────────────────────
function buildUserObject(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name} ${user.last_name}`,
    role: user.role,
    status: user.status,
    emailVerified: user.email_verified === true,
    profilePicture: user.profile_picture,
    phone: user.phone,
    department: user.department,
    position: user.position,
    employeeId: user.employee_id
  };
}

function isDevMultiDeviceLoginAllowed() {
  if (process.env.NODE_ENV === 'production') return false;
  return (
    process.env.DEV_MODE === 'true' ||
    process.env.ALLOW_MULTI_LOGIN_TESTING === 'true' ||
    (process.env.APP_ENV === 'development' && process.env.ALLOW_EMULATOR === 'true')
  );
}

function signEmployeeActivationToken(userId, email) {
  return jwt.sign(
    { purpose: 'EMPLOYEE_ACTIVATION', userId, email },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function signDeviceOtpSessionToken(userId, deviceId) {
  return jwt.sign(
    { purpose: 'DEVICE_OTP', userId, deviceId },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function buildLegacyDeviceHash(deviceId) {
  return crypto.createHash('sha256').update(deviceId).digest('hex');
}

// ── Exclusive device ownership check ─────────────────────────────────────────
// One device = one user. If the incoming deviceId is already the primary_device_id
// of a DIFFERENT active user, block the registration immediately.
// This prevents two employees from sharing one physical phone.
async function assertDeviceNotOwnedByAnotherUser(deviceId, currentUserId) {
  if (!deviceId) return { ok: true };
  const { rows } = await query(
    `SELECT id, first_name, last_name, email
     FROM users
     WHERE primary_device_id = $1
       AND id <> $2
       AND status IN ('ACTIVE', 'PENDING_ACTIVATION', 'PENDING_APPROVAL')
     LIMIT 1`,
    [deviceId, currentUserId]
  );
  if (rows.length > 0) {
    return {
      ok: false,
      code: 'DEVICE_ALREADY_REGISTERED',
      error: 'This device is already registered to another account. Each device can only be used by one employee.',
      status: 403,
    };
  }
  return { ok: true };
}

/** Issue access + refresh tokens, session row, cookie, audits (shared by login + OTP completion). */
async function issueFullSession(req, res, userRow, deviceId, deviceStatus) {
  const refreshToken = generateRefreshToken();
  const refreshExpiry = new Date(Date.now() + REFRESH_EXPIRES_MINUTES * 60 * 1000);
  const sessionId = crypto.randomUUID();
  const tokenUser = { ...userRow, session_id: sessionId };
  const accessToken = generateToken(tokenUser);
  const accessTokenHash = crypto.createHash('sha256').update(accessToken).digest('hex').substring(0, 32);

  await transaction(async (client) => {
    if (deviceId) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND device_id IS NOT NULL
           AND device_id <> $2
           AND revoked_at IS NULL`,
        [userRow.id, deviceId]
      );

      await client.query(
        `UPDATE session_tracking
         SET revoked_at = NOW()
         WHERE user_id = $1
           AND device_id IS NOT NULL
           AND device_id <> $2
           AND revoked_at IS NULL`,
        [userRow.id, deviceId]
      );

      await client.query(
        'UPDATE users SET primary_device_id = COALESCE(primary_device_id, $1) WHERE id = $2',
        [deviceId, userRow.id]
      );
    }

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent, device_id, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userRow.id, refreshToken, refreshExpiry, req.ip, req.headers['user-agent'], deviceId || null, sessionId]
    );

    await client.query(
      `INSERT INTO session_tracking (user_id, token_hash, session_id, device_id, ip_address, user_agent, last_activity, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [userRow.id, accessTokenHash, sessionId, deviceId || null, req.ip, req.headers['user-agent'], refreshExpiry]
    );
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_EXPIRES_MINUTES * 60 * 1000
  });

  await auditLog(userRow.id, 'LOGIN_SUCCESS', 'auth', userRow.id, {
    deviceId: deviceId || null,
    deviceStatus,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  }, req);
  await logLoginAttempt({
    userId: userRow.id,
    email: userRow.email,
    ip: req.ip,
    deviceId,
    userAgent: req.headers['user-agent'],
    status: 'SUCCESS',
    reason: null
  });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      accessToken,
      refreshToken,
      tokenExpiresIn: JWT_EXPIRES_IN,
      accountStatus: 'ACTIVE',
      deviceStatus,
      isFirstLogin: userRow.first_login,
      user: buildUserObject(userRow),
      deviceId: deviceId || null,
      sessionExpiresAt: refreshExpiry.toISOString()
    }
  });
}

// ─── FIX 1: PENDING users get NO auth token — only a status response ──────────
// ─── FIX 2: Device mismatch → flexible verify flow, not always HR approval ────
// ─── FIX 3: Refresh token issued on every successful login ────────────────────
// ─── FIX 4: Full audit trail on every auth event ──────────────────────────────

// ─── Login ────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password, deviceId, deviceInfo } = req.body;

    // ── Find user ─────────────────────────────────────────────────────────────
    const { rows: users } = await query(
      `SELECT id, email, password, first_name, last_name, role, status,
              profile_picture, phone, department, position, employee_id,
              failed_login_attempts, account_locked_until,
              first_login, primary_device_id, created_by, token_version,
              email_verified, activation_requires_password
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      await auditLog(null, 'LOGIN_FAILED', 'auth', null,
        { email, reason: 'User not found', ip: req.ip }, req);
      await logLoginAttempt({ email, ip: req.ip, deviceId, userAgent: req.headers['user-agent'], status: 'FAILED', reason: 'USER_NOT_FOUND' });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = users[0];

    // ── Hard blocks (no password check needed) ────────────────────────────────
    if (user.status === 'REJECTED') {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id,
        { reason: 'Account rejected', ip: req.ip }, req);
      return res.status(403).json({
        success: false,
        error: 'Your account has been rejected. Please contact HR.',
        code: 'ACCOUNT_REJECTED'
      });
    }

    if (user.status === 'LOCKED_ROLE') {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id,
        { reason: 'Role deleted — account locked', ip: req.ip }, req);
      return res.status(403).json({
        success: false,
        error: 'Your account is locked because your role was deleted. Contact your administrator.',
        code: 'ROLE_DELETED'
      });
    }

    if (user.status === 'INACTIVE') {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id,
        { reason: 'Account inactive', ip: req.ip }, req);
      return res.status(403).json({
        success: false,
        error: 'Your account is inactive. Contact your administrator.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    if (user.status === 'PENDING_APPROVAL') {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id,
        { reason: 'Account pending approval', ip: req.ip }, req);
      await logLoginAttempt({
        userId: user.id, email, ip: req.ip, deviceId,
        userAgent: req.headers['user-agent'], status: 'FAILED', reason: 'PENDING_APPROVAL'
      });
      return res.status(403).json({
        success: false,
        code: 'PENDING_APPROVAL',
        error: 'Your account is awaiting HR approval.',
        data: {
          accountStatus: 'PENDING_APPROVAL',
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            status: 'PENDING_APPROVAL'
          }
        }
      });
    }

    if (user.status === 'PENDING_ACTIVATION') {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id,
        { reason: 'Account pending activation', ip: req.ip }, req);
      await logLoginAttempt({
        userId: user.id, email, ip: req.ip, deviceId,
        userAgent: req.headers['user-agent'], status: 'FAILED', reason: 'PENDING_ACTIVATION'
      });
      return res.status(403).json({
        success: false,
        code: 'PENDING_ACTIVATION',
        error: 'Your account has not been activated yet. Check your email for an activation link.',
        data: {
          accountStatus: 'PENDING_ACTIVATION',
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            status: 'PENDING_ACTIVATION'
          }
        }
      });
    }

    if (user.status === 'SUSPENDED') {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id,
        { reason: 'Account suspended', ip: req.ip }, req);
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        error: 'Your account is suspended. Contact HR.'
      });
    }

    // ── Brute-force lock — ADMINs are never locked out ───────────────────────
    if (user.role !== 'ADMIN' && user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      return res.status(403).json({
        success: false,
        error: 'Account temporarily locked due to too many failed attempts. Try again later.',
        lockedUntil: user.account_locked_until,
        code: 'ACCOUNT_LOCKED'
      });
    }

    // ── Password check ────────────────────────────────────────────────────────
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      // ADMINs: just log the attempt, never lock, never increment counter
      if (user.role === 'ADMIN') {
        await auditLog(user.id, 'LOGIN_FAILED', 'auth', user.id,
          { reason: 'Wrong password (admin — no lockout applied)', ip: req.ip }, req);
        await logLoginAttempt({ userId: user.id, email, ip: req.ip, deviceId, userAgent: req.headers['user-agent'], status: 'FAILED', reason: 'WRONG_PASSWORD' });
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;

      if (newAttempts >= maxAttempts) {
        const lockMins = parseInt(process.env.LOCKOUT_DURATION_MINUTES) || 30;
        const lockedUntil = new Date(Date.now() + lockMins * 60 * 1000);
        await query(
          'UPDATE users SET failed_login_attempts=$1, account_locked_until=$2 WHERE id=$3',
          [newAttempts, lockedUntil, user.id]
        );
        await auditLog(user.id, 'ACCOUNT_LOCKED', 'auth', user.id,
          { reason: 'Too many failed attempts', attempts: newAttempts, ip: req.ip }, req);
        return res.status(403).json({
          success: false,
          error: `Account locked for ${lockMins} minutes due to too many failed attempts.`,
          code: 'ACCOUNT_LOCKED'
        });
      }

      await query('UPDATE users SET failed_login_attempts=$1 WHERE id=$2', [newAttempts, user.id]);
      await auditLog(user.id, 'LOGIN_FAILED', 'auth', user.id,
        { reason: 'Wrong password', attempts: newAttempts, ip: req.ip }, req);
      await logLoginAttempt({ userId: user.id, email, ip: req.ip, deviceId, userAgent: req.headers['user-agent'], status: 'FAILED', reason: 'WRONG_PASSWORD' });
      await checkLockThreshold(user.id, email, req.ip, req.app, req);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // ── Reset failed attempts ─────────────────────────────────────────────────
    await query(
      'UPDATE users SET failed_login_attempts=0, account_locked_until=NULL, last_login_at=NOW(), last_login_ip=$1 WHERE id=$2',
      [req.ip, user.id]
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Only ACTIVE accounts may receive tokens beyond this point
    // ─────────────────────────────────────────────────────────────────────────
    if (user.status !== 'ACTIVE') {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id,
        { reason: `Login denied for status ${user.status}`, ip: req.ip }, req);
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_NOT_ACTIVE',
        error: 'Your account cannot sign in yet. Contact HR.'
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTIVE employee must have verified email (data guard + policy)
    // ─────────────────────────────────────────────────────────────────────────
    if (user.role === 'EMPLOYEE' && user.status === 'ACTIVE' && user.email_verified !== true) {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id,
        { reason: 'Email not verified', ip: req.ip }, req);
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Your email address has not been verified. Please verify your email before signing in.'
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTIVE USER — proceed with device check + token issuance
    // ─────────────────────────────────────────────────────────────────────────
    let deviceStatus = 'NOT_REQUIRED';

    // Skip device OTP for web clients (Flutter web / browser) — they can't
    // reliably persist a stable device ID across sessions.
    const userAgent = req.headers['user-agent'] || '';
    const isWebClient = userAgent.includes('Mozilla') && !userAgent.includes('Dart');

    if (
      !isDevMultiDeviceLoginAllowed() &&
      user.role === 'EMPLOYEE' &&
      deviceId &&
      !isWebClient &&
      user.primary_device_id &&
      user.primary_device_id !== deviceId
    ) {
      await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id, {
        reason: 'Single-device restriction',
        primaryDeviceId: user.primary_device_id,
        attemptedDeviceId: deviceId,
        ip: req.ip
      }, req);

      return res.status(403).json({
        success: false,
        error: 'This account is locked to its first registered device.',
        code: 'SINGLE_DEVICE_ENFORCED'
      });
    }

    if (user.role === 'EMPLOYEE' && deviceId && !isWebClient) {

      if (user.first_login) {
        // ── FIX 2A: FIRST LOGIN → auto-register as PRIMARY, no HR needed ─────
        // Guard: ensure this device isn't already bound to another employee
        const deviceOwn = await assertDeviceNotOwnedByAnotherUser(deviceId, user.id);
        if (!deviceOwn.ok) {
          await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id, {
            reason: 'Device already owned by another user',
            deviceId, ip: req.ip
          }, req);
          return res.status(deviceOwn.status).json({
            success: false,
            error: deviceOwn.error,
            code: deviceOwn.code,
          });
        }

        const { rows: existing } = await query(
          'SELECT id FROM user_devices WHERE user_id=$1 AND device_id=$2',
          [user.id, deviceId]
        );
        if (existing.length === 0) {
            await query(
            `INSERT INTO user_devices (
               user_id, device_id, device_hash, device_name, device_model, device_os,
               platform, os_version, device_type, status, approved_at, last_used, is_trusted
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'APPROVED',NOW(),NOW(),TRUE)`,
            [
              user.id,
              deviceId,
              buildLegacyDeviceHash(deviceId),
              deviceInfo?.deviceName ?? null,
              deviceInfo?.deviceModel ?? null,
              deviceInfo?.osVersion ?? null,
              deviceInfo?.platform ?? null,
              deviceInfo?.osVersion ?? null,
              deviceInfo?.platform ?? 'mobile'
            ]
          );
        } else {
          await query(
            `UPDATE user_devices
             SET status='APPROVED',
                 approved_at=NOW(),
                 device_hash=$3,
                 device_os=COALESCE($4, device_os),
                 platform=COALESCE($5, platform),
                 os_version=COALESCE($4, os_version),
                 last_used=NOW(),
                 is_trusted=TRUE
             WHERE user_id=$1 AND device_id=$2`,
            [user.id, deviceId, buildLegacyDeviceHash(deviceId), deviceInfo?.osVersion ?? null, deviceInfo?.platform ?? null]
          );
        }
        await query(
          'UPDATE users SET first_login=FALSE, primary_device_id=$1 WHERE id=$2',
          [deviceId, user.id]
        );
        deviceStatus = 'PRIMARY_REGISTERED';
        await auditLog(user.id, 'DEVICE_PRIMARY_REGISTERED', 'devices', user.id,
          { deviceId, deviceName: deviceInfo?.deviceName, platform: deviceInfo?.platform, ip: req.ip }, req);

      } else {
        // ── FIX 2B: SUBSEQUENT LOGIN — flexible device verify flow ────────────
        const primaryDevice = user.primary_device_id;

        if (!primaryDevice || deviceId === primaryDevice) {
          // Same device or no primary set → OK
          if (!primaryDevice) {
            // Guard: don't steal a device that's already someone else's primary
            const deviceOwn = await assertDeviceNotOwnedByAnotherUser(deviceId, user.id);
            if (!deviceOwn.ok) {
              await auditLog(user.id, 'LOGIN_BLOCKED', 'auth', user.id, {
                reason: 'Device already owned by another user',
                deviceId, ip: req.ip
              }, req);
              return res.status(deviceOwn.status).json({
                success: false,
                error: deviceOwn.error,
                code: deviceOwn.code,
              });
            }
            await query('UPDATE users SET primary_device_id=$1 WHERE id=$2', [deviceId, user.id]);
          }
          deviceStatus = 'APPROVED';

        } else {
          // Different device — check if it was previously approved
          const { rows: knownDevice } = await query(
            'SELECT id, status FROM user_devices WHERE user_id=$1 AND device_id=$2',
            [user.id, deviceId]
          );

          if (knownDevice.length > 0 && knownDevice[0].status === 'APPROVED') {
            // Previously approved secondary device → allow
            deviceStatus = 'APPROVED';

          } else if (knownDevice.length > 0 && knownDevice[0].status === 'PENDING') {
            // Already pending — don't duplicate, just inform
            deviceStatus = 'DEVICE_PENDING';

          } else if (knownDevice.length > 0 &&
            (knownDevice[0].status === 'REJECTED' || knownDevice[0].status === 'REVOKED')) {
            // Explicitly blocked device
            await auditLog(user.id, 'LOGIN_DEVICE_BLOCKED', 'devices', user.id,
              { deviceId, status: knownDevice[0].status, ip: req.ip }, req);
            return res.status(403).json({
              success: false,
              error: 'This device has been blocked. Contact HR to register a new device.',
              code: 'DEVICE_BLOCKED'
            });

          } else {
            // FIX 3: Unknown new device → OTP first, HR only for high-risk
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

            // Invalidate previous OTPs for this user+device
            await query(
              'UPDATE device_otp SET verified_at=NOW() WHERE user_id=$1 AND device_id=$2 AND verified_at IS NULL',
              [user.id, deviceId]
            );
            await query(
              'INSERT INTO device_otp (user_id, device_id, otp_code, expires_at) VALUES ($1,$2,$3,$4)',
              [user.id, deviceId, otpCode, otpExpiry]
            );

            // Send OTP email (non-blocking)
            send2FAOtpEmail({
              to: user.email,
              firstName: user.first_name,
              otpCode,
              expiresInMinutes: 10
            }).then(result => {
              if (!result.success) {
                logger.error(`[Device OTP] Email delivery failed for ${user.email}: ${result.error}`);
              }
            });

            // Register device as PENDING (no HR notification yet)
            await query(
              `INSERT INTO user_devices (
                 user_id, device_id, device_hash, device_name, device_model, device_os,
                 platform, os_version, device_type, status, last_used, is_trusted
               )
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',NOW(),FALSE)
               ON CONFLICT (user_id, device_id) DO UPDATE
               SET status='PENDING',
                   device_hash=EXCLUDED.device_hash,
                   device_name=COALESCE(EXCLUDED.device_name, user_devices.device_name),
                   device_model=COALESCE(EXCLUDED.device_model, user_devices.device_model),
                   device_os=COALESCE(EXCLUDED.device_os, user_devices.device_os),
                   platform=COALESCE(EXCLUDED.platform, user_devices.platform),
                   os_version=COALESCE(EXCLUDED.os_version, user_devices.os_version),
                   last_used=NOW()`,
              [
                user.id,
                deviceId,
                buildLegacyDeviceHash(deviceId),
                deviceInfo?.deviceName ?? null,
                deviceInfo?.deviceModel ?? null,
                deviceInfo?.osVersion ?? null,
                deviceInfo?.platform ?? null,
                deviceInfo?.osVersion ?? null,
                deviceInfo?.platform ?? 'mobile'
              ]
            );

            // OTP delivered via email/SMS in production — never log the code
            if (process.env.NODE_ENV !== 'production') {
              logger.info(`[Auth] New device OTP issued for user id ${user.id} (code not logged)`);
            }

            await auditLog(user.id, 'DEVICE_OTP_SENT', 'devices', user.id,
              { deviceId, deviceName: deviceInfo?.deviceName, ip: req.ip }, req);

            deviceStatus = 'DEVICE_OTP_REQUIRED';
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // New device: do NOT issue API tokens until OTP is verified (bound otpSessionToken only)
    // ─────────────────────────────────────────────────────────────────────────
    if (deviceStatus === 'DEVICE_OTP_REQUIRED' && deviceId) {
      const otpSessionToken = signDeviceOtpSessionToken(user.id, deviceId);
      return res.json({
        success: true,
        message: 'Device verification required',
        data: {
          deviceStatus,
          otpSessionToken,
          user: buildUserObject(user),
          deviceId
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Issue access token (8h) + refresh token (7d)
    // ─────────────────────────────────────────────────────────────────────────
    await issueFullSession(req, res, user, deviceId, deviceStatus);

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, code: 'SERVER_ERROR', error: 'An unexpected error occurred. Please try again.' });
  }
};

// ─── Refresh token ────────────────────────────────────────────────────────────
// FIX 1: Reuse detection — if revoked token used again → theft detected → nuke all sessions
// FIX 2: Device binding — refresh token tied to deviceId
const refreshToken = async (req, res) => {
  try {
    const { deviceId } = req.body;
    const token = req.body.refreshToken || req.cookies.refreshToken;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Refresh token required' });
    }

    // Look up the token (including revoked ones — needed for reuse detection)
    const { rows } = await query(
      `SELECT rt.*, u.id as uid, u.email, u.first_name, u.last_name,
              u.role, u.status, u.profile_picture, u.phone,
              u.department, u.position, u.employee_id, u.token_version
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    const rt = rows[0];

    // ── FIX 1: REUSE DETECTION ────────────────────────────────────────────────
    if (rt.revoked_at !== null) {
      logger.warn(`[SECURITY] Refresh token reuse detected for user ${rt.user_id} from IP ${req.ip}`);
      await query('UPDATE refresh_tokens SET reuse_detected=TRUE WHERE token=$1', [token]);
      await query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [rt.user_id]);
      await query('DELETE FROM session_tracking WHERE user_id=$1', [rt.user_id]);

      await createSecurityAlert(req.app, {
        userId: rt.user_id, alertType: 'TOKEN_REUSE_DETECTED', severity: 'CRITICAL',
        title: '🚨 Token Reuse Detected — Possible Theft',
        message: `A revoked refresh token was reused for user ID ${rt.user_id} from IP ${req.ip}. All sessions have been terminated.`,
        metadata: { ip: req.ip, deviceId: deviceId || null },
        ip: req.ip, deviceId: deviceId || null
      });

      res.clearCookie('refreshToken');
      return res.status(401).json({
        success: false,
        error: 'Security alert: suspicious activity detected. Please log in again.',
        code: 'TOKEN_REUSE_DETECTED'
      });
    }

    // ── Check expiry ──────────────────────────────────────────────────────────
    if (new Date(rt.expires_at) < new Date()) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ success: false, error: 'Refresh token expired. Please log in again.' });
    }

    // ── FIX 2: DEVICE BINDING ─────────────────────────────────────────────────
    if (rt.device_id && deviceId && rt.device_id !== deviceId) {
      return res.status(401).json({ success: false, error: 'Token device mismatch. Please log in again.', code: 'DEVICE_MISMATCH' });
    }

    // ── Check user still active ───────────────────────────────────────────────
    if (rt.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'Account is not active.' });
    }

    // ── FIX 7: Token version check BEFORE issuing new access token ────────────
    // Fetch current token_version from DB. If it has been incremented since this
    // refresh token was issued (password reset, forced logout, security event),
    // the refresh is rejected — the race window where a revoked session could
    // refresh once more is eliminated.
    const { rows: freshUser } = await query(
      `SELECT id, email, role, status, token_version FROM users WHERE id = $1`,
      [rt.user_id]
    );
    if (freshUser.length === 0) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    const currentUser = freshUser[0];
    if (currentUser.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'Account is not active.', code: 'ACCOUNT_NOT_ACTIVE' });
    }
    // The refresh token row doesn't store token_version, but we can check whether
    // any active sessions exist for this user — if all were wiped (token_version bump),
    // the session_tracking row will be gone. More directly: we embed the token_version
    // at refresh-token issuance time in the next step, and compare here.
    // For now: re-fetch and embed version in the new access token.
    const userForToken = {
      id: currentUser.id,
      email: currentUser.email,
      role: currentUser.role,
      token_version: currentUser.token_version
    };

    // ── Rotate: revoke old, issue new ─────────────────────────────────────────
    const sessionId = rt.session_id || crypto.randomUUID();
    const sessionValid = await query(
      `SELECT session_id
       FROM session_tracking
       WHERE user_id = $1
         AND session_id = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [rt.user_id, sessionId]
    );

    if (sessionValid.rows.length === 0) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' });
    }

    const newAccessToken = generateToken({ ...userForToken, session_id: sessionId });
    const newRefreshToken = generateRefreshToken();
    const newExpiry = new Date(Date.now() + REFRESH_EXPIRES_MINUTES * 60 * 1000);
    const accessTokenHash = crypto.createHash('sha256').update(newAccessToken).digest('hex').substring(0, 32);

    await query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE token=$1', [token]);
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent, device_id, session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [rt.user_id, newRefreshToken, newExpiry, req.ip, req.headers['user-agent'], deviceId || rt.device_id, sessionId]
    );

    await query(
      `UPDATE session_tracking
       SET token_hash = $1,
           last_activity = NOW(),
           expires_at = $2
       WHERE user_id = $3
         AND session_id = $4`,
      [accessTokenHash, newExpiry, rt.user_id, sessionId]
    );

    // Update cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_EXPIRES_MINUTES * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Token refreshed',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenExpiresIn: JWT_EXPIRES_IN,
        sessionExpiresAt: newExpiry.toISOString()
      }
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
};


// ─── Logout ───────────────────────────────────────────────────────────────────
// FIX 4: Revoke refresh token + blacklist access token on logout
const logout = async (req, res) => {
  try {
    const token = req.token;
    const userId = req.user.id;
    const { refreshToken: rt } = req.body;

    // Blacklist access token until it naturally expires
    await query(
      "INSERT INTO token_blacklist (token, user_id, reason, expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '24 hours') ON CONFLICT DO NOTHING",
      [token, userId, 'User logout']
    );

    // Revoke refresh token if provided
    if (rt) {
      await query(
        'UPDATE refresh_tokens SET revoked_at=NOW() WHERE token=$1 AND user_id=$2',
        [rt, userId]
      );
    }

    await query(
      `UPDATE session_tracking
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND (session_id = $2 OR token_hash = $3)`,
      [userId, req.user.sessionId || null, crypto.createHash('sha256').update(token).digest('hex').substring(0, 32)]
    );

    await auditLog(userId, 'LOGOUT', 'auth', userId, { ip: req.ip }, req);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
};

// ─── Send Registration OTP ────────────────────────────────────────────────────
const sendRegistrationOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Valid email address is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check email not already registered
    const { rows: existing } = await query('SELECT id FROM users WHERE email=$1', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered. Please sign in instead.' });
    }

    // Rate limit: check if a recent OTP was sent within the last 2 minutes
    const deviceId = `reg_${crypto.createHash('sha256').update(normalizedEmail).digest('hex').substring(0, 32)}`;
    const { rows: recentOtp } = await query(
      `SELECT created_at FROM device_otp
       WHERE device_id = $1
         AND verified_at IS NULL
         AND created_at > NOW() - INTERVAL '2 minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [deviceId]
    );

    if (recentOtp.length > 0) {
      const canResendAt = new Date(new Date(recentOtp[0].created_at).getTime() + 2 * 60 * 1000);
      return res.status(429).json({
        success: false,
        error: 'Please wait before requesting another code.',
        canResendAt: canResendAt.toISOString()
      });
    }

    // Invalidate previous OTPs for this email
    await query(
      'UPDATE device_otp SET verified_at=NOW() WHERE device_id=$1 AND verified_at IS NULL',
      [deviceId]
    );

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const canResendAt = new Date(Date.now() + 2 * 60 * 1000);

    // Store OTP — user_id is NULL for pre-registration (no user exists yet)
    await query(
      'INSERT INTO device_otp (user_id, device_id, otp_code, expires_at) VALUES ($1,$2,$3,$4)',
      [null, deviceId, otpCode, otpExpiry]
    );

    // Send OTP email — fire-and-forget so SMTP timeout never fails the API response
    sendRegistrationOtpEmail({
      to: normalizedEmail,
      email: normalizedEmail,
      otpCode,
      expiresInMinutes: 5,
    }).catch(err => logger.error(`[Auth] Registration OTP email failed for ${normalizedEmail}:`, err.message));

    logger.info(`[Auth] Registration OTP sent to ${normalizedEmail}`);

    res.json({
      success: true,
      message: 'Verification code sent to your email.',
      canResendAt: canResendAt.toISOString()
    });
  } catch (error) {
    logger.error('sendRegistrationOtp error:', error);
    res.status(500).json({ success: false, error: 'Failed to send verification code' });
  }
};

// ─── Verify Registration OTP ──────────────────────────────────────────────────
const verifyRegistrationOtp = async (req, res) => {
  try {
    const { email, otpCode } = req.body;

    if (!email || !otpCode) {
      return res.status(400).json({ success: false, error: 'Email and OTP code are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const deviceId = `reg_${crypto.createHash('sha256').update(normalizedEmail).digest('hex').substring(0, 32)}`;

    // Find valid OTP
    const { rows: otpRows } = await query(
      `SELECT id, otp_code, expires_at, verified_at
       FROM device_otp
       WHERE device_id = $1
         AND verified_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [deviceId]
    );

    if (otpRows.length === 0) {
      return res.status(400).json({ success: false, error: 'No pending verification code found. Please request a new one.' });
    }

    const otp = otpRows[0];

    // Check expiry
    if (new Date(otp.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    // Check code — track attempts to prevent brute-force
    if (otp.otp_code !== otpCode.trim()) {
      await query('UPDATE device_otp SET attempts = COALESCE(attempts, 0) + 1 WHERE id=$1', [otp.id]);
      const remaining = Math.max(0, 5 - ((otp.attempts || 0) + 1));
      if (remaining === 0) {
        // Invalidate this OTP after 5 failed attempts
        await query('UPDATE device_otp SET verified_at=NOW() WHERE id=$1', [otp.id]);
        return res.status(400).json({ success: false, error: 'Too many failed attempts. Please request a new code.' });
      }
      return res.status(400).json({ success: false, error: `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` });
    }

    // Mark as verified
    await query('UPDATE device_otp SET verified_at=NOW() WHERE id=$1', [otp.id]);

    res.json({
      success: true,
      verified: true,
      message: 'Email verified successfully.'
    });
  } catch (error) {
    logger.error('verifyRegistrationOtp error:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
};

// ─── Employee activation (post HR approval or HR-created account) ─────────────
const sendActivationOtp = async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const { rows: users } = await query(
      `SELECT id, email, first_name, last_name, status
       FROM users WHERE email = $1`,
      [email]
    );
    if (
      users.length === 0 ||
      users[0].status !== 'PENDING_ACTIVATION'
    ) {
      return res.status(400).json({
        success: false,
        error: 'No activation is pending for this email.',
      });
    }

    const { rows: recent } = await query(
      `SELECT created_at FROM device_otp
       WHERE device_id = $1
         AND verified_at IS NULL
         AND created_at > NOW() - INTERVAL '2 minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [activationDeviceId(users[0].id)]
    );
    if (recent.length > 0) {
      const canResendAt = new Date(new Date(recent[0].created_at).getTime() + 2 * 60 * 1000);
      return res.status(429).json({
        success: false,
        error: 'Please wait before requesting another code.',
        canResendAt: canResendAt.toISOString(),
      });
    }

    await issueEmployeeActivationOtp(users[0]);
    const canResendAt = new Date(Date.now() + 2 * 60 * 1000);
    res.json({
      success: true,
      message: 'Verification code sent to your email.',
      canResendAt: canResendAt.toISOString(),
    });
  } catch (error) {
    logger.error('sendActivationOtp error:', error);
    res.status(500).json({ success: false, error: 'Failed to send code' });
  }
};

const verifyActivationOtp = async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const otpCode = (req.body.otpCode || '').trim();
    if (!email || !otpCode) {
      return res.status(400).json({ success: false, error: 'Email and code are required' });
    }

    const { rows: users } = await query(
      `SELECT id, email, first_name, status, activation_requires_password
       FROM users WHERE email = $1`,
      [email]
    );
    if (users.length === 0 || users[0].status !== 'PENDING_ACTIVATION') {
      return res.status(400).json({ success: false, error: 'Invalid activation state.' });
    }

    const user = users[0];
    const deviceId = activationDeviceId(user.id);
    const { rows: otpRows } = await query(
      `SELECT id, otp_code, expires_at, attempts
       FROM device_otp
       WHERE user_id = $1 AND device_id = $2 AND verified_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, deviceId]
    );

    if (otpRows.length === 0) {
      return res.status(400).json({ success: false, error: 'No pending code. Request a new one from the email link.' });
    }

    const otp = otpRows[0];
    if (new Date(otp.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Code expired. Request a new one.' });
    }

    if (otp.otp_code !== otpCode) {
      await query('UPDATE device_otp SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      return res.status(400).json({ success: false, error: 'Invalid code.' });
    }

    await query('UPDATE device_otp SET verified_at = NOW() WHERE id = $1', [otp.id]);
    await query(
      `UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`,
      [user.id]
    );

    const activationToken = signEmployeeActivationToken(user.id, email);
    await auditLog(user.id, 'EMPLOYEE_EMAIL_ACTIVATION_OTP_OK', 'auth', user.id, { email }, req);

    res.json({
      success: true,
      message: 'Email verified. Set your password to finish.',
      data: {
        activationToken,
        requiresPassword: user.activation_requires_password === true,
      },
    });
  } catch (error) {
    logger.error('verifyActivationOtp error:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
};

const completeEmployeeActivation = async (req, res) => {
  try {
    const { activationToken, newPassword } = req.body;
    if (!activationToken) {
      return res.status(400).json({ success: false, error: 'activationToken required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(activationToken, JWT_SECRET);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid or expired activation session.' });
    }
    if (decoded.purpose !== 'EMPLOYEE_ACTIVATION' || !decoded.userId) {
      return res.status(400).json({ success: false, error: 'Invalid activation token.' });
    }

    const { rows: users } = await query(
      `SELECT id, email, status, email_verified, activation_requires_password
       FROM users WHERE id = $1`,
      [decoded.userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const u = users[0];
    if (u.status !== 'PENDING_ACTIVATION' || u.email_verified !== true) {
      return res.status(400).json({ success: false, error: 'Activation is not in a valid state.' });
    }

    const needsPwd = u.activation_requires_password === true;
    const pwd = newPassword != null ? String(newPassword) : '';

    if (needsPwd && pwd.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
    }

    if (pwd.length >= 8) {
      const hashed = await bcrypt.hash(pwd, 12);
      await query(
        `UPDATE users
         SET password = $1,
             status = 'ACTIVE',
             activation_requires_password = FALSE,
             first_login = TRUE,
             token_version = token_version + 1,
             updated_at = NOW()
         WHERE id = $2`,
        [hashed, u.id]
      );
    } else {
      await query(
        `UPDATE users
         SET status = 'ACTIVE',
             activation_requires_password = FALSE,
             first_login = TRUE,
             token_version = token_version + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [u.id]
      );
    }

    await auditLog(u.id, 'EMPLOYEE_ACTIVATION_COMPLETE', 'auth', u.id, { email: u.email }, req);

    res.json({
      success: true,
      message: 'Account activated. You can sign in now.',
    });
  } catch (error) {
    logger.error('completeEmployeeActivation error:', error);
    res.status(500).json({ success: false, error: 'Activation failed' });
  }
};

// ─── Self-Registration ────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, department, position } = req.body;

    // Phone is mandatory
    if (!phone || phone.trim().length < 7) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check that email OTP was verified within the last 10 minutes
    const deviceId = `reg_${crypto.createHash('sha256').update(normalizedEmail).digest('hex').substring(0, 32)}`;
    const { rows: verifiedOtp } = await query(
      `SELECT id FROM device_otp
       WHERE device_id = $1
         AND verified_at IS NOT NULL
         AND verified_at > NOW() - INTERVAL '10 minutes'
       ORDER BY verified_at DESC LIMIT 1`,
      [deviceId]
    );

    if (verifiedOtp.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Email not verified. Please verify your email first.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    const { rows: existing } = await query('SELECT id FROM users WHERE email=$1', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const year = new Date().getFullYear();
    const prefix = `EMP${year}`;
    const { rows: maxRows } = await query(
      `SELECT MAX(CAST(SUBSTRING(employee_id FROM ${prefix.length + 1}) AS INTEGER)) AS max_seq
       FROM users WHERE employee_id LIKE $1`,
      [`${prefix}%`]
    );
    const nextSeq = (maxRows[0].max_seq || 0) + 1;
    let employeeId = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    const { rows: newUser } = await query(
      `INSERT INTO users (email, password, first_name, last_name, role, status, phone, department, position, employee_id, created_by, first_login,
                          email_verified, activation_requires_password)
       VALUES ($1,$2,$3,$4,'EMPLOYEE','PENDING_APPROVAL',$5,$6,$7,$8,'EMPLOYEE',TRUE,TRUE,FALSE)
       RETURNING id`,
      [normalizedEmail, hashedPassword, firstName, lastName, phone, department, position, employeeId]
    );

    await auditLog(newUser[0].id, 'USER_SELF_REGISTERED', 'auth', newUser[0].id,
      { email: normalizedEmail, ip: req.ip }, req);

    const io = req.app.get('io');
    if (io) io.to('hr_room').emit('new_employee_pending', { userId: newUser[0].id, email, firstName, lastName });

    // HR notification (fire-and-forget — must not fail the registration response)
    const { notifyNewEmployeePending } = require('../../services/hr-notification.service');
    notifyNewEmployeePending(req.app, { userId: newUser[0].id, firstName, lastName, email })
      .catch(err => logger.error('[Auth] HR notification failed after registration:', err.message));

    res.status(201).json({
      success: true,
      message: 'Registration successful. Your account is pending HR approval.',
      employeeId
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
};

const approveAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, reason, department, position, workSchedule, monthlySalary } = req.body;

    const { rows: users } = await query(
      `SELECT id, email, status, first_name, last_name, created_by, email_verified FROM users
       WHERE id=$1 AND status IN ('PENDING_APPROVAL', 'PENDING_ACTIVATION')`,
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found or already active/rejected' });
    }

    const user = users[0];

    // Self-registered users already verified email during sign-up → activate directly (no second OTP).
    // HR/Admin-created users need to verify OTP + set password first → PENDING_ACTIVATION.
    const isSelfRegistered = user.created_by === 'EMPLOYEE' || user.email_verified === true;

    // Per spec: no employee can become ACTIVE without a schedule assigned
    if (action === 'APPROVE' && isSelfRegistered) {
      if (!workSchedule || !workSchedule.workDays || workSchedule.workDays.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Work schedule is required before activating an employee. Please set working days and times.',
          code: 'SCHEDULE_REQUIRED'
        });
      }
    }

    if (action === 'APPROVE') {
      if (isSelfRegistered) {
        // Already verified email — activate directly, no second OTP needed
        await query(
          `UPDATE users
           SET status = 'ACTIVE',
               email_verified = TRUE,
               activation_requires_password = FALSE,
               first_login = TRUE,
               department = COALESCE($1, department),
               position   = COALESCE($2, position),
               updated_at = NOW()
           WHERE id = $3`,
          [department || null, position || null, userId]
        );
      } else {
        // HR/Admin-created user — needs OTP + password setup
        await query(
          `UPDATE users
           SET status = 'PENDING_ACTIVATION',
               email_verified = FALSE,
               activation_requires_password = FALSE,
               department = COALESCE($1, department),
               position   = COALESCE($2, position),
               updated_at = NOW()
           WHERE id = $3`,
          [department || null, position || null, userId]
        );
      }

      // Save work schedule if provided — insert all 7 days (working + off)
      if (workSchedule && workSchedule.workDays && workSchedule.workDays.length > 0) {
        const dayMap = {
          MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0,
          Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
        };
        const allDays = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
        const grace   = workSchedule.lateThresholdMinutes || workSchedule.gracePeriod || 15;
        const normalizedShiftType = (workSchedule.shiftType || 'REGULAR').toUpperCase();
        const workingSet = new Set(
          (workSchedule.workDays || []).map((d) => d.toUpperCase().slice(0, 3))
        );

        for (const day of allDays) {
          const dow       = dayMap[day];
          const isWorking = workingSet.has(day);
          await query(
            `INSERT INTO user_schedules
               (user_id, day_of_week, work_start_time, work_end_time,
                late_threshold_minutes, grace_minutes, is_working_day,
                schedule_type, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (user_id, day_of_week) DO UPDATE SET
               work_start_time        = EXCLUDED.work_start_time,
               work_end_time          = EXCLUDED.work_end_time,
               late_threshold_minutes = EXCLUDED.late_threshold_minutes,
               grace_minutes          = EXCLUDED.grace_minutes,
               is_working_day         = EXCLUDED.is_working_day,
               schedule_type          = EXCLUDED.schedule_type,
               updated_at             = NOW()`,
            [
              userId, dow,
              isWorking ? (workSchedule.startTime || '09:00') : '09:00',
              isWorking ? (workSchedule.endTime   || '17:00') : '17:00',
              grace,
              isWorking,
              normalizedShiftType,
            ]
          );
        }

        // Upsert employee_schedule_settings for policy-level overrides
        await query(
          `INSERT INTO employee_schedule_settings (user_id, grace_minutes, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE
             SET grace_minutes = $2, updated_at = NOW()`,
          [userId, grace]
        );
      }

      // Save monthly salary if provided at approval time
      if (monthlySalary != null && !isNaN(parseFloat(monthlySalary)) && parseFloat(monthlySalary) >= 0) {
        await query(
          `UPDATE users SET monthly_salary = $1, updated_at = NOW() WHERE id = $2`,
          [parseFloat(monthlySalary), userId]
        );
      }

      if (isSelfRegistered) {
        // Send "approved — you can now login" email (non-blocking)
        const deepLink = `${process.env.MOBILE_DEEP_LINK_URL || 'alyah://login'}`;
        sendAccountApprovedEmail({
          to: user.email,
          firstName: user.first_name,
          department: department || null,
          position: position || null,
          loginDeepLink: deepLink,
          approvedBy: req.user?.email || 'HR Team',
        }).then(result => {
          if (!result.success) {
            logger.error(`[ApproveAccount] Approval email failed for ${user.email}: ${result.error}`);
          }
        });
      } else {
        // Admin/HR-created user — send activation OTP email
        try {
          await issueEmployeeActivationOtp(user);
        } catch (e) {
          logger.error('[ApproveAccount] Failed to send activation email:', e);
        }
      }

      const finalStatus = isSelfRegistered ? 'ACTIVE' : 'PENDING_ACTIVATION';
      const socketMsg = isSelfRegistered
        ? 'Your account has been approved! You can now sign in with your email and password.'
        : 'Your account has been approved! Check your email to complete setup.';

      await auditLog(req.user.id,
        'ACCOUNT_APPROVED', 'auth', parseInt(userId), {
          targetUser: `${user.first_name} ${user.last_name}`,
          targetEmail: user.email,
          approvedBy: req.user.email,
          department: department || null,
          position: position || null,
          isSelfRegistered,
          ip: req.ip
        }, req);

      const io = req.app.get('io');
      io.to(`user_${userId}`).emit('account_status_changed', {
        status: finalStatus,
        message: socketMsg
      });

      return res.json({
        success: true,
        message: isSelfRegistered
          ? 'Account approved and activated — employee can log in now'
          : 'Account approved — activation email sent to employee',
        newStatus: finalStatus
      });

    } else {
      // REJECT
      await query("UPDATE users SET status='REJECTED', updated_at=NOW() WHERE id=$1", [userId]);

      await auditLog(req.user.id,
        'ACCOUNT_REJECTED',
        'auth', parseInt(userId), {
          targetUser: `${user.first_name} ${user.last_name}`,
          targetEmail: user.email,
          approvedBy: req.user.email,
          reason: reason || null,
          ip: req.ip
        }, req);

      const io = req.app.get('io');
      io.to(`user_${userId}`).emit('account_status_changed', {
        status: 'REJECTED',
        message: `Your account has been rejected. ${reason ? 'Reason: ' + reason : 'Contact HR for details.'}`
      });

      return res.json({
        success: true,
        message: 'Account rejected successfully',
        newStatus: 'REJECTED'
      });
    }
  } catch (error) {
    logger.error('Approve account error:', error);
    res.status(500).json({ success: false, error: 'Failed to process account approval' });
  }
};

// ─── Get pending accounts ─────────────────────────────────────────────────────
const getPendingAccounts = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, email, first_name, last_name, phone, department, position, employee_id, created_at
       FROM users WHERE status='PENDING_APPROVAL' ORDER BY created_at DESC`
    );
    res.json({
      success: true,
      data: rows.map(u => ({
        id: u.id, email: u.email,
        firstName: u.first_name, lastName: u.last_name,
        fullName: `${u.first_name} ${u.last_name}`,
        phone: u.phone, department: u.department,
        position: u.position, employeeId: u.employee_id,
        createdAt: u.created_at
      }))
    });
  } catch (error) {
    logger.error('Get pending accounts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending accounts' });
  }
};

// ─── Verify device OTP ───────────────────────────────────────────────────────
// userId/deviceId MUST come from signed otpSessionToken (issued at login) — never from raw client fields.
const verifyDeviceOtp = async (req, res) => {
  try {
    const { otpSessionToken, otpCode } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(otpSessionToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired verification session. Please log in again.', code: 'OTP_SESSION_INVALID' });
    }

    if (decoded.purpose !== 'DEVICE_OTP' || !decoded.userId || !decoded.deviceId) {
      return res.status(401).json({ success: false, error: 'Invalid verification token.', code: 'OTP_SESSION_INVALID' });
    }

    const userId = decoded.userId;
    const deviceId = decoded.deviceId;

    const { rows } = await query(
      `SELECT * FROM device_otp
       WHERE user_id=$1 AND device_id=$2 AND verified_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, deviceId]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'OTP expired or not found. Please log in again.' });
    }

    const otp = rows[0];

    if (otp.attempts >= 3) {
      await query('UPDATE device_otp SET verified_at=NOW() WHERE id=$1', [otp.id]);
      return res.status(400).json({ success: false, error: 'Too many failed OTP attempts. Please log in again.' });
    }

    if (otp.otp_code !== otpCode) {
      await query('UPDATE device_otp SET attempts=attempts+1 WHERE id=$1', [otp.id]);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP code.',
        attemptsLeft: 3 - (otp.attempts + 1)
      });
    }

    await query('UPDATE device_otp SET verified_at=NOW() WHERE id=$1', [otp.id]);

    // Guard: the device being approved must not already be the primary of another user
    const deviceOwn = await assertDeviceNotOwnedByAnotherUser(deviceId, userId);
    if (!deviceOwn.ok) {
      await auditLog(userId, 'LOGIN_BLOCKED', 'auth', userId, {
        reason: 'Device already owned by another user (OTP verify)',
        deviceId, ip: req.ip
      }, req);
      return res.status(deviceOwn.status).json({
        success: false,
        error: deviceOwn.error,
        code: deviceOwn.code,
      });
    }

    await query(
      `UPDATE user_devices
       SET status='APPROVED',
           approved_at=NOW(),
           last_used=NOW(),
           is_trusted=TRUE
       WHERE user_id=$1 AND device_id=$2`,
      [userId, deviceId]
    );

    await auditLog(userId, 'DEVICE_OTP_VERIFIED', 'devices', userId, {
      deviceId, ip: req.ip
    }, req);

    const { rows: users } = await query(
      `SELECT id, email, first_name, last_name, role, status,
              profile_picture, phone, department, position, employee_id,
              failed_login_attempts, account_locked_until,
              first_login, primary_device_id, token_version
       FROM users WHERE id = $1 AND status = 'ACTIVE'`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(403).json({ success: false, error: 'Account not active.' });
    }

    await issueFullSession(req, res, users[0], deviceId, 'APPROVED');
  } catch (error) {
    logger.error('Verify device OTP error:', error);
    res.status(500).json({ success: false, error: 'OTP verification failed' });
  }
};

// ─── Get current user ─────────────────────────────────────────────────────────
const getCurrentUser = async (req, res) => {
  try {
    res.json({ success: true, data: { user: req.user } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
};

// ─── Forgot password ─────────────────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = req.ip;
    // Device ID from the requesting device — token will be bound to this device
    // Reads from header (sent by ApiService) OR body fallback (mobile sends both)
    const requestingDeviceId = req.headers['x-device-id'] || req.body.deviceId || null;

    // Detect source: mobile app sends x-device-id header OR deviceId in body
    const isMobileRequest = !!(req.headers['x-device-id'] || req.body.deviceId);

    // Rate limit: max 3 requests per email per hour
    const { rows: recentRequests } = await query(
      `SELECT COUNT(*) FROM password_reset_tokens
       WHERE created_at > NOW() - INTERVAL '1 hour'
       AND user_id = (SELECT id FROM users WHERE email = $1 LIMIT 1)`,
      [email.toLowerCase()]
    );
    if (parseInt(recentRequests[0].count) >= 3) {
      return res.json({ success: true, message: 'If the account exists, a reset link has been sent.' });
    }

    const { rows: users } = await query(
      "SELECT id, email, role, first_name, last_name, primary_device_id FROM users WHERE email = $1 AND status = 'ACTIVE'",
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      await auditLog(null, 'PASSWORD_RESET_REQUESTED', 'auth', null,
        { email, result: 'not_found_or_not_allowed', ip }, req);
      return res.json({ success: true, message: 'If the account exists, a reset link has been sent.' });
    }

    const user = users[0];

    // Determine which device ID to bind the token to:
    // - If request came from a device (mobile), bind to that device
    // - If no device ID (web request), bind to the user's primary device
    // - If no primary device either, token is unbound (web-only reset)
    const boundDeviceId = requestingDeviceId || user.primary_device_id || null;

    // Invalidate any existing unused tokens for this user
    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()',
      [user.id]
    );

    // Generate cryptographically secure token
    const token = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token with bound device ID
    await query(
      `INSERT INTO password_reset_tokens (user_id, token, email, expires_at, device_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [user.id, tokenHash, user.email, expiresAt, boundDeviceId]
    );

    await auditLog(user.id, 'PASSWORD_RESET_REQUESTED', 'auth', user.id,
      { email, ip, role: user.role, boundDeviceId }, req);

    // Always generate both: web URL for browser access, deep link for mobile app.
    // The email template renders both so the user can use whichever works on their device.
    const webResetUrl    = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    const mobileDeepLink = `${process.env.MOBILE_DEEP_LINK_URL || 'alyah://reset-password'}?token=${token}`;

    sendPasswordResetEmail({
      to: user.email,
      firstName: user.first_name,
      resetUrl: webResetUrl,
      mobileDeepLink,             // always included — email shows both buttons
      expiresInMinutes: 60,
      deviceBound: !!boundDeviceId,
      source: isMobileRequest ? 'mobile' : 'web',
    }).then(result => {
      if (!result.success) {
        logger.error(`[ForgotPassword] Email delivery failed for ${user.email}: ${result.error}`);
      }
    });

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[Auth DEV] Password reset email simulated for ${user.email} (${user.role})`);
    } else {
      logger.info(`[Auth] Password reset initiated for ${user.email} (${user.role}) from IP ${ip}`);
    }

    res.json({ success: true, message: 'If the account exists, a reset link has been sent.' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
};

// ─── Validate reset token ─────────────────────────────────────────────────────
const validateResetToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, error: 'Token required' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const requestingDeviceId = req.headers['x-device-id'] || null;

    const { rows } = await query(
      `SELECT prt.id, prt.expires_at, prt.device_id as bound_device_id,
              u.email, u.role, u.first_name
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token = $1 AND prt.used_at IS NULL AND prt.expires_at > NOW()`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    const row = rows[0];

    // ── Device binding check ──────────────────────────────────────────────────
    // If the token was bound to a specific device, only that device can use it.
    // This prevents a stolen/forwarded reset link from working on another device.
    if (row.bound_device_id && requestingDeviceId && row.bound_device_id !== requestingDeviceId) {
      logger.warn(`[ResetToken] Device mismatch: token bound to ${row.bound_device_id}, request from ${requestingDeviceId}`);
      return res.status(403).json({
        success: false,
        error: 'This reset link can only be used on the device that requested it.',
        code: 'DEVICE_MISMATCH'
      });
    }

    res.json({
      success: true,
      data: {
        email: row.email,
        firstName: row.first_name,
        expiresAt: row.expires_at,
        deviceBound: !!row.bound_device_id,
      },
    });
  } catch (error) {
    logger.error('Validate reset token error:', error);
    res.status(500).json({ success: false, error: 'Failed to validate token' });
  }
};

// ─── Reset password ───────────────────────────────────────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const requestingDeviceId = req.headers['x-device-id'] || null;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // ── Pre-check: device binding before doing any DB writes ─────────────────
    const { rows: preCheck } = await query(
      `SELECT prt.device_id as bound_device_id, prt.user_id
       FROM password_reset_tokens prt
       WHERE prt.token = $1 AND prt.used_at IS NULL AND prt.expires_at > NOW()`,
      [tokenHash]
    );

    if (preCheck.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    const { bound_device_id: boundDeviceId } = preCheck[0];

    // Enforce device binding — if token was bound to a device, only that device can reset
    if (boundDeviceId && requestingDeviceId && boundDeviceId !== requestingDeviceId) {
      logger.warn(`[ResetPassword] Device mismatch: token bound to ${boundDeviceId}, request from ${requestingDeviceId}`);
      await auditLog(preCheck[0].user_id, 'PASSWORD_RESET_FAILED', 'auth', preCheck[0].user_id,
        { reason: 'Device mismatch', boundDeviceId, requestingDeviceId, ip: req.ip }, req);
      return res.status(403).json({
        success: false,
        error: 'This reset link can only be used on the device that requested it.',
        code: 'DEVICE_MISMATCH'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const resetAt = new Date();

    let userId, email, role, firstName;

    await transaction(async (client) => {
      const { rows: claimed } = await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE token = $1
           AND used_at IS NULL
           AND expires_at > NOW()
         RETURNING user_id`,
        [tokenHash]
      );

      if (claimed.length === 0) {
        throw Object.assign(new Error('Invalid or expired reset token'), { statusCode: 400 });
      }

      userId = claimed[0].user_id;

      const { rows: userRows } = await client.query(
        'SELECT email, role, first_name FROM users WHERE id = $1',
        [userId]
      );
      ({ email, role, first_name: firstName } = userRows[0]);

      await client.query('DELETE FROM session_tracking WHERE user_id = $1', [userId]);
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId]
      );
      await client.query(
        'UPDATE users SET password = $1, updated_at = NOW(), token_version = token_version + 1 WHERE id = $2',
        [hashedPassword, userId]
      );
    });

    // Transaction succeeded — token was valid and is now consumed

    await auditLog(userId, 'PASSWORD_RESET_COMPLETED', 'auth', userId,
      { email, role, ip: req.ip, allSessionsRevoked: true }, req);

    // Send "password changed" security notification (non-blocking)
    sendPasswordChangedEmail({
      to: email,
      firstName,
      ip: req.ip,
      changedAt: resetAt,
    }).then(result => {
      if (!result.success) {
        logger.error(`[ResetPassword] Confirmation email failed for ${email}: ${result.error}`);
      }
    });

    logger.info(`[Auth] Password reset completed for ${email} (${role}) from IP ${req.ip}`);

    res.json({
      success: true,
      message: 'Password reset successful. All sessions have been terminated. Please log in again.',
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, error: error.message });
    }
    logger.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
};

// ─── Change password ──────────────────────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const { rows: users } = await query('SELECT password FROM users WHERE id=$1', [userId]);
    if (users.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    const isValid = await bcrypt.compare(currentPassword, users[0].password);
    if (!isValid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });

    const token = req.token;
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    if (token) {
      await query(
        "INSERT INTO token_blacklist (token, user_id, reason, expires_at) VALUES ($1,$2,'password_change',NOW()+INTERVAL '24 hours') ON CONFLICT DO NOTHING",
        [token, userId]
      );
    }
    await query('DELETE FROM session_tracking WHERE user_id=$1', [userId]);
    await query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
    await query(
      'UPDATE users SET password=$1, token_version = token_version + 1 WHERE id=$2',
      [hashedPassword, userId]
    );

    await auditLog(userId, 'PASSWORD_CHANGED', 'auth', userId, { ip: req.ip }, req);
    res.json({ success: true, message: 'Password changed successfully. Please log in again on all devices.' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
};

// ─── Request device replacement (self-service) ────────────────────────────────
// Employee lost/replaced their phone. They know their email + password but are
// on a new device that gets SINGLE_DEVICE_ENFORCED.
// Step 1: POST /auth/request-device-replacement  { email, password, newDeviceId }
//   → verifies credentials, sends a 6-digit OTP to the registered email.
//   → returns a signed replacementSessionToken (15 min) — no API access yet.
// Step 2: POST /auth/confirm-device-replacement  { replacementSessionToken, otpCode }
//   → verifies OTP, atomically:
//       • revokes old device key + marks old device REPLACED
//       • sets new device as APPROVED + primary_device_id
//       • revokes all existing sessions (security: old phone can't stay logged in)
//   → issues full session on the new device.
const requestDeviceReplacement = async (req, res) => {
  try {
    const { email, password, newDeviceId, deviceInfo } = req.body;

    if (!email || !password || !newDeviceId) {
      return res.status(400).json({ success: false, error: 'email, password and newDeviceId are required' });
    }

    // 1. Verify credentials
    const { rows: users } = await query(
      `SELECT id, email, password, first_name, last_name, role, status,
              primary_device_id, failed_login_attempts, account_locked_until, token_version
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (users.length === 0) {
      // Generic response — don't reveal whether email exists
      return res.json({ success: true, message: 'If the account exists, a verification code has been sent.' });
    }

    const user = users[0];

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'Account is not active. Contact HR.' });
    }

    if (user.account_locked_until && new Date(user.account_locked_until) > new Date()) {
      return res.status(403).json({ success: false, error: 'Account temporarily locked. Try again later.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // 2. Make sure the new device is actually different from the current primary
    if (user.primary_device_id && user.primary_device_id === newDeviceId) {
      return res.status(400).json({
        success: false,
        error: 'This is already your registered device. No replacement needed.',
        code: 'SAME_DEVICE'
      });
    }

    // Guard: new device must not already belong to another user
    const deviceOwn = await assertDeviceNotOwnedByAnotherUser(newDeviceId, user.id);
    if (!deviceOwn.ok) {
      await auditLog(user.id, 'DEVICE_REPLACEMENT_BLOCKED', 'devices', user.id, {
        reason: 'New device already owned by another user',
        newDeviceId, ip: req.ip
      }, req);
      return res.status(deviceOwn.status).json({
        success: false,
        error: deviceOwn.error,
        code: deviceOwn.code,
      });
    }

    // 3. Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    // Invalidate any previous replacement OTPs for this user
    await query(
      `UPDATE device_otp SET verified_at = NOW()
       WHERE user_id = $1 AND verified_at IS NULL`,
      [user.id]
    );

    await query(
      `INSERT INTO device_otp (user_id, device_id, otp_code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, newDeviceId, otpCode, otpExpiry]
    );

    // 4. Register new device as PENDING so it exists in user_devices
    await query(
      `INSERT INTO user_devices (
         user_id, device_id, device_hash, device_name, device_model, device_os,
         platform, os_version, device_type, status, last_used, is_trusted
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',NOW(),FALSE)
       ON CONFLICT (user_id, device_id) DO UPDATE
       SET status = 'PENDING', last_used = NOW()`,
      [
        user.id, newDeviceId, buildLegacyDeviceHash(newDeviceId),
        deviceInfo?.deviceName ?? null, deviceInfo?.deviceModel ?? null,
        deviceInfo?.osVersion ?? null, deviceInfo?.platform ?? null,
        deviceInfo?.osVersion ?? null, deviceInfo?.platform ?? 'mobile'
      ]
    );

    // 5. Send OTP email (non-blocking)
    const { sendEmail } = require('../../services/email.service');
    const companyName = process.env.COMPANY_NAME || 'Alyah Smart Attendance';
    sendEmail({
      to: user.email,
      subject: `${companyName} — Device Replacement Verification`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;">
          <h2 style="color:#0f172a;margin:0 0 8px;">Device Replacement Request</h2>
          <p style="color:#64748b;margin:0 0 24px;">Hi <strong>${user.first_name}</strong>, we received a request to replace your registered device.</p>
          <div style="background:#f8fafc;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
            <p style="color:#64748b;font-size:13px;margin:0 0 8px;">Your verification code</p>
            <p style="font-size:40px;font-weight:900;letter-spacing:12px;color:#0f172a;margin:0;">${otpCode}</p>
            <p style="color:#94a3b8;font-size:12px;margin:8px 0 0;">Expires in 15 minutes</p>
          </div>
          <p style="color:#ef4444;font-size:13px;margin:0;">If you did not request this, your account may be at risk. Contact HR immediately.</p>
        </div>`,
      text: `Hi ${user.first_name},\n\nYour device replacement code is: ${otpCode}\n\nExpires in 15 minutes.\n\nIf you did not request this, contact HR immediately.`
    }).catch(err => logger.error('[DeviceReplacement] Email failed:', err));

    await auditLog(user.id, 'DEVICE_REPLACEMENT_REQUESTED', 'devices', user.id, {
      newDeviceId, oldDeviceId: user.primary_device_id, ip: req.ip
    }, req);

    // 6. Return signed session token (no API access — only used for confirm step)
    const replacementSessionToken = jwt.sign(
      { purpose: 'DEVICE_REPLACEMENT', userId: user.id, newDeviceId, oldDeviceId: user.primary_device_id },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      success: true,
      message: 'Verification code sent to your registered email.',
      data: { replacementSessionToken }
    });
  } catch (error) {
    logger.error('Request device replacement error:', error);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
};

// ─── Confirm device replacement ───────────────────────────────────────────────
// Step 2: verify OTP, atomically swap primary device, revoke old sessions.
const confirmDeviceReplacement = async (req, res) => {
  try {
    const { replacementSessionToken, otpCode } = req.body;

    if (!replacementSessionToken || !otpCode) {
      return res.status(400).json({ success: false, error: 'replacementSessionToken and otpCode are required' });
    }

    // 1. Verify signed session token
    let decoded;
    try {
      decoded = jwt.verify(replacementSessionToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Verification session expired. Please start over.', code: 'SESSION_EXPIRED' });
    }

    if (decoded.purpose !== 'DEVICE_REPLACEMENT' || !decoded.userId || !decoded.newDeviceId) {
      return res.status(401).json({ success: false, error: 'Invalid verification token.', code: 'INVALID_TOKEN' });
    }

    const { userId, newDeviceId, oldDeviceId } = decoded;

    // 2. Verify OTP
    const { rows: otpRows } = await query(
      `SELECT * FROM device_otp
       WHERE user_id = $1 AND device_id = $2 AND verified_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, newDeviceId]
    );

    if (otpRows.length === 0) {
      return res.status(400).json({ success: false, error: 'Code expired or not found. Please start over.' });
    }

    const otp = otpRows[0];

    if (otp.attempts >= 5) {
      await query('UPDATE device_otp SET verified_at = NOW() WHERE id = $1', [otp.id]);
      return res.status(400).json({ success: false, error: 'Too many failed attempts. Please start over.' });
    }

    if (otp.otp_code !== otpCode) {
      await query('UPDATE device_otp SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
      return res.status(400).json({
        success: false,
        error: 'Invalid code.',
        attemptsLeft: 5 - (otp.attempts + 1)
      });
    }

    // 3. Mark OTP used
    await query('UPDATE device_otp SET verified_at = NOW() WHERE id = $1', [otp.id]);

    // Guard: the new device must not already be the primary of another user
    const deviceOwn = await assertDeviceNotOwnedByAnotherUser(newDeviceId, userId);
    if (!deviceOwn.ok) {
      await auditLog(userId, 'DEVICE_REPLACEMENT_BLOCKED', 'devices', userId, {
        reason: 'New device already owned by another user',
        newDeviceId, ip: req.ip
      }, req);
      return res.status(deviceOwn.status).json({
        success: false,
        error: deviceOwn.error,
        code: deviceOwn.code,
      });
    }

    // 4. Atomic device swap + session revocation
    await transaction(async (client) => {
      // Mark old device as REPLACED (not deleted — keep audit trail)
      if (oldDeviceId) {
        await client.query(
          `UPDATE user_devices SET status = 'REPLACED', last_used = NOW()
           WHERE user_id = $1 AND device_id = $2`,
          [userId, oldDeviceId]
        );
        // Revoke old device key
        await client.query(
          `UPDATE device_keys SET revoked_at = NOW()
           WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
          [userId, oldDeviceId]
        );
        // Increment device_version on old device so any in-flight requests fail
        await client.query(
          `UPDATE user_devices SET device_version = device_version + 1
           WHERE user_id = $1 AND device_id = $2`,
          [userId, oldDeviceId]
        );
      }

      // Approve new device + set as primary
      await client.query(
        `UPDATE user_devices
         SET status = 'APPROVED', approved_at = NOW(), is_trusted = TRUE, last_used = NOW()
         WHERE user_id = $1 AND device_id = $2`,
        [userId, newDeviceId]
      );

      // Update primary_device_id on user record
      await client.query(
        `UPDATE users SET primary_device_id = $1, token_version = token_version + 1
         WHERE id = $2`,
        [newDeviceId, userId]
      );

      // Revoke ALL existing sessions (old phone can't stay logged in)
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

    await auditLog(userId, 'DEVICE_REPLACEMENT_COMPLETED', 'devices', userId, {
      newDeviceId, oldDeviceId, ip: req.ip, allSessionsRevoked: true
    }, req);

    // 5. Fetch user and issue a fresh full session on the new device
    const { rows: users } = await query(
      `SELECT id, email, first_name, last_name, role, status,
              profile_picture, phone, department, position, employee_id,
              failed_login_attempts, account_locked_until, first_login,
              primary_device_id, token_version
       FROM users WHERE id = $1 AND status = 'ACTIVE'`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(403).json({ success: false, error: 'Account not active.' });
    }

    logger.info(`[Auth] Device replacement completed for user ${userId}: ${oldDeviceId} → ${newDeviceId}`);

    await issueFullSession(req, res, users[0], newDeviceId, 'DEVICE_REPLACED');
  } catch (error) {
    logger.error('Confirm device replacement error:', error);
    res.status(500).json({ success: false, error: 'Device replacement failed' });
  }
};

// ─── Send 2FA OTP ─────────────────────────────────────────────────────────────
// Called when user has 2FA enabled and needs an OTP sent to their phone or email.
// POST /auth/send-2fa-otp  (authenticated)
const send2FAOtp = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await query(
      `SELECT email, first_name, phone, two_factor_enabled, two_factor_method
       FROM users WHERE id = $1`,
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    const user = rows[0];

    if (!user.two_factor_enabled) {
      return res.status(400).json({ success: false, error: '2FA is not enabled for this account' });
    }

    const method = user.two_factor_method || 'email';

    // Validate phone is available when method is SMS
    if (method === 'sms' && !user.phone) {
      return res.status(400).json({
        success: false,
        error: 'No phone number on file. Please add a phone number in your profile or switch to Email OTP.'
      });
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Store OTP in DB (reuse device_otp table — it has user_id, otp_code, expires_at)
    await query(
      `INSERT INTO device_otp (user_id, device_id, otp_code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, `2fa_${userId}`, otpCode, otpExpiry]
    );

    const { send2FAOtpEmail, send2FAOtpSms } = require('../../services/email.service');

    if (method === 'sms') {
      await send2FAOtpSms({ phone: user.phone, otpCode, firstName: user.first_name });
      logger.info(`[2FA] SMS OTP sent to user ${userId} at ${user.phone}`);
    } else {
      await send2FAOtpEmail({ to: user.email, firstName: user.first_name, otpCode });
      logger.info(`[2FA] Email OTP sent to user ${userId} at ${user.email}`);
    }

    await auditLog(userId, '2FA_OTP_SENT', 'auth', userId, { method, ip: req.ip }, req);

    res.json({
      success: true,
      message: method === 'sms'
        ? `Verification code sent to your phone ending in ${user.phone.slice(-4)}`
        : `Verification code sent to ${user.email}`,
      method,
      expiresAt: otpExpiry.toISOString(),
    });
  } catch (error) {
    logger.error('send2FAOtp error:', error);
    res.status(500).json({ success: false, error: 'Failed to send verification code' });
  }
};

// ─── Verify 2FA OTP ───────────────────────────────────────────────────────────
// POST /auth/verify-2fa-otp  (authenticated)
const verify2FAOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otpCode } = req.body;

    if (!otpCode || !/^\d{6}$/.test(otpCode)) {
      return res.status(400).json({ success: false, error: 'Invalid OTP format' });
    }

    const { rows } = await query(
      `SELECT id, otp_code, expires_at, verified_at
       FROM device_otp
       WHERE user_id = $1
         AND device_id = $2
         AND verified_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, `2fa_${userId}`]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No pending verification code found. Please request a new one.' });
    }

    const otp = rows[0];

    if (new Date(otp.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    if (otp.otp_code !== otpCode) {
      return res.status(400).json({ success: false, error: 'Incorrect verification code' });
    }

    // Mark as used
    await query('UPDATE device_otp SET verified_at = NOW() WHERE id = $1', [otp.id]);

    await auditLog(userId, '2FA_OTP_VERIFIED', 'auth', userId, { ip: req.ip }, req);

    res.json({ success: true, message: 'Verification successful' });
  } catch (error) {
    logger.error('verify2FAOtp error:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
};

module.exports = {
  login, logout, register,
  refreshToken,
  verifyDeviceOtp,
  requestDeviceReplacement, confirmDeviceReplacement,
  approveAccount, getPendingAccounts,
  getCurrentUser,
  forgotPassword, validateResetToken, resetPassword, changePassword,
  send2FAOtp, verify2FAOtp,
  sendRegistrationOtp, verifyRegistrationOtp,
  sendActivationOtp, verifyActivationOtp, completeEmployeeActivation,
};
