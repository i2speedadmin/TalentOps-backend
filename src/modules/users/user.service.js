// ============================================================
// src/modules/users/user.service.js
// UPDATED:
//   - createUser: sends welcome email with login credentials
//   - All queries tenant-scoped
//   - Plan user limit enforced via req.tenant.max_users
// ============================================================

const bcrypt = require('bcryptjs');
const db     = require('../../config/db');
const path   = require('path');
const fs     = require('fs');

const APP_URL  = process.env.CLIENT_URL || 'https://talentops.i2speed.com';
const APP_NAME = process.env.APP_NAME   || 'TalentOps';

// ─── Helpers ──────────────────────────────────────────────────
const USER_SELECT = `
  u.id, u.tenant_id, u.name, u.email, u.role, u.manager_id,
  u.profile_pic, u.status, u.created_at, u.updated_at,
  m.name AS manager_name, m.role AS manager_role
`;
const USER_JOIN = `FROM users u LEFT JOIN users m ON m.id = u.manager_id AND m.tenant_id = u.tenant_id`;

const ROLE_LEVEL = { admin: 4, manager: 3, team_leader: 2, recruiter: 1 };

const MANAGEABLE_ROLES = {
  admin:       ['manager', 'team_leader', 'recruiter'],
  manager:     ['team_leader', 'recruiter'],
  team_leader: ['recruiter'],
  recruiter:   [],
};

