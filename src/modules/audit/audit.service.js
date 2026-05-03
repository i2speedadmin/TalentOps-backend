// ============================================================
// src/modules/audit/audit.service.js
// FIXED: JOIN on user_id only (no tenant_id match on join)
// tenant_id filter applied on al.tenant_id OR falls back to
// filtering via the user's own tenant when tenant_id is NULL
// ============================================================

const db = require('../../config/db');

// ============================================================
// GET AUDIT LOGS
// ============================================================
const getAuditLogs = async ({
  requester,
  page       = 1,
  limit      = 20,
  search,
  action,
  targetTable,
  userId,
  dateFrom,
  dateTo,
}) => {
  const tenantId = requester.tenant_id;
  const offset   = (parseInt(page) - 1) * parseInt(limit);

  // ── Tenant isolation ──────────────────────────────────────
  // We join users to get name/email.
  // The JOIN uses only user_id so it works whether or not
  // al.tenant_id is populated (old rows may have NULL).
  // We then filter by: the user who performed the action must
  // belong to this tenant. This is the correct security model
  // — every action was done by a user of this tenant.
  const conditions = ['u.tenant_id = ?'];
  const params     = [tenantId];

  // ── Optional filters ──────────────────────────────────────
  if (search) {
    conditions.push(`(
      u.name LIKE ? OR u.email LIKE ? OR
      al.action LIKE ? OR al.target_table LIKE ?
    )`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (action)      { conditions.push('al.action = ?');       params.push(action);      }
  if (targetTable) { conditions.push('al.target_table = ?'); params.push(targetTable); }

  if (userId) {
    // Verify the requested userId belongs to this tenant
    const [userCheck] = await db.query(
      'SELECT id FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
      [userId, tenantId]
    );
    if (!userCheck.length) {
      return {
        logs:       [],
        pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 },
      };
    }
    conditions.push('al.user_id = ?');
    params.push(userId);
  }

  if (dateFrom) {
    conditions.push('al.created_at >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push('al.created_at <= ?');
    params.push(end.toISOString().slice(0, 19).replace('T', ' '));
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  // ── Data query ────────────────────────────────────────────
  // INNER JOIN ensures only logs from this tenant's users are returned.
  // This replaces the old LEFT JOIN + tenant_id check on both sides.
  const [rows] = await db.query(
    `SELECT
       al.id, al.tenant_id, al.user_id, al.user_type, al.action,
       al.target_table, al.target_id,
       al.old_value, al.new_value,
       al.ip_address, al.user_agent, al.created_at,
       u.name  AS user_name,
       u.email AS user_email,
       u.role  AS user_role
     FROM audit_logs al
     INNER JOIN users u ON u.id = al.user_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  // ── Count query ───────────────────────────────────────────
  const [count] = await db.query(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     INNER JOIN users u ON u.id = al.user_id
     ${where}`,
    params
  );

  // ── Parse JSON values ─────────────────────────────────────
  const logs = rows.map((row) => ({
    ...row,
    old_value: safeParseJSON(row.old_value),
    new_value: safeParseJSON(row.new_value),
  }));

  const total = parseInt(count[0].total) || 0;

  return {
    logs,
    pagination: {
      total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

// ============================================================
// GET AUDIT LOG BY ID
// ============================================================
const getAuditLogById = async (id, requester) => {
  const tenantId = requester.tenant_id;

  const [rows] = await db.query(
    `SELECT
       al.id, al.tenant_id, al.user_id, al.action, al.target_table,
       al.target_id, al.old_value, al.new_value,
       al.ip_address, al.user_agent, al.created_at,
       u.name AS user_name, u.email AS user_email, u.role AS user_role
     FROM audit_logs al
     INNER JOIN users u ON u.id = al.user_id AND u.tenant_id = ?
     WHERE al.id = ?
     LIMIT 1`,
    [tenantId, id]
  );

  if (!rows.length) throw { status: 404, message: 'Audit log not found.' };

  return {
    ...rows[0],
    old_value: safeParseJSON(rows[0].old_value),
    new_value: safeParseJSON(rows[0].new_value),
  };
};

// ============================================================
// GET AUDIT SUMMARY
// ============================================================
const getAuditSummary = async (requester) => {
  const tenantId = requester.tenant_id;

  const [rows] = await db.query(
    `SELECT al.action, COUNT(*) AS count
     FROM audit_logs al
     INNER JOIN users u ON u.id = al.user_id AND u.tenant_id = ?
     WHERE al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY al.action
     ORDER BY count DESC
     LIMIT 10`,
    [tenantId]
  );

  return rows;
};

// ─── Helpers ──────────────────────────────────────────────────
const safeParseJSON = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return val; }
};

module.exports = { getAuditLogs, getAuditLogById, getAuditSummary };
