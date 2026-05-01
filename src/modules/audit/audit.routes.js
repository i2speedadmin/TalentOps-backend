// ============================================================
// src/modules/audit/audit.routes.js
// ============================================================

const express      = require('express');
const router       = express.Router();
const controller   = require('./audit.controller');
const authenticate = require('../../middleware/auth');
const { allowMinRole } = require('../../middleware/role');

router.use(authenticate);
router.use(allowMinRole('manager'));

router.get('/',     controller.getAuditLogs);
router.get('/meta', controller.getAuditMeta);

module.exports = router;
