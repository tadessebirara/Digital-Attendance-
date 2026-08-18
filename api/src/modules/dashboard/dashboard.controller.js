const { query } = require('../../config/database');
const logger = require('../../utils/logger');
const { isPublicHoliday } = require('../../services/schedule.service');

// Get employee dashboard
const getEmployeeDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    // Get today's attendance, monthly stats, leaves, announcements, and schedule — all in parallel
    const dayOfWeek = new Date().getDay();
    const [
      { rows: attendanceRows },
      { rows: statsRows },
      { rows: leaves },
      { rows: announcements },
      { rows: scheduleRows },
    ] = await Promise.all([
      query(`SELECT * FROM attendance_records WHERE user_id = $1 AND DATE(clock_in_time) = $2`, [userId, today]),
      query(`SELECT COUNT(*) as total_days, COUNT(*) FILTER (WHERE status = 'PRESENT') as present, COUNT(*) FILTER (WHERE status = 'ABSENT') as absent, COUNT(*) FILTER (WHERE status = 'LATE') as late FROM attendance_records WHERE user_id = $1 AND DATE(clock_in_time) >= $2`, [userId, monthStart]),
      query(`SELECT * FROM leave_requests WHERE user_id = $1 AND status = 'APPROVED' AND start_date >= $2 ORDER BY start_date ASC LIMIT 5`, [userId, today]),
      query(`SELECT id, title, content, type, priority, created_at FROM announcements WHERE is_active = true AND (target_roles IS NULL OR target_roles @> $1::jsonb) ORDER BY created_at DESC LIMIT 5`, [JSON.stringify([req.user.role])]),
      query(`SELECT * FROM user_schedules WHERE user_id = $1 AND day_of_week = $2`, [userId, dayOfWeek]),
    ]);

    const attendance = attendanceRows[0];
    const stats = statsRows[0];

    res.json({
      success: true,
      data: {
        today: {
          isCheckedIn: attendance ? true : false,
          checkInTime: attendance?.clock_in_time,
          checkOutTime: attendance?.clock_out_time,
          status: attendance?.status
        },
        thisMonth: {
          totalDays: parseInt(stats.total_days),
          present: parseInt(stats.present),
          absent: parseInt(stats.absent),
          late: parseInt(stats.late)
        },
        upcomingLeaves: leaves.map(l => ({
          id: l.id,
          leaveType: l.leave_type,
          startDate: l.start_date,
          endDate: l.end_date,
          days: l.days_requested
        })),
        announcements: announcements.map(a => ({
          id: a.id,
          title: a.title,
          content: a.content.substring(0, 100) + '...',
          type: a.type,
          priority: a.priority,
          createdAt: a.created_at
        })),
        todaySchedule: scheduleRows[0] ? {
          workStartTime: scheduleRows[0].work_start_time,
          workEndTime: scheduleRows[0].work_end_time,
          isWorkingDay: scheduleRows[0].is_working_day
        } : null
      }
    });
  } catch (error) {
    logger.error('Get employee dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
  }
};

