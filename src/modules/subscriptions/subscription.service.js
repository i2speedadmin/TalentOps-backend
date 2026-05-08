// ============================================================
// src/modules/subscriptions/subscription.service.js
// FIXED:
//   1. cycleDays calculated from actual starts_at→next_billing_at
//      (not hardcoded 30 days)
//   2. changePlan now creates payment order first, applies only
//      after payment is verified (completePlanChange)
// ============================================================

const crypto = require('crypto');
const db     = require('../../config/db');
const {
  sendRenewalReminderEmail,
  sendSubscriptionExpiredEmail,
  sendPlanChangeEmail,
} = require('../auth/email.service');

const APP_URL = process.env.CLIENT_URL || 'https://talentops.i2speed.com';

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

// ─── Get platform setting ─────────────────────────────────────
const getSetting = async (key, defaultVal) => {
  const [rows] = await db.query(
    'SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  if (!rows.length) return defaultVal;
  const v = rows[0].setting_value;
  if (v === 'true')  return true;
  if (v === 'false') return false;
  if (!isNaN(v))     return Number(v);
  return v ?? defaultVal;
};

// ─── Get current subscription ─────────────────────────────────
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

// ─── Get admin user ───────────────────────────────────────────
const getAdminUser = async (tenantId) => {
  const [rows] = await db.query(
    `SELECT id, name, email FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1`,
    [tenantId]
  );
  return rows[0] || null;
};

// ─── Format date for MySQL ────────────────────────────────────
const fmt = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');

// ============================================================
// CALCULATE PRORATION
// FIXED: uses actual cycle days (starts_at → next_billing_at)
// instead of hardcoded 30 or 365
// ============================================================
const calculateProration = ({ currentAmount, newAmount, startsAt, nextBillingAt }) => {
  if (!nextBillingAt) return {
    days_left_in_cycle: 0, days_used: 0, days_in_cycle: 0,
    credit_amount: 0, charge_amount: Math.round(newAmount * 100) / 100,
    proration: Math.round(newAmount * 100) / 100,
    final_charge: Math.round(newAmount * 100) / 100,
    is_upgrade: newAmount > currentAmount,
  };

  const now         = new Date();
  const renewalDate = new Date(nextBillingAt);
  const startDate   = startsAt ? new Date(startsAt) : new Date(renewalDate.getFullYear(), renewalDate.getMonth() - 1, renewalDate.getDate());

  // Actual cycle length in days
  const cycleDays = Math.max(1, Math.ceil((renewalDate - startDate) / 86400000));
  const daysLeft  = Math.max(0, Math.ceil((renewalDate - now) / 86400000));
  const daysUsed  = cycleDays - daysLeft;

  // Daily rates
  const dailyCurrent  = currentAmount / cycleDays;
  const dailyNew      = newAmount     / cycleDays;

  // Credit = what you've already paid but haven't used
  const creditAmount  = Math.round(dailyCurrent * daysLeft * 100) / 100;

  // Charge = what you owe for remaining days on new plan
  const chargeAmount  = Math.round(dailyNew * daysLeft * 100) / 100;

  const proration    = Math.round((chargeAmount - creditAmount) * 100) / 100;
  const finalCharge  = Math.max(0, proration);

  return {
    days_in_cycle:      cycleDays,
    days_left_in_cycle: daysLeft,
    days_used:          daysUsed,
    credit_amount:      creditAmount,
    charge_amount:      chargeAmount,
    proration,
    final_charge:       finalCharge,
    is_upgrade:         newAmount > currentAmount,
  };
};

// ============================================================
// GET MY SUBSCRIPTION (for company admin dashboard)
// ============================================================
const getMySubscription = async (tenantId) => {
  const sub = await getCurrentSubscription(tenantId);
  if (!sub) return null;

  const [plans] = await db.query(
    'SELECT * FROM plans WHERE is_active = 1 ORDER BY sort_order ASC'
  );

  const daysLeft = sub.next_billing_at
    ? Math.ceil((new Date(sub.next_billing_at) - new Date()) / 86400000)
    : null;

  const startsAt     = sub.starts_at;
  const nextBilling  = sub.next_billing_at;
  const cycleDays    = (startsAt && nextBilling)
    ? Math.max(1, Math.ceil((new Date(nextBilling) - new Date(startsAt)) / 86400000))
    : (sub.billing_cycle === 'annual' ? 365 : 30);

  return {
    subscription: {
      id:               sub.id,
      status:           sub.status,
      plan_id:          sub.plan_id,
      plan_name:        sub.plan_name,
      plan_slug:        sub.plan_slug,
      billing_cycle:    sub.billing_cycle,
      currency:         sub.currency,
      amount:           parseFloat(sub.amount),
      discount_amount:  parseFloat(sub.discount_amount || 0),
      starts_at:        sub.starts_at,
      ends_at:          sub.ends_at,
      next_billing_at:  sub.next_billing_at,
      cancelled_at:     sub.cancelled_at,
      days_in_cycle:    cycleDays,
      days_until_renewal: daysLeft,
      features:         typeof sub.features === 'string' ? JSON.parse(sub.features) : (sub.features || []),
      max_users:        sub.max_users,
      max_tasks:        sub.max_tasks,
      max_storage_gb:   sub.max_storage_gb,
    },
    available_plans: plans.map((p) => ({
      id:                p.id,
      name:              p.name,
      slug:              p.slug,
      description:       p.description,
      is_popular:        p.is_popular,
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

// ============================================================
// PREVIEW PLAN CHANGE (no DB write — just calculate cost)
// ============================================================
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
  const billCycle   = newBillingCycle || sub.billing_cycle;
  const newAmount   = useCurrency === 'USD'
    ? parseFloat(billCycle === 'annual' ? newPlan.price_annual_usd  : newPlan.price_monthly_usd)
    : parseFloat(billCycle === 'annual' ? newPlan.price_annual_inr  : newPlan.price_monthly_inr);

  const proration = calculateProration({
    currentAmount:  parseFloat(sub.amount),
    newAmount,
    startsAt:       sub.starts_at,
    nextBillingAt:  sub.next_billing_at,
  });

  return {
    current_plan:    { id: sub.plan_id, name: sub.plan_name, amount: parseFloat(sub.amount), billing_cycle: sub.billing_cycle },
    new_plan:        { id: newPlan.id,  name: newPlan.name,  amount: newAmount, billing_cycle: billCycle },
    currency:        useCurrency,
    proration,
    starts_at:       sub.starts_at,
    next_billing_at: sub.next_billing_at,
  };
};

// ============================================================
// INITIATE PLAN CHANGE — creates payment order (NO DB change)
// Returns Razorpay order or Stripe session to pay the proration
// ============================================================
const initiatePlanChange = async ({ tenantId, newPlanId, newBillingCycle, currency }) => {
  const sub = await getCurrentSubscription(tenantId);
  if (!sub) throw { status: 404, message: 'No active subscription found.' };

  const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [newPlanId]);
  if (!planRows.length) throw { status: 404, message: 'Plan not found.' };
  const newPlan = planRows[0];

  const useCurrency = currency    || sub.currency;
  const billCycle   = newBillingCycle || sub.billing_cycle;
  const newAmount   = useCurrency === 'USD'
    ? parseFloat(billCycle === 'annual' ? newPlan.price_annual_usd  : newPlan.price_monthly_usd)
    : parseFloat(billCycle === 'annual' ? newPlan.price_annual_inr  : newPlan.price_monthly_inr);

  const proration = calculateProration({
    currentAmount: parseFloat(sub.amount),
    newAmount,
    startsAt:      sub.starts_at,
    nextBillingAt: sub.next_billing_at,
  });

  const dueAmount = proration.final_charge;

  // If no payment needed (downgrade / same price) — apply immediately
  if (dueAmount <= 0) {
    await applyPlanChange({ tenantId, sub, newPlan, billCycle, newAmount, useCurrency, gateway: 'manual', proration });
    return { payment_required: false, message: `Plan changed to ${newPlan.name} immediately (no charge).` };
  }

  // Payment required — create Razorpay order
  const razorpayEnabled = await getSetting('razorpay_enabled', false);
  const stripeEnabled   = await getSetting('stripe_enabled', false);

  if (razorpayEnabled) {
    const keyId     = await getSetting('razorpay_key_id', '');
    const keySecret = await getSetting('razorpay_key_secret', '');
    if (keyId && keySecret) {
      const Razorpay = require('razorpay');
      const rzp      = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const rzpAmt   = useCurrency === 'USD' ? Math.round(dueAmount * 84 * 100) : Math.round(dueAmount * 100);

      const order = await rzp.orders.create({
        amount:   rzpAmt,
        currency: 'INR',
        receipt:  `plan_chg_${tenantId}_${Date.now()}`,
        notes:    {
          tenant_id:    tenantId,
          new_plan_id:  newPlanId,
          billing_cycle: billCycle,
          new_amount:    newAmount,
          currency:      useCurrency,
          type:          'plan_upgrade',
        },
      });

      return {
        payment_required: true,
        gateway:          'razorpay',
        order_id:         order.id,
        key_id:           keyId,
        amount:           order.amount,
        currency:         'INR',
        proration,
        new_plan:         { id: newPlan.id, name: newPlan.name, amount: newAmount },
        description:      `Upgrade to ${newPlan.name} (${billCycle})`,
      };
    }
  }

  if (stripeEnabled) {
    const stripeKey = await getSetting('stripe_secret_key', '');
    if (stripeKey) {
      const stripe  = require('stripe')(stripeKey);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency:     useCurrency.toLowerCase(),
            unit_amount:  Math.round(dueAmount * 100),
            product_data: { name: `Upgrade to ${newPlan.name}`, description: `Proration for ${billCycle} plan` },
          },
          quantity: 1,
        }],
        mode:        'payment',
        success_url: `${APP_URL}/subscription?plan_change=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${APP_URL}/subscription`,
        metadata:    {
          tenant_id:     String(tenantId),
          new_plan_id:   String(newPlanId),
          billing_cycle: billCycle,
          new_amount:    String(newAmount),
          currency:      useCurrency,
          type:          'plan_upgrade',
        },
      });

      return {
        payment_required: true,
        gateway:          'stripe',
        session_id:       session.id,
        session_url:      session.url,
        proration,
        new_plan:         { id: newPlan.id, name: newPlan.name, amount: newAmount },
      };
    }
  }

  throw { status: 503, message: 'No payment gateway configured. Please contact support.' };
};

