const express = require("express");
const adminController = require("./admin.controller");
const securityController = require("./security.controller");
const { authenticate, authorize } = require("../../middleware/auth.middleware");
const { runSeeds } = require("../../config/seed");
const logger = require("../../utils/logger");

const router = express.Router();

// ── Public (no auth) ──────────────────────────────────────────────────────────
// Safe branding + feature-flag config consumed by the mobile app on startup.
router.get("/public-config", adminController.getPublicConfig);

// ── One-time seed endpoint (protected by SEED_SECRET env var) ─────────────────
// Use: GET /api/admin/run-seed?secret=YOUR_SEED_SECRET
// Remove or disable after first successful seed.
router.get("/run-seed", async (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.query.secret !== secret) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  try {
    await runSeeds();
    res.json({ success: true, message: "Seed completed successfully" });
  } catch (err) {
    logger.error("Seed endpoint error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Re-run all pending migrations ─────────────────────────────────────────────
// GET /api/admin/run-migrations?secret=YOUR_SEED_SECRET
router.get("/run-migrations", async (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.query.secret !== secret) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  try {
    const { runMigrations } = require("../../config/migrate");
    await runMigrations();
    res.json({ success: true, message: "Migrations completed" });
  } catch (err) {
    logger.error("Migration endpoint error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Emergency schema fix — add all columns needed for employee login ──────────
// GET /api/admin/fix-schema?secret=YOUR_SEED_SECRET
router.get("/fix-schema", async (req, res) => {
  const secret = process.env.SEED_SECRET;
  if (!secret || req.query.secret !== secret) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  const { query: dbQuery } = require("../../config/database");
  const safe = async (sql) => { try { await dbQuery(sql); } catch (e) { logger.warn("fix-schema safe:", e.message); } };
  try {
    // user_devices missing columns
    await safe(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_hash    VARCHAR(255) NULL`);
    await safe(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_os      VARCHAR(100) NULL`);
    await safe(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_type    VARCHAR(50)  NULL DEFAULT 'mobile'`);
    await safe(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS last_used      TIMESTAMP    NULL`);
    await safe(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS is_trusted     BOOLEAN      NOT NULL DEFAULT FALSE`);
    await safe(`ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_version INTEGER      NOT NULL DEFAULT 0`);
    // device_otp missing column
    await safe(`ALTER TABLE device_otp ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL`);
    // users missing columns
    await safe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version               INTEGER      NOT NULL DEFAULT 1`);
    await safe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified              BOOLEAN      NOT NULL DEFAULT TRUE`);
    await safe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_requires_password BOOLEAN     NOT NULL DEFAULT FALSE`);
    await safe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login                 BOOLEAN      DEFAULT TRUE`);
    await safe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_device_id           VARCHAR(255) NULL`);
    await safe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by                  VARCHAR(50)  NULL`);
    // session_tracking missing columns
    await safe(`ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP    NULL`);
    await safe(`ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS device_id  VARCHAR(255) NULL`);
    await safe(`ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS session_id UUID         NULL`);
    await safe(`ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP    NULL`);
    // refresh_tokens missing columns
    await safe(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at     TIMESTAMP    NULL`);
    await safe(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(50)  NULL`);
    await safe(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS reuse_detected BOOLEAN      NOT NULL DEFAULT FALSE`);
    await safe(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_id     UUID         NULL`);
    await safe(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip_address     VARCHAR(45)  NULL`);
    await safe(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent     TEXT         NULL`);
    await safe(`ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_id      VARCHAR(255) NULL`);
    // login_attempts table
    await safe(`CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE SET NULL,
      email VARCHAR(255) NOT NULL, ip_address VARCHAR(45) NULL, device_id VARCHAR(255) NULL,
      user_agent TEXT NULL, status VARCHAR(20) NOT NULL DEFAULT 'FAILED',
      failure_reason VARCHAR(50) NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    // security_alerts table
    await safe(`CREATE TABLE IF NOT EXISTS security_alerts (
      id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE SET NULL,
      alert_type VARCHAR(50) NOT NULL, severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
      title VARCHAR(255) NOT NULL, message TEXT NOT NULL, metadata JSONB NULL,
      ip_address VARCHAR(45) NULL, device_id VARCHAR(255) NULL,
      is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
      resolved_by INT REFERENCES users(id), resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    // notifications missing columns
    await safe(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(50) NULL`);
    await safe(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NULL`);
    await safe(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB       NULL`);
    // fix status constraint
    await safe(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`);
    await safe(`ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN (
      'ACTIVE','INACTIVE','PENDING','LOCKED',
      'PENDING_APPROVAL','PENDING_ACTIVATION','REJECTED','LOCKED_ROLE','SUSPENDED'
    ))`);
    // backfill active users
    await safe(`UPDATE users SET email_verified = TRUE WHERE status = 'ACTIVE'`);
    res.json({ success: true, message: "Schema fix applied successfully" });
  } catch (err) {
    logger.error("fix-schema error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// v2

// ── Admin-only ────────────────────────────────────────────────────────────────
router.use(authenticate, authorize("ADMIN"));

// Live employee locations (from socket streaming)
router.get("/live-locations", (req, res) => {
  const { getLiveLocations } = require("../../services/socket.service");
  res.json({ success: true, data: getLiveLocations() });
});

// System settings
router.get("/settings", adminController.getSystemSettings);
router.put("/settings", adminController.updateSystemSettings);
router.post("/settings/rotate-qr-secret", adminController.rotateQrSecret);
router.get("/settings/static-qr", adminController.getStaticQRCode);
router.post("/settings/generate-qr", adminController.generateProtectedQrCode);
router.post("/settings/set-qr-password", adminController.setQrPassword);
router.get("/settings/qr-password", adminController.getQrPassword);
router.get("/settings/preview-qr", adminController.previewQrForPassword);
router.post("/settings/invalidate-qr-codes", adminController.invalidateAllQrCodes);
router.get("/settings/qr-stats", adminController.getQrCodeStats);

// Audit logs
router.get("/audit-logs", adminController.getAuditLogs);

// Security endpoints
router.get("/security/dashboard", securityController.getSecurityDashboard);
router.get("/security/alerts", securityController.getSecurityAlerts);
router.post("/security/alerts/:id/read", securityController.markAlertRead);
router.post("/security/alerts/:id/resolve", securityController.resolveAlert);
router.get("/security/login-attempts", securityController.getLoginAttempts);

// Reports
router.get("/reports/attendance", adminController.getAttendanceReport);
router.get("/reports/users", adminController.getUserReport);

// Backup
router.post("/backup", adminController.createBackup);

module.exports = router;
