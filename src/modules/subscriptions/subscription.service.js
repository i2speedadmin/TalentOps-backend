// ============================================================
// src/modules/subscriptions/subscription.service.js
// Handles: upgrade/downgrade, renewal, plan info for company admin
// ============================================================

const db = require('../../config/db');
const {
  sendRenewalReminderEmail,
  sendSubscriptionExpiredEmail,
  sendPlanChangeEmail,
} = require('../auth/email.service');

const APP_URL = process.env.CLIENT_URL || 'https://i2speed.in';

// ─── Audit ───────────────────────────────────────────────────
const audit = (userId, tenantId, action, targetId, oldVal, newVal, ip) =>
  db.query(
    `INSERT INTO audit_logs
       (tenant_id, user_id, user_type, action, target_table, target_id, old_value, new_value, ip_address)
     VALUES (?, ?, 'user', ?, 'subscriptions', ?, ?, ?, ?)`,
    [tenantId, userId, action, targetId,
     oldVal ? JSON.stringify(oldVal) : null,
     newVal  ? JSON.stringify(newVal)  : null,
     ip || null]
  ).catch(() => {});

// ─── Get current subscription for a tenant ───────────────────
const getCurrentSubscription = async (tenantId) => {
  const [rows] = await db.query(
    `SELECT s.*, p.name AS plan_name, p.slug AS plan_slug,
            p.price_monthly_inr, p.price_annual_inr,
            p.price_monthly_usd, p.price_annual_usd,
            p.max_users, p.max_tasks, p.max_storage_gb, p.features,
            t.name AS tenant_name, t.email AS tenant_email, t.status AS tenant_status
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     JOIN tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = ? AND s.status IN ('active','trialing','past_due')
     ORDER BY s.created_at DESC LIMIT 1`,
    [tenantId]
  );
  return rows[0] || null;
};

// ─── Get company admin user ───────────────────────────────────
const getAdminUser = async (tenantId) => {
  const [rows] = await db.query(
    `SELECT id, name, email FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1`,
    [tenantId]
  );
  return rows[0] || null;
};

// ─── Get subscription + plan info for company admin dashboard ─
const getMySubscription = async (tenantId) => {
  const sub = await getCurrentSubscription(tenantId);
  if (!sub) return null;

  // All available plans for upgrade/downgrade
  const [plans] = await db.query(
    'SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC'
  );

  // Days until next billing
  const daysLeft = sub.next_billing_at
    ? Math.ceil((new Date(sub.next_billing_at) - new Date()) / 86400000)
    : null;

  return {
    subscription: {
      id:             sub.id,
      status:         sub.status,
      plan_id:        sub.plan_id,
      plan_name:      sub.plan_name,
      plan_slug:      sub.plan_slug,
      billing_cycle:  sub.billing_cycle,
      currency:       sub.currency,
      amount:         parseFloat(sub.amount),
      discount_amount: parseFloat(sub.discount_amount || 0),
      starts_at:      sub.starts_at,
      ends_at:        sub.ends_at,
      next_billing_at: sub.next_billing_at,
      cancelled_at:   sub.cancelled_at,
      days_until_renewal: daysLeft,
      features:       typeof sub.features === 'string' ? JSON.parse(sub.features) : (sub.features || []),
      max_users:      sub.max_users,
      max_tasks:      sub.max_tasks,
      max_storage_gb: sub.max_storage_gb,
    },
    available_plans: plans.map((p) => ({
      id:               p.id,
      name:             p.name,
      slug:             p.slug,
      description:      p.description,
      is_popular:       p.is_popular,
      price_monthly_inr: parseFloat(p.price_monthly_inr),
      price_annual_inr:  parseFloat(p.price_annual_inr),
      price_monthly_usd: parseFloat(p.price_monthly_usd),
      price_annual_usd:  parseFloat(p.price_annual_usd),
      max_users:         p.max_users,
      max_tasks:         p.max_tasks,
      max_storage_gb:    p.max_storage_gb,
      features:          typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []),
    })),
  };
};

// ─── Calculate prorated amount for plan change ────────────────
const calculateProration = ({ currentAmount, newAmount, billingCycle, nextBillingAt }) => {
  if (!nextBillingAt) return { proration: 0, finalCharge: newAmount };

  const now         = new Date();
  const renewalDate = new Date(nextBillingAt);
  const cycleDays   = billingCycle === 'annual' ? 365 : 30;
  const daysLeft    = Math.max(0, Math.ceil((renewalDate - now) / 86400000));
  const daysUsed    = cycleDays - daysLeft;

  // Credit for unused days on current plan
  const dailyCurrent = currentAmount / cycleDays;
  const creditAmount = dailyCurrent * daysLeft;

  // Charge for remaining days on new plan
  const dailyNew     = newAmount / cycleDays;
  const chargeAmount = dailyNew * daysLeft;

  const proration    = chargeAmount - creditAmount; // positive = pay more, negative = credit
  const finalCharge  = Math.max(0, Math.round(proration * 100) / 100); // round to 2dp, never negative

  return {
    days_left_in_cycle: daysLeft,
    days_used:          daysUsed,
    credit_amount:      Math.round(creditAmount * 100) / 100,
    charge_amount:      Math.round(chargeAmount * 100) / 100,
    proration:          Math.round(proration * 100) / 100,
    final_charge:       finalCharge,
    is_upgrade:         newAmount > currentAmount,
  };
};

