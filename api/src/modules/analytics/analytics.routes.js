const express = require('express');
const analyticsController = require('./analytics.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// Get Admin analytics
router.get('/admin', authorize('ADMIN'), analyticsController.getAdminAnalytics);

// Get HR analytics
router.get('/hr', authorize('HR', 'ADMIN'), analyticsController.getHRAnalytics);

// Generate report with filters (HR + Admin)
router.get('/report', authorize('HR', 'ADMIN'), analyticsController.generateReport);

module.exports = router;
