const express = require('express');
const { body } = require('express-validator');
const deviceController = require('./device.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// Get my devices
router.get('/my', deviceController.getMyDevices);

// Get all devices (Admin/HR)
router.get('/', authorize('ADMIN', 'HR'), deviceController.getAllDevices);

// Get pending device requests (Admin/HR)
router.get('/pending', authorize('ADMIN', 'HR'), deviceController.getPendingRequests);

// FIX 1: Provision a per-device HMAC signing key.
router.post('/provision-key', deviceController.provisionDeviceKey);

// FIX 1 (device lifecycle): Rotate the per-device key (self-service, 30-day cadence).
router.post('/rotate-key', deviceController.rotateDeviceKey);

// FIX 1 (device lifecycle): Admin/HR revokes a device key + access (lost/stolen/terminated).
router.post('/revoke-key', authorize('ADMIN', 'HR'), deviceController.revokeDeviceKeyByAdmin);

// HR/Admin: force-reset an employee's primary device (stolen phone scenario)
// Clears primary_device_id so the employee can register a new device on next login.
router.post('/:userId/reset-primary', authorize('ADMIN', 'HR'), deviceController.resetPrimaryDevice);

// Register new device
router.post('/register', [
  body('deviceId').notEmpty(),
  body('deviceName').optional(),
  body('deviceModel').optional(),
  body('platform').optional(),
  body('osVersion').optional()
], deviceController.registerDevice);

// Approve device (Admin/HR)
router.post('/:id/approve', authorize('ADMIN', 'HR'), deviceController.approveDevice);

// Reject device (Admin/HR)
router.post('/:id/reject', authorize('ADMIN', 'HR'), [
  body('reason').optional()
], deviceController.rejectDevice);

// Revoke device (Admin/HR)
router.post('/:id/revoke', authorize('ADMIN', 'HR'), [
  body('reason').optional()
], deviceController.revokeDevice);

// Delete device (Admin)
router.delete('/:id', authorize('ADMIN'), deviceController.deleteDevice);

module.exports = router;
