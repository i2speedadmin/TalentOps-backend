// ============================================================
// src/modules/promoCodes/promoCode.service.js
// ============================================================

const db = require('../../config/db');

// ─── Validate a promo code (public endpoint for signup flow) ──
const validatePromoCode = async ({ code, planId, billingCycle, currency }) => {
  const [rows] = await db.query(
    `SELECT * FROM promo_codes WHERE code = ? AND is_active = 1 LIMIT 1`,
    [code.toUpperCase().trim()]
  );
  if (!rows.length) throw { status: 404, message: 'Promo code not found or inactive.' };

  const promo = rows[0];
  const now   = new Date();

  // Check expiry
  if (promo.expires_at && new Date(promo.expires_at) < now) {
    throw { status: 400, message: 'This promo code has expired.' };
  }

  // Check max uses
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    throw { status: 400, message: 'This promo code has reached its usage limit.' };
  }

  // Check billing cycle applicability
  if (promo.applies_to !== 'all' && promo.applies_to !== billingCycle) {
    throw { status: 400, message: `This code is only valid for ${promo.applies_to} billing.` };
  }

  // Check plan applicability
  if (promo.plan_ids) {
    const planIds = typeof promo.plan_ids === 'string' ? JSON.parse(promo.plan_ids) : promo.plan_ids;
    if (planId && !planIds.includes(parseInt(planId))) {
      throw { status: 400, message: 'This promo code is not valid for the selected plan.' };
    }
  }

  return {
    valid:          true,
    promo_code_id:  promo.id,
    code:           promo.code,
    discount_type:  promo.discount_type,
    discount_value: parseFloat(promo.discount_value),
    description:    promo.description,
  };
};

// ─── Get all promo codes ───────────────────────────────────────
const getPromoCodes = async ({ page = 1, limit = 20, search, active }) => {
  const offset = (page - 1) * limit;
  const filters = [], params = [];

  if (search)           { filters.push('(code LIKE ? OR description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (active !== undefined) { filters.push('is_active = ?'); params.push(active === 'true' ? 1 : 0); }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await db.query(
    `SELECT p.*, sa.name AS created_by_name
     FROM promo_codes p
     LEFT JOIN super_admins sa ON sa.id = p.created_by
     ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), parseInt(offset)]
  );

  const [count] = await db.query(`SELECT COUNT(*) AS total FROM promo_codes ${where}`, params);

  return {
    promoCodes: rows.map((r) => ({
      ...r,
      plan_ids:      r.plan_ids ? (typeof r.plan_ids === 'string' ? JSON.parse(r.plan_ids) : r.plan_ids) : null,
      discount_value: parseFloat(r.discount_value),
    })),
    pagination: {
      total:      parseInt(count[0].total) || 0,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil((parseInt(count[0].total) || 0) / limit),
    },
  };
};

// ─── Create promo code ─────────────────────────────────────────
const createPromoCode = async ({ adminId, body, ip }) => {
  const {
    code, description, discount_type, discount_value,
    max_uses, applies_to = 'all', plan_ids, is_active = 1, expires_at,
  } = body;

  if (!code || !discount_type || !discount_value) {
    throw { status: 400, message: 'Code, discount type, and discount value are required.' };
  }

  const upperCode = code.toUpperCase().trim();
  const [exists] = await db.query('SELECT id FROM promo_codes WHERE code = ? LIMIT 1', [upperCode]);
  if (exists.length) throw { status: 409, message: 'A promo code with this code already exists.' };

  const [result] = await db.query(
    `INSERT INTO promo_codes
       (code, description, discount_type, discount_value, max_uses, applies_to, plan_ids, is_active, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      upperCode, description || null, discount_type, discount_value,
      max_uses || null, applies_to,
      plan_ids ? JSON.stringify(plan_ids) : null,
      is_active, expires_at || null, adminId,
    ]
  );

  await db.query(
    `INSERT INTO audit_logs (user_id, user_type, action, target_table, target_id, new_value, ip_address)
     VALUES (?, 'super_admin', 'CREATE_PROMO', 'promo_codes', ?, ?, ?)`,
    [adminId, result.insertId, JSON.stringify({ code: upperCode, discount_type, discount_value }), ip]
  );

  const [created] = await db.query('SELECT * FROM promo_codes WHERE id = ? LIMIT 1', [result.insertId]);
  return created[0];
};

// ─── Update promo code ─────────────────────────────────────────
const updatePromoCode = async ({ id, adminId, body, ip }) => {
  const [rows] = await db.query('SELECT * FROM promo_codes WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Promo code not found.' };

  const fields = [], values = [];
  const allowed = ['description', 'discount_type', 'discount_value', 'max_uses', 'applies_to', 'is_active', 'expires_at'];

  for (const key of allowed) {
    if (body[key] !== undefined) { fields.push(`${key} = ?`); values.push(body[key]); }
  }
  if (body.plan_ids !== undefined) { fields.push('plan_ids = ?'); values.push(JSON.stringify(body.plan_ids)); }

  if (!fields.length) throw { status: 400, message: 'No fields to update.' };

  values.push(id);
  await db.query(`UPDATE promo_codes SET ${fields.join(', ')} WHERE id = ?`, values);

  const [updated] = await db.query('SELECT * FROM promo_codes WHERE id = ? LIMIT 1', [id]);
  return updated[0];
};

// ─── Delete promo code ─────────────────────────────────────────
const deletePromoCode = async ({ id, adminId, ip }) => {
  const [rows] = await db.query('SELECT code FROM promo_codes WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) throw { status: 404, message: 'Promo code not found.' };

  await db.query('DELETE FROM promo_codes WHERE id = ?', [id]);
  return { message: `Promo code "${rows[0].code}" deleted.` };
};

module.exports = { validatePromoCode, getPromoCodes, createPromoCode, updatePromoCode, deletePromoCode };
