// ============================================================
// src/modules/platformSettings/settings.service.js
// ============================================================

const db = require('../../config/db');

// GET ALL SETTINGS (grouped, mask sensitive values)
const getSettings = async (showSensitive = false) => {
  const [rows] = await db.query(
    'SELECT * FROM platform_settings ORDER BY group_name, setting_key'
  );

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.group_name]) grouped[row.group_name] = [];
    grouped[row.group_name].push({
      id:            row.id,
      key:           row.setting_key,
      value:         row.is_sensitive && !showSensitive ? (row.setting_value ? '••••••••' : '') : row.setting_value,
      type:          row.setting_type,
      label:         row.label,
      description:   row.description,
      group:         row.group_name,
      is_sensitive:  row.is_sensitive,
      updated_at:    row.updated_at,
    });
  }
  return grouped;
};

// GET SINGLE SETTING BY KEY
const getSetting = async (key) => {
  const [rows] = await db.query(
    'SELECT * FROM platform_settings WHERE setting_key = ? LIMIT 1', [key]
  );
  if (!rows.length) throw { status: 404, message: `Setting "${key}" not found.` };
  return rows[0];
};

// GET SETTING VALUE (internal use — unmasked)
const getSettingValue = async (key, defaultValue = null) => {
  const [rows] = await db.query(
    'SELECT setting_value, setting_type FROM platform_settings WHERE setting_key = ? LIMIT 1', [key]
  );
  if (!rows.length) return defaultValue;
  const { setting_value, setting_type } = rows[0];
  if (!setting_value) return defaultValue;
  if (setting_type === 'boolean') return setting_value === 'true';
  if (setting_type === 'number')  return parseFloat(setting_value);
  if (setting_type === 'json')    return JSON.parse(setting_value);
  return setting_value;
};

// UPDATE SETTINGS (bulk — accepts object of key:value pairs)
const updateSettings = async ({ adminId, settings, ip }) => {
  const updated = [];
  for (const [key, value] of Object.entries(settings)) {
    const [rows] = await db.query(
      'SELECT id FROM platform_settings WHERE setting_key = ? LIMIT 1', [key]
    );
    if (!rows.length) continue; // skip unknown keys

    await db.query(
      'UPDATE platform_settings SET setting_value = ?, updated_by = ? WHERE setting_key = ?',
      [String(value), adminId, key]
    );
    updated.push(key);
  }

  // Audit
  await db.query(
    `INSERT INTO audit_logs (user_id, user_type, action, target_table, new_value, ip_address)
     VALUES (?, 'super_admin', 'UPDATE_SETTINGS', 'platform_settings', ?, ?)`,
    [adminId, JSON.stringify({ updated_keys: updated }), ip]
  );

  return { message: `${updated.length} setting(s) updated.`, updated };
};

// GET GATEWAY STATUS (public — for frontend checkout page)
const getGatewayStatus = async () => {
  const [rows] = await db.query(
    `SELECT setting_key, setting_value FROM platform_settings
     WHERE setting_key IN ('razorpay_enabled', 'stripe_enabled', 'razorpay_key_id', 'stripe_publishable_key')`
  );

  const map = {};
  rows.forEach((r) => { map[r.setting_key] = r.setting_value; });

  return {
    razorpay: {
      enabled:    map['razorpay_enabled'] === 'true',
      key_id:     map['razorpay_key_id'] || '',
    },
    stripe: {
      enabled:         map['stripe_enabled'] === 'true',
      publishable_key: map['stripe_publishable_key'] || '',
    },
  };
};

module.exports = { getSettings, getSetting, getSettingValue, updateSettings, getGatewayStatus };
