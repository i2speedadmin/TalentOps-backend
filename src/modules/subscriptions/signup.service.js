// ============================================================
// src/modules/subscriptions/signup.service.js
// Company registration + payment initiation
// ============================================================

const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../../config/db');
const { getSettingValue } = require('../platformSettings/settings.service');
const { validatePromoCode } = require('../promoCodes/promoCode.service');

// ─── Helper: generate slug from company name ─────────────────
const makeSlug = (name) => {
  let slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug.substring(0, 50) + '-' + crypto.randomBytes(3).toString('hex');
};

// ─── Calculate discounted price ──────────────────────────────
const calculatePrice = (basePrice, promo) => {
  if (!promo) return basePrice;
  if (promo.discount_type === 'percent') {
    return Math.max(0, basePrice - (basePrice * promo.discount_value / 100));
  }
  if (promo.discount_type === 'flat_inr' || promo.discount_type === 'flat_usd') {
    return Math.max(0, basePrice - promo.discount_value);
  }
  return basePrice;
};

// ============================================================
// REGISTER COMPANY (creates tenant + admin user + starts trial)
// ============================================================
const registerCompany = async ({ companyName, adminName, email, password, phone, industry, size, planId, billingCycle = 'monthly', currency = 'INR', promoCode, ip }) => {
  // 1. Validate signup is open
  const allowSignups = await getSettingValue('allow_signups', true);
  if (!allowSignups) throw { status: 403, message: 'New signups are currently closed.' };

  // 2. Check email not already used
  const [existingTenant] = await db.query(
    'SELECT id FROM tenants WHERE email = ? LIMIT 1', [email.toLowerCase()]
  );
  if (existingTenant.length) throw { status: 409, message: 'An account with this email already exists.' };

  // 3. Validate plan
  const [planRows] = await db.query('SELECT * FROM plans WHERE id = ? AND is_active = 1 LIMIT 1', [planId]);
  if (!planRows.length) throw { status: 400, message: 'Selected plan not found or inactive.' };
  const plan = planRows[0];

  // 4. Validate promo code if provided
  let promoData = null;
  if (promoCode) {
    try {
      promoData = await validatePromoCode({ code: promoCode, planId, billingCycle, currency });
    } catch (err) {
      throw { status: 400, message: err.message };
    }
  }

  // 5. Calculate amounts
  const basePrice = currency === 'USD'
    ? (billingCycle === 'annual' ? parseFloat(plan.price_annual_usd) : parseFloat(plan.price_monthly_usd))
    : (billingCycle === 'annual' ? parseFloat(plan.price_annual_inr) : parseFloat(plan.price_monthly_inr));

  const discountAmount  = promoData ? (basePrice - calculatePrice(basePrice, promoData)) : 0;
  const finalAmount     = calculatePrice(basePrice, promoData);

  // 6. Get trial days
  const trialDays   = await getSettingValue('trial_days', 14);
  const trialEnd    = new Date();
  trialEnd.setDate(trialEnd.getDate() + parseInt(trialDays));

  // 7. Create tenant
  const slug      = makeSlug(companyName);
  const [tenantResult] = await db.query(
    `INSERT INTO tenants (name, slug, email, phone, industry, size, status, trial_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, 'trial', ?)`,
    [companyName, slug, email.toLowerCase(), phone || null, industry || null, size || null,
     trialEnd.toISOString().slice(0, 19).replace('T', ' ')]
  );
  const tenantId = tenantResult.insertId;

  // 8. Create admin user for this tenant
  const hashedPw = await bcrypt.hash(password, 10);
  const [userResult] = await db.query(
    `INSERT INTO users (tenant_id, name, email, password, role, status)
     VALUES (?, ?, ?, ?, 'admin', 'active')`,
    [tenantId, adminName, email.toLowerCase(), hashedPw]
  );

  // 9. Create trial subscription
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

  // 10. Send welcome notification
  await db.query(
    `INSERT INTO notifications (tenant_id, user_id, title, message, type)
     VALUES (?, ?, 'Welcome to TalentOps! 🎉', ?, 'general')`,
    [tenantId, userResult.insertId,
     `Hi ${adminName}! Your ${plan.name} trial is active for ${trialDays} days. Explore all features and subscribe to continue.`]
  );

  return {
    tenant:         { id: tenantId, name: companyName, slug, email: email.toLowerCase() },
    user_id:        userResult.insertId,
    subscription_id: subResult.insertId,
    plan:           { id: plan.id, name: plan.name },
    trial_ends_at:  trialEnd.toISOString(),
    amount:         finalAmount,
    discount:       discountAmount,
    currency,
    billing_cycle:  billingCycle,
    promo_applied:  promoData ? promoData.code : null,
    message:        `Welcome to TalentOps! Your ${trialDays}-day trial has started.`,
  };
};

