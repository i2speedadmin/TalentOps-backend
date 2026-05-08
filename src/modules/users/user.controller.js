// ============================================================
// src/modules/users/user.controller.js
// FIXED: passes req.tenant to createUser for plan limit check
// ============================================================
const userService = require('./user.service');

const getAllUsers = async (req, res) => {
  try {
    const { page, limit, search, role, status } = req.query;
    const result = await userService.getAllUsers({ requester: req.user, page, limit, search, role, status });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const getUserById = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id, req.user);
    res.json({ success: true, user });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const createUser = async (req, res) => {
  try {
    const user = await userService.createUser({
      requester: req.user,
      tenant:    req.tenant,   // passes plan/max_users info
      body:      req.body,
      ip:        req.ip,
    });
    res.status(201).json({ success: true, message: 'User created successfully.', user });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser({ id: req.params.id, requester: req.user, body: req.body, ip: req.ip });
    res.json({ success: true, message: 'User updated successfully.', user });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const deleteUser = async (req, res) => {
  try {
    const result = await userService.deleteUser({ id: req.params.id, requester: req.user, ip: req.ip });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const resetUserPassword = async (req, res) => {
  try {
    const result = await userService.resetUserPassword({ id: req.params.id, requester: req.user, newPassword: req.body.newPassword, ip: req.ip });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const updateProfile = async (req, res) => {
  try {
    const user = await userService.updateProfile({ userId: req.user.id, tenantId: req.user.tenant_id, body: req.body, file: req.file, ip: req.ip });
    res.json({ success: true, message: 'Profile updated successfully.', user });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const getManagers = async (req, res) => {
  try {
    const managers = await userService.getManagers(req.user);
    res.json({ success: true, managers });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, resetUserPassword, updateProfile, getManagers };
