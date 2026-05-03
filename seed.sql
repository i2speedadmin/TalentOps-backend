-- ============================================================
-- TalentOps — Optimize People. Maximize Performance.
-- COMPLETE SEED DATA (Phase 7 — Multi-Tenant SaaS)
-- Run this AFTER schema.sql in phpMyAdmin / cPanel MySQL
-- Default password for ALL users: Password@123
-- bcrypt hash (saltRounds=10): $2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
-- ============================================================

USE amcgrvfy_TalentOpsDev;

-- ============================================================
-- SEED: super_admins
-- Password: Password@123
-- ============================================================
INSERT INTO super_admins (id, name, email, password, status) VALUES
(1, 'TalentOps SuperAdmin', 'superadmin@i2speed.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'active');

-- ============================================================
-- SEED: plans
-- ============================================================
INSERT INTO plans (id, name, slug, description, price_monthly_inr, price_annual_inr, price_monthly_usd, price_annual_usd, max_users, max_tasks, max_storage_gb, features, is_active, is_popular, sort_order) VALUES

(1, 'Starter', 'starter',
 'Perfect for small recruitment teams getting started',
 999.00, 9590.00, 12.00, 115.00,
 20, 500, 5,
 '["Task Management","User Management","Basic Dashboard","File Uploads (5GB)","Email Notifications","Comments on Tasks","Mobile Friendly"]',
 1, 0, 1),

(2, 'Pro', 'pro',
 'Ideal for growing recruitment teams needing advanced features',
 2499.00, 23990.00, 30.00, 288.00,
 100, 0, 20,
 '["Everything in Starter","Unlimited Tasks","Advanced Reports & Analytics","Audit Logs","Priority Breakdown Charts","Performance Tracking","Team Hierarchy Management","File Uploads (20GB)","Global Search","Custom Branding"]',
 1, 1, 2),

(3, 'Enterprise', 'enterprise',
 'For large organizations with unlimited needs and priority support',
 4999.00, 47990.00, 60.00, 576.00,
 0, 0, 100,
 '["Everything in Pro","Unlimited Users","Unlimited Storage (100GB)","Dedicated Account Manager","Priority Support (24/7)","Custom Integrations","SLA Guarantee","Onboarding Assistance","Advanced Security","Data Export"]',
 1, 0, 3);

-- ============================================================
-- SEED: tenants
-- i2speed.com is the demo company tenant
-- ============================================================
INSERT INTO tenants (id, name, slug, email, phone, industry, size, status, trial_ends_at) VALUES
(1, 'i2Speed Technologies', 'i2speed', 'admin@i2speed.com', '+91-9999999999', 'Technology', '11-50', 'active', NULL);

-- ============================================================
-- SEED: subscriptions
-- i2speed is on Pro plan, monthly, INR, active
-- ============================================================
INSERT INTO subscriptions (id, tenant_id, plan_id, billing_cycle, currency, amount, discount_amount, status, gateway, starts_at, next_billing_at) VALUES
(1, 1, 2, 'monthly', 'INR', 2499.00, 0.00, 'active', 'razorpay',
 DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 15 DAY), '%Y-%m-%d 00:00:00'),
 DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 15 DAY), '%Y-%m-%d 00:00:00'));

-- ============================================================
-- SEED: payments
-- One successful payment for i2speed
-- ============================================================
INSERT INTO payments (id, tenant_id, subscription_id, gateway, gateway_order_id, gateway_payment_id, amount, currency, status, payment_method, description, paid_at) VALUES
(1, 1, 1, 'razorpay', 'order_demo_001', 'pay_demo_001', 2499.00, 'INR', 'paid', 'card',
 'TalentOps Pro Plan — Monthly Subscription', DATE_SUB(NOW(), INTERVAL 15 DAY));

-- ============================================================
-- SEED: platform_settings
-- Default gateway + app settings
-- ============================================================
INSERT INTO platform_settings (setting_key, setting_value, setting_type, label, description, group_name, is_sensitive) VALUES

-- Gateway toggles
('razorpay_enabled',      'true',  'boolean', 'Enable Razorpay',      'Allow companies to pay via Razorpay (INR)',      'payment', 0),
('stripe_enabled',        'true',  'boolean', 'Enable Stripe',        'Allow companies to pay via Stripe (USD)',         'payment', 0),

-- Razorpay credentials (to be filled by Super Admin)
('razorpay_key_id',       '',      'string',  'Razorpay Key ID',      'Live Key ID from Razorpay dashboard',             'payment', 1),
('razorpay_key_secret',   '',      'string',  'Razorpay Key Secret',  'Live Key Secret from Razorpay dashboard',         'payment', 1),
('razorpay_webhook_secret','',     'string',  'Razorpay Webhook Secret','Webhook secret for payment verification',        'payment', 1),

