import { sendAlertEmail as sendRaw } from '../auth/emailService.js';

// Self-contained on purpose — no dependency on db.js/pool, since this exists
// specifically for the case where the database connection itself is the problem.
const ALERT_EMAILS = (process.env.ALERT_EMAILS || 'ajel.henry@curefoods.in')
  .split(',').map(e => e.trim()).filter(Boolean);

export async function sendAlertEmail(errorMessage) {
  const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto;">
  <div style="background: #dc2626; color: #fff; padding: 16px 20px; border-radius: 10px 10px 0 0;">
    <div style="font-size: 11px; font-weight: 800; letter-spacing: 1px; opacity: 0.9;">🚨 KITCHENPULSE SYSTEM ALERT — CRITICAL</div>
    <div style="font-size: 17px; font-weight: 800; margin-top: 4px;">Database Connection Error</div>
  </div>
  <div style="background: #fef2f2; border: 1px solid #dc262633; border-top: none; border-radius: 0 0 10px 10px; padding: 20px;">
    <p style="font-size: 14px; color: #132664; line-height: 1.6; margin: 0 0 12px;">
      An unexpected error occurred on the database connection pool. Everything that reads or writes data — toggles, ratings, audit logs — is affected while this persists.
    </p>
    <div style="background: #fff; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; color: #475569; font-family: ui-monospace, monospace; white-space: pre-wrap; margin-bottom: 12px;">${errorMessage}</div>
    <div style="font-size: 11.5px; color: #64748b; border-top: 1px solid #dc262622; padding-top: 10px;">
      ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
    </div>
  </div>
</div>`;

  for (const to of ALERT_EMAILS) {
    await sendRaw(to, '🚨 [KitchenPulse ALERT] Database Connection Error', html);
  }
}
