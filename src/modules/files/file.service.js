// ============================================================
// src/modules/files/file.service.js
// ============================================================

const db   = require('../../config/db');
const path = require('path');
const fs   = require('fs');

// ─── Audit helper ─────────────────────────────────────────────
const audit = (userId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs
       (user_id, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (?, ?, 'task_files', ?, ?, ?, ?)`,
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

// ============================================================
// GET FILES FOR TASK
// ============================================================
const getFiles = async (taskId, requester) => {
  const [taskRows] = await db.query(
    'SELECT id, assigned_to FROM tasks WHERE id = ? LIMIT 1', [taskId]
  );
  if (!taskRows.length) throw { status: 404, message: 'Task not found.' };

  if (requester.role === 'recruiter' && taskRows[0].assigned_to !== requester.id) {
    throw { status: 403, message: 'Access denied.' };
  }

  const [rows] = await db.query(
    `SELECT f.id, f.task_id, f.original_name, f.file_name,
            f.file_path, f.file_size, f.mime_type, f.created_at,
            u.id AS uploaded_by_id, u.name AS uploaded_by_name, u.role AS uploaded_by_role
     FROM task_files f
     LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.task_id = ? ORDER BY f.created_at DESC`,
    [taskId]
  );
  return rows;
};

// ============================================================
// UPLOAD FILE(S)
// ============================================================
const uploadFiles = async ({ taskId, requester, files, ip }) => {
  if (!files || !files.length) {
    throw { status: 400, message: 'No files provided.' };
  }

  // Verify task access
  const [taskRows] = await db.query(
    'SELECT id, title, assigned_to, assigned_by, status FROM tasks WHERE id = ? LIMIT 1',
    [taskId]
  );
  if (!taskRows.length) throw { status: 404, message: 'Task not found.' };

  const task = taskRows[0];

  // Recruiters can only upload to their own tasks
  if (requester.role === 'recruiter' && task.assigned_to !== requester.id) {
    throw { status: 403, message: 'Access denied.' };
  }

  // Cannot upload to approved tasks
  if (task.status === 'approved') {
    throw { status: 400, message: 'Cannot upload files to an approved task.' };
  }

  // Check total file count (max 10 per task)
  const [countRows] = await db.query(
    'SELECT COUNT(*) AS cnt FROM task_files WHERE task_id = ?', [taskId]
  );
  const existing = countRows[0].cnt;
  if (existing + files.length > 10) {
    // Remove uploaded files since we can't proceed
    files.forEach((f) => {
      const fp = path.join(__dirname, '../../uploads/tasks', f.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    throw { status: 400, message: `Maximum 10 files per task. Currently has ${existing}.` };
  }

  const inserted = [];
  for (const file of files) {
    const [result] = await db.query(
      `INSERT INTO task_files
         (task_id, uploaded_by, original_name, file_name, file_path, file_size, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId, requester.id,
        file.originalname,
        file.filename,
        `tasks/${file.filename}`,
        file.size,
        file.mimetype,
      ]
    );
    inserted.push(result.insertId);

    await audit(requester.id, 'UPLOAD_FILE', result.insertId, null,
      { task_id: taskId, file_name: file.originalname, file_size: file.size }, ip);
  }

  // Notify other party
  const notifyId = requester.id === task.assigned_to ? task.assigned_by : task.assigned_to;
  if (notifyId !== requester.id) {
    await notify(
      notifyId,
      'File Uploaded',
      `${requester.name} uploaded ${files.length} file(s) to: ${task.title}`,
      'general',
      taskId
    );
  }

  // Return inserted files
  const [rows] = await db.query(
    `SELECT f.id, f.task_id, f.original_name, f.file_name,
            f.file_path, f.file_size, f.mime_type, f.created_at,
            u.name AS uploaded_by_name
     FROM task_files f
     LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.id IN (${inserted.join(',')})
     ORDER BY f.created_at DESC`
  );
  return rows;
};

// ============================================================
// DELETE FILE
// ============================================================
const deleteFile = async ({ fileId, requester, ip }) => {
  const [rows] = await db.query(
    `SELECT f.*, t.status AS task_status, t.assigned_to
     FROM task_files f
     LEFT JOIN tasks t ON t.id = f.task_id
     WHERE f.id = ? LIMIT 1`,
    [fileId]
  );
  if (!rows.length) throw { status: 404, message: 'File not found.' };

  const file = rows[0];

  // Only uploader or admin/manager can delete
  const canDelete = file.uploaded_by === requester.id ||
    ['admin', 'manager'].includes(requester.role);

  if (!canDelete) throw { status: 403, message: 'You cannot delete this file.' };

  // Cannot delete from approved tasks
  if (file.task_status === 'approved' && requester.role !== 'admin') {
    throw { status: 400, message: 'Cannot delete files from an approved task.' };
  }

  // Delete physical file
  const filePath = path.join(__dirname, '../../uploads', file.file_path);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await db.query('DELETE FROM task_files WHERE id = ?', [fileId]);
  await audit(requester.id, 'DELETE_FILE', fileId,
    { file_name: file.original_name, task_id: file.task_id }, null, ip);

  return { message: `File "${file.original_name}" deleted.` };
};

// ============================================================
// DOWNLOAD FILE (returns file path for streaming)
// ============================================================
const getFilePath = async (fileId, requester) => {
  const [rows] = await db.query(
    `SELECT f.*, t.assigned_to
     FROM task_files f
     LEFT JOIN tasks t ON t.id = f.task_id
     WHERE f.id = ? LIMIT 1`,
    [fileId]
  );
  if (!rows.length) throw { status: 404, message: 'File not found.' };

  const file = rows[0];

  if (requester.role === 'recruiter' && file.assigned_to !== requester.id) {
    throw { status: 403, message: 'Access denied.' };
  }

  const filePath = path.join(__dirname, '../../uploads', file.file_path);
  if (!fs.existsSync(filePath)) {
    throw { status: 404, message: 'File not found on server.' };
  }

  return { filePath, originalName: file.original_name, mimeType: file.mime_type };
};

module.exports = { getFiles, uploadFiles, deleteFile, getFilePath };
