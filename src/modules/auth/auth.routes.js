// ============================================================
// src/modules/auth/auth.routes.js - Auth Routes
// ============================================================

const express    = require('express');
const router     = express.Router();
const controller = require('./auth.controller');
const authenticate = require('../../middleware/auth');

// Public routes
router.post('/login',           controller.login);
router.post('/forgot-password',        controller.forgotPassword);
router.post('/resend-forgot-password', controller.resendForgotPassword);
router.post('/reset-password',  controller.resetPassword);

// Protected routes (require valid JWT)
router.get('/me',               authenticate, controller.getMe);
router.post('/logout',          authenticate, controller.logout);
router.put('/change-password',  authenticate, controller.changePassword);

module.exports = router;
