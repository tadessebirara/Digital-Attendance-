const { query } = require('../../config/database');
const logger = require('../../utils/logger');

// ─── Generate Report ──────────────────────────────────────────────────────────
const generateReport = async (req, res) => {
  try {
    const { type, from, to, department, status } = req.query;

    const dateFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo   = to   || new Date().toISOString().split('T')[0];

    // Build parameterized WHERE conditions for attendance queries
    const conditions = [`DATE(ar.clock_in_time) BETWEEN $1 AND $2`, `u.status = 'ACTIVE'`];
    const params = [dateFrom, dateTo];
    let idx = 3;

    if (department && department !== 'All Departments') {
      conditions.push(`u.department = $${idx++}`);
      params.push(department);
    }
    if (status && status !== 'ALL') {
      conditions.push(`ar.status = $${idx++}`);
      params.push(status);
    }
    const whereClause = conditions.join(' AND ');

    // Parameterized conditions for user-only queries (no ar alias)
    const userConditions = [`u.status = 'ACTIVE'`, `u.role = 'EMPLOYEE'`];
    const userParams = [dateFrom, dateTo];
    let userIdx = 3;
    if (department && department !== 'All Departments') {
      userConditions.push(`u.department = $${userIdx++}`);
      userParams.push(department);
    }

    // Parameterized conditions for leave queries (lr alias)
    const leaveConditions = [`lr.created_at::date BETWEEN $1 AND $2`, `u.status = 'ACTIVE'`];
    const leaveParams = [dateFrom, dateTo];
    let leaveIdx = 3;
    if (department && department !== 'All Departments') {
      leaveConditions.push(`u.department = $${leaveIdx++}`);
      leaveParams.push(department);
    }
    if (status && status !== 'ALL') {
      leaveConditions.push(`lr.status = $${leaveIdx++}`);
      leaveParams.push(status);
    }
    const leaveWhereClause = leaveConditions.join(' AND ');

    let rows = [];

    switch (type) {
      case 'attendance_log': {
        const { rows: data } = await query(
          `SELECT
             u.employee_id   AS "Employee ID",
             u.first_name || ' ' || u.last_name AS "Employee Name",
             u.department    AS "Department",
             DATE(ar.clock_in_time)::text AS "Date",
             TO_CHAR(ar.clock_in_time, 'HH12:MI AM')  AS "Check In",
             TO_CHAR(ar.clock_out_time, 'HH12:MI AM') AS "Check Out",
             ROUND(ar.hours_worked::numeric, 2)::text  AS "Hours Worked",
             ar.status       AS "Status",
             ar.source       AS "Source"
           FROM attendance_records ar
           JOIN users u ON u.id = ar.user_id
           WHERE ${whereClause}
           ORDER BY ar.clock_in_time DESC
           LIMIT 1000`,
          params
        );
        rows = data;
        break;
      }

      case 'attendance_summary': {
        const summaryConditions = [`u.status = 'ACTIVE'`, `u.role = 'EMPLOYEE'`];
        const summaryParams = [dateFrom, dateTo];
        let summaryIdx = 3;
        if (department && department !== 'All Departments') {
          summaryConditions.push(`u.department = $${summaryIdx++}`);
          summaryParams.push(department);
        }
        const summaryWhere = summaryConditions.join(' AND ');
        const { rows: data } = await query(
          `SELECT
             u.employee_id   AS "Employee ID",
             u.first_name || ' ' || u.last_name AS "Employee Name",
             u.department    AS "Department",
             COUNT(*) FILTER (WHERE ar.status = 'PRESENT') AS "Present",
             COUNT(*) FILTER (WHERE ar.status = 'LATE')    AS "Late",
             COUNT(*) FILTER (WHERE ar.status = 'ABSENT')  AS "Absent",
             COUNT(*) FILTER (WHERE ar.status = 'EXCUSED') AS "Excused",
             COUNT(*)                                       AS "Total Days",
             ROUND(
               (COUNT(*) FILTER (WHERE ar.status IN ('PRESENT','LATE'))::numeric / NULLIF(COUNT(*),0)) * 100, 1
             )::text || '%' AS "Attendance Rate",
             ROUND(COALESCE(SUM(ar.hours_worked),0)::numeric, 1)::text AS "Total Hours"
           FROM users u
           LEFT JOIN attendance_records ar
             ON ar.user_id = u.id
            AND DATE(ar.clock_in_time) BETWEEN $1 AND $2
           WHERE ${summaryWhere}
           GROUP BY u.id, u.employee_id, u.first_name, u.last_name, u.department
           ORDER BY u.first_name`,
          summaryParams
        );
        rows = data;
        break;
      }

      case 'late_arrivals': {
        // late_arrivals only filters by dept (status is always 'LATE' in WHERE clause)
        const lateConditions = [`ar.status = 'LATE'`, `DATE(ar.clock_in_time) BETWEEN $1 AND $2`, `u.status = 'ACTIVE'`];
        const lateParams = [dateFrom, dateTo];
        let lateIdx = 3;
        if (department && department !== 'All Departments') {
          lateConditions.push(`u.department = $${lateIdx++}`);
          lateParams.push(department);
        }
        const lateWhere = lateConditions.join(' AND ');
        const { rows: data } = await query(
          `SELECT
             u.employee_id   AS "Employee ID",
             u.first_name || ' ' || u.last_name AS "Employee Name",
             u.department    AS "Department",
             DATE(ar.clock_in_time)::text AS "Date",
             TO_CHAR(ar.clock_in_time, 'HH12:MI AM') AS "Actual Check In",
             us.work_start_time::text AS "Scheduled Start",
             EXTRACT(EPOCH FROM (ar.clock_in_time - (DATE(ar.clock_in_time) + us.work_start_time)::timestamp)) / 60
               AS "Minutes Late"
           FROM attendance_records ar
           JOIN users u ON u.id = ar.user_id
           LEFT JOIN user_schedules us
             ON us.user_id = u.id
            AND us.day_of_week = EXTRACT(DOW FROM ar.clock_in_time)::int
           WHERE ${lateWhere}
           ORDER BY ar.clock_in_time DESC
           LIMIT 1000`,
          lateParams
        );
        rows = data.map(r => ({
          ...r,
          'Minutes Late': r['Minutes Late'] ? Math.round(Number(r['Minutes Late'])) : 0
        }));
        break;
      }

      case 'absent_employees': {
        const absentConditions = [`ar.status = 'ABSENT'`, `DATE(ar.clock_in_time) BETWEEN $1 AND $2`, `u.status = 'ACTIVE'`];
        const absentParams = [dateFrom, dateTo];
        let absentIdx = 3;
        if (department && department !== 'All Departments') {
          absentConditions.push(`u.department = $${absentIdx++}`);
          absentParams.push(department);
        }
        const absentWhere = absentConditions.join(' AND ');
        const { rows: data } = await query(
          `SELECT
             u.employee_id   AS "Employee ID",
             u.first_name || ' ' || u.last_name AS "Employee Name",
             u.department    AS "Department",
             DATE(ar.clock_in_time)::text AS "Date",
             ar.notes        AS "Notes"
           FROM attendance_records ar
           JOIN users u ON u.id = ar.user_id
           WHERE ${absentWhere}
           ORDER BY ar.clock_in_time DESC
           LIMIT 1000`,
          absentParams
        );
        rows = data;
        break;
      }

      case 'leave_summary': {
        const { rows: data } = await query(
          `SELECT
             u.employee_id   AS "Employee ID",
             u.first_name || ' ' || u.last_name AS "Employee Name",
             u.department    AS "Department",
             lr.leave_type   AS "Leave Type",
             lr.start_date::text AS "Start Date",
             lr.end_date::text   AS "End Date",
             lr.days_requested   AS "Days",
             lr.reason           AS "Reason",
             lr.status           AS "Status",
             CASE WHEN lr.document_url IS NOT NULL THEN 'Yes' ELSE 'No' END AS "Has Document",
             lr.created_at::date::text AS "Submitted On"
           FROM leave_requests lr
           JOIN users u ON u.id = lr.user_id
           WHERE ${leaveWhereClause}
           ORDER BY lr.created_at DESC
           LIMIT 1000`,
          leaveParams
        );
        rows = data;
        break;
      }

      case 'overtime': {
        const otConditions = [`ar.clock_out_time IS NOT NULL`, `ar.hours_worked > 8`, `DATE(ar.clock_in_time) BETWEEN $1 AND $2`, `u.status = 'ACTIVE'`];
        const otParams = [dateFrom, dateTo];
        let otIdx = 3;
        if (department && department !== 'All Departments') {
          otConditions.push(`u.department = $${otIdx++}`);
          otParams.push(department);
        }
        const otWhere = otConditions.join(' AND ');
        const { rows: data } = await query(
          `SELECT
             u.employee_id   AS "Employee ID",
             u.first_name || ' ' || u.last_name AS "Employee Name",
             u.department    AS "Department",
             DATE(ar.clock_in_time)::text AS "Date",
             TO_CHAR(ar.clock_in_time,  'HH12:MI AM') AS "Check In",
             TO_CHAR(ar.clock_out_time, 'HH12:MI AM') AS "Check Out",
             ROUND(ar.hours_worked::numeric, 2)::text AS "Total Hours",
             ROUND(GREATEST(ar.hours_worked - COALESCE(us.work_end_time - us.work_start_time, INTERVAL '8 hours'), INTERVAL '0')::numeric / 3600, 2)::text AS "Overtime Hours"
           FROM attendance_records ar
           JOIN users u ON u.id = ar.user_id
           LEFT JOIN user_schedules us
             ON us.user_id = u.id
            AND us.day_of_week = EXTRACT(DOW FROM ar.clock_in_time)::int
           WHERE ${otWhere}
           ORDER BY ar.clock_in_time DESC
           LIMIT 1000`,
          otParams
        );
        rows = data;
        break;
      }

      default:
        return res.status(400).json({ success: false, error: `Unknown report type: ${type}` });
    }

    res.json({ success: true, data: rows, meta: { type, from: dateFrom, to: dateTo, count: rows.length } });
  } catch (error) {
    logger.error('Generate report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
};

// Get Admin analytics
const getAdminAnalytics = async (req, res) => {
  try {
    const { range = '30' } = req.query;
    const days = parseInt(range);
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ success: false, error: 'Invalid range parameter (1–365)' });
    }

    // Get system stats + real avg attendance + real avg check-in time
    const { rows: systemStats } = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE') as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIVE') as total_employees,
        (SELECT COUNT(*) FROM attendance_records 
         WHERE DATE(clock_in_time) = CURRENT_DATE) as checkins_today,
        (SELECT COUNT(*) FROM suspicious_activities WHERE is_resolved = false) as unresolved_alerts,
        (SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING') as pending_leaves,
        -- Real avg attendance rate: (present+late) / total records in range
        ROUND(
          (SELECT COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE','CHECKED_OUT','AUTO_CHECKOUT'))
           FROM attendance_records
           WHERE clock_in_time >= CURRENT_DATE - ($1 || ' days')::interval
          )::numeric
          / NULLIF(
            (SELECT COUNT(*) FROM attendance_records
             WHERE clock_in_time >= CURRENT_DATE - ($1 || ' days')::interval),
            0
          ) * 100, 1
        ) as avg_attendance_pct,
        -- Real avg check-in time (HH:MM AM/PM) over the range
        TO_CHAR(
          (SELECT AVG(clock_in_time::time) FROM attendance_records
           WHERE clock_in_time >= CURRENT_DATE - ($1 || ' days')::interval
             AND status != 'ABSENT'),
          'HH12:MI AM'
        ) as avg_checkin_time
    `, [days]);

    // Get attendance trend (parameterized interval — no string interpolation)
    const { rows: attendanceTrend } = await query(`
      SELECT 
        DATE(clock_in_time) as date,
        COUNT(*) FILTER (WHERE status = 'PRESENT') as present,
        COUNT(*) FILTER (WHERE status = 'LATE') as late,
        COUNT(*) FILTER (WHERE status = 'ABSENT') as absent
      FROM attendance_records
      WHERE clock_in_time >= CURRENT_DATE - ($1 || ' days')::interval
      GROUP BY DATE(clock_in_time)
      ORDER BY date ASC
    `, [days.toString()]);

    // Get department distribution
    const { rows: byDepartment } = await query(`
      SELECT 
        department as name,
        COUNT(*) as value
      FROM users
      WHERE status = 'ACTIVE' AND department IS NOT NULL
      GROUP BY department
      ORDER BY COUNT(*) DESC
    `);

    const s = systemStats[0];
    res.json({
      success: true,
      data: {
        systemStats: s,
        attendanceTrend: attendanceTrend.map(r => ({
          date: new Date(r.date).toLocaleDateString(),
          present: parseInt(r.present),
          late: parseInt(r.late),
          absent: parseInt(r.absent)
        })),
        byDepartment: byDepartment.map((r, i) => ({
          name: r.name,
          value: parseInt(r.value),
          color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][i % 5]
        })),
        totalEmployees: parseInt(s.total_employees),
        avgAttendance: s.avg_attendance_pct ? `${s.avg_attendance_pct}%` : '—',
        avgCheckIn: s.avg_checkin_time || '—',
        leaveRequests: parseInt(s.pending_leaves || 0),
      }
    });
  } catch (error) {
    logger.error('Get admin analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
};

// Get HR analytics
const getHRAnalytics = async (req, res) => {
  try {
    const { range = '30' } = req.query;
    const days = parseInt(range);
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ success: false, error: 'Invalid range parameter (1–365)' });
    }

    // Get HR stats + real computed averages
    const { rows: stats } = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIVE') as total_employees,
        (SELECT COUNT(*) FROM attendance_records 
         WHERE DATE(clock_in_time) = CURRENT_DATE AND status IN ('PRESENT','LATE','CHECKED_OUT','AUTO_CHECKOUT')) as present_today,
        (SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING') as pending_leaves,
        (SELECT COUNT(*) FROM device_approval_requests WHERE status = 'PENDING') as pending_devices,
        ROUND(
          (SELECT COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE','CHECKED_OUT','AUTO_CHECKOUT'))
           FROM attendance_records
           WHERE clock_in_time >= CURRENT_DATE - ($1 || ' days')::interval
          )::numeric
          / NULLIF(
            (SELECT COUNT(*) FROM attendance_records
             WHERE clock_in_time >= CURRENT_DATE - ($1 || ' days')::interval),
            0
          ) * 100, 1
        ) as avg_attendance_pct,
        TO_CHAR(
          (SELECT AVG(clock_in_time::time) FROM attendance_records
           WHERE clock_in_time >= CURRENT_DATE - ($1 || ' days')::interval
             AND status != 'ABSENT'),
          'HH12:MI AM'
        ) as avg_checkin_time
    `, [days]);

    // Get attendance trend
    const { rows: attendanceTrend } = await query(`
      SELECT 
        DATE(clock_in_time) as date,
        COUNT(*) FILTER (WHERE status = 'PRESENT') as present,
        COUNT(*) FILTER (WHERE status = 'LATE') as late,
        COUNT(*) FILTER (WHERE status = 'ABSENT') as absent
      FROM attendance_records
      WHERE clock_in_time >= CURRENT_DATE - ($1 || ' days')::interval
      GROUP BY DATE(clock_in_time)
      ORDER BY date ASC
    `, [days.toString()]);

    // Get leave distribution (parameterized interval)
    const { rows: leaveByType } = await query(`
      SELECT 
        leave_type as name,
        COUNT(*) as value
      FROM leave_requests
      WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval
      GROUP BY leave_type
      ORDER BY COUNT(*) DESC
    `, [days.toString()]);

    const s = stats[0];
    res.json({
      success: true,
      data: {
        totalEmployees: parseInt(s.total_employees),
        presentToday: parseInt(s.present_today),
        pendingDevices: parseInt(s.pending_devices),
        avgAttendance: s.avg_attendance_pct ? `${s.avg_attendance_pct}%` : '—',
        avgCheckIn: s.avg_checkin_time || '—',
        leaveRequests: parseInt(s.pending_leaves),
        attendanceTrend: attendanceTrend.map(r => ({
          date: new Date(r.date).toLocaleDateString(),
          present: parseInt(r.present),
          late: parseInt(r.late),
          absent: parseInt(r.absent)
        })),
        leaveByType: leaveByType.map((r, i) => ({
          name: r.name.replace('_', ' '),
          value: parseInt(r.value),
          color: ['#EF4444', '#3B82F6', '#10B981', '#F59E0B'][i % 4]
        }))
      }
    });
  } catch (error) {
    logger.error('Get HR analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
};

module.exports = {
  getAdminAnalytics,
  getHRAnalytics,
  generateReport
};
