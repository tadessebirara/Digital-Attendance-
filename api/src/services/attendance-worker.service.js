const { query } = require('../config/database');
const logger = require('../utils/logger');
const { WRITE_CONTEXT } = require('../utils/attendance-resolver');
const { getBusinessDateString, getBusinessDayOfWeek } = require('../utils/business-date');
const {
  loadSystemPolicy,
  isPublicHoliday,
  parseTimeOnDate,
  getShiftEndOnDate,
} = require('./schedule.service');
const socketService = require('./socket.service');

/**
 * Build schedule context from pre-fetched maps without any DB calls.
 * Replaces per-employee getScheduleContext() calls.
 */
function buildCtxFromMaps(userId, schedByUser, settByUser, policy, holidayCheck) {
  const day = schedByUser[userId] || null;
  const ess = settByUser[userId] || null;
  let isWorkingDay = day ? day.is_working_day !== false : true;
  let publicHolidayInfo = null;
  if (isWorkingDay && holidayCheck.isHoliday) {
    isWorkingDay = false;
    publicHolidayInfo = holidayCheck.holiday;
  }
  return {
    isWorkingDay,
    publicHoliday: publicHolidayInfo,
    workStartTime: (day?.work_start_time || '09:00:00').slice(0, 8),
    workEndTime: (day?.work_end_time || '17:00:00').slice(0, 8),
    graceMinutes: day?.grace_minutes ?? ess?.grace_minutes ?? day?.late_threshold_minutes ?? 15,
    halfDayAfterMinutes: ess?.half_day_after_minutes ?? policy.halfDayAfterMinutes,
    autoAbsentAfterMinutes: day?.auto_absent_after_minutes ?? ess?.auto_absent_after_minutes ?? policy.autoAbsentAfterMinutes,
    missedCheckoutAfterMinutes: ess?.missed_checkout_after_minutes ?? policy.missedCheckoutAfterMinutes,
    autoCheckoutEnabled: ess?.auto_checkout_enabled ?? policy.autoCheckoutEnabled,
    autoCheckoutGraceMinutes: ess?.auto_checkout_grace_minutes ?? policy.autoCheckoutGraceMinutes,
    overnightShift: day?.overnight_shift === true || ess?.overnight_shift === true,
  };
}

/**
 * Auto ABSENT, MISSED_CHECKOUT, and optional AUTO_CHECKOUT for active employees.
 * Runs every 5 minutes via cron.
 *
 * Logic:
 *  - AUTO ABSENT:   employee has no check-in AND now >= workStart + autoAbsentAfterMinutes
 *  - LATE status:   employee checked in after grace period → already set at check-in time by engine
 *  - MISSED CHECKOUT: employee checked in but no checkout AND now >= shiftEnd + missedCheckoutAfterMinutes
 *  - AUTO CHECKOUT: (if policy enabled) auto-close the record at shiftEnd + autoCheckoutGraceMinutes
 */
