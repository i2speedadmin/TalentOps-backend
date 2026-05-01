// ============================================================
// src/modules/platformSettings/settings.routes.js
// ============================================================
const express        = require('express');
const router         = express.Router();
const controller     = require('./settings.controller');
const superAdminAuth = require('../../middleware/superAdminAuth');

// Public — gateway status for checkout pages
router.get('/gateways', controller.getGateways);

// Super Admin only
router.get('/',   superAdminAuth, controller.getSettings);
router.put('/',   superAdminAuth, controller.updateSettings);

module.exports = router;
