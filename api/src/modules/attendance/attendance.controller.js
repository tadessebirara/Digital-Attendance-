const { query, transaction } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');
const socketService = require('../../services/socket.service');
const { notifyLateCheckIn, checkConsecutiveAbsences } = require('../../services/hr-notification.service');
const { WRITE_CONTEXT, inferWriteContext } = require('../../utils/attendance-resolver');
const { getBusinessDateString, getBusinessMonthStart } = require('../../utils/business-date');
const engine = require('../../services/attendance-engine.service');
const { getScheduleContext, parseTimeOnDate, getShiftEndOnDate } = require('../../services/schedule.service');
const QRCode = require('qrcode');
const crypto = require('crypto');

// Get attendance records
const getAttendanceRecords = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, startDate, endDate, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Filter by user
    if (userId) {
      // Employees can only see their own records
      if (requesterRole === 'EMPLOYEE' && parseInt(userId) !== requesterId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      whereConditions.push(`ar.user_id = $${paramIndex++}`);
      params.push(parseInt(userId));
    } else if (requesterRole === 'EMPLOYEE') {
      whereConditions.push(`ar.user_id = $${paramIndex++}`);
      params.push(requesterId);
    }

    // Date range
    if (startDate) {
      whereConditions.push(`DATE(ar.clock_in_time) >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push(`DATE(ar.clock_in_time) <= $${paramIndex++}`);
      params.push(endDate);
    }

    // Status filter
    if (status) {
      whereConditions.push(`ar.status = $${paramIndex++}`);
      params.push(status);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Get total
    const countQuery = `SELECT COUNT(*) FROM attendance_records ar ${whereClause}`;
    const { rows: countRows } = await query(countQuery, params);
    const total = parseInt(countRows[0].count);

    // Get records
    const recordsQuery = `
      SELECT ar.*, 
             u.first_name, u.last_name, u.employee_id, u.profile_picture,
             u.department, u.position
      FROM attendance_records ar
      JOIN users u ON ar.user_id = u.id
      ${whereClause}
      ORDER BY ar.clock_in_time DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(parseInt(limit), offset);

    const { rows: records } = await query(recordsQuery, params);

    res.json({
      success: true,
      data: records.map(r => ({
        id: r.id,
        userId: r.user_id,
        user: {
          id: r.user_id,
          firstName: r.first_name,
          lastName: r.last_name,
          fullName: `${r.first_name} ${r.last_name}`,
          employeeId: r.employee_id,
          profilePicture: r.profile_picture,
          department: r.department,
          position: r.position
        },
        date: r.clock_in_time ? getBusinessDateString(r.clock_in_time) : null,
        clockInTime: r.clock_in_time,
        clockOutTime: r.clock_out_time,
        clockInLocation: r.clock_in_latitude ? {
          latitude: r.clock_in_latitude,
          longitude: r.clock_in_longitude
        } : null,
        clockOutLocation: r.clock_out_latitude ? {
          latitude: r.clock_out_latitude,
          longitude: r.clock_out_longitude
        } : null,
        hoursWorked: r.hours_worked,
        overtimeHours: r.overtime_hours,
        earlyLeaveMinutes: r.early_leave_minutes,
        status: r.status,
        notes: r.notes,
        deviceId: r.device_id,
        createdAt: r.created_at
      })),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: offset + records.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Get attendance records error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attendance records'
    });
  }
};

// Get my attendance
const getMyAttendance = async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;

    let params = [userId];
    let paramIndex = 2;
    let dateFilter = '';

    if (startDate && endDate) {
      dateFilter = `AND DATE(clock_in_time) BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(startDate, endDate);
    }

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM attendance_records WHERE user_id = $1 ${dateFilter}`,
      params
    );
    const total = parseInt(countRows[0].count);

    const { rows: records } = await query(
      `SELECT * FROM attendance_records 
       WHERE user_id = $1 ${dateFilter}
       ORDER BY clock_in_time DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: records.map(r => ({
        id: r.id,
        date: r.clock_in_time ? getBusinessDateString(r.clock_in_time) : null,
        clockInTime: r.clock_in_time,
        clockOutTime: r.clock_out_time,
        clockInLocation: r.clock_in_latitude ? {
          latitude: r.clock_in_latitude,
          longitude: r.clock_in_longitude
        } : null,
        clockOutLocation: r.clock_out_latitude ? {
          latitude: r.clock_out_latitude,
          longitude: r.clock_out_longitude
        } : null,
        hoursWorked: r.hours_worked,
        overtimeHours: r.overtime_hours,
        earlyLeaveMinutes: r.early_leave_minutes,
        status: r.status,
        notes: r.notes
      })),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: offset + records.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Get my attendance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attendance'
    });
  }
};

// Check-in
const checkIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, notes, clientTime, gpsAccuracyM } = req.body;
    const deviceId = req.deviceId;

    const result = await engine.performCheckIn({
      userId,
      userRole: req.user.role,
      latitude,
      longitude,
      notes,
      deviceId,
      source: 'REALTIME',
      method: 'GPS',
      req,
      clientTime,
      gpsAccuracyM: gpsAccuracyM != null ? parseFloat(gpsAccuracyM) : undefined,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        error: result.error,
        code: result.code,
      });
    }

    const { record, status, isLate, minutesLate, phase } = result;

    await auditLog(userId, 'CHECK_IN', 'attendance', record.id, {
      status,
      location: { latitude, longitude },
      isLate,
      minutesLate,
    }, req);

    const checkInPayload = {
      action: 'CHECKED_IN',
      userId,
      userName: req.user.fullName,
      status,
      phase,
      time: record.clock_in_time,
      record: { id: record.id, clockInTime: record.clock_in_time, status: record.status },
    };
    socketService.emitToUser(userId, socketService.EVENTS.ATTENDANCE_UPDATE, checkInPayload);
    socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, checkInPayload);

    if (isLate) {
      // Use minutesLate from the engine (grace-aware, not raw shift-start delta)
      await notifyLateCheckIn(req.app, {
        userId,
        userName: req.user.fullName,
        checkInTime: record.clock_in_time,
        minutesLate: minutesLate || 0,
      });
    }

    await checkConsecutiveAbsences(req.app, userId, req.user.fullName);

    res.json({
      success: true,
      message: isLate ? 'Checked in (Late)' : 'Checked in successfully',
      data: {
        id: record.id,
        clockInTime: record.clock_in_time,
        status: record.status,
        phase,
        isLate,
        method: 'GPS',
        location: { latitude: record.clock_in_latitude, longitude: record.clock_in_longitude },
      },
    });
  } catch (error) {
    logger.error('Check-in error:', error);
    res.status(500).json({ success: false, error: 'Check-in failed' });
  }
};

// Check-out
const checkOut = async (req, res) => {
  try {
    const userId = req.user.id;
    const { latitude, longitude, notes, clientTime, gpsAccuracyM } = req.body;
    const deviceId = req.deviceId;

    const result = await engine.performCheckOut({
      userId,
      userRole: req.user.role,
      latitude,
      longitude,
      notes,
      deviceId,
      req,
      clientTime,
      gpsAccuracyM: gpsAccuracyM != null ? parseFloat(gpsAccuracyM) : undefined,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        error: result.error,
        code: result.code,
        ...(result.earliestCheckoutTime && { earliestCheckoutTime: result.earliestCheckoutTime }),
      });
    }

    const { record, hoursWorked, overtimeHours, phase, priorStatus, checkoutStatus } = result;

    await auditLog(userId, 'CHECK_OUT', 'attendance', record.id, {
      hoursWorked,
      overtimeHours,
      checkoutStatus,
      priorStatus,
    }, req);

    const payload = {
      action: 'CHECKED_OUT',
      userId,
      userName: req.user.fullName,
      phase,
      record: {
        id: record.id,
        clockOutTime: record.clock_out_time,
        hoursWorked,
        overtimeHours,
        status: record.status,
      },
    };
    socketService.emitToUser(userId, socketService.EVENTS.ATTENDANCE_UPDATE, payload);
    socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, payload);

    const message = checkoutStatus === 'OVERTIME'
      ? `Checked out with overtime — ${(overtimeHours * 60).toFixed(0)} extra minutes. Great work!`
      : 'Checked out successfully';

    res.json({
      success: true,
      message,
      data: {
        id: record.id,
        clockInTime: record.clock_in_time,
        clockOutTime: record.clock_out_time,
        hoursWorked,
        overtimeHours,
        checkoutStatus,
        status: record.status,
        phase,
        priorStatus,
      },
    });
  } catch (error) {
    logger.error('Check-out error:', error);
    res.status(500).json({ success: false, error: 'Check-out failed' });
  }
};

// Get today's status
const getTodayStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const now    = new Date();
    const today  = getBusinessDateString(now);

    const { rows: records } = await query(
      `SELECT * FROM attendance_records 
       WHERE user_id = $1 AND DATE(clock_in_time) = $2`,
      [userId, today]
    );

    const schedule = await getScheduleContext(userId, now);

    // ── Check for approved leave today ────────────────────────────────────
    const { rows: leaveRows } = await query(
      `SELECT id, leave_type, start_date, end_date
       FROM leave_requests
       WHERE user_id = $1 AND status = 'APPROVED'
         AND $2::date BETWEEN start_date AND end_date
       LIMIT 1`,
      [userId, today]
    );
    const onLeave = leaveRows.length > 0;
    const leaveInfo = onLeave ? {
      leaveType: leaveRows[0].leave_type,
      startDate: leaveRows[0].start_date,
      endDate: leaveRows[0].end_date,
    } : null;

    // ── Compute schedule window fields ─────────────────────────────────────
    const workStart         = parseTimeOnDate(schedule.workStartTime, now);
    const shiftEnd          = getShiftEndOnDate(schedule, now);
    // Hard 5-minute late window — window closes at workStart + 5m
    const lateWindowEnd     = new Date(workStart.getTime() + 5 * 60 * 1000);
    // halfDayDeadline kept for API compat but equals lateWindowEnd
    const halfDayDeadline   = lateWindowEnd;
    const checkoutWindowStart = shiftEnd;
    const checkoutWindowEnd   = new Date(shiftEnd.getTime() + 2 * 60 * 60 * 1000);
    // Check-in: only before workStart+5m; false if window has passed
    const checkInWindowOpen   = schedule.isWorkingDay && now <= lateWindowEnd && !onLeave;
    // Check-out: shiftEnd → shiftEnd+2h only
    const checkOutWindowOpen  = schedule.isWorkingDay && now >= checkoutWindowStart && now < checkoutWindowEnd && !onLeave;

    const scheduleWindow = {
      workStartTime:          schedule.workStartTime,
      workEndTime:            schedule.workEndTime,
      isWorkingDay:           schedule.isWorkingDay,
      graceMinutes:           schedule.graceMinutes,
      halfDayAfterMinutes:    schedule.halfDayAfterMinutes,
      shiftEndTime:           shiftEnd.toISOString(),
      halfDayDeadline:        halfDayDeadline.toISOString(),
      checkoutWindowStart:    checkoutWindowStart.toISOString(),
      checkoutWindowEnd:      checkoutWindowEnd.toISOString(),
      earliestCheckoutTime:   checkoutWindowStart.toISOString(),
      checkInWindowOpen,
      checkOutWindowOpen,
    };

    if (records.length === 0) {
      return res.json({
        success: true,
        data: {
          isCheckedIn: false,
          isCheckedOut: false,
          status: onLeave ? 'EXCUSED' : null,
          phase: null,
          onLeave,
          leaveInfo,
          isHoliday: !schedule.isWorkingDay && !!schedule.publicHoliday,
          holidayInfo: schedule.publicHoliday ?? null,
          isOffDay: !schedule.isWorkingDay,
          schedule: scheduleWindow,
        },
      });
    }

    const record = records[0];

    // A cron-generated ABSENT row has clock_in_time set to workStartTime but
    // the employee never actually checked in. Treat it as "not checked in" so
    // the mobile app still shows the Check In button.
    const isAutoAbsentPlaceholder =
      record.status === 'ABSENT' &&
      record.source !== 'MANUAL' &&
      !record.clock_out_time;

    let phase = null;
    if (isAutoAbsentPlaceholder) {
      phase = 'ABSENT';
    } else if (record.clock_in_time && !record.clock_out_time) {
      phase = 'CHECKED_IN';
    } else if (record.clock_out_time) {
      phase = 'CHECKED_OUT';
    }
    if (record.status === 'AUTO_CHECKOUT') phase = 'AUTO_CHECKOUT';

    res.json({
      success: true,
      data: {
        // isCheckedIn must be false for auto-absent placeholders so the
        // mobile app enables the Check In button (backend engine upgrades
        // the row to LATE when the employee actually arrives).
        isCheckedIn: !isAutoAbsentPlaceholder && !!record.clock_in_time && !record.clock_out_time,
        isCheckedOut: !!record.clock_out_time,
        clockInTime: record.clock_in_time,
        clockOutTime: record.clock_out_time,
        hoursWorked: record.hours_worked,
        status: record.status,
        phase,
        onLeave,
        leaveInfo,
        isHoliday: !schedule.isWorkingDay && !!schedule.publicHoliday,
        holidayInfo: schedule.publicHoliday ?? null,
        isOffDay: !schedule.isWorkingDay,
        schedule: scheduleWindow,
      },
    });
  } catch (error) {
    logger.error('Get today status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get today status'
    });
  }
};

// Get attendance stats
const getAttendanceStats = async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    const targetUserId = userId || req.user.id;

    // Check permissions
    if (userId && parseInt(userId) !== req.user.id && req.user.role === 'EMPLOYEE') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const start = startDate || getBusinessMonthStart();
    const end = endDate || getBusinessDateString();

    const { rows: stats } = await query(
      `SELECT 
        (SELECT COUNT(*) FROM attendance_records WHERE user_id = $1 AND DATE(clock_in_time) BETWEEN $2 AND $3) as total_attendance,
        COUNT(*) FILTER (WHERE status IN ('PRESENT','CHECKED_OUT','AUTO_CHECKOUT')) as present_days,
        COUNT(*) FILTER (WHERE status = 'ABSENT') as absent_days,
        COUNT(*) FILTER (WHERE status IN ('LATE','MISSED_CHECKOUT')) as late_days,
        COUNT(*) FILTER (WHERE status = 'HALF_DAY') as half_days,
        COALESCE(SUM(hours_worked), 0) as total_hours,
        COALESCE(SUM(overtime_hours), 0) as total_overtime,
        (SELECT COUNT(*) FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED' AND (start_date BETWEEN $2 AND $3 OR end_date BETWEEN $2 AND $3)) as leave_days
       FROM attendance_records 
       WHERE user_id = $1 AND DATE(clock_in_time) BETWEEN $2 AND $3`,
      [targetUserId, start, end]
    );

    const stat = stats[0];

    res.json({
      success: true,
      data: {
        period: { start, end },
        totalDays: parseInt(stat.total_attendance),
        presentDays: parseInt(stat.present_days),
        absentDays: parseInt(stat.absent_days),
        lateDays: parseInt(stat.late_days),
        halfDays: parseInt(stat.half_days),
        leaveDays: parseInt(stat.leave_days),
        totalHours: parseFloat(stat.total_hours),
        totalOvertime: parseFloat(stat.total_overtime),
        averageHoursPerDay: stat.total_attendance > 0 ? (parseFloat(stat.total_hours) / parseInt(stat.total_attendance)).toFixed(2) : 0
      }
    });

  } catch (error) {
    logger.error('Get attendance stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get attendance stats'
    });
  }
};

// Manual check-in/check-out from HR attendance monitor.
const manualCheckInOut = async (req, res) => {
  try {
    const targetUserId = Number(req.body.employeeId || req.body.userId);
    const type = String(req.body.type || 'in').toLowerCase();
    const notes = req.body.notes || `[Manual ${type === 'out' ? 'check-out' : 'check-in'} by ${req.user.fullName || req.user.email}]`;

    // ── Parse optional checkTime (HR can backdate within same business day) ──
    let checkTs = null;
    if (req.body.checkTime) {
      const parsed = new Date(req.body.checkTime);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid checkTime — must be a valid ISO date string' });
      }
      if (parsed > new Date()) {
        return res.status(400).json({ success: false, error: 'checkTime cannot be in the future' });
      }
      checkTs = parsed;
    }

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ success: false, error: 'Valid employeeId is required' });
    }

    const { rows: targetRows } = await query(
      `SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = 'EMPLOYEE'`,
      [targetUserId]
    );
    if (targetRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const targetName = `${targetRows[0].first_name} ${targetRows[0].last_name}`.trim();
    // Use date portion of checkTs when provided, otherwise today
    const targetDate = checkTs
      ? checkTs.toISOString().split('T')[0]
      : getBusinessDateString();

    let record;

    if (type === 'out') {
      // ── Check-out: must have an open check-in on the target date ─────────
      const { rows: existingRows } = await query(
        `SELECT *
         FROM attendance_records
         WHERE user_id = $1 AND DATE(clock_in_time) = $2::date
         ORDER BY id DESC
         LIMIT 1`,
        [targetUserId, targetDate]
      );
      const existing = existingRows[0];
      if (!existing || !existing.clock_in_time) {
        return res.status(400).json({ success: false, error: 'Employee has not checked in on that date' });
      }
      if (existing.clock_out_time) {
        return res.status(400).json({ success: false, error: 'Employee already checked out for that day' });
      }

      // Validate: checkout time must be after checkin time
      const checkOutTs = checkTs || new Date();
      if (checkOutTs <= new Date(existing.clock_in_time)) {
        return res.status(400).json({
          success: false,
          error: 'Check-out time must be after check-in time',
        });
      }

      const { rows } = await query(
        `UPDATE attendance_records
         SET clock_out_time = $2,
             hours_worked   = EXTRACT(EPOCH FROM ($2 - clock_in_time)) / 3600,
             notes          = COALESCE(notes || ' ', '') || $3,
             source         = 'MANUAL',
             write_context  = $4,
             updated_at     = NOW()
         WHERE id = $1
         RETURNING *`,
        [existing.id, checkOutTs, notes, WRITE_CONTEXT.ADMIN_CORRECTION]
      );
      record = rows[0];

    } else {
      // ── Check-in: guard against overwriting an existing real check-in ─────
      const { rows: existingRows } = await query(
        `SELECT id, clock_in_time, clock_out_time, source
         FROM attendance_records
         WHERE user_id = $1 AND DATE(clock_in_time) = $2::date
         ORDER BY id DESC
         LIMIT 1`,
        [targetUserId, targetDate]
      );
      const existing = existingRows[0];

      // If a real (non-auto-absent) check-in exists, block it with a clear error
      if (existing && existing.clock_in_time) {
        const isAutoAbsent = existing.source !== 'MANUAL' && !existing.clock_out_time;
        if (!isAutoAbsent) {
          return res.status(409).json({
            success: false,
            error: 'Employee already has a check-in record for that date. Use the edit/update action to correct it.',
            code: 'ALREADY_CHECKED_IN',
          });
        }
        // Auto-absent placeholder exists — upgrade it to a real manual check-in
        const checkInTs = checkTs || new Date();
        const { rows } = await query(
          `UPDATE attendance_records
           SET clock_in_time  = $2,
               status         = 'PRESENT',
               notes          = COALESCE(notes || ' ', '') || $3,
               source         = 'MANUAL',
               write_context  = $4,
               created_by     = $5,
               updated_at     = NOW()
           WHERE id = $1
           RETURNING *`,
          [existing.id, checkInTs, notes, WRITE_CONTEXT.ADMIN_CORRECTION, req.user.id]
        );
        record = rows[0];
      } else {
        // No record yet — insert fresh
        const checkInTs = checkTs || new Date();
        const { rows } = await query(
          `INSERT INTO attendance_records
             (user_id, clock_in_time, status, notes, source, write_context, created_by, created_at)
           VALUES ($1, $2, 'PRESENT', $3, 'MANUAL', $4, $5, NOW())
           RETURNING *`,
          [targetUserId, checkInTs, notes, WRITE_CONTEXT.ADMIN_CORRECTION, req.user.id]
        );
        record = rows[0];
      }
    }

    await auditLog(req.user.id, type === 'out' ? 'MANUAL_CHECK_OUT' : 'MANUAL_CHECK_IN', 'attendance', record.id, {
      targetUserId,
      type,
      checkTime: checkTs,
    }, req);

    const payload = {
      action: type === 'out' ? 'MANUAL_CHECKED_OUT' : 'MANUAL_CHECKED_IN',
      userId: targetUserId,
      userName: targetName,
      recordId: record.id,
      record,
    };
    socketService.emitToUser(targetUserId, socketService.EVENTS.ATTENDANCE_UPDATE, payload);
    socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, payload);

    res.json({
      success: true,
      message: type === 'out' ? 'Check-out recorded successfully' : 'Check-in recorded successfully',
      data: record,
    });
  } catch (error) {
    logger.error('Manual check-in/out error:', error);
    res.status(500).json({ success: false, error: 'Failed to record attendance' });
  }
};

// Manual entry (Admin/HR only) — full record with explicit times and status
const manualEntry = async (req, res) => {
  try {
    const { userId, date, clockInTime, clockOutTime, status, notes } = req.body;

    // ── Validate times ────────────────────────────────────────────────────────
    if (clockInTime && clockOutTime) {
      const ci = new Date(clockInTime);
      const co = new Date(clockOutTime);
      if (co <= ci) {
        return res.status(400).json({
          success: false,
          error: 'Clock-out time must be after clock-in time',
        });
      }
    }

    // ── Check for existing record on the same date ────────────────────────────
    // Use clock_in_time date if provided, otherwise fall back to the date field
    const targetDate = clockInTime
      ? new Date(clockInTime).toISOString().split('T')[0]
      : date;

    if (targetDate) {
      const { rows: existing } = await query(
        `SELECT id FROM attendance_records
         WHERE user_id = $1 AND DATE(clock_in_time) = $2::date
         LIMIT 1`,
        [userId, targetDate]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: `An attendance record already exists for this employee on ${targetDate}. Use the update (PATCH /:id) endpoint to correct it.`,
          code: 'DUPLICATE_RECORD',
          existingRecordId: existing[0].id,
        });
      }
    }

    // ── Compute hours_worked if both times provided ───────────────────────────
    const hoursWorked = (clockInTime && clockOutTime)
      ? (new Date(clockOutTime) - new Date(clockInTime)) / 3600000
      : null;

    const { rows: records } = await query(
      `INSERT INTO attendance_records
       (user_id, clock_in_time, clock_out_time, hours_worked, status, notes, source, write_context, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'MANUAL', $7, $8, NOW())
       RETURNING *`,
      [
        userId,
        clockInTime  || null,
        clockOutTime || null,
        hoursWorked  !== null ? Math.round(hoursWorked * 100) / 100 : null,
        status,
        notes        || null,
        WRITE_CONTEXT.ADMIN_CORRECTION,
        req.user.id,
      ]
    );

    const record = records[0];

    const payload = {
      action: 'MANUAL_ATTENDANCE_CREATED',
      userId,
      userName: req.user.fullName,
      recordId: record.id,
      record,
    };
    socketService.emitToUser(userId, socketService.EVENTS.ATTENDANCE_UPDATE, payload);
    socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, payload);

    await auditLog(req.user.id, 'MANUAL_ATTENDANCE_ENTRY', 'attendance', record.id, {
      targetUserId: userId,
      date: targetDate,
      status,
    }, req);

    res.status(201).json({
      success: true,
      message: 'Attendance record created',
      data: record,
    });
  } catch (error) {
    // Catch any remaining DB constraint violations with a clear message
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'An attendance record already exists for this employee on that date.',
        code: 'DUPLICATE_RECORD',
      });
    }
    logger.error('Manual entry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create attendance record',
    });
  }
};

// Update attendance (Admin/HR only)
const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { clockInTime, clockOutTime, status, notes } = req.body;

    const { rows: existing } = await query('SELECT * FROM attendance_records WHERE id = $1', [id]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Attendance record not found'
      });
    }

    const oldRecord = existing[0];

    // Admin/HR updates are always MANUAL source + ADMIN_CORRECTION context.
    // The DB trigger treats ADMIN_CORRECTION as immutable so subsequent
    // offline syncs or reconciliation jobs cannot override this correction.
    const { rows: updated } = await query(
      `UPDATE attendance_records 
       SET clock_in_time  = COALESCE($1, clock_in_time),
           clock_out_time = COALESCE($2, clock_out_time),
           status         = COALESCE($3, status),
           notes          = COALESCE($4, notes),
           source         = 'MANUAL',
           write_context  = $5,
           hours_worked   = CASE WHEN $2 IS NOT NULL AND clock_in_time IS NOT NULL 
                             THEN EXTRACT(EPOCH FROM ($2 - clock_in_time)) / 3600 
                             ELSE hours_worked END
       WHERE id = $6
       RETURNING *`,
      [clockInTime, clockOutTime, status, notes, WRITE_CONTEXT.ADMIN_CORRECTION, id]
    );

    await auditLog(req.user.id, 'ATTENDANCE_UPDATED', 'attendance', parseInt(id), {
      oldValues: oldRecord,
      newValues: { clockInTime, clockOutTime, status, notes, source: 'MANUAL' }
    }, req);

    const payload = {
      action: 'MANUAL_ATTENDANCE_UPDATED',
      userId: updated[0].user_id,
      userName: req.user.fullName,
      recordId: updated[0].id,
      record: updated[0],
    };
    socketService.emitToUser(updated[0].user_id, socketService.EVENTS.ATTENDANCE_UPDATE, payload);
    socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, payload);

    res.json({
      success: true,
      message: 'Attendance record updated',
      data: updated[0]
    });
  } catch (error) {
    logger.error('Update attendance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update attendance record'
    });
  }
};

// Get QR code for check-in
const getQRCode = async (req, res) => {
  try {
    // Load secret + expiry from system_settings (admin-controlled)
    const { rows: cfg } = await query(
      `SELECT setting_key, setting_value FROM system_settings
       WHERE setting_key IN ('qr_secret','qr_expiry_seconds','qr_enabled')`
    );
    const cfgMap = cfg.reduce((a, r) => { a[r.setting_key] = r.setting_value; return a; }, {});

    if (cfgMap.qr_enabled === 'false') {
      return res.status(403).json({ success: false, error: 'QR check-in is currently disabled', code: 'QR_DISABLED' });
    }

    // Fall back to env secret if DB secret not yet set
    const QR_SECRET = (cfgMap.qr_secret && cfgMap.qr_secret.length > 0)
      ? cfgMap.qr_secret
      : (process.env.QR_SECRET || process.env.DEVICE_SECRET);

    if (!QR_SECRET) {
      return res.status(500).json({ success: false, error: 'QR signing key not configured' });
    }

    const officeId = req.query.officeId || 'default';

    const signature = crypto
      .createHmac('sha256', QR_SECRET)
      .update(`static:attendance:${officeId}`)
      .digest('hex');
    const qrToken = JSON.stringify({ type: 'static-attendance', officeId, sig: signature });

    const qrImage = await QRCode.toDataURL(qrToken);
    res.json({
      success: true,
      data: { qrCode: qrImage, qrToken, officeId, expiresIn: null }
    });
  } catch (error) {
    logger.error('Get QR code error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate QR code' });
  }
};

async function respondQrAttendance(req, res, result, action) {
  const userId = req.user.id;
  if (!result.ok) {
    return res.status(result.status || 400).json({
      success: false,
      error: result.error,
      code: result.code,
    });
  }

  if (action === 'CHECK_IN' || (result.record && !result.record.clock_out_time)) {
    const { record, status, isLate, phase } = result;
    await auditLog(userId, 'QR_CHECK_IN', 'attendance', record.id, {
      qrVerified: true,
      status,
      location: { latitude: req.body.latitude, longitude: req.body.longitude },
    }, req);

    const payload = {
      action: 'CHECKED_IN',
      method: 'STATIC_QR',
      userId,
      userName: req.user.fullName,
      status,
      phase: phase || 'CHECKED_IN',
      time: record.clock_in_time,
      record: { id: record.id, clockInTime: record.clock_in_time, status: record.status },
    };
    socketService.emitToUser(userId, socketService.EVENTS.ATTENDANCE_UPDATE, payload);
    socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, payload);

    if (isLate) {
      await notifyLateCheckIn(req.app, {
        userId,
        userName: req.user.fullName,
        checkInTime: record.clock_in_time,
        minutesLate: 0,
      });
    }

    return res.json({
      success: true,
      message: isLate ? 'QR check-in (Late)' : 'QR check-in successful',
      data: {
        id: record.id,
        clockInTime: record.clock_in_time,
        status: record.status,
        phase: phase || 'CHECKED_IN',
        isLate,
        officeName: record.checkin_office_name ?? null,
        officeId:   record.checkin_office_id   ?? null,
      },
    });
  }

  const { record, hoursWorked, overtimeHours, phase } = result;
  await auditLog(userId, 'QR_CHECK_OUT', 'attendance', record.id, { hoursWorked, overtimeHours }, req);
  const payload = {
    action: 'CHECKED_OUT',
    method: 'STATIC_QR',
    userId,
    userName: req.user.fullName,
    phase: phase || 'CHECKED_OUT',
    record: {
      id: record.id,
      clockOutTime: record.clock_out_time,
      hoursWorked,
      overtimeHours,
      status: record.status,
    },
  };
  socketService.emitToUser(userId, socketService.EVENTS.ATTENDANCE_UPDATE, payload);
  socketService.emitToHR(socketService.EVENTS.ATTENDANCE_UPDATE, payload);

  return res.json({
    success: true,
    message: 'QR check-out successful',
    data: {
      id: record.id,
      clockOutTime: record.clock_out_time,
      hoursWorked,
      overtimeHours,
      status: record.status,
      phase: phase || 'CHECKED_OUT',
      officeName: record.checkout_office_name ?? null,
      officeId:   record.checkout_office_id   ?? null,
    },
  });
}

// Verify QR attendance (static QR + office password)
const verifyQRCheckIn = async (req, res) => {
  try {
    const { qrData, latitude, longitude, qrPassword, action, gpsAccuracyM } = req.body;
    const act = (action || 'CHECK_IN').toUpperCase();

    const result = await engine.performQrAttendance({
      userId: req.user.id,
      userRole: req.user.role,
      qrData,
      qrPassword,
      latitude,
      longitude,
      gpsAccuracyM: gpsAccuracyM != null ? parseFloat(gpsAccuracyM) : undefined,
      action: act,
      req,
      deviceId: req.deviceId,
    });

    return respondQrAttendance(req, res, result, act);
  } catch (error) {
    logger.error('QR attendance error:', error);
    res.status(500).json({ success: false, error: 'QR attendance failed' });
  }
};

const submitQrAttendance = verifyQRCheckIn;

module.exports = {
  getAttendanceRecords,
  getMyAttendance,
  checkIn,
  checkOut,
  getTodayStatus,
  getAttendanceStats,
  manualCheckInOut,
  manualEntry,
  updateAttendance,
  getQRCode,
  verifyQRCheckIn,
  submitQrAttendance,
};
