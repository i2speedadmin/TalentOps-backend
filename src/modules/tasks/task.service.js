// ============================================================
// src/modules/tasks/task.service.js
// ============================================================

const db = require('../../config/db');

// ─── Audit helper ────────────────────────────────────────────
const audit = (userId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs
       (user_id, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (?, ?, 'tasks', ?, ?, ?, ?)`,
    [
      userId, action, targetId,
      oldVal ? JSON.stringify(oldVal) : null,
      newVal ? JSON.stringify(newVal) : null,
      ip || null,
    ]
  );

// ─── Notification helper ─────────────────────────────────────
const notify = (userId, title, message, type, refId) =>
  db.query(
    `INSERT INTO notifications (user_id, title, message, type, ref_id)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, title, message, type, refId]
  );

// ─── Role level ───────────────────────────────────────────────
const ROLE_LEVEL = { admin: 4, manager: 3, team_leader: 2, recruiter: 1 };

// ─── Base task SELECT ─────────────────────────────────────────
const TASK_SELECT = `
  t.id, t.title, t.description, t.status, t.priority,
  t.due_date, t.submitted_at, t.approved_at, t.rejection_reason,
  t.created_at, t.updated_at,
  t.assigned_to, t.assigned_by,
  u1.name  AS assignee_name,  u1.email AS assignee_email,
  u1.role  AS assignee_role,  u1.profile_pic AS assignee_pic,
  u2.name  AS assigner_name,  u2.email AS assigner_email,
  u2.role  AS assigner_role
`;
const TASK_JOIN = `
  FROM tasks t
  LEFT JOIN users u1 ON u1.id = t.assigned_to
  LEFT JOIN users u2 ON u2.id = t.assigned_by
`;

// ─── Build scope WHERE based on requester role ────────────────
const buildScope = async (requester) => {
  switch (requester.role) {
    case 'admin':
      return { where: '', params: [] };

    case 'manager': {
      // Tasks assigned by self OR by TLs under this manager OR to recruiters under TLs
      const [tls] = await db.query(
        `SELECT id FROM users WHERE manager_id = ? AND role = 'team_leader'`,
        [requester.id]
      );
      const tlIds = tls.map((r) => r.id);
      const [recs] = await db.query(
        `SELECT id FROM users WHERE manager_id IN (${tlIds.length ? tlIds.join(',') : 0}) AND role = 'recruiter'`
      );
      const recIds = recs.map((r) => r.id);
      const allIds = [requester.id, ...tlIds, ...recIds];
      return {
        where:  `WHERE (t.assigned_by IN (${allIds.join(',')}) OR t.assigned_to IN (${allIds.join(',')}))`,
        params: [],
      };
    }

    case 'team_leader': {
      const [recs] = await db.query(
        `SELECT id FROM users WHERE manager_id = ? AND role = 'recruiter'`,
        [requester.id]
      );
      const recIds = recs.map((r) => r.id);
      const allIds = [requester.id, ...recIds];
      return {
        where:  `WHERE (t.assigned_by = ? OR t.assigned_to IN (${allIds.join(',')}))`,
        params: [requester.id],
      };
    }

    default: // recruiter
      return {
        where:  'WHERE t.assigned_to = ?',
        params: [requester.id],
      };
  }
};

// ============================================================
// GET ALL TASKS
// ============================================================
const getAllTasks = async ({ requester, page = 1, limit = 10, search, status, priority, assignedTo, sortBy = 'created_at', sortDir = 'DESC' }) => {
  const offset = (page - 1) * limit;
  const scope  = await buildScope(requester);

  const filters = [];
  const params  = [...scope.params];

  if (search)     { filters.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (status)     { filters.push('t.status = ?');      params.push(status);     }
  if (priority)   { filters.push('t.priority = ?');    params.push(priority);   }
  if (assignedTo) { filters.push('t.assigned_to = ?'); params.push(assignedTo); }

  const ALLOWED_SORT = ['created_at', 'due_date', 'status', 'priority', 'title'];
  const safeSort = ALLOWED_SORT.includes(sortBy) ? sortBy : 'created_at';
  const safeDir  = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const whereClause = scope.where
    ? scope.where + (filters.length ? ' AND ' + filters.join(' AND ') : '')
    : filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows]  = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} ${whereClause}
     ORDER BY t.${safeSort} ${safeDir} LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), parseInt(offset)]
  );
  const [count] = await db.query(
    `SELECT COUNT(*) AS total ${TASK_JOIN} ${whereClause}`,
    params
  );

  return {
    tasks: rows,
    pagination: {
      total:      count[0].total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(count[0].total / limit),
    },
  };
};

