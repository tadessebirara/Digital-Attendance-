const nodemailer = require('nodemailer');
const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');

// ─── Helper: mask a secret so it's safe to send to the frontend ──────────────
function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return value.slice(0, 3) + '*'.repeat(value.length - 6) + value.slice(-3);
}

// ─── Helper: load integration row from DB (upsert by key) ────────────────────
async function loadConfig(key) {
  const { rows } = await query(
    `SELECT config FROM integrations WHERE name = $1 LIMIT 1`,
    [key]
  );
  if (!rows.length) return {};
  const cfg = rows[0].config;
  // config is JSONB — may already be an object (pg returns it parsed)
  if (typeof cfg === 'object' && cfg !== null) return cfg;
  try { return JSON.parse(cfg || '{}'); } catch { return {}; }
}

async function saveConfig(key, type, config) {
  const { rows } = await query(
    `SELECT id FROM integrations WHERE name = $1 LIMIT 1`,
    [key]
  );
  if (rows.length) {
    await query(
      `UPDATE integrations SET config = $1::jsonb, status = 'ACTIVE', updated_at = NOW() WHERE name = $2`,
      [JSON.stringify(config), key]
    );
  } else {
    await query(
      `INSERT INTO integrations (name, type, status, config) VALUES ($1, $2, 'ACTIVE', $3::jsonb)`,
      [key, type, JSON.stringify(config)]
    );
  }
}

async function disableConfig(key) {
  await query(
    `UPDATE integrations SET status = 'INACTIVE', config = '{}'::jsonb, updated_at = NOW() WHERE name = $1`,
    [key]
  );
}

// ─── GET /api/integrations/status ────────────────────────────────────────────
// Returns real live status for all 4 integrations.
const getIntegrationStatus = async (req, res) => {
  try {
    // ── 1. Email (SMTP) ──────────────────────────────────────────────────────
    const emailDbCfg = await loadConfig('email_smtp');
    // Merge: env vars win over DB, but if env is missing, use DB values
    const effectiveHost = process.env.SMTP_HOST || emailDbCfg.host || '';
    const effectiveUser = process.env.SMTP_USER || emailDbCfg.user || '';
    const effectivePass = process.env.SMTP_PASS || emailDbCfg.pass || '';
    // Apply DB config to process.env if env vars are absent (so email service works)
    if (!process.env.SMTP_HOST && emailDbCfg.host) {
      process.env.SMTP_HOST = emailDbCfg.host;
      process.env.SMTP_PORT = emailDbCfg.port || '587';
      process.env.SMTP_USER = emailDbCfg.user;
      process.env.SMTP_PASS = emailDbCfg.pass;
      if (emailDbCfg.from) process.env.SMTP_FROM = emailDbCfg.from;
    }
    const emailConnected = !!(effectiveHost && effectiveUser && effectivePass);
    const emailConfig = emailConnected ? {
      host: effectiveHost,
      port: process.env.SMTP_PORT || emailDbCfg.port || '587',
      user: effectiveUser,
      pass: mask(effectivePass),
      from: process.env.SMTP_FROM || emailDbCfg.from || effectiveUser,
    } : {};

    // ── 2. SMS (Twilio) ──────────────────────────────────────────────────────
    const smsConnected = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    );
    const smsDbCfg = await loadConfig('sms_twilio');
    const smsConfig = smsConnected ? {
      accountSid: mask(process.env.TWILIO_ACCOUNT_SID),
      authToken: mask(process.env.TWILIO_AUTH_TOKEN),
      fromNumber: process.env.TWILIO_FROM_NUMBER,
    } : smsDbCfg;

    // ── 3. Payroll (external HR/payroll webhook) ─────────────────────────────
    const payrollDbCfg = await loadConfig('payroll_webhook');
    const payrollConnected = !!(payrollDbCfg.webhookUrl && payrollDbCfg.enabled);

    // ── 4. Cloud Backup (S3-compatible) ─────────────────────────────────────
    const cloudConnected = !!(
      process.env.CLOUD_BACKUP_BUCKET &&
      process.env.CLOUD_BACKUP_ACCESS_KEY &&
      process.env.CLOUD_BACKUP_SECRET_KEY
    );
    const cloudDbCfg = await loadConfig('cloud_backup');
    const cloudConfig = cloudConnected ? {
      bucket: process.env.CLOUD_BACKUP_BUCKET,
      region: process.env.CLOUD_BACKUP_REGION || 'us-east-1',
      endpoint: process.env.CLOUD_BACKUP_ENDPOINT || '',
      accessKey: mask(process.env.CLOUD_BACKUP_ACCESS_KEY),
      secretKey: mask(process.env.CLOUD_BACKUP_SECRET_KEY),
    } : cloudDbCfg;

    res.json({
      success: true,
      data: {
        email: {
          connected: emailConnected,
          config: emailConfig,
          source: emailConnected ? 'env' : 'db',
        },
        sms: {
          connected: smsConnected,
          config: smsConfig,
          source: smsConnected ? 'env' : 'db',
        },
        payroll: {
          connected: payrollConnected,
          config: payrollDbCfg,
        },
        cloud: {
          connected: cloudConnected,
          config: cloudConfig,
          source: cloudConnected ? 'env' : 'db',
        },
      },
    });
  } catch (error) {
    logger.error('Get integration status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch integration status' });
  }
};

