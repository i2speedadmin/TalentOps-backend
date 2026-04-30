// ============================================================
// src/middleware/auth.js - JWT Authentication Middleware
// ============================================================

const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
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

    // Fetch fresh user from DB (ensures inactive users are blocked)
    const [rows] = await db.query(
      'SELECT id, name, email, role, manager_id, profile_pic, status FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!rows.length || rows[0].status !== 'active') {
      return res.status(401).json({ success: false, message: 'User not found or account is inactive.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = authenticate;
