// ============================================================
// src/modules/subscriptions/signup.service.js
// FIXED FLOW:
//   FREE (promo = 100%): validate → register → activate immediately
//   PAID:  validate → create payment order (no DB write) →
//          user pays → on success → register + activate
// ============================================================

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../../config/db');
const { getSettingValue }  = require('../platformSettings/settings.service');
const { validatePromoCode } = require('../promoCodes/promoCode.service');

// ─── Helpers ──────────────────────────────────────────────────
const generateUserToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, email: user.email, tenant_id: user.tenant_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const makeSlug = (name) => {
  const base = name.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
  return base + '-' + crypto.randomBytes(3).toString('hex');
};

const calculatePrice = (base, promo) => {
  if (!promo) return base;
  if (promo.discount_type === 'percent')
    return Math.max(0, base - (base * promo.discount_value / 100));
  if (promo.discount_type.startsWith('flat'))
    return Math.max(0, base - promo.discount_value);
  return base;
};

// ============================================================
// STEP 1 — VALIDATE (no DB writes, just return price + info)
// Called when user clicks "Create Account & Pay"
// ============================================================
const validateSignup = async ({ email, planId, billingCycle = 'monthly', currency = 'INR', promoCode }) => {
  const allowSignups = await getSettingValue('allow_signups', true);
  if (!allowSignups) throw { status: 403, message: 'New signups are currently closed.' };

  // Check email not taken
  const [existing] = await db.query(
    'SELECT id FROM tenants WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );
  if (existing.length) throw { status: 409, message: 'An account with this email already exists.' };

  // Validate plan
  const [planRows] = await db.query(
    'SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1',
    [planId]
  );
  if (!planRows.length) throw { status: 400, message: 'Selected plan not found or inactive.' };
  const plan = planRows[0];

  // Validate promo
  let promoData = null;
  if (promoCode) {
    promoData = await validatePromoCode({ code: promoCode, planId, billingCycle, currency });
  }

  const basePrice     = currency === 'USD'
    ? (billingCycle === 'annual' ? parseFloat(plan.price_annual_usd) : parseFloat(plan.price_monthly_usd))
    : (billingCycle === 'annual' ? parseFloat(plan.price_annual_inr) : parseFloat(plan.price_monthly_inr));
  const discountAmount = promoData ? (basePrice - calculatePrice(basePrice, promoData)) : 0;
  const finalAmount    = calculatePrice(basePrice, promoData);

  return {
    valid:           true,
    plan:            { id: plan.id, name: plan.name, slug: plan.slug },
    base_price:      basePrice,
    discount_amount: discountAmount,
    final_amount:    finalAmount,
    currency,
    billing_cycle:   billingCycle,
    is_free:         finalAmount === 0,
    promo_data:      promoData,
  };
};

// ============================================================
// STEP 2a — CREATE RAZORPAY ORDER (no DB tenant created yet)
// ============================================================
const createRazorpayOrder = async ({ planId, billingCycle, currency, finalAmount, email, description }) => {
  const razorpayEnabled = await getSettingValue('razorpay_enabled', false);
  if (!razorpayEnabled) throw { status: 400, message: 'Razorpay is currently disabled.' };

  const keyId     = await getSettingValue('razorpay_key_id', '');
  const keySecret = await getSettingValue('razorpay_key_secret', '');
  if (!keyId || !keySecret) throw { status: 500, message: 'Razorpay credentials not configured. Contact support.' };

  const Razorpay = require('razorpay');
  const rzp      = new Razorpay({ key_id: keyId, key_secret: keySecret });

  // Razorpay only accepts INR; convert USD amount
  const rzpAmount = currency === 'USD'
    ? Math.round(finalAmount * 84 * 100)  // approx USD→INR
    : Math.round(finalAmount * 100);      // paise

  const order = await rzp.orders.create({
    amount:   rzpAmount,
    currency: 'INR',
    receipt:  `signup_${Date.now()}`,
    notes:    { plan_id: planId, billing_cycle: billingCycle, email, original_currency: currency, original_amount: finalAmount },
  });

  return {
    order_id:    order.id,
    key_id:      keyId,
    amount:      order.amount,
    currency:    'INR',
    description: description || 'TalentOps Subscription',
  };
};

// ============================================================
// STEP 2b — CREATE STRIPE SESSION (no DB tenant created yet)
// ============================================================
const createStripeSession = async ({ planId, billingCycle, finalAmount, currency, successUrl, cancelUrl }) => {
  const stripeEnabled = await getSettingValue('stripe_enabled', false);
  if (!stripeEnabled) throw { status: 400, message: 'Stripe is currently disabled.' };

  const stripeKey = await getSettingValue('stripe_secret_key', '');
  if (!stripeKey) throw { status: 500, message: 'Stripe not configured. Contact support.' };

  const stripe  = require('stripe')(stripeKey);
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency:     currency.toLowerCase(),
        unit_amount:  Math.round(finalAmount * 100),
        product_data: { name: 'TalentOps Subscription', description: `${billingCycle} plan` },
      },
      quantity: 1,
    }],
    mode:        'payment',
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  cancelUrl,
    metadata:    { plan_id: String(planId), billing_cycle: billingCycle },
  });

  return { session_id: session.id, session_url: session.url };
};

