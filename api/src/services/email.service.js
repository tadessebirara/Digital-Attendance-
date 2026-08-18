const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ─── Singleton transporter — pool:true only works when the same instance is reused ──
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter; // reuse — pool actually works now
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn('[Email] SMTP not configured — emails will be logged only (dev mode)');
    return null;
  }
  const port = parseInt(SMTP_PORT) || 587;
  const secure = port === 465;
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST, port, secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      minVersion: 'TLSv1.2',
    },
    pool: true, maxConnections: 3, maxMessages: 100,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000,
  });
  return _transporter;
}

// ─── Core send ────────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || 'Alyah Technologies <noreply@alyah.app>';
  const transporter = getTransporter();

  if (!transporter) {
    // Dev fallback — log full content so you can see what would have been sent
    logger.info(`[Email DEV] Simulated send →`);
    logger.info(`  To:      ${to}`);
    logger.info(`  Subject: ${subject}`);
    logger.info(`  Body:    ${text?.substring(0, 200) ?? '(html only)'}`);
    return { success: true, dev: true };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    logger.info(`[Email] ✅ Sent to ${to} — subject: "${subject}" — messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`[Email] ❌ Failed to send to ${to} — ${error.message}`);
    logger.error(`[Email] SMTP error code: ${error.code} | response: ${error.response ?? 'none'}`);
    return { success: false, error: error.message };
  }
}

// ─── Shared style block ───────────────────────────────────────────────────────
const BASE_STYLE = `
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6f9;margin:0;padding:0;}
  .wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.10);}
  .hdr{padding:32px 40px;text-align:center;}
  .hdr h1{color:#fff;margin:0;font-size:22px;font-weight:800;}
  .hdr p{color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px;}
  .body{padding:40px;color:#374151;}
  .body p{line-height:1.6;margin:0 0 16px;font-size:15px;}
  .btn{display:inline-block;color:#fff!important;text-decoration:none;padding:16px 36px;border-radius:8px;font-weight:800;font-size:15px;margin:8px 0 20px;letter-spacing:.3px;}
  .btn-dark{display:inline-block;background:#0f172a;color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:14px;margin:4px 0 16px;}
  .info{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:16px 0;font-size:14px;color:#065f46;}
  .warn{background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;font-size:13px;color:#92400e;margin:20px 0 0;}
  .alert{background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;font-size:13px;color:#991b1b;margin:20px 0 0;}
  .note{background:#eff6ff;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:4px;font-size:13px;color:#1e40af;margin:16px 0;}
  .url{word-break:break-all;font-size:12px;color:#6b7280;background:#f3f4f6;padding:8px 12px;border-radius:4px;margin-top:8px;}
  .ftr{background:#f9fafb;padding:20px 40px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;}
  .divider{text-align:center;color:#9ca3af;font-size:12px;margin:8px 0;}
`;

function wrap(headerBg, headerContent, bodyContent, company) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>${BASE_STYLE}</style></head><body>
<div class="wrap">
  <div class="hdr" style="background:${headerBg};">${headerContent}</div>
  <div class="body">${bodyContent}</div>
  <div class="ftr">${company} &bull; Automated message — do not reply.</div>
</div></body></html>`;
}

// ─── Template 1: Password Reset ───────────────────────────────────────────────
async function sendPasswordResetEmail({
  to, firstName, resetUrl, mobileDeepLink, expiresInMinutes = 60, deviceBound = false, source = 'web',
}) {
  const company = process.env.COMPANY_NAME || 'Alyah Technologies';
  const isMobile = source === 'mobile' && !!mobileDeepLink;

  // Always include BOTH the web link AND the deep link so the user can choose
  // regardless of which client (browser vs app) they open the email on.
  const webBody = `
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>We received a request to reset your <strong>${company}</strong> account password.</p>

    ${isMobile ? `
    <p><strong>On your phone — open the app directly:</strong></p>
    <p style="text-align:center;margin:20px 0;">
      <a href="${mobileDeepLink}" class="btn" style="background:linear-gradient(135deg,#1a56db,#6d28d9);">📱 Reset Password in App</a>
    </p>
    <div class="note">Tap the button above on your phone to open the Alyah app directly to the reset screen.</div>
    <div class="divider">— or —</div>
    <p><strong>In a browser (any device):</strong></p>
    <p style="text-align:center;margin:16px 0;">
      <a href="${resetUrl}" class="btn-dark">🌐 Reset via Web Browser</a>
    </p>
    ` : `
    <p style="text-align:center;margin:24px 0;">
      <a href="${resetUrl}" class="btn" style="background:linear-gradient(135deg,#1a56db,#6d28d9);">🔑 Reset My Password</a>
    </p>
    ${mobileDeepLink ? `
    <div class="divider">— or tap on your phone —</div>
    <p style="text-align:center;margin:16px 0;">
      <a href="${mobileDeepLink}" class="btn-dark">📱 Open in Alyah App</a>
    </p>
    ` : ''}
    `}

    <p>Or copy this link into your browser:</p>
    <div class="url">${resetUrl}</div>

    ${deviceBound ? `<div class="note">🔒 <strong>Security notice:</strong> This link is bound to the device that requested it and will not work on a different device.</div>` : ''}
    <div class="warn">⏱ Expires in <strong>${expiresInMinutes} minutes</strong> · One-time use only.<br/>
    If you did not request this, ignore this email — your password will not change.</div>`;

  const header = `<h1>🔐 Password Reset Request</h1><p>${company} · Attendance System</p>`;
  const html = wrap('linear-gradient(135deg,#1a56db,#6d28d9)', header, webBody, company);
  const text = [
    `Hi ${firstName},`,
    '',
    `Reset your ${company} password:`,
    resetUrl,
    isMobile && mobileDeepLink ? `\nOr open the app: ${mobileDeepLink}` : '',
    '',
    `Expires in ${expiresInMinutes} minutes. One-time use only.`,
    '',
    'If you did not request this, ignore this email.',
  ].join('\n');

  return sendEmail({ to, subject: `Reset your ${company} password`, html, text });
}

// ─── Template 2: Password Changed Confirmation ────────────────────────────────
async function sendPasswordChangedEmail({ to, firstName, ip, changedAt }) {
  const company = process.env.COMPANY_NAME || 'Alyah Technologies';
  const formattedTime = new Date(changedAt).toLocaleString('en-US', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC',
  }) + ' UTC';

  const body = `
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>Your <strong>${company}</strong> account password was successfully changed.</p>
    <div class="info">
      🕐 <strong>Time:</strong> ${formattedTime}<br/>
      🌐 <strong>IP Address:</strong> ${ip || 'Unknown'}
    </div>
    <p>All active sessions have been signed out. You will need to log in again on all your devices.</p>
    <div class="alert">🚨 <strong>Didn't make this change?</strong><br/>
    Contact your system administrator immediately. Your account may have been compromised.</div>`;

  const header = `<h1>✅ Password Successfully Changed</h1><p>${company} · Security Alert</p>`;
  const html = wrap('#059669', header, body, company);
  const text = `Hi ${firstName},\n\nYour ${company} password was changed on ${formattedTime} from IP ${ip || 'Unknown'}.\n\nAll sessions signed out.\n\nIf you did not make this change, contact your administrator immediately.`;

  return sendEmail({ to, subject: `Your ${company} password was changed`, html, text });
}

// ─── Template 3: Account Approved — Welcome ───────────────────────────────────
async function sendAccountApprovedEmail({
  to, firstName, department, position, loginDeepLink, approvedBy,
}) {
  const company = process.env.COMPANY_NAME || 'Alyah Technologies';
  const deepLink = loginDeepLink || 'alyah://login';

  const detailsBlock = (department || position) ? `
    <div class="info">
      <p style="margin:0 0 10px;font-weight:700;">Your Account Details</p>
      ${department ? `<div>🏢 <strong>Department:</strong> ${department}</div>` : ''}
      ${position   ? `<div style="margin-top:6px;">💼 <strong>Position:</strong> ${position}</div>` : ''}
    </div>` : '';

  const body = `
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>Great news! Your <strong>${company}</strong> account has been approved by HR. You can now log in to the mobile app.</p>
    ${detailsBlock}
    <p style="text-align:center;margin-top:28px;">
      <a href="${deepLink}" class="btn" style="background:linear-gradient(135deg,#059669,#0d9488);">Open Alyah App &amp; Sign In</a>
    </p>
    <div class="note">📱 <strong>Tap the button above</strong> on your phone to open the Alyah app directly to the login screen. Use the email and password you registered with.</div>
    <p style="margin-top:20px;font-size:13px;color:#6b7280;">Approved by: <strong>${approvedBy || 'HR Team'}</strong></p>`;

  const header = `<h1>🎉 Account Approved!</h1><p>${company} · Attendance System</p>`;
  const html = wrap('linear-gradient(135deg,#059669,#0d9488)', header, body, company);
  const text = `Hi ${firstName},\n\nYour ${company} account has been approved!\n\n${department ? `Department: ${department}\n` : ''}${position ? `Position: ${position}\n` : ''}\nOpen the Alyah app and sign in with your registered email and password.\n\nApproved by: ${approvedBy || 'HR Team'}`;

  return sendEmail({
    to,
    subject: `✅ Your ${company} account is ready — Sign in now`,
    html,
    text,
  });
}

// ─── Template 4: 2FA OTP via Email ───────────────────────────────────────────
async function send2FAOtpEmail({ to, firstName, otpCode, expiresInMinutes = 10 }) {
  const company = process.env.COMPANY_NAME || 'Alyah Technologies';

  const body = `
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>Your <strong>${company}</strong> two-factor authentication code is:</p>
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#15803d;font-family:monospace;">${otpCode}</span>
      </div>
    </div>
    <div class="warn">⏱ This code expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.<br/>
    Never share this code with anyone.</div>`;

  const header = `<h1>🔐 Your 2FA Code</h1><p>${company} · Two-Factor Authentication</p>`;
  const html = wrap('linear-gradient(135deg,#059669,#0d9488)', header, body, company);
  const text = `Hi ${firstName},\n\nYour ${company} 2FA code is: ${otpCode}\n\nExpires in ${expiresInMinutes} minutes. Never share this code.`;

  return sendEmail({ to, subject: `Your ${company} verification code: ${otpCode}`, html, text });
}

// ─── Template 5: 2FA OTP via SMS ─────────────────────────────────────────────
// Uses Twilio if configured, otherwise logs in dev mode.
async function send2FAOtpSms({ phone, otpCode, firstName }) {
  const company = process.env.COMPANY_NAME || 'Alyah Technologies';
  const message = `${company}: Your verification code is ${otpCode}. Valid for 10 minutes. Never share this code.`;

  // Twilio integration (optional — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER) {
    try {
      const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      await twilio.messages.create({ body: message, from: TWILIO_FROM_NUMBER, to: phone });
      logger.info(`[SMS] 2FA OTP sent to ${phone}`);
      return { success: true };
    } catch (err) {
      logger.error(`[SMS] Failed to send to ${phone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // Dev mode — log the OTP (never in production)
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[SMS DEV] 2FA OTP for ${phone} (${firstName}): ${otpCode}`);
  }
  return { success: true, dev: true };
}

// ─── Template 6: Registration OTP ────────────────────────────────────────────
async function sendRegistrationOtpEmail({ to, email, otpCode, expiresInMinutes = 5 }) {
  const company = process.env.COMPANY_NAME || 'Alyah Technologies';

  const body = `
    <p>Hi there,</p>
    <p>You're registering a new <strong>${company}</strong> account with this email address.</p>
    <p>Your email verification code is:</p>
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background:#eff6ff;border:2px solid #3b82f6;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#1d4ed8;font-family:monospace;">${otpCode}</span>
      </div>
    </div>
    <div class="warn">⏱ This code expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.<br/>
    If you did not request this, you can safely ignore this email.</div>
    <p style="font-size:13px;color:#6b7280;">Registering with: <strong>${email}</strong></p>`;

  const header = `<h1>📧 Verify Your Email</h1><p>${company} · Account Registration</p>`;
  const html = wrap('linear-gradient(135deg,#1d4ed8,#7c3aed)', header, body, company);
  const text = `Hi,\n\nYour ${company} registration verification code is: ${otpCode}\n\nExpires in ${expiresInMinutes} minutes. Never share this code.\n\nRegistering with: ${email}`;

  return sendEmail({ to, subject: `Your ${company} registration code: ${otpCode}`, html, text });
}

// ─── Template 7: Employee activation (HR-created or post self-reg approval) ─
async function sendEmployeeActivationEmail({
  to, firstName, otpCode, deepLink, expiresInMinutes = 15,
}) {
  const company = process.env.COMPANY_NAME || 'Alyah Technologies';

  const body = `
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>Your <strong>${company}</strong> account is ready for activation. Use this code in the mobile app:</p>
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#15803d;font-family:monospace;">${otpCode}</span>
      </div>
    </div>
    <p style="text-align:center;">
      <a href="${deepLink}" class="btn" style="background:linear-gradient(135deg,#059669,#0d9488);">Open app — verify email</a>
    </p>
    <div class="note">📱 Tap the button on your phone to open the app directly to email verification. You will then set your password.</div>
    <div class="warn">⏱ Code expires in <strong>${expiresInMinutes} minutes</strong>. Do not share this code.</div>`;

  const header = `<h1>✉️ Activate your account</h1><p>${company} · Attendance</p>`;
  const html = wrap('linear-gradient(135deg,#059669,#0d9488)', header, body, company);
  const text = `Hi ${firstName},\n\nYour ${company} activation code is: ${otpCode}\n\nOpen the app: ${deepLink}\n\nExpires in ${expiresInMinutes} minutes.`;

  return sendEmail({
    to,
    subject: `Your ${company} activation code: ${otpCode}`,
    html,
    text,
  });
}

// ─── Template 8: Email Change OTP ────────────────────────────────────────────
async function sendEmailChangeOtp({ to, firstName, otpCode, expiresInMinutes = 15 }) {
  const company = process.env.COMPANY_NAME || 'Alyah Technologies';

  const body = `
    <p>Hi <strong>${firstName}</strong>,</p>
    <p>We received a request to change the email address on your <strong>${company}</strong> account to <strong>${to}</strong>.</p>
    <p>Enter this verification code in the app to confirm the change:</p>
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background:#eff6ff;border:2px solid #3b82f6;border-radius:12px;padding:20px 40px;">
        <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#1d4ed8;font-family:monospace;">${otpCode}</span>
      </div>
    </div>
    <div class="note">📧 This code verifies your new email address: <strong>${to}</strong></div>
    <div class="warn">⏱ Code expires in <strong>${expiresInMinutes} minutes</strong>. If you did not request this change, you can safely ignore this email — your current email remains unchanged.</div>`;

  const header = `<h1>📧 Verify New Email</h1><p>${company} · Email Change</p>`;
  const html = wrap('linear-gradient(135deg,#1d4ed8,#0ea5e9)', header, body, company);
  const text = `Hi ${firstName},\n\nYour ${company} email change verification code is: ${otpCode}\n\nThis verifies: ${to}\n\nExpires in ${expiresInMinutes} minutes. If you did not request this, ignore this message.`;

  return sendEmail({
    to,
    subject: `Your ${company} email change code: ${otpCode}`,
    html,
    text,
  });
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAccountApprovedEmail,
  send2FAOtpEmail,
  send2FAOtpSms,
  sendRegistrationOtpEmail,
  sendEmployeeActivationEmail,
  sendEmailChangeOtp,
};

// ─── Startup SMTP health check ────────────────────────────────────────────────
// Called once when the module first loads — tells you immediately on server
// start whether email will actually work, instead of finding out at runtime.
(function verifySmtpOnStartup() {
  const t = getTransporter();
  if (!t) {
    logger.warn('[Email] ⚠️  No SMTP config — all emails will be simulated (dev mode)');
    return;
  }
  t.verify((err) => {
    if (err) {
      logger.error(`[Email] ❌ SMTP connection FAILED: ${err.message}`);
      logger.error('[Email] Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env');
    } else {
      logger.info(`[Email] ✅ SMTP ready — ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} as ${process.env.SMTP_USER}`);
    }
  });
})();
