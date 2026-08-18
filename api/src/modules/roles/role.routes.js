const express = require('express');
const { body } = require('express-validator');
const roleController = require('./role.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// IMPORTANT: /my-permissions must be before /:id to avoid route collision
router.get('/my-permissions', roleController.getMyPermissions);

// Get all roles
router.get('/', roleController.getAllRoles);

// Get role by ID
router.get('/:id', roleController.getRoleById);

// Create role (Admin only)
router.post('/', authorize('ADMIN'), [
  body('name').trim().notEmpty().withMessage('Role name is required'),
  body('permissions').isArray().withMessage('Permissions must be an array'),
], roleController.createRole);

// Update role (Admin only)
router.put('/:id', authorize('ADMIN'), roleController.updateRole);

// Delete role (Admin only)
router.delete('/:id', authorize('ADMIN'), roleController.deleteRole);

module.exports = router;
