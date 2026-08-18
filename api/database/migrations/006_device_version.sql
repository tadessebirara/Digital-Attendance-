-- ============================================================
-- Migration 006: Device Version Enforcement
-- Adds device_version to user_devices so that key rotation and
-- admin revocation instantly close the race window where an
-- in-flight request with a stale device key could still pass
-- middleware after revocation.
--
-- Pattern mirrors token_version on users:
--   device_id + device_version must match what is embedded in
--   the device's stored credential. Middleware increments the
--   version on rotation/revocation; old credentials are rejected.
-- ============================================================

-- ── 1. Add device_version column to user_devices ─────────────────────────────
ALTER TABLE user_devices
  ADD COLUMN IF NOT EXISTS device_version INTEGER NOT NULL DEFAULT 0;

-- ── 2. Add index for fast middleware lookup ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_devices_version
  ON user_devices (user_id, device_id, device_version)
  WHERE status = 'APPROVED';

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Run: psql -U postgres -d alyah_smart_attendance -f 006_device_version.sql
