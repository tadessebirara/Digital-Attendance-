-- Migration 030: Fix holiday dates shifted by UTC+3 timezone offset.
--
-- Root cause: holiday rows were inserted with string dates like '2026-01-07'.
-- PostgreSQL stored them correctly as DATE values. However, when Node.js reads
-- them back as JavaScript Date objects, it applies the local UTC offset
-- (Ethiopia is UTC+3), making Jan 7 00:00 EAT appear as Jan 6 21:00 UTC.
-- The JS code then splits on 'T' and gets '2026-01-06' instead of '2026-01-07'.
--
-- Fix: use TO_CHAR(date,'YYYY-MM-DD') in all queries (already done in controller).
-- This migration ensures the recurring_month/recurring_day fields also match
-- the ACTUAL intended date (in case any were seeded incorrectly).
--
-- Additionally: remove duplicate non-recurring rows for years already covered
-- by the recurring rows for 2026.  Recurring rows handle 2026 automatically;
-- the non-recurring copies for 2025/2027/2028/2029/2030 from migration 022 are
-- the authoritative per-year entries and are correct — keep them.
--
-- The real duplicate issue was that is_recurring=TRUE rows had their `date`
-- column set to a 2026 value, so they appeared in BOTH the exact-date query
-- AND the recurring expansion for 2026.  Fix: set the `date` on recurring rows
-- to NULL-equivalent by using a sentinel far in the past (year 1) so they never
-- match the BETWEEN date range query, and are only picked up by the
-- is_recurring=TRUE path.

-- Step 1: For all is_recurring=TRUE rows, normalise the `date` field so it
-- stores the canonical first occurrence year as 2000 (sentinel).  This prevents
-- them from appearing in the BETWEEN range query for any real year.
UPDATE public_holidays
SET date = (
  '2000-' ||
  LPAD(recurring_month::text, 2, '0') || '-' ||
  LPAD(recurring_day::text,   2, '0')
)::date
WHERE is_recurring = TRUE
  AND recurring_month IS NOT NULL
  AND recurring_day   IS NOT NULL;

-- Step 2: Remove any accidental duplicates — exact date rows that share the
-- same (name, date) as another row (keeping the lower id).
DELETE FROM public_holidays
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY TO_CHAR(date,'YYYY-MM-DD'), name ORDER BY id) AS rn
    FROM public_holidays
  ) t
  WHERE rn > 1
);
