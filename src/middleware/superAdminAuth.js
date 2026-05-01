// ============================================================
// src/middleware/superAdminAuth.js
// ============================================================

const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const superAdminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.SUPER_ADMIN_JWT_SECRET || process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    // Must have superAdmin flag
    if (!decoded.isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied. Super Admin only.' });
    }

    const [rows] = await db.query(
      'SELECT id, name, email, status FROM super_admins WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (!rows.length || rows[0].status !== 'active') {
      return res.status(401).json({ success: false, message: 'Super Admin account not found or inactive.' });
    }

    req.superAdmin = rows[0];
    next();
  } catch (err) {
    console.error('Super admin auth error:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = superAdminAuth;
