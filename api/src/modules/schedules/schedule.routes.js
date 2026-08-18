const express = require('express');
const { body } = require('express-validator');
const scheduleController = require('./schedule.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// Get my schedule
router.get('/my', scheduleController.getMySchedule);

// Get user's schedule (Admin/HR)
router.get('/user/:userId', authorize('ADMIN', 'HR'), scheduleController.getUserSchedule);

// Update my schedule (Admin only)
router.put('/my', authorize('ADMIN'), scheduleController.updateMySchedule);

// Update user schedule (Admin/HR)
router.put('/user/:userId', authorize('ADMIN', 'HR'), [
  body('schedules').isArray({ min: 1 })
], scheduleController.updateUserSchedule);

// Bulk update schedules (Admin/HR)
router.post('/bulk', authorize('ADMIN', 'HR'), scheduleController.bulkUpdateSchedules);

module.exports = router;
