// ============================================================
// src/modules/reports/report.service.js
// ============================================================

const db = require('../../config/db');

// ─── Build team scope (user IDs the requester can see) ───────
const buildTeamScope = async (requester) => {
  const tid = requester.tenant_id;

  if (requester.role === 'admin') return { userIds: null, tid };

  let userIds = [requester.id];

  if (requester.role === 'manager') {
    const [tls] = await db.query(
      `SELECT id FROM users WHERE manager_id = ? AND role = 'team_leader' AND tenant_id = ?`,
      [requester.id, tid]
    );
    const tlIds = tls.map((r) => r.id);
    if (tlIds.length) {
      const [recs] = await db.query(
        `SELECT id FROM users WHERE manager_id IN (${tlIds.join(',')}) AND role = 'recruiter' AND tenant_id = ?`,
        [tid]
      );
      userIds = [...userIds, ...tlIds, ...recs.map((r) => r.id)];
    }
  } else if (requester.role === 'team_leader') {
    const [recs] = await db.query(
      `SELECT id FROM users WHERE manager_id = ? AND role = 'recruiter' AND tenant_id = ?`,
      [requester.id, tid]
    );
    userIds = [...userIds, ...recs.map((r) => r.id)];
  }

  return { userIds, tid };
};

// ─── Build WHERE for task queries ─────────────────────────────
const buildTaskWhere = (userIds, tid, dateFrom, dateTo) => {
  const conditions = ['t.tenant_id = ?'];
  const params     = [tid];

  if (userIds) {
    conditions.push(
      `(t.assigned_to IN (${userIds.join(',')}) OR t.assigned_by IN (${userIds.join(',')}))`
    );
  }
  if (dateFrom) {
    conditions.push('t.created_at >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    conditions.push('t.created_at <= ?');
    params.push(end.toISOString().slice(0, 19).replace('T', ' '));
  }

  return { where: 'WHERE ' + conditions.join(' AND '), params };
};

// ============================================================
// OVERVIEW STATS
// ============================================================
const getOverviewStats = async ({ requester, dateFrom, dateTo }) => {
  const { userIds, tid }  = await buildTeamScope(requester);
  const { where, params } = buildTaskWhere(userIds, tid, dateFrom, dateTo);

  // Use t.status to avoid "Column 'status' is ambiguous"
  const [statusRows] = await db.query(
    `SELECT t.status, COUNT(*) AS count FROM tasks t ${where} GROUP BY t.status`,
    params
  );

  const overdueWhere = where +
    ` AND t.due_date < CURDATE() AND t.status NOT IN ('approved','rejected')`;
  const [overdueRows] = await db.query(
    `SELECT COUNT(*) AS count FROM tasks t ${overdueWhere}`, params
  );

  let userCountQ = `SELECT COUNT(*) AS total,
    SUM(CASE WHEN role = 'manager'     THEN 1 ELSE 0 END) AS managers,
    SUM(CASE WHEN role = 'team_leader' THEN 1 ELSE 0 END) AS team_leaders,
    SUM(CASE WHEN role = 'recruiter'   THEN 1 ELSE 0 END) AS recruiters
    FROM users WHERE status = 'active' AND tenant_id = ?`;
  const userCountParams = [tid];
  if (userIds) userCountQ += ` AND id IN (${userIds.join(',')})`;
  const [userCountRow] = await db.query(userCountQ, userCountParams);

  const statusMap = { assigned: 0, in_progress: 0, submitted: 0, approved: 0, rejected: 0 };
  statusRows.forEach((r) => { statusMap[r.status] = parseInt(r.count); });
  const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

  const priorityMap = { low: 0, medium: 0, high: 0, urgent: 0 };

  // Priority breakdown for the overview
  const [priorityRows] = await db.query(
    `SELECT t.priority, COUNT(*) AS count FROM tasks t ${where} GROUP BY t.priority`,
    params
  );
  priorityRows.forEach((r) => { priorityMap[r.priority] = parseInt(r.count); });

  return {
    tasks:          { ...statusMap, total, overdue: parseInt(overdueRows[0]?.count || 0) },
    priorities:     priorityMap,
    users:          userCountRow[0],
    completionRate: total > 0 ? Math.round((statusMap.approved / total) * 100) : 0,
  };
};

// ============================================================
// TASK TREND (last N days)
// ============================================================
const getTaskTrend = async ({ requester, days = 14, dateFrom, dateTo }) => {
  const { userIds, tid } = await buildTeamScope(requester);

  const endDate   = dateTo   ? new Date(dateTo)  : new Date();
  const startDate = dateFrom ? new Date(dateFrom) : new Date();
  if (!dateFrom) startDate.setDate(endDate.getDate() - (parseInt(days) - 1));

  const dateList = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    dateList.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const userFilter = userIds
    ? `AND (t.assigned_to IN (${userIds.join(',')}) OR t.assigned_by IN (${userIds.join(',')}))`
    : '';

  const [rows] = await db.query(
    `SELECT DATE(t.created_at) AS date, COUNT(*) AS created,
            SUM(CASE WHEN t.status = 'approved' THEN 1 ELSE 0 END) AS completed
     FROM tasks t
     WHERE t.tenant_id = ? AND t.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
     ${userFilter}
     GROUP BY DATE(t.created_at)
     ORDER BY date ASC`,
    [tid, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
  );

  const rowMap = {};
  rows.forEach((r) => { rowMap[r.date] = r; });

  return dateList.map((date) => ({
    date,
    label:     new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    created:   parseInt(rowMap[date]?.created   || 0),
    completed: parseInt(rowMap[date]?.completed || 0),
  }));
};

// ============================================================
// TEAM PERFORMANCE
// ============================================================
const getTeamPerformance = async ({ requester, dateFrom, dateTo }) => {
  const { userIds, tid }  = await buildTeamScope(requester);
  const { where, params } = buildTaskWhere(userIds, tid, dateFrom, dateTo);

  // Rebuild WHERE without tenant (already in user join)
  const taskConditions = [];
  const taskParams     = [];
  if (userIds) {
    taskConditions.push(
      `(t.assigned_to IN (${userIds.join(',')}) OR t.assigned_by IN (${userIds.join(',')}))`
    );
  }
  if (dateFrom) { taskConditions.push('t.created_at >= ?'); taskParams.push(dateFrom); }
  if (dateTo) {
    const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
    taskConditions.push('t.created_at <= ?');
    taskParams.push(end.toISOString().slice(0, 19).replace('T', ' '));
  }
  const joinFilter = taskConditions.length ? 'AND ' + taskConditions.join(' AND ') : '';

  const [rows] = await db.query(
    `SELECT
       u.id, u.name, u.role, u.profile_pic,
       COUNT(t.id)                                                              AS total,
       SUM(CASE WHEN t.status = 'approved'    THEN 1 ELSE 0 END)               AS approved,
       SUM(CASE WHEN t.status = 'submitted'   THEN 1 ELSE 0 END)               AS submitted,
       SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END)               AS in_progress,
       SUM(CASE WHEN t.status = 'rejected'    THEN 1 ELSE 0 END)               AS rejected,
       SUM(CASE WHEN t.status = 'assigned'    THEN 1 ELSE 0 END)               AS assigned,
       SUM(CASE WHEN t.due_date < CURDATE()
            AND t.status NOT IN ('approved','rejected') THEN 1 ELSE 0 END)     AS overdue,
       AVG(CASE WHEN t.status = 'approved' AND t.submitted_at IS NOT NULL
            THEN TIMESTAMPDIFF(HOUR, t.created_at, t.submitted_at) END)        AS avg_completion_hours
     FROM users u
     LEFT JOIN tasks t ON t.assigned_to = u.id AND t.tenant_id = ? ${joinFilter}
     WHERE u.status = 'active' AND u.role = 'recruiter' AND u.tenant_id = ?
     ${userIds ? `AND u.id IN (${userIds.join(',')})` : ''}
     GROUP BY u.id, u.name, u.role, u.profile_pic
     HAVING total > 0
     ORDER BY approved DESC, total DESC
     LIMIT 20`,
    [tid, ...taskParams, tid]
  );

  return rows.map((r) => ({
    ...r,
    total:                parseInt(r.total      || 0),
    approved:             parseInt(r.approved   || 0),
    submitted:            parseInt(r.submitted  || 0),
    in_progress:          parseInt(r.in_progress || 0),
    rejected:             parseInt(r.rejected   || 0),
    assigned:             parseInt(r.assigned   || 0),
    overdue:              parseInt(r.overdue    || 0),
    completionRate:       r.total > 0 ? Math.round((r.approved / r.total) * 100) : 0,
    avg_completion_hours: r.avg_completion_hours ? Math.round(r.avg_completion_hours) : null,
  }));
};

// ============================================================
// PRIORITY BREAKDOWN
// ============================================================
const getPriorityBreakdown = async ({ requester, dateFrom, dateTo }) => {
  const { userIds, tid }  = await buildTeamScope(requester);
  const { where, params } = buildTaskWhere(userIds, tid, dateFrom, dateTo);

  const [rows] = await db.query(
    `SELECT t.priority, t.status, COUNT(*) AS count
     FROM tasks t ${where}
     GROUP BY t.priority, t.status
     ORDER BY FIELD(t.priority,'urgent','high','medium','low'), t.status`,
    params
  );

  const result = { urgent: {}, high: {}, medium: {}, low: {} };
  rows.forEach((r) => {
    if (!result[r.priority]) result[r.priority] = {};
    result[r.priority][r.status] = parseInt(r.count);
  });

  return Object.entries(result).map(([priority, statuses]) => ({
    priority,
    ...statuses,
    total: Object.values(statuses).reduce((a, b) => a + parseInt(b), 0),
  }));
};

// ============================================================
// GLOBAL SEARCH
// ============================================================
const globalSearch = async ({ requester, query, limit = 5 }) => {
  if (!query || query.trim().length < 2) {
    throw { status: 400, message: 'Search query must be at least 2 characters.' };
  }

  const q           = `%${query.trim()}%`;
  const tid         = requester.tenant_id;
  const { userIds } = await buildTeamScope(requester);
  const taskFilter  = userIds
    ? `AND (t.assigned_to IN (${userIds.join(',')}) OR t.assigned_by IN (${userIds.join(',')}))`
    : '';
  const userFilter = userIds ? `AND u.id IN (${userIds.join(',')})` : '';

  const [tasks] = await db.query(
    `SELECT t.id, t.title, t.status, t.priority, t.due_date, u.name AS assignee_name
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.tenant_id = ? AND (t.title LIKE ? OR t.description LIKE ?) ${taskFilter}
     ORDER BY t.created_at DESC LIMIT ?`,
    [tid, q, q, parseInt(limit)]
  );

  const [userRows] = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.status
     FROM users u
     WHERE u.tenant_id = ? AND (u.name LIKE ? OR u.email LIKE ?) ${userFilter}
     ORDER BY u.name LIMIT ?`,
    [tid, q, q, parseInt(limit)]
  );

  return {
    tasks:  tasks.map((t)   => ({ ...t, type: 'task', url: `/tasks/${t.id}` })),
    users:  userRows.map((u) => ({ ...u, type: 'user', url: `/users` })),
  };
};

module.exports = {
  getOverviewStats,
  getTaskTrend,
  getTeamPerformance,
  getPriorityBreakdown,
  globalSearch,
};
