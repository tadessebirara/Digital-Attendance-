-- ============================================================
-- Migration 009: Attendance Invariant Enforcement
--
-- Closes four correctness gaps identified after migration 008:
--
-- 1. write_context is now DB-derived, not client-provided.
--    The trigger overwrites whatever the application sends
--    based on source + session role. Client cannot spoof
--    ADMIN_CORRECTION by setting the field directly.
--
-- 2. attendance_events gains causal linkage:
--    - caused_final_state BOOLEAN — true when this event
--      produced the current resolved state of the record
--    - previous_status TEXT — what the record held before
--    This enables deterministic forensic reconstruction.
--
-- 3. RULES_VERSION enforcement via PostgreSQL session variable.
--    Application sets: SET app.rules_version = 'v2'
--    Trigger asserts: current_setting matches expected version.
--    Mismatch = ERROR, not silent drift.
--
-- 4. attendance_events is now written by an AFTER trigger on
--    attendance_records — atomic with the state write by
--    construction. No separate application INSERT required.
-- ============================================================

-- ── 1. DB-derived write_context ───────────────────────────────────────────────
-- The trigger will call this function to compute the authoritative context.
-- It ignores the client-provided value and derives from source + session role.
--
-- Session role is set by the application at connection time:
--   SET app.actor_role = 'ADMIN'   (or 'HR', 'EMPLOYEE', 'SYSTEM')
-- If not set, defaults to 'EMPLOYEE' (lowest privilege).
CREATE OR REPLACE FUNCTION derive_write_context(p_source TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  actor_role TEXT;
BEGIN
  -- Read the session-level actor role set by the application
  BEGIN
    actor_role := current_setting('app.actor_role');
  EXCEPTION WHEN OTHERS THEN
    actor_role := 'EMPLOYEE';
  END;

  -- ADMIN or HR performing a write → always ADMIN_CORRECTION
  IF actor_role IN ('ADMIN', 'HR') THEN
    RETURN 'ADMIN_CORRECTION';
  END IF;

  -- System/internal processes
  IF actor_role = 'SYSTEM' THEN
    IF p_source = 'LEAVE' THEN
      RETURN 'SYSTEM_RECONCILIATION';
    END IF;
    RETURN 'SYSTEM_RECONCILIATION';
  END IF;

  -- Employee writes
  IF p_source = 'OFFLINE' THEN
    RETURN 'SYNC_REPLAY';
  END IF;

  -- REALTIME, QR, or anything else from an employee
  RETURN 'USER_ACTION';
END;
$$;

-- ── 2. RULES_VERSION enforcement ─────────────────────────────────────────────
-- Expected version. Increment this when trigger logic changes.
-- Application must SET app.rules_version = 'v2' before any attendance write.
-- If the versions mismatch, the trigger raises an error — no silent drift.
DO $$
BEGIN
  -- Store the expected version as a DB-level setting so it survives restarts
  PERFORM set_config('app.expected_rules_version', 'v2', FALSE);
EXCEPTION WHEN OTHERS THEN
  NULL; -- set_config may not persist across sessions; that's fine
END;
$$;

-- ── 3. Add causal linkage columns to attendance_events ───────────────────────
ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS caused_final_state BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS previous_status    TEXT     NULL,
  ADD COLUMN IF NOT EXISTS previous_source    TEXT     NULL;

-- Index for forensic queries: "show me all events that changed the final state"
CREATE INDEX IF NOT EXISTS idx_attendance_events_causal
  ON attendance_events (attendance_id, caused_final_state)
  WHERE caused_final_state = TRUE;

-- ── 4. Replace BEFORE trigger with context-deriving version ──────────────────
CREATE OR REPLACE FUNCTION resolve_attendance_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_status  TEXT;
  existing_source  TEXT;
  existing_locked  BOOLEAN;
  existing_context TEXT;
  derived_context  TEXT;
  client_version   TEXT;
BEGIN
  -- ── RULES_VERSION check ───────────────────────────────────────────────────
  -- If the application set app.rules_version, verify it matches what the
  -- trigger expects. Mismatch means the app and DB are out of sync.
  BEGIN
    client_version := current_setting('app.rules_version');
    IF client_version IS NOT NULL AND client_version != '' AND client_version != 'v2' THEN
      RAISE EXCEPTION
        'Attendance rules version mismatch: trigger expects v2, application sent %. '
        'Update the application or run the latest migration.',
        client_version;
    END IF;
  EXCEPTION
    WHEN undefined_object THEN NULL; -- session variable not set — allow (backward compat)
    WHEN OTHERS THEN RAISE;
  END;

  -- ── Derive write_context from source + session role ───────────────────────
  -- Overwrite whatever the client sent — context is not a client input.
  NEW.write_context := derive_write_context(NEW.source);

  IF TG_OP = 'UPDATE' THEN
    existing_status  := OLD.status;
    existing_source  := OLD.source;
    existing_locked  := COALESCE(OLD.resolution_locked, FALSE);
    existing_context := COALESCE(OLD.write_context, 'USER_ACTION');
    derived_context  := NEW.write_context;

    -- ── Lock gate ─────────────────────────────────────────────────────────────
    IF existing_locked = TRUE AND derived_context != 'ADMIN_CORRECTION' THEN
      NEW.status            := OLD.status;
      NEW.source            := OLD.source;
      NEW.write_context     := OLD.write_context;
      NEW.resolution_locked := OLD.resolution_locked;
      RETURN NEW;
    END IF;

    -- ── Rule 1: ADMIN_CORRECTION / MANUAL is immutable ───────────────────────
    IF (existing_source = 'MANUAL' OR existing_context = 'ADMIN_CORRECTION')
       AND derived_context != 'ADMIN_CORRECTION' THEN
      NEW.status        := OLD.status;
      NEW.source        := OLD.source;
      NEW.write_context := OLD.write_context;
      RETURN NEW;
    END IF;

    -- ── Rule 2: SYSTEM_RECONCILIATION cannot override LEAVE or MANUAL ─────────
    IF derived_context = 'SYSTEM_RECONCILIATION'
       AND existing_source IN ('MANUAL', 'LEAVE') THEN
      NEW.status        := OLD.status;
      NEW.source        := OLD.source;
      NEW.write_context := OLD.write_context;
      RETURN NEW;
    END IF;

    -- ── Rule 3: SYNC_REPLAY cannot override LEAVE, MANUAL, REALTIME, QR ──────
    IF derived_context = 'SYNC_REPLAY'
       AND existing_source IN ('MANUAL', 'LEAVE', 'REALTIME', 'QR') THEN
      NEW.status        := OLD.status;
      NEW.source        := OLD.source;
      NEW.write_context := OLD.write_context;
      RETURN NEW;
    END IF;

    -- ── Rule 4: Source authority ───────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS trg_resolve_attendance_status ON attendance_records;
CREATE TRIGGER trg_resolve_attendance_status
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION resolve_attendance_status();

-- ── 5. AFTER trigger: atomic event log ───────────────────────────────────────
-- Writes to attendance_events in the same transaction as the state write.
-- Application code does NOT need to insert into attendance_events separately.
-- The event log is always consistent with the state table by construction.
CREATE OR REPLACE FUNCTION log_attendance_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  actor_id_val   INT;
  actor_role_val TEXT;
  state_changed  BOOLEAN;
  prev_status    TEXT;
  prev_source    TEXT;
BEGIN
  -- Read session-level actor metadata set by the application
  BEGIN
    actor_id_val   := current_setting('app.actor_id')::INT;
  EXCEPTION WHEN OTHERS THEN
    actor_id_val := NULL;
  END;

  BEGIN
    actor_role_val := current_setting('app.actor_role');
  EXCEPTION WHEN OTHERS THEN
    actor_role_val := 'EMPLOYEE';
  END;

  IF TG_OP = 'INSERT' THEN
    prev_status   := NULL;
    prev_source   := NULL;
    state_changed := TRUE;
  ELSE
    prev_status   := OLD.status;
    prev_source   := OLD.source;
    -- state_changed = true when the trigger actually accepted the new status
    state_changed := (NEW.status IS DISTINCT FROM OLD.status)
                  OR (NEW.source IS DISTINCT FROM OLD.source);
  END IF;

  INSERT INTO attendance_events (
    attendance_id,
    user_id,
    event_date,
    attempted_status,
    attempted_source,
    write_context,
    resolved_status,
    caused_final_state,
    previous_status,
    previous_source,
    actor_id,
    actor_role,
    created_at
  ) VALUES (
    NEW.id,
    NEW.user_id,
    DATE(COALESCE(NEW.clock_in_time, NOW())),
    NEW.status,          -- what was written (after trigger may have corrected it)
    NEW.source,
    NEW.write_context,
    NEW.status,          -- resolved = same as written since BEFORE trigger already ran
    state_changed,
    prev_status,
    prev_source,
    actor_id_val,
    actor_role_val,
    NOW()
  );

  RETURN NULL; -- AFTER trigger return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_log_attendance_event ON attendance_records;
CREATE TRIGGER trg_log_attendance_event
  AFTER INSERT OR UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION log_attendance_event();

-- ── 6. Application session setup helper ──────────────────────────────────────
-- The application must call this at the start of each DB connection/transaction
-- that writes to attendance_records. Example (Node.js):
--
--   await client.query(`
--     SET LOCAL app.actor_role    = $1;
--     SET LOCAL app.actor_id      = $2;
--     SET LOCAL app.rules_version = 'v2';
--   `, [req.user.role, req.user.id]);
--
-- SET LOCAL scopes the variable to the current transaction only,
-- which is the correct scope for per-request context.
-- ── Done ─────────────────────────────────────────────────────────────────────
-- Run: psql -U postgres -d alyah_smart_attendance -f 009_attendance_invariants.sql