// ============================================================
// COMPLETE PLAN CHANGE — called after payment verified
// ============================================================
const completePlanChange = async ({
  tenantId, userId,
  gateway, gatewayOrderId, gatewayPaymentId, gatewaySignature,
  stripeSessionId,
  newPlanId, newBillingCycle, currency, ip,
}) => {
  const sub = await getCurrentSubscription(tenantId);
  if (!sub) throw { status: 404, message: 'No active subscription found.' };

  const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [newPlanId]);
  if (!planRows.length) throw { status: 404, message: 'Plan not found.' };
  const newPlan = planRows[0];

  const useCurrency = currency        || sub.currency;
  const billCycle   = newBillingCycle || sub.billing_cycle;
  const newAmount   = useCurrency === 'USD'
    ? parseFloat(billCycle === 'annual' ? newPlan.price_annual_usd : newPlan.price_monthly_usd)
    : parseFloat(billCycle === 'annual' ? newPlan.price_annual_inr : newPlan.price_monthly_inr);

  const proration = calculateProration({
    currentAmount: parseFloat(sub.amount),
    newAmount,
    startsAt:      sub.starts_at,
    nextBillingAt: sub.next_billing_at,
  });

  // Verify Razorpay
  if (gateway === 'razorpay') {
    const keySecret = await getSetting('razorpay_key_secret', '');
    const expected  = crypto
      .createHmac('sha256', keySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest('hex');
    if (expected !== gatewaySignature) throw { status: 400, message: 'Payment verification failed.' };
  }

  // Verify Stripe
  if (gateway === 'stripe') {
    const stripeKey = await getSetting('stripe_secret_key', '');
    const stripe    = require('stripe')(stripeKey);
    const session   = await stripe.checkout.sessions.retrieve(stripeSessionId);
    if (session.payment_status !== 'paid') throw { status: 400, message: 'Payment not completed.' };
  }

  // Apply plan change
  const result = await applyPlanChange({ tenantId, sub, newPlan, billCycle, newAmount, useCurrency, gateway, proration, userId });

  // Record payment
  if (proration.final_charge > 0) {
    const [subs] = await db.query('SELECT id FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', [tenantId]);
    if (subs.length) {
      await db.query(
        `INSERT INTO payments
           (tenant_id, subscription_id, gateway, gateway_order_id, gateway_payment_id, gateway_signature, amount, currency, status, description, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, NOW())`,
        [tenantId, subs[0].id, gateway,
         gatewayOrderId || stripeSessionId || null,
         gatewayPaymentId || null,
         gatewaySignature || null,
         proration.final_charge, useCurrency,
         `Plan upgrade to ${newPlan.name}`]
      );
    }
  }

  if (userId) await audit(userId, tenantId, 'CHANGE_PLAN', sub.id,
    { plan_id: sub.plan_id, amount: sub.amount },
    { plan_id: newPlanId, amount: newAmount }, ip);

  // Send email
  const admin = await getAdminUser(tenantId);
  if (admin) {
    sendPlanChangeEmail({
      to: admin.email, name: admin.name, companyName: sub.tenant_name,
      oldPlan: sub.plan_name, newPlan: newPlan.name,
      amount: newAmount, currency: useCurrency, billingCycle: billCycle,
      effectiveDate: new Date(),
    }).catch(() => {});
  }

  return {
    message:     `Successfully upgraded to ${newPlan.name} (${billCycle}).`,
    new_plan:    newPlan.name,
    new_amount:  newAmount,
    currency:    useCurrency,
    next_billing_at: result.next_billing_at,
  };
};

