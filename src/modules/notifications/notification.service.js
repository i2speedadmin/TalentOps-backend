// ============================================================
// src/modules/notifications/notification.service.js
// FIXED: all queries scoped to tenant_id
// ============================================================

const db = require('../../config/db');

const getNotifications = async ({ userId, tenantId, page = 1, limit = 15, unreadOnly = false }) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const filter = (unreadOnly === 'true' || unreadOnly === true) ? 'AND n.is_read = 0' : '';

  const [rows] = await db.query(
    `SELECT n.id, n.title, n.message, n.type, n.ref_id, n.is_read, n.created_at
     FROM notifications n
     WHERE n.user_id = ? AND n.tenant_id = ? ${filter}
     ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
    [userId, tenantId, parseInt(limit), offset]
  );

  const [count] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND tenant_id = ? ${filter}`,
    [userId, tenantId]
  );

  const [unread] = await db.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND tenant_id = ? AND is_read = 0`,
    [userId, tenantId]
  );

  return {
    notifications: rows,
    pagination: {
      total:      parseInt(count[0].total) || 0,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil((parseInt(count[0].total) || 0) / parseInt(limit)),
    },
    unreadCount: parseInt(unread[0].count) || 0,
  };
};

const getUnreadCount = async ({ userId, tenantId }) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND tenant_id = ? AND is_read = 0`,
    [userId, tenantId]
  );
  return parseInt(rows[0].count) || 0;
};

const markAsRead = async ({ notificationId, userId, tenantId }) => {
  const [rows] = await db.query(
    'SELECT id FROM notifications WHERE id = ? AND user_id = ? AND tenant_id = ? LIMIT 1',
    [notificationId, userId, tenantId]
  );
  if (!rows.length) throw { status: 404, message: 'Notification not found.' };

  await db.query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? AND tenant_id = ?',
    [notificationId, userId, tenantId]
  );

  const unreadCount = await getUnreadCount({ userId, tenantId });
  return { unreadCount };
};

const markAllAsRead = async ({ userId, tenantId }) => {
  const [result] = await db.query(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND tenant_id = ? AND is_read = 0',
    [userId, tenantId]
  );
  return { message: 'All notifications marked as read.', unreadCount: 0, updated: result.affectedRows };
};

const deleteNotification = async ({ notificationId, userId, tenantId }) => {
  const [rows] = await db.query(
    'SELECT id FROM notifications WHERE id = ? AND user_id = ? AND tenant_id = ? LIMIT 1',
    [notificationId, userId, tenantId]
  );
  if (!rows.length) throw { status: 404, message: 'Notification not found.' };

  await db.query('DELETE FROM notifications WHERE id = ? AND user_id = ? AND tenant_id = ?', [notificationId, userId, tenantId]);
  return { message: 'Notification deleted.' };
};

const clearReadNotifications = async ({ userId, tenantId }) => {
  const [result] = await db.query(
    'DELETE FROM notifications WHERE user_id = ? AND tenant_id = ? AND is_read = 1',
    [userId, tenantId]
  );
  return { message: `${result.affectedRows} read notification(s) cleared.`, deleted: result.affectedRows };
};

module.exports = {
  getNotifications, getUnreadCount, markAsRead,
  markAllAsRead, deleteNotification, clearReadNotifications,
};
