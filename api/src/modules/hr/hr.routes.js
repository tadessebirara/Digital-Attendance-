const express = require('express');
const { body } = require('express-validator');
const hrController = require('./hr.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate, authorize('HR', 'ADMIN'));

// Employee management
router.get('/employees', hrController.getAllEmployees);
router.get('/employees/pending', hrController.getPendingEmployees);
router.post('/employees', [
  body('email').isEmail().normalizeEmail(),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('workingTimeType').optional().isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']),
], hrController.createEmployee);
router.post('/employees/:id/approve', hrController.approveEmployee);
router.post('/employees/:id/reject', hrController.rejectEmployee);

// Quick stats
router.get('/stats', hrController.getHRStats);

module.exports = router;
