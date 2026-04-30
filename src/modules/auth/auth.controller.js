// ============================================================
// src/modules/auth/auth.controller.js - Auth Controller
// ============================================================

const authService = require('./auth.service');

// ─── POST /api/auth/login ─────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const result = await authService.login({
      email,
      password,
      ip:        req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({ success: true, message: 'Login successful.', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Server error.' });
  }
};

// ─── GET /api/auth/me ─────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await authService.getMe(req.user.id);
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Server error.' });
  }
};

// ─── POST /api/auth/logout ────────────────────────────────────
const logout = async (req, res) => {
  try {
    // JWT is stateless — client deletes the token
    // We just log the event
    await require('../../config/db').query(
      `INSERT INTO audit_logs (user_id, action, target_table, target_id, new_value, ip_address, user_agent)
       VALUES (?, 'LOGOUT', 'users', ?, ?, ?, ?)`,
      [
        req.user.id,
        req.user.id,
        JSON.stringify({ action: 'logout' }),
        req.ip,
        req.headers['user-agent'],
      ]
    );

    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── PUT /api/auth/change-password ───────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const result = await authService.changePassword({
      userId:          req.user.id,
      currentPassword,
      newPassword,
      ip:              req.ip,
      userAgent:       req.headers['user-agent'],
    });

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Server error.' });
  }
};

// ─── POST /api/auth/forgot-password ──────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const result = await authService.forgotPassword({
      email,
      ip:        req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Server error.' });
  }
};

// ─── POST /api/auth/reset-password ───────────────────────────
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const result = await authService.resetPassword({
      token,
      newPassword,
      ip:        req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Server error.' });
  }
};

module.exports = { login, getMe, logout, changePassword, forgotPassword, resetPassword };