// ============================================================
// INITIATE RAZORPAY ORDER
// ============================================================
const initiateRazorpayPayment = async ({ tenantId, subscriptionId, amount, currency = 'INR', description }) => {
  const razorpayEnabled = await getSettingValue('razorpay_enabled', false);
  if (!razorpayEnabled) throw { status: 400, message: 'Razorpay payments are currently disabled.' };

  const keyId     = await getSettingValue('razorpay_key_id', '');
  const keySecret = await getSettingValue('razorpay_key_secret', '');

  if (!keyId || !keySecret) {
    throw { status: 500, message: 'Razorpay credentials not configured. Contact support.' };
  }

  // Create Razorpay order via API
  const Razorpay = require('razorpay');
  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

  const order = await rzp.orders.create({
    amount:   Math.round(amount * 100), // convert to paise
    currency: currency,
    receipt:  `sub_${subscriptionId}_${Date.now()}`,
    notes:    { tenant_id: tenantId, subscription_id: subscriptionId },
  });

  // Save order in payments table
  await db.query(
    `INSERT INTO payments
       (tenant_id, subscription_id, gateway, gateway_order_id, amount, currency, status, description)
     VALUES (?, ?, 'razorpay', ?, ?, ?, 'created', ?)`,
    [tenantId, subscriptionId, order.id, amount, currency, description || 'TalentOps Subscription']
  );

  return {
    order_id:   order.id,
    key_id:     keyId,
    amount:     order.amount,
    currency:   order.currency,
    description: description || 'TalentOps Subscription',
  };
};

// ============================================================
// VERIFY RAZORPAY PAYMENT (webhook / frontend callback)
// ============================================================
const verifyRazorpayPayment = async ({ orderId, paymentId, signature, tenantId }) => {
  const keySecret = await getSettingValue('razorpay_key_secret', '');

  // Verify signature
  const expectedSig = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSig !== signature) {
    throw { status: 400, message: 'Payment verification failed. Invalid signature.' };
  }

  // Update payment record
  await db.query(
    `UPDATE payments SET
       gateway_payment_id = ?, gateway_signature = ?,
       status = 'paid', paid_at = NOW()
     WHERE gateway_order_id = ? AND tenant_id = ?`,
    [paymentId, signature, orderId, tenantId]
  );

  // Activate subscription
  await db.query(
    `UPDATE subscriptions SET status = 'active' WHERE tenant_id = ? AND status = 'trialing'`,
    [tenantId]
  );

  // Activate tenant
  await db.query(
    `UPDATE tenants SET status = 'active', trial_ends_at = NULL WHERE id = ?`,
    [tenantId]
  );

  // Get the admin user id
  const [adminUser] = await db.query(
    `SELECT id FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1`, [tenantId]
  );

  if (adminUser.length) {
    await db.query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type)
       VALUES (?, ?, 'Payment Successful! ✅', 'Your subscription is now active. Thank you for subscribing to TalentOps!', 'subscription')`,
      [tenantId, adminUser[0].id]
    );
  }

  return { success: true, message: 'Payment verified. Subscription activated.' };
};

// ============================================================
// INITIATE STRIPE PAYMENT SESSION
// ============================================================
const initiateStripePayment = async ({ tenantId, subscriptionId, planId, billingCycle, amount, currency = 'usd', successUrl, cancelUrl }) => {
  const stripeEnabled = await getSettingValue('stripe_enabled', false);
  if (!stripeEnabled) throw { status: 400, message: 'Stripe payments are currently disabled.' };

  const stripeKey = await getSettingValue('stripe_secret_key', '');
  if (!stripeKey) throw { status: 500, message: 'Stripe not configured. Contact support.' };

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
    mode:         'payment',
    success_url:  successUrl + `?session_id={CHECKOUT_SESSION_ID}&tenant_id=${tenantId}`,
    cancel_url:   cancelUrl,
    metadata:     { tenant_id: String(tenantId), subscription_id: String(subscriptionId) },
  });

  // Save stripe session
  await db.query(
    `INSERT INTO payments
       (tenant_id, subscription_id, gateway, gateway_order_id, amount, currency, status, description)
     VALUES (?, ?, 'stripe', ?, ?, ?, 'created', 'TalentOps Subscription')`,
    [tenantId, subscriptionId, session.id, amount, currency.toUpperCase()]
  );

  return { session_id: session.id, session_url: session.url };
};

// ============================================================
// VERIFY STRIPE PAYMENT (via session_id)
// ============================================================
const verifyStripePayment = async ({ sessionId, tenantId }) => {
  const stripeKey = await getSettingValue('stripe_secret_key', '');
  const stripe    = require('stripe')(stripeKey);
  const session   = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== 'paid') {
    throw { status: 400, message: 'Payment not completed.' };
  }

  // Update payment
  await db.query(
    `UPDATE payments SET
       gateway_payment_id = ?, status = 'paid', paid_at = NOW()
     WHERE gateway_order_id = ? AND tenant_id = ?`,
    [session.payment_intent, sessionId, tenantId]
  );

  // Activate subscription and tenant
  await db.query(
    `UPDATE subscriptions SET status = 'active' WHERE tenant_id = ? AND status = 'trialing'`,
    [tenantId]
  );
  await db.query(
    `UPDATE tenants SET status = 'active', trial_ends_at = NULL WHERE id = ?`,
    [tenantId]
  );

  return { success: true, message: 'Stripe payment verified. Subscription activated.' };
};

module.exports = {
  registerCompany,
  initiateRazorpayPayment, verifyRazorpayPayment,
  initiateStripePayment,   verifyStripePayment,
};
