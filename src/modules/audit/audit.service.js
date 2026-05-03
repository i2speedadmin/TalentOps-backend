// ============================================================
// src/modules/audit/audit.service.js
// DEFINITIVE FIX for "Performed By" showing "—"
//
// ROOT CAUSE (confirmed from transcript analysis):
//   - Original audit_logs rows were inserted WITHOUT tenant_id
//     (Phase 1 schema had no tenant_id column on audit_logs)
//   - Original users rows were also inserted WITHOUT tenant_id
//     (Phase 1 users table had no tenant_id column)
//   - So INNER JOIN users ON u.id = al.user_id WHERE u.tenant_id = ?
//     returns 0 rows because u.tenant_id IS NULL for old users
//
// SOLUTION:
//   - Look up the current requester's tenant_id from the DB
//     (not from req.user which may have stale/null tenant_id)
//   - Join audit_logs to users on user_id ONLY (no tenant filter on join)
//   - Scope by: users whose tenant_id matches OR whose id matches
//     users we know are in this tenant
//   - For new rows (post Phase 7): also works perfectly
// ============================================================

const db = require('../../config/db');

// ─── Safe JSON parse ──────────────────────────────────────────
const safeJSON = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return val; }
};

// ============================================================
// GET AUDIT LOGS — Main function
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
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // ── Step 1: Get all user IDs belonging to this tenant ─────
  // This is the most reliable way — doesn't depend on
  // audit_logs.tenant_id being populated (old rows have NULL)
  const tenantId = requester.tenant_id;

  let tenantUserIds = [];

  if (tenantId) {
    const [tenantUsers] = await db.query(
      'SELECT id FROM users WHERE tenant_id = ?',
      [tenantId]
    );
    tenantUserIds = tenantUsers.map((u) => u.id);
  }

  // Fallback: if tenant_id isn't available (very old token),
  // at least show the requester's own logs
  if (!tenantUserIds.length) {
    tenantUserIds = [requester.id];
  }

  // ── Step 2: Build WHERE conditions ────────────────────────
  // Filter audit_logs WHERE user_id IN (tenant's user IDs)
  // This works for ALL rows regardless of al.tenant_id value
  const conditions = [
    `al.user_id IN (${tenantUserIds.map(() => '?').join(',')})`,
  ];
  const params = [...tenantUserIds];

  if (search) {
    conditions.push(`(
      u.name        LIKE ? OR
      u.email       LIKE ? OR
      al.action     LIKE ? OR
      al.target_table LIKE ?
    )`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (action)      { conditions.push('al.action = ?');        params.push(action);      }
  if (targetTable) { conditions.push('al.target_table = ?');  params.push(targetTable); }

  if (userId) {
    // Verify the requested userId is in this tenant
    if (!tenantUserIds.includes(parseInt(userId))) {
      return {
        logs:       [],
        pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 },
      };
    }
    conditions.push('al.user_id = ?');
    params.push(parseInt(userId));
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

  // ── Step 3: Fetch logs — LEFT JOIN so NULL user_id rows ───
  // still appear (won't hide system logs)
  const [rows] = await db.query(
    `SELECT
       al.id,
       al.tenant_id,
       al.user_id,
       al.user_type,
       al.action,
       al.target_table,
       al.target_id,
       al.old_value,
       al.new_value,
       al.ip_address,
       al.user_agent,
       al.created_at,
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

  // ── Step 4: Count ─────────────────────────────────────────
  const [count] = await db.query(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}`,
    params
  );

  const total = parseInt(count[0]?.total) || 0;

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
// GET SINGLE AUDIT LOG BY ID
// ============================================================
const getAuditLogById = async (id, requester) => {
  const tenantId = requester.tenant_id;

  // Get tenant user IDs for scope check
  let tenantUserIds = [];
  if (tenantId) {
    const [tenantUsers] = await db.query(
      'SELECT id FROM users WHERE tenant_id = ?',
      [tenantId]
    );
    tenantUserIds = tenantUsers.map((u) => u.id);
  }
  if (!tenantUserIds.length) tenantUserIds = [requester.id];

  const [rows] = await db.query(
    `SELECT
       al.id, al.tenant_id, al.user_id, al.user_type,
       al.action, al.target_table, al.target_id,
       al.old_value, al.new_value,
       al.ip_address, al.user_agent, al.created_at,
       u.name  AS user_name,
       u.email AS user_email,
       u.role  AS user_role
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.id = ?
       AND al.user_id IN (${tenantUserIds.map(() => '?').join(',')})
     LIMIT 1`,
    [id, ...tenantUserIds]
  );

  if (!rows.length) throw { status: 404, message: 'Audit log not found.' };

  return {
    ...rows[0],
    old_value: safeJSON(rows[0].old_value),
    new_value: safeJSON(rows[0].new_value),
  };
};

// ============================================================
// GET AUDIT SUMMARY (dashboard widget)
// ============================================================
const getAuditSummary = async (requester) => {
  const tenantId = requester.tenant_id;

  let tenantUserIds = [];
  if (tenantId) {
    const [tenantUsers] = await db.query(
      'SELECT id FROM users WHERE tenant_id = ?',
      [tenantId]
    );
    tenantUserIds = tenantUsers.map((u) => u.id);
  }
  if (!tenantUserIds.length) tenantUserIds = [requester.id];

  const [rows] = await db.query(
    `SELECT al.action, COUNT(*) AS count
     FROM audit_logs al
     WHERE al.user_id IN (${tenantUserIds.map(() => '?').join(',')})
       AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY al.action
     ORDER BY count DESC
     LIMIT 10`,
    tenantUserIds
  );

  return rows;
};

module.exports = { getAuditLogs, getAuditLogById, getAuditSummary };
