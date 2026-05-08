// ============================================================
// src/modules/reports/report.controller.js
// ============================================================

const reportService = require('./report.service');

// GET /api/reports/overview
const getOverviewStats = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const data = await reportService.getOverviewStats({ requester: req.user, dateFrom, dateTo });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/reports/trend
const getTaskTrend = async (req, res) => {
  try {
    const { days, dateFrom, dateTo } = req.query;
    const data = await reportService.getTaskTrend({ requester: req.user, days, dateFrom, dateTo });
    res.json({ success: true, trend: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/reports/performance
const getTeamPerformance = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const data = await reportService.getTeamPerformance({ requester: req.user, dateFrom, dateTo });
    res.json({ success: true, performance: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/reports/priority
const getPriorityBreakdown = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const data = await reportService.getPriorityBreakdown({ requester: req.user, dateFrom, dateTo });
    res.json({ success: true, breakdown: data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/reports/search
const globalSearch = async (req, res) => {
  try {
    const { q, limit } = req.query;
    const data = await reportService.globalSearch({ requester: req.user, query: q, limit });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getOverviewStats,
  getTaskTrend,
  getTeamPerformance,
  getPriorityBreakdown,
  globalSearch,
};
