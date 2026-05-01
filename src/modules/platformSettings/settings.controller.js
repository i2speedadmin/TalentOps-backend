// ============================================================
// src/modules/platformSettings/settings.controller.js
// ============================================================
const service = require('./settings.service');

const getSettings    = async (req, res) => { try { const settings = await service.getSettings(true); res.json({ success: true, settings }); } catch (err) { res.status(500).json({ success: false, message: err.message }); } };
const getGateways    = async (req, res) => { try { const gateways = await service.getGatewayStatus(); res.json({ success: true, gateways }); } catch (err) { res.status(500).json({ success: false, message: err.message }); } };

const updateSettings = async (req, res) => {
  try {
    const result = await service.updateSettings({ adminId: req.superAdmin.id, settings: req.body, ip: req.ip });
    res.json({ success: true, ...result });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
};

module.exports = { getSettings, getGateways, updateSettings };
