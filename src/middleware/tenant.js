// ============================================================
// src/middleware/tenant.js
// Injects tenant_id from authenticated user into every request.
// Must run AFTER authenticate middleware.
// ============================================================

const db = require('../config/db');

const tenantMiddleware = async (req, res, next) => {
  try {
    if (!req.user || !req.user.tenant_id) {
      return res.status(401).json({ success: false, message: 'Tenant context missing.' });
    }

    const tenantId = req.user.tenant_id;

    // Check tenant status (cache this in production with Redis)
    const [rows] = await db.query(
      `SELECT t.id, t.name, t.slug, t.status, t.trial_ends_at,
              s.plan_id, s.status AS sub_status, s.ends_at,
              p.slug AS plan_slug, p.max_users, p.max_tasks, p.max_storage_gb
       FROM tenants t
       LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.status IN ('active','trialing')
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE t.id = ? LIMIT 1`,
      [tenantId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    const tenant = rows[0];

    // Block suspended or cancelled tenants
    if (['suspended', 'cancelled'].includes(tenant.status)) {
      return res.status(403).json({
        success:  false,
        message:  `Your account is ${tenant.status}. Please contact support.`,
        code:     'TENANT_SUSPENDED',
      });
    }

    // Check trial expiry
    if (tenant.status === 'trial' && tenant.trial_ends_at) {
      if (new Date(tenant.trial_ends_at) < new Date()) {
        return res.status(403).json({
          success:  false,
          message:  'Your free trial has expired. Please subscribe to continue.',
          code:     'TRIAL_EXPIRED',
        });
      }
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    console.error('Tenant middleware error:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = tenantMiddleware;