// Get HR dashboard
const getHRDashboard = async (req, res) => {
  try {
    const today   = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat

    // ── Check if today is a public holiday ───────────────────────────────
    const holidayCheck = await isPublicHoliday(today);
    const isHolidayToday = holidayCheck.isHoliday;

    // Get counts — use ACTIVE employees only for accurate attendance rate
    const { rows: counts } = await query(
      `SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIVE') as total_employees,
        (SELECT COUNT(*) FROM users WHERE role = 'EMPLOYEE' AND status = 'PENDING_APPROVAL') as pending_employees,
        (SELECT COUNT(DISTINCT ar.user_id)
          FROM attendance_records ar
          JOIN users u ON ar.user_id = u.id
          WHERE DATE(ar.clock_in_time) = $1
            AND u.role = 'EMPLOYEE'
            AND u.status = 'ACTIVE'
            AND ar.status IN ('PRESENT', 'LATE', 'HALF_DAY')
        ) as present_today,
        (SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING') as pending_leaves,
        (SELECT COUNT(*) FROM user_devices WHERE status = 'PENDING') as pending_devices
      `,
      [todayStr]
    );

    // ── Today's attendance ─────────────────────────────────────────────────
    // Only show employees for whom today is actually a scheduled working day.
    // This prevents Sunday / holiday ghost-absences from appearing.
    //
    // Logic:
    //   1. If today is a global public holiday → show NO employees as absent
    //      (return only those who have a real check-in record, i.e. actually came in)
    //   2. If today is Saturday (dayOfWeek=6) or Sunday (dayOfWeek=0):
    //      - Only include employees whose user_schedules row for that day
    //        has is_working_day = TRUE (they have a custom weekend shift)
    //   3. Otherwise (Mon–Fri, not a holiday):
    //      - Include employees whose schedule row marks day as working,
    //        OR who have no schedule row (default Mon–Fri = working)
    //      - Exclude employees whose schedule row explicitly sets is_working_day = FALSE
    let todayAttendanceQuery;
    let queryParams;

    if (isHolidayToday) {
      // Public holiday: only show employees who actually checked in — no ghost absents
      todayAttendanceQuery = `
        SELECT
          ar.id,
          u.id        AS user_id,
          u.first_name,
          u.last_name,
          u.employee_id,
          u.department,
          ar.clock_in_time,
          ar.clock_out_time,
          ar.status
        FROM users u
        JOIN attendance_records ar
          ON ar.user_id = u.id
         AND DATE(ar.clock_in_time) = $1
        WHERE u.role = 'EMPLOYEE'
          AND u.status = 'ACTIVE'
        ORDER BY ar.clock_in_time DESC
        LIMIT 50`;
      queryParams = [todayStr];

    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Weekend: only show employees with an explicit working schedule for this weekday
      todayAttendanceQuery = `
        SELECT
          ar.id,
          u.id        AS user_id,
          u.first_name,
          u.last_name,
          u.employee_id,
          u.department,
          ar.clock_in_time,
          ar.clock_out_time,
          CASE
            WHEN ar.id IS NULL THEN 'ABSENT'
            ELSE ar.status
          END AS status
        FROM users u
        -- Employee must have an explicit schedule row that marks this weekend day as working
        JOIN user_schedules us
          ON us.user_id = u.id
         AND us.day_of_week = $2
         AND us.is_working_day = TRUE
        LEFT JOIN attendance_records ar
          ON ar.user_id = u.id
         AND DATE(ar.clock_in_time) = $1
        WHERE u.role = 'EMPLOYEE'
          AND u.status = 'ACTIVE'
        ORDER BY
          CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END,
          ar.clock_in_time DESC
        LIMIT 50`;
      queryParams = [todayStr, dayOfWeek];

    } else {
      // Normal weekday (Mon–Fri): show all active employees except those
      // whose schedule explicitly marks today as a non-working day
      todayAttendanceQuery = `
        SELECT
          ar.id,
          u.id        AS user_id,
          u.first_name,
          u.last_name,
          u.employee_id,
          u.department,
          ar.clock_in_time,
          ar.clock_out_time,
          CASE
            WHEN ar.id IS NULL THEN 'ABSENT'
            ELSE ar.status
          END AS status
        FROM users u
        LEFT JOIN user_schedules us
          ON us.user_id = u.id
         AND us.day_of_week = $2
        LEFT JOIN attendance_records ar
          ON ar.user_id = u.id
         AND DATE(ar.clock_in_time) = $1
        WHERE u.role = 'EMPLOYEE'
          AND u.status = 'ACTIVE'
          -- Exclude employees whose schedule explicitly sets this weekday to non-working
          AND (us.is_working_day IS NULL OR us.is_working_day = TRUE)
        ORDER BY
          CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END,
          ar.clock_in_time DESC
        LIMIT 50`;
      queryParams = [todayStr, dayOfWeek];
    }

    const { rows: todayAttendance } = await query(todayAttendanceQuery, queryParams);

    // Get pending approvals (leave + pending accounts)
    const { rows: pendingApprovals } = await query(
      `SELECT 'EMPLOYEE' as type, id, first_name, last_name, email, created_at, null as request_type
       FROM users WHERE status = 'PENDING_APPROVAL'
       UNION ALL
       SELECT 'LEAVE' as type, lr.id, u.first_name, u.last_name, u.email, lr.created_at, lr.leave_type as request_type
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        counts: {
          totalEmployees: parseInt(counts[0].total_employees),
          pendingEmployees: parseInt(counts[0].pending_employees),
          presentToday: parseInt(counts[0].present_today),
          pendingLeaves: parseInt(counts[0].pending_leaves),
          pendingDevices: parseInt(counts[0].pending_devices),
        },
        todayMeta: {
          isHoliday:   isHolidayToday,
          holiday:     holidayCheck.holiday ?? null,
          isWeekend:   dayOfWeek === 0 || dayOfWeek === 6,
          dayOfWeek,
          date:        todayStr,
        },
        todayAttendance: todayAttendance.map(a => ({
          id: a.id,
          userId: a.user_id,
          employeeName: `${a.first_name} ${a.last_name}`,
          employeeId: a.employee_id,
          department: a.department,
          checkInTime:  a.clock_in_time  ?? null,
          checkOutTime: a.clock_out_time ?? null,
          status: a.status,
        })),
        pendingApprovals: pendingApprovals.map(a => ({
          type: a.type,
          id: a.id,
          name: `${a.first_name} ${a.last_name}`,
          email: a.email,
          requestType: a.request_type,
          createdAt: a.created_at,
        })),
      },
    });
  } catch (error) {
    logger.error('Get HR dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
  }
};

// Get admin dashboard
const getAdminDashboard = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get system stats
    const { rows: stats } = await query(
      `SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'ADMIN') as total_admins,
        (SELECT COUNT(*) FROM users WHERE role = 'HR') as total_hr,
        (SELECT COUNT(*) FROM users WHERE role = 'EMPLOYEE') as total_employees,
        (SELECT COUNT(*) FROM users WHERE status IN ('PENDING','PENDING_APPROVAL')) as pending_users,
        (SELECT COUNT(*) FROM attendance_records WHERE DATE(clock_in_time) = $1) as checkins_today,
        (SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours') as audit_logs_24h
      `,
      [today]
    );

    // Get monthly attendance stats
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { rows: monthlyStats } = await query(
      `SELECT 
        DATE(clock_in_time) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'PRESENT') as present,
        COUNT(*) FILTER (WHERE status = 'LATE') as late,
        COUNT(*) FILTER (WHERE status = 'ABSENT') as absent
       FROM attendance_records
       WHERE DATE(clock_in_time) >= $1
       GROUP BY DATE(clock_in_time)
       ORDER BY date`,
      [monthStart]
    );

    res.json({
      success: true,
      data: {
        systemStats: {
          totalUsers: parseInt(stats[0].total_users),
          totalAdmins: parseInt(stats[0].total_admins),
          totalHR: parseInt(stats[0].total_hr),
          totalEmployees: parseInt(stats[0].total_employees),
          pendingUsers: parseInt(stats[0].pending_users),
          checkinsToday: parseInt(stats[0].checkins_today),
          auditLogs24h: parseInt(stats[0].audit_logs_24h),
          unresolvedAlerts: 0
        },
        monthlyAttendance: monthlyStats.map(s => ({
          date: s.date,
          total: parseInt(s.total),
          present: parseInt(s.present),
          late: parseInt(s.late),
          absent: parseInt(s.absent)
        }))
      }
    });
  } catch (error) {
    logger.error('Get admin dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
  }
};

// Get today summary
const getTodaySummary = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { rows: summary } = await query(
      `SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIVE') as total_employees,
        (SELECT COUNT(*) FROM attendance_records WHERE DATE(clock_in_time) = $1) as present_count,
        (SELECT COUNT(*) FROM leave_requests WHERE status = 'APPROVED' AND $1 BETWEEN start_date AND end_date) as on_leave_count,
        (SELECT COUNT(DISTINCT user_id) FROM attendance_records WHERE DATE(clock_in_time) = $1 AND status = 'LATE') as late_count
      `,
      [today]
    );

    const s = summary[0];
    const absentCount = parseInt(s.total_employees) - parseInt(s.present_count);

    res.json({
      success: true,
      data: {
        date: today,
        totalEmployees: parseInt(s.total_employees),
        present: parseInt(s.present_count),
        absent: absentCount > 0 ? absentCount : 0,
        late: parseInt(s.late_count),
        onLeave: parseInt(s.on_leave_count)
      }
    });
  } catch (error) {
    logger.error('Get today summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch summary' });
  }
};

module.exports = {
  getEmployeeDashboard,
  getHRDashboard,
  getAdminDashboard,
  getTodaySummary
};
