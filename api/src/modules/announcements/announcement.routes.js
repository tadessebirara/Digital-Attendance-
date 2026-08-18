const express = require('express');
const { body } = require('express-validator');
const announcementController = require('./announcement.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/export/csv', authorize('ADMIN', 'HR'), announcementController.exportAnnouncements);
router.get('/', announcementController.getAnnouncements);
router.get('/:id', announcementController.getAnnouncementById);

router.post('/', authorize('ADMIN', 'HR'), [
  body('title').trim().notEmpty(),
  body('content').trim().notEmpty(),
  body('type').isIn(['GENERAL', 'URGENT', 'POLICY', 'EVENT', 'SYSTEM']),
  body('priority').isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  body('targetRoles').optional().isArray(),
  body('scheduledAt').optional({ nullable: true }).isISO8601(),
], announcementController.createAnnouncement);

router.put('/:id', authorize('ADMIN', 'HR'), announcementController.updateAnnouncement);
router.delete('/:id', authorize('ADMIN', 'HR'), announcementController.deleteAnnouncement);

module.exports = router;