// ─── Internal: apply the plan swap in DB ──────────────────────
const applyPlanChange = async ({ tenantId, sub, newPlan, billCycle, newAmount, useCurrency, gateway, proration, userId }) => {
  // Cancel current subscription
  await db.query(
    `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'Plan changed'
     WHERE id = ?`,
    [sub.id]
  );

  // New next_billing from now
  const now      = new Date();
  const nextBill = new Date(now);
  billCycle === 'annual'
    ? nextBill.setFullYear(nextBill.getFullYear() + 1)
    : nextBill.setMonth(nextBill.getMonth() + 1);

  await db.query(
    `INSERT INTO subscriptions
       (tenant_id, plan_id, billing_cycle, currency, amount, discount_amount, status, gateway, starts_at, next_billing_at)
     VALUES (?, ?, ?, ?, ?, 0, 'active', ?, NOW(), ?)`,
    [tenantId, newPlan.id, billCycle, useCurrency, newAmount, gateway, fmt(nextBill)]
  );

  // Ensure tenant is active
  await db.query(`UPDATE tenants SET status = 'active' WHERE id = ?`, [tenantId]);

  return { next_billing_at: fmt(nextBill) };
};

// ============================================================
// RENEW SUBSCRIPTION
// ============================================================
const renewSubscription = async ({ tenantId, userId, gateway, gatewayPaymentId, ip }) => {
  const sub = await getCurrentSubscription(tenantId);
  if (!sub) throw { status: 404, message: 'No active subscription found.' };

  const current  = sub.next_billing_at ? new Date(sub.next_billing_at) : new Date();
  const nextBill = new Date(current);
  sub.billing_cycle === 'annual'
    ? nextBill.setFullYear(nextBill.getFullYear() + 1)
    : nextBill.setMonth(nextBill.getMonth() + 1);

  await db.query(
    `UPDATE subscriptions SET status = 'active', next_billing_at = ?, ends_at = NULL WHERE id = ?`,
    [fmt(nextBill), sub.id]
  );

  if (gatewayPaymentId) {
    await db.query(
      `INSERT INTO payments (tenant_id, subscription_id, gateway, gateway_payment_id, amount, currency, status, description, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, 'paid', 'Subscription Renewal', NOW())`,
      [tenantId, sub.id, gateway || 'manual', gatewayPaymentId, sub.amount, sub.currency]
    );
  }

  await db.query(`UPDATE tenants SET status = 'active' WHERE id = ? AND status IN ('trial','suspended')`, [tenantId]);

  if (userId) await audit(userId, tenantId, 'RENEW_SUBSCRIPTION', sub.id,
    { next_billing_at: sub.next_billing_at }, { next_billing_at: fmt(nextBill) }, ip);

  return {
    message:       'Subscription renewed successfully.',
    plan:          sub.plan_name,
    renewed_until: fmt(nextBill),
    amount:        parseFloat(sub.amount),
    currency:      sub.currency,
  };
};

