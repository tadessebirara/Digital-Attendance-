-- Migration 020: Add early_leave_minutes column to attendance_records
-- Stores how many minutes before shift end an employee checked out.
-- 0 = on time or overtime. NULL = not yet checked out.

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS early_leave_minutes INTEGER DEFAULT NULL;

-- Back-fill from notes for existing records (best-effort regex parse)
UPDATE attendance_records
   SET early_leave_minutes = (
     REGEXP_MATCH(notes, '\[Early leave: (\d+)min')
   )[1]::INTEGER
 WHERE notes LIKE '%Early leave:%'
   AND early_leave_minutes IS NULL;