// ─── Preview plan change (no DB write) ───────────────────────
const previewPlanChange = async ({ tenantId, newPlanId, newBillingCycle, currency }) => {
  const sub = await getCurrentSubscription(tenantId);
  if (!sub) throw { status: 404, message: 'No active subscription found.' };

  const [planRows] = await db.query(
    'SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1',
    [newPlanId]
  );
  if (!planRows.length) throw { status: 404, message: 'Plan not found.' };
  const newPlan = planRows[0];

  const useCurrency = currency || sub.currency;
  const newAmount   = useCurrency === 'USD'
    ? parseFloat(newBillingCycle === 'annual' ? newPlan.price_annual_usd : newPlan.price_monthly_usd)
    : parseFloat(newBillingCycle === 'annual' ? newPlan.price_annual_inr : newPlan.price_monthly_inr);

  const proration = calculateProration({
    currentAmount:  parseFloat(sub.amount),
    newAmount,
    billingCycle:   sub.billing_cycle,
    nextBillingAt:  sub.next_billing_at,
  });

  return {
    current_plan:  { id: sub.plan_id, name: sub.plan_name, amount: parseFloat(sub.amount), billing_cycle: sub.billing_cycle },
    new_plan:      { id: newPlan.id,   name: newPlan.name,  amount: newAmount, billing_cycle: newBillingCycle || sub.billing_cycle },
    currency:      useCurrency,
    proration,
    next_billing_at: sub.next_billing_at,
    effective:     'immediate',
  };
};

// ─── Execute plan change ──────────────────────────────────────
const changePlan = async ({ tenantId, userId, newPlanId, newBillingCycle, currency, ip }) => {
  const sub = await getCurrentSubscription(tenantId);
  if (!sub) throw { status: 404, message: 'No active subscription found.' };

  const [planRows] = await db.query(
    'SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1',
    [newPlanId]
  );
  if (!planRows.length) throw { status: 404, message: 'Plan not found.' };
  const newPlan = planRows[0];

  const billCycle   = newBillingCycle || sub.billing_cycle;
  const useCurrency = currency        || sub.currency;
  const newAmount   = useCurrency === 'USD'
    ? parseFloat(billCycle === 'annual' ? newPlan.price_annual_usd : newPlan.price_monthly_usd)
    : parseFloat(billCycle === 'annual' ? newPlan.price_annual_inr : newPlan.price_monthly_inr);

  const proration = calculateProration({
    currentAmount: parseFloat(sub.amount),
    newAmount,
    billingCycle:  sub.billing_cycle,
    nextBillingAt: sub.next_billing_at,
  });

  // Calculate new next_billing_at from now
  const now      = new Date();
  const nextBill = new Date(now);
  billCycle === 'annual'
    ? nextBill.setFullYear(nextBill.getFullYear() + 1)
    : nextBill.setMonth(nextBill.getMonth() + 1);

  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  // Cancel current subscription
  await db.query(
    `UPDATE subscriptions
     SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'Plan changed by user'
     WHERE id = ?`,
    [sub.id]
  );

  // Create new subscription
  const [newSub] = await db.query(
    `INSERT INTO subscriptions
       (tenant_id, plan_id, billing_cycle, currency, amount, discount_amount,
        status, gateway, starts_at, next_billing_at)
     VALUES (?, ?, ?, ?, ?, 0, 'active', ?, NOW(), ?)`,
    [tenantId, newPlanId, billCycle, useCurrency, newAmount, sub.gateway, fmt(nextBill)]
  );

  await audit(userId, tenantId, 'CHANGE_PLAN', newSub.insertId,
    { plan_id: sub.plan_id, amount: sub.amount, billing_cycle: sub.billing_cycle },
    { plan_id: newPlanId,   amount: newAmount,   billing_cycle: billCycle }, ip);

  // Send plan change email
  const admin = await getAdminUser(tenantId);
  if (admin) {
    sendPlanChangeEmail({
      to:           admin.email,
      name:         admin.name,
      companyName:  sub.tenant_name,
      oldPlan:      sub.plan_name,
      newPlan:      newPlan.name,
      amount:       newAmount,
      currency:     useCurrency,
      billingCycle: billCycle,
      effectiveDate: new Date(),
    }).catch(() => {});
  }

  return {
    message:      `Plan changed to ${newPlan.name} (${billCycle}) successfully.`,
    new_plan:     newPlan.name,
    new_amount:   newAmount,
    currency:     useCurrency,
    proration,
    next_billing_at: fmt(nextBill),
  };
};

