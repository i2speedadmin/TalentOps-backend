// ============================================================
// src/modules/tenants/tenant.service.js
// ============================================================

const db = require('../../config/db');

const audit = (adminId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (NULL, ?, 'super_admin', ?, 'tenants', ?, ?, ?, ?)`,
    [adminId, action, targetId,
     oldVal ? JSON.stringify(oldVal) : null,
     newVal ? JSON.stringify(newVal) : null,
     ip || null]
  );

const TENANT_SELECT = `
  t.id, t.name, t.slug, t.email, t.phone, t.logo, t.address,
  t.industry, t.size, t.status, t.trial_ends_at, t.created_at, t.updated_at,
  p.id AS plan_id, p.name AS plan_name, p.slug AS plan_slug,
  s.id AS subscription_id, s.status AS sub_status,
  s.billing_cycle, s.currency, s.amount,
  s.starts_at, s.ends_at, s.next_billing_at,
  (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.status = 'active') AS user_count,
  (SELECT COUNT(*) FROM tasks tk WHERE tk.tenant_id = t.id) AS task_count
`;

// GET ALL TENANTS
const getTenants = async ({ page = 1, limit = 20, search, status }) => {
  const offset  = (page - 1) * limit;
  const filters = [], params = [];

  if (search) { filters.push('(t.name LIKE ? OR t.email LIKE ? OR t.slug LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (status)  { filters.push('t.status = ?'); params.push(status); }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await db.query(
    `SELECT ${TENANT_SELECT}
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.status IN ('active','trialing')
     LEFT JOIN plans p ON p.id = s.plan_id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), parseInt(offset)]
  );

  const [count] = await db.query(
    `SELECT COUNT(*) AS total FROM tenants t ${where}`, params
  );

  return {
    tenants: rows,
    pagination: {
      total:      parseInt(count[0].total) || 0,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil((parseInt(count[0].total) || 0) / limit),
    },
  };
};

// GET ONE TENANT
const getTenantById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${TENANT_SELECT}
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.status IN ('active','trialing')
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE t.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw { status: 404, message: 'Tenant not found.' };

  // Also fetch payment history
  const [payments] = await db.query(
    `SELECT id, gateway, amount, currency, status, payment_method, paid_at, created_at
     FROM payments WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10`,
    [id]
  );

  // Fetch users
  const [users] = await db.query(
    `SELECT id, name, email, role, status, created_at FROM users WHERE tenant_id = ? ORDER BY role, name LIMIT 20`,
    [id]
  );

  return { ...rows[0], payments, users };
};

// UPDATE TENANT STATUS
const updateTenantStatus = async ({ id, status, reason, adminId, ip }) => {
  const [rows] = await db.query('SELECT id, name, status FROM tenants WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Tenant not found.' };

  const oldStatus = rows[0].status;
  await db.query('UPDATE tenants SET status = ? WHERE id = ?', [status, id]);

  // If suspending, also suspend subscription
  if (status === 'suspended') {
    await db.query(
      `UPDATE subscriptions SET status = 'past_due', cancellation_reason = ? WHERE tenant_id = ? AND status = 'active'`,
      [reason || 'Suspended by Super Admin', id]
    );
  }

  // If reactivating
  if (status === 'active') {
    await db.query(
      `UPDATE subscriptions SET status = 'active' WHERE tenant_id = ? AND status = 'past_due'`,
      [id]
    );
  }

  await audit(adminId, 'UPDATE_TENANT_STATUS', id, { status: oldStatus }, { status, reason }, ip);
  return getTenantById(id);
};

// EXTEND TRIAL
const extendTrial = async ({ id, days, adminId, ip }) => {
  const [rows] = await db.query('SELECT id, name, trial_ends_at FROM tenants WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Tenant not found.' };

  const currentExpiry = rows[0].trial_ends_at ? new Date(rows[0].trial_ends_at) : new Date();
  if (currentExpiry < new Date()) currentExpiry.setTime(new Date().getTime());
  currentExpiry.setDate(currentExpiry.getDate() + parseInt(days));

  await db.query(
    'UPDATE tenants SET trial_ends_at = ?, status = ? WHERE id = ?',
    [currentExpiry.toISOString().slice(0, 19).replace('T', ' '), 'trial', id]
  );

  await audit(adminId, 'EXTEND_TRIAL', id, { trial_ends_at: rows[0].trial_ends_at }, { extended_by_days: days }, ip);
  return { message: `Trial extended by ${days} days. New expiry: ${currentExpiry.toDateString()}` };
};

// CHANGE TENANT PLAN
const changeTenantPlan = async ({ id, planId, billingCycle, adminId, ip }) => {
  const [tenant] = await db.query('SELECT id FROM tenants WHERE id = ? LIMIT 1', [id]);
  if (!tenant.length) throw { status: 404, message: 'Tenant not found.' };

  const [plan] = await db.query('SELECT id, name, price_monthly_inr, price_annual_inr FROM plans WHERE id = ? LIMIT 1', [planId]);
  if (!plan.length) throw { status: 404, message: 'Plan not found.' };

  const p = plan[0];
  const amount = billingCycle === 'annual' ? p.price_annual_inr : p.price_monthly_inr;

  // Cancel existing subscription
  await db.query(
    `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE tenant_id = ? AND status IN ('active','trialing')`,
    [id]
  );

  // Create new subscription
  const now    = new Date();
  const starts = now.toISOString().slice(0, 19).replace('T', ' ');
  const nextBill = new Date(now);
  billingCycle === 'annual' ? nextBill.setFullYear(nextBill.getFullYear() + 1) : nextBill.setMonth(nextBill.getMonth() + 1);

  await db.query(
    `INSERT INTO subscriptions (tenant_id, plan_id, billing_cycle, currency, amount, status, gateway, starts_at, next_billing_at)
     VALUES (?, ?, ?, 'INR', ?, 'active', 'manual', ?, ?)`,
    [id, planId, billingCycle, amount, starts, nextBill.toISOString().slice(0, 19).replace('T', ' ')]
  );

  await audit(adminId, 'CHANGE_TENANT_PLAN', id, null, { plan_id: planId, billing_cycle: billingCycle }, ip);
  return { message: `Tenant plan changed to ${p.name} (${billingCycle}).` };
};

// ─── DELETE TENANT ───────────────────────────────────────────
const deleteTenant = async ({ id, adminId, ip }) => {
  const [rows] = await db.query('SELECT id, name FROM tenants WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Tenant not found.' };

  // Hard delete — cascades via FK to users, tasks, etc.
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  await db.query('DELETE FROM audit_logs    WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM notifications WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM task_files    WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM task_comments WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM tasks         WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM users         WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM payments      WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM promo_code_usages WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM subscriptions WHERE tenant_id = ?', [id]);
  await db.query('DELETE FROM tenants       WHERE id = ?',        [id]);
  await db.query('SET FOREIGN_KEY_CHECKS = 1');

  return { message: `Company "${rows[0].name}" and all data permanently deleted.` };
};

module.exports = { getTenants, getTenantById, updateTenantStatus, extendTrial, changeTenantPlan, deleteTenant };
