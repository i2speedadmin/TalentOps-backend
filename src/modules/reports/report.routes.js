// ============================================================
// src/modules/reports/report.routes.js
// ============================================================

const express      = require('express');
const router       = express.Router();
const controller   = require('./report.controller');
const authenticate = require('../../middleware/auth');

router.use(authenticate);

// Search available to all roles
router.get('/search',      controller.globalSearch);

// Analytics available to team_leader+
router.get('/overview',    controller.getOverviewStats);
router.get('/trend',       controller.getTaskTrend);
router.get('/performance', controller.getTeamPerformance);
router.get('/priority',    controller.getPriorityBreakdown);

module.exports = router;
