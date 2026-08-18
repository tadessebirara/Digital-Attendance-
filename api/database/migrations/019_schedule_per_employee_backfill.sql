-- Migration 019: Per-employee schedule fixes
-- 1. Ensure user_schedules has a unique constraint on (user_id, day_of_week) for ON CONFLICT upsert
-- 2. Add grace_minutes column if somehow missing
-- 3. Back-fill grace_minutes from late_threshold_minutes where NULL
-- 4. Insert default Mon-Fri 09:00-17:00 schedule for ACTIVE employees with no schedule rows
-- 5. Insert employee_schedule_settings row for every employee that has schedule rows but no settings row

-- Ensure unique constraint exists (safe — uses IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_schedules_user_id_day_of_week_key'
      AND conrelid = 'user_schedules'::regclass
  ) THEN
    ALTER TABLE user_schedules ADD CONSTRAINT user_schedules_user_id_day_of_week_key
      UNIQUE (user_id, day_of_week);
  END IF;
END $$;

-- Ensure grace_minutes column exists
ALTER TABLE user_schedules ADD COLUMN IF NOT EXISTS grace_minutes INT;

-- Back-fill grace_minutes from late_threshold_minutes
UPDATE user_schedules
SET grace_minutes = COALESCE(grace_minutes, late_threshold_minutes, 15)
WHERE grace_minutes IS NULL;

-- Insert default schedule (Mon-Fri 09:00-17:00) for ACTIVE/PENDING employees with zero schedule rows
INSERT INTO user_schedules
  (user_id, day_of_week, work_start_time, work_end_time,
   late_threshold_minutes, grace_minutes, is_working_day, schedule_type, created_at, updated_at)
SELECT
  u.id,
  d.dow,
  '09:00:00',
  '17:00:00',
  15,
  15,
  d.dow BETWEEN 1 AND 5,   -- Mon(1)–Fri(5) = working, Sun(0)/Sat(6) = off
  'REGULAR',
  NOW(),
  NOW()
FROM users u
CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) AS d(dow)
WHERE u.role = 'EMPLOYEE'
  AND NOT EXISTS (
    SELECT 1 FROM user_schedules us WHERE us.user_id = u.id
  )
ON CONFLICT (user_id, day_of_week) DO NOTHING;

-- Insert employee_schedule_settings for employees that have schedule rows but no settings row
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_schedule_settings') THEN
    INSERT INTO employee_schedule_settings (user_id, grace_minutes, updated_at)
    SELECT DISTINCT us.user_id, COALESCE(MIN(us.grace_minutes), 15), NOW()
    FROM user_schedules us
    WHERE NOT EXISTS (
      SELECT 1 FROM employee_schedule_settings ess WHERE ess.user_id = us.user_id
    )
    GROUP BY us.user_id
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END$$;
