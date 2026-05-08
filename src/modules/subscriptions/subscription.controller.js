// ============================================================
// src/modules/subscriptions/subscription.controller.js
// ============================================================
const service = require('./subscription.service');

// GET /api/subscription/me
const getMySubscription = async (req, res) => {
  try {
    const data = await service.getMySubscription(req.user.tenant_id);
    if (!data) return res.status(404).json({ success: false, message: 'No subscription found.' });
    res.json({ success: true, ...data });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

// POST /api/subscription/preview-change
const previewChange = async (req, res) => {
  try {
    const { newPlanId, billingCycle, currency } = req.body;
    if (!newPlanId) return res.status(400).json({ success: false, message: 'newPlanId is required.' });
    const preview = await service.previewPlanChange({
      tenantId: req.user.tenant_id, newPlanId,
      newBillingCycle: billingCycle, currency,
    });
    res.json({ success: true, ...preview });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

// POST /api/subscription/initiate-change
// Creates payment order — does NOT change plan yet
const initiateChange = async (req, res) => {
  try {
    const { newPlanId, billingCycle, currency } = req.body;
    if (!newPlanId) return res.status(400).json({ success: false, message: 'newPlanId is required.' });
    const result = await service.initiatePlanChange({
      tenantId: req.user.tenant_id, newPlanId,
      newBillingCycle: billingCycle, currency,
    });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

// POST /api/subscription/complete-change
// Called after payment verified — applies plan change
const completeChange = async (req, res) => {
  try {
    const {
      newPlanId, billingCycle, currency,
      gateway, gatewayOrderId, gatewayPaymentId, gatewaySignature,
      stripeSessionId,
    } = req.body;
    if (!newPlanId || !gateway) {
      return res.status(400).json({ success: false, message: 'newPlanId and gateway are required.' });
    }
    const result = await service.completePlanChange({
      tenantId: req.user.tenant_id, userId: req.user.id,
      newPlanId, newBillingCycle: billingCycle, currency,
      gateway, gatewayOrderId, gatewayPaymentId, gatewaySignature,
      stripeSessionId, ip: req.ip,
    });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

// POST /api/subscription/renew
const renewSubscription = async (req, res) => {
  try {
    const { gateway, gatewayPaymentId } = req.body;
    const result = await service.renewSubscription({
      tenantId: req.user.tenant_id, userId: req.user.id,
      gateway, gatewayPaymentId, ip: req.ip,
    });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

// POST /api/internal/cron/subscription-reminders
const cronReminders = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
    return res.status(403).json({ success: false, message: 'Unauthorized.' });
  }
  try {
    const results = await service.processRenewalReminders();
    res.json({ success: true, ...results });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getMySubscription, previewChange, initiateChange, completeChange, renewSubscription, cronReminders };