// ─── POST /api/integrations/email/test ───────────────────────────────────────
const testEmail = async (req, res) => {
  try {
    const host = process.env.SMTP_HOST || req.body.host;
    const port = parseInt(process.env.SMTP_PORT || req.body.port || '587');
    const user = process.env.SMTP_USER || req.body.user;
    const pass = process.env.SMTP_PASS || req.body.pass;

    if (!host || !user || !pass) {
      return res.status(400).json({ success: false, error: 'SMTP credentials not configured' });
    }

    const secure = port === 465;
    const transporter = nodemailer.createTransport({
      host, port, secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
    });

    const start = Date.now();
    await transporter.verify();
    const latency = Date.now() - start;

    // Send a real test email to the admin
    const adminEmail = process.env.SMTP_USER || user;
    await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to: req.user?.email || adminEmail,
      subject: 'Alyah — SMTP Test Successful ✅',
      text: `SMTP connection test passed.\n\nHost: ${host}:${port}\nLatency: ${latency}ms\nTested by: ${req.user?.email || 'admin'}\nTime: ${new Date().toISOString()}`,
    });

    await auditLog(req.user.id, 'INTEGRATION_TEST', 'integrations', null, { type: 'email', success: true, latency }, req);

    res.json({ success: true, message: `Connection verified in ${latency}ms. Test email sent.`, latency });
  } catch (error) {
    logger.error('Email test error:', error);
    res.status(400).json({ success: false, error: error.message || 'SMTP connection failed' });
  }
};

