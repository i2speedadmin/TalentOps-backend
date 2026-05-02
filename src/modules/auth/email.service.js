// ============================================================
// src/modules/auth/email.service.js
// Email via Resend API (with nodemailer fallback)
// Set RESEND_API_KEY in .env to use Resend
// ============================================================

const sendEmail = async ({ to, subject, html, text }) => {
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    // ── Use Resend API ────────────────────────────────────────
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from:    process.env.MAIL_FROM || 'TalentOps <noreply@talentops.com>',
        to:      [to],
        subject,
        html,
        text:    text || html.replace(/<[^>]*>/g, ''),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Resend API error: ${err.message || res.status}`);
    }
    return await res.json();
  }

  // ── Fallback: nodemailer ──────────────────────────────────
  const nodemailer  = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   process.env.MAIL_HOST,
    port:   parseInt(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    auth:   { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  return transporter.sendMail({
    from: process.env.MAIL_FROM || '"TalentOps" <noreply@talentops.com>',
    to, subject, html,
  });
};

// ─── Reset Password Email ─────────────────────────────────────
const sendPasswordResetEmail = ({ to, name, resetUrl }) =>
  sendEmail({
    to,
    subject: 'Reset your TalentOps password',
    html: `<!DOCTYPE html>
<html><body style="font-family:Inter,sans-serif;background:#f8fafc;margin:0;padding:2rem;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:2rem;text-align:center;">
      <h1 style="color:white;margin:0;font-size:1.4rem;">TalentOps</h1>
      <p style="color:rgba(255,255,255,0.75);margin:0.25rem 0 0;font-size:0.85rem;">Optimize People. Maximize Performance.</p>
    </div>
    <div style="padding:2rem;">
      <h2 style="color:#1e293b;margin:0 0 0.75rem;">Reset your password</h2>
      <p style="color:#64748b;line-height:1.6;">Hi ${name},</p>
      <p style="color:#64748b;line-height:1.6;">We received a request to reset your password. Click the button below to create a new password:</p>
      <div style="text-align:center;margin:2rem 0;">
        <a href="${resetUrl}" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:0.875rem 2.5rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
          Reset Password
        </a>
      </div>
      <p style="color:#94a3b8;font-size:0.82rem;text-align:center;">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:1.5rem 0;" />
      <p style="color:#94a3b8;font-size:0.75rem;text-align:center;">Or copy this link:<br/><span style="color:#4f46e5;word-break:break-all;">${resetUrl}</span></p>
    </div>
    <div style="background:#f8fafc;padding:1rem;text-align:center;font-size:0.75rem;color:#94a3b8;">
      © ${new Date().getFullYear()} TalentOps · support@talentops.com
    </div>
  </div>
</body></html>`,
  });

// ─── Welcome Email ────────────────────────────────────────────
const sendWelcomeEmail = ({ to, name, companyName, loginUrl, trialDays }) =>
  sendEmail({
    to,
    subject: `Welcome to TalentOps, ${name}! 🎉`,
    html: `<!DOCTYPE html>
<html><body style="font-family:Inter,sans-serif;background:#f8fafc;margin:0;padding:2rem;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:2rem;text-align:center;">
      <h1 style="color:white;margin:0;font-size:1.4rem;">Welcome to TalentOps! 🎉</h1>
    </div>
    <div style="padding:2rem;">
      <p style="color:#64748b;line-height:1.6;">Hi ${name},</p>
      <p style="color:#64748b;line-height:1.6;">Your TalentOps account for <strong>${companyName}</strong> is ready. You have a <strong>${trialDays}-day free trial</strong> to explore all features.</p>
      <div style="text-align:center;margin:2rem 0;">
        <a href="${loginUrl}" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:0.875rem 2.5rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
          Go to Dashboard
        </a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:1rem;text-align:center;font-size:0.75rem;color:#94a3b8;">
      © ${new Date().getFullYear()} TalentOps · support@talentops.com
    </div>
  </div>
</body></html>`,
  });

module.exports = { sendEmail, sendPasswordResetEmail, sendWelcomeEmail };
