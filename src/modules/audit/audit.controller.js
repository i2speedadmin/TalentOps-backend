// ============================================================
// src/modules/audit/audit.controller.js
// ============================================================

const auditService = require('./audit.service');

// GET /api/audit
const getAuditLogs = async (req, res) => {
  try {
    const { page, limit, search, action, targetTable, userId, dateFrom, dateTo } = req.query;
    const result = await auditService.getAuditLogs({
      requester: req.user,
      page, limit, search, action, targetTable, userId, dateFrom, dateTo,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/audit/meta
const getAuditMeta = async (req, res) => {
  try {
    const [actions, tables] = await Promise.all([
      auditService.getDistinctActions(),
      auditService.getDistinctTables(),
    ]);
    res.json({ success: true, actions, tables });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAuditLogs, getAuditMeta };
