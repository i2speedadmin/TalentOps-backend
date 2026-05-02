// ============================================================
// src/modules/subscriptions/signup.routes.js
// All routes are PUBLIC (no auth required for signup flow)
// ============================================================
const express    = require('express');
const router     = express.Router();
const controller = require('./signup.controller');

// Step 1: Validate inputs + get price (no account created)
router.post('/validate',                    controller.validate);

// Step 2a: Create Razorpay order (no account created)
router.post('/payment/razorpay/order',      controller.razorpayOrder);

// Step 2b: Create Stripe session (no account created)
router.post('/payment/stripe/session',      controller.stripeSession);

// Step 3: Complete registration AFTER payment success
router.post('/complete',                    controller.complete);

// Free path: 100% promo discount - create trial account immediately
router.post('/register-free',               controller.registerFree);

module.exports = router;
