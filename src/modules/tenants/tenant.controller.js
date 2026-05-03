// ============================================================
// src/modules/tenants/tenant.controller.js
// ============================================================
const svc = require('./tenant.service');

const getTenants     = async (req, res) => { try { res.json({ success: true, ...(await svc.getTenants(req.query)) }); } catch(e){ res.status(e.status||500).json({ success:false, message:e.message }); } };
const getTenantById  = async (req, res) => { try { res.json({ success: true, tenant: await svc.getTenantById(req.params.id) }); } catch(e){ res.status(e.status||500).json({ success:false, message:e.message }); } };
const updateStatus   = async (req, res) => { try { res.json({ success: true, ...(await svc.updateTenantStatus({ id:req.params.id, ...req.body })) }); } catch(e){ res.status(e.status||500).json({ success:false, message:e.message }); } };
const extendTrial    = async (req, res) => { try { res.json({ success: true, ...(await svc.extendTrial({ id:req.params.id, days:req.body.days||14 })) }); } catch(e){ res.status(e.status||500).json({ success:false, message:e.message }); } };
const changePlan     = async (req, res) => { try { res.json({ success: true, ...(await svc.changeTenantPlan({ id:req.params.id, ...req.body })) }); } catch(e){ res.status(e.status||500).json({ success:false, message:e.message }); } };
const deleteTenant   = async (req, res) => { try { res.json({ success: true, ...(await svc.deleteTenant({ id:req.params.id })) }); } catch(e){ res.status(e.status||500).json({ success:false, message:e.message }); } };

module.exports = { getTenants, getTenantById, updateStatus, extendTrial, changePlan, deleteTenant };
