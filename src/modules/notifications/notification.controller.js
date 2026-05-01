// ============================================================
// src/modules/notifications/notification.controller.js
// ============================================================

const notifService = require('./notification.service');

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await notifService.getNotifications({
      userId:     req.user.id,
      page,
      limit,
      unreadOnly: unreadOnly === 'true',
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const count = await notifService.getUnreadCount(req.user.id);
    res.json({ success: true, unreadCount: count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/notifications/:id/read
const markAsRead = async (req, res) => {
  try {
    const result = await notifService.markAsRead(req.params.id, req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// PATCH /api/notifications/mark-all-read
const markAllAsRead = async (req, res) => {
  try {
    const result = await notifService.markAllAsRead(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/notifications/:id
const deleteNotification = async (req, res) => {
  try {
    const result = await notifService.deleteNotification(req.params.id, req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// DELETE /api/notifications/clear-read
const clearReadNotifications = async (req, res) => {
  try {
    const result = await notifService.clearReadNotifications(req.user.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getNotifications, getUnreadCount,
  markAsRead, markAllAsRead,
  deleteNotification, clearReadNotifications,
};
