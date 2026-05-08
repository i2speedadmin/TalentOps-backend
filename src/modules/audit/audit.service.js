// ============================================================
// src/modules/audit/audit.service.js
// FIXED: added getDistinctActions + getDistinctTables
// All queries scoped to tenant via user_id IN (tenant users)
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

  // Get all user IDs in this tenant for scoping
  const [tenantUsers] = await db.query(
    'SELECT id FROM users WHERE tenant_id = ?',
    [tenantId]
  );
  const tenantUserIds = tenantUsers.map((u) => u.id);
  const scopeIds      = tenantUserIds.length ? tenantUserIds : [requester.id];
  const idList        = scopeIds.join(',');

  const conditions = [`al.user_id IN (${idList})`];
  const params     = [];

  if (search) {
    conditions.push(`(u.name LIKE ? OR u.email LIKE ? OR al.action LIKE ? OR al.target_table LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (action)      { conditions.push('al.action = ?');       params.push(action);      }
  if (targetTable) { conditions.push('al.target_table = ?'); params.push(targetTable); }
  if (userId) {
    if (!scopeIds.includes(parseInt(userId))) {
      return { logs: [], pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 } };
    }
    conditions.push('al.user_id = ?');
    params.push(parseInt(userId));
  }
  if (dateFrom) { conditions.push('al.created_at >= ?'); params.push(dateFrom); }
  if (dateTo) {
    const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
    conditions.push('al.created_at <= ?');
    params.push(end.toISOString().slice(0, 19).replace('T', ' '));
  }

  const where = 'WHERE ' + conditions.join(' AND ');

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
     LEFT JOIN users u ON u.id = al.user_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  const [count] = await db.query(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}`,
    params
  );

  const total = parseInt(count[0].total) || 0;

  return {
    logs: rows.map((row) => ({
      ...row,
      old_value: safeJSON(row.old_value),
      new_value: safeJSON(row.new_value),
    })),
    pagination: {
      total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

// ============================================================
// GET DISTINCT ACTIONS (for filter dropdown)
// ============================================================
const getDistinctActions = async () => {
  const [rows] = await db.query(
    'SELECT DISTINCT action FROM audit_logs ORDER BY action ASC'
  );
  return rows.map((r) => r.action);
};

// ============================================================
// GET DISTINCT TARGET TABLES (for filter dropdown)
// ============================================================
const getDistinctTables = async () => {
  const [rows] = await db.query(
    'SELECT DISTINCT target_table FROM audit_logs ORDER BY target_table ASC'
  );
  return rows.map((r) => r.target_table);
};

// ─── Helper ───────────────────────────────────────────────────
const safeJSON = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return val; }
};

module.exports = { getAuditLogs, getDistinctActions, getDistinctTables };
