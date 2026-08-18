const { query, transaction } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');
const { notifyLeaveRequest } = require('../../services/hr-notification.service');
const { WRITE_CONTEXT } = require('../../utils/attendance-resolver');
const socketService = require('../../services/socket.service');

// Get my leave requests
const getMyLeaves = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let params = [userId];
    let paramIndex = 2;
    let statusFilter = '';

    if (status) {
      statusFilter = `AND status = $${paramIndex++}`;
      params.push(status);
    }

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM leave_requests WHERE user_id = $1 ${statusFilter}`,
      params
    );
    const total = parseInt(countRows[0].count);

    const { rows: leaves } = await query(
      `SELECT lr.*, 
              approver.first_name as approver_first_name, 
              approver.last_name as approver_last_name
       FROM leave_requests lr
       LEFT JOIN users approver ON lr.approved_by = approver.id
       WHERE lr.user_id = $1 ${statusFilter}
       ORDER BY lr.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: leaves.map(l => ({
        id: l.id,
        leaveType: l.leave_type,
        startDate: l.start_date,
        endDate: l.end_date,
        daysRequested: l.days_requested,
        reason: l.reason,
        status: l.status,
        approvedBy: l.approved_by ? {
          id: l.approved_by,
          firstName: l.approver_first_name,
          lastName: l.approver_last_name
        } : null,
        approvedAt: l.approved_at,
        rejectionReason: l.rejection_reason,
        createdAt: l.created_at
      })),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: offset + leaves.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Get my leaves error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leave requests' });
  }
};

// Get leave balance
const getLeaveBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const year = new Date().getFullYear();

    const { rows: balances } = await query(
      `SELECT * FROM leave_balances WHERE user_id = $1 AND year = $2`,
      [userId, year]
    );

    // If no balance exists, create default
    if (balances.length === 0) {
      const defaultBalances = [
        { type: 'SICK', total: 10 },
        { type: 'VACATION', total: 15 },
        { type: 'PERSONAL', total: 5 },
        { type: 'EMERGENCY', total: 3 }
      ];

      for (const bal of defaultBalances) {
        await query(
          `INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, remaining_days, year)
           VALUES ($1, $2, $3, 0, $3, $4)`,
          [userId, bal.type, bal.total, year]
        );
      }

      const { rows: newBalances } = await query(
        `SELECT * FROM leave_balances WHERE user_id = $1 AND year = $2`,
        [userId, year]
      );

      return res.json({
        success: true,
        data: newBalances.map(b => ({
          leaveType: b.leave_type,
          totalDays: b.total_days,
          usedDays: b.used_days,
          remainingDays: b.remaining_days,
          year: b.year
        }))
      });
    }

    res.json({
      success: true,
      data: balances.map(b => ({
        leaveType: b.leave_type,
        totalDays: b.total_days,
        usedDays: b.used_days,
        remainingDays: b.remaining_days,
        year: b.year
      }))
    });
  } catch (error) {
    logger.error('Get leave balance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leave balance' });
  }
};

