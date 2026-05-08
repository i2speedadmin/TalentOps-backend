// ============================================================
// src/middleware/auth.js
// FIXED: removed ORDER BY inside subquery (MySQL rejects it).
// Uses two separate queries: user+tenant, then subscription+plan.
// ============================================================

const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    // ── Query 1: user + tenant ────────────────────────────
    const [userRows] = await db.query(
      `SELECT
         u.id, u.tenant_id, u.name, u.email, u.role,
         u.manager_id, u.profile_pic, u.status,
         t.status   AS tenant_status,
         t.name     AS tenant_name,
         t.trial_ends_at AS tenant_trial_ends_at
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = ?
       LIMIT 1`,
      [decoded.id]
    );

    if (!userRows.length) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const row = userRows[0];

    // ── Block inactive users ──────────────────────────────
    if (row.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact your administrator.' });
    }

    // ── Block suspended tenants ───────────────────────────
    if (row.tenant_status === 'suspended' || row.tenant_status === 'cancelled') {
      return res.status(403).json({
        success: false,
        message: 'Your company account has been suspended. Please contact support.',
        code:    'TENANT_SUSPENDED',
      });
    }

    // ── Query 2: active subscription + plan ──────────────
    // Separate query avoids the broken subquery-with-ORDER-BY issue
    const [subRows] = await db.query(
      `SELECT
         s.id AS sub_id, s.status AS sub_status,
         s.plan_id, s.next_billing_at,
         p.slug     AS plan_slug,
         p.name     AS plan_name,
         p.max_users,
         p.max_tasks,
         p.features AS plan_features
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = ?
         AND s.status IN ('active', 'trialing', 'past_due')
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [row.tenant_id]
    );

    const sub = subRows[0] || null;

    // ── Parse plan features ───────────────────────────────
    let planFeatures = [];
    if (sub?.plan_features) {
      try {
        planFeatures = typeof sub.plan_features === 'string'
          ? JSON.parse(sub.plan_features)
          : (sub.plan_features || []);
      } catch { planFeatures = []; }
    }

    // ── Populate req.user ─────────────────────────────────
    req.user = {
      id:          row.id,
      tenant_id:   row.tenant_id,
      name:        row.name,
      email:       row.email,
      role:        row.role,
      manager_id:  row.manager_id,
      profile_pic: row.profile_pic,
      status:      row.status,
    };

    // ── Populate req.tenant ───────────────────────────────
    req.tenant = {
      id:             row.tenant_id,
      name:           row.tenant_name,
      status:         row.tenant_status,
      trial_ends_at:  row.tenant_trial_ends_at,
      plan_id:        sub?.plan_id        || null,
      plan_slug:      sub?.plan_slug      || 'starter',
      plan_name:      sub?.plan_name      || 'Starter',
      plan_features:  planFeatures,
      max_users:      sub?.max_users      ?? 10,
      max_tasks:      sub?.max_tasks      ?? 500,
      sub_status:     sub?.sub_status     || null,
      next_billing_at: sub?.next_billing_at || null,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = authenticate;