// ============================================================
// CRON — renewal reminders + expire past-due subscriptions
// ============================================================
const processRenewalReminders = async () => {
  const results = { reminders_sent: 0, expired: 0, errors: [] };

  const [upcoming] = await db.query(
    `SELECT s.*, t.name AS tenant_name, p.name AS plan_name,
            u.name AS admin_name, u.email AS admin_email
     FROM subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     JOIN plans   p ON p.id = s.plan_id
     JOIN users   u ON u.tenant_id = s.tenant_id AND u.role = 'admin'
     WHERE s.status = 'active' AND s.next_billing_at IS NOT NULL
       AND s.next_billing_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 11 DAY)
     ORDER BY s.next_billing_at ASC`
  );

  for (const sub of upcoming) {
    const daysLeft = Math.ceil((new Date(sub.next_billing_at) - new Date()) / 86400000);
    if (![10, 5, 1].includes(daysLeft)) continue;
    try {
      await sendRenewalReminderEmail({
        to: sub.admin_email, name: sub.admin_name, companyName: sub.tenant_name,
        planName: sub.plan_name, nextBillingDate: sub.next_billing_at,
        amount: parseFloat(sub.amount), currency: sub.currency,
        renewUrl: `${APP_URL}/subscription`, daysLeft,
      });
      results.reminders_sent++;
    } catch (err) { results.errors.push({ tenant: sub.tenant_name, error: err.message }); }
  }

  const [expired] = await db.query(
    `SELECT s.*, t.name AS tenant_name, p.name AS plan_name,
            u.name AS admin_name, u.email AS admin_email
     FROM subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     JOIN plans   p ON p.id = s.plan_id
     JOIN users   u ON u.tenant_id = s.tenant_id AND u.role = 'admin'
     WHERE s.status = 'active' AND s.next_billing_at < DATE_SUB(NOW(), INTERVAL 1 DAY)`
  );

  for (const sub of expired) {
    try {
      await db.query(`UPDATE subscriptions SET status = 'past_due' WHERE id = ?`, [sub.id]);
      await db.query(`UPDATE tenants SET status = 'suspended' WHERE id = ?`, [sub.tenant_id]);
      await sendSubscriptionExpiredEmail({
        to: sub.admin_email, name: sub.admin_name,
        companyName: sub.tenant_name, planName: sub.plan_name,
        renewUrl: `${APP_URL}/subscription`,
      });
      results.expired++;
    } catch (err) { results.errors.push({ tenant: sub.tenant_name, error: err.message }); }
  }

  return results;
};

module.exports = {
  getMySubscription,
  previewPlanChange,
  initiatePlanChange,
  completePlanChange,
  renewSubscription,
  processRenewalReminders,
  getCurrentSubscription,
};