// ─── Renew subscription (extend next_billing_at by 1 cycle) ───
const renewSubscription = async ({ tenantId, userId, gateway, gatewayPaymentId, ip }) => {
  const sub = await getCurrentSubscription(tenantId);
  if (!sub) throw { status: 404, message: 'No active subscription found.' };

  const current   = sub.next_billing_at ? new Date(sub.next_billing_at) : new Date();
  const nextBill  = new Date(current);
  sub.billing_cycle === 'annual'
    ? nextBill.setFullYear(nextBill.getFullYear() + 1)
    : nextBill.setMonth(nextBill.getMonth() + 1);

  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  await db.query(
    `UPDATE subscriptions
     SET status = 'active', next_billing_at = ?, ends_at = NULL
     WHERE id = ?`,
    [fmt(nextBill), sub.id]
  );

  // Record renewal payment
  if (gatewayPaymentId) {
    await db.query(
      `INSERT INTO payments
         (tenant_id, subscription_id, gateway, gateway_payment_id, amount, currency, status, description, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, 'paid', 'Subscription Renewal', NOW())`,
      [tenantId, sub.id, gateway || 'manual', gatewayPaymentId,
       sub.amount, sub.currency]
    );
  }

  // Update tenant status to active if it was past_due
  await db.query(
    `UPDATE tenants SET status = 'active' WHERE id = ? AND status IN ('trial','suspended')`,
    [tenantId]
  );

  await audit(userId, tenantId, 'RENEW_SUBSCRIPTION', sub.id,
    { next_billing_at: sub.next_billing_at },
    { next_billing_at: fmt(nextBill) }, ip);

  return {
    message:        'Subscription renewed successfully.',
    plan:           sub.plan_name,
    renewed_until:  fmt(nextBill),
    amount:         parseFloat(sub.amount),
    currency:       sub.currency,
  };
};

// ============================================================
// CRON JOB — Check renewals & send reminder emails
// Call this daily via a cron job or Render scheduled job
// POST /api/internal/cron/subscription-reminders
// ============================================================
const processRenewalReminders = async () => {
  const results = { reminders_sent: 0, expired: 0, errors: [] };

  // Find subscriptions expiring in 10, 5, 1 days
  const [upcoming] = await db.query(
    `SELECT s.*, t.name AS tenant_name, t.email AS tenant_email,
             p.name AS plan_name, u.name AS admin_name, u.email AS admin_email
     FROM subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     JOIN plans   p ON p.id = s.plan_id
     JOIN users   u ON u.tenant_id = s.tenant_id AND u.role = 'admin'
     WHERE s.status = 'active'
       AND s.next_billing_at IS NOT NULL
       AND s.next_billing_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 11 DAY)
     ORDER BY s.next_billing_at ASC`
  );

  for (const sub of upcoming) {
    const daysLeft = Math.ceil((new Date(sub.next_billing_at) - new Date()) / 86400000);

    // Only send on exactly 10, 5, 1 days
    if (![10, 5, 1].includes(daysLeft)) continue;

    try {
      await sendRenewalReminderEmail({
        to:             sub.admin_email,
        name:           sub.admin_name,
        companyName:    sub.tenant_name,
        planName:       sub.plan_name,
        nextBillingDate: sub.next_billing_at,
        amount:         parseFloat(sub.amount),
        currency:       sub.currency,
        renewUrl:       `${APP_URL}/dashboard?tab=subscription`,
        daysLeft,
      });
      results.reminders_sent++;
    } catch (err) {
      results.errors.push({ tenant: sub.tenant_name, error: err.message });
    }
  }

  // Find expired subscriptions (next_billing_at passed, still 'active')
  const [expired] = await db.query(
    `SELECT s.*, t.name AS tenant_name, p.name AS plan_name,
             u.name AS admin_name, u.email AS admin_email
     FROM subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     JOIN plans   p ON p.id = s.plan_id
     JOIN users   u ON u.tenant_id = s.tenant_id AND u.role = 'admin'
     WHERE s.status = 'active'
       AND s.next_billing_at < DATE_SUB(NOW(), INTERVAL 1 DAY)`
  );

  for (const sub of expired) {
    try {
      // Mark subscription as past_due
      await db.query(
        `UPDATE subscriptions SET status = 'past_due' WHERE id = ?`,
        [sub.id]
      );
      // Suspend tenant
      await db.query(
        `UPDATE tenants SET status = 'suspended' WHERE id = ?`,
        [sub.tenant_id]
      );

      await sendSubscriptionExpiredEmail({
        to:          sub.admin_email,
        name:        sub.admin_name,
        companyName: sub.tenant_name,
        planName:    sub.plan_name,
        renewUrl:    `${APP_URL}/dashboard?tab=subscription`,
      });
      results.expired++;
    } catch (err) {
      results.errors.push({ tenant: sub.tenant_name, error: err.message });
    }
  }

  return results;
};

module.exports = {
  getMySubscription,
  previewPlanChange,
  changePlan,
  renewSubscription,
  processRenewalReminders,
  getCurrentSubscription,
};
