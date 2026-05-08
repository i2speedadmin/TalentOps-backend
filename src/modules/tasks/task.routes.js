// ============================================================
// src/modules/tasks/task.routes.js
// ============================================================

const express      = require('express');
const router       = express.Router();
const controller   = require('./task.controller');
const authenticate = require('../../middleware/auth');
const { allowMinRole } = require('../../middleware/role');

router.use(authenticate);

// Utility endpoints — must be before /:id
router.get('/stats',      controller.getTaskStats);
router.get('/assignable', allowMinRole('team_leader'), controller.getAssignableUsers);

// CRUD
router.get('/',    controller.getAllTasks);
router.post('/',   allowMinRole('team_leader'), controller.createTask);
router.get('/:id', controller.getTaskById);
router.put('/:id', controller.updateTask);
router.delete('/:id', allowMinRole('team_leader'), controller.deleteTask);

// Workflow actions
router.post('/:id/submit',  controller.submitTask);
router.post('/:id/approve', allowMinRole('team_leader'), controller.approveTask);
router.post('/:id/reject',  allowMinRole('team_leader'), controller.rejectTask);

module.exports = router;
