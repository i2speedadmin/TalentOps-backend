-- ============================================================
-- TalentOps — Optimize People. Maximize Performance.
-- COMPLETE DATABASE SCHEMA (Phase 7 — Multi-Tenant SaaS)
-- Run this in phpMyAdmin / cPanel MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS amcgrvfy_TalentOpsDev
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE amcgrvfy_TalentOpsDev;

-- ============================================================
-- ███████╗ █████╗  █████╗ ███████╗    ██████╗
-- ██╔════╝██╔══██╗██╔══██╗██╔════╝    ╚════██╗
-- ███████╗███████║███████║███████╗        ██╔╝
-- ╚════██║██╔══██║██╔══██║╚════██║       ██╔╝
-- ███████║██║  ██║██║  ██║███████║       ██║
-- ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝       ╚═╝
-- MULTI-TENANT SAAS PLATFORM TABLES
-- ============================================================

-- ============================================================
-- TABLE: super_admins
-- Platform-level administrators (not company users)
-- ============================================================
CREATE TABLE IF NOT EXISTS super_admins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password      VARCHAR(255)  NOT NULL,
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  reset_token         VARCHAR(255)  NULL DEFAULT NULL,
  reset_token_expiry  DATETIME      NULL DEFAULT NULL,
  last_login_at DATETIME      NULL DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: plans
-- Pricing plans managed by Super Admin
-- ============================================================
CREATE TABLE IF NOT EXISTS plans (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(100)  NOT NULL,           -- 'Starter', 'Pro', 'Enterprise'
  slug                VARCHAR(100)  NOT NULL UNIQUE,    -- 'starter', 'pro', 'enterprise'
  description         TEXT          NULL,
  price_monthly_inr   DECIMAL(10,2) NOT NULL DEFAULT 0, -- ₹ for Razorpay
  price_annual_inr    DECIMAL(10,2) NOT NULL DEFAULT 0, -- ₹ annual (discounted)
  price_monthly_usd   DECIMAL(10,2) NOT NULL DEFAULT 0, -- $ for Stripe
  price_annual_usd    DECIMAL(10,2) NOT NULL DEFAULT 0, -- $ annual (discounted)
  max_users           INT UNSIGNED  NOT NULL DEFAULT 20, -- 0 = unlimited
  max_tasks           INT UNSIGNED  NOT NULL DEFAULT 500,-- 0 = unlimited
  max_storage_gb      INT UNSIGNED  NOT NULL DEFAULT 5,  -- GB
  features            JSON          NULL,               -- array of feature strings
  is_active           TINYINT(1)    NOT NULL DEFAULT 1,
  is_popular          TINYINT(1)    NOT NULL DEFAULT 0, -- show "Most Popular" badge
  sort_order          INT UNSIGNED  NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: tenants
-- One row per company that signs up
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255)  NOT NULL,               -- Company name
  slug            VARCHAR(100)  NOT NULL UNIQUE,        -- URL-safe identifier
  email           VARCHAR(255)  NOT NULL UNIQUE,        -- Company admin email
  phone           VARCHAR(30)   NULL DEFAULT NULL,
  logo            VARCHAR(255)  NULL DEFAULT NULL,
  address         TEXT          NULL DEFAULT NULL,
  industry        VARCHAR(100)  NULL DEFAULT NULL,
  size            ENUM('1-10','11-50','51-200','201-500','500+') NULL DEFAULT NULL,
  status          ENUM('trial','active','suspended','cancelled') NOT NULL DEFAULT 'trial',
  trial_ends_at   DATETIME      NULL DEFAULT NULL,      -- when trial expires
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: subscriptions
-- Active subscription per tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id           INT UNSIGNED  NOT NULL,
  plan_id             INT UNSIGNED  NOT NULL,
  billing_cycle       ENUM('monthly','annual') NOT NULL DEFAULT 'monthly',
  currency            ENUM('INR','USD')        NOT NULL DEFAULT 'INR',
  amount              DECIMAL(10,2) NOT NULL,           -- actual amount charged
  discount_amount     DECIMAL(10,2) NOT NULL DEFAULT 0, -- discount applied
  status              ENUM('active','past_due','cancelled','expired','trialing') NOT NULL DEFAULT 'trialing',
  gateway             ENUM('razorpay','stripe','manual') NOT NULL DEFAULT 'razorpay',
  gateway_subscription_id  VARCHAR(255) NULL DEFAULT NULL,
  gateway_customer_id      VARCHAR(255) NULL DEFAULT NULL,
  starts_at           DATETIME      NOT NULL,
  ends_at             DATETIME      NULL DEFAULT NULL,  -- NULL = ongoing
  next_billing_at     DATETIME      NULL DEFAULT NULL,
  cancelled_at        DATETIME      NULL DEFAULT NULL,
  cancellation_reason TEXT          NULL DEFAULT NULL,
  promo_code_id       INT UNSIGNED  NULL DEFAULT NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_tenant  FOREIGN KEY (tenant_id)     REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_plan    FOREIGN KEY (plan_id)       REFERENCES plans(id)   ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: payments
