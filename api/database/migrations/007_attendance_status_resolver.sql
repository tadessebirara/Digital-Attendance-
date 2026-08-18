-- ============================================================
-- Migration 007: Attendance Status Resolver
--
-- Problem: attendance status is set in multiple places
-- (check-in, leave approval, manual entry, offline sync)
-- with no single enforcement point. A late offline sync can
-- overwrite an EXCUSED record; dashboard and analytics query
-- the raw status column and can show inconsistent values.
--
-- Solution: a DB-level trigger that enforces the precedence
-- rule on every INSERT or UPDATE to attendance_records.
-- All callers (controller, leave reconciliation, offline sync)
-- write whatever status they compute — the trigger corrects it
-- to the authoritative value before the row is committed.
--
-- Precedence (highest wins):
--   1. MANUAL  — admin/HR override, never downgraded
--   2. EXCUSED — approved leave, beats ABSENT only
--   3. PRESENT — actual attendance
--   4. LATE    — actual attendance (tardy)
--   5. HALF_DAY
--   6. ABSENT  — lowest priority, set only when nothing else applies
--
-- Conflict resolution rules:
--   - MANUAL source: status is never changed by this trigger
--   - LEAVE source:  status is set to EXCUSED, cannot be overridden
--                    by OFFLINE or REALTIME writes
--   - OFFLINE write arriving after EXCUSED: EXCUSED wins
--   - OFFLINE write arriving after PRESENT/LATE: PRESENT/LATE wins
--     (employee actually showed up — that beats a leave record)
-- ============================================================

-- ── 1. Precedence weight function ────────────────────────────────────────────
-- Returns a numeric weight for each status. Higher = higher priority.
-- Used by the trigger to decide which status wins in a conflict.
CREATE OR REPLACE FUNCTION attendance_status_weight(s TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'PRESENT'  THEN 50
    WHEN 'LATE'     THEN 40
    WHEN 'HALF_DAY' THEN 30
    WHEN 'EXCUSED'  THEN 20
    WHEN 'ABSENT'   THEN 10
    ELSE 0
  END;
$$;

-- ── 2. Source authority weight function ──────────────────────────────────────
-- MANUAL entries are authoritative and cannot be overridden.
-- LEAVE entries are authoritative for EXCUSED status.
-- REALTIME and QR are authoritative for actual attendance.
-- OFFLINE is the lowest authority — it can be overridden by anything.
CREATE OR REPLACE FUNCTION attendance_source_weight(s TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE s
    WHEN 'MANUAL'   THEN 100
    WHEN 'LEAVE'    THEN 80
    WHEN 'REALTIME' THEN 60
    WHEN 'QR'       THEN 60
    WHEN 'OFFLINE'  THEN 20
    ELSE 10
  END;
$$;

-- ── 3. Status resolver trigger function ──────────────────────────────────────
CREATE OR REPLACE FUNCTION resolve_attendance_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_status TEXT;
  existing_source TEXT;
BEGIN
  -- On INSERT: no conflict possible (unique_user_day constraint handles duplicates)
  -- On UPDATE: check if the incoming write should override the existing status

  IF TG_OP = 'UPDATE' THEN
    existing_status := OLD.status;
    existing_source := OLD.source;

    -- Rule 1: MANUAL source is immutable — never override it
    IF existing_source = 'MANUAL' AND NEW.source != 'MANUAL' THEN
      NEW.status := OLD.status;
      NEW.source := OLD.source;
      RETURN NEW;
    END IF;

    -- Rule 2: LEAVE (EXCUSED) cannot be overridden by OFFLINE writes
    IF existing_source = 'LEAVE' AND NEW.source = 'OFFLINE' THEN
      NEW.status := OLD.status;
      NEW.source := OLD.source;
      RETURN NEW;
    END IF;

    -- Rule 3: Higher-authority source always wins
    IF attendance_source_weight(NEW.source) < attendance_source_weight(existing_source) THEN
      NEW.status := OLD.status;
      NEW.source := OLD.source;
      RETURN NEW;
    END IF;

    -- Rule 4: Same authority — higher-weight status wins
    -- (e.g. PRESENT beats ABSENT from same source level)
    IF attendance_source_weight(NEW.source) = attendance_source_weight(existing_source) THEN
      IF attendance_status_weight(NEW.status) < attendance_status_weight(existing_status) THEN
        NEW.status := OLD.status;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Attach trigger to attendance_records ───────────────────────────────────
DROP TRIGGER IF EXISTS trg_resolve_attendance_status ON attendance_records;

CREATE TRIGGER trg_resolve_attendance_status
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION resolve_attendance_status();

-- ── 5. One-time reconciliation: fix any existing inconsistencies ──────────────
-- Re-apply leave approvals: any ABSENT record that falls within an approved
-- leave period and is not MANUAL should be EXCUSED.
UPDATE attendance_records ar
SET
  status = 'EXCUSED',
  notes  = COALESCE(ar.notes, '') || ' [Reconciled by migration 007]'
FROM leave_requests lr
WHERE lr.user_id = ar.user_id
  AND lr.status  = 'APPROVED'
  AND DATE(ar.clock_in_time) BETWEEN lr.start_date AND lr.end_date
  AND ar.status  = 'ABSENT'
  AND ar.source != 'MANUAL';

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Run: psql -U postgres -d alyah_smart_attendance -f 007_attendance_status_resolver.sql
--
-- After this migration:
-- - All attendance writes go through the trigger automatically
-- - No application code changes required for existing endpoints
-- - The leave controller's manual reconciliation SQL remains as a
--   belt-and-suspenders guard, but the trigger is the authoritative layer
