// ============================================================
// src/modules/subscriptions/signup.controller.js
// ============================================================
const service    = require('./signup.service');
const authenticate = require('../../middleware/auth');

const register = async (req, res) => {
  try {
    const { companyName, adminName, email, password, phone, industry, size, planId, billingCycle, currency, promoCode } = req.body;
    if (!companyName || !adminName || !email || !password || !planId) {
      return res.status(400).json({ success: false, message: 'Company name, admin name, email, password and plan are required.' });
    }
    if (password.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    const result = await service.registerCompany({ companyName, adminName, email, password, phone, industry, size, planId, billingCycle, currency, promoCode, ip: req.ip });
    res.status(201).json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const initiateRazorpay = async (req, res) => {
  try {
    const { subscriptionId, amount, currency, description } = req.body;
    const result = await service.initiateRazorpayPayment({ tenantId: req.user.tenant_id, subscriptionId, amount, currency, description });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const verifyRazorpay = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    const result = await service.verifyRazorpayPayment({ orderId, paymentId, signature, tenantId: req.user.tenant_id });
    res.json(result);
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const initiateStripe = async (req, res) => {
  try {
    const { subscriptionId, planId, billingCycle, amount, currency, successUrl, cancelUrl } = req.body;
    const result = await service.initiateStripePayment({ tenantId: req.user.tenant_id, subscriptionId, planId, billingCycle, amount, currency, successUrl, cancelUrl });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const verifyStripe = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const result = await service.verifyStripePayment({ sessionId, tenantId: req.user.tenant_id });
    res.json(result);
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

module.exports = { register, initiateRazorpay, verifyRazorpay, initiateStripe, verifyStripe };
