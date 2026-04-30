-- ============================================================
-- TalentOps - Optimize People. Maximize Performance.
-- WORK & TASK MANAGEMENT SYSTEM - SEED DATA
-- Run this AFTER schema.sql in phpMyAdmin / cPanel MySQL
-- Default password for ALL users: Password@123
-- (bcrypt hash generated with saltRounds=10)
-- ============================================================

USE amcgrvfy_TalentOpsDev;

-- ============================================================
-- SEED: users
-- Password for all: Password@123
-- ============================================================
INSERT INTO users (id, name, email, password, role, manager_id, status) VALUES

-- Admin
(1, 'System Admin',    'admin@i2speed.com',       '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin',       NULL, 'active'),

-- Managers (report to Admin)
(2, 'Sarah Manager',   'sarah@i2speed.com',        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'manager',     1,    'active'),
(3, 'David Manager',   'david@i2speed.com',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'manager',     1,    'active'),

-- Team Leaders (report to Managers)
(4, 'Alice Leader',    'alice@i2speed.com',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'team_leader', 2,    'active'),
(5, 'Bob Leader',      'bob@i2speed.com',            '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'team_leader', 2,    'active'),
(6, 'Carol Leader',    'carol@i2speed.com',          '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'team_leader', 3,    'active'),

-- Recruiters (report to Team Leaders)
(7,  'John Recruiter',   'john@i2speed.com',        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   4,    'active'),
(8,  'Emma Recruiter',   'emma@i2speed.com',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   4,    'active'),
(9,  'Liam Recruiter',   'liam@i2speed.com',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   5,    'active'),
(10, 'Mia Recruiter',    'mia@i2speed.com',          '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   5,    'active'),
(11, 'Noah Recruiter',   'noah@i2speed.com',         '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   6,    'active'),
(12, 'Olivia Recruiter', 'olivia@i2speed.com',       '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   6,    'active');


-- ============================================================
-- SEED: tasks
-- ============================================================
INSERT INTO tasks (id, title, description, assigned_to, assigned_by, status, priority, due_date, submitted_at, approved_at) VALUES

-- Assigned tasks
(1,  'Source candidates for React Developer',
     'Find and screen at least 10 qualified React Developer candidates from LinkedIn and job boards.',
     7, 4, 'assigned', 'high', DATE_ADD(CURDATE(), INTERVAL 5 DAY), NULL, NULL),

(2,  'Post job description for Node.js Engineer',
     'Create and post a detailed job description for a senior Node.js Engineer position on all platforms.',
     8, 4, 'assigned', 'medium', DATE_ADD(CURDATE(), INTERVAL 7 DAY), NULL, NULL),

(3,  'Schedule interviews for UI/UX Designer',
     'Coordinate with hiring managers and schedule interviews for 5 shortlisted UI/UX Designer candidates.',
     9, 5, 'in_progress', 'high', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NULL, NULL),

(4,  'Background verification for selected candidates',
     'Complete background checks for 3 candidates who have received offer letters.',
     10, 5, 'in_progress', 'urgent', DATE_ADD(CURDATE(), INTERVAL 2 DAY), NULL, NULL),

-- Submitted tasks
(5,  'Onboarding documentation for new hires',
     'Prepare and send onboarding documents to 4 new hires joining next week.',
     11, 6, 'submitted', 'medium', DATE_ADD(CURDATE(), INTERVAL 1 DAY),
     DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL),

(6,  'Salary negotiation follow-up',
     'Follow up with 3 candidates regarding salary negotiation and finalize offers.',
     12, 6, 'submitted', 'high', CURDATE(),
     DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL),

-- Approved tasks
(7,  'LinkedIn sourcing campaign for Data Analyst',
     'Run a targeted LinkedIn sourcing campaign for Data Analyst positions.',
     7, 4, 'approved', 'medium', DATE_SUB(CURDATE(), INTERVAL 3 DAY),
     DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),

(8,  'Candidate pipeline report - Q4',
     'Compile a comprehensive candidate pipeline report for Q4 hiring targets.',
     8, 4, 'approved', 'low', DATE_SUB(CURDATE(), INTERVAL 5 DAY),
     DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),

-- Rejected tasks
(9,  'Cold outreach to passive candidates',
     'Send personalised cold outreach messages to 50 passive candidates for DevOps Engineer role.',
     9, 5, 'rejected', 'medium', DATE_SUB(CURDATE(), INTERVAL 1 DAY),
     DATE_SUB(NOW(), INTERVAL 3 DAY), NULL),

(10, 'Job fair preparation checklist',
     'Prepare a complete checklist and materials for the upcoming tech job fair.',
     10, 5, 'assigned', 'low', DATE_ADD(CURDATE(), INTERVAL 10 DAY), NULL, NULL);


-- ============================================================
-- SEED: task_comments
-- ============================================================
INSERT INTO task_comments (task_id, user_id, comment) VALUES
(1,  4,  'Please focus on candidates with at least 3 years of experience.'),
(1,  7,  'Understood. I have started sourcing on LinkedIn already.'),
(3,  9,  'Two candidates have confirmed their interview slots for Friday.'),
(3,  5,  'Good progress. Please also confirm the remaining 3 by tomorrow.'),
(4,  10, 'Submitted background check forms for all 3 candidates.'),
(4,  5,  'One candidate has a discrepancy in their employment history, please investigate.'),
(5,  11, 'All documents have been sent and acknowledged by 3 out of 4 new hires.'),
(6,  6,  'Please ensure the salary figures match the approved budget range.'),
(7,  7,  'Campaign completed. Generated 18 qualified leads.'),
(7,  4,  'Excellent work! Campaign exceeded the target.'),
(9,  5,  'The outreach messages lacked personalization. Please redo with better targeting.'),
(9,  9,  'Understood. I will revise and resubmit.');


-- ============================================================
-- SEED: notifications
-- ============================================================
INSERT INTO notifications (user_id, title, message, type, ref_id, is_read) VALUES
(7,  'New Task Assigned',     'You have been assigned: Source candidates for React Developer',          'task_assigned',   1,  0),
(8,  'New Task Assigned',     'You have been assigned: Post job description for Node.js Engineer',      'task_assigned',   2,  0),
(9,  'New Task Assigned',     'You have been assigned: Schedule interviews for UI/UX Designer',         'task_assigned',   3,  1),
(10, 'New Task Assigned',     'You have been assigned: Background verification for selected candidates','task_assigned',   4,  1),
(11, 'New Task Assigned',     'You have been assigned: Onboarding documentation for new hires',        'task_assigned',   5,  1),
(12, 'New Task Assigned',     'You have been assigned: Salary negotiation follow-up',                   'task_assigned',   6,  1),
(4,  'Task Submitted',        'John Recruiter submitted: Onboarding documentation for new hires',      'task_submitted',  5,  0),
(6,  'Task Submitted',        'Olivia Recruiter submitted: Salary negotiation follow-up',               'task_submitted',  6,  0),
(7,  'Task Approved',         'Your task has been approved: LinkedIn sourcing campaign for Data Analyst','task_approved',  7,  1),
(8,  'Task Approved',         'Your task has been approved: Candidate pipeline report - Q4',            'task_approved',  8,  1),
(9,  'Task Rejected',         'Your task was rejected: Cold outreach to passive candidates',            'task_rejected',   9,  0),
(7,  'New Comment',           'Alice Leader commented on: Source candidates for React Developer',       'comment_added',   1,  1),
(9,  'New Comment',           'Bob Leader commented on: Schedule interviews for UI/UX Designer',        'comment_added',   3,  1);


-- ============================================================
-- SEED: audit_logs
-- ============================================================
INSERT INTO audit_logs (user_id, action, target_table, target_id, old_value, new_value, ip_address) VALUES
(1,  'CREATE_USER',    'users',  2,   NULL,
     '{"name":"Sarah Manager","email":"sarah@i2speed.com","role":"manager"}',
     '127.0.0.1'),

(1,  'CREATE_USER',    'users',  3,   NULL,
     '{"name":"David Manager","email":"david@i2speed.com","role":"manager"}',
     '127.0.0.1'),

(2,  'CREATE_USER',    'users',  4,   NULL,
     '{"name":"Alice Leader","email":"alice@i2speed.com","role":"team_leader"}',
     '127.0.0.1'),

(4,  'CREATE_TASK',    'tasks',  1,   NULL,
     '{"title":"Source candidates for React Developer","assigned_to":7,"status":"assigned"}',
     '127.0.0.1'),

(4,  'CREATE_TASK',    'tasks',  2,   NULL,
     '{"title":"Post job description for Node.js Engineer","assigned_to":8,"status":"assigned"}',
     '127.0.0.1'),

(7,  'UPDATE_TASK',    'tasks',  3,
     '{"status":"assigned"}',
     '{"status":"in_progress"}',
     '127.0.0.1'),

(11, 'SUBMIT_TASK',    'tasks',  5,
     '{"status":"in_progress"}',
     '{"status":"submitted"}',
     '127.0.0.1'),

(4,  'APPROVE_TASK',   'tasks',  7,
     '{"status":"submitted"}',
     '{"status":"approved"}',
     '127.0.0.1'),

(5,  'REJECT_TASK',    'tasks',  9,
     '{"status":"submitted"}',
     '{"status":"rejected","rejection_reason":"Outreach messages lacked personalization"}',
     '127.0.0.1'),

(1,  'LOGIN',          'users',  1,   NULL, '{"action":"login_success"}', '127.0.0.1');
