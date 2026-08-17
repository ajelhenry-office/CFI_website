import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../ratings/db.js';
import { sendAlertEmail } from '../auth/emailService.js';
import { getRecipients } from './alertService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configurable so these can be updated (e.g. once the eatfit.in domain is wired up)
// without a code change.
const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || 'https://cfi-website-five.vercel.app';
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || 'http://ec2-16-16-156-167.eu-north-1.compute.amazonaws.com:3001';
const LATENCY_WARN_MS = 3000;

async function checkUrl(label, url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const elapsedMs = Date.now() - start;
    return { label, url, ok: res.status === 200, status: res.status, elapsedMs, slow: elapsedMs > LATENCY_WARN_MS };
  } catch (err) {
    return { label, url, ok: false, status: null, elapsedMs: Date.now() - start, error: err.message, slow: false };
  }
}

async function checkOperationalHealth() {
  const alertsRes = await pool.query(
    `SELECT category, severity, message, occurrence_count, created_at FROM system_alerts WHERE resolved_at IS NULL ORDER BY created_at DESC`
  );
  const stuckRes = await pool.query(
    `SELECT id FROM bulk_toggle_jobs WHERE status IN ('RUNNING', 'PAUSED') AND last_heartbeat_at < NOW() - INTERVAL '10 minutes'`
  );
  const hourlyRes = await pool.query(`SELECT MAX(created_at) AS last FROM toggle_activity WHERE source = 'AUTO_HOURLY_RECHECK'`);
  const watchdogRes = await pool.query(`SELECT MAX(created_at) AS last FROM toggle_activity WHERE source = 'AUTO_WATCHDOG'`);

  return {
    unresolvedAlerts: alertsRes.rows,
    stuckJobCount: stuckRes.rows.length,
    lastHourlyRecheck: hourlyRes.rows[0]?.last || null,
    lastWatchdog: watchdogRes.rows[0]?.last || null,
  };
}

