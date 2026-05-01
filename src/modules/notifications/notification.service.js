// ============================================================
// src/modules/notifications/notification.service.js
// ============================================================

const db = require('../../config/db');

// ============================================================
// GET ALL NOTIFICATIONS FOR USER
// ============================================================
const getNotifications = async ({ userId, page = 1, limit = 20, unreadOnly = false }) => {
  const offset  = (page - 1) * limit;
  const where   = unreadOnly ? 'WHERE n.user_id = ? AND n.is_read = 0' : 'WHERE n.user_id = ?';

  const [rows] = await db.query(
    `SELECT n.id, n.title, n.message, n.type, n.ref_id, n.is_read, n.created_at
     FROM notifications n
     ${where}
     ORDER BY n.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, parseInt(limit), parseInt(offset)]
  );

  const [count] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications n ${where}`,
    [userId]
  );

  const [unread] = await db.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`,
    [userId]
  );

  const totalCount  = parseInt(count[0].total)  || 0;
  const unreadTotal = parseInt(unread[0].count) || 0;
  return {
    notifications: rows,
    pagination: {
      total:      totalCount,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(totalCount / limit),
    },
    unreadCount: unreadTotal,
  };
};

// ============================================================
// GET UNREAD COUNT
// ============================================================
const getUnreadCount = async (userId) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`,
    [userId]
  );
  return parseInt(rows[0].count) || 0;
};

// ============================================================
// MARK ONE AS READ
// ============================================================
const markAsRead = async (notificationId, userId) => {
  const [rows] = await db.query(
    'SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1',
    [notificationId, userId]
  );
  if (!rows.length) throw { status: 404, message: 'Notification not found.' };

  await db.query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [notificationId, userId]
  );

  const unreadCount = parseInt(await getUnreadCount(userId)) || 0;
  return { unreadCount };
};

// ============================================================
// MARK ALL AS READ
// ============================================================
const markAllAsRead = async (userId) => {
  await db.query(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return { message: 'All notifications marked as read.', unreadCount: 0 };
};

// ============================================================
// DELETE ONE NOTIFICATION
// ============================================================
const deleteNotification = async (notificationId, userId) => {
  const [rows] = await db.query(
    'SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1',
    [notificationId, userId]
  );
  if (!rows.length) throw { status: 404, message: 'Notification not found.' };

  await db.query('DELETE FROM notifications WHERE id = ?', [notificationId]);
  return { message: 'Notification deleted.' };
};

// ============================================================
// CLEAR ALL READ NOTIFICATIONS
// ============================================================
const clearReadNotifications = async (userId) => {
  const [result] = await db.query(
    'DELETE FROM notifications WHERE user_id = ? AND is_read = 1',
    [userId]
  );
  return {
    message: `${result.affectedRows} read notification(s) cleared.`,
    deleted: result.affectedRows,
  };
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
};
