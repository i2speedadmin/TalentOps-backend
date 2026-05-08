// ============================================================
// src/modules/tasks/task.service.js
// FIXED: all queries now scoped to tenant_id
// ============================================================

const db = require('../../config/db');

// ─── Helpers ──────────────────────────────────────────────────
const audit = (userId, tenantId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs
       (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (?, ?, 'user', ?, 'tasks', ?, ?, ?, ?)`,
    [tenantId, userId, action, targetId,
     oldVal ? JSON.stringify(oldVal) : null,
     newVal ? JSON.stringify(newVal) : null,
     ip || null]
  ).catch(() => {});

const notify = (userId, tenantId, title, message, type, refId) =>
  db.query(
    `INSERT INTO notifications (tenant_id, user_id, title, message, type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenantId, userId, title, message, type, refId]
  ).catch(() => {});

const ROLE_LEVEL = { admin: 4, manager: 3, team_leader: 2, recruiter: 1 };

const TASK_SELECT = `
  t.id, t.tenant_id, t.title, t.description, t.status, t.priority,
  t.due_date, t.submitted_at, t.approved_at, t.rejection_reason,
  t.created_at, t.updated_at,
  t.assigned_to, t.assigned_by,
  u1.name AS assignee_name, u1.email AS assignee_email,
  u1.role AS assignee_role,  u1.profile_pic AS assignee_pic,
  u2.name AS assigner_name,  u2.email AS assigner_email,
  u2.role AS assigner_role
`;
const TASK_JOIN = `
  FROM tasks t
  LEFT JOIN users u1 ON u1.id = t.assigned_to
  LEFT JOIN users u2 ON u2.id = t.assigned_by
`;

// ── Build scope: always starts with tenant_id ─────────────────
const buildScope = async (requester) => {
  const tid = requester.tenant_id;

  switch (requester.role) {
    case 'admin':
      return { where: 'WHERE t.tenant_id = ?', params: [tid] };

    case 'manager': {
      const [tls] = await db.query(
        `SELECT id FROM users WHERE manager_id = ? AND role = 'team_leader' AND tenant_id = ?`,
        [requester.id, tid]
      );
      const tlIds  = tls.map((r) => r.id);
      const idList = tlIds.length ? tlIds.join(',') : '0';
      const [recs] = await db.query(
        `SELECT id FROM users WHERE manager_id IN (${idList}) AND role = 'recruiter' AND tenant_id = ?`,
        [tid]
      );
      const recIds = recs.map((r) => r.id);
      const all    = [requester.id, ...tlIds, ...recIds];
      return {
        where:  `WHERE t.tenant_id = ? AND (t.assigned_by IN (${all.join(',')}) OR t.assigned_to IN (${all.join(',')}))`,
        params: [tid],
      };
    }

    case 'team_leader': {
      const [recs] = await db.query(
        `SELECT id FROM users WHERE manager_id = ? AND role = 'recruiter' AND tenant_id = ?`,
        [requester.id, tid]
      );
      const recIds = recs.map((r) => r.id);
      const all    = [requester.id, ...recIds];
      return {
        where:  `WHERE t.tenant_id = ? AND (t.assigned_by = ? OR t.assigned_to IN (${all.join(',')}))`,
        params: [tid, requester.id],
      };
    }

    default: // recruiter
      return {
        where:  'WHERE t.tenant_id = ? AND t.assigned_to = ?',
        params: [tid, requester.id],
      };
  }
};

// ============================================================
// GET ALL TASKS
// ============================================================
const getAllTasks = async ({ requester, page = 1, limit = 10, search, status, priority, assignedTo, sortBy = 'created_at', sortDir = 'DESC' }) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const scope  = await buildScope(requester);

  const filters = [];
  const params  = [...scope.params];

  if (search)    { filters.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (status)    { filters.push('t.status = ?');      params.push(status);     }
  if (priority)  { filters.push('t.priority = ?');    params.push(priority);   }
  if (assignedTo){ filters.push('t.assigned_to = ?'); params.push(assignedTo); }

  const ALLOWED_SORT = ['created_at', 'due_date', 'status', 'priority', 'title'];
  const safeSort = ALLOWED_SORT.includes(sortBy) ? sortBy : 'created_at';
  const safeDir  = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const where = scope.where + (filters.length ? ' AND ' + filters.join(' AND ') : '');

  const [rows]  = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} ${where} ORDER BY t.${safeSort} ${safeDir} LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );
  const [count] = await db.query(
    `SELECT COUNT(*) AS total ${TASK_JOIN} ${where}`, params
  );

  return {
    tasks: rows,
    pagination: {
      total:      parseInt(count[0].total) || 0,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil((parseInt(count[0].total) || 0) / parseInt(limit)),
    },
  };
};

