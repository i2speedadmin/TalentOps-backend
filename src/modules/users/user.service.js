// ============================================================
// src/modules/users/user.service.js
// FIXED: All queries now scoped by tenant_id
// ============================================================

const bcrypt = require('bcryptjs');
const db     = require('../../config/db');
const path   = require('path');
const fs     = require('fs');

// ─── Base SELECT ─────────────────────────────────────────────
const USER_SELECT = `
  u.id, u.tenant_id, u.name, u.email, u.role, u.manager_id,
  u.profile_pic, u.status, u.created_at, u.updated_at,
  m.name AS manager_name, m.role AS manager_role
`;
const USER_JOIN = `
  FROM users u
  LEFT JOIN users m ON m.id = u.manager_id AND m.tenant_id = u.tenant_id
`;

// ─── Audit helper ─────────────────────────────────────────────
const audit = (userId, tenantId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs
       (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (?, ?, 'user', ?, 'users', ?, ?, ?, ?)`,
    [
      tenantId, userId, action, targetId,
      oldVal ? JSON.stringify(oldVal) : null,
      newVal ? JSON.stringify(newVal) : null,
      ip || null,
    ]
  ).catch(() => {}); // non-fatal

// ─── Role hierarchy ───────────────────────────────────────────
const ROLE_LEVEL = { admin: 4, manager: 3, team_leader: 2, recruiter: 1 };

const MANAGEABLE_ROLES = {
  admin:       ['manager', 'team_leader', 'recruiter'],
  manager:     ['team_leader', 'recruiter'],
  team_leader: ['recruiter'],
  recruiter:   [],
};

// ─── Plan user limits ─────────────────────────────────────────
const PLAN_USER_LIMITS = { starter: 10, pro: 50, enterprise: 100 };

// ─── Build scope WHERE — always includes tenant_id ────────────
const buildScopeWhere = (requester) => {
  const tenantId = requester.tenant_id;

  switch (requester.role) {
    case 'admin':
      // Admin sees ALL users in their own tenant ONLY
      return {
        where:  'WHERE u.tenant_id = ?',
        params: [tenantId],
      };

    case 'manager':
      // Manager sees users under their TLs and their recruiters
      return {
        where: `WHERE u.tenant_id = ? AND (
                  u.manager_id = ? OR
                  u.manager_id IN (
                    SELECT id FROM users
                    WHERE manager_id = ? AND role = 'team_leader' AND tenant_id = ?
                  )
                )`,
        params: [tenantId, requester.id, requester.id, tenantId],
      };

    case 'team_leader':
      // Team Leader sees only their direct recruiters
      return {
        where:  'WHERE u.tenant_id = ? AND u.manager_id = ?',
        params: [tenantId, requester.id],
      };

    default: // recruiter — can only see themselves
      return {
        where:  'WHERE u.tenant_id = ? AND u.id = ?',
        params: [tenantId, requester.id],
      };
  }
};

// ============================================================
// GET ALL USERS
// ============================================================
const getAllUsers = async ({ requester, page = 1, limit = 20, search, role, status }) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
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

  const [rows]  = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} ${whereClause}
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );
  const [count] = await db.query(
    `SELECT COUNT(*) AS total ${USER_JOIN} ${whereClause}`,
    params
  );

  return {
    users: rows,
    pagination: {
      total:      parseInt(count[0].total) || 0,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil((parseInt(count[0].total) || 0) / parseInt(limit)),
    },
  };
};

// ============================================================
// GET SINGLE USER
// ============================================================
const getUserById = async (id, requester) => {
  // Always scope by tenant_id
  const [rows] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN}
     WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`,
    [id, requester.tenant_id]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const target = rows[0];

  // Additional scope check for non-admins
  if (requester.role !== 'admin' && target.id !== requester.id) {
    const scope   = buildScopeWhere(requester);
    const [check] = await db.query(
      `SELECT u.id ${USER_JOIN} ${scope.where} AND u.id = ? LIMIT 1`,
      [...scope.params, id]
    );
    if (!check.length) throw { status: 403, message: 'Access denied.' };
  }

  return target;
};

// ============================================================
// CREATE USER
// ============================================================
const createUser = async ({ requester, tenant, body, ip }) => {
  const { name, email, password, role, manager_id, status = 'active' } = body;
  const tenantId = requester.tenant_id;

  if (!name || !email || !password || !role) {
    throw { status: 400, message: 'Name, email, password and role are required.' };
  }
  if (!MANAGEABLE_ROLES[requester.role]?.includes(role)) {
    throw { status: 403, message: `You cannot create users with role: ${role}.` };
  }
  if (password.length < 8) {
    throw { status: 400, message: 'Password must be at least 8 characters.' };
  }

  // ── Plan user limit check ──────────────────────────────────
  if (tenant) {
    const planSlug = (tenant.plan_slug || 'starter').toLowerCase();
    const maxUsers = PLAN_USER_LIMITS[planSlug] ?? 10;
    if (maxUsers > 0) {
      const [countRows] = await db.query(
        `SELECT COUNT(*) AS cnt FROM users WHERE tenant_id = ? AND status = 'active'`,
        [tenantId]
      );
      const currentCount = parseInt(countRows[0]?.cnt) || 0;
      if (currentCount >= maxUsers) {
        throw {
          status:  403,
          message: `Your ${planSlug} plan allows a maximum of ${maxUsers} users (including company admin). Please upgrade your plan to add more users.`,
          code:    'PLAN_USER_LIMIT',
        };
      }
    }
  }

  // ── Email uniqueness within tenant ────────────────────────
  const [exists] = await db.query(
    'SELECT id FROM users WHERE email = ? AND tenant_id = ? LIMIT 1',
    [email.trim().toLowerCase(), tenantId]
  );
  if (exists.length) throw { status: 409, message: 'A user with this email already exists in your organisation.' };

  // ── Validate manager_id belongs to same tenant ────────────
  if (manager_id) {
    const [mgr] = await db.query(
      'SELECT id, role FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
      [manager_id, tenantId]
    );
    if (!mgr.length) throw { status: 400, message: 'Manager not found in your organisation.' };
    if (ROLE_LEVEL[mgr[0].role] <= ROLE_LEVEL[role]) {
      throw { status: 400, message: 'Manager must have a higher role than the user being created.' };
    }
  }

  const hashed = await bcrypt.hash(password, 10);
  const [result] = await db.query(
    `INSERT INTO users (tenant_id, name, email, password, role, manager_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, name.trim(), email.trim().toLowerCase(), hashed, role, manager_id || null, status]
  );
  const newId = result.insertId;

  await audit(requester.id, tenantId, 'CREATE_USER', newId, null, { name, email, role }, ip);

  await db.query(
    `INSERT INTO notifications (tenant_id, user_id, title, message, type)
     VALUES (?, ?, 'Welcome to TalentOps', ?, 'general')`,
    [tenantId, newId, `Hi ${name}, your account has been created. Welcome aboard!`]
  ).catch(() => {});

  const [created] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`,
    [newId, tenantId]
  );
  return created[0];
};

// ============================================================
// UPDATE USER
// ============================================================
const updateUser = async ({ id, requester, body, ip }) => {
  const tenantId = requester.tenant_id;

  const [rows] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`,
    [id, tenantId]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const target = rows[0];

  if (requester.role !== 'admin') {
    if (ROLE_LEVEL[target.role] >= ROLE_LEVEL[requester.role]) {
      throw { status: 403, message: 'You cannot edit this user.' };
    }
  }

  const { name, email, role, manager_id, status } = body;

  // Email uniqueness within tenant
  if (email && email.toLowerCase() !== target.email) {
    const [exists] = await db.query(
      'SELECT id FROM users WHERE email = ? AND tenant_id = ? AND id != ? LIMIT 1',
      [email.toLowerCase(), tenantId, id]
    );
    if (exists.length) throw { status: 409, message: 'Email already in use within your organisation.' };
  }

  // Validate new manager belongs to same tenant
  if (manager_id) {
    const [mgr] = await db.query(
      'SELECT id FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
      [manager_id, tenantId]
    );
    if (!mgr.length) throw { status: 400, message: 'Manager not found in your organisation.' };
  }

  const fields  = [];
  const values  = [];
  const oldSnap = { name: target.name, email: target.email, role: target.role, status: target.status };

  if (name       !== undefined) { fields.push('name = ?');       values.push(name.trim()); }
  if (email      !== undefined) { fields.push('email = ?');      values.push(email.trim().toLowerCase()); }
  if (role       !== undefined) { fields.push('role = ?');       values.push(role); }
  if (manager_id !== undefined) { fields.push('manager_id = ?'); values.push(manager_id || null); }
  if (status     !== undefined) { fields.push('status = ?');     values.push(status); }

  if (!fields.length) throw { status: 400, message: 'No fields to update.' };

  values.push(id, tenantId);
  await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
  await audit(requester.id, tenantId, 'UPDATE_USER', id, oldSnap, body, ip);

  const [updated] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`,
    [id, tenantId]
  );
  return updated[0];
};

