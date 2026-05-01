// ============================================================
// WORK & TASK MANAGEMENT SYSTEM - SEED DATA
// Run: node src/config/seed.js
// Default password for ALL users: Password@123
// ============================================================

const bcrypt = require('bcryptjs');
const db = require('./db');

const seed = async () => {
  const connection = await db.getConnection();

  try {
    console.log('🌱 Starting database seeding...\n');

    await connection.beginTransaction();

    // Disable FK checks temporarily for clean seeding
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // Clear existing data
    await connection.query('TRUNCATE TABLE audit_logs');
    await connection.query('TRUNCATE TABLE notifications');
    await connection.query('TRUNCATE TABLE task_files');
    await connection.query('TRUNCATE TABLE task_comments');
    await connection.query('TRUNCATE TABLE tasks');
    await connection.query('TRUNCATE TABLE users');

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('🗑️  Cleared existing data\n');

    // --------------------------------------------------------
    // Hash password
    // --------------------------------------------------------
    const defaultPassword = 'Password@123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    console.log('🔐 Password hashed successfully');

    // --------------------------------------------------------
    // SEED: users
    // --------------------------------------------------------
    const users = [
      // Admin
      { id: 1,  name: 'Admin I2Speed',      email: 'admin@i2speed.com',   role: 'admin',       manager_id: null, status: 'active' },
      // Managers
      { id: 2,  name: 'Chanikya Uppalapati',     email: 'chanikya@i2speed.com',   role: 'manager',     manager_id: 1,    status: 'active' },
      { id: 3,  name: 'David Manager',     email: 'david@i2speed.com',   role: 'manager',     manager_id: 1,    status: 'active' },
      // Team Leaders
      { id: 4,  name: 'Amrutha Nadiminti',      email: 'amrutha@i2speed.com',   role: 'team_leader', manager_id: 2,    status: 'active' },
      { id: 5,  name: 'Mihira Chowdary Uppalapati',        email: 'mihira@i2speed.com',     role: 'team_leader', manager_id: 2,    status: 'active' },
      { id: 6,  name: 'Carol Leader',      email: 'carol@i2speed.com',   role: 'team_leader', manager_id: 3,    status: 'active' },
      // Recruiters
      { id: 7,  name: 'John Recruiter',    email: 'john@i2speed.com',    role: 'recruiter',   manager_id: 4,    status: 'active' },
      { id: 8,  name: 'Emma Recruiter',    email: 'emma@i2speed.com',    role: 'recruiter',   manager_id: 4,    status: 'active' },
      { id: 9,  name: 'Liam Recruiter',    email: 'liam@i2speed.com',    role: 'recruiter',   manager_id: 5,    status: 'active' },
      { id: 10, name: 'Mia Recruiter',     email: 'mia@i2speed.com',     role: 'recruiter',   manager_id: 5,    status: 'active' },
      { id: 11, name: 'Noah Recruiter',    email: 'noah@i2speed.com',    role: 'recruiter',   manager_id: 6,    status: 'active' },
      { id: 12, name: 'Olivia Recruiter',  email: 'olivia@i2speed.com',  role: 'recruiter',   manager_id: 6,    status: 'active' },
    ];

    for (const user of users) {
      await connection.query(
        `INSERT INTO users (id, name, email, password, role, manager_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.name, user.email, hashedPassword, user.role, user.manager_id, user.status]
      );
    }
    console.log(`✅ Seeded ${users.length} users`);

    // --------------------------------------------------------
    // SEED: tasks
    // --------------------------------------------------------
    const now = new Date();
    const addDays = (d, days) => {
      const result = new Date(d);
      result.setDate(result.getDate() + days);
      return result.toISOString().split('T')[0];
    };
    const subHours = (d, hours) => {
      const result = new Date(d);
      result.setHours(result.getHours() - hours);
      return result.toISOString().slice(0, 19).replace('T', ' ');
    };
    const subDays = (d, days) => {
      const result = new Date(d);
      result.setDate(result.getDate() - days);
      return result.toISOString().slice(0, 19).replace('T', ' ');
    };

    const tasks = [
      {
        id: 1, title: 'Source candidates for React Developer',
        description: 'Find and screen at least 10 qualified React Developer candidates from LinkedIn and job boards.',
        assigned_to: 7,  assigned_by: 4, status: 'assigned',    priority: 'high',
        due_date: addDays(now, 5), submitted_at: null, approved_at: null, rejection_reason: null
      },
      {
        id: 2, title: 'Post job description for Node.js Engineer',
        description: 'Create and post a detailed job description for a senior Node.js Engineer position on all platforms.',
        assigned_to: 8,  assigned_by: 4, status: 'assigned',    priority: 'medium',
        due_date: addDays(now, 7), submitted_at: null, approved_at: null, rejection_reason: null
      },
      {
        id: 3, title: 'Schedule interviews for UI/UX Designer',
        description: 'Coordinate with hiring managers and schedule interviews for 5 shortlisted UI/UX Designer candidates.',
        assigned_to: 9,  assigned_by: 5, status: 'in_progress', priority: 'high',
        due_date: addDays(now, 3), submitted_at: null, approved_at: null, rejection_reason: null
      },
      {
        id: 4, title: 'Background verification for selected candidates',
        description: 'Complete background checks for 3 candidates who have received offer letters.',
        assigned_to: 10, assigned_by: 5, status: 'in_progress', priority: 'urgent',
        due_date: addDays(now, 2), submitted_at: null, approved_at: null, rejection_reason: null
      },
      {
        id: 5, title: 'Onboarding documentation for new hires',
        description: 'Prepare and send onboarding documents to 4 new hires joining next week.',
        assigned_to: 11, assigned_by: 6, status: 'submitted',   priority: 'medium',
        due_date: addDays(now, 1), submitted_at: subHours(now, 2), approved_at: null, rejection_reason: null
      },
      {
        id: 6, title: 'Salary negotiation follow-up',
        description: 'Follow up with 3 candidates regarding salary negotiation and finalize offers.',
        assigned_to: 12, assigned_by: 6, status: 'submitted',   priority: 'high',
        due_date: addDays(now, 0), submitted_at: subHours(now, 5), approved_at: null, rejection_reason: null
      },
      {
        id: 7, title: 'LinkedIn sourcing campaign for Data Analyst',
        description: 'Run a targeted LinkedIn sourcing campaign for Data Analyst positions.',
        assigned_to: 7,  assigned_by: 4, status: 'approved',    priority: 'medium',
        due_date: addDays(now, -3), submitted_at: subDays(now, 2), approved_at: subDays(now, 1), rejection_reason: null
      },
      {
        id: 8, title: 'Candidate pipeline report - Q4',
        description: 'Compile a comprehensive candidate pipeline report for Q4 hiring targets.',
        assigned_to: 8,  assigned_by: 4, status: 'approved',    priority: 'low',
        due_date: addDays(now, -5), submitted_at: subDays(now, 4), approved_at: subDays(now, 3), rejection_reason: null
      },
      {
        id: 9, title: 'Cold outreach to passive candidates',
        description: 'Send personalised cold outreach messages to 50 passive candidates for DevOps Engineer role.',
        assigned_to: 9,  assigned_by: 5, status: 'rejected',    priority: 'medium',
        due_date: addDays(now, -1), submitted_at: subDays(now, 3), approved_at: null,
        rejection_reason: 'Outreach messages lacked personalization. Please redo with better targeting.'
      },
      {
        id: 10, title: 'Job fair preparation checklist',
        description: 'Prepare a complete checklist and materials for the upcoming tech job fair.',
        assigned_to: 10, assigned_by: 5, status: 'assigned',    priority: 'low',
        due_date: addDays(now, 10), submitted_at: null, approved_at: null, rejection_reason: null
      },
    ];

    for (const task of tasks) {
      await connection.query(
        `INSERT INTO tasks
           (id, title, description, assigned_to, assigned_by, status, priority,
            due_date, submitted_at, approved_at, rejection_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id, task.title, task.description, task.assigned_to, task.assigned_by,
          task.status, task.priority, task.due_date, task.submitted_at,
          task.approved_at, task.rejection_reason
        ]
      );
    }
    console.log(`✅ Seeded ${tasks.length} tasks`);

    // --------------------------------------------------------
    // SEED: task_comments
    // --------------------------------------------------------
    const comments = [
      { task_id: 1,  user_id: 4,  comment: 'Please focus on candidates with at least 3 years of experience.' },
      { task_id: 1,  user_id: 7,  comment: 'Understood. I have started sourcing on LinkedIn already.' },
      { task_id: 3,  user_id: 9,  comment: 'Two candidates have confirmed their interview slots for Friday.' },
      { task_id: 3,  user_id: 5,  comment: 'Good progress. Please also confirm the remaining 3 by tomorrow.' },
      { task_id: 4,  user_id: 10, comment: 'Submitted background check forms for all 3 candidates.' },
      { task_id: 4,  user_id: 5,  comment: 'One candidate has a discrepancy in their employment history, please investigate.' },
      { task_id: 5,  user_id: 11, comment: 'All documents have been sent and acknowledged by 3 out of 4 new hires.' },
      { task_id: 6,  user_id: 6,  comment: 'Please ensure the salary figures match the approved budget range.' },
      { task_id: 7,  user_id: 7,  comment: 'Campaign completed. Generated 18 qualified leads.' },
      { task_id: 7,  user_id: 4,  comment: 'Excellent work! Campaign exceeded the target.' },
      { task_id: 9,  user_id: 5,  comment: 'The outreach messages lacked personalization. Please redo with better targeting.' },
      { task_id: 9,  user_id: 9,  comment: 'Understood. I will revise and resubmit.' },
    ];

    for (const c of comments) {
      await connection.query(
        `INSERT INTO task_comments (task_id, user_id, comment) VALUES (?, ?, ?)`,
        [c.task_id, c.user_id, c.comment]
      );
    }
    console.log(`✅ Seeded ${comments.length} comments`);

    // --------------------------------------------------------
    // SEED: notifications
    // --------------------------------------------------------
    const notifications = [
      { user_id: 7,  title: 'New Task Assigned',  message: 'You have been assigned: Source candidates for React Developer',           type: 'task_assigned',   ref_id: 1,  is_read: 0 },
      { user_id: 8,  title: 'New Task Assigned',  message: 'You have been assigned: Post job description for Node.js Engineer',       type: 'task_assigned',   ref_id: 2,  is_read: 0 },
      { user_id: 9,  title: 'New Task Assigned',  message: 'You have been assigned: Schedule interviews for UI/UX Designer',          type: 'task_assigned',   ref_id: 3,  is_read: 1 },
      { user_id: 10, title: 'New Task Assigned',  message: 'You have been assigned: Background verification for selected candidates', type: 'task_assigned',   ref_id: 4,  is_read: 1 },
      { user_id: 11, title: 'New Task Assigned',  message: 'You have been assigned: Onboarding documentation for new hires',         type: 'task_assigned',   ref_id: 5,  is_read: 1 },
      { user_id: 12, title: 'New Task Assigned',  message: 'You have been assigned: Salary negotiation follow-up',                    type: 'task_assigned',   ref_id: 6,  is_read: 1 },
      { user_id: 4,  title: 'Task Submitted',     message: 'Noah Recruiter submitted: Onboarding documentation for new hires',       type: 'task_submitted',  ref_id: 5,  is_read: 0 },
      { user_id: 6,  title: 'Task Submitted',     message: 'Olivia Recruiter submitted: Salary negotiation follow-up',                type: 'task_submitted',  ref_id: 6,  is_read: 0 },
      { user_id: 7,  title: 'Task Approved',      message: 'Your task has been approved: LinkedIn sourcing campaign for Data Analyst', type: 'task_approved',  ref_id: 7,  is_read: 1 },
      { user_id: 8,  title: 'Task Approved',      message: 'Your task has been approved: Candidate pipeline report - Q4',             type: 'task_approved',  ref_id: 8,  is_read: 1 },
      { user_id: 9,  title: 'Task Rejected',      message: 'Your task was rejected: Cold outreach to passive candidates',             type: 'task_rejected',   ref_id: 9,  is_read: 0 },
      { user_id: 7,  title: 'New Comment',        message: 'Amrutha Nadiminti commented on: Source candidates for React Developer',        type: 'comment_added',   ref_id: 1,  is_read: 1 },
      { user_id: 9,  title: 'New Comment',        message: 'Mihira Uppalapati commented on: Schedule interviews for UI/UX Designer',         type: 'comment_added',   ref_id: 3,  is_read: 1 },
    ];

    for (const n of notifications) {
      await connection.query(
        `INSERT INTO notifications (user_id, title, message, type, ref_id, is_read)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [n.user_id, n.title, n.message, n.type, n.ref_id, n.is_read]
      );
    }
    console.log(`✅ Seeded ${notifications.length} notifications`);

    // --------------------------------------------------------
    // SEED: audit_logs
    // --------------------------------------------------------
    const logs = [
      { user_id: 1, action: 'CREATE_USER',  target_table: 'users', target_id: 2,  old_value: null, new_value: { name: 'Chanikya Uppalapati', email: 'chanikya@i2speed.com', role: 'manager' },       ip: '127.0.0.1' },
      { user_id: 1, action: 'CREATE_USER',  target_table: 'users', target_id: 3,  old_value: null, new_value: { name: 'David Manager', email: 'david@i2speed.com', role: 'manager' },       ip: '127.0.0.1' },
      { user_id: 2, action: 'CREATE_USER',  target_table: 'users', target_id: 4,  old_value: null, new_value: { name: 'Amrutha Leader',  email: 'amrutha@i2speed.com', role: 'team_leader' },   ip: '127.0.0.1' },
      { user_id: 4, action: 'CREATE_TASK',  target_table: 'tasks', target_id: 1,  old_value: null, new_value: { title: 'Source candidates for React Developer',    assigned_to: 7, status: 'assigned' }, ip: '127.0.0.1' },
      { user_id: 4, action: 'CREATE_TASK',  target_table: 'tasks', target_id: 2,  old_value: null, new_value: { title: 'Post job description for Node.js Engineer', assigned_to: 8, status: 'assigned' }, ip: '127.0.0.1' },
      { user_id: 7, action: 'UPDATE_TASK',  target_table: 'tasks', target_id: 3,  old_value: { status: 'assigned' },   new_value: { status: 'in_progress' }, ip: '127.0.0.1' },
      { user_id: 11,action: 'SUBMIT_TASK',  target_table: 'tasks', target_id: 5,  old_value: { status: 'in_progress' }, new_value: { status: 'submitted' }, ip: '127.0.0.1' },
      { user_id: 4, action: 'APPROVE_TASK', target_table: 'tasks', target_id: 7,  old_value: { status: 'submitted' },  new_value: { status: 'approved' },  ip: '127.0.0.1' },
      { user_id: 5, action: 'REJECT_TASK',  target_table: 'tasks', target_id: 9,  old_value: { status: 'submitted' },  new_value: { status: 'rejected', rejection_reason: 'Outreach messages lacked personalization' }, ip: '127.0.0.1' },
      { user_id: 1, action: 'LOGIN',        target_table: 'users', target_id: 1,  old_value: null, new_value: { action: 'login_success' }, ip: '127.0.0.1' },
    ];

    for (const log of logs) {
      await connection.query(
        `INSERT INTO audit_logs (user_id, action, target_table, target_id, old_value, new_value, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          log.user_id, log.action, log.target_table, log.target_id,
          log.old_value ? JSON.stringify(log.old_value) : null,
          log.new_value ? JSON.stringify(log.new_value) : null,
          log.ip
        ]
      );
    }
    console.log(`✅ Seeded ${logs.length} audit logs`);

    await connection.commit();

    console.log('\n🎉 Database seeded successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Login Credentials (Password: Password@123)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👑 Admin        : admin@i2speed.com');
    console.log('🧑‍💼 Manager      : chanikya@i2speed.com');
    console.log('🧑‍🏫 Team Leader  : amrutha@i2speed.com / mihira@i2speed.com');
    console.log('👨‍💻 Recruiter    : john@i2speed.com/ emma@i2speed.com/ liam@i2speed.com/ mia@i2speed.com/ noah@i2speed.com/ olivia@i2speed.com');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (err) {
    await connection.rollback();
    console.error('❌ Seeding failed:', err.message);
    throw err;
  } finally {
    connection.release();
    process.exit(0);
  }
};

seed();
