const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const ctrl    = require('./holiday.controller');

router.use(authenticate);

// Any authenticated user can read
router.get('/',       ctrl.listHolidays);
router.get('/today',  ctrl.todayHoliday);

// HR and Admin can manage holidays
router.post('/',      authorize('HR', 'ADMIN'), ctrl.createHoliday);
router.put('/:id',    authorize('HR', 'ADMIN'), ctrl.updateHoliday);
router.delete('/:id', authorize('HR', 'ADMIN'), ctrl.deleteHoliday);

module.exports = router;
