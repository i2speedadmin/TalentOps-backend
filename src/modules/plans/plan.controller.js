// ============================================================
// src/modules/plans/plan.controller.js
// ============================================================

const service = require('./plan.service');

const getPlans        = async (req, res) => { try { const plans = await service.getPlans(req.query.all === 'true'); res.json({ success: true, plans }); } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };
const getPlanById     = async (req, res) => { try { const plan  = await service.getPlanById(req.params.id);         res.json({ success: true, plan  }); } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };
const getPlanStats    = async (req, res) => { try { const stats = await service.getPlanStats();                      res.json({ success: true, stats }); } catch (err) { res.status(500).json({ success: false, message: err.message }); } };

const createPlan = async (req, res) => {
  try {
    const plan = await service.createPlan({ adminId: req.superAdmin.id, body: req.body, ip: req.ip });
    res.status(201).json({ success: true, message: 'Plan created successfully.', plan });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const updatePlan = async (req, res) => {
  try {
    const plan = await service.updatePlan({ id: req.params.id, adminId: req.superAdmin.id, body: req.body, ip: req.ip });
    res.json({ success: true, message: 'Plan updated successfully.', plan });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

const deletePlan = async (req, res) => {
  try {
    const result = await service.deletePlan({ id: req.params.id, adminId: req.superAdmin.id, ip: req.ip });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

module.exports = { getPlans, getPlanById, getPlanStats, createPlan, updatePlan, deletePlan };
