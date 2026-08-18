-- Migration 022: Complete Ethiopian Holiday Coverage + Default Schedules

-- 1. Add exact-date companion rows for 2025, 2027, 2028
--    (recurring rows only have 2026 dates, these cover other years)

INSERT INTO public_holidays (name, date, type, religion, is_recurring, description)
VALUES
  ('Ethiopian Christmas',    '2025-01-07', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Christmas - January 7'),
  ('Timkat',                 '2025-01-19', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Epiphany - January 19'),
  ('Adwa Victory Day',       '2025-03-02', 'NATIONAL', NULL,        FALSE, 'Victory of Adwa - March 2'),
  ('Ethiopian Patriots Day', '2025-04-23', 'NATIONAL', NULL,        FALSE, 'Patriots Day - April 23'),
  ('International Labour Day','2025-05-01','NATIONAL', NULL,        FALSE, 'Labour Day - May 1'),
  ('Liberation Day',         '2025-05-05', 'NATIONAL', NULL,        FALSE, 'Liberation Day - May 5'),
  ('Downfall of the Derg',   '2025-05-28', 'NATIONAL', NULL,        FALSE, 'Fall of the Derg - May 28'),
  ('Ethiopian New Year',     '2025-09-11', 'NATIONAL', NULL,        FALSE, 'Enkutatash - New Year 2025'),
  ('Meskel',                 '2025-09-27', 'NATIONAL', 'CHRISTIAN', FALSE, 'Finding of the True Cross - September 27'),

  ('Ethiopian Christmas',    '2027-01-07', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Christmas - January 7'),
  ('Timkat',                 '2027-01-19', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Epiphany - January 19'),
  ('Adwa Victory Day',       '2027-03-02', 'NATIONAL', NULL,        FALSE, 'Victory of Adwa - March 2'),
  ('Ethiopian Patriots Day', '2027-04-23', 'NATIONAL', NULL,        FALSE, 'Patriots Day - April 23'),
  ('International Labour Day','2027-05-01','NATIONAL', NULL,        FALSE, 'Labour Day - May 1'),
  ('Liberation Day',         '2027-05-05', 'NATIONAL', NULL,        FALSE, 'Liberation Day - May 5'),
  ('Downfall of the Derg',   '2027-05-28', 'NATIONAL', NULL,        FALSE, 'Fall of the Derg - May 28'),
  ('Ethiopian New Year',     '2027-09-11', 'NATIONAL', NULL,        FALSE, 'Enkutatash - New Year 2027'),
  ('Meskel',                 '2027-09-27', 'NATIONAL', 'CHRISTIAN', FALSE, 'Finding of the True Cross - September 27'),

  ('Ethiopian Christmas',    '2028-01-07', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Christmas - January 7'),
  ('Timkat',                 '2028-01-19', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Epiphany - January 19'),
  ('Adwa Victory Day',       '2028-03-02', 'NATIONAL', NULL,        FALSE, 'Victory of Adwa - March 2'),
  ('Ethiopian Patriots Day', '2028-04-23', 'NATIONAL', NULL,        FALSE, 'Patriots Day - April 23'),
  ('International Labour Day','2028-05-01','NATIONAL', NULL,        FALSE, 'Labour Day - May 1'),
  ('Liberation Day',         '2028-05-05', 'NATIONAL', NULL,        FALSE, 'Liberation Day - May 5'),
  ('Downfall of the Derg',   '2028-05-28', 'NATIONAL', NULL,        FALSE, 'Fall of the Derg - May 28'),
  ('Ethiopian New Year',     '2028-09-12', 'NATIONAL', NULL,        FALSE, 'Enkutatash - New Year 2028 (leap year: Sep 12)'),
  ('Meskel',                 '2028-09-27', 'NATIONAL', 'CHRISTIAN', FALSE, 'Finding of the True Cross - September 27'),

  ('Ethiopian Christmas',    '2029-01-07', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Christmas - January 7'),
  ('Timkat',                 '2029-01-19', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Epiphany - January 19'),
  ('Adwa Victory Day',       '2029-03-02', 'NATIONAL', NULL,        FALSE, 'Victory of Adwa - March 2'),
  ('Ethiopian Patriots Day', '2029-04-23', 'NATIONAL', NULL,        FALSE, 'Patriots Day - April 23'),
  ('International Labour Day','2029-05-01','NATIONAL', NULL,        FALSE, 'Labour Day - May 1'),
  ('Liberation Day',         '2029-05-05', 'NATIONAL', NULL,        FALSE, 'Liberation Day - May 5'),
  ('Downfall of the Derg',   '2029-05-28', 'NATIONAL', NULL,        FALSE, 'Fall of the Derg - May 28'),
  ('Ethiopian New Year',     '2029-09-11', 'NATIONAL', NULL,        FALSE, 'Enkutatash - New Year 2029'),
  ('Meskel',                 '2029-09-27', 'NATIONAL', 'CHRISTIAN', FALSE, 'Finding of the True Cross - September 27'),

  ('Ethiopian Christmas',    '2030-01-07', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Orthodox Christmas - January 7'),
  ('Timkat',                 '2030-01-19', 'NATIONAL', 'CHRISTIAN', FALSE, 'Ethiopian Epiphany - January 19'),
  ('Adwa Victory Day',       '2030-03-02', 'NATIONAL', NULL,        FALSE, 'Victory of Adwa - March 2'),
  ('Ethiopian Patriots Day', '2030-04-23', 'NATIONAL', NULL,        FALSE, 'Patriots Day - April 23'),
  ('International Labour Day','2030-05-01','NATIONAL', NULL,        FALSE, 'Labour Day - May 1'),
  ('Liberation Day',         '2030-05-05', 'NATIONAL', NULL,        FALSE, 'Liberation Day - May 5'),
  ('Downfall of the Derg',   '2030-05-28', 'NATIONAL', NULL,        FALSE, 'Fall of the Derg - May 28'),
  ('Ethiopian New Year',     '2030-09-11', 'NATIONAL', NULL,        FALSE, 'Enkutatash - New Year 2030'),
  ('Meskel',                 '2030-09-27', 'NATIONAL', 'CHRISTIAN', FALSE, 'Finding of the True Cross - September 27')
ON CONFLICT (date) DO NOTHING;

-- 2. Seed system_settings default schedule values
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES
  ('default_work_days',     '1,2,3,4,5,6', 'Default working days: Mon-Sat. Sunday (0) is off.'),
  ('default_work_start',    '08:30',        'Default shift start time HH:MM'),
  ('default_work_end',      '17:30',        'Default shift end time HH:MM'),
  ('default_grace_minutes', '15',           'Default grace period in minutes before late')
ON CONFLICT (setting_key) DO NOTHING;

-- 3. Back-fill user_schedules for employees who have no schedule rows
--    Mon(1)-Sat(6) = working, Sun(0) = non-working
DO $$
DECLARE
  emp RECORD;
  d   INT;
BEGIN
  FOR emp IN
    SELECT id FROM users
    WHERE role = 'EMPLOYEE'
      AND status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM user_schedules WHERE user_id = users.id LIMIT 1
      )
  LOOP
    FOR d IN 0..6 LOOP
      INSERT INTO user_schedules (
        user_id, day_of_week, is_working_day,
        work_start_time, work_end_time, grace_minutes,
        created_at, updated_at
      )
      VALUES (
        emp.id,
        d,
        CASE WHEN d = 0 THEN FALSE ELSE TRUE END,
        '08:30:00',
        '17:30:00',
        15,
        NOW(), NOW()
      )
      ON CONFLICT (user_id, day_of_week) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;
