// ============================================================
// src/modules/superadmin/superadmin.routes.js
// ============================================================

const express        = require('express');
const router         = express.Router();
const controller     = require('./superadmin.controller');
const superAdminAuth = require('../../middleware/superAdminAuth');

// Public
router.post('/login', controller.login);

// Protected
router.get('/me',              superAdminAuth, controller.getMe);
router.put('/change-password', superAdminAuth, controller.changePassword);
router.get('/dashboard',       superAdminAuth, controller.getDashboardStats);

module.exports = router;
