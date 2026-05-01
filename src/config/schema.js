// ============================================================
// TalentOps — Optimize People. Maximize Performance.
// COMPLETE DATABASE SCHEMA (Phase 7 — Multi-Tenant SaaS)
// Run: node src/config/schema.js
// ============================================================

const db = require('./db');

const createTables = async () => {
  const connection = await db.getConnection();

  try {
    console.log('🚀 Starting TalentOps database schema creation...\n');
    console.log('📦 Database: amcgrvfy_TalentOpsDev');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await connection.beginTransaction();

    // ────────────────────────────────────────────────────────
    // PART 1 — SAAS PLATFORM TABLES
    // ────────────────────────────────────────────────────────
    console.log('📌 Creating SaaS Platform Tables...\n');

    // ──────────────────────────────────────────────────────
    // TABLE: super_admins
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name                VARCHAR(150)  NOT NULL,
        email               VARCHAR(255)  NOT NULL UNIQUE,
        password            VARCHAR(255)  NOT NULL,
        status              ENUM('active','inactive') NOT NULL DEFAULT 'active',
        reset_token         VARCHAR(255)  NULL DEFAULT NULL,
        reset_token_expiry  DATETIME      NULL DEFAULT NULL,
        last_login_at       DATETIME      NULL DEFAULT NULL,
        created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: super_admins');

    // ──────────────────────────────────────────────────────
    // TABLE: plans
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name                VARCHAR(100)  NOT NULL,
        slug                VARCHAR(100)  NOT NULL UNIQUE,
        description         TEXT          NULL,
        price_monthly_inr   DECIMAL(10,2) NOT NULL DEFAULT 0,
        price_annual_inr    DECIMAL(10,2) NOT NULL DEFAULT 0,
        price_monthly_usd   DECIMAL(10,2) NOT NULL DEFAULT 0,
        price_annual_usd    DECIMAL(10,2) NOT NULL DEFAULT 0,
        max_users           INT UNSIGNED  NOT NULL DEFAULT 20,
        max_tasks           INT UNSIGNED  NOT NULL DEFAULT 500,
        max_storage_gb      INT UNSIGNED  NOT NULL DEFAULT 5,
        features            JSON          NULL,
        is_active           TINYINT(1)    NOT NULL DEFAULT 1,
        is_popular          TINYINT(1)    NOT NULL DEFAULT 0,
        sort_order          INT UNSIGNED  NOT NULL DEFAULT 0,
        created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: plans');

    // ──────────────────────────────────────────────────────
    // TABLE: tenants
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(255)  NOT NULL,
        slug          VARCHAR(100)  NOT NULL UNIQUE,
        email         VARCHAR(255)  NOT NULL UNIQUE,
        phone         VARCHAR(30)   NULL DEFAULT NULL,
        logo          VARCHAR(255)  NULL DEFAULT NULL,
        address       TEXT          NULL DEFAULT NULL,
        industry      VARCHAR(100)  NULL DEFAULT NULL,
        size          ENUM('1-10','11-50','51-200','201-500','500+') NULL DEFAULT NULL,
        status        ENUM('trial','active','suspended','cancelled') NOT NULL DEFAULT 'trial',
        trial_ends_at DATETIME      NULL DEFAULT NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: tenants');

    // ──────────────────────────────────────────────────────
    // TABLE: subscriptions
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tenant_id                INT UNSIGNED  NOT NULL,
        plan_id                  INT UNSIGNED  NOT NULL,
        billing_cycle            ENUM('monthly','annual') NOT NULL DEFAULT 'monthly',
        currency                 ENUM('INR','USD')        NOT NULL DEFAULT 'INR',
        amount                   DECIMAL(10,2) NOT NULL,
        discount_amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
        status                   ENUM('active','past_due','cancelled','expired','trialing') NOT NULL DEFAULT 'trialing',
        gateway                  ENUM('razorpay','stripe','manual') NOT NULL DEFAULT 'razorpay',
        gateway_subscription_id  VARCHAR(255) NULL DEFAULT NULL,
        gateway_customer_id      VARCHAR(255) NULL DEFAULT NULL,
        starts_at                DATETIME      NOT NULL,
        ends_at                  DATETIME      NULL DEFAULT NULL,
        next_billing_at          DATETIME      NULL DEFAULT NULL,
        cancelled_at             DATETIME      NULL DEFAULT NULL,
        cancellation_reason      TEXT          NULL DEFAULT NULL,
        promo_code_id            INT UNSIGNED  NULL DEFAULT NULL,
        created_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_sub_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_sub_plan   FOREIGN KEY (plan_id)   REFERENCES plans(id)   ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: subscriptions');

    // ──────────────────────────────────────────────────────
    // TABLE: payments
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tenant_id             INT UNSIGNED  NOT NULL,
        subscription_id       INT UNSIGNED  NULL DEFAULT NULL,
        gateway               ENUM('razorpay','stripe','manual') NOT NULL,
        gateway_order_id      VARCHAR(255)  NULL DEFAULT NULL,
        gateway_payment_id    VARCHAR(255)  NULL DEFAULT NULL,
        gateway_signature     VARCHAR(500)  NULL DEFAULT NULL,
        amount                DECIMAL(10,2) NOT NULL,
        currency              VARCHAR(10)   NOT NULL DEFAULT 'INR',
        status                ENUM('created','paid','failed','refunded') NOT NULL DEFAULT 'created',
        payment_method        VARCHAR(100)  NULL DEFAULT NULL,
        description           VARCHAR(500)  NULL DEFAULT NULL,
        metadata              JSON          NULL DEFAULT NULL,
        paid_at               DATETIME      NULL DEFAULT NULL,
        created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_pay_tenant FOREIGN KEY (tenant_id)       REFERENCES tenants(id)       ON DELETE CASCADE,
        CONSTRAINT fk_pay_sub    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: payments');

    // ──────────────────────────────────────────────────────
    // TABLE: promo_codes
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        code            VARCHAR(50)   NOT NULL UNIQUE,
        description     VARCHAR(255)  NULL DEFAULT NULL,
        discount_type   ENUM('percent','flat_inr','flat_usd') NOT NULL DEFAULT 'percent',
        discount_value  DECIMAL(10,2) NOT NULL,
        max_uses        INT UNSIGNED  NULL DEFAULT NULL,
        used_count      INT UNSIGNED  NOT NULL DEFAULT 0,
        applies_to      ENUM('all','monthly','annual') NOT NULL DEFAULT 'all',
        plan_ids        JSON          NULL DEFAULT NULL,
        is_active       TINYINT(1)    NOT NULL DEFAULT 1,
        expires_at      DATETIME      NULL DEFAULT NULL,
        created_by      INT UNSIGNED  NOT NULL,
        created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_promo_admin FOREIGN KEY (created_by) REFERENCES super_admins(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: promo_codes');

    // ──────────────────────────────────────────────────────
    // TABLE: promo_code_usages
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS promo_code_usages (
        id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        promo_code_id    INT UNSIGNED  NOT NULL,
        tenant_id        INT UNSIGNED  NOT NULL,
        payment_id       INT UNSIGNED  NULL DEFAULT NULL,
        discount_applied DECIMAL(10,2) NOT NULL DEFAULT 0,
        used_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_usage_promo  FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
        CONSTRAINT fk_usage_tenant FOREIGN KEY (tenant_id)     REFERENCES tenants(id)     ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: promo_code_usages');

    // ──────────────────────────────────────────────────────
    // TABLE: platform_settings
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        setting_key   VARCHAR(100)  NOT NULL UNIQUE,
        setting_value TEXT          NULL,
        setting_type  ENUM('string','boolean','number','json') NOT NULL DEFAULT 'string',
        label         VARCHAR(255)  NULL,
        description   TEXT          NULL,
        group_name    VARCHAR(100)  NOT NULL DEFAULT 'general',
        is_sensitive  TINYINT(1)    NOT NULL DEFAULT 0,
        updated_by    INT UNSIGNED  NULL DEFAULT NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_settings_admin FOREIGN KEY (updated_by) REFERENCES super_admins(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: platform_settings\n');

    // ────────────────────────────────────────────────────────
    // PART 2 — EXISTING APP TABLES (with tenant_id)
    // ────────────────────────────────────────────────────────
    console.log('📌 Creating App Tables (multi-tenant)...\n');

    // ──────────────────────────────────────────────────────
    // TABLE: users
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tenant_id           INT UNSIGNED  NOT NULL,
        name                VARCHAR(150)  NOT NULL,
        email               VARCHAR(255)  NOT NULL,
        password            VARCHAR(255)  NOT NULL,
        role                ENUM('admin','manager','team_leader','recruiter') NOT NULL DEFAULT 'recruiter',
        manager_id          INT UNSIGNED  NULL DEFAULT NULL,
        profile_pic         VARCHAR(255)  NULL DEFAULT NULL,
        status              ENUM('active','inactive') NOT NULL DEFAULT 'active',
        reset_token         VARCHAR(255)  NULL DEFAULT NULL,
        reset_token_expiry  DATETIME      NULL DEFAULT NULL,
        created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_email_tenant (email, tenant_id),
        CONSTRAINT fk_users_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(id)   ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: users');

    // ──────────────────────────────────────────────────────
    // TABLE: tasks
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tenant_id         INT UNSIGNED  NOT NULL,
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
        CONSTRAINT fk_tasks_tenant      FOREIGN KEY (tenant_id)   REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_tasks_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_tasks_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: tasks');

    // ──────────────────────────────────────────────────────
    // TABLE: task_comments
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tenant_id   INT UNSIGNED NOT NULL,
        task_id     INT UNSIGNED NOT NULL,
        user_id     INT UNSIGNED NOT NULL,
        comment     TEXT         NOT NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_comments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_comments_task   FOREIGN KEY (task_id)   REFERENCES tasks(id)   ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_comments_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: task_comments');

    // ──────────────────────────────────────────────────────
    // TABLE: task_files
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_files (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tenant_id     INT UNSIGNED  NOT NULL,
        task_id       INT UNSIGNED  NOT NULL,
        uploaded_by   INT UNSIGNED  NOT NULL,
        original_name VARCHAR(255)  NOT NULL,
        file_name     VARCHAR(255)  NOT NULL,
        file_path     VARCHAR(500)  NOT NULL,
        file_size     INT UNSIGNED  NOT NULL DEFAULT 0,
        mime_type     VARCHAR(100)  NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_files_tenant FOREIGN KEY (tenant_id)   REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_files_task   FOREIGN KEY (task_id)     REFERENCES tasks(id)   ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_files_user   FOREIGN KEY (uploaded_by) REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: task_files');

    // ──────────────────────────────────────────────────────
    // TABLE: notifications
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tenant_id   INT UNSIGNED NOT NULL,
        user_id     INT UNSIGNED NOT NULL,
        title       VARCHAR(255) NOT NULL,
        message     TEXT         NOT NULL,
        type        ENUM('task_assigned','task_updated','task_submitted','task_approved','task_rejected','comment_added','subscription','general') NOT NULL DEFAULT 'general',
        ref_id      INT UNSIGNED NULL DEFAULT NULL,
        is_read     TINYINT(1)   NOT NULL DEFAULT 0,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_notifications_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: notifications');

    // ──────────────────────────────────────────────────────
    // TABLE: audit_logs
    // ──────────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        tenant_id     INT UNSIGNED  NULL DEFAULT NULL,
        user_id       INT UNSIGNED  NOT NULL,
        user_type     ENUM('user','super_admin') NOT NULL DEFAULT 'user',
        action        VARCHAR(100)  NOT NULL,
        target_table  VARCHAR(100)  NOT NULL,
        target_id     INT UNSIGNED  NULL DEFAULT NULL,
        old_value     JSON          NULL,
        new_value     JSON          NULL,
        ip_address    VARCHAR(45)   NULL,
        user_agent    VARCHAR(500)  NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Table created: audit_logs\n');

    // ────────────────────────────────────────────────────────
    // PART 3 — INDEXES
    // ────────────────────────────────────────────────────────
    console.log('📌 Creating Indexes...\n');

    const indexes = [
      // SaaS Platform indexes
      { table: 'tenants',           index: 'idx_tenants_status',        col: 'status'         },
      { table: 'tenants',           index: 'idx_tenants_slug',           col: 'slug'           },
      { table: 'subscriptions',     index: 'idx_subs_tenant',            col: 'tenant_id'      },
      { table: 'subscriptions',     index: 'idx_subs_status',            col: 'status'         },
      { table: 'subscriptions',     index: 'idx_subs_plan',              col: 'plan_id'        },
      { table: 'subscriptions',     index: 'idx_subs_ends_at',           col: 'ends_at'        },
      { table: 'payments',          index: 'idx_payments_tenant',        col: 'tenant_id'      },
      { table: 'payments',          index: 'idx_payments_status',        col: 'status'         },
      { table: 'payments',          index: 'idx_payments_gateway',       col: 'gateway'        },
      { table: 'promo_codes',       index: 'idx_promo_code',             col: 'code'           },
      { table: 'promo_codes',       index: 'idx_promo_active',           col: 'is_active'      },
      { table: 'promo_code_usages', index: 'idx_promo_usage_promo',      col: 'promo_code_id'  },
      { table: 'promo_code_usages', index: 'idx_promo_usage_tenant',     col: 'tenant_id'      },
      { table: 'platform_settings', index: 'idx_platform_settings_key',  col: 'setting_key'    },
      { table: 'platform_settings', index: 'idx_platform_settings_grp',  col: 'group_name'     },
      // App table indexes
      { table: 'users',             index: 'idx_users_tenant',           col: 'tenant_id'      },
      { table: 'users',             index: 'idx_users_manager',          col: 'manager_id'     },
      { table: 'users',             index: 'idx_users_role',             col: 'role'           },
      { table: 'tasks',             index: 'idx_tasks_tenant',           col: 'tenant_id'      },
      { table: 'tasks',             index: 'idx_tasks_assigned_to',      col: 'assigned_to'    },
      { table: 'tasks',             index: 'idx_tasks_assigned_by',      col: 'assigned_by'    },
      { table: 'tasks',             index: 'idx_tasks_status',           col: 'status'         },
      { table: 'tasks',             index: 'idx_tasks_due_date',         col: 'due_date'       },
      { table: 'task_comments',     index: 'idx_comments_tenant',        col: 'tenant_id'      },
      { table: 'task_comments',     index: 'idx_comments_task',          col: 'task_id'        },
      { table: 'task_files',        index: 'idx_files_tenant',           col: 'tenant_id'      },
      { table: 'task_files',        index: 'idx_files_task',             col: 'task_id'        },
      { table: 'notifications',     index: 'idx_notifications_tenant',   col: 'tenant_id'      },
      { table: 'notifications',     index: 'idx_notifications_user',     col: 'user_id'        },
      { table: 'notifications',     index: 'idx_notifications_read',     col: 'is_read'        },
      { table: 'audit_logs',        index: 'idx_audit_tenant',           col: 'tenant_id'      },
      { table: 'audit_logs',        index: 'idx_audit_user',             col: 'user_id'        },
      { table: 'audit_logs',        index: 'idx_audit_table',            col: 'target_table'   },
    ];

    for (const idx of indexes) {
      try {
        await connection.query(
          `CREATE INDEX ${idx.index} ON ${idx.table}(${idx.col})`
        );
        console.log(`  ✅ ${idx.index}`);
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log(`  ⚠️  Already exists: ${idx.index}`);
        } else {
          throw err;
        }
      }
    }

    await connection.commit();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 TalentOps database schema created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Tables created:');
    console.log('   SaaS: super_admins, plans, tenants, subscriptions,');
    console.log('         payments, promo_codes, promo_code_usages, platform_settings');
    console.log('   App:  users, tasks, task_comments, task_files,');
    console.log('         notifications, audit_logs');
    console.log('\n▶️  Next step: node src/config/seed.js');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err) {
    await connection.rollback();
    console.error('\n❌ Schema creation failed:', err.message);
    console.error('   Code:', err.code);
    throw err;
  } finally {
    connection.release();
    process.exit(0);
  }
};

createTables();
