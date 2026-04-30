// ============================================================
// src/middleware/role.js - Role-Based Access Control Middleware
// ============================================================

const ROLE_HIERARCHY = {
  admin:       4,
  manager:     3,
  team_leader: 2,
  recruiter:   1,
};

/**
 * allowRoles(...roles)
 * Usage: router.get('/route', authenticate, allowRoles('admin', 'manager'), controller)
 */
const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }

    next();
  };
};

/**
 * allowMinRole(role)
 * Allows access to the given role AND all higher roles.
 * e.g. allowMinRole('team_leader') => allows team_leader, manager, admin
 */
const allowMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const minLevel  = ROLE_HIERARCHY[minRole]       || 0;

    if (userLevel < minLevel) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Minimum required role: ${minRole}.`,
      });
    }

    next();
  };
};

module.exports = { allowRoles, allowMinRole, ROLE_HIERARCHY };
