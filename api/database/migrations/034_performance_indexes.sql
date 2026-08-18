-- Compound index for schedule worker + check-in hot path
-- user_schedules is queried with WHERE user_id = $1 AND day_of_week = $2 thousands of times/day
CREATE INDEX IF NOT EXISTS idx_user_schedules_user_dow
ON user_schedules (user_id, day_of_week);

-- Drop the duplicate functional index (keeps the raw timestamp index which covers date queries too)
DROP INDEX IF EXISTS idx_attendance_user_date_trunc;
