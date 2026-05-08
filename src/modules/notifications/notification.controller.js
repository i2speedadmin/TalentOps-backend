// ============================================================
// src/modules/notifications/notification.controller.js
// FIXED: exports all 6 functions that notification.routes.js needs:
//   getNotifications, getUnreadCount, markAllAsRead,
//   clearReadNotifications, markAsRead, deleteNotification
// ============================================================

const svc = require('./notification.service');

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await svc.getNotifications({
      userId:    req.user.id,
      tenantId:  req.user.tenant_id,
      page, limit, unreadOnly,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const count = await svc.getUnreadCount({
      userId:   req.user.id,
      tenantId: req.user.tenant_id,
    });
    res.json({ success: true, unreadCount: count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/notifications/mark-all-read
const markAllAsRead = async (req, res) => {
  try {
    const result = await svc.markAllAsRead({
      userId:   req.user.id,
      tenantId: req.user.tenant_id,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/notifications/clear-read
const clearReadNotifications = async (req, res) => {
  try {
    const result = await svc.clearReadNotifications({
      userId:   req.user.id,
      tenantId: req.user.tenant_id,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/notifications/:id/read
const markAsRead = async (req, res) => {
  try {
    const result = await svc.markAsRead({
      notificationId: req.params.id,
      userId:         req.user.id,
      tenantId:       req.user.tenant_id,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// DELETE /api/notifications/:id
const deleteNotification = async (req, res) => {
  try {
    const result = await svc.deleteNotification({
      notificationId: req.params.id,
      userId:         req.user.id,
      tenantId:       req.user.tenant_id,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  clearReadNotifications,
  markAsRead,
  deleteNotification,
};