const audit = (userId, tenantId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs
       (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (?, ?, 'user', ?, 'users', ?, ?, ?, ?)`,
    [tenantId, userId, action, targetId,
     oldVal ? JSON.stringify(oldVal) : null,
     newVal ? JSON.stringify(newVal) : null,
     ip || null]
  ).catch(() => {});

// ─── Scope WHERE — always includes tenant_id ──────────────────
const buildScopeWhere = (requester) => {
  const tid = requester.tenant_id;
  switch (requester.role) {
    case 'admin':
      return { where: 'WHERE u.tenant_id = ?', params: [tid] };
    case 'manager':
      return {
        where: `WHERE u.tenant_id = ? AND (
          u.manager_id = ? OR u.manager_id IN (
            SELECT id FROM users WHERE manager_id = ? AND role = 'team_leader' AND tenant_id = ?
          )
        )`,
        params: [tid, requester.id, requester.id, tid],
      };
    case 'team_leader':
      return { where: 'WHERE u.tenant_id = ? AND u.manager_id = ?', params: [tid, requester.id] };
    default:
      return { where: 'WHERE u.tenant_id = ? AND u.id = ?', params: [tid, requester.id] };
  }
};

// ─── Welcome email with login credentials ─────────────────────
const sendWelcomeCredentials = async ({ to, name, email, password, role, companyName, createdByName }) => {
  const { sendEmail } = require('../auth/email.service');
  const loginUrl  = `${APP_URL}/login`;
  const roleFmt   = role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#f1f5f9;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:560px;width:100%;">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#fff;">${APP_NAME}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">Optimize People. Maximize Performance.</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#1e293b;">Welcome to ${APP_NAME}! 👋</h2>
        <p style="margin:0 0 14px;font-size:15px;color:#475569;line-height:1.65;">Hi <strong>${name}</strong>,</p>
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.65;">
          Your account has been created by <strong>${createdByName}</strong> at <strong>${companyName}</strong>.
          You've been added as a <strong>${roleFmt}</strong>. Use the credentials below to log in.
        </p>

        <!-- Credentials box -->
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px 24px;margin:0 0 20px;">
          <div style="font-size:13px;font-weight:700;color:#065f46;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Your Login Credentials</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#64748b;width:35%;">Login URL</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;">
                <a href="${loginUrl}" style="color:#4f46e5;">${loginUrl}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#64748b;">Username / Email</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;color:#1e293b;">${email}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#64748b;">Password</td>
              <td style="padding:6px 0;font-size:14px;font-weight:700;color:#dc2626;font-family:monospace;letter-spacing:0.05em;">${password}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#64748b;">Your Role</td>
              <td style="padding:6px 0;font-size:14px;font-weight:600;color:#4f46e5;">${roleFmt}</td>
            </tr>
          </table>
        </div>

        <!-- Warning -->
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;margin:0 0 20px;font-size:13px;color:#9a3412;">
          🔒 <strong>Important:</strong> Please change your password after your first login. Go to <em>Account → Change Password</em>.
        </div>

        <!-- CTA -->
        <div style="text-align:center;margin:24px 0;">
          <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:14px 36px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">
            Login to ${APP_NAME}
          </a>
        </div>
        <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
          Need help? Contact your administrator or email <a href="mailto:support@i2speed.in" style="color:#4f46e5;">support@i2speed.in</a>
        </p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">© ${new Date().getFullYear()} ${APP_NAME}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return sendEmail({ to, subject: `Welcome to ${APP_NAME} — Your Account Details`, html });
};

// ============================================================
// GET ALL USERS
// ============================================================
const getAllUsers = async ({ requester, page = 1, limit = 20, search, role, status }) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const scope  = buildScopeWhere(requester);
  const filters = [];
  const params  = [...scope.params];

  if (search) { filters.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (role)   { filters.push('u.role = ?');   params.push(role);   }
  if (status) { filters.push('u.status = ?'); params.push(status); }

  const where = scope.where + (filters.length ? ' AND ' + filters.join(' AND ') : '');

  const [rows]  = await db.query(`SELECT ${USER_SELECT} ${USER_JOIN} ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
  const [count] = await db.query(`SELECT COUNT(*) AS total ${USER_JOIN} ${where}`, params);

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
  const [rows] = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`,
    [id, requester.tenant_id]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };
  return rows[0];
};

// ============================================================
// CREATE USER
// ============================================================
const createUser = async ({ requester, tenant, body, ip }) => {
  const { name, email, password, role, manager_id, status = 'active' } = body;
  const tenantId = requester.tenant_id;

  if (!name || !email || !password || !role) throw { status: 400, message: 'Name, email, password and role are required.' };
  if (password.length < 8) throw { status: 400, message: 'Password must be at least 8 characters.' };
  if (!MANAGEABLE_ROLES[requester.role]?.includes(role)) throw { status: 403, message: `You cannot create users with role: ${role}.` };

  // ── Plan user limit check ──────────────────────────────
  const maxUsers = tenant?.max_users ?? 10;
  if (maxUsers > 0) {
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE tenant_id = ? AND status = 'active'`,
      [tenantId]
    );
    const current = parseInt(countRows[0]?.cnt) || 0;
    if (current >= maxUsers) {
      throw {
        status:  403,
        message: `Your ${tenant?.plan_name || 'current'} plan allows a maximum of ${maxUsers} users. Please upgrade to add more.`,
        code:    'PLAN_USER_LIMIT',
      };
    }
  }

  // ── Email uniqueness within tenant ────────────────────
  const [exists] = await db.query(
    'SELECT id FROM users WHERE email = ? AND tenant_id = ? LIMIT 1',
    [email.trim().toLowerCase(), tenantId]
  );
  if (exists.length) throw { status: 409, message: 'A user with this email already exists in your organisation.' };

  // ── Validate manager belongs to same tenant ───────────
  if (manager_id) {
    const [mgr] = await db.query('SELECT id, role FROM users WHERE id = ? AND tenant_id = ? LIMIT 1', [manager_id, tenantId]);
    if (!mgr.length) throw { status: 400, message: 'Manager not found in your organisation.' };
  }

  const rawPassword = password; // keep plain for email
  const hashed = await bcrypt.hash(password, 10);

  const [result] = await db.query(
    `INSERT INTO users (tenant_id, name, email, password, role, manager_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, name.trim(), email.trim().toLowerCase(), hashed, role, manager_id || null, status]
  );
  const newId = result.insertId;

  await audit(requester.id, tenantId, 'CREATE_USER', newId, null, { name, email, role }, ip);

  // ── Welcome notification in-app ───────────────────────
  await db.query(
    `INSERT INTO notifications (tenant_id, user_id, title, message, type)
     VALUES (?, ?, 'Welcome to ${APP_NAME}!', ?, 'general')`,
    [tenantId, newId, `Hi ${name}, your account has been created. Welcome aboard!`]
  ).catch(() => {});

  // ── Send welcome email with credentials ───────────────
  // Only for non-admin roles (managers, team leaders, recruiters)
  if (['manager', 'team_leader', 'recruiter'].includes(role)) {
    sendWelcomeCredentials({
      to:            email.trim().toLowerCase(),
      name:          name.trim(),
      email:         email.trim().toLowerCase(),
      password:      rawPassword,
      role,
      companyName:   tenant?.name || 'your company',
      createdByName: requester.name || 'Admin',
    }).catch((err) => console.error('Welcome email failed:', err.message));
  }

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
  const [rows]   = await db.query(
    `SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`,
    [id, tenantId]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };
  const target = rows[0];

  if (requester.role !== 'admin' && ROLE_LEVEL[target.role] >= ROLE_LEVEL[requester.role]) {
    throw { status: 403, message: 'You cannot edit this user.' };
  }

  const { name, email, role, manager_id, status } = body;

  if (email && email.toLowerCase() !== target.email) {
    const [exists] = await db.query(
      'SELECT id FROM users WHERE email = ? AND tenant_id = ? AND id != ? LIMIT 1',
      [email.toLowerCase(), tenantId, id]
    );
    if (exists.length) throw { status: 409, message: 'Email already in use.' };
  }

  const fields = [], values = [];
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
  if (parseInt(id) === requester.id) throw { status: 400, message: 'You cannot delete your own account.' };

  const [rows] = await db.query('SELECT id, name, role FROM users WHERE id = ? AND tenant_id = ? LIMIT 1', [id, tenantId]);
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
// RESET USER PASSWORD
// ============================================================
const resetUserPassword = async ({ id, requester, newPassword, ip }) => {
  if (!newPassword || newPassword.length < 8) throw { status: 400, message: 'Password must be at least 8 characters.' };
  const tenantId = requester.tenant_id;
  const [rows]   = await db.query('SELECT id, role FROM users WHERE id = ? AND tenant_id = ? LIMIT 1', [id, tenantId]);
  if (!rows.length) throw { status: 404, message: 'User not found.' };
  if (requester.role !== 'admin' && ROLE_LEVEL[rows[0].role] >= ROLE_LEVEL[requester.role]) throw { status: 403, message: 'Permission denied.' };

  await db.query('UPDATE users SET password = ? WHERE id = ? AND tenant_id = ?', [await bcrypt.hash(newPassword, 10), id, tenantId]);
  await audit(requester.id, tenantId, 'RESET_USER_PASSWORD', id, null, { action: 'reset_by_admin' }, ip);
  return { message: 'Password reset successfully.' };
};

// ============================================================
// UPDATE PROFILE (self)
// ============================================================
const updateProfile = async ({ userId, tenantId, body, file, ip }) => {
  const [rows] = await db.query('SELECT id, name, profile_pic FROM users WHERE id = ? AND tenant_id = ? LIMIT 1', [userId, tenantId]);
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const current = rows[0];
  const fields  = [], values = [];

  if (body.name) { fields.push('name = ?'); values.push(body.name.trim()); }
  if (file) {
    if (current.profile_pic) {
      const old = path.join(__dirname, '../../uploads/profiles', current.profile_pic);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    fields.push('profile_pic = ?'); values.push(file.filename);
  }

  if (!fields.length) throw { status: 400, message: 'Nothing to update.' };
  values.push(userId, tenantId);
  await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);

  const [updated] = await db.query(`SELECT ${USER_SELECT} ${USER_JOIN} WHERE u.id = ? AND u.tenant_id = ? LIMIT 1`, [userId, tenantId]);
  return updated[0];
};

// ============================================================
// GET MANAGERS LIST
// ============================================================
const getManagers = async (requester) => {
  const tid = requester.tenant_id;
  let where = '', params = [tid];

  if (requester.role === 'admin') {
    where = `WHERE u.tenant_id = ? AND u.role IN ('admin','manager','team_leader') AND u.status = 'active'`;
  } else if (requester.role === 'manager') {
    where  = `WHERE u.tenant_id = ? AND u.role = 'team_leader' AND u.status = 'active' AND u.manager_id = ?`;
    params = [tid, requester.id];
  } else {
    return [];
  }

  const [rows] = await db.query(`SELECT u.id, u.name, u.role ${USER_JOIN} ${where} ORDER BY u.role, u.name`, params);
  return rows;
};

module.exports = {
  getAllUsers, getUserById, createUser,
  updateUser, deleteUser, resetUserPassword,
  updateProfile, getManagers, MANAGEABLE_ROLES,
};
