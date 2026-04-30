// ============================================================
// src/modules/users/user.controller.js
// ============================================================

const userService = require('./user.service');

// GET /api/users
const getAllUsers = async (req, res) => {
  try {
    const { page, limit, search, role, status } = req.query;
    const result = await userService.getAllUsers({
      requester: req.user,
      page, limit, search, role, status,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/users/:id
const getUserById = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id, req.user);
    res.json({ success: true, user });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// POST /api/users
const createUser = async (req, res) => {
  try {
    const user = await userService.createUser({
      requester: req.user,
      body:      req.body,
      ip:        req.ip,
    });
    res.status(201).json({ success: true, message: 'User created successfully.', user });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// PUT /api/users/:id
const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser({
      id:        req.params.id,
      requester: req.user,
      body:      req.body,
      ip:        req.ip,
    });
    res.json({ success: true, message: 'User updated successfully.', user });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// DELETE /api/users/:id
const deleteUser = async (req, res) => {
  try {
    const result = await userService.deleteUser({
      id:        req.params.id,
      requester: req.user,
      ip:        req.ip,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// PUT /api/users/:id/reset-password
const resetUserPassword = async (req, res) => {
  try {
    const result = await userService.resetUserPassword({
      id:          req.params.id,
      requester:   req.user,
      newPassword: req.body.newPassword,
      ip:          req.ip,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// PUT /api/users/profile/me
const updateProfile = async (req, res) => {
  try {
    const user = await userService.updateProfile({
      userId: req.user.id,
      body:   req.body,
      file:   req.file,
      ip:     req.ip,
    });
    res.json({ success: true, message: 'Profile updated successfully.', user });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/users/managers/list
const getManagers = async (req, res) => {
  try {
    const managers = await userService.getManagers(req.user);
    res.json({ success: true, managers });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllUsers, getUserById, createUser,
  updateUser, deleteUser, resetUserPassword,
  updateProfile, getManagers,
};
