-- Migration 028: Add off_type column to public_holidays
-- Allows HR to mark a holiday as FULL_DAY or HALF_DAY off.
-- FULL_DAY  — employees are fully off, no check-in required (default)
-- HALF_DAY  — employees work half day; check-in still possible/required

ALTER TABLE public_holidays
  ADD COLUMN IF NOT EXISTS off_type TEXT NOT NULL DEFAULT 'FULL_DAY'
    CHECK (off_type IN ('FULL_DAY', 'HALF_DAY'));

COMMENT ON COLUMN public_holidays.off_type IS
  'FULL_DAY = employees fully off (no attendance required). HALF_DAY = reduced schedule.';