// Best-effort, regex-based — not a real parser, so it can't catch everything, but it's
// specifically aimed at the exact bug class found and fixed on 2026-08-16: a fetch()
// call with a duplicated "headers" key (the second silently wins, dropping auth), or a
// POST-making file that never references getAuthHeaders at all. Only runs if this
// server's checkout happens to include the frontend source next to the backend —
// skips cleanly and says so if it doesn't, rather than guessing.
function checkAuthWiringRegression() {
  const toggleDir = path.join(__dirname, '../../src/features/toggle');
  if (!fs.existsSync(toggleDir)) {
    return { skipped: true, reason: 'Frontend source not found on this server (src/features/toggle) — skipped.' };
  }

  const issues = [];
  const files = fs.readdirSync(toggleDir).filter(f => f.endsWith('.jsx'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(toggleDir, file), 'utf-8');
    const fetchBlocks = content.match(/fetch\([\s\S]*?\)\s*;/g) || [];
    for (const block of fetchBlocks) {
      const headerKeyCount = (block.match(/\bheaders\s*:/g) || []).length;
      if (headerKeyCount > 1) {
        issues.push(`${file}: a fetch() call has the "headers" key written more than once (the second silently overwrites the first)`);
      }
    }
    const makesPost = /method\s*:\s*["'](POST|DELETE|PATCH)["']/.test(content);
    if (makesPost && !content.includes('getAuthHeaders')) {
      issues.push(`${file}: makes an authenticated-style request but never references getAuthHeaders`);
    }
  }
  return { skipped: false, issues };
}

function fmtTime(iso) {
  if (!iso) return 'never recorded';
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function buildReportHtml({ frontend, backend, ops, regression, allOk }) {
  const row = (label, ok, detail) => `
    <tr>
      <td style="padding: 8px 12px; font-size: 13px; color: #132664;">${ok ? '✅' : '❌'} ${label}</td>
      <td style="padding: 8px 12px; font-size: 12.5px; color: #64748b; font-family: ui-monospace, monospace;">${detail}</td>
    </tr>`;

  const alertRows = ops.unresolvedAlerts.length === 0
    ? '<div style="font-size: 12.5px; color: #15803d;">None</div>'
    : ops.unresolvedAlerts.map(a => `<div style="font-size: 12.5px; color: #b91c1c; margin-bottom: 4px;">[${a.severity}] ${a.category} — ${a.message} (seen ${a.occurrence_count}x)</div>`).join('');

  const regressionHtml = regression.skipped
    ? `<div style="font-size: 12.5px; color: #64748b; font-style: italic;">${regression.reason}</div>`
    : regression.issues.length === 0
      ? '<div style="font-size: 12.5px; color: #15803d;">No issues found</div>'
      : regression.issues.map(i => `<div style="font-size: 12.5px; color: #b91c1c; margin-bottom: 4px;">${i}</div>`).join('');

  return `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: ${allOk ? '#16a34a' : '#d97706'}; color: #fff; padding: 16px 20px; border-radius: 10px 10px 0 0;">
    <div style="font-size: 11px; font-weight: 800; letter-spacing: 1px; opacity: 0.9;">${allOk ? '✅' : '⚠️'} KITCHENPULSE DAILY HEALTH CHECK</div>
    <div style="font-size: 17px; font-weight: 800; margin-top: 4px;">${allOk ? 'All systems normal' : 'Something needs a look'}</div>
  </div>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px; padding: 20px;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      ${row('Frontend reachable', frontend.ok, `${frontend.status || 'unreachable'} · ${frontend.elapsedMs}ms${frontend.slow ? ' (slow)' : ''}`)}
      ${row('Backend reachable', backend.ok, `${backend.status || 'unreachable'} · ${backend.elapsedMs}ms${backend.slow ? ' (slow)' : ''}`)}
    </table>

    <div style="font-size: 12px; font-weight: 700; color: #132664; margin-bottom: 6px;">Unresolved alerts</div>
    ${alertRows}

    <div style="font-size: 12px; font-weight: 700; color: #132664; margin: 14px 0 6px;">Automation activity</div>
    <div style="font-size: 12.5px; color: #475569;">Hourly Recheck last ran: ${fmtTime(ops.lastHourlyRecheck)}</div>
    <div style="font-size: 12.5px; color: #475569;">Watchdog last ran: ${fmtTime(ops.lastWatchdog)}</div>
    <div style="font-size: 12.5px; color: ${ops.stuckJobCount > 0 ? '#b91c1c' : '#475569'};">Stuck bulk jobs right now: ${ops.stuckJobCount}</div>

    <div style="font-size: 12px; font-weight: 700; color: #132664; margin: 14px 0 6px;">Auth-wiring regression scan (best-effort)</div>
    ${regressionHtml}

    <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 14px;">
      ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
    </div>
  </div>
</div>`;
}

export async function runDailyHealthCheck() {
  console.log('[DAILY CHECK] Running...');
  try {
    const [frontend, backend] = await Promise.all([
      checkUrl('Frontend', PUBLIC_FRONTEND_URL),
      checkUrl('Backend', `${PUBLIC_BACKEND_URL}/health`),
    ]);
    const ops = await checkOperationalHealth();
    const regression = checkAuthWiringRegression();

    const allOk = frontend.ok && !frontend.slow && backend.ok && !backend.slow
      && ops.unresolvedAlerts.length === 0 && ops.stuckJobCount === 0
      && (regression.skipped || regression.issues.length === 0);

    const html = buildReportHtml({ frontend, backend, ops, regression, allOk });
    const subject = `${allOk ? '✅' : '⚠️'} [KitchenPulse Daily Check] ${allOk ? 'All systems normal' : 'Something needs a look'}`;

    const recipients = await getRecipients();
    for (const to of recipients) {
      await sendAlertEmail(to, subject, html);
    }
    console.log(`[DAILY CHECK] Done. allOk=${allOk}. Sent to ${recipients.length} recipient(s).`);
  } catch (err) {
    console.error('[DAILY CHECK] Failed to run:', err.message);
  }
}

// Anchors the first run to the next occurrence of hourIST:minuteIST (Asia/Kolkata,
// UTC+5:30, no DST), then repeats every 24 hours from there — so it lands at a
// consistent, predictable time every day instead of drifting with server restarts.
export function scheduleDailyHealthCheck(hourIST = 8, minuteIST = 0) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const now = Date.now();
  const nowIST = new Date(now + IST_OFFSET_MS);
  const targetIST = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), hourIST, minuteIST, 0));
  let targetUTCms = targetIST.getTime() - IST_OFFSET_MS;
  if (targetUTCms <= now) targetUTCms += 24 * 60 * 60 * 1000; // already passed today — first run is tomorrow

  const delay = targetUTCms - now;
  console.log(`[DAILY CHECK] Scheduled — first run in ${Math.round(delay / 60000)} minutes (${hourIST}:${String(minuteIST).padStart(2, '0')} IST daily thereafter).`);

  setTimeout(() => {
    runDailyHealthCheck();
    setInterval(runDailyHealthCheck, 24 * 60 * 60 * 1000);
  }, delay);
}