-- All payment transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id             INT UNSIGNED  NOT NULL,
  subscription_id       INT UNSIGNED  NULL DEFAULT NULL,
  gateway               ENUM('razorpay','stripe','manual') NOT NULL,
  gateway_order_id      VARCHAR(255)  NULL DEFAULT NULL,  -- Razorpay order_id / Stripe session_id
  gateway_payment_id    VARCHAR(255)  NULL DEFAULT NULL,  -- Razorpay payment_id / Stripe payment_intent
  gateway_signature     VARCHAR(500)  NULL DEFAULT NULL,  -- Razorpay signature for verification
  amount                DECIMAL(10,2) NOT NULL,
  currency              VARCHAR(10)   NOT NULL DEFAULT 'INR',
  status                ENUM('created','paid','failed','refunded') NOT NULL DEFAULT 'created',
  payment_method        VARCHAR(100)  NULL DEFAULT NULL,  -- card, upi, netbanking, etc.
  description           VARCHAR(500)  NULL DEFAULT NULL,
  metadata              JSON          NULL DEFAULT NULL,
  paid_at               DATETIME      NULL DEFAULT NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_tenant  FOREIGN KEY (tenant_id)       REFERENCES tenants(id)       ON DELETE CASCADE,
  CONSTRAINT fk_pay_sub     FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: promo_codes