// ============================================================
// STEP 3 — COMPLETE REGISTRATION
// Called ONLY after payment is confirmed
// Creates tenant + user + subscription + activates account
// ============================================================
const completeRegistration = async ({
  companyName, adminName, email, password, phone, industry, size,
  planId, billingCycle, currency, promoCode,
  gateway, gatewayOrderId, gatewayPaymentId, gatewaySignature,
  stripeSessionId,
  ip,
}) => {
  // ── Re-validate everything ────────────────────────────────
  const [existing] = await db.query('SELECT id FROM tenants WHERE email = ? LIMIT 1', [email.toLowerCase()]);
  if (existing.length) throw { status: 409, message: 'An account with this email already exists.' };

  const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [planId]);
  if (!planRows.length) throw { status: 400, message: 'Plan not found.' };
  const plan = planRows[0];

  let promoData = null;
  if (promoCode) {
    promoData = await validatePromoCode({ code: promoCode, planId, billingCycle, currency }).catch(() => null);
  }

  const basePrice      = currency === 'USD'
    ? (billingCycle === 'annual' ? parseFloat(plan.price_annual_usd) : parseFloat(plan.price_monthly_usd))
    : (billingCycle === 'annual' ? parseFloat(plan.price_annual_inr) : parseFloat(plan.price_monthly_inr));
  const discountAmount = promoData ? (basePrice - calculatePrice(basePrice, promoData)) : 0;
  const finalAmount    = calculatePrice(basePrice, promoData);

  // ── Verify payment signature (Razorpay) ───────────────────
  if (gateway === 'razorpay') {
    const keySecret = await getSettingValue('razorpay_key_secret', '');
    const expected  = crypto
      .createHmac('sha256', keySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest('hex');
    if (expected !== gatewaySignature) {
      throw { status: 400, message: 'Payment verification failed. Please contact support.' };
    }
  }

  // ── Verify Stripe session ─────────────────────────────────
  if (gateway === 'stripe') {
    const stripeKey = await getSettingValue('stripe_secret_key', '');
    const stripe    = require('stripe')(stripeKey);
    const session   = await stripe.checkout.sessions.retrieve(stripeSessionId);
    if (session.payment_status !== 'paid') {
      throw { status: 400, message: 'Stripe payment not completed.' };
    }
  }

  // ── Now create the tenant (payment confirmed) ─────────────
  const trialDays = await getSettingValue('trial_days', 14);
  const trialEnd  = new Date();
  trialEnd.setDate(trialEnd.getDate() + parseInt(trialDays));

  const slug = makeSlug(companyName);
  const [tenantResult] = await db.query(
    `INSERT INTO tenants (name, slug, email, phone, industry, size, status, trial_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', NULL)`,
    // status='active' immediately since payment is confirmed, no trial needed
    [companyName, slug, email.toLowerCase(), phone || null, industry || null, size || null]
  );
  const tenantId = tenantResult.insertId;

  // ── Create admin user ─────────────────────────────────────
  const hashedPw = await bcrypt.hash(password, 10);
  const [userResult] = await db.query(
    `INSERT INTO users (tenant_id, name, email, password, role, status)
     VALUES (?, ?, ?, ?, 'admin', 'active')`,
    [tenantId, adminName, email.toLowerCase(), hashedPw]
  );
  const userId = userResult.insertId;

  // ── Create subscription (active) ─────────────────────────
  const now      = new Date();
  const starts   = now.toISOString().slice(0, 19).replace('T', ' ');
  const nextBill = new Date(now);
  billingCycle === 'annual'
    ? nextBill.setFullYear(nextBill.getFullYear() + 1)
    : nextBill.setMonth(nextBill.getMonth() + 1);

  const [subResult] = await db.query(
    `INSERT INTO subscriptions
       (tenant_id, plan_id, billing_cycle, currency, amount, discount_amount,
        status, gateway, promo_code_id, starts_at, next_billing_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    [tenantId, planId, billingCycle, currency, finalAmount, discountAmount,
     gateway, promoData?.promo_code_id || null,
     starts, nextBill.toISOString().slice(0, 19).replace('T', ' ')]
  );

  // ── Record payment ─────────────────────────────────────────
  await db.query(
    `INSERT INTO payments
       (tenant_id, subscription_id, gateway, gateway_order_id, gateway_payment_id,
        gateway_signature, amount, currency, status, description, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'TalentOps Subscription', NOW())`,
    [
      tenantId, subResult.insertId, gateway,
      gatewayOrderId || stripeSessionId || null,
      gatewayPaymentId || null,
      gatewaySignature || null,
      finalAmount, currency,
    ]
  );

  // ── Welcome notification ───────────────────────────────────
  await db.query(
    `INSERT INTO notifications (tenant_id, user_id, title, message, type)
     VALUES (?, ?, 'Welcome to TalentOps! 🎉', ?, 'general')`,
    [tenantId, userId, `Hi ${adminName}! Your ${plan.name} subscription is now active.`]
  );

  const user  = { id: userId, tenant_id: tenantId, role: 'admin', email: email.toLowerCase() };
  const token = generateUserToken(user);

  return {
    token,
    user:    { id: userId, name: adminName, email: email.toLowerCase(), role: 'admin', tenant_id: tenantId },
    tenant:  { id: tenantId, name: companyName, slug },
    message: `Account created and subscription activated. Welcome to TalentOps!`,
  };
};

// ============================================================
// FREE REGISTRATION (promo = 100% discount, no payment)
// Creates tenant on trial immediately
// ============================================================
const registerFree = async ({
  companyName, adminName, email, password, phone, industry, size,
  planId, billingCycle, currency, promoCode, ip,
}) => {
  const allowSignups = await getSettingValue('allow_signups', true);
  if (!allowSignups) throw { status: 403, message: 'New signups are currently closed.' };

  const [existing] = await db.query('SELECT id FROM tenants WHERE email = ? LIMIT 1', [email.toLowerCase()]);
  if (existing.length) throw { status: 409, message: 'An account with this email already exists.' };

  const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [planId]);
  if (!planRows.length) throw { status: 400, message: 'Plan not found.' };
  const plan = planRows[0];

  let promoData = null;
  if (promoCode) {
    promoData = await validatePromoCode({ code: promoCode, planId, billingCycle, currency });
  }

  const basePrice     = currency === 'USD'
    ? (billingCycle === 'annual' ? parseFloat(plan.price_annual_usd) : parseFloat(plan.price_monthly_usd))
    : (billingCycle === 'annual' ? parseFloat(plan.price_annual_inr) : parseFloat(plan.price_monthly_inr));
  const finalAmount   = calculatePrice(basePrice, promoData);

  // Must be free
  if (finalAmount > 0) throw { status: 400, message: 'Payment is required for this plan.' };

  const trialDays = await getSettingValue('trial_days', 14);
  const trialEnd  = new Date();
  trialEnd.setDate(trialEnd.getDate() + parseInt(trialDays));

  const slug = makeSlug(companyName);
  const [tenantResult] = await db.query(
    `INSERT INTO tenants (name, slug, email, phone, industry, size, status, trial_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, 'trial', ?)`,
    [companyName, slug, email.toLowerCase(), phone || null, industry || null, size || null,
     trialEnd.toISOString().slice(0, 19).replace('T', ' ')]
  );
  const tenantId = tenantResult.insertId;

  const hashedPw = await bcrypt.hash(password, 10);
  const [userResult] = await db.query(
    `INSERT INTO users (tenant_id, name, email, password, role, status)
     VALUES (?, ?, ?, ?, 'admin', 'active')`,
    [tenantId, adminName, email.toLowerCase(), hashedPw]
  );
  const userId = userResult.insertId;

  const now    = new Date();
  const starts = now.toISOString().slice(0, 19).replace('T', ' ');
  const nextBill = new Date(now);
  billingCycle === 'annual'
    ? nextBill.setFullYear(nextBill.getFullYear() + 1)
    : nextBill.setMonth(nextBill.getMonth() + 1);

  await db.query(
    `INSERT INTO subscriptions
       (tenant_id, plan_id, billing_cycle, currency, amount, discount_amount,
        status, gateway, promo_code_id, starts_at, next_billing_at)
     VALUES (?, ?, ?, ?, 0, ?, 'trialing', 'manual', ?, ?, ?)`,
    [tenantId, planId, billingCycle, currency,
     basePrice, // full discount
     promoData?.promo_code_id || null,
     starts, nextBill.toISOString().slice(0, 19).replace('T', ' ')]
  );

  await db.query(
    `INSERT INTO notifications (tenant_id, user_id, title, message, type)
     VALUES (?, ?, 'Welcome to TalentOps! 🎉', ?, 'general')`,
    [tenantId, userId, `Hi ${adminName}! Your ${trialDays}-day free trial is active.`]
  );

  const user  = { id: userId, tenant_id: tenantId, role: 'admin', email: email.toLowerCase() };
  const token = generateUserToken(user);

  return {
    token,
    user:    { id: userId, name: adminName, email: email.toLowerCase(), role: 'admin', tenant_id: tenantId },
    tenant:  { id: tenantId, name: companyName, slug },
    trial_ends_at: trialEnd.toISOString(),
    message: `Welcome! Your ${trialDays}-day free trial has started.`,
  };
};

module.exports = {
  validateSignup,
  createRazorpayOrder,
  createStripeSession,
  completeRegistration,
  registerFree,
};