// ─── POST /api/integrations/sms/test ─────────────────────────────────────────
const testSms = async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || req.body.accountSid;
    const authToken  = process.env.TWILIO_AUTH_TOKEN  || req.body.authToken;
    const from       = process.env.TWILIO_FROM_NUMBER || req.body.fromNumber;
    const to         = req.body.testPhone || from;

    if (!accountSid || !authToken || !from) {
      return res.status(400).json({ success: false, error: 'Twilio credentials not configured' });
    }

    // Validate credentials by fetching the account (no SMS cost)
    const https = require('https');
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const start = Date.now();

    await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${accountSid}.json`,
        headers: { Authorization: `Basic ${auth}` },
      };
      const req2 = https.get(opts, r => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => {
          if (r.statusCode === 200) resolve(JSON.parse(data));
          else reject(new Error(`Twilio API returned ${r.statusCode}: ${data}`));
        });
      });
      req2.on('error', reject);
      req2.setTimeout(8000, () => reject(new Error('Twilio request timed out')));
    });

    const latency = Date.now() - start;
    await auditLog(req.user.id, 'INTEGRATION_TEST', 'integrations', null, { type: 'sms', success: true, latency }, req);

    res.json({ success: true, message: `Twilio credentials valid (${latency}ms). Ready to send SMS.`, latency });
  } catch (error) {
    logger.error('SMS test error:', error);
    res.status(400).json({ success: false, error: error.message || 'Twilio connection failed' });
  }
};

// ─── POST /api/integrations/payroll/test ─────────────────────────────────────
const testPayroll = async (req, res) => {
  try {
    const cfg = await loadConfig('payroll_webhook');
    const webhookUrl = cfg.webhookUrl || req.body.webhookUrl;

    if (!webhookUrl) {
      return res.status(400).json({ success: false, error: 'Payroll webhook URL not configured' });
    }

    // Ping the webhook with a test payload
    const https = require('https');
    const http  = require('http');
    const url   = new URL(webhookUrl);
    const isHttps = url.protocol === 'https:';
    const payload = JSON.stringify({
      event: 'test',
      source: 'alyah_attendance',
      timestamp: new Date().toISOString(),
    });
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-Alyah-Test': '1',
    };
    if (cfg.secret) headers['X-Alyah-Secret'] = cfg.secret;

    const start = Date.now();
    const statusCode = await new Promise((resolve, reject) => {
      const opts = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
      };
      const lib = isHttps ? https : http;
      const r = lib.request(opts, res2 => resolve(res2.statusCode));
      r.on('error', reject);
      r.setTimeout(8000, () => reject(new Error('Webhook timed out')));
      r.write(payload);
      r.end();
    });
    const latency = Date.now() - start;

    if (statusCode >= 200 && statusCode < 300) {
      await auditLog(req.user.id, 'INTEGRATION_TEST', 'integrations', null, { type: 'payroll', success: true, latency }, req);
      res.json({ success: true, message: `Webhook responded ${statusCode} in ${latency}ms.`, latency });
    } else {
      res.status(400).json({ success: false, error: `Webhook returned HTTP ${statusCode}` });
    }
  } catch (error) {
    logger.error('Payroll webhook test error:', error);
    res.status(400).json({ success: false, error: error.message || 'Webhook test failed' });
  }
};

// ─── POST /api/integrations/cloud/test ───────────────────────────────────────
const testCloud = async (req, res) => {
  try {
    const bucket    = process.env.CLOUD_BACKUP_BUCKET     || req.body.bucket;
    const accessKey = process.env.CLOUD_BACKUP_ACCESS_KEY || req.body.accessKey;
    const secretKey = process.env.CLOUD_BACKUP_SECRET_KEY || req.body.secretKey;
    const region    = process.env.CLOUD_BACKUP_REGION     || req.body.region || 'us-east-1';
    const endpoint  = process.env.CLOUD_BACKUP_ENDPOINT   || req.body.endpoint || '';

    if (!bucket || !accessKey || !secretKey) {
      return res.status(400).json({ success: false, error: 'Cloud backup credentials not configured' });
    }

    // AWS S3-compatible HEAD bucket request with manual HMAC-SHA256 signing
    const crypto = require('crypto');
    const https  = require('https');

    const service  = 's3';
    const host     = endpoint || `${bucket}.s3.${region}.amazonaws.com`;
    const path     = '/';
    const dateStr  = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateShort = dateStr.slice(0, 8);

    const canonicalHeaders = `host:${host}\nx-amz-date:${dateStr}\n`;
    const signedHeaders    = 'host;x-amz-date';
    const payloadHash      = crypto.createHash('sha256').update('').digest('hex');
    const canonicalRequest = `HEAD\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

    function hmac(key, data) {
      return crypto.createHmac('sha256', key).update(data).digest();
    }
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateShort), region), service), 'aws4_request');
    const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const start = Date.now();
    const statusCode = await new Promise((resolve, reject) => {
      const req2 = https.request({ hostname: host, path, method: 'HEAD', headers: { 'x-amz-date': dateStr, Authorization: authorization } }, r => resolve(r.statusCode));
      req2.on('error', reject);
      req2.setTimeout(8000, () => reject(new Error('S3 request timed out')));
      req2.end();
    });
    const latency = Date.now() - start;

    if (statusCode === 200 || statusCode === 403) {
      // 403 = bucket exists but we might not have full access — still means credentials work
      await auditLog(req.user.id, 'INTEGRATION_TEST', 'integrations', null, { type: 'cloud', success: true, latency }, req);
      res.json({ success: true, message: `S3 bucket reachable (${latency}ms). Backup ready.`, latency });
    } else if (statusCode === 301 || statusCode === 302) {
      res.json({ success: true, message: `Bucket found but in different region. Check region setting.`, latency });
    } else {
      res.status(400).json({ success: false, error: `S3 returned HTTP ${statusCode}` });
    }
  } catch (error) {
    logger.error('Cloud backup test error:', error);
    res.status(400).json({ success: false, error: error.message || 'Cloud connection failed' });
  }
};

