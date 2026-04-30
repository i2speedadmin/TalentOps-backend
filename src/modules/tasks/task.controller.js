// ============================================================
// src/modules/tasks/task.controller.js
// ============================================================

const taskService = require('./task.service');

// GET /api/tasks
const getAllTasks = async (req, res) => {
  try {
    const { page, limit, search, status, priority, assignedTo, sortBy, sortDir } = req.query;
    const result = await taskService.getAllTasks({
      requester: req.user,
      page, limit, search, status, priority, assignedTo, sortBy, sortDir,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/tasks/stats
const getTaskStats = async (req, res) => {
  try {
    const stats = await taskService.getTaskStats(req.user);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/tasks/assignable
const getAssignableUsers = async (req, res) => {
  try {
    const users = await taskService.getAssignableUsers(req.user);
    res.json({ success: true, users });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/tasks/:id
const getTaskById = async (req, res) => {
  try {
    const task = await taskService.getTaskById(req.params.id, req.user);
    res.json({ success: true, task });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// POST /api/tasks
const createTask = async (req, res) => {
  try {
    const task = await taskService.createTask({
      requester: req.user,
      body:      req.body,
      ip:        req.ip,
    });
    res.status(201).json({ success: true, message: 'Task created successfully.', task });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// PUT /api/tasks/:id
const updateTask = async (req, res) => {
  try {
    const task = await taskService.updateTask({
      id:        req.params.id,
      requester: req.user,
      body:      req.body,
      ip:        req.ip,
    });
    res.json({ success: true, message: 'Task updated successfully.', task });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// POST /api/tasks/:id/submit
const submitTask = async (req, res) => {
  try {
    const task = await taskService.submitTask({
      id:        req.params.id,
      requester: req.user,
      ip:        req.ip,
    });
    res.json({ success: true, message: 'Task submitted for review.', task });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// POST /api/tasks/:id/approve
const approveTask = async (req, res) => {
  try {
    const task = await taskService.approveTask({
      id:        req.params.id,
      requester: req.user,
      ip:        req.ip,
    });
    res.json({ success: true, message: 'Task approved.', task });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// POST /api/tasks/:id/reject
const rejectTask = async (req, res) => {
  try {
    const { reason } = req.body;
    const task = await taskService.rejectTask({
      id:        req.params.id,
      requester: req.user,
      reason,
      ip:        req.ip,
    });
    res.json({ success: true, message: 'Task rejected.', task });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// DELETE /api/tasks/:id
const deleteTask = async (req, res) => {
  try {
    const result = await taskService.deleteTask({
      id:        req.params.id,
      requester: req.user,
      ip:        req.ip,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllTasks, getTaskStats, getAssignableUsers,
  getTaskById, createTask, updateTask,
  submitTask, approveTask, rejectTask, deleteTask,
};
