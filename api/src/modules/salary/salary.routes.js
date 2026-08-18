const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const salaryController = require('./salary.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

// All salary endpoints require authentication + ADMIN or HR role
router.use(authenticate, authorize('ADMIN', 'HR'));

// Penalty settings
router.get('/penalty-settings',  salaryController.getPenaltySettings);
router.put('/penalty-settings', validate(z.object({
  body: z.object({
    absenceUnit:  z.enum(['PER_DAY', 'PER_ABSENCE_RECORD']).optional(),
    absenceType:  z.enum(['FIXED', 'PERCENTAGE']).optional(),
    absenceValue: z.number().min(0).optional(),
    lateUnit:     z.enum(['PER_MINUTE', 'PER_HOUR']).optional(),
    lateType:     z.enum(['FIXED', 'PERCENTAGE']).optional(),
    lateValue:    z.number().min(0).optional(),
  }),
})), salaryController.updatePenaltySettings);

// Employee salary management
router.get('/employees', salaryController.getEmployeeSalaries);
router.put('/employees/:id', validate(z.object({
  body: z.object({ monthlySalary: z.number().min(0) }),
  params: z.object({ id: z.string().regex(/^\d+$/) }),
})), salaryController.updateEmployeeSalary);

// Monthly payroll
router.get('/payroll',          salaryController.getMonthlyPayroll);
router.get('/payroll/:userId',  salaryController.getEmployeePayroll);

// Export
router.get('/export', salaryController.exportPayroll);

module.exports = router;
