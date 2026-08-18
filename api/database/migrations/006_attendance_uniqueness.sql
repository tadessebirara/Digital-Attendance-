-- Ensure only one attendance record per user per day.
-- PostgreSQL cannot create a UNIQUE constraint directly on an expression,
-- so we deduplicate any existing rows first and then enforce the rule with
-- a unique expression index.

WITH ranked_records AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, DATE(clock_in_time)
      ORDER BY id
    ) AS row_num
  FROM attendance_records
)
DELETE FROM attendance_records
WHERE id IN (
  SELECT id
  FROM ranked_records
  WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_user_day_unique
ON attendance_records (user_id, (clock_in_time::date));
