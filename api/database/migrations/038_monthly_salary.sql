-- Migration 038: Add monthly_salary column to users table
-- Required by salary.service.js, salary.controller.js, hr.controller.js, user.controller.js

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Also add working_time_type, working_days_per_week, working_hours_per_day
-- if not already present (queried by hr.controller and user.controller)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS working_time_type    VARCHAR(20)         NULL,
  ADD COLUMN IF NOT EXISTS working_days_per_week INTEGER            NULL,
  ADD COLUMN IF NOT EXISTS working_hours_per_day NUMERIC(4,1)      NULL;

-- Index for payroll queries (filter active employees by role)
CREATE INDEX IF NOT EXISTS idx_users_role_status_salary
  ON users (role, status)
  WHERE role = 'EMPLOYEE' AND status = 'ACTIVE';
