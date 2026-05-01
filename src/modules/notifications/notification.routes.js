// ============================================================
// src/modules/notifications/notification.routes.js
// ============================================================

const express      = require('express');
const router       = express.Router();
const controller   = require('./notification.controller');
const authenticate = require('../../middleware/auth');

router.use(authenticate);

router.get('/',                     controller.getNotifications);
router.get('/unread-count',         controller.getUnreadCount);
router.patch('/mark-all-read',      controller.markAllAsRead);
router.delete('/clear-read',        controller.clearReadNotifications);
router.patch('/:id/read',           controller.markAsRead);
router.delete('/:id',               controller.deleteNotification);

module.exports = router;
