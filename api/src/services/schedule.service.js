const { query } = require('../config/database');
const {
  getBusinessDateString,
  getBusinessDayOfWeek,
  getBusinessParts,
} = require('../utils/business-date');

/**
 * Returns true if the given date is an Ethiopian public holiday.
 * Result is cached for the entire calendar day — holidays never change intraday.
 */

// Date-keyed cache: 'YYYY-MM-DD' → { isHoliday, holiday }
const _holidayCache = new Map();

async function isPublicHoliday(date) {
  const dateStr = getBusinessDateString(date);

  // Return cached result if available
  if (_holidayCache.has(dateStr)) return _holidayCache.get(dateStr);

  const { month, day } = getBusinessParts(date);
  const { rows } = await query(
    `SELECT id, name, name_am, type, religion, description
     FROM public_holidays
     WHERE (is_recurring = FALSE AND TO_CHAR(date, 'YYYY-MM-DD') = $1)
        OR (is_recurring = TRUE  AND recurring_month = $2 AND recurring_day = $3)
     LIMIT 1`,
    [dateStr, month, day]
  );

  const result = rows.length === 0
    ? { isHoliday: false }
    : {
        isHoliday: true,
        holiday: {
          name:        rows[0].name,
          nameAm:      rows[0].name_am,
          type:        rows[0].type,
          religion:    rows[0].religion,
          description: rows[0].description,
        },
      };

  // Cache and evict entries older than today (keep at most 7 days)
  _holidayCache.set(dateStr, result);
  if (_holidayCache.size > 7) {
    const oldest = [..._holidayCache.keys()].sort()[0];
    _holidayCache.delete(oldest);
  }

  return result;
}

/**
 * Returns all public holidays for a given month (YYYY-MM).
 * Uses TO_CHAR to avoid UTC timezone offset. Recurring rows have
 * sentinel year 2000 dates — matched via recurring_month only.
 */
