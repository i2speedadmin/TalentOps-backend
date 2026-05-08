// ============================================================
// src/modules/reports/report.routes.js
// Pro + Enterprise only — Starter gets 403 PLAN_FEATURE_RESTRICTED
// ============================================================

const express            = require('express');
const router             = express.Router();
const controller         = require('./report.controller');
const authenticate       = require('../../middleware/auth');
const { requireFeature } = require('../../middleware/plan');

router.use(authenticate);

// Search available to all plans
router.get('/search', controller.globalSearch);

// Analytics — Pro and Enterprise only
router.use(requireFeature('reports'));
router.get('/overview',    controller.getOverviewStats);
router.get('/trend',       controller.getTaskTrend);
router.get('/performance', controller.getTeamPerformance);
router.get('/priority',    controller.getPriorityBreakdown);

module.exports = router;
