-- ============================================================
-- TalentOps - Optimize People. Maximize Performance.
-- WORK & TASK MANAGEMENT SYSTEM - DATABASE SCHEMA
-- Run this in phpMyAdmin / cPanel MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS amcgrvfy_TalentOpsDev
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE amcgrvfy_TalentOpsDev;

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password      VARCHAR(255)  NOT NULL,
  role          ENUM('admin','manager','team_leader','recruiter') NOT NULL DEFAULT 'recruiter',
  manager_id    INT UNSIGNED  NULL DEFAULT NULL,
  profile_pic   VARCHAR(255)  NULL DEFAULT NULL,
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  reset_token   VARCHAR(255)  NULL DEFAULT NULL,
  reset_token_expiry DATETIME NULL DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_manager
    FOREIGN KEY (manager_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(255)  NOT NULL,
  description   TEXT          NULL,
  assigned_to   INT UNSIGNED  NOT NULL,
  assigned_by   INT UNSIGNED  NOT NULL,
  status        ENUM('assigned','in_progress','submitted','approved','rejected') NOT NULL DEFAULT 'assigned',
  priority      ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  due_date      DATE          NULL,
  submitted_at  DATETIME      NULL DEFAULT NULL,
  approved_at   DATETIME      NULL DEFAULT NULL,
  rejection_reason TEXT       NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tasks_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: task_comments
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: task_files
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: notifications
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: audit_logs
-- ============================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_tasks_assigned_to   ON tasks(assigned_to);
CREATE INDEX idx_tasks_assigned_by   ON tasks(assigned_by);
CREATE INDEX idx_tasks_status        ON tasks(status);
CREATE INDEX idx_tasks_due_date      ON tasks(due_date);
CREATE INDEX idx_notifications_user  ON notifications(user_id);
CREATE INDEX idx_notifications_read  ON notifications(is_read);
CREATE INDEX idx_audit_user          ON audit_logs(user_id);
CREATE INDEX idx_audit_table         ON audit_logs(target_table);
CREATE INDEX idx_comments_task       ON task_comments(task_id);
CREATE INDEX idx_files_task          ON task_files(task_id);
CREATE INDEX idx_users_manager       ON users(manager_id);
CREATE INDEX idx_users_role          ON users(role);
