const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { WRITE_CONTEXT } = require('../utils/attendance-resolver');
const { getBusinessDateString } = require('../utils/business-date');
const { logAttendanceSecurityEvent } = require('./attendance-security.service');
const {
  getScheduleContext,
  computeCheckInStatus,
  getShiftEndOnDate,
  parseTimeOnDate,
} = require('./schedule.service');

// ── Haversine distance (metres) ───────────────────────────────────────────────
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Load attendance config from system_settings ───────────────────────────────
async function loadAttendanceConfig() {
  const { rows } = await query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key IN (
       'qr_secret','qr_enabled','qr_attendance_password_hash','qr_password_version',
       'geofence_lat','geofence_lng','geofence_radius_m','gps_accuracy_max_m'
     )`
  );
  return rows.reduce((a, r) => { a[r.setting_key] = r.setting_value; return a; }, {});
}

function getQrSecret(cfg) {
  return (cfg.qr_secret && cfg.qr_secret.trim().length > 0)
    ? cfg.qr_secret
    : (process.env.QR_SECRET || process.env.DEVICE_SECRET || '');
}

// ── Employee eligibility ──────────────────────────────────────────────────────
async function assertEmployeeEligible(userId) {
  const { rows } = await query(
    `SELECT id, role, status, email_verified FROM users WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0)
    return { ok: false, code: 'USER_NOT_FOUND', error: 'User not found.', status: 404 };
  const u = rows[0];
  if (u.role !== 'EMPLOYEE')
    return { ok: true, user: u };                             // admin/HR skip GPS+device
  if (u.status !== 'ACTIVE')
    return { ok: false, code: 'ACCOUNT_NOT_ACTIVE',
             error: `Account is ${String(u.status).toLowerCase().replace(/_/g, ' ')}.`, status: 403 };
  if (u.email_verified !== true)
    return { ok: false, code: 'EMAIL_NOT_VERIFIED',
             error: 'Verify your email before using attendance.', status: 403 };
  return { ok: true, user: u };
}

// ── Today's record ────────────────────────────────────────────────────────────
async function getTodayRecord(userId, dateStr = null) {
  const today = dateStr || getBusinessDateString();
  const { rows } = await query(
    `SELECT * FROM attendance_records
     WHERE user_id = $1 AND DATE(clock_in_time) = $2::date
     ORDER BY id DESC LIMIT 1`,
    [userId, today]
  );
  return { record: rows[0] || null, today };
}

