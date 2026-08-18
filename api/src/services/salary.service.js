/**
 * salary.service.js
 *
 * Core payroll engine for Alyah Smart Attendance.
 *
 * Rules:
 *  - ABSENT      → full absence penalty
 *  - HALF_DAY    → 50% of absence penalty
 *  - LATE        → late penalty calculated from minutes late AFTER grace period
 *  - PRESENT / EXCUSED / AUTO_CHECKOUT / MISSED_CHECKOUT (where checked in)
 *               → no absence deduction; LATE minutes handled separately
 *  - Approved leave days → no deductions at all
 *  - Net salary can never be below 0
 *
 * Late minutes formula:
 *   late_minutes = check_in_time − (shift_start + grace_minutes)
 *   Never counts grace minutes as late.
 */

const { query } = require('../config/database');

// ── Load penalty config from system_settings ──────────────────────────────────
async function loadPenaltyConfig() {
  const keys = [
    'penalty_absence_unit',
    'penalty_absence_type',
    'penalty_absence_value',
    'penalty_late_unit',
    'penalty_late_type',
    'penalty_late_value',
  ];
  const { rows } = await query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key = ANY($1::text[])`,
    [keys]
  );
  const m = rows.reduce((a, r) => { a[r.setting_key] = r.setting_value; return a; }, {});
  return {
    absenceUnit:  m.penalty_absence_unit  || 'PER_DAY',    // PER_DAY | PER_ABSENCE_RECORD
    absenceType:  m.penalty_absence_type  || 'FIXED',       // FIXED | PERCENTAGE
    absenceValue: parseFloat(m.penalty_absence_value || '0'),
    lateUnit:     m.penalty_late_unit     || 'PER_MINUTE',  // PER_MINUTE | PER_HOUR
    lateType:     m.penalty_late_type     || 'FIXED',       // FIXED | PERCENTAGE
    lateValue:    parseFloat(m.penalty_late_value || '0'),
  };
}

/**
 * Calculate absence deduction for a single record.
 * @param {'ABSENT'|'HALF_DAY'} status
 * @param {number} baseSalary
 * @param {object} cfg  — from loadPenaltyConfig()
 */
function calcAbsenceDeduction(status, baseSalary, cfg) {
  if (cfg.absenceValue === 0) return 0;

  let rawDeduction = 0;
  if (cfg.absenceType === 'FIXED') {
    rawDeduction = cfg.absenceValue;
  } else {
    // PERCENTAGE — of monthly base salary
    rawDeduction = (baseSalary * cfg.absenceValue) / 100;
  }

  if (status === 'HALF_DAY') rawDeduction = rawDeduction / 2;
  return rawDeduction;
}

/**
 * Calculate late deduction for a single late check-in.
 * @param {number} lateMinutes  — minutes AFTER grace period
 * @param {number} baseSalary
 * @param {object} cfg
 */
function calcLateDeduction(lateMinutes, baseSalary, cfg) {
  if (lateMinutes <= 0 || cfg.lateValue === 0) return 0;

  // Convert lateMinutes to the configured unit
  const lateUnits = cfg.lateUnit === 'PER_HOUR'
    ? lateMinutes / 60
    : lateMinutes; // PER_MINUTE

  let rawDeduction = 0;
  if (cfg.lateType === 'FIXED') {
    rawDeduction = lateUnits * cfg.lateValue;
  } else {
    // PERCENTAGE per unit of the monthly salary
    rawDeduction = lateUnits * ((baseSalary * cfg.lateValue) / 100);
  }
  return rawDeduction;
}

/**
 * Compute late minutes for a single attendance record.
 * Returns 0 if status is not LATE or HALF_DAY (HALF_DAY can also have late minutes).
 *
 * @param {object} record      — attendance_records row with clock_in_time
 * @param {number} graceMin    — grace period in minutes (from user_schedules)
 * @param {string} shiftStart  — 'HH:MM:SS' or 'HH:MM'
 */
function computeLateMinutes(record, graceMin, shiftStart) {
  if (!record.clock_in_time) return 0;
  if (!['LATE', 'HALF_DAY'].includes(record.status)) return 0;

  const checkIn = new Date(record.clock_in_time);

  // Build the grace-end timestamp on the same calendar day as check-in
  const [h, m] = String(shiftStart).split(':');
  const shiftStartDt = new Date(checkIn);
  shiftStartDt.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  const graceEndDt = new Date(shiftStartDt.getTime() + graceMin * 60000);

  const lateMs = checkIn.getTime() - graceEndDt.getTime();
  return lateMs > 0 ? Math.ceil(lateMs / 60000) : 0;
}

/**
 * Main payroll calculation for one employee for a given month.
 *
 * @param {number} userId
 * @param {number} year
 * @param {number} month  — 1-based (1 = January)
 * @returns {object}
 */
async function calculateEmployeeSalary(userId, year, month) {
  // Date range for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

  // Load employee base salary
  const { rows: userRows } = await query(
    `SELECT id, first_name, last_name, employee_id, department, position,
            monthly_salary, email
     FROM users WHERE id = $1`,
    [userId]
  );
  if (userRows.length === 0) throw Object.assign(new Error('Employee not found'), { code: 'NOT_FOUND' });
  const user = userRows[0];
  const baseSalary = parseFloat(user.monthly_salary || '0');

  // Load penalty config
  const cfg = await loadPenaltyConfig();

  // Load attendance records for the month (excluding EXCUSED & HOLIDAY-sourced records)
  const { rows: records } = await query(
    `SELECT ar.*, us.grace_minutes, us.work_start_time
     FROM attendance_records ar
     LEFT JOIN user_schedules us
       ON us.user_id = ar.user_id
      AND us.day_of_week = EXTRACT(DOW FROM ar.clock_in_time)::int
     WHERE ar.user_id = $1
       AND DATE(ar.clock_in_time) BETWEEN $2 AND $3
       AND ar.status NOT IN ('EXCUSED')
       AND ar.source != 'LEAVE'
     ORDER BY ar.clock_in_time`,
    [userId, startDate, endDate]
  );

  // Also collect approved leave days so we skip them
  const { rows: leaveRows } = await query(
    `SELECT start_date, end_date FROM leave_requests
     WHERE user_id = $1 AND status = 'APPROVED'
       AND (start_date <= $3 AND end_date >= $2)`,
    [userId, startDate, endDate]
  );

  // Build a set of approved-leave dates for fast lookup
  const leaveDates = new Set();
  for (const lr of leaveRows) {
    const cur = new Date(lr.start_date);
    const end = new Date(lr.end_date);
    while (cur <= end) {
      leaveDates.add(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  let absentDays    = 0;
  let halfDays      = 0;
  let lateDays      = 0;
  let totalLateMin  = 0;
  let absenceDeduction = 0;
  let lateDeduction    = 0;

  const breakdown = [];

  for (const rec of records) {
    const recDate = rec.clock_in_time
      ? new Date(rec.clock_in_time).toISOString().split('T')[0]
      : null;

    // Skip if on approved leave
    if (recDate && leaveDates.has(recDate)) continue;
    // Skip EXCUSED at record level (belt-and-suspenders)
    if (rec.status === 'EXCUSED') continue;

    if (rec.status === 'ABSENT') {
      absentDays++;
      const ded = calcAbsenceDeduction('ABSENT', baseSalary, cfg);
      absenceDeduction += ded;
      breakdown.push({ date: recDate, status: 'ABSENT', lateMinutes: 0, absenceDeduction: ded, lateDeduction: 0 });
    } else if (rec.status === 'HALF_DAY') {
      halfDays++;
      const ded = calcAbsenceDeduction('HALF_DAY', baseSalary, cfg);
      absenceDeduction += ded;

      // Also compute any late minutes for the half-day record
      const graceMin = parseInt(rec.grace_minutes || '15', 10);
      const shiftStart = rec.work_start_time || '09:00';
      const latMin = computeLateMinutes(rec, graceMin, shiftStart);
      totalLateMin += latMin;
      const latDed = calcLateDeduction(latMin, baseSalary, cfg);
      lateDeduction += latDed;

      breakdown.push({ date: recDate, status: 'HALF_DAY', lateMinutes: latMin, absenceDeduction: ded, lateDeduction: latDed });
    } else if (rec.status === 'LATE') {
      lateDays++;
      const graceMin = parseInt(rec.grace_minutes || '15', 10);
      const shiftStart = rec.work_start_time || '09:00';
      const latMin = computeLateMinutes(rec, graceMin, shiftStart);
      totalLateMin += latMin;
      const latDed = calcLateDeduction(latMin, baseSalary, cfg);
      lateDeduction += latDed;
      breakdown.push({ date: recDate, status: 'LATE', lateMinutes: latMin, absenceDeduction: 0, lateDeduction: latDed });
    }
    // PRESENT, AUTO_CHECKOUT, MISSED_CHECKOUT → no penalty
  }

  // Net salary: never below 0
  const totalDeductions = absenceDeduction + lateDeduction;
  const netSalary = Math.max(0, baseSalary - totalDeductions);

  return {
    userId,
    employeeId: user.employee_id,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name} ${user.last_name}`,
    department: user.department,
    position: user.position,
    year,
    month,
    baseSalary,
    absentDays,
    halfDays,
    lateDays,
    totalLateMinutes: totalLateMin,
    absenceDeduction: Math.round(absenceDeduction * 100) / 100,
    lateDeduction:    Math.round(lateDeduction * 100) / 100,
    totalDeductions:  Math.round(totalDeductions * 100) / 100,
    netSalary:        Math.round(netSalary * 100) / 100,
    breakdown,
    penaltyConfig: cfg,
  };
}

/**
 * Payroll summary for ALL active employees for a given month.
 */
async function calculateMonthlySalaryReport(year, month) {
  const { rows: employees } = await query(
    `SELECT id FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIVE' ORDER BY first_name`
  );

  const results = [];
  for (const emp of employees) {
    try {
      const r = await calculateEmployeeSalary(emp.id, year, month);
      results.push(r);
    } catch (e) {
      // Skip employees with errors (e.g. no schedule)
    }
  }
  return results;
}

module.exports = {
  loadPenaltyConfig,
  calcAbsenceDeduction,
  calcLateDeduction,
  computeLateMinutes,
  calculateEmployeeSalary,
  calculateMonthlySalaryReport,
};
