// ============================================================
// src/modules/users/user.service.js
// ============================================================

const bcrypt = require('bcryptjs');
const db     = require('../../config/db');
const path   = require('path');
const fs     = require('fs');

// ─── Helper: base SELECT ──────────────────────────────────────
const USER_SELECT = `
  u.id, u.name, u.email, u.role, u.manager_id,
  u.profile_pic, u.status, u.created_at, u.updated_at,
  m.name AS manager_name, m.role AS manager_role
`;
const USER_JOIN = `
  FROM users u
  LEFT JOIN users m ON m.id = u.manager_id
`;

// ─── Audit helper ────────────────────────────────────────────
const audit = (connection, userId, action, targetId, oldVal, newVal, ip) =>
  connection.query(
    `INSERT INTO audit_logs
       (user_id, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (?, ?, 'users', ?, ?, ?, ?)`,
    [
      userId, action, targetId,
      oldVal ? JSON.stringify(oldVal) : null,
      newVal ? JSON.stringify(newVal) : null,
      ip || null,
    ]
  );

// ─── Role hierarchy map ──────────────────────────────────────
const ROLE_LEVEL = { admin: 4, manager: 3, team_leader: 2, recruiter: 1 };

// ─── Roles a given role can manage ──────────────────────────
const MANAGEABLE_ROLES = {
  admin:       ['admin', 'manager', 'team_leader', 'recruiter'],
  manager:     ['team_leader', 'recruiter'],
  team_leader: ['recruiter'],
  recruiter:   [],
};

// ─── Build WHERE clause based on requester role ──────────────
const buildScopeWhere = (requester) => {
  switch (requester.role) {
    case 'admin':
      return { where: '', params: [] };
    case 'manager':
      // Users managed by this manager or under TLs they manage
      return {
        where: `WHERE (u.manager_id = ? OR u.manager_id IN (
                  SELECT id FROM users WHERE manager_id = ? AND role = 'team_leader'
                ))`,
        params: [requester.id, requester.id],
      };
    case 'team_leader':
      return {
        where:  'WHERE u.manager_id = ?',
        params: [requester.id],
      };
    default:
      return { where: 'WHERE u.id = ?', params: [requester.id] };
  }
};

// ============================================================
// GET ALL USERS
// ============================================================
const getAllUsers = async ({ requester, page = 1, limit = 20, search, role, status }) => {
  const offset = (page - 1) * limit;
  const scope  = buildScopeWhere(requester);

  const filters = [];
  const params  = [...scope.params];

  if (search) {
    filters.push('(u.name LIKE ? OR u.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (role)   { filters.push('u.role = ?');   params.push(role);   }
  if (status) { filters.push('u.status = ?'); params.push(status); }

  const whereClause = scope.where
    ? scope.where + (filters.length ? ' AND ' + filters.join(' AND ') : '')
    : filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const dataParams  = [...params, parseInt(limit), parseInt(offset)];
  const countParams = [...params];

  const [rows]  = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} ${whereClause}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    dataParams
  );
  const [count] = await db.query(
    `SELECT COUNT(*) AS total ${USER_JOIN} ${whereClause}`,
    countParams
  );

  return {
    users: rows,
    pagination: {
      total:       count[0].total,
      page:        parseInt(page),
      limit:       parseInt(limit),
      totalPages:  Math.ceil(count[0].total / limit),
    },
  };
};

// ============================================================
// GET SINGLE USER
// ============================================================
const getUserById = async (id, requester) => {
  const [rows] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const target = rows[0];

  // Scope check — non-admins can only view users in their hierarchy
  if (requester.role !== 'admin') {
    const scope  = buildScopeWhere(requester);
    const [check] = await db.query(
      `SELECT u.id ${USER_JOIN} ${scope.where} AND u.id = ? LIMIT 1`,
      [...scope.params, id]
    );
    if (!check.length && target.id !== requester.id) {
      throw { status: 403, message: 'Access denied.' };
    }
  }
  return target;
};