// ============================================================
// GET TASK BY ID
// ============================================================
const getTaskById = async (id, requester) => {
  const tid = requester.tenant_id;
  const [rows] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? AND t.tenant_id = ? LIMIT 1`,
    [id, tid]
  );
  if (!rows.length) throw { status: 404, message: 'Task not found.' };

  const task = rows[0];
  if (requester.role === 'recruiter' && task.assigned_to !== requester.id) {
    throw { status: 403, message: 'Access denied.' };
  }

  const [comments] = await db.query(
    `SELECT c.id, c.comment, c.created_at, c.updated_at,
            u.id AS user_id, u.name AS user_name, u.role AS user_role, u.profile_pic
     FROM task_comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.task_id = ? AND c.tenant_id = ?
     ORDER BY c.created_at ASC`,
    [id, tid]
  );

  const [files] = await db.query(
    `SELECT f.id, f.original_name, f.file_name, f.file_path,
            f.file_size, f.mime_type, f.created_at, u.name AS uploaded_by_name
     FROM task_files f
     LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.task_id = ? AND f.tenant_id = ?
     ORDER BY f.created_at DESC`,
    [id, tid]
  );

  return { ...task, comments, files };
};

// ============================================================
// CREATE TASK
// ============================================================
const createTask = async ({ requester, body, ip }) => {
  const { title, description, assigned_to, priority = 'medium', due_date } = body;
  const tid = requester.tenant_id;

  if (!title || !assigned_to) throw { status: 400, message: 'Title and assignee are required.' };
  if (requester.role === 'recruiter') throw { status: 403, message: 'Recruiters cannot create tasks.' };

  const [assigneeRows] = await db.query(
    'SELECT id, name, role FROM users WHERE id = ? AND tenant_id = ? AND status = ? LIMIT 1',
    [assigned_to, tid, 'active']
  );
  if (!assigneeRows.length) throw { status: 404, message: 'Assignee not found or inactive.' };

  const assignee = assigneeRows[0];
  if (requester.role !== 'admin' && ROLE_LEVEL[assignee.role] >= ROLE_LEVEL[requester.role]) {
    throw { status: 403, message: 'You can only assign tasks to users below your role level.' };
  }

  const [result] = await db.query(
    `INSERT INTO tasks (tenant_id, title, description, assigned_to, assigned_by, priority, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'assigned')`,
    [tid, title.trim(), description || null, assigned_to, requester.id, priority, due_date || null]
  );
  const taskId = result.insertId;

  await notify(assigned_to, tid, 'New Task Assigned', `You have been assigned: ${title}`, 'task_assigned', taskId);
  await audit(requester.id, tid, 'CREATE_TASK', taskId, null, { title, assigned_to, priority }, ip);

  const [created] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? AND t.tenant_id = ? LIMIT 1`, [taskId, tid]
  );
  return created[0];
};

