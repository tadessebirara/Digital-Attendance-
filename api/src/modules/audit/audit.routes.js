const express = require('express');
const auditController = require('./audit.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate, authorize('ADMIN', 'HR'));

router.get('/logs', auditController.getAuditLogs);
router.get('/user/:id', auditController.getUserAuditTrail);

module.exports = router;