// Get all leaves (Admin/HR)
const getAllLeaves = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, userId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`lr.status = $${paramIndex++}`);
      params.push(status);
    }
    if (userId) {
      whereConditions.push(`lr.user_id = $${paramIndex++}`);
      params.push(parseInt(userId));
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM leave_requests lr ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].count);

    const { rows: leaves } = await query(
      `SELECT lr.*, 
              u.first_name, u.last_name, u.email, u.employee_id, u.department,
              approver.first_name as approver_first_name, 
              approver.last_name as approver_last_name
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       LEFT JOIN users approver ON lr.approved_by = approver.id
       ${whereClause}
       ORDER BY lr.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: leaves.map(l => ({
        id: l.id,
        userId: l.user_id,
        user: {
          id: l.user_id,
          firstName: l.first_name,
          lastName: l.last_name,
          fullName: `${l.first_name} ${l.last_name}`,
          email: l.email,
          employeeId: l.employee_id,
          department: l.department
        },
        leaveType: l.leave_type,
        startDate: l.start_date,
        endDate: l.end_date,
        daysRequested: l.days_requested,
        reason: l.reason,
        documentUrl: l.document_url || null,
        description: l.description || null,
        status: l.status,
        approvedBy: l.approved_by ? {
          id: l.approved_by,
          firstName: l.approver_first_name,
          lastName: l.approver_last_name
        } : null,
        approvedAt: l.approved_at,
        rejectionReason: l.rejection_reason,
        createdAt: l.created_at
      })),
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: offset + leaves.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Get all leaves error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leave requests' });
  }
};

// Get pending leaves
const getPendingLeaves = async (req, res) => {
  try {
    const { rows: leaves } = await query(
      `SELECT lr.*, 
              u.first_name, u.last_name, u.email, u.employee_id, u.department
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE lr.status = 'PENDING'
       ORDER BY lr.created_at DESC`
    );

    res.json({
      success: true,
      data: leaves.map(l => ({
        id: l.id,
        userId: l.user_id,
        user: {
          id: l.user_id,
          firstName: l.first_name,
          lastName: l.last_name,
          fullName: `${l.first_name} ${l.last_name}`,
          email: l.email,
          employeeId: l.employee_id,
          department: l.department
        },
        leaveType: l.leave_type,
        startDate: l.start_date,
        endDate: l.end_date,
        daysRequested: l.days_requested,
        reason: l.reason,
        status: l.status,
        createdAt: l.created_at
      }))
    });
  } catch (error) {
    logger.error('Get pending leaves error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending leaves' });
  }
};

// Create leave request
const createLeave = async (req, res) => {
  try {
    const { validationResult } = require('express-validator');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array().map(e => e.msg).join(', ')
      });
    }

    const userId = req.user.id;
    const { leaveType, startDate, endDate, reason, documentUrl, description } = req.body;

    // documentUrl is required
    if (!documentUrl || !String(documentUrl).trim()) {
      return res.status(400).json({
        success: false,
        error: 'A supporting document is required'
      });
    }

    // Calculate days requested
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysRequested = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    if (daysRequested <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date range'
      });
    }

    // Check for overlapping leave requests
    const { rows: overlapping } = await query(
      `SELECT id FROM leave_requests 
       WHERE user_id = $1 AND status IN ('PENDING', 'APPROVED')
       AND (start_date, end_date) OVERLAPS ($2, $3)`,
      [userId, startDate, endDate]
    );

    if (overlapping.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'You already have a leave request for these dates'
      });
    }

    const { rows: leaves } = await query(
      `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, days_requested, reason, document_url, description, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', NOW())
       RETURNING *`,
      [userId, leaveType, startDate, endDate, daysRequested, reason, documentUrl || null, description || null]
    );

    const leave = leaves[0];

    await auditLog(userId, 'LEAVE_REQUESTED', 'leave_requests', leave.id, {
      leaveType,
      startDate,
      endDate,
      daysRequested,
      hasDocument: !!documentUrl
    }, req);

    // Notify HR/Admin
    const leaveEventPayload = {
      action: 'CREATED',
      leaveId: leave.id,
      userId,
      userName: req.user.fullName,
      leaveType,
      daysRequested,
      startDate,
      endDate,
      status: leave.status
    };
    socketService.emitToHR(socketService.EVENTS.LEAVE_REQUEST, leaveEventPayload);
    socketService.emitToHR(socketService.EVENTS.LEAVE_UPDATE, leaveEventPayload);

    // HR notification
    await notifyLeaveRequest(req.app, {
      userId, userName: req.user.fullName,
      leaveType, startDate, endDate, days: daysRequested
    });

    res.status(201).json({
      success: true,
      message: 'Leave request submitted',
      data: {
        id: leave.id,
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        daysRequested: leave.days_requested,
        reason: leave.reason,
        documentUrl: leave.document_url,
        description: leave.description,
        status: leave.status,
        createdAt: leave.created_at
      }
    });
  } catch (error) {
    logger.error('Create leave error:', error);
    res.status(500).json({ success: false, error: 'Failed to create leave request' });
  }
};

// Get leave by ID
const getLeaveById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const { rows: leaves } = await query(
      `SELECT lr.*, 
              u.first_name, u.last_name, u.email, u.employee_id,
              approver.first_name as approver_first_name, 
              approver.last_name as approver_last_name
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       LEFT JOIN users approver ON lr.approved_by = approver.id
       WHERE lr.id = $1`,
      [id]
    );

    if (leaves.length === 0) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }

    const leave = leaves[0];

    // Check permissions
    if (leave.user_id !== userId && !['ADMIN', 'HR'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({
      success: true,
      data: {
        id: leave.id,
        userId: leave.user_id,
        user: {
          id: leave.user_id,
          firstName: leave.first_name,
          lastName: leave.last_name,
          fullName: `${leave.first_name} ${leave.last_name}`,
          email: leave.email,
          employeeId: leave.employee_id
        },
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        daysRequested: leave.days_requested,
        reason: leave.reason,
        status: leave.status,
        approvedBy: leave.approved_by ? {
          id: leave.approved_by,
          firstName: leave.approver_first_name,
          lastName: leave.approver_last_name
        } : null,
        approvedAt: leave.approved_at,
        rejectionReason: leave.rejection_reason,
        createdAt: leave.created_at
      }
    });
  } catch (error) {
    logger.error('Get leave by ID error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leave request' });
  }
};

// Cancel leave
const cancelLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { rows: leaves } = await query(
      'SELECT * FROM leave_requests WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (leaves.length === 0) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }

    const leave = leaves[0];

    if (leave.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel approved leave. Contact HR.'
      });
    }

    if (leave.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        error: 'Leave request already cancelled'
      });
    }

    await query(
      "UPDATE leave_requests SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await auditLog(userId, 'LEAVE_CANCELLED', 'leave_requests', parseInt(id), {}, req);

    res.json({
      success: true,
      message: 'Leave request cancelled'
    });
  } catch (error) {
    logger.error('Cancel leave error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel leave' });
  }
};

// Approve leave
const approveLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const approverId = req.user.id;

    const { rows: leaves } = await query(
      'SELECT * FROM leave_requests WHERE id = $1',
      [id]
    );

    if (leaves.length === 0) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }

    const leave = leaves[0];

    if (leave.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: `Leave request is already ${leave.status.toLowerCase()}`
      });
    }

    // Pass session context so the DB trigger derives write_context = SYSTEM_RECONCILIATION
    // and logs actor info into attendance_events atomically.
    await transaction(async (client) => {
      await client.query(
        `UPDATE leave_requests 
         SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [approverId, id]
      );

      // Leave balance tracking disabled — unlimited leaves allowed
      // await client.query(
      //   `UPDATE leave_balances 
      //    SET used_days = used_days + $1, remaining_days = remaining_days - $1
      //    WHERE user_id = $2 AND leave_type = $3 AND year = $4`,
      //   [leave.days_requested, leave.user_id, leave.leave_type, new Date().getFullYear()]
      // );
      // FIX 9 + FIX 6: Reconcile attendance records for the approved leave period.
      //
      // Attendance precedence rule (highest → lowest):
      //   MANUAL (admin override) > PRESENT/LATE > EXCUSED (leave) > ABSENT
      //
      // Only ABSENT records are overridden — PRESENT and LATE records are preserved.
      // write_context = SYSTEM_RECONCILIATION so the trigger knows this is a batch
      // job and will not override MANUAL or existing LEAVE records.
      await client.query(
        `UPDATE attendance_records
         SET status        = 'EXCUSED',
             source        = 'LEAVE',
             write_context = $5,
             notes         = COALESCE(notes, '') || ' [Auto-excused: leave approved #' || $1 || ']'
         WHERE user_id = $2
           AND DATE(clock_in_time) BETWEEN $3 AND $4
           AND status = 'ABSENT'
           AND source != 'MANUAL'`,
        [id, leave.user_id, leave.start_date, leave.end_date, WRITE_CONTEXT.SYSTEM_RECONCILIATION]
      );

      // Insert EXCUSED placeholder records for leave days that have NO attendance
      // record at all (employee was absent with no clock-in attempt).
      await client.query(
        `INSERT INTO attendance_records (user_id, clock_in_time, status, notes, source, write_context, created_at)
         SELECT $1,
                gs::timestamp,
                'EXCUSED',
                'Auto-created: leave approved #' || $2,
                'LEAVE',
                $5,
                NOW()
         FROM generate_series($3::date, $4::date, '1 day'::interval) gs
         WHERE NOT EXISTS (
           SELECT 1 FROM attendance_records ar2
           WHERE ar2.user_id = $1
             AND DATE(ar2.clock_in_time) = gs::date
         )`,
        [leave.user_id, id, leave.start_date, leave.end_date, WRITE_CONTEXT.SYSTEM_RECONCILIATION]
      );
    }, { actorRole: 'SYSTEM', actorId: approverId, rulesVersion: 'v2' });

    await auditLog(approverId, 'LEAVE_APPROVED', 'leave_requests', parseInt(id), {
      userId: leave.user_id,
      daysApproved: leave.days_requested
    }, req);

    // Notify user
    const approvedPayload = {
      action: 'APPROVED',
      leaveId: leave.id,
      status: 'APPROVED',
      approvedBy: approverId,
      approvedAt: new Date(),
      userId: leave.user_id
    };
    socketService.emitToUser(leave.user_id, socketService.EVENTS.LEAVE_UPDATE, approvedPayload);
    socketService.emitToHR(socketService.EVENTS.LEAVE_UPDATE, approvedPayload);

    res.json({
      success: true,
      message: 'Leave request approved'
    });
  } catch (error) {
    logger.error('Approve leave error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve leave' });
  }
};

