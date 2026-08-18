-- Migration 010: Data Integrity Hardening
-- Enforce 1 check-in per day at the database level to prevent race conditions.

-- We use a partial index to only enforce uniqueness on the date part of clock_in_time
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_user_day_unique 
ON attendance_records (user_id, (clock_in_time::date));

-- Add an index for geofencing queries performance if not exists
CREATE INDEX IF NOT EXISTS idx_offices_location ON offices (latitude, longitude) WHERE is_active = true;
