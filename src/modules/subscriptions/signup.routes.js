// ============================================================
// src/modules/subscriptions/signup.routes.js
// ============================================================
const express      = require('express');
const router       = express.Router();
const controller   = require('./signup.controller');
const authenticate = require('../../middleware/auth');

// Public — company signup (no auth required)
router.post('/register', controller.register);

// Authenticated — payment initiation (user must be logged in)
router.post('/payment/razorpay/initiate', authenticate, controller.initiateRazorpay);
router.post('/payment/razorpay/verify',   authenticate, controller.verifyRazorpay);
router.post('/payment/stripe/initiate',   authenticate, controller.initiateStripe);
router.post('/payment/stripe/verify',     authenticate, controller.verifyStripe);

module.exports = router;
