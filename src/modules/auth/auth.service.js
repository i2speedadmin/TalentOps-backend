// ============================================================
// src/modules/auth/auth.service.js — Auth Business Logic
// ============================================================

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../../config/db');
const { sendPasswordResetEmail } = require('./email.service');

// ─── Generate JWT ─────────────────────────────────────────────
const generateToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, email: user.email, tenant_id: user.tenant_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ─── LOGIN ────────────────────────────────────────────────────
const login = async ({ email, password, ip, userAgent }) => {
  const [rows] = await db.query(
    `SELECT id, tenant_id, name, email, password, role, manager_id, profile_pic, status
     FROM users WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  if (!rows.length) throw { status: 401, message: 'Invalid email or password.' };

  const user = rows[0];
  if (user.status !== 'active') throw { status: 403, message: 'Your account has been deactivated. Contact admin.' };

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw { status: 401, message: 'Invalid email or password.' };

  const token = generateToken(user);
  const { password: _pw, ...safeUser } = user;

  // Audit
  await db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, ?, 'user', 'LOGIN', 'users', ?, ?, ?, ?)`,
    [user.tenant_id, user.id, user.id, JSON.stringify({ action: 'login_success' }), ip || null, userAgent || null]
  ).catch(() => {});

  return { token, user: safeUser };
};

// ─── GET ME ───────────────────────────────────────────────────
const getMe = async (userId) => {
  const [rows] = await db.query(
    `SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.manager_id,
            u.profile_pic, u.status, u.created_at,
            m.name AS manager_name
     FROM users u
     LEFT JOIN users m ON m.id = u.manager_id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );
  if (!rows.length) throw { status: 404, message: 'User not found.' };
  return rows[0];
};

// ─── CHANGE PASSWORD ──────────────────────────────────────────
const changePassword = async ({ userId, currentPassword, newPassword, ip }) => {
  const [rows] = await db.query('SELECT id, password FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
  if (!isMatch) throw { status: 400, message: 'Current password is incorrect.' };
  if (newPassword.length < 8) throw { status: 400, message: 'New password must be at least 8 characters.' };

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
  return { message: 'Password changed successfully.' };
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────
const forgotPassword = async ({ email, ip, userAgent }) => {
  if (!email) throw { status: 400, message: 'Email is required.' };

  const [rows] = await db.query(
    `SELECT id, tenant_id, name, email, status FROM users WHERE email = ? AND status = 'active' LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  // Always return success (don't reveal if email exists)
  if (!rows.length) return { message: 'If that email is registered, a reset link has been sent.' };

  const user     = rows[0];
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashed   = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiry   = new Date(Date.now() + 3600000); // 1 hour

  await db.query(
    'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
    [hashed, expiry.toISOString().slice(0, 19).replace('T', ' '), user.id]
  );

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
  } catch (mailErr) {
    console.error('Mail send error:', mailErr.message);
  }

  await db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, ?, 'user', 'FORGOT_PASSWORD', 'users', ?, ?, ?, ?)`,
    [user.tenant_id, user.id, user.id, JSON.stringify({ action: 'reset_token_generated' }), ip || null, userAgent || null]
  ).catch(() => {});

  return { message: 'If that email is registered, a reset link has been sent.' };
};

// ─── RESET PASSWORD ───────────────────────────────────────────
const resetPassword = async ({ token, newPassword, ip, userAgent }) => {
  if (!token || !newPassword) throw { status: 400, message: 'Token and new password are required.' };
  if (newPassword.length < 8) throw { status: 400, message: 'Password must be at least 8 characters.' };

  const hashed = crypto.createHash('sha256').update(token).digest('hex');

  const [rows] = await db.query(
    `SELECT id, tenant_id FROM users
     WHERE reset_token = ? AND reset_token_expiry > NOW() AND status = 'active' LIMIT 1`,
    [hashed]
  );
  if (!rows.length) throw { status: 400, message: 'Reset token is invalid or has expired.' };

  const { id: userId, tenant_id } = rows[0];
  const newHashed = await bcrypt.hash(newPassword, 10);

  await db.query(
    'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
    [newHashed, userId]
  );

  await db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, ?, 'user', 'RESET_PASSWORD', 'users', ?, ?, ?, ?)`,
    [tenant_id, userId, userId, JSON.stringify({ action: 'password_reset_success' }), ip || null, userAgent || null]
  ).catch(() => {});

  return { message: 'Password reset successfully. You can now log in.' };
};

// ─── RESEND FORGOT PASSWORD ───────────────────────────────────
const resendForgotPassword = async ({ email, ip, userAgent }) =>
  forgotPassword({ email, ip, userAgent });

module.exports = { login, getMe, changePassword, forgotPassword, resetPassword, resendForgotPassword };
