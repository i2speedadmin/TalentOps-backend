// ============================================================
// src/modules/plans/plan.service.js
// ============================================================

const db = require('../../config/db');

const audit = (adminId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (NULL, ?, 'super_admin', ?, 'plans', ?, ?, ?, ?)`,
    [adminId, action, targetId,
     oldVal ? JSON.stringify(oldVal) : null,
     newVal ? JSON.stringify(newVal) : null,
     ip || null]
  );

// GET ALL
const getPlans = async (includeInactive = false) => {
  const where = includeInactive ? '' : 'WHERE is_active = 1';
  const [rows] = await db.query(
    `SELECT * FROM plans ${where} ORDER BY sort_order ASC`
  );
  return rows.map((r) => ({
    ...r,
    features: r.features
      ? (typeof r.features === 'string' ? JSON.parse(r.features) : r.features)
      : [],
  }));
};

// GET ONE
const getPlanById = async (id) => {
  const [rows] = await db.query('SELECT * FROM plans WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Plan not found.' };
  const r = rows[0];
  return {
    ...r,
    features: r.features
      ? (typeof r.features === 'string' ? JSON.parse(r.features) : r.features)
      : [],
  };
};

// CREATE
const createPlan = async ({ adminId, body, ip }) => {
  const {
    name, slug, description,
    price_monthly_inr, price_annual_inr,
    price_monthly_usd, price_annual_usd,
    max_users = 20, max_tasks = 500, max_storage_gb = 5,
    features = [], is_active = 1, is_popular = 0, sort_order = 0,
  } = body;

  if (!name || !slug) throw { status: 400, message: 'Name and slug are required.' };

  // Check slug uniqueness
  const [exists] = await db.query('SELECT id FROM plans WHERE slug = ? LIMIT 1', [slug]);
  if (exists.length) throw { status: 409, message: 'A plan with this slug already exists.' };

  const [result] = await db.query(
    `INSERT INTO plans
       (name, slug, description,
        price_monthly_inr, price_annual_inr, price_monthly_usd, price_annual_usd,
        max_users, max_tasks, max_storage_gb,
        features, is_active, is_popular, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, slug.toLowerCase(), description || null,
      price_monthly_inr || 0, price_annual_inr || 0,
      price_monthly_usd || 0, price_annual_usd || 0,
      max_users, max_tasks, max_storage_gb,
      JSON.stringify(features),
      is_active, is_popular, sort_order,
    ]
  );

  await audit(adminId, 'CREATE_PLAN', result.insertId, null, body, ip);
  return getPlanById(result.insertId);
};

// UPDATE
const updatePlan = async ({ id, adminId, body, ip }) => {
  const existing = await getPlanById(id);
  const fields = [], values = [];

  const allowed = ['name', 'description', 'price_monthly_inr', 'price_annual_inr',
    'price_monthly_usd', 'price_annual_usd', 'max_users', 'max_tasks',
    'max_storage_gb', 'is_active', 'is_popular', 'sort_order'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (body.features !== undefined) {
    fields.push('features = ?');
    values.push(JSON.stringify(body.features));
  }

  if (!fields.length) throw { status: 400, message: 'No fields to update.' };

  values.push(id);
  await db.query(`UPDATE plans SET ${fields.join(', ')} WHERE id = ?`, values);
  await audit(adminId, 'UPDATE_PLAN', id, existing, body, ip);
  return getPlanById(id);
};

// DELETE (only if no active subscribers)
const deletePlan = async ({ id, adminId, ip }) => {
  const existing = await getPlanById(id);
  const [subs] = await db.query(
    `SELECT COUNT(*) AS cnt FROM subscriptions WHERE plan_id = ? AND status IN ('active','trialing')`,
    [id]
  );
  if (parseInt(subs[0].cnt) > 0) {
    throw { status: 400, message: 'Cannot delete a plan with active subscribers. Deactivate it instead.' };
  }
  await db.query('DELETE FROM plans WHERE id = ?', [id]);
  await audit(adminId, 'DELETE_PLAN', id, existing, null, ip);
  return { message: `Plan "${existing.name}" deleted.` };
};

// GET plan subscriber count
const getPlanStats = async () => {
  const [rows] = await db.query(`
    SELECT p.id, p.name, p.slug,
           COUNT(s.id)                                                         AS total_subscribers,
           SUM(CASE WHEN s.status = 'active'   THEN 1 ELSE 0 END)             AS active_subscribers,
           SUM(CASE WHEN s.status = 'trialing' THEN 1 ELSE 0 END)             AS trial_subscribers,
           SUM(CASE WHEN s.billing_cycle = 'monthly' THEN s.amount ELSE 0 END) AS monthly_revenue,
           SUM(CASE WHEN s.billing_cycle = 'annual'  THEN s.amount / 12 ELSE 0 END) AS annual_monthly_revenue
    FROM plans p
    LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status IN ('active','trialing')
    GROUP BY p.id, p.name, p.slug
    ORDER BY p.sort_order
  `);
  return rows;
};

module.exports = { getPlans, getPlanById, createPlan, updatePlan, deletePlan, getPlanStats };
