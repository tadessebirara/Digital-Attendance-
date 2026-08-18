-- Migration 012: Runtime schema alignment
-- Brings long-lived local databases in sync with the backend code paths.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE user_devices
  ADD COLUMN IF NOT EXISTS platform VARCHAR(50),
  ADD COLUMN IF NOT EXISTS os_version VARCHAR(50),
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS device_version INTEGER NOT NULL DEFAULT 0;

-- Safe back-fill — use only columns we just added or know exist
UPDATE user_devices
SET
  platform = COALESCE(platform, 'unknown'),
  os_version = COALESCE(os_version, 'unknown'),
  registered_at = COALESCE(registered_at, NOW())
WHERE
  platform IS NULL
  OR os_version IS NULL
  OR registered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_devices_version
ON user_devices (user_id, device_id, device_version)
WHERE status = 'APPROVED';

CREATE TABLE IF NOT EXISTS device_keys (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  device_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP NULL,
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_keys_lookup
ON device_keys (user_id, device_id)
WHERE revoked_at IS NULL;

-- Create refresh_tokens if not exists (may have been created in 001 on some deployments)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  device_id VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  reuse_detected BOOLEAN NOT NULL DEFAULT FALSE,
  session_id UUID NULL,
  revoked_reason VARCHAR(50) NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens (token);

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS reuse_detected BOOLEAN NOT NULL DEFAULT FALSE;

-- device_otp table (created here if not already in initial schema)
CREATE TABLE IF NOT EXISTS device_otp (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  otp_code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE device_otp
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
