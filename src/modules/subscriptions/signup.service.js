// ============================================================
// src/modules/subscriptions/signup.service.js
// FIXED: auto-login token returned, failed payment cleanup,
//        gateway currency flexibility, Resend API for email
// ============================================================

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../../config/db');
const { getSettingValue } = require('../platformSettings/settings.service');
const { validatePromoCode } = require('../promoCodes/promoCode.service');

// ─── Generate user JWT ────────────────────────────────────────
const generateUserToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, email: user.email, tenant_id: user.tenant_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ─── Slug generator ───────────────────────────────────────────
const makeSlug = (name) => {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 40);
  return base + '-' + crypto.randomBytes(3).toString('hex');
};

// ─── Discount calculator ──────────────────────────────────────
const calculatePrice = (base, promo) => {
  if (!promo) return base;
  if (promo.discount_type === 'percent')   return Math.max(0, base - (base * promo.discount_value / 100));
  if (promo.discount_type.startsWith('flat')) return Math.max(0, base - promo.discount_value);
  return base;
};

// ─── Cleanup failed registration ──────────────────────────────
const cleanupRegistration = async (tenantId) => {
  if (!tenantId) return;
  try {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('DELETE FROM notifications WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM subscriptions  WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM payments       WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM users          WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM tenants        WHERE id = ?',        [tenantId]);
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
  } catch (e) { console.error('Cleanup error:', e.message); }
};

// ============================================================
// REGISTER COMPANY
// ============================================================
const registerCompany = async ({ companyName, adminName, email, password, phone, industry, size, planId, billingCycle = 'monthly', currency = 'INR', promoCode, ip }) => {
  const allowSignups = await getSettingValue('allow_signups', true);
  if (!allowSignups) throw { status: 403, message: 'New signups are currently closed.' };

  const [existingTenant] = await db.query('SELECT id FROM tenants WHERE email = ? LIMIT 1', [email.toLowerCase()]);
  if (existingTenant.length) throw { status: 409, message: 'An account with this email already exists.' };

  const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [planId]);
  if (!planRows.length) throw { status: 400, message: 'Selected plan not found or inactive.' };
  const plan = planRows[0];

  let promoData = null;
  if (promoCode) {
    try {
      promoData = await validatePromoCode({ code: promoCode, planId, billingCycle, currency });
    } catch (err) { throw { status: 400, message: err.message }; }
  }

  // Calculate amount
  const basePrice = currency === 'USD'
    ? (billingCycle === 'annual' ? parseFloat(plan.price_annual_usd) : parseFloat(plan.price_monthly_usd))
    : (billingCycle === 'annual' ? parseFloat(plan.price_annual_inr) : parseFloat(plan.price_monthly_inr));

  const discountAmount = promoData ? (basePrice - calculatePrice(basePrice, promoData)) : 0;
  const finalAmount    = calculatePrice(basePrice, promoData);

  const trialDays = await getSettingValue('trial_days', 14);
  const trialEnd  = new Date();
  trialEnd.setDate(trialEnd.getDate() + parseInt(trialDays));

  const slug   = makeSlug(companyName);
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

  const now      = new Date();
  const starts   = now.toISOString().slice(0, 19).replace('T', ' ');
  const nextBill = new Date(now);
  billingCycle === 'annual' ? nextBill.setFullYear(nextBill.getFullYear() + 1) : nextBill.setMonth(nextBill.getMonth() + 1);

  const [subResult] = await db.query(
    `INSERT INTO subscriptions
       (tenant_id, plan_id, billing_cycle, currency, amount, discount_amount, status, gateway, promo_code_id, starts_at, next_billing_at)
     VALUES (?, ?, ?, ?, ?, ?, 'trialing', 'razorpay', ?, ?, ?)`,
    [tenantId, planId, billingCycle, currency, finalAmount, discountAmount,
     promoData?.promo_code_id || null, starts, nextBill.toISOString().slice(0, 19).replace('T', ' ')]
  );

  await db.query(
    `INSERT INTO notifications (tenant_id, user_id, title, message, type)
     VALUES (?, ?, 'Welcome to TalentOps! 🎉', ?, 'general')`,
    [tenantId, userId, `Hi ${adminName}! Your ${plan.name} trial is active for ${trialDays} days.`]
  );

  // Generate JWT token immediately so frontend can use it for payment
  const user = { id: userId, tenant_id: tenantId, role: 'admin', email: email.toLowerCase() };
  const token = generateUserToken(user);

  return {
    token,
    user:           { id: userId, name: adminName, email: email.toLowerCase(), role: 'admin', tenant_id: tenantId },
    tenant:         { id: tenantId, name: companyName, slug, email: email.toLowerCase() },
    subscription_id: subResult.insertId,
    plan:           { id: plan.id, name: plan.name },
    trial_ends_at:  trialEnd.toISOString(),
    amount:         finalAmount,
    discount:       discountAmount,
    currency,
    billing_cycle:  billingCycle,
    promo_applied:  promoData ? promoCode : null,
    message:        `Welcome! Your ${trialDays}-day trial has started.`,
  };
};