// ============================================================
// GET TASK BY ID
// ============================================================
const getTaskById = async (id, requester) => {
  const [rows] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw { status: 404, message: 'Task not found.' };

  const task = rows[0];

  // Scope check
  if (requester.role === 'recruiter' && task.assigned_to !== requester.id) {
    throw { status: 403, message: 'Access denied.' };
  }

  // Fetch comments
  const [comments] = await db.query(
    `SELECT c.id, c.comment, c.created_at, c.updated_at,
            u.id AS user_id, u.name AS user_name, u.role AS user_role, u.profile_pic
     FROM task_comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.task_id = ? ORDER BY c.created_at ASC`,
    [id]
  );

  // Fetch files
  const [files] = await db.query(
    `SELECT f.id, f.original_name, f.file_name, f.file_path,
            f.file_size, f.mime_type, f.created_at,
            u.name AS uploaded_by_name
     FROM task_files f
     LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.task_id = ? ORDER BY f.created_at DESC`,
    [id]
  );

  return { ...task, comments, files };
};

// ============================================================
// CREATE TASK
// ============================================================
const createTask = async ({ requester, body, ip }) => {
  const { title, description, assigned_to, priority = 'medium', due_date } = body;

  if (!title || !assigned_to) {
    throw { status: 400, message: 'Title and assignee are required.' };
  }

  // Recruiters cannot create tasks
  if (requester.role === 'recruiter') {
    throw { status: 403, message: 'Recruiters cannot create tasks.' };
  }

  // Validate assignee exists
  const [assigneeRows] = await db.query(
    'SELECT id, name, role, manager_id FROM users WHERE id = ? AND status = ? LIMIT 1',
    [assigned_to, 'active']
  );
  if (!assigneeRows.length) throw { status: 404, message: 'Assignee not found or inactive.' };

  const assignee = assigneeRows[0];

  // Ensure requester can assign to this person (must be in their hierarchy)
  if (requester.role !== 'admin') {
    if (ROLE_LEVEL[assignee.role] >= ROLE_LEVEL[requester.role]) {
      throw { status: 403, message: 'You can only assign tasks to users below your role level.' };
    }
  }

  const [result] = await db.query(
    `INSERT INTO tasks (title, description, assigned_to, assigned_by, priority, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?, 'assigned')`,
    [title.trim(), description || null, assigned_to, requester.id, priority, due_date || null]
  );

  const taskId = result.insertId;

  // Notify assignee
  await notify(
    assigned_to,
    'New Task Assigned',
    `You have been assigned: ${title}`,
    'task_assigned',
    taskId
  );

  await audit(requester.id, 'CREATE_TASK', taskId, null,
    { title, assigned_to, priority, status: 'assigned' }, ip);

  const [created] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? LIMIT 1`, [taskId]
  );
  return created[0];
};

// ============================================================
// UPDATE TASK (general fields — by manager/TL)
// ============================================================
const updateTask = async ({ id, requester, body, ip }) => {
  const [rows] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? LIMIT 1`, [id]
  );
  if (!rows.length) throw { status: 404, message: 'Task not found.' };

  const task = rows[0];

  // Approved tasks cannot be edited
  if (task.status === 'approved') {
    throw { status: 400, message: 'Approved tasks cannot be edited.' };
  }

  // Recruiters can only update progress (not title/assignee)
  if (requester.role === 'recruiter') {
    if (task.assigned_to !== requester.id) throw { status: 403, message: 'Access denied.' };
    // Recruiter can only update status to in_progress
    const allowed = ['in_progress'];
    if (body.status && !allowed.includes(body.status)) {
      throw { status: 403, message: 'Recruiters can only update status to in_progress.' };
    }
  }

  const { title, description, priority, due_date, status, assigned_to } = body;
  const oldSnap = { title: task.title, status: task.status, priority: task.priority };

  const fields = [];
  const values = [];

  if (title       !== undefined) { fields.push('title = ?');       values.push(title.trim()); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (priority    !== undefined) { fields.push('priority = ?');    values.push(priority); }
  if (due_date    !== undefined) { fields.push('due_date = ?');    values.push(due_date || null); }
  if (status      !== undefined) { fields.push('status = ?');      values.push(status); }
  if (assigned_to !== undefined) { fields.push('assigned_to = ?'); values.push(assigned_to); }

  if (!fields.length) throw { status: 400, message: 'No fields to update.' };

  values.push(id);
  await db.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);

  // Notify if reassigned
  if (assigned_to && assigned_to !== task.assigned_to) {
    await notify(assigned_to, 'Task Assigned to You',
      `You have been assigned: ${task.title}`, 'task_assigned', id);
  }

  await audit(requester.id, 'UPDATE_TASK', id, oldSnap, body, ip);

  const [updated] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? LIMIT 1`, [id]
  );
  return updated[0];
};

// ============================================================
// SUBMIT TASK (recruiter only)
// ============================================================
const submitTask = async ({ id, requester, ip }) => {
  const [rows] = await db.query('SELECT * FROM tasks WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Task not found.' };

  const task = rows[0];

  if (task.assigned_to !== requester.id) {
    throw { status: 403, message: 'You can only submit your own tasks.' };
  }
  if (!['assigned', 'in_progress', 'rejected'].includes(task.status)) {
    throw { status: 400, message: `Cannot submit a task with status: ${task.status}.` };
  }

  await db.query(
    `UPDATE tasks SET status = 'submitted', submitted_at = NOW() WHERE id = ?`, [id]
  );

  // Notify assigner
  await notify(
    task.assigned_by,
    'Task Submitted for Review',
    `${requester.name} submitted: ${task.title}`,
    'task_submitted',
    id
  );

  await audit(requester.id, 'SUBMIT_TASK', id,
    { status: task.status }, { status: 'submitted' }, ip);

  const [updated] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? LIMIT 1`, [id]
  );
  return updated[0];
};

