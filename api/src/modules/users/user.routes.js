const express = require('express');
const { body } = require('express-validator');
const userController = require('./user.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all users (Admin, HR only)
router.get('/', authorize('ADMIN', 'HR'), userController.getAllUsers);

// ── Profile routes (must come BEFORE /:id to avoid param capture) ────────────

// Get user profile
router.get('/profile/me', userController.getMyProfile);

// Update my profile
router.put('/profile/me', userController.updateMyProfile);

// Upload profile picture (supports both /avatar and /picture paths)
router.post('/profile/avatar', userController.uploadProfilePicture);
router.post('/profile/picture', userController.uploadProfilePicture);
// Base64 JSON upload (for Flutter web / mobile web)
router.post('/profile/avatar-base64', userController.uploadProfilePictureBase64);

// User preferences (theme, language, notifications, etc.)
router.get('/profile/preferences', userController.getPreferences);
router.put('/profile/preferences', userController.updatePreferences);

// Email change (OTP-verified, 2-step)
router.post('/profile/request-email-change', [
  body('newEmail').isEmail().normalizeEmail(),
], userController.requestEmailChange);

router.post('/profile/confirm-email-change', [
  body('otpCode').matches(/^\d{6}$/),
], userController.confirmEmailChange);

// 2FA settings
router.put('/profile/two-factor', userController.updateTwoFactor);

// Biometric settings
router.put('/profile/biometric', userController.updateBiometric);

// ── Generic user routes (/:id must come AFTER /profile/* routes) ──────────────

// Get user by ID
router.get('/:id', userController.getUserById);

// Create user (Admin or HR — HR can only create EMPLOYEE role, enforced in controller)
router.post('/', authorize('ADMIN', 'HR'), [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('role').isIn(['ADMIN', 'HR', 'EMPLOYEE'])
], userController.createUser);

// Update user
router.put('/:id', [
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  body('department').optional().trim(),
  body('position').optional().trim()
], userController.updateUser);

// Update user status (Admin, HR only)
router.patch('/:id/status', authorize('ADMIN', 'HR'), [
  body('status').isIn(['ACTIVE', 'PENDING', 'LOCKED', 'INACTIVE'])
], userController.updateUserStatus);

// Delete user (Admin only)
router.delete('/:id', authorize('ADMIN'), userController.deleteUser);

// Unlock account (clear brute-force lock) — Admin + HR
router.post('/:id/unlock-account', authorize('ADMIN', 'HR'), userController.unlockAccount);

// Admin reset user password (Admin only)
router.post('/:id/reset-password', authorize('ADMIN'), [
  body('newPassword').isLength({ min: 6 })
], userController.adminResetPassword);

// ── HR Notes (HR/Admin only) ──────────────────────────────────────────────────
router.get ('/:id/hr-notes',  authorize('ADMIN', 'HR'), userController.getHrNotes);
router.put ('/:id/hr-notes',  authorize('ADMIN', 'HR'), userController.saveHrNotes);

// ── Performance Ratings (HR/Admin only) ──────────────────────────────────────
router.get ('/:id/performance',        authorize('ADMIN', 'HR'), userController.getPerformance);
router.post('/:id/performance',        authorize('ADMIN', 'HR'), userController.upsertPerformanceRating);
router.delete('/:id/performance/:rid', authorize('ADMIN', 'HR'), userController.deletePerformanceRating);

module.exports = router;
