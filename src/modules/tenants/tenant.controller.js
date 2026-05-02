// ============================================================
// src/modules/tenants/tenant.controller.js
// ============================================================

const service = require('./tenant.service');

const getTenants     = async (req, res) => { try { const result = await service.getTenants(req.query);                                                                                         res.json({ success: true, ...result }); } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };
const getTenantById  = async (req, res) => { try { const tenant = await service.getTenantById(req.params.id);                                                                                   res.json({ success: true, tenant }); }  catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };

const updateStatus   = async (req, res) => {
  try {
    const tenant = await service.updateTenantStatus({ id: req.params.id, status: req.body.status, reason: req.body.reason, adminId: req.superAdmin.id, ip: req.ip });
    res.json({ success: true, message: 'Tenant status updated.', tenant });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const extendTrial    = async (req, res) => {
  try {
    const result = await service.extendTrial({ id: req.params.id, days: req.body.days || 14, adminId: req.superAdmin.id, ip: req.ip });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const changePlan     = async (req, res) => {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;
    const result = await service.changeTenantPlan({ id: req.params.id, planId, billingCycle, adminId: req.superAdmin.id, ip: req.ip });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const deleteTenant   = async (req, res) => {
  try {
    const result = await require('./tenant.service').deleteTenant({ id: req.params.id, adminId: req.superAdmin.id, ip: req.ip });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

module.exports = { getTenants, getTenantById, updateStatus, extendTrial, changePlan, deleteTenant };
