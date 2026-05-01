// ============================================================
// src/modules/promoCodes/promoCode.controller.js
// ============================================================
const service = require('./promoCode.service');

const validate     = async (req, res) => { try { const result = await service.validatePromoCode(req.query);                                                                         res.json({ success: true, ...result }); } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };
const getAll       = async (req, res) => { try { const result = await service.getPromoCodes(req.query);                                                                             res.json({ success: true, ...result }); } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };
const create       = async (req, res) => { try { const p = await service.createPromoCode({ adminId: req.superAdmin.id, body: req.body, ip: req.ip }); res.status(201).json({ success: true, promoCode: p }); } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };
const update       = async (req, res) => { try { const p = await service.updatePromoCode({ id: req.params.id, adminId: req.superAdmin.id, body: req.body, ip: req.ip }); res.json({ success: true, promoCode: p }); } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };
const deleteCode   = async (req, res) => { try { const r = await service.deletePromoCode({ id: req.params.id, adminId: req.superAdmin.id, ip: req.ip }); res.json({ success: true, ...r }); } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); } };

module.exports = { validate, getAll, create, update, deleteCode };
