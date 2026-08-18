const express = require('express');
const c = require('./integration.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();
router.use(authenticate);

// Status — all 4 integrations real live state
router.get('/status', c.getIntegrationStatus);

// Test connections
router.post('/email/test',   authorize('ADMIN'), c.testEmail);
router.post('/email/save',   authorize('ADMIN'), c.saveEmail);
router.post('/sms/test',     authorize('ADMIN'), c.testSms);
router.post('/payroll/test', authorize('ADMIN'), c.testPayroll);
router.post('/cloud/test',   authorize('ADMIN'), c.testCloud);

// Save credentials (to DB, encrypted)
router.post('/sms/save',     authorize('ADMIN'), c.saveSms);
router.post('/payroll/save', authorize('ADMIN'), c.savePayroll);
router.post('/cloud/save',   authorize('ADMIN'), c.saveCloud);

// Disconnect
router.delete('/:key', authorize('ADMIN'), c.disconnectIntegration);

module.exports = router;
