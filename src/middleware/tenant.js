// ============================================================
// src/middleware/tenant.js — FIXED: maintenance + plan limits
// ============================================================

const db = require('../config/db');
const { getSettingValue } = require('../modules/platformSettings/settings.service');

// Plan feature map
const PLAN_FEATURES = {
  starter:    ['tasks','users','dashboard','comments','notifications'],
  pro:        ['tasks','users','dashboard','comments','notifications','reports'],
  enterprise: ['tasks','users','dashboard','comments','notifications','reports','audit'],
};

// API path → required feature
const ROUTE_FEATURE_MAP = [
  { prefix: '/reports', feature: 'reports' },
  { prefix: '/audit',   feature: 'audit'   },
];

const tenantMiddleware = async (req, res, next) => {
  try {
    if (!req.user || !req.user.tenant_id) {
      return res.status(401).json({ success: false, message: 'Tenant context missing.' });
    }

    const tenantId = req.user.tenant_id;

    // Check maintenance mode (allow admin to still access)
    try {
      const maintenance = await getSettingValue('maintenance_mode', false);
      if (maintenance === true || maintenance === 'true') {
        if (req.user.role !== 'admin') {
          return res.status(503).json({
            success: false,
            message: 'TalentOps is currently under maintenance. Please try again later.',
            code:    'MAINTENANCE_MODE',
          });
        }
      }
    } catch (e) { /* non-fatal */ }

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

    if (!rows.length) return res.status(404).json({ success: false, message: 'Tenant not found.' });

    const tenant = rows[0];

    if (['suspended','cancelled'].includes(tenant.status)) {
      return res.status(403).json({
        success: false, code: 'TENANT_SUSPENDED',
        message: `Your account is ${tenant.status}. Please contact support.`,
      });
    }

    if (tenant.status === 'trial' && tenant.trial_ends_at) {
      if (new Date(tenant.trial_ends_at) < new Date()) {
        return res.status(403).json({
          success: false, code: 'TRIAL_EXPIRED',
          message: 'Your free trial has expired. Please subscribe to continue.',
        });
      }
    }

    // Plan feature check
    const planSlug = (tenant.plan_slug || 'starter').toLowerCase();
    const allowed  = PLAN_FEATURES[planSlug] || PLAN_FEATURES.starter;
    const reqPath  = req.path || '';
    const matched  = ROUTE_FEATURE_MAP.find((r) => reqPath.includes(r.prefix));
    if (matched && !allowed.includes(matched.feature)) {
      return res.status(403).json({
        success: false, code: 'PLAN_LIMIT',
        message: `Your ${planSlug} plan does not include this feature. Please upgrade.`,
        required_feature: matched.feature,
      });
    }

    req.tenant = { ...tenant, plan_slug: planSlug, allowed_features: allowed };
    next();
  } catch (err) {
    console.error('Tenant middleware error:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = tenantMiddleware;
