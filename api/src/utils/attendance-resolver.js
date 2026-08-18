/**
 * Attendance Status Resolver
 *
 * This file is the single authoritative definition of attendance precedence
 * rules in application code. The DB trigger (migrations 007 + 008) implements
 * the same rules — if you change weights here, update the migration too.
 *
 * Design principle: the DB trigger is the enforcement layer (cannot be
 * bypassed). This module is the documentation + pre-validation + test layer.
 * Loading rules from a live DB table was considered and rejected: rules that
 * can change at runtime without a deployment are a correctness risk for a
 * state machine. Rules are versioned with the codebase instead.
 *
 * RULES_VERSION must be incremented whenever weights or logic change.
 * The DB trigger does not read this value — it is for human audit only.
 */

const RULES_VERSION = 2; // increment when weights or logic change

// ── Status precedence ─────────────────────────────────────────────────────────
// Higher number = higher priority. Matches attendance_status_weight() in DB.
const STATUS_WEIGHT = {
  PRESENT:  50,
  LATE:     40,
  HALF_DAY: 30,
  EXCUSED:  20,
  ABSENT:   10,
};

// ── Source authority ──────────────────────────────────────────────────────────
// Higher number = higher authority. Matches attendance_source_weight() in DB.
const SOURCE_WEIGHT = {
  MANUAL:   100,
  LEAVE:    80,
  REALTIME: 60,
  QR:       60,
  OFFLINE:  20,
};

// ── Write context ─────────────────────────────────────────────────────────────
// Describes the intent of a write. Used by the trigger to apply context-aware
// rules (e.g. SYSTEM_RECONCILIATION cannot override MANUAL).
const WRITE_CONTEXT = {
  USER_ACTION:           'USER_ACTION',           // employee check-in/out
  SYNC_REPLAY:           'SYNC_REPLAY',           // offline sync arriving late
  SYSTEM_RECONCILIATION: 'SYSTEM_RECONCILIATION', // automated batch job
  ADMIN_CORRECTION:      'ADMIN_CORRECTION',      // explicit admin/HR override
};

// ── Context → default source mapping ─────────────────────────────────────────
// When a caller sets write_context, this is the expected source value.
// Mismatches are not errors but are logged as warnings.
const CONTEXT_SOURCE_MAP = {
  USER_ACTION:           ['REALTIME', 'QR'],
  SYNC_REPLAY:           ['OFFLINE'],
  SYSTEM_RECONCILIATION: ['LEAVE'],
  ADMIN_CORRECTION:      ['MANUAL'],
};

/**
 * Resolve which attendance record wins when two records conflict.
 * Mirrors the DB trigger logic exactly — same rules, same order.
 *
 * @param {object} incoming  - { status, source, write_context?, resolution_locked? }
 * @param {object} existing  - { status, source, write_context?, resolution_locked? }
 * @returns {{ status, source, write_context, winner: 'incoming'|'existing', reason: string }}
 */
function resolveAttendanceConflict(incoming, existing) {
  const incomingCtx = incoming.write_context || WRITE_CONTEXT.USER_ACTION;
  const existingCtx = existing.write_context || WRITE_CONTEXT.USER_ACTION;

  // Lock gate: locked records only yield to ADMIN_CORRECTION
  if (existing.resolution_locked && incomingCtx !== WRITE_CONTEXT.ADMIN_CORRECTION) {
    return {
      ...existing,
      winner: 'existing',
      reason: 'Record is resolution-locked — only ADMIN_CORRECTION can modify it',
    };
  }

  // Rule 1: MANUAL / ADMIN_CORRECTION is immutable
  if (
    (existing.source === 'MANUAL' || existingCtx === WRITE_CONTEXT.ADMIN_CORRECTION) &&
    incomingCtx !== WRITE_CONTEXT.ADMIN_CORRECTION
  ) {
    return {
      ...existing,
      winner: 'existing',
      reason: 'Existing record is an admin correction — cannot be overridden',
    };
  }

  // Rule 2: SYSTEM_RECONCILIATION cannot override LEAVE or MANUAL
  if (
    incomingCtx === WRITE_CONTEXT.SYSTEM_RECONCILIATION &&
    ['MANUAL', 'LEAVE'].includes(existing.source)
  ) {
    return {
      ...existing,
      winner: 'existing',
      reason: `SYSTEM_RECONCILIATION cannot override source "${existing.source}"`,
    };
  }

  // Rule 3: SYNC_REPLAY cannot override LEAVE, MANUAL, REALTIME, or QR
  if (
    incomingCtx === WRITE_CONTEXT.SYNC_REPLAY &&
    ['MANUAL', 'LEAVE', 'REALTIME', 'QR'].includes(existing.source)
  ) {
    return {
      ...existing,
      winner: 'existing',
      reason: `SYNC_REPLAY cannot override source "${existing.source}"`,
    };
  }

  // Rule 4: Higher source authority wins
  const incomingSourceW = SOURCE_WEIGHT[incoming.source] ?? 0;
  const existingSourceW = SOURCE_WEIGHT[existing.source] ?? 0;

  if (incomingSourceW < existingSourceW) {
    return {
      ...existing,
      winner: 'existing',
      reason: `Source "${existing.source}" (${existingSourceW}) outranks "${incoming.source}" (${incomingSourceW})`,
    };
  }

  // Rule 5: Equal authority — higher status weight wins
  if (incomingSourceW === existingSourceW) {
    const incomingStatusW = STATUS_WEIGHT[incoming.status] ?? 0;
    const existingStatusW = STATUS_WEIGHT[existing.status] ?? 0;

    if (incomingStatusW < existingStatusW) {
      return {
        ...existing,
        winner: 'existing',
        reason: `Status "${existing.status}" (${existingStatusW}) outranks "${incoming.status}" (${incomingStatusW}) at equal source authority`,
      };
    }
  }

  return {
    ...incoming,
    write_context: incomingCtx,
    winner: 'incoming',
    reason: `Incoming (context "${incomingCtx}", source "${incoming.source}", status "${incoming.status}") takes precedence`,
  };
}

/**
 * Returns a human-readable label for a status, suitable for reports.
 */
function statusLabel(status) {
  return {
    PRESENT:  'Present',
    LATE:     'Late',
    HALF_DAY: 'Half Day',
    EXCUSED:  'Excused (Leave)',
    ABSENT:   'Absent',
  }[status] || status;
}

/**
 * Returns true if `incoming` would override `existing` under the precedence rules.
 */
function wouldOverride(incoming, existing) {
  return resolveAttendanceConflict(incoming, existing).winner === 'incoming';
}

/**
 * Returns the correct write_context for a given source and actor role.
 * Use this when building the write payload to ensure context is consistent.
 */
function inferWriteContext(source, actorRole) {
  if (source === 'MANUAL' || actorRole === 'ADMIN' || actorRole === 'HR') {
    return WRITE_CONTEXT.ADMIN_CORRECTION;
  }
  if (source === 'OFFLINE') return WRITE_CONTEXT.SYNC_REPLAY;
  if (source === 'LEAVE')   return WRITE_CONTEXT.SYSTEM_RECONCILIATION;
  return WRITE_CONTEXT.USER_ACTION;
}

module.exports = {
  RULES_VERSION,
  STATUS_WEIGHT,
  SOURCE_WEIGHT,
  WRITE_CONTEXT,
  CONTEXT_SOURCE_MAP,
  resolveAttendanceConflict,
  statusLabel,
  wouldOverride,
  inferWriteContext,
};