// ─── POST /api/integrations/payroll/save ─────────────────────────────────────
const savePayroll = async (req, res) => {
  try {
    const { webhookUrl, secret, enabled } = req.body;
    if (!webhookUrl) return res.status(400).json({ success: false, error: 'webhookUrl is required' });
    await saveConfig('payroll_webhook', 'PAYROLL', { webhookUrl, secret: secret || '', enabled: !!enabled });
    await auditLog(req.user.id, 'INTEGRATION_UPDATED', 'integrations', null, { type: 'payroll' }, req);
    res.json({ success: true, message: 'Payroll webhook saved' });
  } catch (error) {
    logger.error('Save payroll config error:', error);
    res.status(500).json({ success: false, error: 'Failed to save payroll config' });
  }
};

// ─── POST /api/integrations/email/save ───────────────────────────────────────
// Saves email config to DB so it persists — on next restart .env takes precedence
const saveEmail = async (req, res) => {
  try {
    const { host, port, user, pass, from } = req.body;
    if (!host || !user || !pass) {
      return res.status(400).json({ success: false, error: 'host, user, and pass are required' });
    }
    await saveConfig('email_smtp', 'EMAIL', { host, port: port || '587', user, pass, from: from || user });
    // Also update process.env so email.service picks it up immediately without restart
    process.env.SMTP_HOST = host;
    process.env.SMTP_PORT = String(port || '587');
    process.env.SMTP_USER = user;
    process.env.SMTP_PASS = pass;
    if (from) process.env.SMTP_FROM = from;
    await auditLog(req.user.id, 'INTEGRATION_UPDATED', 'integrations', null, { type: 'email' }, req);
    res.json({ success: true, message: 'Email (SMTP) configuration saved and applied' });
  } catch (error) {
    logger.error('Save email config error:', error);
    res.status(500).json({ success: false, error: 'Failed to save email config' });
  }
};
const saveSms = async (req, res) => {
  try {
    const { accountSid, authToken, fromNumber } = req.body;
    if (!accountSid || !authToken || !fromNumber) {
      return res.status(400).json({ success: false, error: 'accountSid, authToken, and fromNumber are required' });
    }
    await saveConfig('sms_twilio', 'SMS', { accountSid, authToken, fromNumber });
    process.env.TWILIO_ACCOUNT_SID = accountSid;
    process.env.TWILIO_AUTH_TOKEN  = authToken;
    process.env.TWILIO_FROM_NUMBER = fromNumber;
    await auditLog(req.user.id, 'INTEGRATION_UPDATED', 'integrations', null, { type: 'sms' }, req);
    res.json({ success: true, message: 'SMS (Twilio) credentials saved and applied' });
  } catch (error) {
    logger.error('Save SMS config error:', error);
    res.status(500).json({ success: false, error: 'Failed to save SMS config' });
  }
};

// ─── POST /api/integrations/cloud/save ───────────────────────────────────────
const saveCloud = async (req, res) => {
  try {
    const { bucket, region, endpoint, accessKey, secretKey } = req.body;
    if (!bucket || !accessKey || !secretKey) {
      return res.status(400).json({ success: false, error: 'bucket, accessKey, and secretKey are required' });
    }
    await saveConfig('cloud_backup', 'CLOUD', { bucket, region: region || 'us-east-1', endpoint: endpoint || '', accessKey, secretKey });
    await auditLog(req.user.id, 'INTEGRATION_UPDATED', 'integrations', null, { type: 'cloud' }, req);
    res.json({ success: true, message: 'Cloud backup credentials saved' });
  } catch (error) {
    logger.error('Save cloud config error:', error);
    res.status(500).json({ success: false, error: 'Failed to save cloud config' });
  }
};

// ─── DELETE /api/integrations/:key ───────────────────────────────────────────
const disconnectIntegration = async (req, res) => {
  try {
    const { key } = req.params;
    const allowed = ['sms_twilio', 'payroll_webhook', 'cloud_backup'];
    if (!allowed.includes(key)) {
      return res.status(400).json({ success: false, error: 'Cannot disconnect this integration from here' });
    }
    await disableConfig(key);
    // Clear stored secrets for security
    await query(`UPDATE integrations SET config = '{}' WHERE name = $1`, [key]);
    await auditLog(req.user.id, 'INTEGRATION_DELETED', 'integrations', null, { key }, req);
    res.json({ success: true, message: 'Integration disconnected' });
  } catch (error) {
    logger.error('Disconnect integration error:', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect' });
  }
};

module.exports = {
  getIntegrationStatus,
  testEmail,
  testSms,
  testPayroll,
  testCloud,
  saveEmail,
  savePayroll,
  saveSms,
  saveCloud,
  disconnectIntegration,
};
