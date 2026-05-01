// ============================================================
// src/modules/comments/comment.service.js
// ============================================================

const db = require('../../config/db');

// ─── Audit helper ─────────────────────────────────────────────
const audit = (userId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs
       (user_id, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (?, ?, 'task_comments', ?, ?, ?, ?)`,
    [userId, action, targetId,
     oldVal ? JSON.stringify(oldVal) : null,
     newVal ? JSON.stringify(newVal) : null,
     ip || null]
  );

// ─── Notification helper ──────────────────────────────────────
const notify = (userId, title, message, type, refId) =>
  db.query(
    `INSERT INTO notifications (user_id, title, message, type, ref_id)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, title, message, type, refId]
  );

// ─── Comment SELECT ───────────────────────────────────────────
const COMMENT_SELECT = `
  c.id, c.task_id, c.comment, c.created_at, c.updated_at,
  u.id   AS user_id,   u.name AS user_name,
  u.role AS user_role, u.profile_pic
`;
const COMMENT_JOIN = `
  FROM task_comments c
  LEFT JOIN users u ON u.id = c.user_id
`;

// ============================================================
// GET COMMENTS FOR A TASK
// ============================================================
const getComments = async (taskId, requester) => {
  // Verify task exists & user has access
  const [taskRows] = await db.query(
    'SELECT id, assigned_to, assigned_by FROM tasks WHERE id = ? LIMIT 1',
    [taskId]
  );
  if (!taskRows.length) throw { status: 404, message: 'Task not found.' };

  const task = taskRows[0];
  if (requester.role === 'recruiter' && task.assigned_to !== requester.id) {
    throw { status: 403, message: 'Access denied.' };
  }

  const [rows] = await db.query(
    `SELECT ${COMMENT_SELECT} ${COMMENT_JOIN}
     WHERE c.task_id = ? ORDER BY c.created_at ASC`,
    [taskId]
  );
  return rows;
};

// ============================================================
// ADD COMMENT
// ============================================================
const addComment = async ({ taskId, requester, comment, ip }) => {
  if (!comment || !comment.trim()) {
    throw { status: 400, message: 'Comment cannot be empty.' };
  }
  if (comment.trim().length > 2000) {
    throw { status: 400, message: 'Comment cannot exceed 2000 characters.' };
  }

  // Verify task access
  const [taskRows] = await db.query(
    'SELECT id, title, assigned_to, assigned_by FROM tasks WHERE id = ? LIMIT 1',
    [taskId]
  );
  if (!taskRows.length) throw { status: 404, message: 'Task not found.' };

  const task = taskRows[0];
  if (requester.role === 'recruiter' && task.assigned_to !== requester.id) {
    throw { status: 403, message: 'Access denied.' };
  }

  const [result] = await db.query(
    'INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)',
    [taskId, requester.id, comment.trim()]
  );
  const commentId = result.insertId;

  // Notify relevant parties (not yourself)
  const notifyIds = new Set();
  if (task.assigned_to  !== requester.id) notifyIds.add(task.assigned_to);
  if (task.assigned_by  !== requester.id) notifyIds.add(task.assigned_by);

  for (const uid of notifyIds) {
    await notify(
      uid,
      'New Comment on Task',
      `${requester.name} commented on: ${task.title}`,
      'comment_added',
      taskId
    );
  }

  await audit(requester.id, 'ADD_COMMENT', commentId, null,
    { task_id: taskId, comment: comment.trim() }, ip);

  const [rows] = await db.query(
    `SELECT ${COMMENT_SELECT} ${COMMENT_JOIN} WHERE c.id = ? LIMIT 1`,
    [commentId]
  );
  return rows[0];
};

// ============================================================
// EDIT COMMENT
// ============================================================
const editComment = async ({ commentId, requester, comment, ip }) => {
  if (!comment || !comment.trim()) {
    throw { status: 400, message: 'Comment cannot be empty.' };
  }

  const [rows] = await db.query(
    `SELECT ${COMMENT_SELECT} ${COMMENT_JOIN} WHERE c.id = ? LIMIT 1`,
    [commentId]
  );
  if (!rows.length) throw { status: 404, message: 'Comment not found.' };

  const existing = rows[0];

  // Only comment owner or admin can edit
  if (existing.user_id !== requester.id && requester.role !== 'admin') {
    throw { status: 403, message: 'You can only edit your own comments.' };
  }

  // Prevent editing comments older than 24 hours (unless admin)
  if (requester.role !== 'admin') {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      throw { status: 400, message: 'Comments can only be edited within 24 hours of posting.' };
    }
  }

  const oldComment = existing.comment;
  await db.query(
    'UPDATE task_comments SET comment = ? WHERE id = ?',
    [comment.trim(), commentId]
  );

  await audit(requester.id, 'EDIT_COMMENT', commentId,
    { comment: oldComment }, { comment: comment.trim() }, ip);

  const [updated] = await db.query(
    `SELECT ${COMMENT_SELECT} ${COMMENT_JOIN} WHERE c.id = ? LIMIT 1`,
    [commentId]
  );
  return updated[0];
};

// ============================================================
// DELETE COMMENT
// ============================================================
const deleteComment = async ({ commentId, requester, ip }) => {
  const [rows] = await db.query(
    'SELECT id, user_id, comment, task_id FROM task_comments WHERE id = ? LIMIT 1',
    [commentId]
  );
  if (!rows.length) throw { status: 404, message: 'Comment not found.' };

  const existing = rows[0];

  // Owner or admin/manager can delete
  const canDelete = existing.user_id === requester.id ||
    ['admin', 'manager'].includes(requester.role);

  if (!canDelete) {
    throw { status: 403, message: 'You cannot delete this comment.' };
  }

  await db.query('DELETE FROM task_comments WHERE id = ?', [commentId]);
  await audit(requester.id, 'DELETE_COMMENT', commentId,
    { comment: existing.comment, task_id: existing.task_id }, null, ip);

  return { message: 'Comment deleted.' };
};

module.exports = { getComments, addComment, editComment, deleteComment };
