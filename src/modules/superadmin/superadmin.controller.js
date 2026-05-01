// ============================================================
// src/modules/superadmin/superadmin.controller.js
// ============================================================

const service = require('./superadmin.service');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });
    const result = await service.login({ email, password, ip: req.ip });
    res.json({ success: true, message: 'Login successful.', ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const getMe = async (req, res) => {
  try {
    const admin = await service.getMe(req.superAdmin.id);
    res.json({ success: true, admin });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await service.changePassword({ adminId: req.superAdmin.id, currentPassword, newPassword, ip: req.ip });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const getDashboardStats = async (req, res) => {
  try {
    const stats = await service.getDashboardStats();
    res.json({ success: true, ...stats });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { login, getMe, changePassword, getDashboardStats };
