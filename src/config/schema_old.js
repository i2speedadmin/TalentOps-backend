// ============================================================
// TalentOps - Optimize People. Maximize Performance.
// WORK & TASK MANAGEMENT SYSTEM - DATABASE SCHEMA
// Run: node src/config/schema.js
// ============================================================

const db = require('./db');

const createTables = async () => {
  const connection = await db.getConnection();

  try {
    console.log('🚀 Starting database schema creation...\n');

    await connection.beginTransaction();

    // --------------------------------------------------------
    // TABLE: users
    // --------------------------------------------------------
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name                VARCHAR(150)  NOT NULL,
        email               VARCHAR(255)  NOT NULL UNIQUE,
        password            VARCHAR(255)  NOT NULL,
        role                ENUM('admin','manager','team_leader','recruiter') NOT NULL DEFAULT 'recruiter',
        manager_id          INT UNSIGNED  NULL DEFAULT NULL,
        profile_pic         VARCHAR(255)  NULL DEFAULT NULL,
        status              ENUM('active','inactive') NOT NULL DEFAULT 'active',
        reset_token         VARCHAR(255)  NULL DEFAULT NULL,
        reset_token_expiry  DATETIME      NULL DEFAULT NULL,
        created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_users_manager
          FOREIGN KEY (manager_id) REFERENCES users(id)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: users');

    // --------------------------------------------------------
    // TABLE: tasks
    // --------------------------------------------------------
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        title             VARCHAR(255)  NOT NULL,
        description       TEXT          NULL,
        assigned_to       INT UNSIGNED  NOT NULL,
        assigned_by       INT UNSIGNED  NOT NULL,
        status            ENUM('assigned','in_progress','submitted','approved','rejected') NOT NULL DEFAULT 'assigned',
        priority          ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
        due_date          DATE          NULL,
        submitted_at      DATETIME      NULL DEFAULT NULL,
        approved_at       DATETIME      NULL DEFAULT NULL,
        rejection_reason  TEXT          NULL,
        created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_tasks_assigned_to
          FOREIGN KEY (assigned_to) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_tasks_assigned_by
          FOREIGN KEY (assigned_by) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: tasks');

    // --------------------------------------------------------
    // TABLE: task_comments
    // --------------------------------------------------------
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        task_id     INT UNSIGNED NOT NULL,
        user_id     INT UNSIGNED NOT NULL,
        comment     TEXT         NOT NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_comments_task
          FOREIGN KEY (task_id) REFERENCES tasks(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_comments_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: task_comments');

    // --------------------------------------------------------
    // TABLE: task_files
    // --------------------------------------------------------
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_files (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        task_id       INT UNSIGNED  NOT NULL,
        uploaded_by   INT UNSIGNED  NOT NULL,
        original_name VARCHAR(255)  NOT NULL,
        file_name     VARCHAR(255)  NOT NULL,
        file_path     VARCHAR(500)  NOT NULL,
        file_size     INT UNSIGNED  NOT NULL DEFAULT 0,
        mime_type     VARCHAR(100)  NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_files_task
          FOREIGN KEY (task_id) REFERENCES tasks(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_files_user
          FOREIGN KEY (uploaded_by) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: task_files');

    // --------------------------------------------------------
    // TABLE: notifications
    // --------------------------------------------------------
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id     INT UNSIGNED NOT NULL,
        title       VARCHAR(255) NOT NULL,
        message     TEXT         NOT NULL,
        type        ENUM('task_assigned','task_updated','task_submitted','task_approved','task_rejected','comment_added','general') NOT NULL DEFAULT 'general',
        ref_id      INT UNSIGNED NULL DEFAULT NULL,
        is_read     TINYINT(1)   NOT NULL DEFAULT 0,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notifications_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: notifications');

    // --------------------------------------------------------
    // TABLE: audit_logs
    // --------------------------------------------------------
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id       INT UNSIGNED  NOT NULL,
        action        VARCHAR(100)  NOT NULL,
        target_table  VARCHAR(100)  NOT NULL,
        target_id     INT UNSIGNED  NULL DEFAULT NULL,
        old_value     JSON          NULL,
        new_value     JSON          NULL,
        ip_address    VARCHAR(45)   NULL,
        user_agent    VARCHAR(500)  NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_audit_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: audit_logs');

    // --------------------------------------------------------
    // INDEXES
    // --------------------------------------------------------
    const indexes = [
      { table: 'tasks',         index: 'idx_tasks_assigned_to',  col: 'assigned_to'  },
      { table: 'tasks',         index: 'idx_tasks_assigned_by',  col: 'assigned_by'  },
      { table: 'tasks',         index: 'idx_tasks_status',       col: 'status'        },
      { table: 'tasks',         index: 'idx_tasks_due_date',     col: 'due_date'      },
      { table: 'notifications', index: 'idx_notifications_user', col: 'user_id'       },
      { table: 'notifications', index: 'idx_notifications_read', col: 'is_read'       },
      { table: 'audit_logs',    index: 'idx_audit_user',         col: 'user_id'       },
      { table: 'audit_logs',    index: 'idx_audit_table',        col: 'target_table'  },
      { table: 'task_comments', index: 'idx_comments_task',      col: 'task_id'       },
      { table: 'task_files',    index: 'idx_files_task',         col: 'task_id'       },
      { table: 'users',         index: 'idx_users_manager',      col: 'manager_id'    },
      { table: 'users',         index: 'idx_users_role',         col: 'role'          },
    ];

    for (const idx of indexes) {
      try {
        await connection.query(
          `CREATE INDEX ${idx.index} ON ${idx.table}(${idx.col})`
        );
        console.log(`✅ Index created: ${idx.index}`);
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log(`⚠️  Index already exists: ${idx.index}`);
        } else {
          throw err;
        }
      }
    }

    await connection.commit();
    console.log('\n🎉 Database schema created successfully!');
  } catch (err) {
    await connection.rollback();
    console.error('❌ Schema creation failed:', err.message);
    throw err;
  } finally {
    connection.release();
    process.exit(0);
  }
};

createTables();
