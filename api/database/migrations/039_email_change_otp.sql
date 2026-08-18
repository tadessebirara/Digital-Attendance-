-- Migration 039: email change OTP columns
-- Adds three columns to users table to support the 2-step email-change flow.
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_change_pending  TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_change_otp      VARCHAR(6)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_change_otp_exp  TIMESTAMPTZ DEFAULT NULL;

-- Index so we can quickly expire stale requests
CREATE INDEX IF NOT EXISTS idx_users_email_change_otp_exp
  ON users (email_change_otp_exp)
  WHERE email_change_otp_exp IS NOT NULL;

COMMENT ON COLUMN users.email_change_pending IS 'New email address awaiting OTP verification';
COMMENT ON COLUMN users.email_change_otp     IS '6-digit OTP sent to the new email';
COMMENT ON COLUMN users.email_change_otp_exp IS 'OTP expiry timestamp (15 min window)';
