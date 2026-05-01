// ============================================================
// src/modules/plans/plan.routes.js
// ============================================================

const express        = require('express');
const router         = express.Router();
const controller     = require('./plan.controller');
const superAdminAuth = require('../../middleware/superAdminAuth');

// Public — anyone can view active plans (for pricing page)
router.get('/',        controller.getPlans);
router.get('/stats',   superAdminAuth, controller.getPlanStats);
router.get('/:id',     controller.getPlanById);

// Super Admin only
router.post('/',       superAdminAuth, controller.createPlan);
router.put('/:id',     superAdminAuth, controller.updatePlan);
router.delete('/:id',  superAdminAuth, controller.deletePlan);

module.exports = router;
