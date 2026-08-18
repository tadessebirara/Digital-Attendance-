-- Mirror of database/migrations/015_employee_activation_email_verified.sql for backend-local migration runs.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS activation_requires_password BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN (
    'ACTIVE','INACTIVE','PENDING','LOCKED',
    'PENDING_APPROVAL','PENDING_ACTIVATION','REJECTED','LOCKED_ROLE','SUSPENDED'
  ));

CREATE INDEX IF NOT EXISTS idx_users_pending_activation
  ON users (status) WHERE status = 'PENDING_ACTIVATION';

CREATE INDEX IF NOT EXISTS idx_users_email_verified
  ON users (email_verified) WHERE role = 'EMPLOYEE';
