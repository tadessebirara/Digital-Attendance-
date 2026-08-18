const express = require('express');
const { z } = require('zod');
const validate = require('../../middleware/validate.middleware');
const attendanceController = require('./attendance.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { requireDeviceForEmployee } = require('../../middleware/device.middleware');

const router = express.Router();

router.use(authenticate);

// ── Schemas ──────────────────────────────────────────────────────────────────

const paginationSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    userId: z.string().optional()
  })
});

const checkInSchema = z.object({
  body: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    notes: z.string().optional(),
    method: z.string().default('GPS'),
    clientTime: z.string().optional()
  })
});

const manualEntrySchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    // date is optional fallback when clockInTime is not provided
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    clockInTime: z.string().datetime({ offset: true }).optional(),
    clockOutTime: z.string().datetime({ offset: true }).optional(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED']),
    notes: z.string().max(500).optional(),
  }).refine(
    (b) => b.clockInTime || b.date,
    { message: 'Either clockInTime or date is required', path: ['clockInTime'] }
  )
});

const updateAttendanceSchema = z.object({
  body: z.object({
    clockInTime: z.string().datetime({ offset: true }).optional(),
    clockOutTime: z.string().datetime({ offset: true }).optional(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED']).optional(),
    notes: z.string().max(500).optional(),
  }),
  params: z.object({ id: z.string().regex(/^\d+$/) })
});

const manualCheckInOutSchema = z.object({
  body: z.object({
    employeeId: z.union([z.string(), z.number()]).transform(Number),
    location: z.string().optional(),
    type: z.enum(['in', 'out']),
    // checkTime is validated as ISO string; backend parses + validates it
    checkTime: z.string().datetime({ offset: true }).optional(),
    isManual: z.boolean().optional(),
    notes: z.string().max(500).optional(),
  })
});

// ── Routes ───────────────────────────────────────────────────────────────────

router.get('/', authorize('ADMIN', 'HR'), validate(paginationSchema), attendanceController.getAttendanceRecords);
router.get('/me', validate(paginationSchema), attendanceController.getMyAttendance);
router.get('/today', attendanceController.getTodayStatus);

router.get('/stats', validate(z.object({
  query: z.object({
    userId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
})), attendanceController.getAttendanceStats);

router.get('/qr-code', authorize('ADMIN', 'HR'), attendanceController.getQRCode);

router.post('/check-in',      validate(checkInSchema), attendanceController.checkIn);
router.post('/check-out',     validate(checkInSchema), attendanceController.checkOut);

const qrAttendanceSchema = z.object({
  body: z.object({
    qrData: z.string().min(1),
    qrPassword: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    gpsAccuracyM: z.number().optional(),   // accuracy compensation for geofence boundary
    action: z.enum(['CHECK_IN', 'CHECK_OUT']).optional(),
  }),
});

router.post('/qr-check-in',   validate(qrAttendanceSchema), attendanceController.verifyQRCheckIn);
router.post('/qr-attendance', validate(qrAttendanceSchema), attendanceController.submitQrAttendance);

// FIX 10: Manual entry and update routes — ADMIN/HR only, with Zod validation
router.post('/manual-checkin', authorize('ADMIN', 'HR'), validate(manualCheckInOutSchema), attendanceController.manualCheckInOut);
router.post('/manual', authorize('ADMIN', 'HR'), validate(manualEntrySchema), attendanceController.manualEntry);
router.patch('/:id', authorize('ADMIN', 'HR'), validate(updateAttendanceSchema), attendanceController.updateAttendance);

module.exports = router;
