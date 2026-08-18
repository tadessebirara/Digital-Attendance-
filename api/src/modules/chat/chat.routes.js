const express = require('express');
const { body } = require('express-validator');
const chatController = require('./chat.controller');
const { authenticate } = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// Get my chat rooms
router.get('/rooms', chatController.getMyRooms);

// Get available users for chat
router.get('/users', chatController.getAvailableUsers);

// Create chat room
router.post('/rooms', [
  body('name').optional().trim(),
  body('type').isIn(['DIRECT', 'GROUP']),
  body('participantIds').isArray({ min: 1 })
], chatController.createRoom);

// Get room messages
router.get('/rooms/:id/messages', chatController.getMessages);

// Send message
router.post('/rooms/:id/messages', [
  body('message').trim().notEmpty(),
  body('tempId').optional().isString()
], chatController.sendMessage);

// Edit message
router.put('/rooms/:id/messages/:msgId', [
  body('message').trim().notEmpty()
], chatController.editMessage);

// Delete message
router.delete('/rooms/:id/messages/:msgId', chatController.deleteMessage);

// Mark messages as read
router.post('/rooms/:id/read', chatController.markAsRead);

// Get unread count
router.get('/unread', chatController.getUnreadCount);

module.exports = router;
