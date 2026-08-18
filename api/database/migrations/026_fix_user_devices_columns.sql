-- ============================================================
-- Migration 026: Add missing user_devices columns used by login
-- ============================================================

ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_hash   VARCHAR(255) NULL;
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_os     VARCHAR(100) NULL;
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_type   VARCHAR(50)  NULL DEFAULT 'mobile';
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS last_used     TIMESTAMP    NULL;
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS is_trusted    BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_version INTEGER     NOT NULL DEFAULT 0;

-- also ensure verified_at column exists on device_otp (used in registration flow)
ALTER TABLE device_otp ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL;
