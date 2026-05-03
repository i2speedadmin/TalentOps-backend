// ============================================================
// src/modules/auth/email.service.js
// Supports: Resend API (primary) + Nodemailer (fallback)
// Templates: password reset, welcome, new signup alert,
//            subscription renewal reminders, expiry notice
// ============================================================

const APP_NAME    = process.env.APP_NAME    || 'TalentOps';
const APP_URL     = process.env.CLIENT_URL  || 'https://i2speed.in';
const SUPPORT     = process.env.SUPPORT_EMAIL || 'support@i2speed.in';
const SA_EMAIL    = process.env.SUPER_ADMIN_EMAIL || 'admin@i2speed.in';
const YEAR        = new Date().getFullYear();

// ─── Core send function ───────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from:    process.env.MAIL_FROM || `${APP_NAME} <no-reply@i2speed.com>`,
        to:      Array.isArray(to) ? to : [to],
        subject,
        html,
        text: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Resend API error: ${err.message || res.status}`);
    }
    return await res.json();
  }

  // Nodemailer fallback
  const nodemailer  = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   process.env.MAIL_HOST,
    port:   parseInt(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    auth:   { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  return transporter.sendMail({
    from: process.env.MAIL_FROM || `"${APP_NAME}" <no-reply@i2speed.com>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  });
};

// ─── Shared email wrapper ─────────────────────────────────────
const wrap = (content) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${APP_NAME}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Inter,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:28px 32px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${APP_NAME}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">Optimize People. Maximize Performance.</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px;">${content}</td></tr>
      <!-- Footer -->
      <tr><td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">© ${YEAR} ${APP_NAME} · <a href="${APP_URL}" style="color:#4f46e5;text-decoration:none;">${APP_URL}</a></p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Questions? <a href="mailto:${SUPPORT}" style="color:#4f46e5;text-decoration:none;">${SUPPORT}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

const btn = (text, url, color = '#4f46e5') =>
  `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">${text}</a>
  </div>`;

const h2 = (text) =>
  `<h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#1e293b;">${text}</h2>`;

const p = (text) =>
  `<p style="margin:0 0 14px;font-size:15px;color:#475569;line-height:1.65;">${text}</p>`;

const box = (content, color = '#eff6ff', border = '#93c5fd') =>
  `<div style="background:${color};border:1px solid ${border};border-radius:10px;padding:16px 20px;margin:16px 0;">${content}</div>`;

const row = (label, value) =>
  `<tr>
    <td style="padding:8px 0;font-size:14px;color:#64748b;width:45%;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${value}</td>
  </tr>`;

// ============================================================
// 1. PASSWORD RESET EMAIL
// ============================================================
const sendPasswordResetEmail = ({ to, name, resetUrl }) =>
  sendEmail({
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: wrap(`
      ${h2('Reset your password')}
      ${p(`Hi ${name},`)}
      ${p('We received a request to reset your password. Click the button below to create a new one. This link expires in <strong>1 hour</strong>.')}
      ${btn('Reset Password', resetUrl)}
      ${box(`<p style="margin:0;font-size:13px;color:#1e40af;">If you didn't request a reset, you can safely ignore this email — your password will not change.</p>
             <p style="margin:8px 0 0;font-size:12px;color:#3b82f6;word-break:break-all;">Or copy: <a href="${resetUrl}" style="color:#3b82f6;">${resetUrl}</a></p>`)}
    `),
  });

