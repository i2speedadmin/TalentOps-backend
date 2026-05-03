// ============================================================
// src/modules/tenants/tenant.service.js
// Feature 1: Added subscription date fields to getTenants
// ============================================================

const db = require('../../config/db');

// ─── List tenants (Super Admin) ───────────────────────────────
const getTenants = async ({ page = 1, limit = 15, search, status }) => {
  const offset  = (parseInt(page) - 1) * parseInt(limit);
  const filters = [];
  const params  = [];

  if (search) {
    filters.push('(t.name LIKE ? OR t.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    filters.push('t.status = ?');
    params.push(status);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  // Include subscription date fields: starts_at (plan from), next_billing_at (plan to)
  const [rows] = await db.query(
    `SELECT
       t.id, t.name, t.slug, t.email, t.phone, t.industry, t.size, t.status,
       t.trial_ends_at, t.created_at,
       s.id          AS subscription_id,
       s.plan_id,
       s.status      AS sub_status,
       s.billing_cycle,
       s.currency,
       s.amount,
       s.starts_at,
       s.next_billing_at,
       s.ends_at,
       s.cancelled_at,
       p.name        AS plan_name,
       p.slug        AS plan_slug,
       (SELECT COUNT(*) FROM users  u WHERE u.tenant_id = t.id AND u.status = 'active') AS user_count,
       (SELECT COUNT(*) FROM tasks  tk WHERE tk.tenant_id = t.id)                       AS task_count
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id
       AND s.status IN ('active','trialing','past_due')
     LEFT JOIN plans p ON p.id = s.plan_id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  const [cnt] = await db.query(
    `SELECT COUNT(*) AS total FROM tenants t ${where}`,
    params
  );

  return {
    tenants: rows,
    pagination: {
      total:      parseInt(cnt[0].total) || 0,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil((parseInt(cnt[0].total) || 0) / parseInt(limit)),
    },
  };
};

// ─── Single tenant detail ─────────────────────────────────────
const getTenantById = async (id) => {
  const [rows] = await db.query(
    `SELECT
       t.*, s.id AS subscription_id, s.plan_id, s.status AS sub_status,
       s.billing_cycle, s.currency, s.amount, s.starts_at, s.next_billing_at, s.ends_at,
       p.name AS plan_name, p.slug AS plan_slug,
       (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count,
       (SELECT COUNT(*) FROM tasks tk WHERE tk.tenant_id = t.id) AS task_count
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.status IN ('active','trialing','past_due')
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE t.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw { status: 404, message: 'Tenant not found.' };
  return rows[0];
};

// ─── Update tenant status ─────────────────────────────────────
const updateTenantStatus = async ({ id, status, reason }) => {
  const allowed = ['active', 'suspended', 'cancelled', 'trial'];
  if (!allowed.includes(status)) throw { status: 400, message: 'Invalid status.' };

  const [rows] = await db.query('SELECT id, name FROM tenants WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Tenant not found.' };

  await db.query('UPDATE tenants SET status = ? WHERE id = ?', [status, id]);

  // If suspending, also mark subscription past_due
  if (status === 'suspended') {
    await db.query(
      `UPDATE subscriptions SET status = 'past_due' WHERE tenant_id = ? AND status = 'active'`,
      [id]
    );
  }
  // If reactivating, restore subscription to active
  if (status === 'active') {
    await db.query(
      `UPDATE subscriptions SET status = 'active' WHERE tenant_id = ? AND status = 'past_due'`,
      [id]
    );
  }

  return { message: `Tenant "${rows[0].name}" status updated to ${status}.` };
};

// ─── Extend trial ─────────────────────────────────────────────
const extendTrial = async ({ id, days }) => {
  const [rows] = await db.query('SELECT id, name, trial_ends_at FROM tenants WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Tenant not found.' };

  const base     = rows[0].trial_ends_at ? new Date(rows[0].trial_ends_at) : new Date();
  const newExpiry = new Date(base);
  newExpiry.setDate(newExpiry.getDate() + parseInt(days));

  await db.query(
    'UPDATE tenants SET trial_ends_at = ?, status = "trial" WHERE id = ?',
    [newExpiry.toISOString().slice(0, 19).replace('T', ' '), id]
  );

  return {
    message:       `Trial extended by ${days} days for "${rows[0].name}".`,
    new_trial_end: newExpiry.toISOString(),
  };
};

// ─── SA: Change tenant plan ───────────────────────────────────
const changeTenantPlan = async ({ id, planId, billingCycle }) => {
  const [tenantRows] = await db.query('SELECT id, name FROM tenants WHERE id = ? LIMIT 1', [id]);
  if (!tenantRows.length) throw { status: 404, message: 'Tenant not found.' };

  const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [planId]);
  if (!planRows.length) throw { status: 404, message: 'Plan not found.' };

  const plan      = planRows[0];
  const bill      = billingCycle || 'monthly';
  const amount    = parseFloat(bill === 'annual' ? plan.price_annual_inr : plan.price_monthly_inr);
  const now       = new Date();
  const nextBill  = new Date(now);
  bill === 'annual' ? nextBill.setFullYear(nextBill.getFullYear() + 1) : nextBill.setMonth(nextBill.getMonth() + 1);
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  // Cancel existing
  await db.query(
    `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
     WHERE tenant_id = ? AND status IN ('active','trialing','past_due')`,
    [id]
  );

  // Create new
  await db.query(
    `INSERT INTO subscriptions
       (tenant_id, plan_id, billing_cycle, currency, amount, status, gateway, starts_at, next_billing_at)
     VALUES (?, ?, ?, 'INR', ?, 'active', 'manual', NOW(), ?)`,
    [id, planId, bill, amount, fmt(nextBill)]
  );

  await db.query('UPDATE tenants SET status = "active" WHERE id = ?', [id]);

  return {
    message:        `Plan changed to ${plan.name} for "${tenantRows[0].name}".`,
    next_billing_at: fmt(nextBill),
  };
};

// ─── Delete tenant (hard delete) ─────────────────────────────
const deleteTenant = async ({ id }) => {
  const [rows] = await db.query('SELECT id, name FROM tenants WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Tenant not found.' };

  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  const tables = ['audit_logs','notifications','task_files','task_comments','tasks','users',
                  'payments','promo_code_usages','subscriptions'];
  for (const tbl of tables) {
    await db.query(`DELETE FROM \`${tbl}\` WHERE tenant_id = ?`, [id]);
  }
  await db.query('DELETE FROM tenants WHERE id = ?', [id]);
  await db.query('SET FOREIGN_KEY_CHECKS = 1');

  return { message: `Company "${rows[0].name}" and all data permanently deleted.` };
};

module.exports = { getTenants, getTenantById, updateTenantStatus, extendTrial, changeTenantPlan, deleteTenant };