// ── GPS / Geofence validation ─────────────────────────────────────────────────
// Priority: per-employee assigned office → nearest active office (auto-detect) → system_settings global.
// Accepts optional ctx (already-loaded schedule context) to avoid a second DB round-trip.
async function validateGeofence({ userId, latitude, longitude, req, deviceId, gpsAccuracyM, ctx, cfgMap: preloadedCfg }) {
  if (latitude == null || longitude == null)
    return { ok: false, code: 'GPS_REQUIRED', error: 'GPS coordinates required for attendance.' };

  // Load schedule context if not already provided
  const schedCtx = ctx || await require('./schedule.service').getScheduleContext(userId);

  // Respect per-employee gps_required flag
  if (schedCtx.gpsRequired === false)
    return { ok: true, distanceM: null, gpsSkipped: true };

  // Reuse pre-loaded config if passed (avoids duplicate DB hit from QR path)
  const cfgMap = preloadedCfg || await loadAttendanceConfig();
  const globalMaxAccuracy = parseInt(cfgMap.gps_accuracy_max_m || '100', 10);

  // Reject if the GPS fix is too inaccurate to be usable at all
  // (use the global max as a coarse gate before per-office checks)
  if (gpsAccuracyM != null && gpsAccuracyM > globalMaxAccuracy * 2) {
    await logAttendanceSecurityEvent({
      userId, deviceId,
      eventType: 'GPS_LOW_ACCURACY', severity: 'MEDIUM',
      reason: `GPS accuracy ${Math.round(gpsAccuracyM)}m exceeds max ${globalMaxAccuracy * 2}m`,
      metadata: { accuracyM: Math.round(gpsAccuracyM), maxAccuracyM: globalMaxAccuracy * 2, latitude, longitude },
      ip: req?.ip, latitude, longitude, app: req?.app,
    });
    return {
      ok: false,
      code: 'GPS_LOW_ACCURACY',
      error: `GPS accuracy too low (${Math.round(gpsAccuracyM)}m). Move to a more open area and try again.`,
      accuracyM: Math.round(gpsAccuracyM),
    };
  }

  // ── Determine which office(s) to check against ────────────────────────────
  // If employee has a specific office assigned, use ONLY that office.
  // Otherwise, check ALL active offices and see if the employee is inside any of them.
  let officesToCheck = [];

  if (schedCtx.officeId) {
    // Specific office assigned — enforce that exact office
    const { rows } = await query(
      `SELECT id, name, latitude, longitude,
              COALESCE(radius_meters, 200) AS radius_meters,
              COALESCE(gps_accuracy_max_m, 100) AS gps_accuracy_max_m
       FROM offices WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [schedCtx.officeId]
    );
    if (rows.length > 0) officesToCheck = rows;
  }

  if (officesToCheck.length === 0) {
    // No specific office or assigned office was deleted — check all active offices
    // Exclude placeholder offices (lat=0, lng=0 means "not configured yet")
    const { rows } = await query(
      `SELECT id, name, latitude, longitude,
              COALESCE(radius_meters, 200) AS radius_meters,
              COALESCE(gps_accuracy_max_m, 100) AS gps_accuracy_max_m
       FROM offices
       WHERE is_active = TRUE
         AND NOT (latitude = 0 AND longitude = 0)
       ORDER BY id`
    );
    officesToCheck = rows;
  }

  // If no offices configured at all, fall back to system_settings global geofence
  if (officesToCheck.length === 0) {
    const targetLat = parseFloat(cfgMap.geofence_lat || '0');
    const targetLng = parseFloat(cfgMap.geofence_lng || '0');
    const radius    = schedCtx.gpsRadiusMeters || parseInt(cfgMap.geofence_radius_m || '100', 10);

    if (targetLat === 0 && targetLng === 0)
      return { ok: true, distanceM: null, noGeofence: true };

    const dist = getDistance(latitude, longitude, targetLat, targetLng);
    // Apply accuracy compensation using global max
    const accuracyComp = gpsAccuracyM != null ? Math.min(gpsAccuracyM, globalMaxAccuracy / 2) : 0;
    const effectiveDist = Math.max(0, dist - accuracyComp);
    if (effectiveDist <= radius)
      return { ok: true, distanceM: Math.round(dist), officeId: null };

    await logAttendanceSecurityEvent({
      userId, deviceId, eventType: 'GEOFENCE_VIOLATION', severity: 'HIGH',
      reason: 'Employee outside allowed GPS radius (global fallback)',
      metadata: { distanceM: Math.round(dist), effectiveDistM: Math.round(effectiveDist), allowedM: radius, latitude, longitude },
      ip: req?.ip, latitude, longitude, app: req?.app,
    });
    return {
      ok: false, code: 'GEOFENCE_VIOLATION',
      error: `You are outside the office area (${Math.round(dist)}m away, max ${radius}m).`,
      distanceM: Math.round(dist),
    };
  }

  // Check each office — pass if inside any one of them
  let closestDist = Infinity;
  let closestOffice = null;
  for (const office of officesToCheck) {
    const dist = getDistance(
      latitude, longitude,
      parseFloat(office.latitude), parseFloat(office.longitude)
    );
    if (dist < closestDist) {
      closestDist = dist;
      closestOffice = office;
    }
    const radius = schedCtx.officeId
      ? (schedCtx.gpsRadiusMeters || parseInt(office.radius_meters, 10))
      : parseInt(office.radius_meters, 10);

    // Use this office's own GPS accuracy threshold (falls back to global if not set)
    const officeMaxAccuracy = parseInt(office.gps_accuracy_max_m || cfgMap.gps_accuracy_max_m || '100', 10);

    // Reject if GPS is too inaccurate for this specific office
    if (gpsAccuracyM != null && gpsAccuracyM > officeMaxAccuracy) continue; // skip — too inaccurate for this office

    // Apply accuracy compensation — employee gets benefit of the doubt at boundary
    const accuracyComp = gpsAccuracyM != null
      ? Math.min(gpsAccuracyM, officeMaxAccuracy / 2)
      : 0;
    const effectiveDist = Math.max(0, dist - accuracyComp);
    if (effectiveDist <= radius) {
      return { ok: true, distanceM: Math.round(dist), officeId: office.id, officeName: office.name };
    }
  }

  // Outside all offices
  const closestRadius = schedCtx.officeId
    ? (schedCtx.gpsRadiusMeters || parseInt(closestOffice.radius_meters, 10))
    : parseInt(closestOffice.radius_meters, 10);

  // Use effective distance in the error message
  const closestOfficeMaxAcc = parseInt(closestOffice?.gps_accuracy_max_m || cfgMap.gps_accuracy_max_m || '100', 10);
  const closestComp = gpsAccuracyM != null ? Math.min(gpsAccuracyM, closestOfficeMaxAcc / 2) : 0;
  const closestEffective = Math.max(0, closestDist - closestComp);

  await logAttendanceSecurityEvent({
    userId, deviceId, eventType: 'GEOFENCE_VIOLATION', severity: 'HIGH',
    reason: `Employee outside all office areas. Closest: ${closestOffice.name}`,
    metadata: {
      distanceM: Math.round(closestDist),
      effectiveDistM: Math.round(closestEffective),
      allowedM: closestRadius,
      closestOffice: closestOffice.name,
      latitude, longitude,
    },
    ip: req?.ip, latitude, longitude, app: req?.app,
  });
  return {
    ok: false,
    code: 'GEOFENCE_VIOLATION',
    error: `You are outside the office area. Closest office: ${closestOffice.name} (${Math.round(closestDist)}m away, max ${closestRadius}m).`,
    distanceM: Math.round(closestDist),
    closestOfficeName: closestOffice.name,
  };
}

// ── In-process QR scan rate limiter ──────────────────────────────────────────
// Prevents the same user from scanning QR more than once every 5 seconds.
// This blocks rapid replay attacks (e.g. screenshot + rescan loop).
// Uses a simple Map — low memory footprint, auto-cleaned each minute.
const _qrScanMap = new Map(); // userId → last scan timestamp
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, v] of _qrScanMap.entries()) if (v < cutoff) _qrScanMap.delete(k);
}, 60_000).unref();

function checkQrScanRateLimit(userId) {
  const last = _qrScanMap.get(userId);
  const now  = Date.now();
  if (last && (now - last) < 5_000)
    return { ok: false, code: 'QR_TOO_FAST',
             error: 'Please wait a moment before scanning again.', status: 429 };
  _qrScanMap.set(userId, now);
  return { ok: true };
}

// ── QR signature verification ─────────────────────────────────────────────────
// The QR token is: { type:"static-attendance", officeId, sig }
// Each office has a UNIQUE derived secret = HMAC(masterSecret, "office:{officeId}")
// sig = HMAC-SHA256(officeSecret, "static:attendance:{officeId}")
// This prevents Office A's QR from being used at Office B.
function verifyStaticQrSignature(qrData, cfgMap) {
  let parsed;
  try {
    parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
  } catch {
    return { ok: false, code: 'QR_INVALID_FORMAT', error: 'Invalid QR code format. Scan the office QR code.' };
  }

  if (parsed.type !== 'static-attendance') {
    return { ok: false, code: 'QR_WRONG_TYPE', error: 'Wrong QR type. Scan the office attendance QR.' };
  }

  const officeId = parsed.officeId || 'default';
  const masterSecret = getQrSecret(cfgMap);

  if (!masterSecret) {
    return { ok: false, code: 'QR_NOT_CONFIGURED',
             error: 'QR not set up. Admin must set a QR password in System Settings.' };
  }

  // Derive the office-specific secret from the master secret
  const officeSecret = crypto
    .createHmac('sha256', masterSecret)
    .update(`office:${officeId}`)
    .digest('hex');

  const expected = crypto
    .createHmac('sha256', officeSecret)
    .update(`static:attendance:${officeId}`)
    .digest('hex');

  let sigMatch = false;
  try {
    const a = Buffer.from(parsed.sig || '', 'hex');
    const b = Buffer.from(expected, 'hex');
    sigMatch = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    sigMatch = false;
  }

  if (!sigMatch) {
    return { ok: false, code: 'QR_INVALID_SIG',
             error: 'QR code is invalid or outdated. Admin must reprint after changing the password.' };
  }
  return { ok: true, officeId, parsed };
}

// ── Device validation ─────────────────────────────────────────────────────────
async function validateDeviceForAttendance(userId, deviceId) {
  if (!deviceId)
    return { ok: false, code: 'DEVICE_REQUIRED', error: 'Device ID required.', status: 400 };
  const { rows } = await query(
    'SELECT status FROM user_devices WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  );
  if (rows.length === 0)
    return { ok: false, code: 'DEVICE_NOT_REGISTERED', error: 'Device not registered. Contact HR.', status: 403 };
  if (rows[0].status !== 'APPROVED')
    return { ok: false, code: 'DEVICE_NOT_APPROVED',
             error: `Device is ${rows[0].status.toLowerCase()}. Contact HR.`, status: 403 };
  return { ok: true };
}

// ── Check-In ──────────────────────────────────────────────────────────────────
async function performCheckIn({
  userId, userRole, latitude, longitude,
  notes, deviceId, source, req, clientTime, gpsAccuracyM,
  checkinOfficeId = null, checkinOfficeName = null,
}) {
  const now = clientTime ? new Date(clientTime) : new Date();

  // Run eligibility check + schedule context in parallel — independent DB calls
  const [elig, ctx] = await Promise.all([
    assertEmployeeEligible(userId),
    getScheduleContext(userId, now),
  ]);
  if (!elig.ok) return elig;

  if (elig.user.role === 'EMPLOYEE') {
    const geo = await validateGeofence({ userId, latitude, longitude, req, deviceId, gpsAccuracyM, ctx });
    if (!geo.ok) return { ok: false, ...geo, status: 403 };
    // Use pre-resolved office (from QR path) or the one detected by geofence
    if (!checkinOfficeId)   checkinOfficeId   = geo.officeId   ?? null;
    if (!checkinOfficeName) checkinOfficeName = geo.officeName ?? null;
  }

  // 3. QR required? If this check-in did NOT come from the QR path (source !== 'QR')
  //    and the employee's schedule requires QR, reject the GPS-only attempt.
  //    Admin/HR manual entries are exempt from the QR requirement.
  if (
    elig.user.role === 'EMPLOYEE' &&
    ctx.qrRequired &&
    source !== 'QR' &&
    userRole !== 'ADMIN' && userRole !== 'HR'
  ) {
    return {
      ok: false,
      code: 'QR_REQUIRED',
      error: 'QR scan is required for attendance. Please scan the office QR code.',
      status: 403,
    };
  }

  // 5. Working day?
  if (elig.user.role === 'EMPLOYEE' && !ctx.isWorkingDay)
    return { ok: false, code: 'OFF_DAY', error: 'Today is not a scheduled working day.', status: 400 };

  // 5b. Check-in window: PRESENT before workStart, LATE within 5 min, closed after.
  //     Admin/HR manual entries bypass this.
  if (elig.user.role === 'EMPLOYEE' && userRole !== 'ADMIN' && userRole !== 'HR' && !clientTime) {
    const workStart     = parseTimeOnDate(ctx.workStartTime, now);
    const lateWindowEnd = new Date(workStart.getTime() + 5 * 60 * 1000);
    if (now > lateWindowEnd) {
      const hh = String(lateWindowEnd.getHours()).padStart(2, '0');
      const mm = String(lateWindowEnd.getMinutes()).padStart(2, '0');
      return {
        ok: false,
        code: 'CHECK_IN_WINDOW_CLOSED',
        error: `Check-in window closed at ${hh}:${mm}. You are marked absent for today.`,
        status: 400,
      };
    }
  }

  // 6. Already checked in today?
  const { record, today } = await getTodayRecord(userId);
  if (record) {
    // ── Special case: cron marked this employee ABSENT (no real clock_in) ──
    // The auto-absent worker inserts a synthetic row with clock_in_time set to
    // workStartTime and no clock_out_time. If the employee now actually shows
    // up, we upgrade the record to LATE instead of blocking them.
    const isAutoAbsent =
      record.status === 'ABSENT' &&
      record.source !== 'MANUAL' &&
      !record.clock_out_time;

    if (isAutoAbsent) {
      // Recompute status with the real current check-in time
      const { status: newStatus, isLate, offDay, minutesLate } = computeCheckInStatus(now, ctx);
      if (offDay) return { ok: false, code: 'OFF_DAY', error: 'Not a working day.', status: 400 };

      let src = source || 'REALTIME';
      let writeCtx = WRITE_CONTEXT.USER_ACTION;
      if (clientTime) { src = 'OFFLINE'; writeCtx = WRITE_CONTEXT.SYNC_REPLAY; }
      if (userRole === 'ADMIN' || userRole === 'HR') { src = 'MANUAL'; writeCtx = WRITE_CONTEXT.ADMIN_CORRECTION; }

      // Update the existing ABSENT row to real check-in data
      const { rows: upgraded } = await query(
        `UPDATE attendance_records
         SET clock_in_time      = NOW(),
             clock_in_latitude  = $2,
             clock_in_longitude = $3,
             status             = $4,
             device_id          = $5,
             source             = $6,
             write_context      = $7,
             checkin_office_id   = $8,
             checkin_office_name = $9,
             notes              = COALESCE(notes || ' ', '') || '[Late check-in upgraded from ABSENT]',
             updated_at         = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          record.id,
          latitude  ?? null,
          longitude ?? null,
          newStatus,
          deviceId  ?? null,
          src,
          writeCtx,
          checkinOfficeId   ?? null,
          checkinOfficeName ?? null,
        ]
      );

      if (upgraded.length === 0)
        return { ok: false, code: 'ALREADY_CHECKED_IN', error: 'Already checked in today.', status: 400 };

      return { ok: true, record: upgraded[0], status: newStatus, isLate, minutesLate, phase: 'CHECKED_IN', today, upgradedFromAbsent: true };    }

    if (record.clock_in_time && !record.clock_out_time)
      return { ok: false, code: 'ALREADY_CHECKED_IN', error: 'Already checked in. Check out first.', status: 400 };
    if (record.clock_out_time)
      return { ok: false, code: 'ALREADY_COMPLETED', error: 'Attendance already completed for today.', status: 400 };
  }

  // 6b. Check for approved leave today — employees on leave cannot record attendance
  if (elig.user.role === 'EMPLOYEE') {
    const today2 = getBusinessDateString(now);
    const { rows: leaveRows } = await query(
      `SELECT id, leave_type FROM leave_requests
       WHERE user_id = $1 AND status = 'APPROVED'
         AND $2::date BETWEEN start_date AND end_date
       LIMIT 1`,
      [userId, today2]
    );
    if (leaveRows.length > 0) {
      return {
        ok: false,
        code: 'ON_APPROVED_LEAVE',
        error: 'You have an approved leave for today. Attendance recording is disabled on leave days.',
        status: 403,
      };
    }
  }

  // 7. Compute status: PRESENT / LATE / HALF_DAY based on employee's schedule
  const { status, isLate, offDay, minutesLate } = computeCheckInStatus(now, ctx);
  if (offDay)
    return { ok: false, code: 'OFF_DAY', error: 'Not a working day.', status: 400 };

  // 8. Write context
  let src = source || 'REALTIME';
  let writeCtx = WRITE_CONTEXT.USER_ACTION;
  if (clientTime) { src = 'OFFLINE'; writeCtx = WRITE_CONTEXT.SYNC_REPLAY; }
  if (userRole === 'ADMIN' || userRole === 'HR') { src = 'MANUAL'; writeCtx = WRITE_CONTEXT.ADMIN_CORRECTION; }

  // 9. Insert record
  let timestampSql = 'NOW()';
  const params = [
    userId,
    latitude  ?? null,       // $2
    longitude ?? null,       // $3
    status,                  // $4
    notes     ?? null,       // $5
    deviceId  ?? null,       // $6
    src,                     // $7
    writeCtx,                // $8
    checkinOfficeId   ?? null, // $9
    checkinOfficeName ?? null, // $10
  ];

  if (clientTime) {
    const cTime = new Date(clientTime);
    if (cTime > new Date())
      return { ok: false, error: 'Cannot check-in in the future.', status: 400 };
    if ((Date.now() - cTime.getTime()) / 3600000 > 168)
      return { ok: false, error: 'Offline sync window expired (max 7 days).', status: 400 };
    timestampSql = '$11';
    params.push(cTime);
  }

  const { rows } = await query(
    `INSERT INTO attendance_records
       (user_id, clock_in_time, clock_in_latitude, clock_in_longitude,
        status, notes, device_id, source, write_context,
        checkin_office_id, checkin_office_name, created_at)
     VALUES ($1, ${timestampSql}, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (user_id, (clock_in_time::date)) DO NOTHING
     RETURNING *`,
    params
  );

  if (rows.length === 0)
    return { ok: false, code: 'ALREADY_CHECKED_IN', error: 'Already checked in today.', status: 400 };

  // minutesLate already computed by computeCheckInStatus (grace-aware)
  return { ok: true, record: rows[0], status, isLate, minutesLate, phase: 'CHECKED_IN', today };
}