async function getHolidaysForMonth(year, month) {
  // Non-recurring exact rows for this year+month
  const { rows: exact } = await query(
    `SELECT id, name, name_am, TO_CHAR(date, 'YYYY-MM-DD') AS date,
            type, religion, description
     FROM public_holidays
     WHERE is_recurring = FALSE
       AND EXTRACT(YEAR  FROM date) = $1
       AND EXTRACT(MONTH FROM date) = $2`,
    [year, month]
  );

  // Recurring rows that fall in this month
  const { rows: recurring } = await query(
    `SELECT id, name, name_am, recurring_month, recurring_day,
            type, religion, description
     FROM public_holidays
     WHERE is_recurring = TRUE AND recurring_month = $1`,
    [month]
  );

  const exactDates = new Set(exact.map(r => r.date));

  const allHolidays = [
    ...exact.map(r => ({ id: r.id, name: r.name, nameAm: r.name_am, date: r.date, type: r.type, religion: r.religion, description: r.description })),
    ...recurring
      .map(r => {
        const d = `${year}-${String(r.recurring_month).padStart(2,'0')}-${String(r.recurring_day).padStart(2,'0')}`;
        return { id: r.id, name: r.name, nameAm: r.name_am, date: d, type: r.type, religion: r.religion, description: r.description };
      })
      .filter(r => !exactDates.has(r.date)),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return allHolidays;
}

async function loadSystemPolicy() {
  const { rows } = await query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key IN (
       'half_day_after_minutes','auto_absent_after_minutes',
       'missed_checkout_after_minutes','auto_checkout_enabled','auto_checkout_grace_minutes',
       'geofence_lat','geofence_lng','geofence_radius_m'
     )`
  );
  const m = rows.reduce((a, r) => { a[r.setting_key] = r.setting_value; return a; }, {});
  return {
    halfDayAfterMinutes: parseInt(m.half_day_after_minutes || '120', 10),
    autoAbsentAfterMinutes: parseInt(m.auto_absent_after_minutes || '30', 10),
    missedCheckoutAfterMinutes: parseInt(m.missed_checkout_after_minutes || '60', 10),
    autoCheckoutEnabled: m.auto_checkout_enabled === 'true',
    autoCheckoutGraceMinutes: parseInt(m.auto_checkout_grace_minutes || '30', 10),
    geofenceLat: parseFloat(m.geofence_lat || '0'),
    geofenceLng: parseFloat(m.geofence_lng || '0'),
    geofenceRadiusM: parseInt(m.geofence_radius_m || '50', 10),
  };
}

/**
 * Effective schedule for a user on a given date.
 * Also checks Ethiopian public holidays — if today is a public holiday,
 * isWorkingDay is set to false regardless of the employee's schedule.
 */
async function getScheduleContext(userId, at = new Date()) {
  const dayOfWeek = getBusinessDayOfWeek(at);
  const policy    = await loadSystemPolicy();

  const { rows: settingsRows } = await query(
    `SELECT * FROM employee_schedule_settings WHERE user_id = $1`,
    [userId]
  );
  const ess = settingsRows[0] || null;

  const { rows: dayRows } = await query(
    `SELECT * FROM user_schedules WHERE user_id = $1 AND day_of_week = $2`,
    [userId, dayOfWeek]
  );
  const day = dayRows[0] || null;

  // Base working-day from schedule (Mon–Fri default if no row)
  let isWorkingDay = day ? day.is_working_day !== false : (dayOfWeek >= 1 && dayOfWeek <= 5);

  // Override: if today is an Ethiopian public holiday, not a working day
  let publicHolidayInfo = null;
  if (isWorkingDay) {
    const holidayCheck = await isPublicHoliday(at);
    if (holidayCheck.isHoliday) {
      isWorkingDay    = false;
      publicHolidayInfo = holidayCheck.holiday;
    }
  }

  const graceMinutes              = day?.grace_minutes ?? ess?.grace_minutes ?? day?.late_threshold_minutes ?? 15;
  const halfDayAfterMinutes       = ess?.half_day_after_minutes  ?? policy.halfDayAfterMinutes;
  const autoAbsentAfterMinutes    = day?.auto_absent_after_minutes ?? ess?.auto_absent_after_minutes ?? policy.autoAbsentAfterMinutes;
  const missedCheckoutAfterMinutes= ess?.missed_checkout_after_minutes ?? policy.missedCheckoutAfterMinutes;
  const autoCheckoutEnabled       = ess?.auto_checkout_enabled  ?? policy.autoCheckoutEnabled;
  const autoCheckoutGraceMinutes  = ess?.auto_checkout_grace_minutes ?? policy.autoCheckoutGraceMinutes;

  const workStartTime  = day?.work_start_time || '09:00:00';
  const workEndTime    = day?.work_end_time   || '17:00:00';
  const overnightShift = day?.overnight_shift === true || ess?.overnight_shift === true;

  const gpsRadiusMeters = day?.gps_radius_meters ?? ess?.gps_radius_meters ?? policy.geofenceRadiusM;
  const qrRequired      = day?.qr_required  ?? ess?.qr_required  ?? true;
  const gpsRequired     = day?.gps_required ?? ess?.gps_required ?? true;

  return {
    dayOfWeek,
    isWorkingDay,
    publicHoliday: publicHolidayInfo,   // null or { name, nameAm, type, religion, description }
    workStartTime: String(workStartTime).slice(0, 8),
    workEndTime:   String(workEndTime).slice(0, 8),
    graceMinutes,
    halfDayAfterMinutes,
    autoAbsentAfterMinutes,
    missedCheckoutAfterMinutes,
    autoCheckoutEnabled,
    autoCheckoutGraceMinutes,
    overnightShift,
    timezone: ess?.timezone || day?.timezone || 'UTC',
    qrRequired,
    gpsRequired,
    gpsRadiusMeters: gpsRadiusMeters || policy.geofenceRadiusM,
    officeId: ess?.office_id || null,
    allowCheckinWithoutCheckout: day?.allow_checkin_without_checkout === true || ess?.allow_checkin_without_checkout === true,
    policy,
  };
}

function parseTimeOnDate(timeStr, baseDate) {
  const [h, m, s = '0'] = String(timeStr).split(':');
  const d = new Date(baseDate);
  d.setHours(parseInt(h, 10), parseInt(m, 10), parseInt(s, 10), 0);
  return d;
}

/**
 * Compute check-in status.
 *
 * Rules:
 *   before workStart          → PRESENT
 *   workStart → workStart+5m  → LATE  (5-minute late window)
 *   after workStart+5m        → window closed (caller must block; cron marks ABSENT)
 *   not a working day         → OFF_DAY
 */
function computeCheckInStatus(now, ctx) {
  if (!ctx.isWorkingDay) {
    return { status: 'OFF_DAY', isLate: false, offDay: true, minutesLate: 0 };
  }

  const workStart  = parseTimeOnDate(ctx.workStartTime, now);
  // Hard 5-minute late window — no grace concept
  const lateWindowEnd = new Date(workStart.getTime() + 5 * 60 * 1000);

  if (now < workStart) {
    // Early / on time → PRESENT
    return { status: 'PRESENT', isLate: false, offDay: false, minutesLate: 0 };
  }

  if (now <= lateWindowEnd) {
    // Within the 5-minute late window → LATE
    const minutesLate = Math.max(1, Math.round((now.getTime() - workStart.getTime()) / 60000));
    return { status: 'LATE', isLate: true, offDay: false, minutesLate };
  }

  // Past the 5-minute window → check-in is closed; window has expired
  return { status: 'ABSENT', isLate: false, offDay: false, minutesLate: 0, windowClosed: true };
}

function getShiftEndOnDate(ctx, baseDate) {
  const end = parseTimeOnDate(ctx.workEndTime, baseDate);
  const start = parseTimeOnDate(ctx.workStartTime, baseDate);
  if (ctx.overnightShift && end <= start) {
    end.setDate(end.getDate() + 1);
  }
  return end;
}

module.exports = {
  getScheduleContext,
  computeCheckInStatus,
  parseTimeOnDate,
  getShiftEndOnDate,
  loadSystemPolicy,
  isPublicHoliday,
  getHolidaysForMonth,
  _holidayCache, // exported so holiday controller can bust it on changes
};
