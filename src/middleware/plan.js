// ============================================================
// src/middleware/plan.js
// Plan-based feature enforcement middleware
//
// PLAN FEATURE MATRIX:
//   starter    → Tasks, Users (max 10), Dashboard,
//                Comments on Tasks, Email Notifications
//   pro        → Everything in Starter + Reports & Analytics,
//                Users (max 50)
//   enterprise → Everything in Pro + Audit Logs,
//                Priority Support, Users (max 100)
//
// Usage in routes:
//   router.get('/reports', authenticate, requireFeature('reports'), ...)
//   router.get('/audit',   authenticate, requireFeature('audit_logs'), ...)
// ============================================================

// Map plan slug → allowed feature keys
const PLAN_FEATURES = {
  starter: ['tasks', 'users', 'dashboard', 'comments', 'notifications', 'profile', 'subscription'],
  pro:     ['tasks', 'users', 'dashboard', 'comments', 'notifications', 'profile', 'subscription', 'reports'],
  enterprise: ['tasks', 'users', 'dashboard', 'comments', 'notifications', 'profile', 'subscription', 'reports', 'audit_logs', 'priority_support'],
};

// Friendly feature names for error messages
const FEATURE_NAMES = {
  tasks:            'Task Management',
  users:            'User Management',
  dashboard:        'Dashboard',
  comments:         'Comments on Tasks',
  notifications:    'Email Notifications',
  reports:          'Reports & Analytics',
  audit_logs:       'Audit Logs',
  priority_support: 'Priority Support',
  profile:          'Profile',
  subscription:     'Subscription',
};

// Which plan is needed for each feature
const FEATURE_MIN_PLAN = {
  reports:          'pro',
  audit_logs:       'enterprise',
  priority_support: 'enterprise',
};

// Plan upgrade path for error suggestions
const UPGRADE_SUGGESTION = {
  starter: 'Pro',
  pro:     'Enterprise',
};

// ─── Main middleware factory ──────────────────────────────────
const requireFeature = (featureKey) => (req, res, next) => {
  const planSlug = req.tenant?.plan_slug || 'starter';
  const allowed  = PLAN_FEATURES[planSlug] || PLAN_FEATURES.starter;

  if (allowed.includes(featureKey)) {
    return next();
  }

  const featureName  = FEATURE_NAMES[featureKey] || featureKey;
  const minPlan      = FEATURE_MIN_PLAN[featureKey] || 'pro';
  const upgradeTo    = UPGRADE_SUGGESTION[planSlug] || 'a higher';

  return res.status(403).json({
    success:      false,
    message:      `${featureName} is not available on your current ${req.tenant?.plan_name || 'Starter'} plan.`,
    feature:      featureKey,
    current_plan: planSlug,
    upgrade_to:   upgradeTo,
    code:         'PLAN_FEATURE_RESTRICTED',
  });
};

// ─── Check if a plan has a feature (for use in services) ─────
const planHasFeature = (planSlug, featureKey) => {
  const allowed = PLAN_FEATURES[planSlug] || PLAN_FEATURES.starter;
  return allowed.includes(featureKey);
};

// ─── Get all features for a plan ─────────────────────────────
const getPlanFeatures = (planSlug) =>
  PLAN_FEATURES[planSlug] || PLAN_FEATURES.starter;

module.exports = { requireFeature, planHasFeature, getPlanFeatures, PLAN_FEATURES, FEATURE_MIN_PLAN };