// ============================================================
// APPROVE TASK (manager / TL)
// ============================================================
const approveTask = async ({ id, requester, ip }) => {
  if (requester.role === 'recruiter') {
    throw { status: 403, message: 'Recruiters cannot approve tasks.' };
  }

  const [rows] = await db.query('SELECT * FROM tasks WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Task not found.' };

  const task = rows[0];
  if (task.status !== 'submitted') {
    throw { status: 400, message: 'Only submitted tasks can be approved.' };
  }

  await db.query(
    `UPDATE tasks SET status = 'approved', approved_at = NOW() WHERE id = ?`, [id]
  );

  // Notify recruiter
  await notify(
    task.assigned_to,
    'Task Approved! 🎉',
    `Your task "${task.title}" has been approved.`,
    'task_approved',
    id
  );

  await audit(requester.id, 'APPROVE_TASK', id,
    { status: 'submitted' }, { status: 'approved' }, ip);

  const [updated] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? LIMIT 1`, [id]
  );
  return updated[0];
};

// ============================================================
// REJECT TASK (manager / TL)
// ============================================================
const rejectTask = async ({ id, requester, reason, ip }) => {
  if (requester.role === 'recruiter') {
    throw { status: 403, message: 'Recruiters cannot reject tasks.' };
  }

  const [rows] = await db.query('SELECT * FROM tasks WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Task not found.' };

  const task = rows[0];
  if (task.status !== 'submitted') {
    throw { status: 400, message: 'Only submitted tasks can be rejected.' };
  }
  if (!reason || !reason.trim()) {
    throw { status: 400, message: 'Rejection reason is required.' };
  }

  await db.query(
    `UPDATE tasks SET status = 'rejected', rejection_reason = ? WHERE id = ?`,
    [reason.trim(), id]
  );

  // Notify recruiter
  await notify(
    task.assigned_to,
    'Task Rejected',
    `Your task "${task.title}" was rejected: ${reason}`,
    'task_rejected',
    id
  );

  await audit(requester.id, 'REJECT_TASK', id,
    { status: 'submitted' },
    { status: 'rejected', rejection_reason: reason }, ip);

  const [updated] = await db.query(
    `SELECT ${TASK_SELECT} ${TASK_JOIN} WHERE t.id = ? LIMIT 1`, [id]
  );
  return updated[0];
};

// ============================================================
// DELETE TASK
// ============================================================
const deleteTask = async ({ id, requester, ip }) => {
  if (requester.role === 'recruiter') {
    throw { status: 403, message: 'Recruiters cannot delete tasks.' };
  }

  const [rows] = await db.query('SELECT id, title, status FROM tasks WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Task not found.' };

  const task = rows[0];
  if (task.status === 'approved') {
    throw { status: 400, message: 'Approved tasks cannot be deleted.' };
  }

  await db.query('DELETE FROM tasks WHERE id = ?', [id]);
  await audit(requester.id, 'DELETE_TASK', id,
    { title: task.title, status: task.status }, null, ip);

  return { message: `Task "${task.title}" deleted.` };
};

// ============================================================
// GET ASSIGNABLE USERS (for dropdown)
// ============================================================
const getAssignableUsers = async (requester) => {
  let where  = '';
  let params = [];

  if (requester.role === 'admin') {
    where = `WHERE u.status = 'active' AND u.role IN ('manager','team_leader','recruiter')`;
  } else if (requester.role === 'manager') {
    // TLs and recruiters under this manager
    where  = `WHERE u.status = 'active' AND (
                u.manager_id = ? OR
                u.manager_id IN (SELECT id FROM users WHERE manager_id = ? AND role = 'team_leader')
              ) AND u.role IN ('team_leader','recruiter')`;
    params = [requester.id, requester.id];
  } else if (requester.role === 'team_leader') {
    where  = `WHERE u.status = 'active' AND u.manager_id = ? AND u.role = 'recruiter'`;
    params = [requester.id];
  }

  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.profile_pic
     FROM users u ${where} ORDER BY u.role, u.name`,
    params
  );
  return rows;
};

// ============================================================
// GET TASK STATS (for dashboard)
// ============================================================
const getTaskStats = async (requester) => {
  const scope = await buildScope(requester);

  const [rows] = await db.query(
    `SELECT status, COUNT(*) AS count ${TASK_JOIN} ${scope.where}
     GROUP BY status`,
    scope.params
  );

  const stats = { assigned: 0, in_progress: 0, submitted: 0, approved: 0, rejected: 0, total: 0 };
  rows.forEach((r) => {
    stats[r.status] = r.count;
    stats.total    += r.count;
  });
  return stats;
};

module.exports = {
  getAllTasks, getTaskById, createTask,
  updateTask, submitTask, approveTask,
  rejectTask, deleteTask, getAssignableUsers,
  getTaskStats,
};
