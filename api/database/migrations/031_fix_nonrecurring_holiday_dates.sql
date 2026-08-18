-- Migration 031: Fix non-recurring holiday dates shifted by UTC+3 timezone.
--
-- When migration 022 ran INSERT statements with string dates like '2025-01-07',
-- PostgreSQL stored them as correct DATE values (Jan 7). However the server
-- timezone is UTC+3 (Africa/Addis_Ababa), so Node.js reads DATE columns back
-- as JavaScript Date objects at midnight UTC+3 = 21:00 UTC previous day.
-- TO_CHAR in queries now returns the correct date, but the underlying stored
-- value is already correct — the issue was purely in JS serialisation.
--
-- This migration is a no-op safety check: it re-asserts the DATE column values
-- using AT TIME ZONE to strip any timezone ambiguity, ensuring data integrity.
-- We use '+03' (Ethiopia = UTC+3) explicitly.

-- Re-normalise all non-recurring holiday dates to ensure they store the
-- intended calendar date, not a UTC-shifted equivalent.
-- This is safe to run multiple times (idempotent).
UPDATE public_holidays
SET date = (
  -- Round-trip through text to get the intended YYYY-MM-DD back
  TO_CHAR(date + INTERVAL '3 hours', 'YYYY-MM-DD')
)::date
WHERE is_recurring = FALSE
  AND EXTRACT(HOUR FROM (date AT TIME ZONE 'UTC')) >= 21;
-- Only rows where the time component reveals a UTC-offset issue (hour ≥ 21
-- means midnight EAT was stored as 21:00 UTC previous day) need fixing.