// ============================================================
// 2. WELCOME EMAIL TO NEW TENANT
// ============================================================
const sendWelcomeEmail = ({ to, name, companyName, planName, loginUrl, trialDays }) =>
  sendEmail({
    to,
    subject: `Welcome to ${APP_NAME}, ${name}! 🎉`,
    html: wrap(`
      ${h2(`Welcome to ${APP_NAME}! 🎉`)}
      ${p(`Hi ${name},`)}
      ${p(`Your <strong>${companyName}</strong> account is ready. You're on the <strong>${planName}</strong> plan${trialDays ? ` with a <strong>${trialDays}-day free trial</strong>` : ''}.`)}
      ${box(`<table width="100%" cellpadding="0" cellspacing="0">
        ${row('Company', companyName)}
        ${row('Plan', planName)}
        ${row('Admin Email', to)}
        ${trialDays ? row('Trial Period', `${trialDays} days`) : ''}
      </table>`, '#f0fdf4', '#86efac')}
      ${btn('Go to Dashboard', loginUrl, '#10b981')}
      ${p('<strong>Getting Started:</strong>')}
      <ol style="margin:0 0 16px;padding-left:20px;color:#475569;font-size:14px;line-height:2;">
        <li>Invite your team members via the Users page</li>
        <li>Create your first recruitment task</li>
        <li>Assign tasks to your recruiters</li>
        <li>Track progress from your dashboard</li>
      </ol>
      ${p(`Need help? Reply to this email or visit <a href="${APP_URL}" style="color:#4f46e5;">${APP_URL}</a>`)}
    `),
  });

// ============================================================
// 3. NEW SIGNUP ALERT TO SUPER ADMIN
// ============================================================
const sendNewSignupAlert = ({ companyName, adminName, email, planName, billingCycle, amount, currency, promoCode }) =>
  sendEmail({
    to:      SA_EMAIL,
    subject: `🆕 New Signup: ${companyName} — ${APP_NAME}`,
    html: wrap(`
      ${h2('New Company Signed Up')}
      ${p('A new company has registered on the platform.')}
      ${box(`<table width="100%" cellpadding="0" cellspacing="0">
        ${row('Company Name',  companyName)}
        ${row('Admin Name',    adminName)}
        ${row('Admin Email',   email)}
        ${row('Plan',          planName)}
        ${row('Billing Cycle', billingCycle || '—')}
        ${row('Amount',        amount ? `${currency === 'USD' ? '$' : '₹'}${parseFloat(amount).toLocaleString()}` : '—')}
        ${promoCode ? row('Promo Used', promoCode) : ''}
        ${row('Signed Up',     new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}
      </table>`, '#f0fdf4', '#86efac')}
      ${btn('View in Super Admin', `${APP_URL}/superadmin/tenants`, '#dc2626')}
    `),
  });

// ============================================================
// 4. SUBSCRIPTION RENEWAL REMINDER
//    daysLeft: 10, 5, or 1
// ============================================================
const sendRenewalReminderEmail = ({ to, name, companyName, planName, nextBillingDate, amount, currency, renewUrl, daysLeft }) => {
  const urgency = daysLeft === 1
    ? { emoji: '🚨', color: '#dc2626', bg: '#fee2e2', border: '#fca5a5', label: 'URGENT — Expires Tomorrow!' }
    : daysLeft <= 5
    ? { emoji: '⚠️', color: '#d97706', bg: '#fef3c7', border: '#fde68a', label: `Expires in ${daysLeft} days` }
    : { emoji: '📅', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', label: `${daysLeft} days remaining` };

  const fmtAmt = `${currency === 'USD' ? '$' : '₹'}${parseFloat(amount).toLocaleString()}`;

  return sendEmail({
    to,
    subject: `${urgency.emoji} ${APP_NAME} subscription renews in ${daysLeft} day${daysLeft > 1 ? 's' : ''} — ${companyName}`,
    html: wrap(`
      ${h2(`${urgency.emoji} Subscription Renewal Reminder`)}
      ${p(`Hi ${name},`)}
      ${box(`<p style="margin:0;font-size:15px;font-weight:700;color:${urgency.color};">${urgency.label}</p>
             <p style="margin:6px 0 0;font-size:14px;color:#475569;">Your <strong>${planName}</strong> subscription for <strong>${companyName}</strong> is due for renewal.</p>`,
            urgency.bg, urgency.border)}
      ${box(`<table width="100%" cellpadding="0" cellspacing="0">
        ${row('Plan',          planName)}
        ${row('Renewal Amount', fmtAmt)}
        ${row('Renewal Date',  new Date(nextBillingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }))}
        ${row('Currency',      currency)}
      </table>`)}
      ${p('To avoid service interruption, please renew your subscription before the expiry date.')}
      ${btn('Renew Subscription Now', renewUrl, urgency.color)}
      ${p(`<small style="color:#94a3b8;">If you have already renewed, please ignore this email. For queries contact <a href="mailto:${SUPPORT}" style="color:#4f46e5;">${SUPPORT}</a></small>`)}
    `),
  });
};

// ============================================================
// 5. SUBSCRIPTION EXPIRED EMAIL
// ============================================================
const sendSubscriptionExpiredEmail = ({ to, name, companyName, planName, renewUrl }) =>
  sendEmail({
    to,
    subject: `❌ Your ${APP_NAME} subscription has expired — ${companyName}`,
    html: wrap(`
      ${h2('❌ Subscription Expired')}
      ${p(`Hi ${name},`)}
      ${box(`<p style="margin:0;font-size:15px;font-weight:700;color:#dc2626;">Your subscription has expired</p>
             <p style="margin:6px 0 0;font-size:14px;color:#475569;">Your <strong>${planName}</strong> plan for <strong>${companyName}</strong> has expired. Access to your account may be restricted.</p>`,
            '#fee2e2', '#fca5a5')}
      ${p('Renew now to restore full access for your team and avoid losing any data.')}
      ${btn('Renew Subscription', renewUrl, '#dc2626')}
      ${p('If you do not wish to continue, your data will be retained for 30 days before deletion.')}
      ${p(`Questions? Contact us at <a href="mailto:${SUPPORT}" style="color:#4f46e5;">${SUPPORT}</a>`)}
    `),
  });

// ============================================================
// 6. PLAN CHANGE CONFIRMATION EMAIL
// ============================================================
const sendPlanChangeEmail = ({ to, name, companyName, oldPlan, newPlan, amount, currency, billingCycle, effectiveDate }) => {
  const fmtAmt = `${currency === 'USD' ? '$' : '₹'}${parseFloat(amount).toLocaleString()}`;
  const isUpgrade = true; // caller determines; kept for future use

  return sendEmail({
    to,
    subject: `✅ Plan changed to ${newPlan} — ${companyName}`,
    html: wrap(`
      ${h2('Subscription Plan Updated')}
      ${p(`Hi ${name},`)}
      ${p(`Your subscription plan for <strong>${companyName}</strong> has been successfully updated.`)}
      ${box(`<table width="100%" cellpadding="0" cellspacing="0">
        ${row('Previous Plan', `<s style="color:#94a3b8;">${oldPlan}</s>`)}
        ${row('New Plan',      `<strong style="color:#10b981;">${newPlan}</strong>`)}
        ${row('Billing Cycle', billingCycle)}
        ${row('Amount',        fmtAmt + ' / ' + (billingCycle === 'annual' ? 'year' : 'month'))}
        ${row('Effective Date', new Date(effectiveDate || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }))}
      </table>`, '#f0fdf4', '#86efac')}
      ${btn('Go to Dashboard', `${APP_URL}/dashboard`)}
      ${p(`<small style="color:#94a3b8;">If you did not request this change, contact <a href="mailto:${SUPPORT}" style="color:#4f46e5;">${SUPPORT}</a> immediately.</small>`)}
    `),
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNewSignupAlert,
  sendRenewalReminderEmail,
  sendSubscriptionExpiredEmail,
  sendPlanChangeEmail,
};
