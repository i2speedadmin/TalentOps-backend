// ============================================================
// src/modules/audit/audit.routes.js
// Enterprise only — Starter/Pro get 403 PLAN_FEATURE_RESTRICTED
// ============================================================

const express            = require('express');
const router             = express.Router();
const controller         = require('./audit.controller');
const authenticate       = require('../../middleware/auth');
const { allowMinRole }   = require('../../middleware/role');
const { requireFeature } = require('../../middleware/plan');

router.use(authenticate);
router.use(requireFeature('audit_logs'));  // Enterprise only
router.use(allowMinRole('manager'));        // Manager+ role

router.get('/',     controller.getAuditLogs);
router.get('/meta', controller.getAuditMeta);

module.exports = router;
