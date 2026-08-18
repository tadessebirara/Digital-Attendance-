const { query, transaction } = require('../../config/database');
const logger = require('../../utils/logger');
const { auditLog } = require('../../services/audit.service');
const { getScheduleContext } = require('../../services/schedule.service');

// Get my schedule
const getMySchedule = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows: schedules } = await query(
      `SELECT * FROM user_schedules 
       WHERE user_id = $1 
       ORDER BY day_of_week`,
      [userId]
    );

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const policy = await getScheduleContext(userId);

    const { rows: settingsRows } = await query(
      'SELECT * FROM employee_schedule_settings WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      data: {
        shifts: schedules.map(s => ({
          id: s.id,
          dayOfWeek: s.day_of_week,
          dayName: dayNames[s.day_of_week],
          workStartTime: s.work_start_time,
          workEndTime: s.work_end_time,
          lateThresholdMinutes: s.late_threshold_minutes,
          graceMinutes: s.grace_minutes ?? s.late_threshold_minutes ?? 15,
          isWorkingDay: s.is_working_day,
          overnightShift: s.overnight_shift === true,
          qrRequired: s.qr_required,
          gpsRequired: s.gps_required,
        })),
        policy: {
          timezone: policy.timezone,
          graceMinutes: policy.graceMinutes,
          halfDayAfterMinutes: policy.halfDayAfterMinutes,
          autoAbsentAfterMinutes: policy.autoAbsentAfterMinutes,
          missedCheckoutAfterMinutes: policy.missedCheckoutAfterMinutes,
          autoCheckoutEnabled: policy.autoCheckoutEnabled,
          qrRequired: policy.qrRequired,
          gpsRequired: policy.gpsRequired,
          gpsRadiusMeters: policy.gpsRadiusMeters,
          today: {
            workStartTime: policy.workStartTime,
            workEndTime: policy.workEndTime,
            isWorkingDay: policy.isWorkingDay,
          },
        },
        settings: settingsRows[0] || null,
      },
    });
  } catch (error) {
    logger.error('Get my schedule error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch schedule' });
  }
};

// Get user schedule
const getUserSchedule = async (req, res) => {
  try {
    const { userId } = req.params;

    const { rows: schedules } = await query(
      `SELECT us.*, u.first_name, u.last_name
       FROM user_schedules us
       JOIN users u ON us.user_id = u.id
       WHERE us.user_id = $1 
       ORDER BY us.day_of_week`,
      [userId]
    );

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    res.json({
      success: true,
      data: {
        user: schedules.length > 0 ? {
          id: schedules[0].user_id,
          firstName: schedules[0].first_name,
          lastName: schedules[0].last_name
        } : null,
        schedules: schedules.map(s => ({
          id: s.id,
          dayOfWeek: s.day_of_week,
          dayName: dayNames[s.day_of_week],
          workStartTime: s.work_start_time,
          workEndTime: s.work_end_time,
          lateThresholdMinutes: s.late_threshold_minutes,
          isWorkingDay: s.is_working_day,
          scheduleType: s.schedule_type,
        }))
      }
    });
  } catch (error) {
    logger.error('Get user schedule error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch schedule' });
  }
};

// Update my schedule
const updateMySchedule = async (req, res) => {
  try {
    const userId = req.user.id;
    const { schedules } = req.body;

    await updateSchedules(userId, schedules);

    res.json({
      success: true,
      message: 'Schedule updated successfully'
    });
  } catch (error) {
    logger.error('Update my schedule error:', error);
    res.status(500).json({ success: false, error: 'Failed to update schedule' });
  }
};

// Update user schedule (HR/Admin sets an employee's schedule)
const updateUserSchedule = async (req, res) => {
  try {
    const { userId } = req.params;
    const { schedules, scheduleType } = req.body;

    await updateSchedules(parseInt(userId), schedules, scheduleType);

    await auditLog(req.user.id, 'SCHEDULE_UPDATED', 'schedules', parseInt(userId),
      { scheduleType, daysCount: schedules.length }, req);

    // Push schedule to the employee's device in real-time via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('schedule_updated', {
        scheduleType: scheduleType || 'REGULAR',
        schedules: schedules.map(s => ({
          dayOfWeek: s.dayOfWeek,
          dayName: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][s.dayOfWeek],
          workStartTime: s.workStartTime,
          workEndTime: s.workEndTime,
          lateThresholdMinutes: s.lateThresholdMinutes || 15,
          isWorkingDay: s.isWorkingDay !== false,
        })),
        updatedAt: new Date().toISOString(),
        updatedBy: { id: req.user.id, name: `${req.user.firstName} ${req.user.lastName}` },
      });
    }

    res.json({ success: true, message: 'Schedule updated and sent to employee' });
  } catch (error) {
    logger.error('Update user schedule error:', error);
    res.status(500).json({ success: false, error: 'Failed to update schedule' });
  }
};

// Helper function to update schedules
const updateSchedules = async (userId, schedules, scheduleType) => {
  await transaction(async (client) => {
    await client.query('DELETE FROM user_schedules WHERE user_id = $1', [userId]);

    for (const schedule of schedules) {
      const grace = schedule.lateThresholdMinutes || schedule.graceMinutes || 15;
      await client.query(
        `INSERT INTO user_schedules
           (user_id, day_of_week, work_start_time, work_end_time,
            late_threshold_minutes, grace_minutes, is_working_day, schedule_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7, NOW(), NOW())`,
        [
          userId,
          schedule.dayOfWeek,
          schedule.workStartTime,
          schedule.workEndTime,
          grace,
          schedule.isWorkingDay !== false,
          scheduleType || 'REGULAR',
        ]
      );
    }

    // Derive summary values from the schedules array for employee_schedule_settings
    const workingRows = schedules.filter(s => s.isWorkingDay !== false);
    const firstWorking = workingRows[0] ?? schedules[0];
    const graceVal = firstWorking?.lateThresholdMinutes || firstWorking?.graceMinutes || 15;

    // Upsert employee_schedule_settings so getScheduleContext() always has per-employee policy
    await client.query(
      `INSERT INTO employee_schedule_settings
         (user_id, grace_minutes, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET grace_minutes = $2,
             updated_at    = NOW()`,
      [userId, graceVal]
    );
  });
};

// Bulk update schedules
const bulkUpdateSchedules = async (req, res) => {
  try {
    const { userIds, schedules, scheduleType } = req.body;

    for (const userId of userIds) {
      await updateSchedules(userId, schedules, scheduleType);
    }

    // Emit schedule_updated to each affected employee's personal socket room
    // so their mobile app immediately invalidates the schedule cache
    const io = req.app.get('io');
    if (io) {
      const schedulePayload = {
        scheduleType: scheduleType || 'REGULAR',
        schedules: schedules.map(s => ({
          dayOfWeek: s.dayOfWeek,
          workStartTime: s.workStartTime,
          workEndTime: s.workEndTime,
          lateThresholdMinutes: s.lateThresholdMinutes || 15,
          isWorkingDay: s.isWorkingDay !== false,
        })),
        updatedAt: new Date().toISOString(),
      };
      for (const userId of userIds) {
        io.to(`user_${userId}`).emit('schedule_updated', schedulePayload);
      }
    }

    res.json({
      success: true,
      message: `Schedules updated for ${userIds.length} users`
    });
  } catch (error) {
    logger.error('Bulk update schedules error:', error);
    res.status(500).json({ success: false, error: 'Failed to update schedules' });
  }
};

module.exports = {
  getMySchedule,
  getUserSchedule,
  updateMySchedule,
  updateUserSchedule,
  bulkUpdateSchedules
};
