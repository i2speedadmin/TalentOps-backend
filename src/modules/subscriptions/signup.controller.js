// ============================================================
// src/modules/subscriptions/signup.controller.js
// FIXED: use token from registration, cleanup on failure
// ============================================================
const service    = require('./signup.service');
const authenticate = require('../../middleware/auth');

const register = async (req, res) => {
  try {
    const { companyName, adminName, email, password, phone, industry, size, planId, billingCycle, currency, promoCode } = req.body;
    if (!companyName || !adminName || !email || !password || !planId)
      return res.status(400).json({ success: false, message: 'Company name, admin name, email, password and plan are required.' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });

    const result = await service.registerCompany({ companyName, adminName, email, password, phone, industry, size, planId, billingCycle, currency, promoCode, ip: req.ip });
    res.status(201).json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

// Payment routes use tenant_id from body (token from registration response)
// The authenticate middleware reads token from Authorization header
const initiateRazorpay = async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.body.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: 'Tenant context missing.' });
    const { subscriptionId, amount, currency, description } = req.body;
    const result = await service.initiateRazorpayPayment({ tenantId, subscriptionId, amount, currency, description });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const verifyRazorpay = async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.body.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: 'Tenant context missing.' });
    const { orderId, paymentId, signature } = req.body;
    const result = await service.verifyRazorpayPayment({ orderId, paymentId, signature, tenantId });
    res.json(result);
  } catch (err) {
    // On payment failure: cleanup tenant so they cannot use the app
    const tenantId = req.user?.tenant_id || req.body.tenantId;
    if (tenantId && req.body.cleanup === true) {
      await service.cleanupRegistration(tenantId).catch(() => {});
    }
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const initiateStripe = async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.body.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: 'Tenant context missing.' });
    const { subscriptionId, planId, billingCycle, amount, currency, successUrl, cancelUrl } = req.body;
    const result = await service.initiateStripePayment({ tenantId, subscriptionId, planId, billingCycle, amount, currency, successUrl, cancelUrl });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const verifyStripe = async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || req.body.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: 'Tenant context missing.' });
    const { sessionId } = req.body;
    const result = await service.verifyStripePayment({ sessionId, tenantId });
    res.json(result);
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

module.exports = { register, initiateRazorpay, verifyRazorpay, initiateStripe, verifyStripe };