-- Stripe credentials
('stripe_publishable_key','',      'string',  'Stripe Publishable Key','Publishable Key from Stripe dashboard',           'payment', 0),
('stripe_secret_key',     '',      'string',  'Stripe Secret Key',    'Secret Key from Stripe dashboard',                'payment', 1),
('stripe_webhook_secret', '',      'string',  'Stripe Webhook Secret','Webhook secret for Stripe payment verification',   'payment', 1),

-- Trial settings
('trial_days',            '14',    'number',  'Free Trial Days',      'Number of days for free trial on signup',         'subscription', 0),
('trial_plan_id',         '2',     'number',  'Trial Plan',           'Plan features to use during free trial (plan ID)','subscription', 0),

-- App settings
('app_name',              'TalentOps', 'string', 'Application Name',  'Display name of the application',                'general', 0),
('app_tagline',           'Optimize People. Maximize Performance.', 'string', 'Tagline', 'Shown on public pages',       'general', 0),
('support_email',         'support@i2speed.com', 'string', 'Support Email', 'Email shown to users for support',       'general', 0),
('maintenance_mode',      'false', 'boolean', 'Maintenance Mode',     'Put platform in maintenance mode',                'general', 0),

-- Signup settings
('allow_signups',         'true',  'boolean', 'Allow New Signups',    'Allow new companies to sign up',                  'general', 0),
('require_payment',       'true',  'boolean', 'Require Payment',      'Require payment to activate after trial',         'subscription', 0);

-- ============================================================
-- SEED: promo_codes
-- ============================================================
INSERT INTO promo_codes (id, code, description, discount_type, discount_value, max_uses, used_count, applies_to, plan_ids, is_active, expires_at, created_by) VALUES
(1, 'LAUNCH50',   'Launch discount — 50% off any plan',         'percent',   50.00, 100, 1, 'all',     NULL, 1, DATE_ADD(NOW(), INTERVAL 90 DAY), 1),
(2, 'ANNUAL20',   'Extra 20% off on annual billing',            'percent',   20.00, 500, 0, 'annual',  NULL, 1, DATE_ADD(NOW(), INTERVAL 365 DAY), 1),
(3, 'STARTER500', 'Flat ₹500 off on Starter plan',             'flat_inr', 500.00,  50, 0, 'all',     '[1]', 1, DATE_ADD(NOW(), INTERVAL 60 DAY), 1),
(4, 'PROMONTH',   'First month free on Pro monthly',            'flat_inr', 2499.00, 20, 0, 'monthly', '[2]', 1, DATE_ADD(NOW(), INTERVAL 30 DAY), 1),
(5, 'USD10OFF',   '$10 off for international customers',        'flat_usd',  10.00, 200, 0, 'all',     NULL, 1, DATE_ADD(NOW(), INTERVAL 120 DAY), 1);

-- ============================================================
-- SEED: users
-- All under tenant_id = 1 (i2speed)
-- Password: Password@123
-- ============================================================
INSERT INTO users (id, tenant_id, name, email, password, role, manager_id, status) VALUES