// ============================================================
// INITIATE RAZORPAY
// ============================================================
const initiateRazorpayPayment = async ({ tenantId, subscriptionId, amount, currency = 'INR', description }) => {
  const razorpayEnabled = await getSettingValue('razorpay_enabled', false);
  if (!razorpayEnabled) throw { status: 400, message: 'Razorpay is currently disabled.' };

  const keyId     = await getSettingValue('razorpay_key_id', '');
  const keySecret = await getSettingValue('razorpay_key_secret', '');
  if (!keyId || !keySecret) throw { status: 500, message: 'Razorpay credentials not configured.' };

  const Razorpay = require('razorpay');
  const rzp      = new Razorpay({ key_id: keyId, key_secret: keySecret });

  // Razorpay only supports INR. Convert USD to INR if needed (use live rate or fixed)
  const rzpCurrency = 'INR';
  const rzpAmount   = currency === 'USD' ? Math.round(amount * 84 * 100) : Math.round(amount * 100); // 84 = approx rate

  const order = await rzp.orders.create({
    amount:   rzpAmount,
    currency: rzpCurrency,
    receipt:  `sub_${subscriptionId}_${Date.now()}`,
    notes:    { tenant_id: tenantId, subscription_id: subscriptionId, original_currency: currency, original_amount: amount },
  });

  await db.query(
    `INSERT INTO payments (tenant_id, subscription_id, gateway, gateway_order_id, amount, currency, status, description)
     VALUES (?, ?, 'razorpay', ?, ?, 'INR', 'created', ?)`,
    [tenantId, subscriptionId, order.id, rzpAmount / 100, description || 'TalentOps Subscription']
  );

  return {
    order_id:    order.id,
    key_id:      keyId,
    amount:      order.amount,
    currency:    rzpCurrency,
    description: description || 'TalentOps Subscription',
  };
};

// ============================================================
// VERIFY RAZORPAY
// ============================================================
const verifyRazorpayPayment = async ({ orderId, paymentId, signature, tenantId }) => {
  const keySecret = await getSettingValue('razorpay_key_secret', '');
  const expected  = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  if (expected !== signature) throw { status: 400, message: 'Payment verification failed.' };

  await db.query(
    `UPDATE payments SET gateway_payment_id = ?, gateway_signature = ?, status = 'paid', paid_at = NOW()
     WHERE gateway_order_id = ? AND tenant_id = ?`,
    [paymentId, signature, orderId, tenantId]
  );
  await db.query(`UPDATE subscriptions SET status = 'active' WHERE tenant_id = ? AND status = 'trialing'`, [tenantId]);
  await db.query(`UPDATE tenants SET status = 'active', trial_ends_at = NULL WHERE id = ?`, [tenantId]);

  const [adminUser] = await db.query('SELECT id FROM users WHERE tenant_id = ? AND role = "admin" LIMIT 1', [tenantId]);
  if (adminUser.length) {
    await db.query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type)
       VALUES (?, ?, 'Payment Successful! ✅', 'Your subscription is now active. Thank you!', 'subscription')`,
      [tenantId, adminUser[0].id]
    );
  }
  return { success: true, message: 'Payment verified. Subscription activated.' };
};

// ============================================================
// INITIATE STRIPE
// ============================================================
const initiateStripePayment = async ({ tenantId, subscriptionId, planId, billingCycle, amount, currency = 'usd', successUrl, cancelUrl }) => {
  const stripeEnabled = await getSettingValue('stripe_enabled', false);
  if (!stripeEnabled) throw { status: 400, message: 'Stripe is currently disabled.' };

  const stripeKey = await getSettingValue('stripe_secret_key', '');
  if (!stripeKey) throw { status: 500, message: 'Stripe not configured.' };

  const stripe  = require('stripe')(stripeKey);
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency:     currency.toLowerCase(),
        unit_amount:  Math.round(amount * 100),
        product_data: { name: 'TalentOps Subscription', description: `${billingCycle} plan` },
      },
      quantity: 1,
    }],
    mode:        'payment',
    success_url: successUrl + `?session_id={CHECKOUT_SESSION_ID}&tenant_id=${tenantId}`,
    cancel_url:  cancelUrl,
    metadata:    { tenant_id: String(tenantId), subscription_id: String(subscriptionId) },
  });

  await db.query(
    `INSERT INTO payments (tenant_id, subscription_id, gateway, gateway_order_id, amount, currency, status, description)
     VALUES (?, ?, 'stripe', ?, ?, ?, 'created', 'TalentOps Subscription')`,
    [tenantId, subscriptionId, session.id, amount, currency.toUpperCase()]
  );

  return { session_id: session.id, session_url: session.url };
};

// ============================================================
// VERIFY STRIPE
// ============================================================
const verifyStripePayment = async ({ sessionId, tenantId }) => {
  const stripeKey = await getSettingValue('stripe_secret_key', '');
  const stripe    = require('stripe')(stripeKey);
  const session   = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== 'paid') throw { status: 400, message: 'Payment not completed.' };

  await db.query(
    `UPDATE payments SET gateway_payment_id = ?, status = 'paid', paid_at = NOW()
     WHERE gateway_order_id = ? AND tenant_id = ?`,
    [session.payment_intent, sessionId, tenantId]
  );
  await db.query(`UPDATE subscriptions SET status = 'active' WHERE tenant_id = ? AND status = 'trialing'`, [tenantId]);
  await db.query(`UPDATE tenants SET status = 'active', trial_ends_at = NULL WHERE id = ?`, [tenantId]);

  return { success: true, message: 'Stripe payment verified.' };
};

module.exports = {
  registerCompany, cleanupRegistration,
  initiateRazorpayPayment, verifyRazorpayPayment,
  initiateStripePayment,   verifyStripePayment,
};
