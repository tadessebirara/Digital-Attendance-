-- ============================================================
-- Migration 012: User Preferences & 2FA Settings
-- Adds a JSONB preferences column to users table so that
-- theme, language, notifications, 2FA, and biometric settings
-- are persisted in the database instead of only localStorage.
-- ============================================================

-- ── 1. Add preferences JSONB column to users ─────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 2. Add dedicated 2FA columns for proper security tracking ─
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS two_factor_method   VARCHAR(10) DEFAULT 'email'
    CHECK (two_factor_method IN ('sms', 'email', 'app')),
  ADD COLUMN IF NOT EXISTS biometric_enabled   BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3. Index for fast preference lookups ─────────────────────
CREATE INDEX IF NOT EXISTS idx_users_preferences ON users USING gin(preferences);

-- ── Done ─────────────────────────────────────────────────────
-- preferences JSONB stores: { theme, accentColor, fontSize, uiStyle, language, notifications }
-- two_factor_enabled / two_factor_method / biometric_enabled are first-class columns
-- because they affect authentication logic and need to be queryable.