// ── Check-Out ─────────────────────────────────────────────────────────────────
async function performCheckOut({
  userId, userRole, latitude, longitude,
  notes, deviceId, req, clientTime, gpsAccuracyM,
}) {
  // 1. Eligible?
  const elig = await assertEmployeeEligible(userId);
  if (!elig.ok) return elig;

  // 2. Geofence on checkout (employees only) — GPS is the only gate now
  let checkoutOfficeId   = null;
  let checkoutOfficeName = null;
  if (elig.user.role === 'EMPLOYEE') {
    const geo = await validateGeofence({ userId, latitude, longitude, req, gpsAccuracyM });
    if (!geo.ok) return { ok: false, ...geo, status: 403 };
    checkoutOfficeId   = geo.officeId   ?? null;
    checkoutOfficeName = geo.officeName ?? null;
  }

  // 3. Have a check-in record?
  const { record } = await getTodayRecord(userId);
  if (!record || !record.clock_in_time)
    return { ok: false, code: 'NO_CHECKIN', error: 'Check in first before checking out.', status: 400 };
  if (record.clock_out_time)
    return { ok: false, code: 'ALREADY_CHECKED_OUT', error: 'Already checked out.', status: 400 };

  // 3b. Block checkout if the underlying record is an auto-absent placeholder
  //     (no real clock_in happened — the row was inserted by the cron).
  if (record.status === 'ABSENT' && record.source !== 'MANUAL') {
    return { ok: false, code: 'NO_CHECKIN', error: 'Check in first before checking out.', status: 400 };
  }

  // 3c. Block if on approved leave
  if (elig.user.role === 'EMPLOYEE') {
    const today = getBusinessDateString();
    const { rows: leaveRows } = await query(
      `SELECT id FROM leave_requests
       WHERE user_id = $1 AND status = 'APPROVED'
         AND $2::date BETWEEN start_date AND end_date
       LIMIT 1`,
      [userId, today]
    );
    if (leaveRows.length > 0) {
      return {
        ok: false,
        code: 'ON_APPROVED_LEAVE',
        error: 'You have an approved leave for today. Attendance recording is disabled on leave days.',
        status: 403,
      };
    }
  }

  const checkInTime  = new Date(record.clock_in_time);
  const checkOutTime = clientTime ? new Date(clientTime) : new Date();
  if (checkOutTime < checkInTime)
    return { ok: false, error: 'Check-out cannot be before check-in.', status: 400 };

  const hoursWorked = ((checkOutTime - checkInTime) / 3600000).toFixed(2);

  // 4. Shift-end comparison (employee schedule)
  const ctx = await getScheduleContext(userId, checkInTime);
  const shiftEnd = getShiftEndOnDate(ctx, checkInTime);

  // 4a. Check-out window enforcement for employees:
  //     Opens at shiftEnd, closes shiftEnd + 2 hours.
  //     Admin/HR manual entries bypass this restriction.
  const isAdminOrHr = userRole === 'ADMIN' || userRole === 'HR';
  if (!isAdminOrHr && ctx.isWorkingDay) {
    const checkoutWindowEnd = new Date(shiftEnd.getTime() + 2 * 60 * 60 * 1000);
    const hh = String(shiftEnd.getHours()).padStart(2, '0');
    const mm = String(shiftEnd.getMinutes()).padStart(2, '0');
    if (checkOutTime < shiftEnd) {
      return {
        ok: false,
        code: 'TOO_EARLY_CHECKOUT',
        error: `Check-out is not available yet. Your shift ends at ${hh}:${mm}.`,
        status: 400,
        earliestCheckoutTime: shiftEnd.toISOString(),
      };
    }
    if (checkOutTime >= checkoutWindowEnd) {
      return {
        ok: false,
        code: 'CHECKOUT_WINDOW_CLOSED',
        error: 'The check-out window has closed (2 hours after shift end). This day is marked absent.',
        status: 400,
      };
    }
  }

  let overtimeHours = 0;
  if (checkOutTime > shiftEnd)
    overtimeHours = ((checkOutTime - shiftEnd) / 3600000).toFixed(2);

  const checkoutStatus = parseFloat(overtimeHours) > 0 ? 'OVERTIME' : 'NORMAL';
  const checkoutNote   = parseFloat(overtimeHours) > 0
    ? `[Overtime: ${(parseFloat(overtimeHours) * 60).toFixed(0)}min]`
    : null;

  let src      = 'REALTIME';
  let writeCtx = WRITE_CONTEXT.USER_ACTION;
  if (clientTime) { src = 'OFFLINE'; writeCtx = WRITE_CONTEXT.SYNC_REPLAY; }
  if (isAdminOrHr) { src = 'MANUAL'; writeCtx = WRITE_CONTEXT.ADMIN_CORRECTION; }

  const { rows } = await query(
    `UPDATE attendance_records
     SET clock_out_time        = $1,
         clock_out_latitude    = $2,
         clock_out_longitude   = $3,
         hours_worked          = $4,
         overtime_hours        = $5,
         notes                 = COALESCE($6, notes),
         source                = $7,
         write_context         = $8,
         checkout_office_id    = $10,
         checkout_office_name  = $11,
         updated_at            = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      checkOutTime,
      latitude  ?? null,
      longitude ?? null,
      hoursWorked,
      overtimeHours,
      notes ?? checkoutNote,
      src,
      writeCtx,
      record.id,
      checkoutOfficeId   ?? null,
      checkoutOfficeName ?? null,
    ]
  );

  return {
    ok: true, record: rows[0], phase: 'CHECKED_OUT',
    hoursWorked: parseFloat(hoursWorked),
    overtimeHours: parseFloat(overtimeHours),
    checkoutStatus,
    priorStatus: record.status,
  };
}

// ── QR Attendance ─────────────────────────────────────────────────────────────
// Full chain: QR sig → GPS → device → schedule → PRESENT/LATE
async function performQrAttendance({
  userId, userRole, qrData, latitude, longitude, action, req, deviceId, gpsAccuracyM,
}) {
  // 0. Rate-limit: prevent the same user scanning QR more than once per 5 s.
  //    Blocks rapid replay attacks (screenshot re-scan, automated scripts).
  const rateCheck = checkQrScanRateLimit(userId);
  if (!rateCheck.ok) {
    await logAttendanceSecurityEvent({
      userId, deviceId, eventType: 'QR_RATE_LIMITED', severity: 'MEDIUM',
      reason: 'QR scan submitted too rapidly', ip: req?.ip, app: req?.app,
    });
    return { ok: false, ...rateCheck };
  }

  // 1. Load live config (qr_secret, geofence — fresh from DB every call)
  const cfgMap = await loadAttendanceConfig();

  if (cfgMap.qr_enabled === 'false')
    return { ok: false, code: 'QR_DISABLED', error: 'QR attendance is disabled.', status: 403 };

  // 2. Validate QR signature
  const qrCheck = verifyStaticQrSignature(qrData, cfgMap);
  if (!qrCheck.ok) {
    await logAttendanceSecurityEvent({
      userId, deviceId, eventType: 'QR_INVALID', severity: 'HIGH',
      reason: qrCheck.error, ip: req?.ip, app: req?.app,
    });
    return { ok: false, ...qrCheck, status: 400 };
  }

  // 3. Employee eligible? (active, email verified)
  const elig = await assertEmployeeEligible(userId);
  if (!elig.ok) return elig;

  // 4. GPS inside geofence?
  // CRITICAL: If the QR token specifies an officeId (not "default"), the employee
  // MUST be physically inside that exact office — scanning Office A's QR while
  // standing at Office B is rejected, even if both are valid offices.
  let qrOfficeId   = null;
  let qrOfficeName = null;
  if (elig.user.role === 'EMPLOYEE') {
    const tokenOfficeId = qrCheck.officeId !== 'default' ? qrCheck.officeId : null;

    if (tokenOfficeId) {
      // Enforce that employee is inside the SPECIFIC office whose QR they scanned
      const { rows: officeRows } = await require('../config/database').query(
        `SELECT id, name, latitude, longitude,
                COALESCE(radius_meters, 200) AS radius_meters,
                COALESCE(gps_accuracy_max_m, 100) AS gps_accuracy_max_m
         FROM offices WHERE id = $1 AND is_active = TRUE LIMIT 1`,
        [tokenOfficeId]
      );
      if (officeRows.length === 0) {
        return { ok: false, code: 'OFFICE_NOT_FOUND', error: 'The office linked to this QR code no longer exists.', status: 400 };
      }
      const office = officeRows[0];
      const dist = getDistance(latitude, longitude, parseFloat(office.latitude), parseFloat(office.longitude));
      const radius = parseInt(office.radius_meters, 10);
      const officeMaxAcc = parseInt(office.gps_accuracy_max_m || cfgMap.gps_accuracy_max_m || '100', 10);
      const accuracyComp = gpsAccuracyM != null ? Math.min(gpsAccuracyM, officeMaxAcc / 2) : 0;
      const effectiveDist = Math.max(0, dist - accuracyComp);

      if (effectiveDist > radius) {
        await logAttendanceSecurityEvent({
          userId, deviceId, eventType: 'QR_WRONG_OFFICE', severity: 'HIGH',
          reason: `QR belongs to ${office.name} but employee is ${Math.round(dist)}m away`,
          metadata: { tokenOfficeId, distanceM: Math.round(dist), allowedM: radius, latitude, longitude },
          ip: req?.ip, app: req?.app,
        });
        return {
          ok: false,
          code: 'WRONG_OFFICE_QR',
          error: `This QR belongs to ${office.name}. You must be inside that office to use it (${Math.round(dist)}m away, max ${radius}m).`,
          status: 403,
        };
      }
      qrOfficeId   = office.id;
      qrOfficeName = office.name;
    } else {
      // Default QR — fall through to normal geofence (any office)
      const geo = await validateGeofence({ userId, latitude, longitude, req, deviceId, gpsAccuracyM, cfgMap });
      if (!geo.ok) return { ok: false, ...geo, status: 403 };
      qrOfficeId   = geo.officeId   ?? null;
      qrOfficeName = geo.officeName ?? null;
    }
  }

  // 5. Device approved? (employees only)
  if (elig.user.role === 'EMPLOYEE') {
    const dev = await validateDeviceForAttendance(userId, deviceId);
    if (!dev.ok) return dev;
  }

  // 6. Schedule + time status → PRESENT / LATE / HALF_DAY
  const act = (action || 'CHECK_IN').toUpperCase();
  if (act === 'CHECK_OUT')
    return performCheckOut({ userId, userRole, latitude, longitude, deviceId, req, gpsAccuracyM });

  return performCheckIn({
    userId, userRole, latitude, longitude,
    deviceId, source: 'QR', req, gpsAccuracyM,
    checkinOfficeId: qrOfficeId,
    checkinOfficeName: qrOfficeName,
  });
}

module.exports = {
  getDistance,
  loadAttendanceConfig,
  assertEmployeeEligible,
  getTodayRecord,
  validateGeofence,
  validateDeviceForAttendance,
  verifyStaticQrSignature,
  checkQrScanRateLimit,
  performCheckIn,
  performCheckOut,
  performQrAttendance,
};
