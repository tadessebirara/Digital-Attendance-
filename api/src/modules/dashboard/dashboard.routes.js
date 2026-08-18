const express = require('express');
const dashboardController = require('./dashboard.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// Get employee dashboard
router.get('/employee', authorize('EMPLOYEE', 'HR', 'ADMIN'), dashboardController.getEmployeeDashboard);

// Get HR dashboard
router.get('/hr', authorize('HR', 'ADMIN'), dashboardController.getHRDashboard);

// Get Admin dashboard
router.get('/admin', authorize('ADMIN'), dashboardController.getAdminDashboard);

// Get today's summary
router.get('/today', dashboardController.getTodaySummary);

module.exports = router;
