const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const authController = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

// ── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  body: z
    .object({
      email: z.string().email(),
      password: z.string().min(6),
      deviceId: z.string().optional()
    })
    .passthrough()
});

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    firstName: z.string().min(1),
    lastName: z.string().min(0).default(''),
    phone: z.string().min(7, 'Phone number is required'),
    department: z.string().optional(),
    position: z.string().optional()
  })
});

const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8)
  })
});

const verifyOtpSchema = z.object({
  body: z.object({
    otpSessionToken: z.string().min(1),
    otpCode: z.string().regex(/^\d{6}$/)
  })
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  })
});

// ── Routes ───────────────────────────────────────────────────────────────────

router.post('/login', validate(loginSchema), authController.login);
router.post('/register', validate(registerSchema), authController.register);

// ── Registration email OTP (no auth required) ─────────────────────────────────
router.post('/send-registration-otp', validate(z.object({
  body: z.object({ email: z.string().email() })
})), authController.sendRegistrationOtp);

router.post('/verify-registration-otp', validate(z.object({
  body: z.object({
    email: z.string().email(),
    otpCode: z.string().regex(/^\d{6}$/)
  })
})), authController.verifyRegistrationOtp);

router.post('/send-activation-otp', validate(z.object({
  body: z.object({ email: z.string().email() }),
})), authController.sendActivationOtp);

router.post('/verify-activation-otp', validate(z.object({
  body: z.object({
    email: z.string().email(),
    otpCode: z.string().regex(/^\d{6}$/),
  }),
})), authController.verifyActivationOtp);

router.post('/complete-employee-activation', validate(z.object({
  body: z.object({
    activationToken: z.string().min(1),
    newPassword: z.string().optional(),
  }),
})), authController.completeEmployeeActivation);

router.post('/forgot-password', [
  validate(z.object({ body: z.object({ email: z.string().email() }) }))
], authController.forgotPassword);

router.get('/validate-reset-token', authController.validateResetToken);

router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

router.get('/me', authenticate, authController.getCurrentUser);
router.post('/logout', authenticate, authController.logout);

router.post('/refresh', validate(z.object({
  body: z.object({ 
    refreshToken: z.string().optional(),
    deviceId: z.string().optional() 
  })
})), authController.refreshToken);

router.post('/verify-device-otp', validate(verifyOtpSchema), authController.verifyDeviceOtp);

// ── Device replacement (self-service — no auth token required) ────────────────
// Step 1: verify credentials → send OTP to registered email
router.post('/request-device-replacement', validate(z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
    newDeviceId: z.string().min(1),
    deviceInfo: z.object({
      deviceName: z.string().optional(),
      deviceModel: z.string().optional(),
      platform: z.string().optional(),
      osVersion: z.string().optional(),
    }).optional()
  })
})), authController.requestDeviceReplacement);

// Step 2: verify OTP → swap primary device + issue new session
router.post('/confirm-device-replacement', validate(z.object({
  body: z.object({
    replacementSessionToken: z.string().min(1),
    otpCode: z.string().regex(/^\d{6}$/)
  })
})), authController.confirmDeviceReplacement);

router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

// 2FA OTP — send and verify (authenticated)
router.post('/send-2fa-otp',   authenticate, authController.send2FAOtp);
router.post('/verify-2fa-otp', authenticate, validate(z.object({
  body: z.object({ otpCode: z.string().regex(/^\d{6}$/) })
})), authController.verify2FAOtp);

router.get('/pending-accounts', authenticate, authorize('ADMIN', 'HR'), authController.getPendingAccounts);

router.post('/approve-account/:userId', authenticate, authorize('ADMIN', 'HR'), validate(z.object({
  body: z.object({ action: z.enum(['APPROVE', 'REJECT']) }).passthrough(),
  params: z.object({ userId: z.string() })
})), authController.approveAccount);

module.exports = router;

