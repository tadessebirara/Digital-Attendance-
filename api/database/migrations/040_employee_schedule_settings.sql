-- Migration 040: employee_schedule_settings
-- Per-employee policy overrides: grace period, assigned office, GPS radius.
-- Referenced by attendance worker, schedule service, and office controller.

CREATE TABLE IF NOT EXISTS employee_schedule_settings (
  user_id          INTEGER      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  office_id        INTEGER      REFERENCES offices(id) ON DELETE SET NULL,
  grace_minutes    INTEGER      NOT NULL DEFAULT 15,
  gps_radius_meters INTEGER     DEFAULT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ess_office_id
  ON employee_schedule_settings(office_id)
  WHERE office_id IS NOT NULL;

COMMENT ON TABLE employee_schedule_settings IS
  'Per-employee policy overrides for grace period, office assignment, and GPS geofence radius.';
