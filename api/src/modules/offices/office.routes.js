const express = require('express');
const officeController = require('./office.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

// All office endpoints require authentication + ADMIN or HR role
router.use(authenticate, authorize('ADMIN', 'HR'));

router.get('/', officeController.getAllOffices);
router.get('/:id', officeController.getOffice);
router.post('/', officeController.createOffice);
router.put('/:id', officeController.updateOffice);
router.delete('/:id', officeController.deleteOffice);
router.get('/:id/employees', officeController.getOfficeEmployees);
router.post('/assign-employee', officeController.assignEmployeeToOffice);

module.exports = router;