-- Discount codes managed by Super Admin
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(50)   NOT NULL UNIQUE,         -- e.g. LAUNCH50
  description     VARCHAR(255)  NULL DEFAULT NULL,
  discount_type   ENUM('percent','flat_inr','flat_usd') NOT NULL DEFAULT 'percent',
  discount_value  DECIMAL(10,2) NOT NULL,               -- 20 = 20% or ₹200 or $5
  max_uses        INT UNSIGNED  NULL DEFAULT NULL,       -- NULL = unlimited
  used_count      INT UNSIGNED  NOT NULL DEFAULT 0,
  applies_to      ENUM('all','monthly','annual') NOT NULL DEFAULT 'all',
  plan_ids        JSON          NULL DEFAULT NULL,       -- null = all plans, or [1,2]
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  expires_at      DATETIME      NULL DEFAULT NULL,
  created_by      INT UNSIGNED  NOT NULL,               -- super_admin id
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_promo_admin FOREIGN KEY (created_by) REFERENCES super_admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: promo_code_usages
-- Track which tenant used which promo code
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_code_usages (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  promo_code_id INT UNSIGNED  NOT NULL,
  tenant_id     INT UNSIGNED  NOT NULL,
  payment_id    INT UNSIGNED  NULL DEFAULT NULL,
  discount_applied DECIMAL(10,2) NOT NULL DEFAULT 0,
  used_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usage_promo  FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
  CONSTRAINT fk_usage_tenant FOREIGN KEY (tenant_id)     REFERENCES tenants(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: platform_settings
-- Super Admin controlled key-value settings
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key   VARCHAR(100)  NOT NULL UNIQUE,
  setting_value TEXT          NULL,
  setting_type  ENUM('string','boolean','number','json') NOT NULL DEFAULT 'string',
  label         VARCHAR(255)  NULL,
  description   TEXT          NULL,
  group_name    VARCHAR(100)  NOT NULL DEFAULT 'general',
  is_sensitive  TINYINT(1)    NOT NULL DEFAULT 0,       -- 1 = mask in UI (API keys)
  updated_by    INT UNSIGNED  NULL DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_admin FOREIGN KEY (updated_by) REFERENCES super_admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ████████╗███████╗███╗   ██╗ █████╗ ███╗   ██╗████████╗
--    ██║   ██╔════╝████╗  ██║██╔══██╗████╗  ██║╚══██╔══╝
--    ██║   █████╗  ██╔██╗ ██║███████║██╔██╗ ██║   ██║
--    ██║   ██╔══╝  ██║╚██╗██║██╔══██║██║╚██╗██║   ██║
--    ██║   ███████╗██║ ╚████║██║  ██║██║ ╚████║   ██║
--    ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝
-- EXISTING APP TABLES (Updated with tenant_id)
-- ============================================================

-- ============================================================
-- TABLE: users (Updated — added tenant_id)
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: tasks (Updated — added tenant_id)
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: task_comments (Updated — added tenant_id)
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: task_files (Updated — added tenant_id)
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: notifications (Updated — added tenant_id)
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: audit_logs (Updated — added tenant_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id     INT UNSIGNED  NULL DEFAULT NULL,         -- NULL = platform-level action
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INDEXES — SaaS Platform tables
-- ============================================================
CREATE INDEX idx_tenants_status        ON tenants(status);
CREATE INDEX idx_tenants_slug          ON tenants(slug);
CREATE INDEX idx_subs_tenant           ON subscriptions(tenant_id);
CREATE INDEX idx_subs_status           ON subscriptions(status);
CREATE INDEX idx_subs_plan             ON subscriptions(plan_id);
CREATE INDEX idx_subs_ends_at          ON subscriptions(ends_at);
CREATE INDEX idx_payments_tenant       ON payments(tenant_id);
CREATE INDEX idx_payments_status       ON payments(status);
CREATE INDEX idx_payments_gateway      ON payments(gateway);
CREATE INDEX idx_promo_code            ON promo_codes(code);
CREATE INDEX idx_promo_active          ON promo_codes(is_active);
CREATE INDEX idx_promo_usage_promo     ON promo_code_usages(promo_code_id);
CREATE INDEX idx_promo_usage_tenant    ON promo_code_usages(tenant_id);
CREATE INDEX idx_platform_settings_key ON platform_settings(setting_key);
CREATE INDEX idx_platform_settings_grp ON platform_settings(group_name);

-- ============================================================
-- INDEXES — App tables (updated with tenant_id)
-- ============================================================
CREATE INDEX idx_users_tenant          ON users(tenant_id);
CREATE INDEX idx_users_manager         ON users(manager_id);
CREATE INDEX idx_users_role            ON users(role);
CREATE INDEX idx_tasks_tenant          ON tasks(tenant_id);
CREATE INDEX idx_tasks_assigned_to     ON tasks(assigned_to);
CREATE INDEX idx_tasks_assigned_by     ON tasks(assigned_by);
CREATE INDEX idx_tasks_status          ON tasks(status);
CREATE INDEX idx_tasks_due_date        ON tasks(due_date);
CREATE INDEX idx_comments_tenant       ON task_comments(tenant_id);
CREATE INDEX idx_comments_task         ON task_comments(task_id);
CREATE INDEX idx_files_tenant          ON task_files(tenant_id);
CREATE INDEX idx_files_task            ON task_files(task_id);
CREATE INDEX idx_notifications_tenant  ON notifications(tenant_id);
CREATE INDEX idx_notifications_user    ON notifications(user_id);
CREATE INDEX idx_notifications_read    ON notifications(is_read);
CREATE INDEX idx_audit_tenant          ON audit_logs(tenant_id);
CREATE INDEX idx_audit_user            ON audit_logs(user_id);
CREATE INDEX idx_audit_table           ON audit_logs(target_table);