async function runAttendanceReconciliation(io) {
  const start = Date.now();
  let absentCount = 0;
  let missedCount = 0;
  let autoCheckoutCount = 0;

  try {
    const { rows: employees } = await query(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE role = 'EMPLOYEE' AND status = 'ACTIVE' AND email_verified = TRUE`
    );

    const now = new Date();
    const today = getBusinessDateString(now);

    // Batch load: system policy, holiday, all schedules, all settings — 4 queries total
    const [policy, holidayCheck] = await Promise.all([
      loadSystemPolicy(),
      isPublicHoliday(now),
    ]);

    const dayOfWeek2 = getBusinessDayOfWeek(now);

    const [{ rows: allSchedules }, { rows: allSettings }] = await Promise.all([
      query(`SELECT * FROM user_schedules WHERE day_of_week = $1`, [dayOfWeek2]),
      query(`SELECT * FROM employee_schedule_settings`),
    ]);

    // Build O(1) lookup maps
    const schedByUser = {};
    for (const s of allSchedules) schedByUser[s.user_id] = s;
    const settByUser = {};
    for (const s of allSettings) settByUser[s.user_id] = s;

    for (const emp of employees) {
      try {
        const ctx = buildCtxFromMaps(emp.id, schedByUser, settByUser, policy, holidayCheck);
        if (!ctx.isWorkingDay) continue;

        const workStart = parseTimeOnDate(ctx.workStartTime, now);
        // Absent fires exactly when the 5-minute late window closes (workStart + 5m)
        const absentDeadline    = new Date(workStart.getTime() + 5 * 60 * 1000);
        const shiftEnd          = getShiftEndOnDate(ctx, now);
        // Checkout window: shiftEnd → shiftEnd+2h. After that → ABSENT.
        const checkoutWindowEnd = new Date(shiftEnd.getTime() + 2 * 60 * 60 * 1000);
        const autoCheckoutDeadline = new Date(
          shiftEnd.getTime() + ctx.autoCheckoutGraceMinutes * 60000
        );

        const { rows: records } = await query(
          `SELECT * FROM attendance_records
           WHERE user_id = $1 AND DATE(clock_in_time) = $2::date
           ORDER BY id DESC LIMIT 1`,
          [emp.id, today]
        );
        const record = records[0] || null;

        // ── AUTO ABSENT ────────────────────────────────────────────────────
        if (!record && now >= absentDeadline) {
          // Skip if employee is on approved leave today
          const { rows: onLeave } = await query(
            `SELECT id FROM leave_requests
             WHERE user_id = $1 AND status = 'APPROVED'
               AND $2::date BETWEEN start_date AND end_date
             LIMIT 1`,
            [emp.id, today]
          );
          if (onLeave.length > 0) continue;

          const { rows: inserted } = await query(
            `INSERT INTO attendance_records
               (user_id, clock_in_time, status, source, write_context, notes, created_at)
             VALUES ($1, $2::timestamp, 'ABSENT', 'REALTIME', $3, $4, NOW())
             ON CONFLICT (user_id, (clock_in_time::date)) DO NOTHING
             RETURNING id`,
            [
              emp.id,
              `${today}T${ctx.workStartTime}`,
              WRITE_CONTEXT.SYSTEM_RECONCILIATION,
              '[Auto] No check-in before deadline',
            ]
          );

          if (inserted.length > 0) {
            absentCount += 1;
            const payload = {
              action: 'AUTO_ABSENT',
              userId: emp.id,
              userName: `${emp.first_name} ${emp.last_name}`,
              status: 'ABSENT',
              date: today,
              message: 'You have been marked absent — no check-in recorded.',
            };
            // Notify HR dashboard
            socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, payload);
            // Notify the employee directly so their app updates immediately
            socketService.emitToUser(emp.id, socketService.EVENTS.ATTENDANCE_UPDATE, payload);
            logger.info(`[AttendanceWorker] AUTO_ABSENT: user ${emp.id} (${emp.first_name} ${emp.last_name})`);
          }
          continue;
        }

        if (!record || !record.clock_in_time) continue;

        // ── ABSENT (missed checkout) ───────────────────────────────────────
        // Employee checked in but never checked out within the 2hr window.
        // After shiftEnd + 2hrs → mark ABSENT immediately (full absent day).
        const isAbsentPlaceholder =
          record.status === 'ABSENT' && record.source !== 'MANUAL';

        if (
          !isAbsentPlaceholder &&
          record.clock_in_time &&
          !record.clock_out_time &&
          now >= checkoutWindowEnd &&
          !['ABSENT', 'AUTO_CHECKOUT', 'CHECKED_OUT'].includes(record.status)
        ) {
          await query(
            `UPDATE attendance_records
             SET status       = 'ABSENT',
                 notes        = COALESCE(notes, '') || ' [Auto] Absent — checked in but never checked out',
                 write_context = $2,
                 updated_at   = NOW()
             WHERE id = $1`,
            [record.id, WRITE_CONTEXT.SYSTEM_RECONCILIATION]
          );
          missedCount += 1;

          const absentPayload = {
            action: 'ABSENT_NO_CHECKOUT',
            userId: emp.id,
            userName: `${emp.first_name} ${emp.last_name}`,
            recordId: record.id,
            status: 'ABSENT',
            message: 'You checked in but never checked out. This day is marked absent.',
          };
          socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, absentPayload);
          socketService.emitToUser(emp.id, socketService.EVENTS.ATTENDANCE_UPDATE, absentPayload);
          logger.info(`[AttendanceWorker] ABSENT_NO_CHECKOUT: user ${emp.id}, record ${record.id}`);
        }

        // ── AUTO CHECKOUT (optional admin policy) ─────────────────────────
        // Guard: never auto-checkout an ABSENT placeholder or a record already
        // marked ABSENT by the missed-checkout rule above.
        if (
          ctx.autoCheckoutEnabled &&
          !isAbsentPlaceholder &&
          record.clock_in_time &&
          !record.clock_out_time &&
          record.status !== 'ABSENT' &&
          now >= autoCheckoutDeadline
        ) {
          const checkInTime = new Date(record.clock_in_time);
          // Use shift end as checkout time (not now) for fair hours calculation
          const checkoutTime = shiftEnd > checkInTime ? shiftEnd : now;
          const hoursWorked = ((checkoutTime - checkInTime) / (1000 * 60 * 60)).toFixed(2);

          await query(
            `UPDATE attendance_records
             SET clock_out_time = $2,
                 hours_worked = $3,
                 status = 'AUTO_CHECKOUT',
                 notes = COALESCE(notes, '') || ' [Auto] System checkout at shift end',
                 write_context = $4,
                 updated_at = NOW()
             WHERE id = $1`,
            [record.id, checkoutTime, hoursWorked, WRITE_CONTEXT.SYSTEM_RECONCILIATION]
          );
          autoCheckoutCount += 1;

          const checkoutPayload = {
            action: 'AUTO_CHECKOUT',
            userId: emp.id,
            userName: `${emp.first_name} ${emp.last_name}`,
            recordId: record.id,
            clockOutTime: checkoutTime,
            hoursWorked: parseFloat(hoursWorked),
            message: 'You have been automatically checked out at shift end.',
          };
          socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, checkoutPayload);
          socketService.emitToUser(emp.id, socketService.EVENTS.ATTENDANCE_UPDATE, checkoutPayload);
          logger.info(`[AttendanceWorker] AUTO_CHECKOUT: user ${emp.id}, record ${record.id}, hours: ${hoursWorked}`);
        }
      } catch (empErr) {
        logger.error(`[AttendanceWorker] Error processing employee ${emp.id}:`, empErr.message);
        // Continue with next employee — don't let one failure stop the whole run
      }
    }

    logger.info(
      `[AttendanceWorker] Done in ${Date.now() - start}ms — absent: ${absentCount}, missed: ${missedCount}, autoCheckout: ${autoCheckoutCount}`
    );
  } catch (err) {
    logger.error('[AttendanceWorker] failed:', err.message);
  }
}

module.exports = { runAttendanceReconciliation };
