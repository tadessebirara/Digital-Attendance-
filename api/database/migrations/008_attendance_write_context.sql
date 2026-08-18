-- ============================================================
-- Migration 008: Attendance Write Context + Resolution Lock
--              + Event Log
--
-- Extends migration 007 with:
--
-- 1. write_context column — distinguishes user actions from
--    system jobs so the trigger can apply different rules
--    depending on who is writing and why.
--
-- 2. resolution_locked column — marks records that have
--    reached their final resolved state. Automated batch
--    jobs (reconciliation, offline sync) cannot modify
--    locked records. Only ADMIN_CORRECTION can unlock.
--
-- 3. attendance_events table — append-only log of every
--    write attempt with its original intent. Provides the
--    event history layer without breaking the current state
--    model. Enables future event-sourcing migration.
--
-- write_context values:
--   USER_ACTION          — employee check-in/out, leave request
--   SYNC_REPLAY          — offline sync arriving late
--   SYSTEM_RECONCILIATION — automated batch job (leave approval, cron)
--   ADMIN_CORRECTION     — explicit admin/HR override
-- ============================================================

-- ── 1. Add write_context to attendance_records ────────────────────────────────
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS write_context TEXT NOT NULL DEFAULT 'USER_ACTION'
    CHECK (write_context IN (
      'USER_ACTION',
      'SYNC_REPLAY',
      'SYSTEM_RECONCILIATION',
      'ADMIN_CORRECTION'
    ));

-- ── 2. Add resolution_locked to attendance_records ───────────────────────────
-- When true: only ADMIN_CORRECTION write_context can modify this record.
-- Automated jobs (SYSTEM_RECONCILIATION, SYNC_REPLAY) are blocked.
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS resolution_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3. Create attendance_events append-only log ───────────────────────────────
-- Records every write attempt with its original intent.
-- Never updated or deleted — provides full event history.
CREATE TABLE IF NOT EXISTS attendance_events (
  id              BIGSERIAL    PRIMARY KEY,
  attendance_id   INT          REFERENCES attendance_records(id) ON DELETE SET NULL,
  user_id         INT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_date      DATE         NOT NULL,
  attempted_status TEXT        NOT NULL,
  attempted_source TEXT        NOT NULL,
  write_context   TEXT         NOT NULL,
  resolved_status TEXT         NOT NULL,  -- what the trigger actually kept
  resolution_reason TEXT       NULL,      -- why the trigger accepted or rejected
  actor_id        INT          NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_role      TEXT         NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_user_date
  ON attendance_events (user_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_events_attendance_id
  ON attendance_events (attendance_id);

-- ── 4. Replace trigger with write_context-aware version ──────────────────────
CREATE OR REPLACE FUNCTION resolve_attendance_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_status  TEXT;
  existing_source  TEXT;
  existing_locked  BOOLEAN;
  existing_context TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    existing_status  := OLD.status;
    existing_source  := OLD.source;
    existing_locked  := COALESCE(OLD.resolution_locked, FALSE);
    existing_context := COALESCE(OLD.write_context, 'USER_ACTION');

    -- ── Lock gate ─────────────────────────────────────────────────────────────
    -- A locked record can only be modified by ADMIN_CORRECTION.
    -- SYSTEM_RECONCILIATION and SYNC_REPLAY are blocked entirely.
    IF existing_locked = TRUE
       AND COALESCE(NEW.write_context, 'USER_ACTION') != 'ADMIN_CORRECTION' THEN
      -- Silently preserve existing values — do not error, do not corrupt
      NEW.status            := OLD.status;
      NEW.source            := OLD.source;
      NEW.write_context     := OLD.write_context;
      NEW.resolution_locked := OLD.resolution_locked;
      RETURN NEW;
    END IF;

    -- ── Rule 1: MANUAL / ADMIN_CORRECTION is immutable ───────────────────────
    IF (existing_source = 'MANUAL' OR existing_context = 'ADMIN_CORRECTION')
       AND COALESCE(NEW.write_context, 'USER_ACTION') != 'ADMIN_CORRECTION' THEN
      NEW.status        := OLD.status;
      NEW.source        := OLD.source;
      NEW.write_context := OLD.write_context;
      RETURN NEW;
    END IF;

    -- ── Rule 2: SYSTEM_RECONCILIATION cannot override LEAVE or MANUAL ─────────
    IF COALESCE(NEW.write_context, 'USER_ACTION') = 'SYSTEM_RECONCILIATION'
       AND existing_source IN ('MANUAL', 'LEAVE') THEN
      NEW.status        := OLD.status;
      NEW.source        := OLD.source;
      NEW.write_context := OLD.write_context;
      RETURN NEW;
    END IF;

    -- ── Rule 3: SYNC_REPLAY cannot override LEAVE, MANUAL, or REALTIME/QR ────
    IF COALESCE(NEW.write_context, 'USER_ACTION') = 'SYNC_REPLAY'
       AND existing_source IN ('MANUAL', 'LEAVE', 'REALTIME', 'QR') THEN
      NEW.status        := OLD.status;
      NEW.source        := OLD.source;
      NEW.write_context := OLD.write_context;
      RETURN NEW;
    END IF;

    -- ── Rule 4: Source authority comparison ───────────────────────────────────
    IF attendance_source_weight(NEW.source) < attendance_source_weight(existing_source) THEN
      NEW.status        := OLD.status;
      NEW.source        := OLD.source;
      NEW.write_context := OLD.write_context;
      RETURN NEW;
    END IF;

    -- ── Rule 5: Equal authority — higher status weight wins ───────────────────
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

-- Re-attach (DROP + CREATE to pick up new function body)
DROP TRIGGER IF EXISTS trg_resolve_attendance_status ON attendance_records;

CREATE TRIGGER trg_resolve_attendance_status
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION resolve_attendance_status();

-- ── 5. Backfill write_context for existing rows ───────────────────────────────
UPDATE attendance_records SET write_context = 'ADMIN_CORRECTION' WHERE source = 'MANUAL';
UPDATE attendance_records SET write_context = 'SYSTEM_RECONCILIATION' WHERE source = 'LEAVE';
UPDATE attendance_records SET write_context = 'SYNC_REPLAY'  WHERE source = 'OFFLINE';
UPDATE attendance_records SET write_context = 'USER_ACTION'
  WHERE source IN ('REALTIME', 'QR') AND write_context = 'USER_ACTION';

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Run: psql -U postgres -d alyah_smart_attendance -f 008_attendance_write_context.sql
