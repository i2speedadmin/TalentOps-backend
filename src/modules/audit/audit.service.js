// ============================================================
// src/modules/audit/audit.service.js
// ============================================================

const db = require('../../config/db');

// ─── Role level check ─────────────────────────────────────────
const ROLE_LEVEL = { admin: 4, manager: 3, team_leader: 2, recruiter: 1 };

// ============================================================
// GET AUDIT LOGS
// ============================================================
const getAuditLogs = async ({
  requester,
  page      = 1,
  limit     = 20,
  search,
  action,
  targetTable,
  userId,
  dateFrom,
  dateTo,
}) => {
  // Only admin and manager can view audit logs
  if (ROLE_LEVEL[requester.role] < ROLE_LEVEL['manager']) {
    throw { status: 403, message: 'Access denied. Managers and above only.' };
  }

  const offset  = (page - 1) * limit;
  const filters = [];
  const params  = [];

  // Non-admins only see logs for users in their scope
  if (requester.role === 'manager') {
    filters.push(`(
      a.user_id IN (
        SELECT id FROM users
        WHERE manager_id = ${requester.id}
        OR manager_id IN (
          SELECT id FROM users WHERE manager_id = ${requester.id} AND role = 'team_leader'
        )
      )
      OR a.user_id = ${requester.id}
    )`);
  }

  if (search) {
    filters.push('(u.name LIKE ? OR a.action LIKE ? OR a.target_table LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (action)      { filters.push('a.action = ?');        params.push(action);      }
  if (targetTable) { filters.push('a.target_table = ?');  params.push(targetTable); }
  if (userId)      { filters.push('a.user_id = ?');       params.push(userId);      }
  if (dateFrom)    { filters.push('a.created_at >= ?');   params.push(dateFrom);    }
  if (dateTo)      {
    // Include full day
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    filters.push('a.created_at <= ?');
    params.push(endOfDay.toISOString().slice(0, 19).replace('T', ' '));
  }

  const whereClause = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const [rows] = await db.query(
    `SELECT
       a.id, a.action, a.target_table, a.target_id,
       a.old_value, a.new_value, a.ip_address, a.user_agent,
       a.created_at,
       u.id   AS actor_id,   u.name  AS actor_name,
       u.role AS actor_role, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), parseInt(offset)]
  );

  const [count] = await db.query(
    `SELECT COUNT(*) AS total
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereClause}`,
    params
  );

  return {
    logs: rows.map((r) => ({
      ...r,
      old_value: r.old_value
        ? (typeof r.old_value === 'string' ? JSON.parse(r.old_value) : r.old_value)
        : null,
      new_value: r.new_value
        ? (typeof r.new_value === 'string' ? JSON.parse(r.new_value) : r.new_value)
        : null,
    })),
    pagination: {
      total:      parseInt(count[0].total) || 0,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil((parseInt(count[0].total) || 0) / limit),
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

module.exports = { getAuditLogs, getDistinctActions, getDistinctTables };
