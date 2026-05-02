// ============================================================
// src/modules/subscriptions/signup.controller.js
// FIXED FLOW:
//   /validate            → check inputs, return price (no DB)
//   /payment/razorpay/order  → create Razorpay order (no DB)
//   /payment/stripe/session  → create Stripe session (no DB)
//   /complete            → verify payment, THEN create account
//   /register-free       → 100% promo discount, create on trial
// ============================================================
const service = require('./signup.service');

// ── POST /api/signup/validate ─────────────────────────────────
// Validates inputs and returns pricing. No account created.
const validate = async (req, res) => {
  try {
    const { email, planId, billingCycle, currency, promoCode } = req.body;
    if (!email || !planId) {
      return res.status(400).json({ success: false, message: 'Email and plan are required.' });
    }
    const result = await service.validateSignup({ email, planId, billingCycle, currency, promoCode });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ── POST /api/signup/payment/razorpay/order ───────────────────
// Creates a Razorpay order. No account created yet.
const razorpayOrder = async (req, res) => {
  try {
    const { planId, billingCycle, currency, finalAmount, email, description } = req.body;
    if (!planId || !finalAmount) {
      return res.status(400).json({ success: false, message: 'Plan and amount are required.' });
    }
    const result = await service.createRazorpayOrder({ planId, billingCycle, currency, finalAmount, email, description });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ── POST /api/signup/payment/stripe/session ───────────────────
// Creates a Stripe checkout session. No account created yet.
const stripeSession = async (req, res) => {
  try {
    const { planId, billingCycle, finalAmount, currency, successUrl, cancelUrl } = req.body;
    if (!planId || !finalAmount) {
      return res.status(400).json({ success: false, message: 'Plan and amount are required.' });
    }
    const result = await service.createStripeSession({ planId, billingCycle, finalAmount, currency, successUrl, cancelUrl });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ── POST /api/signup/complete ────────────────────────────────
// Called after payment succeeds. Verifies payment, THEN creates account.
const complete = async (req, res) => {
  try {
    const {
      companyName, adminName, email, password, phone, industry, size,
      planId, billingCycle, currency, promoCode,
      gateway, gatewayOrderId, gatewayPaymentId, gatewaySignature,
      stripeSessionId,
    } = req.body;

    if (!companyName || !adminName || !email || !password || !planId || !gateway) {
      return res.status(400).json({ success: false, message: 'All fields and payment info are required.' });
    }

    const result = await service.completeRegistration({
      companyName, adminName, email, password, phone, industry, size,
      planId, billingCycle, currency, promoCode,
      gateway, gatewayOrderId, gatewayPaymentId, gatewaySignature,
      stripeSessionId,
      ip: req.ip,
    });

    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ── POST /api/signup/register-free ───────────────────────────
// For 100% promo discount only. Creates account on trial.
const registerFree = async (req, res) => {
  try {
    const {
      companyName, adminName, email, password, phone, industry, size,
      planId, billingCycle, currency, promoCode,
    } = req.body;

    if (!companyName || !adminName || !email || !password || !planId) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const result = await service.registerFree({
      companyName, adminName, email, password, phone, industry, size,
      planId, billingCycle, currency, promoCode, ip: req.ip,
    });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = { validate, razorpayOrder, stripeSession, complete, registerFree };
