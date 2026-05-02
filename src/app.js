// ============================================================
// src/app.js - TalentOps Express App (Phase 7 - Multi-Tenant)
// ============================================================

const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

require('./config/db'); // triggers connection test

const app = express();

// ─── CORS ────────────────────────────────────────────────────
app.use(cors({
  origin:      [
    process.env.CLIENT_URL      || 'http://localhost:5173',
    process.env.SUPERADMIN_URL  || 'http://localhost:5174',
  ],
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsers ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Static Files (Uploads) ───────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Static public files (status page) ───────────────────────
app.use('/public', express.static(path.join(__dirname, 'public')));

// ─── Status Page (HTML) ───────────────────────────────────────
app.get('/status', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'status.html'));
});

// ─── Health Check (JSON) ──────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success:     true,
    app:         'TalentOps API',
    tagline:     'Optimize People. Maximize Performance.',
    version:     '7.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp:   new Date().toISOString(),
    uptime:      process.uptime(),
    memory:      {
      used:  Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
    },
  });
});

// ─── PUBLIC Routes ────────────────────────────────────────────
// Signup + payment flow (no auth required)
app.use('/api/signup',   require('./modules/subscriptions/signup.routes'));
// Plans (public GET)
app.use('/api/plans',    require('./modules/plans/plan.routes'));
// Promo codes (public validate)
app.use('/api/promos',   require('./modules/promoCodes/promoCode.routes'));
// Gateway settings (public — for checkout page)
app.use('/api/settings', require('./modules/platformSettings/settings.routes'));

// ─── Company Auth Routes ──────────────────────────────────────
app.use('/api/auth',  require('./modules/auth/auth.routes'));

// ─── Company App Routes (require auth + tenant middleware) ────
app.use('/api/users',         require('./modules/users/user.routes'));
app.use('/api/tasks',         require('./modules/tasks/task.routes'));
app.use('/api/tasks/:taskId/comments', require('./modules/comments/comment.routes'));
app.use('/api/tasks/:taskId/files',    require('./modules/files/file.routes'));
app.use('/api/comments', require('./modules/comments/comment.standalone.routes'));
app.use('/api/files',    require('./modules/files/file.routes').standalone);
app.use('/api/notifications', require('./modules/notifications/notification.routes'));
app.use('/api/audit',         require('./modules/audit/audit.routes'));
app.use('/api/reports',       require('./modules/reports/report.routes'));

// ─── Super Admin Routes ───────────────────────────────────────
app.use('/api/superadmin',    require('./modules/superadmin/superadmin.routes'));
app.use('/api/superadmin/tenants', require('./modules/tenants/tenant.routes'));

// ─── 404 Handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 TalentOps API running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base:    http://localhost:${PORT}/api`);
  console.log(`❤️  Health:     http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
