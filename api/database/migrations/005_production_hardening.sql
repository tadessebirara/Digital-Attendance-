-- ============================================================
-- Migration 005: Production Hardening
-- Fixes: race condition, QR nonce store, token_version,
--        EXCUSED status, device key provisioning
-- ============================================================

-- ── 1. FIX 4: Unique constraint on attendance_records ────────────────────────
-- Eliminates the SELECT-before-INSERT race condition at the DB level.
-- ON CONFLICT ON CONSTRAINT unique_user_day DO NOTHING is now safe to use.
--
-- NOTE: If duplicate rows already exist, resolve them first:
--   DELETE FROM attendance_records a USING attendance_records b
--   WHERE a.id > b.id AND a.user_id = b.user_id
--     AND DATE(a.clock_in_time) = DATE(b.clock_in_time);
ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS unique_user_day;

-- Expression-based unique constraints cannot be added via ALTER TABLE ADD CONSTRAINT
-- in all PostgreSQL versions. Use a unique index instead — functionally equivalent.
DROP INDEX IF EXISTS unique_user_day;
CREATE UNIQUE INDEX unique_user_day
  ON attendance_records (user_id, (DATE(clock_in_time)));

-- ── 2. FIX 9: Add EXCUSED to attendance status enum ─────────────────────────
ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_status_check;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED',
                    'CHECKED_OUT', 'MISSED_CHECKOUT', 'AUTO_CHECKOUT'));

-- Add source column if not present (used by leave reconciliation)
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'REALTIME'
    CHECK (source IN ('REALTIME', 'OFFLINE', 'MANUAL', 'QR', 'LEAVE'));

-- ── 3. FIX 2: Ensure token_version column exists on users ───────────────────
-- token_version starts at 0 for all users. Incrementing it invalidates
-- all previously issued JWTs for that user instantly.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- ── 4. FIX 3: QR nonce store — store nonce (not full payload) ───────────────
-- Drop old qr_codes table structure and recreate with nonce-based design.
-- The nonce is a 64-char hex string (32 random bytes).
-- The full signed payload is never stored — only the nonce for one-time use.
DROP TABLE IF EXISTS qr_codes;

CREATE TABLE qr_codes (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(64) NOT NULL UNIQUE,   -- nonce (hex)
  expires_at TIMESTAMP   NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_active
  ON qr_codes (code, is_active, expires_at)
  WHERE is_active = TRUE;

-- Auto-cleanup: remove expired QR nonces older than 5 minutes
-- (handled by cleanup.service.js cron, but index helps)
CREATE INDEX IF NOT EXISTS idx_qr_codes_expires
  ON qr_codes (expires_at);

-- ── 5. FIX 1: Device key provisioning table ──────────────────────────────────
-- Stores the per-device HMAC key provisioned to each mobile device.
-- The key is derived from the master DEVICE_SECRET on the server and
-- sent to the device once at registration — stored in iOS Keychain /
-- Android Keystore on the client side.
CREATE TABLE IF NOT EXISTS device_keys (
  id          SERIAL PRIMARY KEY,
  user_id     INT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   VARCHAR(255) NOT NULL,
  device_key  VARCHAR(128) NOT NULL,   -- hex-encoded derived key
  created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMP   NULL,
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_keys_lookup
  ON device_keys (user_id, device_id)
  WHERE revoked_at IS NULL;

-- ── 6. Performance: index for leave reconciliation query ────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_user_status
  ON attendance_records (user_id, status, clock_in_time)
  WHERE status = 'ABSENT';

-- ── 7. Ensure login_attempts table exists with all required columns ──────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id             SERIAL PRIMARY KEY,
  user_id        INT REFERENCES users(id) ON DELETE SET NULL,
  email          VARCHAR(255) NOT NULL,
  ip_address     VARCHAR(45)  NULL,
  device_id      VARCHAR(255) NULL,
  user_agent     TEXT         NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'FAILED',
  failure_reason VARCHAR(50)  NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

ALTER TABLE login_attempts
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(50) NULL;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Run this migration with:
--   psql -U postgres -d alyah_smart_attendance -f 005_production_hardening.sql