// ============================================================
// DELETE USER
// ============================================================
const deleteUser = async ({ id, requester, ip }) => {
  const tenantId = requester.tenant_id;

  if (parseInt(id) === requester.id) {
    throw { status: 400, message: 'You cannot delete your own account.' };
  }

  const [rows] = await db.query(
    'SELECT id, name, role FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
    [id, tenantId]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const target = rows[0];

  if (requester.role !== 'admin' && ROLE_LEVEL[target.role] >= ROLE_LEVEL[requester.role]) {
    throw { status: 403, message: 'You cannot delete this user.' };
  }

  await db.query('DELETE FROM users WHERE id = ? AND tenant_id = ?', [id, tenantId]);
  await audit(requester.id, tenantId, 'DELETE_USER', id, { name: target.name, role: target.role }, null, ip);

  return { message: `User "${target.name}" deleted successfully.` };
};

// ============================================================
// RESET USER PASSWORD (by admin/manager)
// ============================================================
const resetUserPassword = async ({ id, requester, newPassword, ip }) => {
  if (!newPassword || newPassword.length < 8) {
    throw { status: 400, message: 'Password must be at least 8 characters.' };
  }

  const tenantId = requester.tenant_id;
  const [rows]   = await db.query(
    'SELECT id, role FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
    [id, tenantId]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  if (requester.role !== 'admin' && ROLE_LEVEL[rows[0].role] >= ROLE_LEVEL[requester.role]) {
    throw { status: 403, message: 'Permission denied.' };
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE users SET password = ? WHERE id = ? AND tenant_id = ?', [hashed, id, tenantId]);
  await audit(requester.id, tenantId, 'RESET_USER_PASSWORD', id, null, { action: 'password_reset_by_admin' }, ip);

  return { message: 'Password reset successfully.' };
};

// ============================================================
// UPDATE PROFILE (self)
// ============================================================
const updateProfile = async ({ userId, tenantId, body, file, ip }) => {
  const { name } = body;

  const [rows] = await db.query(
    'SELECT id, name, profile_pic FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
    [userId, tenantId]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const current = rows[0];
  const fields  = [];
  const values  = [];

  if (name) { fields.push('name = ?'); values.push(name.trim()); }

  if (file) {
    if (current.profile_pic) {
      const oldPath = path.join(__dirname, '../../uploads/profiles', current.profile_pic);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    fields.push('profile_pic = ?');
    values.push(file.filename);
  }

  if (!fields.length) throw { status: 400, message: 'Nothing to update.' };

  values.push(userId, tenantId);
  await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);

  const [updated] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`,
    [userId, tenantId]
  );
  return updated[0];
};

// ============================================================
// GET MANAGERS LIST (for dropdown — same tenant only)
// ============================================================
const getManagers = async (requester) => {
  const tenantId = requester.tenant_id;
  let where  = '';
  let params = [tenantId];

  if (requester.role === 'admin') {
    where = `WHERE u.tenant_id = ? AND u.role IN ('admin','manager','team_leader') AND u.status = 'active'`;
  } else if (requester.role === 'manager') {
    where  = `WHERE u.tenant_id = ? AND u.role = 'team_leader' AND u.status = 'active' AND u.manager_id = ?`;
    params = [tenantId, requester.id];
  } else {
    return [];
  }

  const [rows] = await db.query(
    `SELECT u.id, u.name, u.role ${USER_JOIN} ${where} ORDER BY u.role, u.name`,
    params
  );
  return rows;
};

// ============================================================
// GET ASSIGNABLE USERS for task creation (same tenant only)
// ============================================================
const getAssignableUsers = async (requester) => {
  const tenantId = requester.tenant_id;
  const scope    = buildScopeWhere(requester);

  // For task assignment, managers/TLs can assign to users in their scope
  const whereClause = scope.where
    ? scope.where + ` AND u.status = 'active' AND u.role IN ('recruiter','team_leader')`
    : `WHERE u.tenant_id = ? AND u.status = 'active' AND u.role IN ('recruiter','team_leader')`;

  const params = scope.where
    ? [...scope.params]
    : [tenantId];

  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role ${USER_JOIN} ${whereClause} ORDER BY u.role, u.name`,
    params
  );
  return rows;
};

module.exports = {
  getAllUsers, getUserById, createUser,
  updateUser, deleteUser, resetUserPassword,
  updateProfile, getManagers, getAssignableUsers,
  MANAGEABLE_ROLES,
};
