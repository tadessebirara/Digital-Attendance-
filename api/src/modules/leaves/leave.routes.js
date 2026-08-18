const express = require('express');
const { body } = require('express-validator');
const leaveController = require('./leave.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// Get my leave requests
router.get('/my', leaveController.getMyLeaves);

// Get leave balance
router.get('/balance', leaveController.getLeaveBalance);

// Get all leave requests (HR only — Admin has read access too)
router.get('/', authorize('ADMIN', 'HR'), leaveController.getAllLeaves);

// Get pending leave requests (HR only)
router.get('/pending', authorize('HR'), leaveController.getPendingLeaves);

// Create leave request
router.post('/', [
  body('leaveType').isIn(['SICK', 'VACATION', 'PERSONAL', 'EMERGENCY', 'MATERNITY', 'PATERNITY']),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('reason').trim().notEmpty(),
  body('documentUrl').notEmpty().isString().withMessage('A supporting document URL is required'),
  body('description').optional().trim()
], leaveController.createLeave);

// Get leave by ID
router.get('/:id', leaveController.getLeaveById);

// Cancel my leave request
router.post('/:id/cancel', leaveController.cancelLeave);

// Approve leave (HR only)
router.post('/:id/approve', authorize('HR'), leaveController.approveLeave);

// Reject leave (HR only)
router.post('/:id/reject', authorize('HR'), [
  body('rejectionReason').trim().notEmpty()
], leaveController.rejectLeave);

// Update leave balance (HR only)
router.put('/balance/:userId', authorize('HR'), leaveController.updateLeaveBalance);

module.exports = router;