// ============================================================
// CREATE USER
// ============================================================
const createUser = async ({ requester, body, ip }) => {
  const { name, email, password, role, manager_id, status = 'active' } = body;

  // Validation
  if (!name || !email || !password || !role) {
    throw { status: 400, message: 'Name, email, password and role are required.' };
  }
  if (!MANAGEABLE_ROLES[requester.role]?.includes(role)) {
    throw { status: 403, message: `You cannot create users with role: ${role}.` };
  }
  if (password.length < 8) {
    throw { status: 400, message: 'Password must be at least 8 characters.' };
  }

  // Check email uniqueness
  const [exists] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
  if (exists.length) throw { status: 409, message: 'Email already exists.' };

  // Validate manager_id if provided
  if (manager_id) {
    const [mgr] = await db.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [manager_id]);
    if (!mgr.length) throw { status: 400, message: 'Manager not found.' };
    if (ROLE_LEVEL[mgr[0].role] <= ROLE_LEVEL[role]) {
      throw { status: 400, message: 'Manager must have a higher role than the user.' };
    }
  }

  const hashed = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    `INSERT INTO users (name, email, password, role, manager_id, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name.trim(), email.trim().toLowerCase(), hashed, role, manager_id || null, status]
  );

  const newId = result.insertId;

  // Audit
  await audit(null, requester.id, 'CREATE_USER', newId, null,
    { name, email, role, manager_id, status }, ip);

  // Notification to new user
  await db.query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES (?, 'Welcome to TalentOps', ?, 'general')`,
    [newId, `Hi ${name}, welcome to TalentOps! Your account is ready.`]
  );

  const [created] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? LIMIT 1`, [newId]
  );
  return created[0];
};

// ============================================================
// UPDATE USER
// ============================================================
const updateUser = async ({ id, requester, body, ip }) => {
  const [rows] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? LIMIT 1`, [id]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const target = rows[0];

  // Only admin can edit admins; only higher roles can edit lower
  if (requester.role !== 'admin') {
    if (ROLE_LEVEL[target.role] >= ROLE_LEVEL[requester.role]) {
      throw { status: 403, message: 'You cannot edit this user.' };
    }
  }

  const { name, email, role, manager_id, status } = body;

  // Check email uniqueness if changing
  if (email && email.toLowerCase() !== target.email) {
    const [exists] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
      [email.toLowerCase(), id]
    );
    if (exists.length) throw { status: 409, message: 'Email already in use.' };
  }

  // Build update fields dynamically
  const fields  = [];
  const values  = [];
  const oldSnap = { name: target.name, email: target.email, role: target.role, status: target.status };

  if (name      !== undefined) { fields.push('name = ?');       values.push(name.trim()); }
  if (email     !== undefined) { fields.push('email = ?');      values.push(email.trim().toLowerCase()); }
  if (role      !== undefined) { fields.push('role = ?');       values.push(role); }
  if (manager_id !== undefined) { fields.push('manager_id = ?'); values.push(manager_id || null); }
  if (status    !== undefined) { fields.push('status = ?');     values.push(status); }

  if (!fields.length) throw { status: 400, message: 'No fields to update.' };

  values.push(id);
  await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

  await audit(null, requester.id, 'UPDATE_USER', id, oldSnap, body, ip);

  const [updated] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? LIMIT 1`, [id]
  );
  return updated[0];
};

// ============================================================
// DELETE USER
// ============================================================
const deleteUser = async ({ id, requester, ip }) => {
  if (parseInt(id) === requester.id) {
    throw { status: 400, message: 'You cannot delete your own account.' };
  }

  const [rows] = await db.query('SELECT id, name, role FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const target = rows[0];

  if (requester.role !== 'admin' && ROLE_LEVEL[target.role] >= ROLE_LEVEL[requester.role]) {
    throw { status: 403, message: 'You cannot delete this user.' };
  }

  const oldSnap = { name: target.name, role: target.role };
  await db.query('DELETE FROM users WHERE id = ?', [id]);
  await audit(null, requester.id, 'DELETE_USER', id, oldSnap, null, ip);

  return { message: `User "${target.name}" deleted successfully.` };
};

// ============================================================
// RESET USER PASSWORD (by admin/manager)
// ============================================================
const resetUserPassword = async ({ id, requester, newPassword, ip }) => {
  if (!newPassword || newPassword.length < 8) {
    throw { status: 400, message: 'Password must be at least 8 characters.' };
  }

  const [rows] = await db.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  if (requester.role !== 'admin' && ROLE_LEVEL[rows[0].role] >= ROLE_LEVEL[requester.role]) {
    throw { status: 403, message: 'Permission denied.' };
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);
  await audit(null, requester.id, 'RESET_USER_PASSWORD', id, null,
    { action: 'password_reset_by_admin' }, ip);

  return { message: 'Password reset successfully.' };
};

// ============================================================
// UPDATE PROFILE (self)
// ============================================================
const updateProfile = async ({ userId, body, file, ip }) => {
  const { name } = body;

  const [rows] = await db.query('SELECT id, name, profile_pic FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const current = rows[0];
  const fields  = [];
  const values  = [];

  if (name) { fields.push('name = ?'); values.push(name.trim()); }

  if (file) {
    // Remove old pic if exists
    if (current.profile_pic) {
      const oldPath = path.join(__dirname, '../../uploads', current.profile_pic);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    fields.push('profile_pic = ?');
    values.push(file.filename);
  }

  if (!fields.length) throw { status: 400, message: 'Nothing to update.' };

  values.push(userId);
  await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

  await audit(null, userId, 'UPDATE_PROFILE', userId,
    { name: current.name }, { name, profile_pic: file?.filename }, ip);

  const [updated] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? LIMIT 1`, [userId]
  );
  return updated[0];
};

// ============================================================
// GET MANAGERS LIST (for dropdown)
// ============================================================
const getManagers = async (requester) => {
  let where  = '';
  let params = [];

  if (requester.role === 'admin') {
    where  = `WHERE u.role IN ('admin','manager','team_leader') AND u.status = 'active'`;
  } else if (requester.role === 'manager') {
    where  = `WHERE u.role = 'team_leader' AND u.status = 'active'
               AND u.manager_id = ${requester.id}`;
  }

  const [rows] = await db.query(
    `SELECT u.id, u.name, u.role ${USER_JOIN} ${where} ORDER BY u.role, u.name`,
    params
  );
  return rows;
};

module.exports = {
  getAllUsers, getUserById, createUser,
  updateUser, deleteUser, resetUserPassword,
  updateProfile, getManagers, MANAGEABLE_ROLES,
};
