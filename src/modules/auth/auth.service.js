// ============================================================
// src/modules/auth/auth.service.js
// UPDATED getMe: returns tenant + plan info for PlanContext
// ============================================================

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../../config/db');
const { sendPasswordResetEmail } = require('./email.service');

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, email: user.email, tenant_id: user.tenant_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ─── Login ────────────────────────────────────────────────────
const login = async ({ email, password, ip, userAgent }) => {
  const [rows] = await db.query(
    `SELECT u.id, u.tenant_id, u.name, u.email, u.password, u.role,
            u.manager_id, u.profile_pic, u.status
     FROM users u WHERE u.email = ? LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  if (!rows.length) throw { status: 401, message: 'Invalid email or password.' };

  const user = rows[0];
  if (user.status !== 'active') throw { status: 403, message: 'Your account has been deactivated.' };

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw { status: 401, message: 'Invalid email or password.' };

  const token = generateToken(user);

  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, ?, 'user', 'LOGIN', 'users', ?, ?, ?, ?)`,
    [user.tenant_id, user.id, user.id, JSON.stringify({ action: 'login_success' }), ip || null, userAgent || null]
  ).catch(() => {});

  const { password: _pw, ...safeUser } = user;
  return { token, user: safeUser };
};

// ─── Get Me — includes tenant + plan info ─────────────────────
const getMe = async (userId) => {
  const [rows] = await db.query(
    `SELECT
       u.id, u.tenant_id, u.name, u.email, u.role, u.manager_id,
       u.profile_pic, u.status, u.created_at,
       m.name        AS manager_name,
       t.name        AS tenant_name,
       t.status      AS tenant_status,
       s.status      AS sub_status,
       s.plan_id,
       s.next_billing_at,
       p.slug        AS plan_slug,
       p.name        AS plan_name,
       p.max_users,
       p.max_tasks,
       p.features    AS plan_features
     FROM users u
     LEFT JOIN users m ON m.id = u.manager_id
     LEFT JOIN tenants t ON t.id = u.tenant_id
     LEFT JOIN subscriptions s
       ON s.tenant_id = u.tenant_id
       AND s.status IN ('active','trialing','past_due')
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE u.id = ?
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const row = rows[0];
  let planFeatures = [];
  try {
    planFeatures = typeof row.plan_features === 'string'
      ? JSON.parse(row.plan_features)
      : (row.plan_features || []);
  } catch { planFeatures = []; }

  return {
    id:          row.id,
    tenant_id:   row.tenant_id,
    name:        row.name,
    email:       row.email,
    role:        row.role,
    manager_id:  row.manager_id,
    profile_pic: row.profile_pic,
    status:      row.status,
    created_at:  row.created_at,
    manager_name: row.manager_name,
    // Tenant info
    tenant_name:   row.tenant_name,
    tenant_status: row.tenant_status,
    // Plan info (used by PlanContext in frontend)
    plan_id:       row.plan_id     || null,
    plan_slug:     row.plan_slug   || 'starter',
    plan_name:     row.plan_name   || 'Starter',
    plan_features: planFeatures,
    max_users:     row.max_users   || 10,
    max_tasks:     row.max_tasks   || 500,
    sub_status:    row.sub_status  || null,
    next_billing_at: row.next_billing_at || null,
  };
};

// ─── Change Password ──────────────────────────────────────────
const changePassword = async ({ userId, currentPassword, newPassword }) => {
  const [rows] = await db.query('SELECT id, password FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
  if (!isMatch) throw { status: 400, message: 'Current password is incorrect.' };
  if (newPassword.length < 8) throw { status: 400, message: 'New password must be at least 8 characters.' };

  await db.query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(newPassword, 10), userId]);
  return { message: 'Password changed successfully.' };
};

// ─── Forgot Password ──────────────────────────────────────────
const forgotPassword = async ({ email, ip, userAgent }) => {
  if (!email) throw { status: 400, message: 'Email is required.' };

  const [rows] = await db.query(
    `SELECT id, tenant_id, name, email, status FROM users WHERE email = ? AND status = 'active' LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  if (!rows.length) return { message: 'If that email is registered, a reset link has been sent.' };

  const user     = rows[0];
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashed   = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiry   = new Date(Date.now() + 3600000);

  await db.query(
    'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
    [hashed, expiry.toISOString().slice(0, 19).replace('T', ' '), user.id]
  );

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
  } catch (mailErr) {
    console.error('Password reset email failed:', mailErr.message);
  }

  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, ?, 'user', 'FORGOT_PASSWORD', 'users', ?, ?, ?, ?)`,
    [user.tenant_id, user.id, user.id, JSON.stringify({ action: 'reset_token_generated' }), ip || null, userAgent || null]
  ).catch(() => {});

  return { message: 'If that email is registered, a reset link has been sent.' };
};

// ─── Reset Password ───────────────────────────────────────────
const resetPassword = async ({ token, newPassword, ip, userAgent }) => {
  if (!token || !newPassword) throw { status: 400, message: 'Token and new password are required.' };
  if (newPassword.length < 8)  throw { status: 400, message: 'Password must be at least 8 characters.' };

  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const [rows] = await db.query(
    `SELECT id, tenant_id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW() AND status = 'active' LIMIT 1`,
    [hashed]
  );
  if (!rows.length) throw { status: 400, message: 'Reset token is invalid or has expired.' };

  const { id: userId, tenant_id } = rows[0];
  await db.query(
    'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
    [await bcrypt.hash(newPassword, 10), userId]
  );

  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, ?, 'user', 'RESET_PASSWORD', 'users', ?, ?, ?, ?)`,
    [tenant_id, userId, userId, JSON.stringify({ action: 'password_reset_success' }), ip || null, userAgent || null]
  ).catch(() => {});

  return { message: 'Password reset successfully. You can now log in.' };
};

module.exports = { login, getMe, changePassword, forgotPassword, resetPassword };