// Reject leave
const rejectLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const approverId = req.user.id;

    const { rows: leaves } = await query(
      'SELECT * FROM leave_requests WHERE id = $1',
      [id]
    );

    if (leaves.length === 0) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }

    const leave = leaves[0];

    if (leave.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: `Leave request is already ${leave.status.toLowerCase()}`
      });
    }

    await query(
      `UPDATE leave_requests 
       SET status = 'REJECTED', rejection_reason = $1, approved_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [rejectionReason, approverId, id]
    );

    await auditLog(approverId, 'LEAVE_REJECTED', 'leave_requests', parseInt(id), {
      userId: leave.user_id,
      rejectionReason
    }, req);

    // Notify user
    const rejectedPayload = {
      action: 'REJECTED',
      leaveId: leave.id,
      status: 'REJECTED',
      rejectionReason,
      rejectedBy: approverId,
      userId: leave.user_id
    };
    socketService.emitToUser(leave.user_id, socketService.EVENTS.LEAVE_UPDATE, rejectedPayload);
    socketService.emitToHR(socketService.EVENTS.LEAVE_UPDATE, rejectedPayload);

    res.json({
      success: true,
      message: 'Leave request rejected'
    });
  } catch (error) {
    logger.error('Reject leave error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject leave' });
  }
};

// Update leave balance
const updateLeaveBalance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { leaveType, totalDays } = req.body;
    const year = new Date().getFullYear();

    const { rows: existing } = await query(
      `SELECT used_days FROM leave_balances WHERE user_id = $1 AND leave_type = $2 AND year = $3`,
      [userId, leaveType, year]
    );

    if (existing.length > 0) {
      const usedDays = existing[0].used_days;
      const remainingDays = Math.max(0, totalDays - usedDays);

      await query(
        `UPDATE leave_balances 
         SET total_days = $1, remaining_days = $2, updated_at = NOW()
         WHERE user_id = $3 AND leave_type = $4 AND year = $5`,
        [totalDays, remainingDays, userId, leaveType, year]
      );
    } else {
      await query(
        `INSERT INTO leave_balances (user_id, leave_type, total_days, used_days, remaining_days, year)
         VALUES ($1, $2, $3, 0, $3, $4)`,
        [userId, leaveType, totalDays, year]
      );
    }

    await auditLog(req.user.id, 'LEAVE_BALANCE_UPDATED', 'leave_balances', parseInt(userId), {
      leaveType,
      totalDays
    }, req);

    res.json({
      success: true,
      message: 'Leave balance updated'
    });
  } catch (error) {
    logger.error('Update leave balance error:', error);
    res.status(500).json({ success: false, error: 'Failed to update leave balance' });
  }
};

module.exports = {
  getMyLeaves,
  getLeaveBalance,
  getAllLeaves,
  getPendingLeaves,
  createLeave,
  getLeaveById,
  cancelLeave,
  approveLeave,
  rejectLeave,
  updateLeaveBalance
};
