import pipeline from './run_pipeline.js';
import { pool } from './db.js';
import { raiseAlert, resolveAlert } from '../alerts/alertService.js';

// Same category string every time this alert is raised or resolved — the
// alert system dedupes/cools-down and later sends a "resolved" follow-up
// based on matching this exact string, so it must stay consistent.
const ALERT_CATEGORY = 'Ratings & Insights Mail Fetch';

// Whoever actually has access to the Ratings & Insights tab (per Sidebar.jsx's
// own role->tab mapping) plus explicitly super_admin/admin — not the Toggle
// tab's default alert audience (super_admin + control_tower), which is a
// different set of people entirely.
const ALERT_ROLES = ['super_admin', 'admin', 'dark_kitchen', 'supervisor'];

// Computes a calendar date string (YYYY-MM-DD) in IST regardless of the host's
// own timezone, by adding the fixed UTC+5:30 offset and reading back the UTC
// fields — avoids depending on the server having IST tzdata configured.
function getISTDateString(offsetDays = 0) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const t = Date.now() + IST_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

const MARKER_KEY = 'last_checked_received_date';
const LOCK_KEY = 'run_lock';
// A lock older than this is assumed to belong to a run that crashed rather
// than one that's genuinely still going — taken over instead of left stuck
// forever blocking every future run.
const STALE_LOCK_MINUTES = 120;

async function ensureStateTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

async function getState(key) {
  const res = await pool.query('SELECT value FROM pipeline_state WHERE key = $1', [key]);
  return res.rows.length ? res.rows[0].value : null;
}

async function setState(key, value) {
  await pool.query(
    `INSERT INTO pipeline_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

// Prevents two runs (a scheduled one overlapping a manual one — this
// actually happened this session) from racing on the same marker.
async function acquireLock() {
  const existing = await getState(LOCK_KEY);
  if (existing) {
    const ageMinutes = (Date.now() - new Date(existing).getTime()) / 60000;
    if (ageMinutes < STALE_LOCK_MINUTES) {
      console.log(`[DAILY AUTOMATION] Another run is already in progress (lock is ${ageMinutes.toFixed(1)} min old) — skipping this run.`);
      return false;
    }
    console.log(`[DAILY AUTOMATION] Found a stale lock (${ageMinutes.toFixed(0)} min old) — previous run likely crashed, taking over.`);
  }
  await setState(LOCK_KEY, new Date().toISOString());
  return true;
}

async function releaseLock() {
  await setState(LOCK_KEY, null);
}

// Checks one received-date's inbox. Returns { success, error } — success is
// true when the check genuinely completed (mail found and processed, or
// confirmed no mail exists for that date — both count), false only when it
// actually failed after exhausting retries, with `error` carrying the real
// message for the alert email.
async function checkReceivedDate(dateStr) {
  console.log(`[DAILY AUTOMATION] Checking mail received on ${dateStr}...`);
  return pipeline.runPipeline(dateStr);
}

async function runDailyAutomation() {
  await ensureStateTable();

  if (!(await acquireLock())) {
    return;
  }

  let hadFailure = false;

  try {
    const today = getISTDateString(0);

    // Always recheck yesterday, regardless of the marker — a one-day grace
    // period for mail that arrives late, after yesterday's own first check
    // already ran and found nothing. No retry mechanism covers this specific
    // check again later (the marker/catch-up below only walks forward), so
    // a failure here is reported immediately rather than silently dropped.
    const yesterdayResult = await checkReceivedDate(getISTDateString(-1));
    if (!yesterdayResult.success) {
      hadFailure = true;
      console.error(`[DAILY AUTOMATION] Yesterday's recheck failed: ${yesterdayResult.error}`);
      await raiseAlert(
        ALERT_CATEGORY,
        'WARNING',
        `The Ratings & Insights daily mail check failed while rechecking yesterday's mail (${getISTDateString(-1)}).`,
        yesterdayResult.error,
        ALERT_ROLES,
      );
    }

    // Catch up from the marker forward through today, one date at a time.
    // A normal day, this is just today (one date). A multi-day gap (server
    // was down, etc.) walks through all of them in order, then the marker
    // lands on today — no special-casing needed for either case.
    let marker = await getState(MARKER_KEY);
    if (!marker) {
      // No marker set yet — this needs seeding manually before this can be
      // trusted; falling back to yesterday only so a fresh deploy doesn't
      // crash, not as a real substitute for setting it properly.
      console.log('[DAILY AUTOMATION] No last_checked_received_date marker found — defaulting to yesterday. This should be set explicitly.');
      marker = getISTDateString(-2);
    }

    let cursor = addDays(marker, 1);
    while (cursor <= today) {
      const result = await checkReceivedDate(cursor);
      if (!result.success) {
        hadFailure = true;
        console.error(`[DAILY AUTOMATION] Failed checking ${cursor} — stopping catch-up here; will retry from this date on the next run.`);
        await raiseAlert(
          ALERT_CATEGORY,
          'WARNING',
          `The Ratings & Insights daily mail check failed on ${cursor} and stopped there — every date after it is also on hold until this is fixed. It will retry automatically from this date on the next run.`,
          result.error,
          ALERT_ROLES,
        );
        break;
      }
      await setState(MARKER_KEY, cursor);
      cursor = addDays(cursor, 1);
    }

    if (!hadFailure) {
      await resolveAlert(ALERT_CATEGORY, 'The Ratings & Insights daily mail check is running normally again.', ALERT_ROLES);
    }

    console.log('[DAILY AUTOMATION] Done.');
  } finally {
    await releaseLock();
  }
}

runDailyAutomation()
  .then(() => process.exit(0))
  .catch(async (err) => {
    // Anything that reaches here is unanticipated — not "a date's mail check
    // failed" (that's handled and alerted on above), but something breaking
    // outside the normal flow entirely (the state table unreachable, the
    // lock itself unreadable, etc.). That's arguably the more important
    // scenario to hear about immediately, so it gets its own CRITICAL alert
    // rather than only ever showing up in the log file.
    console.error('[DAILY AUTOMATION] Fatal error:', err.message);
    try {
      await raiseAlert(
        ALERT_CATEGORY,
        'CRITICAL',
        'The Ratings & Insights daily mail automation crashed unexpectedly and did not complete.',
        err.message,
        ALERT_ROLES,
      );
    } catch (alertErr) {
      console.error('[DAILY AUTOMATION] Also failed to send the crash alert:', alertErr.message);
    }
    process.exit(1);
  });