-- Company Admin
(1,  1, 'Admin I2Speed',             'admin@i2speed.com',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin',       NULL, 'active'),

-- Managers (report to Admin)
(2,  1, 'Chanikya Uppalapati',       'chanikya@i2speed.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'manager',     1,    'active'),
(3,  1, 'David Manager',             'david@i2speed.com',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'manager',     1,    'active'),

-- Team Leaders (report to Managers)
(4,  1, 'Amrutha Nadiminti',         'amrutha@i2speed.com',  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'team_leader', 2,    'active'),
(5,  1, 'Mihira Chowdary Uppalapati','mihira@i2speed.com',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'team_leader', 2,    'active'),
(6,  1, 'Carol Leader',              'carol@i2speed.com',    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'team_leader', 3,    'active'),

-- Recruiters (report to Team Leaders)
(7,  1, 'John Recruiter',            'john@i2speed.com',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   4,    'active'),
(8,  1, 'Emma Recruiter',            'emma@i2speed.com',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   4,    'active'),
(9,  1, 'Liam Recruiter',            'liam@i2speed.com',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   5,    'active'),
(10, 1, 'Mia Recruiter',             'mia@i2speed.com',      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   5,    'active'),
(11, 1, 'Noah Recruiter',            'noah@i2speed.com',     '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   6,    'active'),
(12, 1, 'Olivia Recruiter',          'olivia@i2speed.com',   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'recruiter',   6,    'active');

-- ============================================================
-- SEED: tasks (added tenant_id = 1)
-- ============================================================
INSERT INTO tasks (id, tenant_id, title, description, assigned_to, assigned_by, status, priority, due_date, submitted_at, approved_at) VALUES

(1,  1, 'Source candidates for React Developer',
     'Find and screen at least 10 qualified React Developer candidates from LinkedIn and job boards.',
     7, 4, 'assigned', 'high', DATE_ADD(CURDATE(), INTERVAL 5 DAY), NULL, NULL),

(2,  1, 'Post job description for Node.js Engineer',
     'Create and post a detailed job description for a senior Node.js Engineer position on all platforms.',
     8, 4, 'assigned', 'medium', DATE_ADD(CURDATE(), INTERVAL 7 DAY), NULL, NULL),

(3,  1, 'Schedule interviews for UI/UX Designer',
     'Coordinate with hiring managers and schedule interviews for 5 shortlisted UI/UX Designer candidates.',
     9, 5, 'in_progress', 'high', DATE_ADD(CURDATE(), INTERVAL 3 DAY), NULL, NULL),

(4,  1, 'Background verification for selected candidates',
     'Complete background checks for 3 candidates who have received offer letters.',
     10, 5, 'in_progress', 'urgent', DATE_ADD(CURDATE(), INTERVAL 2 DAY), NULL, NULL),

(5,  1, 'Onboarding documentation for new hires',
     'Prepare and send onboarding documents to 4 new hires joining next week.',
     11, 6, 'submitted', 'medium', DATE_ADD(CURDATE(), INTERVAL 1 DAY),
     DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL),

(6,  1, 'Salary negotiation follow-up',
     'Follow up with 3 candidates regarding salary negotiation and finalize offers.',
     12, 6, 'submitted', 'high', CURDATE(),
     DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL),

(7,  1, 'LinkedIn sourcing campaign for Data Analyst',
     'Run a targeted LinkedIn sourcing campaign for Data Analyst positions.',
     7, 4, 'approved', 'medium', DATE_SUB(CURDATE(), INTERVAL 3 DAY),
     DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),

(8,  1, 'Candidate pipeline report - Q4',
     'Compile a comprehensive candidate pipeline report for Q4 hiring targets.',
     8, 4, 'approved', 'low', DATE_SUB(CURDATE(), INTERVAL 5 DAY),
     DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),

(9,  1, 'Cold outreach to passive candidates',
     'Send personalised cold outreach messages to 50 passive candidates for DevOps Engineer role.',
     9, 5, 'rejected', 'medium', DATE_SUB(CURDATE(), INTERVAL 1 DAY),
     DATE_SUB(NOW(), INTERVAL 3 DAY), NULL),

(10, 1, 'Job fair preparation checklist',
     'Prepare a complete checklist and materials for the upcoming tech job fair.',
     10, 5, 'assigned', 'low', DATE_ADD(CURDATE(), INTERVAL 10 DAY), NULL, NULL);

-- ============================================================
-- SEED: task_comments (added tenant_id = 1)
-- ============================================================
INSERT INTO task_comments (tenant_id, task_id, user_id, comment) VALUES
(1, 1,  4,  'Please focus on candidates with at least 3 years of experience.'),
(1, 1,  7,  'Understood. I have started sourcing on LinkedIn already.'),
(1, 3,  9,  'Two candidates have confirmed their interview slots for Friday.'),
(1, 3,  5,  'Good progress. Please also confirm the remaining 3 by tomorrow.'),
(1, 4,  10, 'Submitted background check forms for all 3 candidates.'),
(1, 4,  5,  'One candidate has a discrepancy in their employment history, please investigate.'),
(1, 5,  11, 'All documents have been sent and acknowledged by 3 out of 4 new hires.'),
(1, 6,  6,  'Please ensure the salary figures match the approved budget range.'),
(1, 7,  7,  'Campaign completed. Generated 18 qualified leads.'),
(1, 7,  4,  'Excellent work! Campaign exceeded the target.'),
(1, 9,  5,  'The outreach messages lacked personalization. Please redo with better targeting.'),
(1, 9,  9,  'Understood. I will revise and resubmit.');

-- ============================================================
-- SEED: notifications (added tenant_id = 1)
-- ============================================================
INSERT INTO notifications (tenant_id, user_id, title, message, type, ref_id, is_read) VALUES
(1, 7,  'New Task Assigned',  'You have been assigned: Source candidates for React Developer',           'task_assigned',   1,  0),
(1, 8,  'New Task Assigned',  'You have been assigned: Post job description for Node.js Engineer',       'task_assigned',   2,  0),
(1, 9,  'New Task Assigned',  'You have been assigned: Schedule interviews for UI/UX Designer',          'task_assigned',   3,  1),
(1, 10, 'New Task Assigned',  'You have been assigned: Background verification for selected candidates', 'task_assigned',   4,  1),
(1, 11, 'New Task Assigned',  'You have been assigned: Onboarding documentation for new hires',          'task_assigned',   5,  1),
(1, 12, 'New Task Assigned',  'You have been assigned: Salary negotiation follow-up',                    'task_assigned',   6,  1),
(1, 4,  'Task Submitted',     'Noah Recruiter submitted: Onboarding documentation for new hires',        'task_submitted',  5,  0),
(1, 6,  'Task Submitted',     'Olivia Recruiter submitted: Salary negotiation follow-up',                'task_submitted',  6,  0),
(1, 7,  'Task Approved',      'Your task has been approved: LinkedIn sourcing campaign for Data Analyst', 'task_approved',  7,  1),
(1, 8,  'Task Approved',      'Your task has been approved: Candidate pipeline report - Q4',              'task_approved',  8,  1),
(1, 9,  'Task Rejected',      'Your task was rejected: Cold outreach to passive candidates',              'task_rejected',   9,  0),
(1, 7,  'New Comment',        'Amrutha Nadiminti commented on: Source candidates for React Developer',    'comment_added',   1,  1),
(1, 9,  'New Comment',        'Mihira Uppalapati commented on: Schedule interviews for UI/UX Designer',   'comment_added',   3,  1);

-- ============================================================
-- SEED: audit_logs (added tenant_id = 1, user_type = 'user')
-- ============================================================
INSERT INTO audit_logs (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address) VALUES
(1, 1, 'user', 'CREATE_USER', 'users', 2, NULL,
 '{"name":"Chanikya Uppalapati","email":"chanikya@i2speed.com","role":"manager"}', '127.0.0.1'),

(1, 1, 'user', 'CREATE_USER', 'users', 3, NULL,
 '{"name":"David Manager","email":"david@i2speed.com","role":"manager"}', '127.0.0.1'),

(1, 2, 'user', 'CREATE_USER', 'users', 4, NULL,
 '{"name":"Amrutha Nadiminti","email":"amrutha@i2speed.com","role":"team_leader"}', '127.0.0.1'),

(1, 4, 'user', 'CREATE_TASK', 'tasks', 1, NULL,
 '{"title":"Source candidates for React Developer","assigned_to":7,"status":"assigned"}', '127.0.0.1'),

(1, 4, 'user', 'CREATE_TASK', 'tasks', 2, NULL,
 '{"title":"Post job description for Node.js Engineer","assigned_to":8,"status":"assigned"}', '127.0.0.1'),

(1, 7, 'user', 'UPDATE_TASK', 'tasks', 3,
 '{"status":"assigned"}', '{"status":"in_progress"}', '127.0.0.1'),

(1, 11, 'user', 'SUBMIT_TASK', 'tasks', 5,
 '{"status":"in_progress"}', '{"status":"submitted"}', '127.0.0.1'),

(1, 4, 'user', 'APPROVE_TASK', 'tasks', 7,
 '{"status":"submitted"}', '{"status":"approved"}', '127.0.0.1'),

(1, 5, 'user', 'REJECT_TASK', 'tasks', 9,
 '{"status":"submitted"}', '{"status":"rejected","rejection_reason":"Outreach messages lacked personalization"}', '127.0.0.1'),

(1, 1, 'user', 'LOGIN', 'users', 1, NULL,
 '{"action":"login_success"}', '127.0.0.1'),

-- Platform-level audit (super admin creating plans)
(NULL, 1, 'super_admin', 'CREATE_PLAN', 'plans', 1, NULL,
 '{"name":"Starter","slug":"starter","price_monthly_inr":999}', '127.0.0.1'),

(NULL, 1, 'super_admin', 'CREATE_PLAN', 'plans', 2, NULL,
 '{"name":"Pro","slug":"pro","price_monthly_inr":2499}', '127.0.0.1'),

(NULL, 1, 'super_admin', 'CREATE_PLAN', 'plans', 3, NULL,
 '{"name":"Enterprise","slug":"enterprise","price_monthly_inr":4999}', '127.0.0.1'),

(NULL, 1, 'super_admin', 'CREATE_PROMO', 'promo_codes', 1, NULL,
 '{"code":"LAUNCH50","discount_type":"percent","discount_value":50}', '127.0.0.1');
