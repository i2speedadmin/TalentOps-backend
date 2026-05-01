// ============================================================
// TalentOps — Optimize People. Maximize Performance.
// COMPLETE SEED DATA (Phase 7 — Multi-Tenant SaaS)
// Run: node src/config/seed.js
// Default password for ALL users: Password@123
// ============================================================

const bcrypt = require('bcryptjs');
const db     = require('./db');

const seed = async () => {
  const connection = await db.getConnection();

  try {
    console.log('🌱 Starting TalentOps database seeding...\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await connection.beginTransaction();

    // Disable FK checks for clean truncation
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // Clear all tables in reverse dependency order
    const tablesToClear = [
      'audit_logs', 'notifications', 'task_files', 'task_comments',
      'tasks', 'users', 'promo_code_usages', 'payments',
      'subscriptions', 'promo_codes', 'platform_settings',
      'tenants', 'plans', 'super_admins',
    ];
    for (const table of tablesToClear) {
      await connection.query(`TRUNCATE TABLE ${table}`);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('🗑️  Cleared all existing data\n');

    // ────────────────────────────────────────────────────
    // Hash passwords
    // ────────────────────────────────────────────────────
    const defaultPassword   = 'Password@123';
    const hashedPassword    = await bcrypt.hash(defaultPassword, 10);
    const superAdminPassword = await bcrypt.hash(defaultPassword, 10);
    console.log('🔐 Passwords hashed successfully\n');

    // ════════════════════════════════════════════════════
    // PART 1 — SAAS PLATFORM DATA
    // ════════════════════════════════════════════════════
    console.log('📌 Seeding SaaS Platform Data...\n');

    // ────────────────────────────────────────────────────
    // SEED: super_admins
    // ────────────────────────────────────────────────────
    await connection.query(
      `INSERT INTO super_admins (id, name, email, password, status) VALUES (?, ?, ?, ?, ?)`,
      [1, 'TalentOps SuperAdmin', 'superadmin@i2speed.com', superAdminPassword, 'active']
    );
    console.log('✅ Seeded: super_admins (1 record)');

    // ────────────────────────────────────────────────────
    // SEED: plans
    // ────────────────────────────────────────────────────
    const plans = [
      {
        id: 1, name: 'Starter', slug: 'starter',
        description: 'Perfect for small recruitment teams getting started',
        price_monthly_inr: 999.00,  price_annual_inr: 9590.00,
        price_monthly_usd: 12.00,   price_annual_usd: 115.00,
        max_users: 20, max_tasks: 500, max_storage_gb: 5,
        features: JSON.stringify([
          'Task Management', 'User Management', 'Basic Dashboard',
          'File Uploads (5GB)', 'Email Notifications', 'Comments on Tasks',
          'Mobile Friendly',
        ]),
        is_active: 1, is_popular: 0, sort_order: 1,
      },
      {
        id: 2, name: 'Pro', slug: 'pro',
        description: 'Ideal for growing recruitment teams needing advanced features',
        price_monthly_inr: 2499.00, price_annual_inr: 23990.00,
        price_monthly_usd: 30.00,   price_annual_usd: 288.00,
        max_users: 100, max_tasks: 0, max_storage_gb: 20,
        features: JSON.stringify([
          'Everything in Starter', 'Unlimited Tasks',
          'Advanced Reports & Analytics', 'Audit Logs',
          'Priority Breakdown Charts', 'Performance Tracking',
          'Team Hierarchy Management', 'File Uploads (20GB)',
          'Global Search', 'Custom Branding',
        ]),
        is_active: 1, is_popular: 1, sort_order: 2,
      },
      {
        id: 3, name: 'Enterprise', slug: 'enterprise',
        description: 'For large organizations with unlimited needs and priority support',
        price_monthly_inr: 4999.00, price_annual_inr: 47990.00,
        price_monthly_usd: 60.00,   price_annual_usd: 576.00,
        max_users: 0, max_tasks: 0, max_storage_gb: 100,
        features: JSON.stringify([
          'Everything in Pro', 'Unlimited Users', 'Unlimited Storage (100GB)',
          'Dedicated Account Manager', 'Priority Support (24/7)',
          'Custom Integrations', 'SLA Guarantee',
          'Onboarding Assistance', 'Advanced Security', 'Data Export',
        ]),
        is_active: 1, is_popular: 0, sort_order: 3,
      },
    ];

    for (const plan of plans) {
      await connection.query(
        `INSERT INTO plans
           (id, name, slug, description,
            price_monthly_inr, price_annual_inr, price_monthly_usd, price_annual_usd,
            max_users, max_tasks, max_storage_gb, features,
            is_active, is_popular, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plan.id, plan.name, plan.slug, plan.description,
          plan.price_monthly_inr, plan.price_annual_inr,
          plan.price_monthly_usd, plan.price_annual_usd,
          plan.max_users, plan.max_tasks, plan.max_storage_gb, plan.features,
          plan.is_active, plan.is_popular, plan.sort_order,
        ]
      );
    }
    console.log(`✅ Seeded: plans (${plans.length} records)`);

    // ────────────────────────────────────────────────────
    // SEED: tenants
    // ────────────────────────────────────────────────────
    await connection.query(
      `INSERT INTO tenants (id, name, slug, email, phone, industry, size, status, trial_ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 'i2Speed Technologies', 'i2speed', 'admin@i2speed.com',
       '+91-9999999999', 'Technology', '11-50', 'active', null]
    );
    console.log('✅ Seeded: tenants (1 record)');

    // ────────────────────────────────────────────────────
    // SEED: subscriptions
    // ────────────────────────────────────────────────────
    const now       = new Date();
    const startsAt  = new Date(now.getTime() - 15 * 86400000);
    const nextBill  = new Date(now.getTime() + 15 * 86400000);
    const fmtDate   = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

    await connection.query(
      `INSERT INTO subscriptions
         (id, tenant_id, plan_id, billing_cycle, currency, amount, discount_amount,
          status, gateway, starts_at, next_billing_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 1, 2, 'monthly', 'INR', 2499.00, 0.00,
       'active', 'razorpay', fmtDate(startsAt), fmtDate(nextBill)]
    );
    console.log('✅ Seeded: subscriptions (1 record)');

    // ────────────────────────────────────────────────────
    // SEED: payments
    // ────────────────────────────────────────────────────
    const paidAt = new Date(now.getTime() - 15 * 86400000);
    await connection.query(
      `INSERT INTO payments
         (id, tenant_id, subscription_id, gateway, gateway_order_id, gateway_payment_id,
          amount, currency, status, payment_method, description, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 1, 1, 'razorpay', 'order_demo_001', 'pay_demo_001',
       2499.00, 'INR', 'paid', 'card',
       'TalentOps Pro Plan — Monthly Subscription', fmtDate(paidAt)]
    );
    console.log('✅ Seeded: payments (1 record)');

    // ────────────────────────────────────────────────────
    // SEED: platform_settings
    // ────────────────────────────────────────────────────
    const settings = [
      // Payment gateway toggles
      { key: 'razorpay_enabled',       val: 'true',  type: 'boolean', label: 'Enable Razorpay',         desc: 'Allow companies to pay via Razorpay (INR)',           group: 'payment',       sensitive: 0 },
      { key: 'stripe_enabled',         val: 'true',  type: 'boolean', label: 'Enable Stripe',           desc: 'Allow companies to pay via Stripe (USD)',              group: 'payment',       sensitive: 0 },
      // Razorpay credentials
      { key: 'razorpay_key_id',        val: '',      type: 'string',  label: 'Razorpay Key ID',         desc: 'Live Key ID from Razorpay dashboard',                  group: 'payment',       sensitive: 1 },
      { key: 'razorpay_key_secret',    val: '',      type: 'string',  label: 'Razorpay Key Secret',     desc: 'Live Key Secret from Razorpay dashboard',              group: 'payment',       sensitive: 1 },
      { key: 'razorpay_webhook_secret',val: '',      type: 'string',  label: 'Razorpay Webhook Secret', desc: 'Webhook secret for payment verification',              group: 'payment',       sensitive: 1 },
      // Stripe credentials
      { key: 'stripe_publishable_key', val: '',      type: 'string',  label: 'Stripe Publishable Key',  desc: 'Publishable Key from Stripe dashboard',                group: 'payment',       sensitive: 0 },
      { key: 'stripe_secret_key',      val: '',      type: 'string',  label: 'Stripe Secret Key',       desc: 'Secret Key from Stripe dashboard',                     group: 'payment',       sensitive: 1 },
      { key: 'stripe_webhook_secret',  val: '',      type: 'string',  label: 'Stripe Webhook Secret',   desc: 'Webhook secret for Stripe payment verification',       group: 'payment',       sensitive: 1 },
      // Trial settings
      { key: 'trial_days',             val: '14',    type: 'number',  label: 'Free Trial Days',         desc: 'Number of days for free trial on signup',             group: 'subscription',  sensitive: 0 },
      { key: 'trial_plan_id',          val: '2',     type: 'number',  label: 'Trial Plan',              desc: 'Plan features to use during free trial (plan ID)',     group: 'subscription',  sensitive: 0 },
      // App settings
      { key: 'app_name',               val: 'TalentOps', type: 'string', label: 'Application Name',    desc: 'Display name of the application',                     group: 'general',       sensitive: 0 },
      { key: 'app_tagline',            val: 'Optimize People. Maximize Performance.', type: 'string', label: 'Tagline', desc: 'Shown on public pages',                group: 'general',       sensitive: 0 },
      { key: 'support_email',          val: 'support@i2speed.com', type: 'string', label: 'Support Email', desc: 'Email shown to users for support',              group: 'general',       sensitive: 0 },
      { key: 'maintenance_mode',       val: 'false', type: 'boolean', label: 'Maintenance Mode',        desc: 'Put platform in maintenance mode',                    group: 'general',       sensitive: 0 },
      { key: 'allow_signups',          val: 'true',  type: 'boolean', label: 'Allow New Signups',       desc: 'Allow new companies to sign up',                      group: 'general',       sensitive: 0 },
      { key: 'require_payment',        val: 'true',  type: 'boolean', label: 'Require Payment',         desc: 'Require payment to activate after trial ends',        group: 'subscription',  sensitive: 0 },
    ];

    for (const s of settings) {
      await connection.query(
        `INSERT INTO platform_settings
           (setting_key, setting_value, setting_type, label, description, group_name, is_sensitive)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.key, s.val, s.type, s.label, s.desc, s.group, s.sensitive]
      );
    }
    console.log(`✅ Seeded: platform_settings (${settings.length} records)`);

    // ────────────────────────────────────────────────────
    // SEED: promo_codes
    // ────────────────────────────────────────────────────
    const expiry = (days) => {
      const d = new Date(); d.setDate(d.getDate() + days);
      return fmtDate(d);
    };

    const promos = [
      { id: 1, code: 'LAUNCH50',   desc: 'Launch discount — 50% off any plan',        type: 'percent',   val: 50.00,   max: 100, applies: 'all',     plans: null,  exp: expiry(90)  },
      { id: 2, code: 'ANNUAL20',   desc: 'Extra 20% off on annual billing',            type: 'percent',   val: 20.00,   max: 500, applies: 'annual',  plans: null,  exp: expiry(365) },
      { id: 3, code: 'STARTER500', desc: 'Flat ₹500 off on Starter plan',             type: 'flat_inr',  val: 500.00,  max: 50,  applies: 'all',     plans: '[1]', exp: expiry(60)  },
      { id: 4, code: 'PROMONTH',   desc: 'First month free on Pro monthly',            type: 'flat_inr',  val: 2499.00, max: 20,  applies: 'monthly', plans: '[2]', exp: expiry(30)  },
      { id: 5, code: 'USD10OFF',   desc: '$10 off for international customers',        type: 'flat_usd',  val: 10.00,   max: 200, applies: 'all',     plans: null,  exp: expiry(120) },
    ];

    for (const p of promos) {
      await connection.query(
        `INSERT INTO promo_codes
           (id, code, description, discount_type, discount_value, max_uses,
            used_count, applies_to, plan_ids, is_active, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?, 1)`,
        [p.id, p.code, p.desc, p.type, p.val, p.max, p.applies, p.plans, p.exp]
      );
    }
    console.log(`✅ Seeded: promo_codes (${promos.length} records)\n`);

    // ════════════════════════════════════════════════════
    // PART 2 — APP DATA (i2speed tenant_id = 1)
    // ════════════════════════════════════════════════════
    console.log('📌 Seeding App Data (i2speed.com — tenant_id: 1)...\n');

    // ────────────────────────────────────────────────────
    // SEED: users
    // ────────────────────────────────────────────────────
    const users = [
      // Company Admin
      { id: 1,  tenant_id: 1, name: 'Admin I2Speed',              email: 'admin@i2speed.com',    role: 'admin',       manager_id: null },
      // Managers
      { id: 2,  tenant_id: 1, name: 'Chanikya Uppalapati',        email: 'chanikya@i2speed.com', role: 'manager',     manager_id: 1    },
      { id: 3,  tenant_id: 1, name: 'David Manager',              email: 'david@i2speed.com',    role: 'manager',     manager_id: 1    },
      // Team Leaders
      { id: 4,  tenant_id: 1, name: 'Amrutha Nadiminti',          email: 'amrutha@i2speed.com',  role: 'team_leader', manager_id: 2    },
      { id: 5,  tenant_id: 1, name: 'Mihira Chowdary Uppalapati', email: 'mihira@i2speed.com',   role: 'team_leader', manager_id: 2    },
      { id: 6,  tenant_id: 1, name: 'Carol Leader',               email: 'carol@i2speed.com',    role: 'team_leader', manager_id: 3    },
      // Recruiters
      { id: 7,  tenant_id: 1, name: 'John Recruiter',             email: 'john@i2speed.com',     role: 'recruiter',   manager_id: 4    },
      { id: 8,  tenant_id: 1, name: 'Emma Recruiter',             email: 'emma@i2speed.com',     role: 'recruiter',   manager_id: 4    },
      { id: 9,  tenant_id: 1, name: 'Liam Recruiter',             email: 'liam@i2speed.com',     role: 'recruiter',   manager_id: 5    },
      { id: 10, tenant_id: 1, name: 'Mia Recruiter',              email: 'mia@i2speed.com',      role: 'recruiter',   manager_id: 5    },
      { id: 11, tenant_id: 1, name: 'Noah Recruiter',             email: 'noah@i2speed.com',     role: 'recruiter',   manager_id: 6    },
      { id: 12, tenant_id: 1, name: 'Olivia Recruiter',           email: 'olivia@i2speed.com',   role: 'recruiter',   manager_id: 6    },
    ];

    for (const u of users) {
      await connection.query(
        `INSERT INTO users (id, tenant_id, name, email, password, role, manager_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
        [u.id, u.tenant_id, u.name, u.email, hashedPassword, u.role, u.manager_id]
      );
    }
    console.log(`✅ Seeded: users (${users.length} records)`);

    // ────────────────────────────────────────────────────
    // SEED: tasks
    // ────────────────────────────────────────────────────
    const addDays = (days) => {
      const d = new Date(); d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };
    const subHours = (hours) => {
      const d = new Date(now.getTime() - hours * 3600000);
      return fmtDate(d);
    };
    const subDays = (days) => {
      const d = new Date(now.getTime() - days * 86400000);
      return fmtDate(d);
    };

    const tasks = [
      {
        id: 1, tenant_id: 1, assigned_to: 7,  assigned_by: 4,
        title: 'Source candidates for React Developer',
        desc:  'Find and screen at least 10 qualified React Developer candidates from LinkedIn and job boards.',
        status: 'assigned', priority: 'high', due: addDays(5), sub: null, appr: null,
      },
      {
        id: 2, tenant_id: 1, assigned_to: 8,  assigned_by: 4,
        title: 'Post job description for Node.js Engineer',
        desc:  'Create and post a detailed job description for a senior Node.js Engineer position on all platforms.',
        status: 'assigned', priority: 'medium', due: addDays(7), sub: null, appr: null,
      },
      {
        id: 3, tenant_id: 1, assigned_to: 9,  assigned_by: 5,
        title: 'Schedule interviews for UI/UX Designer',
        desc:  'Coordinate with hiring managers and schedule interviews for 5 shortlisted UI/UX Designer candidates.',
        status: 'in_progress', priority: 'high', due: addDays(3), sub: null, appr: null,
      },
      {
        id: 4, tenant_id: 1, assigned_to: 10, assigned_by: 5,
        title: 'Background verification for selected candidates',
        desc:  'Complete background checks for 3 candidates who have received offer letters.',
        status: 'in_progress', priority: 'urgent', due: addDays(2), sub: null, appr: null,
      },
      {
        id: 5, tenant_id: 1, assigned_to: 11, assigned_by: 6,
        title: 'Onboarding documentation for new hires',
        desc:  'Prepare and send onboarding documents to 4 new hires joining next week.',
        status: 'submitted', priority: 'medium', due: addDays(1), sub: subHours(2), appr: null,
      },
      {
        id: 6, tenant_id: 1, assigned_to: 12, assigned_by: 6,
        title: 'Salary negotiation follow-up',
        desc:  'Follow up with 3 candidates regarding salary negotiation and finalize offers.',
        status: 'submitted', priority: 'high', due: addDays(0), sub: subHours(5), appr: null,
      },
      {
        id: 7, tenant_id: 1, assigned_to: 7,  assigned_by: 4,
        title: 'LinkedIn sourcing campaign for Data Analyst',
        desc:  'Run a targeted LinkedIn sourcing campaign for Data Analyst positions.',
        status: 'approved', priority: 'medium', due: addDays(-3), sub: subDays(2), appr: subDays(1),
      },
      {
        id: 8, tenant_id: 1, assigned_to: 8,  assigned_by: 4,
        title: 'Candidate pipeline report - Q4',
        desc:  'Compile a comprehensive candidate pipeline report for Q4 hiring targets.',
        status: 'approved', priority: 'low', due: addDays(-5), sub: subDays(4), appr: subDays(3),
      },
      {
        id: 9, tenant_id: 1, assigned_to: 9,  assigned_by: 5,
        title: 'Cold outreach to passive candidates',
        desc:  'Send personalised cold outreach messages to 50 passive candidates for DevOps Engineer role.',
        status: 'rejected', priority: 'medium', due: addDays(-1), sub: subDays(3), appr: null,
      },
      {
        id: 10, tenant_id: 1, assigned_to: 10, assigned_by: 5,
        title: 'Job fair preparation checklist',
        desc:  'Prepare a complete checklist and materials for the upcoming tech job fair.',
        status: 'assigned', priority: 'low', due: addDays(10), sub: null, appr: null,
      },
    ];

    for (const t of tasks) {
      await connection.query(
        `INSERT INTO tasks
           (id, tenant_id, title, description, assigned_to, assigned_by,
            status, priority, due_date, submitted_at, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.tenant_id, t.title, t.desc, t.assigned_to, t.assigned_by,
         t.status, t.priority, t.due, t.sub, t.appr]
      );
    }
    console.log(`✅ Seeded: tasks (${tasks.length} records)`);

    // ────────────────────────────────────────────────────
    // SEED: task_comments
    // ────────────────────────────────────────────────────
    const comments = [
      { tenant_id: 1, task_id: 1,  user_id: 4,  comment: 'Please focus on candidates with at least 3 years of experience.' },
      { tenant_id: 1, task_id: 1,  user_id: 7,  comment: 'Understood. I have started sourcing on LinkedIn already.' },
      { tenant_id: 1, task_id: 3,  user_id: 9,  comment: 'Two candidates have confirmed their interview slots for Friday.' },
      { tenant_id: 1, task_id: 3,  user_id: 5,  comment: 'Good progress. Please also confirm the remaining 3 by tomorrow.' },
      { tenant_id: 1, task_id: 4,  user_id: 10, comment: 'Submitted background check forms for all 3 candidates.' },
      { tenant_id: 1, task_id: 4,  user_id: 5,  comment: 'One candidate has a discrepancy in their employment history, please investigate.' },
      { tenant_id: 1, task_id: 5,  user_id: 11, comment: 'All documents have been sent and acknowledged by 3 out of 4 new hires.' },
      { tenant_id: 1, task_id: 6,  user_id: 6,  comment: 'Please ensure the salary figures match the approved budget range.' },
      { tenant_id: 1, task_id: 7,  user_id: 7,  comment: 'Campaign completed. Generated 18 qualified leads.' },
      { tenant_id: 1, task_id: 7,  user_id: 4,  comment: 'Excellent work! Campaign exceeded the target.' },
      { tenant_id: 1, task_id: 9,  user_id: 5,  comment: 'The outreach messages lacked personalization. Please redo with better targeting.' },
      { tenant_id: 1, task_id: 9,  user_id: 9,  comment: 'Understood. I will revise and resubmit.' },
    ];

    for (const c of comments) {
      await connection.query(
        `INSERT INTO task_comments (tenant_id, task_id, user_id, comment) VALUES (?, ?, ?, ?)`,
        [c.tenant_id, c.task_id, c.user_id, c.comment]
      );
    }
    console.log(`✅ Seeded: task_comments (${comments.length} records)`);

    // ────────────────────────────────────────────────────
    // SEED: notifications
    // ────────────────────────────────────────────────────
    const notifications = [
      { tid: 1, uid: 7,  title: 'New Task Assigned',  msg: 'You have been assigned: Source candidates for React Developer',           type: 'task_assigned',   ref: 1,  read: 0 },
      { tid: 1, uid: 8,  title: 'New Task Assigned',  msg: 'You have been assigned: Post job description for Node.js Engineer',       type: 'task_assigned',   ref: 2,  read: 0 },
      { tid: 1, uid: 9,  title: 'New Task Assigned',  msg: 'You have been assigned: Schedule interviews for UI/UX Designer',          type: 'task_assigned',   ref: 3,  read: 1 },
      { tid: 1, uid: 10, title: 'New Task Assigned',  msg: 'You have been assigned: Background verification for selected candidates', type: 'task_assigned',   ref: 4,  read: 1 },
      { tid: 1, uid: 11, title: 'New Task Assigned',  msg: 'You have been assigned: Onboarding documentation for new hires',          type: 'task_assigned',   ref: 5,  read: 1 },
      { tid: 1, uid: 12, title: 'New Task Assigned',  msg: 'You have been assigned: Salary negotiation follow-up',                    type: 'task_assigned',   ref: 6,  read: 1 },
      { tid: 1, uid: 4,  title: 'Task Submitted',     msg: 'Noah Recruiter submitted: Onboarding documentation for new hires',        type: 'task_submitted',  ref: 5,  read: 0 },
      { tid: 1, uid: 6,  title: 'Task Submitted',     msg: 'Olivia Recruiter submitted: Salary negotiation follow-up',                type: 'task_submitted',  ref: 6,  read: 0 },
      { tid: 1, uid: 7,  title: 'Task Approved 🎉',   msg: 'Your task has been approved: LinkedIn sourcing campaign for Data Analyst', type: 'task_approved',   ref: 7,  read: 1 },
      { tid: 1, uid: 8,  title: 'Task Approved 🎉',   msg: 'Your task has been approved: Candidate pipeline report - Q4',             type: 'task_approved',   ref: 8,  read: 1 },
      { tid: 1, uid: 9,  title: 'Task Rejected',      msg: 'Your task was rejected: Cold outreach to passive candidates',             type: 'task_rejected',   ref: 9,  read: 0 },
      { tid: 1, uid: 7,  title: 'New Comment',        msg: 'Amrutha Nadiminti commented on: Source candidates for React Developer',   type: 'comment_added',   ref: 1,  read: 1 },
      { tid: 1, uid: 9,  title: 'New Comment',        msg: 'Mihira Uppalapati commented on: Schedule interviews for UI/UX Designer',  type: 'comment_added',   ref: 3,  read: 1 },
    ];

    for (const n of notifications) {
      await connection.query(
        `INSERT INTO notifications (tenant_id, user_id, title, message, type, ref_id, is_read)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [n.tid, n.uid, n.title, n.msg, n.type, n.ref, n.read]
      );
    }
    console.log(`✅ Seeded: notifications (${notifications.length} records)`);

    // ────────────────────────────────────────────────────
    // SEED: audit_logs
    // ────────────────────────────────────────────────────
    const logs = [
      // App-level logs (tenant_id = 1, user_type = 'user')
      { tid: 1,   uid: 1,  ut: 'user',        action: 'CREATE_USER',  table: 'users', tid2: 2,  old: null, nw: { name: 'Chanikya Uppalapati', email: 'chanikya@i2speed.com', role: 'manager' } },
      { tid: 1,   uid: 1,  ut: 'user',        action: 'CREATE_USER',  table: 'users', tid2: 3,  old: null, nw: { name: 'David Manager', email: 'david@i2speed.com', role: 'manager' } },
      { tid: 1,   uid: 2,  ut: 'user',        action: 'CREATE_USER',  table: 'users', tid2: 4,  old: null, nw: { name: 'Amrutha Nadiminti', email: 'amrutha@i2speed.com', role: 'team_leader' } },
      { tid: 1,   uid: 4,  ut: 'user',        action: 'CREATE_TASK',  table: 'tasks', tid2: 1,  old: null, nw: { title: 'Source candidates for React Developer', assigned_to: 7, status: 'assigned' } },
      { tid: 1,   uid: 4,  ut: 'user',        action: 'CREATE_TASK',  table: 'tasks', tid2: 2,  old: null, nw: { title: 'Post job description for Node.js Engineer', assigned_to: 8, status: 'assigned' } },
      { tid: 1,   uid: 7,  ut: 'user',        action: 'UPDATE_TASK',  table: 'tasks', tid2: 3,  old: { status: 'assigned' },    nw: { status: 'in_progress' } },
      { tid: 1,   uid: 11, ut: 'user',        action: 'SUBMIT_TASK',  table: 'tasks', tid2: 5,  old: { status: 'in_progress' }, nw: { status: 'submitted'   } },
      { tid: 1,   uid: 4,  ut: 'user',        action: 'APPROVE_TASK', table: 'tasks', tid2: 7,  old: { status: 'submitted' },   nw: { status: 'approved'    } },
      { tid: 1,   uid: 5,  ut: 'user',        action: 'REJECT_TASK',  table: 'tasks', tid2: 9,  old: { status: 'submitted' },   nw: { status: 'rejected', rejection_reason: 'Outreach messages lacked personalization' } },
      { tid: 1,   uid: 1,  ut: 'user',        action: 'LOGIN',        table: 'users', tid2: 1,  old: null, nw: { action: 'login_success' } },
      // Platform-level logs (tenant_id = null, user_type = 'super_admin')
      { tid: null, uid: 1, ut: 'super_admin', action: 'CREATE_PLAN',  table: 'plans', tid2: 1,  old: null, nw: { name: 'Starter',    slug: 'starter',    price_monthly_inr: 999   } },
      { tid: null, uid: 1, ut: 'super_admin', action: 'CREATE_PLAN',  table: 'plans', tid2: 2,  old: null, nw: { name: 'Pro',        slug: 'pro',        price_monthly_inr: 2499  } },
      { tid: null, uid: 1, ut: 'super_admin', action: 'CREATE_PLAN',  table: 'plans', tid2: 3,  old: null, nw: { name: 'Enterprise', slug: 'enterprise', price_monthly_inr: 4999  } },
      { tid: null, uid: 1, ut: 'super_admin', action: 'CREATE_PROMO', table: 'promo_codes', tid2: 1, old: null, nw: { code: 'LAUNCH50', discount_type: 'percent', discount_value: 50 } },
    ];

    for (const log of logs) {
      await connection.query(
        `INSERT INTO audit_logs
           (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.tid, log.uid, log.ut, log.action, log.table, log.tid2,
          log.old ? JSON.stringify(log.old) : null,
          log.nw  ? JSON.stringify(log.nw)  : null,
          '127.0.0.1',
        ]
      );
    }
    console.log(`✅ Seeded: audit_logs (${logs.length} records)\n`);

    await connection.commit();

    // ────────────────────────────────────────────────────
    // Summary
    // ────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 TalentOps database seeded successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🔐 Login Credentials (Password: Password@123)\n');
    console.log('🌐 SUPER ADMIN (Platform)');
    console.log('   superadmin@i2speed.com');
    console.log('\n🏢 i2Speed Technologies (Company Tenant)');
    console.log('   👑 Admin        : admin@i2speed.com');
    console.log('   🧑‍💼 Manager      : chanikya@i2speed.com | david@i2speed.com');
    console.log('   🧑‍🏫 Team Leader  : amrutha@i2speed.com | mihira@i2speed.com | carol@i2speed.com');
    console.log('   👨‍💻 Recruiter    : john@i2speed.com | emma@i2speed.com | liam@i2speed.com | mia@i2speed.com | noah@i2speed.com | olivia@i2speed.com');
    console.log('\n💳 Plans Seeded: Starter (₹999/mo) | Pro (₹2,499/mo) | Enterprise (₹4,999/mo)');
    console.log('🎟️  Promo Codes: LAUNCH50 | ANNUAL20 | STARTER500 | PROMONTH | USD10OFF');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err) {
    await connection.rollback();
    console.error('\n❌ Seeding failed:', err.message);
    console.error('   Code:', err.code);
    if (err.sql) console.error('   SQL:', err.sql.slice(0, 200));
    throw err;
  } finally {
    connection.release();
    process.exit(0);
  }
};

seed();
