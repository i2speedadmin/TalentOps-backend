// ============================================================
// src/config/db.js - MySQL Connection Pool (cPanel / phpMyAdmin)
// ============================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'task_mgmt_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
  charset:            'utf8mb4',
  // Cast BigInt COUNT(*) results to Number automatically
  typeCast: (field, next) => {
    if (field.type === 'LONGLONG' || field.type === 'LONG') {
      return parseInt(field.string()) || 0;
    }
    return next();
  },
});

// Test connection on startup
pool.getConnection()
  .then(connection => {
    // console.log('✅ MySQL connected successfully');    
    console.log(`\n📦 ✅ MySQL connected successfully to  ${process.env.DB_HOST} ${process.env.DB_NAME} !\n`);
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;
