// ============================================================
// src/modules/superadmin/superadmin.service.js
// ============================================================

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const db     = require('../../config/db');

// ─── Generate super admin JWT ─────────────────────────────────
const generateToken = (admin) =>
  jwt.sign(
    { id: admin.id, email: admin.email, isSuperAdmin: true },
    process.env.SUPER_ADMIN_JWT_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ─── Audit helper ─────────────────────────────────────────────
const audit = (adminId, action, table, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs
       (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (NULL, ?, 'super_admin', ?, ?, ?, ?, ?, ?)`,
    [adminId, action, table, targetId,
     oldVal ? JSON.stringify(oldVal) : null,
     newVal ? JSON.stringify(newVal) : null,
     ip || null]
  );

// ============================================================
// LOGIN
// ============================================================
const login = async ({ email, password, ip }) => {
  const [rows] = await db.query(
    'SELECT id, name, email, password, status FROM super_admins WHERE email = ? LIMIT 1',
    [email.trim().toLowerCase()]
  );

  if (!rows.length) throw { status: 401, message: 'Invalid email or password.' };

  const admin = rows[0];
  if (admin.status !== 'active') throw { status: 403, message: 'Account is inactive.' };

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) throw { status: 401, message: 'Invalid email or password.' };

  await db.query('UPDATE super_admins SET last_login_at = NOW() WHERE id = ?', [admin.id]);
  await audit(admin.id, 'LOGIN', 'super_admins', admin.id, null, { action: 'login_success' }, ip);

  const token = generateToken(admin);
  const { password: _pw, ...safeAdmin } = admin;
  return { token, admin: safeAdmin };
};

// ============================================================
// GET ME
// ============================================================
const getMe = async (adminId) => {
  const [rows] = await db.query(
    'SELECT id, name, email, status, last_login_at, created_at FROM super_admins WHERE id = ? LIMIT 1',
    [adminId]
  );
  if (!rows.length) throw { status: 404, message: 'Super Admin not found.' };
  return rows[0];
};

// ============================================================
// CHANGE PASSWORD
// ============================================================
const changePassword = async ({ adminId, currentPassword, newPassword, ip }) => {
  const [rows] = await db.query('SELECT password FROM super_admins WHERE id = ? LIMIT 1', [adminId]);
  if (!rows.length) throw { status: 404, message: 'Not found.' };

  const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
  if (!isMatch) throw { status: 400, message: 'Current password is incorrect.' };
  if (newPassword.length < 8) throw { status: 400, message: 'New password must be 8+ characters.' };

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE super_admins SET password = ? WHERE id = ?', [hashed, adminId]);
  await audit(adminId, 'CHANGE_PASSWORD', 'super_admins', adminId, null, { action: 'password_changed' }, ip);
  return { message: 'Password changed successfully.' };
};

// ============================================================
// DASHBOARD STATS
// ============================================================
const getDashboardStats = async () => {
  const [tenantStats] = await db.query(`
    SELECT
      COUNT(*)                                                      AS total_tenants,
      SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END)        AS active_tenants,
      SUM(CASE WHEN status = 'trial'     THEN 1 ELSE 0 END)        AS trial_tenants,
      SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END)        AS suspended_tenants,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)        AS cancelled_tenants,
      SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS new_this_month
    FROM tenants
  `);

  const [revenueStats] = await db.query(`
    SELECT
      SUM(CASE WHEN currency = 'INR' THEN amount ELSE 0 END)   AS total_inr,
      SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END)   AS total_usd,
      SUM(CASE WHEN currency = 'INR' AND paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN amount ELSE 0 END) AS mrr_inr,
      SUM(CASE WHEN currency = 'USD' AND paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN amount ELSE 0 END) AS mrr_usd,
      COUNT(*)                                                  AS total_payments,
      COUNT(CASE WHEN status = 'paid' THEN 1 END)              AS successful_payments,
      COUNT(CASE WHEN status = 'failed' THEN 1 END)            AS failed_payments
    FROM payments
  `);

  const [planDistribution] = await db.query(`
    SELECT p.name, p.slug, COUNT(s.id) AS subscriber_count
    FROM plans p
    LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status IN ('active','trialing')
    GROUP BY p.id, p.name, p.slug
    ORDER BY p.sort_order
  `);

  const [recentSignups] = await db.query(`
    SELECT t.id, t.name, t.email, t.status, t.created_at,
           p.name AS plan_name, s.billing_cycle, s.amount, s.currency
    FROM tenants t
    LEFT JOIN subscriptions s ON s.tenant_id = t.id
    LEFT JOIN plans p ON p.id = s.plan_id
    ORDER BY t.created_at DESC
    LIMIT 5
  `);

  const [revenueByMonth] = await db.query(`
    SELECT
      DATE_FORMAT(paid_at, '%Y-%m') AS month,
      SUM(CASE WHEN currency = 'INR' THEN amount ELSE 0 END) AS inr,
      SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END) AS usd,
      COUNT(*) AS count
    FROM payments
    WHERE status = 'paid' AND paid_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY DATE_FORMAT(paid_at, '%Y-%m')
    ORDER BY month ASC
  `);

  const [userCount] = await db.query(`
    SELECT COUNT(*) AS total FROM users WHERE status = 'active'
  `);

  return {
    tenants:          tenantStats[0],
    revenue:          revenueStats[0],
    planDistribution: planDistribution,
    recentSignups:    recentSignups,
    revenueByMonth:   revenueByMonth,
    totalUsers:       parseInt(userCount[0]?.total) || 0,
  };
};

module.exports = { login, getMe, changePassword, getDashboardStats };