// ============================================================
// UPDATE TASK
// ============================================================
const updateTask = async ({ id, requester, body, ip }) => {
  const tid = requester.tenant_id;
  const [rows] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? AND t.tenant_id = ? LIMIT 1`, [id, tid]
  );
  if (!rows.length) throw { status: 404, message: 'Task not found.' };
  const task = rows[0];

  if (task.status === 'approved') throw { status: 400, message: 'Approved tasks cannot be edited.' };
  if (requester.role === 'recruiter') {
    if (task.assigned_to !== requester.id) throw { status: 403, message: 'Access denied.' };
    if (body.status && body.status !== 'in_progress') throw { status: 403, message: 'Recruiters can only update status to in_progress.' };
  }

  const { title, description, priority, due_date, status, assigned_to } = body;
  const oldSnap = { title: task.title, status: task.status, priority: task.priority };
  const fields = [], values = [];

  if (title       !== undefined) { fields.push('title = ?');       values.push(title.trim()); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (priority    !== undefined) { fields.push('priority = ?');    values.push(priority); }
  if (due_date    !== undefined) { fields.push('due_date = ?');    values.push(due_date || null); }
  if (status      !== undefined) { fields.push('status = ?');      values.push(status); }
  if (assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(assigned_to); }

  if (!fields.length) throw { status: 400, message: 'No fields to update.' };

  values.push(id, tid);
  await db.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);

  if (assigned_to && assigned_to !== task.assigned_to) {
    await notify(assigned_to, tid, 'Task Assigned to You', `You have been assigned: ${task.title}`, 'task_assigned', id);
  }
  await audit(requester.id, tid, 'UPDATE_TASK', id, oldSnap, body, ip);

  const [updated] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? AND t.tenant_id = ? LIMIT 1`, [id, tid]
  );
  return updated[0];
};

// ============================================================
// SUBMIT TASK
// ============================================================
const submitTask = async ({ id, requester, ip }) => {
  const tid = requester.tenant_id;
  const [rows] = await db.query('SELECT * FROM tasks WHERE id = ? AND tenant_id = ? LIMIT 1', [id, tid]);
  if (!rows.length) throw { status: 404, message: 'Task not found.' };
  const task = rows[0];

  if (task.assigned_to !== requester.id) throw { status: 403, message: 'You can only submit your own tasks.' };
  if (!['assigned', 'in_progress', 'rejected'].includes(task.status)) {
    throw { status: 400, message: `Cannot submit a task with status: ${task.status}.` };
  }

  await db.query(`UPDATE tasks SET status = 'submitted', submitted_at = NOW() WHERE id = ? AND tenant_id = ?`, [id, tid]);
  await notify(task.assigned_by, tid, 'Task Submitted for Review', `${requester.name} submitted: ${task.title}`, 'task_submitted', id);
  await audit(requester.id, tid, 'SUBMIT_TASK', id, { status: task.status }, { status: 'submitted' }, ip);

  const [updated] = await db.query(`SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? AND t.tenant_id = ? LIMIT 1`, [id, tid]);
  return updated[0];
};

// ============================================================
// APPROVE TASK
// ============================================================
const approveTask = async ({ id, requester, ip }) => {
  if (requester.role === 'recruiter') throw { status: 403, message: 'Recruiters cannot approve tasks.' };
  const tid = requester.tenant_id;
  const [rows] = await db.query('SELECT * FROM tasks WHERE id = ? AND tenant_id = ? LIMIT 1', [id, tid]);
  if (!rows.length) throw { status: 404, message: 'Task not found.' };
  const task = rows[0];
  if (task.status !== 'submitted') throw { status: 400, message: 'Only submitted tasks can be approved.' };

  await db.query(`UPDATE tasks SET status = 'approved', approved_at = NOW() WHERE id = ? AND tenant_id = ?`, [id, tid]);
  await notify(task.assigned_to, tid, 'Task Approved! 🎉', `Your task "${task.title}" has been approved.`, 'task_approved', id);
  await audit(requester.id, tid, 'APPROVE_TASK', id, { status: 'submitted' }, { status: 'approved' }, ip);

  const [updated] = await db.query(`SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? AND t.tenant_id = ? LIMIT 1`, [id, tid]);
  return updated[0];
};

