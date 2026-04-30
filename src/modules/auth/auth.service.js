// ============================================================
// src/modules/auth/auth.service.js - Auth Business Logic
// ============================================================

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const nodemailer = require('nodemailer');
const db       = require('../../config/db');

// ─── Generate JWT ────────────────────────────────────────────
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ─── Mail transporter ────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host:   process.env.MAIL_HOST,
    port:   parseInt(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
};

// ─── Login ───────────────────────────────────────────────────
const login = async ({ email, password, ip, userAgent }) => {
  // 1. Find user
  const [rows] = await db.query(
    `SELECT id, name, email, password, role, manager_id, profile_pic, status
     FROM users WHERE email = ? LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  if (!rows.length) {
    throw { status: 401, message: 'Invalid email or password.' };
  }

  const user = rows[0];

  // 2. Check status
  if (user.status !== 'active') {
    throw { status: 403, message: 'Your account has been deactivated. Contact admin.' };
  }

  // 3. Verify password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw { status: 401, message: 'Invalid email or password.' };
  }

  // 4. Generate token
  const token = generateToken(user);

  // 5. Audit log
  await db.query(
    `INSERT INTO audit_logs (user_id, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, 'LOGIN', 'users', ?, ?, ?, ?)`,
    [user.id, user.id, JSON.stringify({ action: 'login_success' }), ip, userAgent]
  );

  // Remove password from response
  const { password: _pw, ...safeUser } = user;

  return { token, user: safeUser };
};

// ─── Get Me ──────────────────────────────────────────────────
const getMe = async (userId) => {
  const [rows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.manager_id, u.profile_pic, u.status, u.created_at,
            m.name AS manager_name
     FROM users u
     LEFT JOIN users m ON m.id = u.manager_id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );

  if (!rows.length) throw { status: 404, message: 'User not found.' };

  return rows[0];
};

// ─── Change Password ─────────────────────────────────────────
const changePassword = async ({ userId, currentPassword, newPassword, ip, userAgent }) => {
  const [rows] = await db.query(
    'SELECT id, password FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  if (!rows.length) throw { status: 404, message: 'User not found.' };

  const user = rows[0];
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw { status: 400, message: 'Current password is incorrect.' };

  if (newPassword.length < 8) {
    throw { status: 400, message: 'New password must be at least 8 characters.' };
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);

  // Audit log
  await db.query(
    `INSERT INTO audit_logs (user_id, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, 'CHANGE_PASSWORD', 'users', ?, ?, ?, ?)`,
    [userId, userId, JSON.stringify({ action: 'password_changed' }), ip, userAgent]
  );

  return { message: 'Password changed successfully.' };
};

// ─── Forgot Password ─────────────────────────────────────────
const forgotPassword = async ({ email, ip, userAgent }) => {
  const [rows] = await db.query(
    'SELECT id, name, email FROM users WHERE email = ? AND status = ? LIMIT 1',
    [email.trim().toLowerCase(), 'active']
  );

  // Always return success (security: don't reveal if email exists)
  if (!rows.length) {
    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  const user = rows[0];

  // Generate reset token
  const rawToken    = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiry      = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query(
    'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
    [hashedToken, expiry, user.id]
  );

  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

  // Send email
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from:    process.env.MAIL_FROM,
      to:      user.email,
      subject: 'Password Reset Request — Task Management System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Password Reset Request</h2>
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to proceed:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
               style="background: #4f46e5; color: white; padding: 12px 28px;
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p>This link expires in <strong>1 hour</strong>.</p>
          <p>If you did not request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #888; font-size: 12px;">Task Management System</p>
        </div>
      `,
    });
  } catch (mailErr) {
    console.error('Mail send error:', mailErr.message);
    // Don't throw — still return success
  }

  // Audit log
  await db.query(
    `INSERT INTO audit_logs (user_id, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, 'FORGOT_PASSWORD', 'users', ?, ?, ?, ?)`,
    [user.id, user.id, JSON.stringify({ action: 'reset_token_generated' }), ip, userAgent]
  );

  return { message: 'If that email is registered, a reset link has been sent.' };
};

// ─── Reset Password ──────────────────────────────────────────
const resetPassword = async ({ token, newPassword, ip, userAgent }) => {
  if (!token || !newPassword) {
    throw { status: 400, message: 'Token and new password are required.' };
  }

  if (newPassword.length < 8) {
    throw { status: 400, message: 'Password must be at least 8 characters.' };
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const [rows] = await db.query(
    `SELECT id FROM users
     WHERE reset_token = ? AND reset_token_expiry > NOW() AND status = 'active'
     LIMIT 1`,
    [hashedToken]
  );

  if (!rows.length) {
    throw { status: 400, message: 'Reset token is invalid or has expired.' };
  }

  const userId  = rows[0].id;
  const hashed  = await bcrypt.hash(newPassword, 10);

  await db.query(
    'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
    [hashed, userId]
  );

  // Audit log
  await db.query(
    `INSERT INTO audit_logs (user_id, action, target_table, target_id, new_value, ip_address, user_agent)
     VALUES (?, 'RESET_PASSWORD', 'users', ?, ?, ?, ?)`,
    [userId, userId, JSON.stringify({ action: 'password_reset_success' }), ip, userAgent]
  );

  return { message: 'Password reset successfully. You can now login.' };
};

module.exports = { login, getMe, changePassword, forgotPassword, resetPassword };
