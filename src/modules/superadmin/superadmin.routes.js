// ============================================================
// src/modules/superadmin/superadmin.routes.js
// ============================================================

const express        = require('express');
const router         = express.Router();
const controller     = require('./superadmin.controller');
const superAdminAuth = require('../../middleware/superAdminAuth');

// Public
router.post('/login', controller.login);

// Protected
router.get('/me',              superAdminAuth, controller.getMe);
router.put('/change-password', superAdminAuth, controller.changePassword);
router.get('/dashboard',       superAdminAuth, controller.getDashboardStats);

module.exports = router;

// GET /api/superadmin/payments
router.get('/payments', superAdminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, gateway } = req.query;
    const offset  = (parseInt(page) - 1) * parseInt(limit);
    const filters = [], params = [];
    if (search)  { filters.push('(t.name LIKE ? OR p.gateway_order_id LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (status)  { filters.push('p.status = ?');  params.push(status);  }
    if (gateway) { filters.push('p.gateway = ?'); params.push(gateway); }
    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
    const db = require('../config/db');

    const [payments] = await db.query(
      `SELECT p.*, t.name AS tenant_name
       FROM payments p
       LEFT JOIN tenants t ON t.id = p.tenant_id
       ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [cnt] = await db.query(`SELECT COUNT(*) AS total FROM payments p LEFT JOIN tenants t ON t.id = p.tenant_id ${where}`, params);
    const [sum] = await db.query(
      `SELECT SUM(CASE WHEN currency='INR' AND status='paid' THEN amount ELSE 0 END) AS total_inr,
              SUM(CASE WHEN currency='USD' AND status='paid' THEN amount ELSE 0 END) AS total_usd,
              SUM(CASE WHEN status='paid'   THEN 1 ELSE 0 END) AS paid_count,
              SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_count
       FROM payments`
    );
    const total = parseInt(cnt[0].total) || 0;
    res.json({ success: true, payments, summary: sum[0],
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