// ============================================================
// REJECT TASK
// ============================================================
const rejectTask = async ({ id, requester, reason, ip }) => {
  if (requester.role === 'recruiter') throw { status: 403, message: 'Recruiters cannot reject tasks.' };
  if (!reason?.trim()) throw { status: 400, message: 'Rejection reason is required.' };
  const tid = requester.tenant_id;
  const [rows] = await db.query('SELECT * FROM tasks WHERE id = ? AND tenant_id = ? LIMIT 1', [id, tid]);
  if (!rows.length) throw { status: 404, message: 'Task not found.' };
  const task = rows[0];
  if (task.status !== 'submitted') throw { status: 400, message: 'Only submitted tasks can be rejected.' };

  await db.query(`UPDATE tasks SET status = 'rejected', rejection_reason = ? WHERE id = ? AND tenant_id = ?`, [reason.trim(), id, tid]);
  await notify(task.assigned_to, tid, 'Task Rejected', `Your task "${task.title}" was rejected: ${reason}`, 'task_rejected', id);
  await audit(requester.id, tid, 'REJECT_TASK', id, { status: 'submitted' }, { status: 'rejected', reason }, ip);

  const [updated] = await db.query(`SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? AND t.tenant_id = ? LIMIT 1`, [id, tid]);
  return updated[0];
};

// ============================================================
// DELETE TASK
// ============================================================
const deleteTask = async ({ id, requester, ip }) => {
  if (requester.role === 'recruiter') throw { status: 403, message: 'Recruiters cannot delete tasks.' };
  const tid = requester.tenant_id;
  const [rows] = await db.query('SELECT id, title, status FROM tasks WHERE id = ? AND tenant_id = ? LIMIT 1', [id, tid]);
  if (!rows.length) throw { status: 404, message: 'Task not found.' };
  const task = rows[0];
  if (task.status === 'approved') throw { status: 400, message: 'Approved tasks cannot be deleted.' };

  await db.query('DELETE FROM tasks WHERE id = ? AND tenant_id = ?', [id, tid]);
  await audit(requester.id, tid, 'DELETE_TASK', id, { title: task.title, status: task.status }, null, ip);
  return { message: `Task "${task.title}" deleted.` };
};

// ============================================================
// GET ASSIGNABLE USERS
// ============================================================
const getAssignableUsers = async (requester) => {
  const tid = requester.tenant_id;
  let where = '', params = [tid];

  if (requester.role === 'admin') {
    where = `WHERE u.tenant_id = ? AND u.status = 'active' AND u.role IN ('manager','team_leader','recruiter')`;
  } else if (requester.role === 'manager') {
    where  = `WHERE u.tenant_id = ? AND u.status = 'active'
               AND (u.manager_id = ? OR u.manager_id IN (
                 SELECT id FROM users WHERE manager_id = ? AND role = 'team_leader' AND tenant_id = ?
               )) AND u.role IN ('team_leader','recruiter')`;
    params = [tid, requester.id, requester.id, tid];
  } else if (requester.role === 'team_leader') {
    where  = `WHERE u.tenant_id = ? AND u.status = 'active' AND u.manager_id = ? AND u.role = 'recruiter'`;
    params = [tid, requester.id];
  }

  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.profile_pic FROM users u ${where} ORDER BY u.role, u.name`,
    params
  );
  return rows;
};

// ============================================================
// GET TASK STATS (dashboard)
// ============================================================
const getTaskStats = async (requester) => {
  const scope = await buildScope(requester);
  const [rows] = await db.query(
    `SELECT t.status, COUNT(*) AS count ${TASK_JOIN} ${scope.where} GROUP BY t.status`,
    scope.params
  );
  const stats = { assigned: 0, in_progress: 0, submitted: 0, approved: 0, rejected: 0, total: 0 };
  rows.forEach((r) => { stats[r.status] = parseInt(r.count); stats.total += parseInt(r.count); });
  return stats;
};

module.exports = {
  getAllTasks, getTaskById, createTask,
  updateTask, submitTask, approveTask,
  rejectTask, deleteTask, getAssignableUsers, getTaskStats,
};
