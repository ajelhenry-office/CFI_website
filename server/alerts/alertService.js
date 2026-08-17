import { pool } from '../ratings/db.js';
import { sendAlertEmail } from '../auth/emailService.js';

// These alerts are all about the Toggle tab's own health, so recipients are looked up
// fresh from the DB every time: Super Admin (overall ownership) plus every Control
// Tower employee (the ones actually operating the Toggle tab day to day) — so adding
// or removing a Control Tower employee automatically updates who gets notified, no
// config change needed. ALERT_EMAILS stays available for anyone extra beyond those
// two roles.
export async function getRecipients() {
  const roleRes = await pool.query(
    `SELECT email FROM authorized_users WHERE role IN ('super_admin', 'control_tower') AND is_locked = false`
  );
  const extra = (process.env.ALERT_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  return [...new Set([...roleRes.rows.map(r => r.email), ...extra])];
}

const COOLDOWN_MS = 60 * 60 * 1000; // don't re-email the SAME ongoing issue more than once an hour

const SEVERITY_STYLE = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', emoji: '🚨', label: 'CRITICAL' },
  WARNING:  { color: '#d97706', bg: '#fffbeb', emoji: '⚠️', label: 'WARNING' },
  RESOLVED: { color: '#16a34a', bg: '#f0fdf4', emoji: '✅', label: 'RESOLVED' },
};

function buildHtml({ severityKey, category, message, details, occurrenceCount, timestamp }) {
  const s = SEVERITY_STYLE[severityKey];
  return `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto;">
  <div style="background: ${s.color}; color: #fff; padding: 16px 20px; border-radius: 10px 10px 0 0;">
    <div style="font-size: 11px; font-weight: 800; letter-spacing: 1px; opacity: 0.9;">${s.emoji} KITCHENPULSE SYSTEM ALERT — ${s.label}</div>
    <div style="font-size: 17px; font-weight: 800; margin-top: 4px;">${category}</div>
  </div>
  <div style="background: ${s.bg}; border: 1px solid ${s.color}33; border-top: none; border-radius: 0 0 10px 10px; padding: 20px;">
    <p style="font-size: 14px; color: #132664; line-height: 1.6; margin: 0 0 12px;">${message}</p>
    ${details ? `<div style="background: #fff; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; color: #475569; font-family: ui-monospace, monospace; white-space: pre-wrap; margin-bottom: 12px;">${details}</div>` : ''}
    <div style="font-size: 11.5px; color: #64748b; border-top: 1px solid ${s.color}22; padding-top: 10px; margin-top: 4px;">
      ${timestamp}${occurrenceCount > 1 ? ` · seen ${occurrenceCount} times` : ''}
    </div>
  </div>
</div>`;
}

async function deliver(severityKey, category, message, details, occurrenceCount) {
  const s = SEVERITY_STYLE[severityKey];
  const subject = `${s.emoji} [KitchenPulse ALERT] ${category}${severityKey === 'RESOLVED' ? ' — Resolved' : ''}`;
  const html = buildHtml({
    severityKey, category, message, details, occurrenceCount,
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  });
  const recipients = await getRecipients();
  for (const to of recipients) {
    await sendAlertEmail(to, subject, html);
  }
}

/**
 * Raise (or bump) an alert for `category`. If an unresolved alert for the same
 * category already exists, this just increments its occurrence count and only
 * re-sends the email if the cooldown window has passed — so a sustained issue
 * doesn't produce one email per failure.
 */
export async function raiseAlert(category, severity, message, details = null) {
  try {
    const existing = await pool.query(
      `SELECT id, occurrence_count, last_notified_at FROM system_alerts WHERE category = $1 AND resolved_at IS NULL`,
      [category]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const sinceLastNotify = Date.now() - new Date(row.last_notified_at).getTime();
      const newCount = row.occurrence_count + 1;

      if (sinceLastNotify < COOLDOWN_MS) {
        // Still within cooldown — just bump the counter, don't re-email.
        await pool.query(`UPDATE system_alerts SET occurrence_count = $1 WHERE id = $2`, [newCount, row.id]);
        return;
      }

      await pool.query(`UPDATE system_alerts SET occurrence_count = $1, last_notified_at = NOW() WHERE id = $2`, [newCount, row.id]);
      await deliver(severity, category, message, details, newCount);
      return;
    }

    await pool.query(
      `INSERT INTO system_alerts (category, severity, message, details) VALUES ($1, $2, $3, $4)`,
      [category, severity, message, details]
    );
    await deliver(severity, category, message, details, 1);
  } catch (err) {
    // Alerting must never be the thing that breaks the app it's monitoring.
    console.error('[ALERTS] Failed to raise alert:', err.message);
  }
}

/** Mark an ongoing issue as resolved and send a follow-up so nobody's left wondering. */
export async function resolveAlert(category, message = 'This issue has cleared.') {
  try {
    const existing = await pool.query(
      `SELECT id, occurrence_count FROM system_alerts WHERE category = $1 AND resolved_at IS NULL`,
      [category]
    );
    if (existing.rows.length === 0) return; // nothing was active, nothing to resolve

    await pool.query(`UPDATE system_alerts SET resolved_at = NOW() WHERE id = $1`, [existing.rows[0].id]);
    await deliver('RESOLVED', category, message, null, existing.rows[0].occurrence_count);
  } catch (err) {
    console.error('[ALERTS] Failed to resolve alert:', err.message);
  }
}
