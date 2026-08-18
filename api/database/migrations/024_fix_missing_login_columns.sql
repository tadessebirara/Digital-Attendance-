-- Fix: add all columns required by the login query that may be missing
-- from databases created before migrations 008, 015, 016 ran.
-- All statements use IF NOT EXISTS / DO NOTHING so they are safe to re-run.

-- From 008_token_versioning
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1;

-- From 015_employee_activation_email_verified
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_requires_password BOOLEAN NOT NULL DEFAULT FALSE;

-- From 016_core_attendance_schedules  
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_device_id VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NULL;

-- Backfill: existing ACTIVE users already verified
UPDATE users SET email_verified = TRUE WHERE status = 'ACTIVE' AND email_verified = FALSE;

-- Widen the status constraint to include all statuses the app uses
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN (
    'ACTIVE','INACTIVE','PENDING','LOCKED',
    'PENDING_APPROVAL','PENDING_ACTIVATION','REJECTED','LOCKED_ROLE','SUSPENDED'
  ));
