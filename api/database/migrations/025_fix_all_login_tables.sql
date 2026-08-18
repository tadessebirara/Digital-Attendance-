-- ============================================================
-- Migration 025: Fix all tables required for login to work
-- Adds missing columns to session_tracking, refresh_tokens,
-- creates login_attempts and security_alerts tables.
-- All statements are safe to re-run (IF NOT EXISTS / DO NOTHING).
-- ============================================================

-- ── 1. refresh_tokens — create if missing, add missing columns ────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id             SERIAL PRIMARY KEY,
  user_id        INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token          VARCHAR(255) UNIQUE NOT NULL,
  expires_at     TIMESTAMP    NOT NULL,
  ip_address     VARCHAR(45)  NULL,
  user_agent     TEXT         NULL,
  device_id      VARCHAR(255) NULL,
  session_id     UUID         NULL,
  revoked_at     TIMESTAMP    NULL,
  revoked_reason VARCHAR(50)  NULL,
  reuse_detected BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at     TIMESTAMP   NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(50) NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS reuse_detected BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_id     UUID        NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip_address     VARCHAR(45) NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent     TEXT        NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_id      VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens (token);

-- ── 2. session_tracking — add missing columns ─────────────────────────────────
ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP    NULL;
ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS device_id  VARCHAR(255) NULL;
ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS session_id UUID         NULL;
ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP    NULL;

-- ── 3. login_attempts — create if missing ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id             SERIAL PRIMARY KEY,
  user_id        INT          REFERENCES users(id) ON DELETE SET NULL,
  email          VARCHAR(255) NOT NULL,
  ip_address     VARCHAR(45)  NULL,
  device_id      VARCHAR(255) NULL,
  user_agent     TEXT         NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'FAILED',
  failure_reason VARCHAR(50)  NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);

ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(50) NULL;

CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id    ON login_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email      ON login_attempts (email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts (created_at);

-- ── 4. security_alerts — create if missing ────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_alerts (
  id          SERIAL PRIMARY KEY,
  user_id     INT          REFERENCES users(id) ON DELETE SET NULL,
  alert_type  VARCHAR(50)  NOT NULL,
  severity    VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM',
  title       VARCHAR(255) NOT NULL,
  message     TEXT         NOT NULL,
  metadata    JSONB        NULL,
  ip_address  VARCHAR(45)  NULL,
  device_id   VARCHAR(255) NULL,
  is_resolved BOOLEAN      NOT NULL DEFAULT FALSE,
  resolved_by INT          REFERENCES users(id),
  resolved_at TIMESTAMP    NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_user_id     ON security_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_security_alerts_is_resolved ON security_alerts (is_resolved);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at  ON security_alerts (created_at);

-- ── 5. notifications — add missing columns used in security.service ───────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(50)  NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity VARCHAR(20)  NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB        NULL;
