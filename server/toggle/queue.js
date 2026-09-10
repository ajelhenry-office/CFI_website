import { pool } from '../ratings/db.js';
import { raiseAlert } from '../alerts/alertService.js';

// Single source of truth for brand-key normalization — lives here (not
// toggle.routes.js, which already imports from this file) so both toggle.routes.js and
// workers.js can share the exact same rule without a circular import. Previously this
// same regex was independently duplicated in 4+ places (performToggleAPI,
// verifyLocationExists, checkAndIncrementRateLimit, the old toggle.routes.js copy, plus
// the frontend's own copy) — this is the one everything else should now import.
export function normalizeBrandKey(brand) {
  return String(brand || "").toLowerCase().replace(/[^a-z]/g, "_");
}

// Master switch for the whole Toggle tab, every brand at once — unlike the per-brand
// freeze (which only blocks a brand's final UrbanPiper call while its crons keep firing
// regardless, still creating jobs and burning rate-limit budget every cycle), this stops
// the crons themselves from doing any work at all. Meant for "nothing should be running"
// windows (e.g. testing prep) rather than day-to-day per-brand control.
export async function isTogglePaused() {
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'toggle_all_paused'`);
  return rows.length > 0 && rows[0].value === 'true';
}

// Moved here from toggle.routes.js (which imports it back) for the same reason
// normalizeBrandKey and isTogglePaused already live here — toggle.routes.js imports
// FROM queue.js, so defining this here (not there) avoids a circular import between
// the two files, letting runBulkJob's own loop use it directly below.
export async function isToggleFrozen(brand) {
  const key = `toggle_frozen_${normalizeBrandKey(brand)}`;
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  return rows.length > 0 && rows[0].value === 'true';
}

// The 3 real, day-to-day brands automation is allowed to act on without a human
// explicitly starting it — imported by the Hourly Recheck cron so it can never touch a
// brand outside this list (e.g. Ovenfresh), even if that brand happens to have a store
// left at desired_state = 'ONLINE' from earlier testing. Keys must already be
// normalizeBrandKey() output (e.g. "cake_zone", not "Cake Zone" or "cake zone").
export const AUTO_MANAGED_BRANDS = ['olio', 'eatfit', 'cake_zone'];

// Single source of truth for the eatfit auto-throttle threshold — imported wherever
// this number is needed (the JIT check below, the enforcer cron, the legacy webhook)
// instead of being duplicated as a hardcoded literal in each place.
export const EATFIT_THROTTLE_THRESHOLD = 15;

// Single source of truth for "given this brand is online-desired, should it actually
// be enabled or throttled down right now" — used by runBulkJob's JIT check below AND
// by the problem-retry route, so a retry can never bypass the threshold and re-enable
// a kitchen that's supposed to still be throttled.
export function resolveOnlineAction(brand, activeOrders) {
  if ((brand || '').toLowerCase().includes('eatfit') && activeOrders > EATFIT_THROTTLE_THRESHOLD) {
    return 'disable';
  }
  return 'enable';
}

// Single source of truth for our own per-brand rate ceiling (deliberately below
// UrbanPiper's actual limit, as headroom) — imported wherever this number is needed
// (the default below, the bulk self-throttle, the sidebar's displayed max, and the
// single-toggle route's error message) instead of being duplicated as a hardcoded
// literal in each place, which is exactly how the bulk self-throttle below used to
// silently drift out of sync with this ceiling.
// Set to 18 — 2 below UrbanPiper's own documented ceiling of 20/min for this endpoint
// (confirmed from their API docs), matching what Olio's legacy Apps Script already
// safely runs at long-term. Applies to every brand equally.
export const RATE_LIMIT_CEILING = 18;

// Bulk jobs self-throttle below RATE_LIMIT_CEILING (not the full ceiling) so single
// urgent toggles always have headroom instead of getting a flat 429 while a large bulk
// sync is consuming the whole shared budget for that brand.
export const BULK_RATE_LIMIT = 16;

// effectiveLimit lets callers self-throttle below the real UrbanPiper ceiling.
export async function checkAndIncrementRateLimit(brand, effectiveLimit = RATE_LIMIT_CEILING) {
  // Normalize here, once, regardless of what casing/format the caller happens to pass
  // in ("Cake Zone" vs "cake_zone") — this is the same UrbanPiper account and needs to
  // share one rate-limit bucket. Without this, differently-formatted brand strings
  // (e.g. a store added via Manage Stores, which doesn't normalize before storing)
  // fragment into separate buckets, undercounting real UrbanPiper usage.
  const brandKey = normalizeBrandKey(brand);

  // Try to increment atomically if we're still in the same minute. The BETWEEN 0 AND 60
  // (not just "< 60") is deliberate — if minute_start_time is ever corrupted into the
  // future (a bad clock read, a bad manual write, whatever the cause), NOW() - that
  // timestamp is negative, and a negative number is still "< 60" — meaning the old
  // condition would treat a corrupted row as "still the same minute" forever, permanently
  // wedging this brand's rate limit. Requiring elapsed >= 0 means any future-corrupted
  // timestamp falls through to the reset branch below instead, which overwrites it with
  // a fresh NOW() — self-healing on the very next call, regardless of what caused it.
  let res = await pool.query(`
    UPDATE api_health
    SET requests_this_minute = requests_this_minute + 1
    WHERE brand = $1 AND EXTRACT(EPOCH FROM (NOW() - minute_start_time)) BETWEEN 0 AND 60
    RETURNING requests_this_minute
  `, [brandKey]);

  if (res.rows.length > 0) {
    const count = res.rows[0].requests_this_minute;
    if (count > effectiveLimit) {
      // We exceeded the limit, revert the increment we just did
      await pool.query(`
        UPDATE api_health
        SET requests_this_minute = requests_this_minute - 1
        WHERE brand = $1
      `, [brandKey]);
      return -1; // Exceeded
    }
    return count;
  }

  // If no rows returned, either the brand is missing or the minute expired.
  // Upsert to reset the count and start a new minute
  const resetRes = await pool.query(`
    INSERT INTO api_health (brand, requests_this_minute, minute_start_time)
    VALUES ($1, 1, NOW())
    ON CONFLICT (brand) DO UPDATE
    SET requests_this_minute = 1, minute_start_time = NOW()
    RETURNING requests_this_minute
  `, [brandKey]);

  return 1;
}

export async function logProblemStore(store, action, errorMsg) {
  const storeName = store.name || store.store_name;
  const check = await pool.query(`SELECT id, fail_count FROM problem_stores WHERE store_id = $1 AND issue_type = 'FAILED'`, [store.location_id]);
  if (check.rows.length > 0) {
    await pool.query(`UPDATE problem_stores SET fail_count = fail_count + 1, last_attempt_at = NOW(), resolved = false WHERE id = $1`, [check.rows[0].id]);
  } else {
    await pool.query(`INSERT INTO problem_stores (store_name, store_id, brand, issue_type) VALUES ($1, $2, $3, 'FAILED')`, [storeName, store.location_id, store.brand]);
  }
}

async function logActivity({ storeName, storeId, brand, actorEmail, action, result, errorMsg, isBulk, isAutomated, bulkJobId, source, referenceIds }) {
  await pool.query(
    `INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, error_msg, is_bulk, is_automated, bulk_job_id, source, reference_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [storeName, storeId || null, brand || null, actorEmail, action, result, errorMsg || null, !!isBulk, !!isAutomated, bulkJobId || null, source, referenceIds?.length ? referenceIds : null]
  );
}

/**
 * Creates and starts a bulk toggle job. This is the single entry point used by
 * BOTH the HTTP /toggle/bulk route (manual actions) AND the background crons
 * (Hourly Recheck, Watchdog) — the crons call this directly, in-process, rather
 * than making a self-referential HTTP request (which requires auth and a
 * correct port, and was silently failing every time before this change).
 */
export async function initiateBulkJob(stores, action, filterContext, actorEmail, source, performToggleAPI) {
  if (!stores || !Array.isArray(stores) || stores.length === 0 || !action) {
    throw new Error("stores array and action required");
  }

  // Single choke point for every bulk path — manual bulk clicks AND every automated
  // cron (Hourly Recheck, EatFit Threshold Enforcer) call this directly, in-process.
  // Checked before the paused-store lookup or overlap lock so a full pause genuinely
  // does nothing at all, not even a DB read past this point.
  if (await isTogglePaused()) {
    return { jobId: null, paused: true };
  }

  // Paused stores are completely hands-off — excluded from every bulk and automated
  // path (manual bulk, Hourly Recheck all funnel through here), regardless of which one
  // triggered this run. Only an explicit Resume can bring one back in.
  const pausedRes = await pool.query(
    `SELECT location_id FROM managed_stores WHERE location_id = ANY($1) AND paused = true`,
    [stores.map(s => s.location_id)]
  );
  const pausedIds = new Set(pausedRes.rows.map(r => r.location_id));
  const activeStores = stores.filter(s => !pausedIds.has(s.location_id));

  if (activeStores.length === 0) {
    return { jobId: null, skippedPaused: pausedIds.size };
  }

  // normalizeBrandKey, not a bare .toLowerCase() — "Cake Zone" / "cake zone" / "cake_zone"
  // must all land in the same bucket, or the overlap lock and this job's own brands[]
  // column silently fragment into separate strings for what's really one brand. Sorted
  // so two jobs spanning the same multi-brand set always acquire their advisory locks
  // in the same order below, regardless of what order the stores arrived in.
  const brands = [...new Set(activeStores.map(s => normalizeBrandKey(s.brand || 'ovenfresh')))].sort();

  // Per-brand overlap lock, made atomic: the conflict check (is a job already
  // RUNNING/PAUSED for this brand?) and creating the new job row now happen on one
  // dedicated connection, inside one transaction, holding a Postgres advisory lock per
  // brand for the duration. Before this, those were two separate unsynchronized
  // round-trips — a plain SELECT, then later a plain INSERT — leaving a real window
  // where two bulk requests for the same brand landing close together (a double-click,
  // two tabs, a manual click racing an automated cron) could both see "nothing running"
  // and both start, which is exactly how two bulk jobs ended up running for Olio at
  // once in production. A job's heartbeat must still be recent to count as "still
  // alive" — if the process that owned it crashed or restarted mid-run, its heartbeat
  // goes stale and it stops blocking anything (see the cleanup cron in workers.js,
  // which also marks it FAILED so it's not left dangling forever).
  const client = await pool.connect();
  let jobId;
  try {
    await client.query('BEGIN');

    for (const b of brands) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [b]);
    }

    // A PAUSED job only counts as a conflict if a human paused it deliberately for a
    // reason that still needs resolving (someone else's manual job, or their own they
    // intend to come back to). A PAUSED *automated* job (Hourly Recheck) does not block
    // — pausing it via the status bar is exactly how a user is meant to free up the
    // brand for a manual action, so the manual click that follows must succeed, not
    // collide with the very job the user just stepped out of the way.
    const conflictRes = await client.query(`
      SELECT id, actor_email, created_at, total_stores, pending_count, brands, status
      FROM bulk_toggle_jobs
      WHERE (status = 'RUNNING' OR (status = 'PAUSED' AND actor_email NOT LIKE 'System —%'))
        AND last_heartbeat_at > NOW() - INTERVAL '10 minutes'
        AND brands && $1::text[]
      ORDER BY id DESC LIMIT 1
    `, [brands]);

    if (conflictRes.rows.length > 0) {
      const job = conflictRes.rows[0];
      if (source.startsWith('AUTO_')) {
        // Automated callers just skip quietly this cycle — they'll try again next tick.
        await client.query('ROLLBACK');
        return { jobId: null, blocked: true, conflictingJob: job };
      }

      // A manual action never silently takes over a running job for the same brand —
      // manual or automated, the user has to see it and act. A conflicting AUTOMATED
      // job (Hourly Recheck) gets a message pointing at the status bar, since the fix
      // is just to pause or cancel it there and retry; a conflicting MANUAL job (a
      // real person) gets the existing "wait or cancel" message, since two humans
      // colliding needs a human decision, not an automatic one.
      await client.query('ROLLBACK');
      const isAutomatedJob = (job.actor_email || '').startsWith('System —');
      const err = new Error(
        isAutomatedJob
          ? `An automated Hourly Recheck job is currently running for ${job.brands.join(', ')} ` +
            `(${job.total_stores - job.pending_count}/${job.total_stores} done). Go to the status bar's Jobs tab to pause or cancel it, then try again.`
          : `A bulk job is already running for ${job.brands.join(', ')} — started by ${job.actor_email} ` +
            `${Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000)} min ago ` +
            `(${job.total_stores - job.pending_count}/${job.total_stores} done). Wait for it to finish, or cancel it, before starting another.`
      );
      err.conflictingJob = job;
      throw err;
    }

    const jobRes = await client.query(
      `INSERT INTO bulk_toggle_jobs (action, total_stores, pending_count, brands, actor_email, last_heartbeat_at, store_ids, store_brands)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7) RETURNING id`,
      [action, activeStores.length, activeStores.length, brands, actorEmail,
       activeStores.map(s => s.location_id), activeStores.map(s => s.brand || 'ovenfresh')]
    );
    jobId = jobRes.rows[0].id;

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Update every store's desired_state in one batched upsert instead of one round-trip
  // per store — with a large brand (Olio) the old sequential loop was 100+ individual
  // queries before the HTTP response could even be sent, which is what actually
  // produced the ~50s stall (and a proxy/client timeout showing as a 500) between
  // clicking Bulk Enable and anything visibly happening.
  const desiredState = action === 'enable' ? 'ONLINE' : 'OFFLINE';
  const locationIds = activeStores.map(s => s.location_id);
  const storeBrands = activeStores.map(s => s.brand || 'ovenfresh');
  await pool.query(`
    INSERT INTO store_state (location_id, brand, desired_state)
    SELECT location_id, brand, $3::text
    FROM unnest($1::text[], $2::text[]) AS t(location_id, brand)
    ON CONFLICT (location_id) DO UPDATE SET desired_state = $3, last_updated = NOW()
  `, [locationIds, storeBrands, desiredState]);

  // Callers that just fire-and-forget (the HTTP routes) ignore completionPromise, same
  // as before. The Hourly Recheck chain below specifically needs it — it has to know
  // exactly when a job it started actually finishes (not just when it was created) to
  // correctly measure the 30-minute gap from real completion.
  const completionPromise = runBulkJob(jobId, activeStores, action, filterContext, performToggleAPI, actorEmail, source)
    .catch(async (err) => {
      // runBulkJob threw before it could set its own terminal status — the job would
      // otherwise sit "RUNNING" forever with a frozen heartbeat. Mark it FAILED, clear
      // the in-progress batch, re-arm the brand's chain, and alert. Everything here is
      // best-effort so a still-starved pool can't re-throw out of the handler.
      console.error(`[initiateBulkJob] job #${jobId} crashed:`, err);
      await pool.query(`UPDATE bulk_toggle_jobs SET status = 'FAILED', current_batch = NULL WHERE id = $1 AND status IN ('RUNNING','PAUSED')`, [jobId]).catch(() => {});
      await logActivity({
        storeName: `— job #${jobId} failed unexpectedly — ${err.message} —`, storeId: null,
        brand: brands.join(', '), actorEmail: 'System', action: action.toUpperCase(), result: 'FAILED',
        errorMsg: err.message, isBulk: true, isAutomated: source.startsWith('AUTO_'), bulkJobId: jobId, source: 'JOB_CRASH',
      }).catch(() => {});
      for (const b of brands) {
        try { touchBulkActivity(b); scheduleNextAttempt(b, performToggleAPI); } catch { /* keep going */ }
      }
      await raiseAlert(`BULK_JOB_CRASH:${brands.join(',')}`, 'CRITICAL',
        `Bulk job #${jobId} (${source}) threw and was marked FAILED: ${err.message}. Usually a DB connection-pool timeout under load.`,
        `Started by ${actorEmail}`).catch(() => {});
    });

  return { jobId, skippedPaused: pausedIds.size, completionPromise };
}

// Applies a set of store corrections OUTSIDE the bulk-job/overlap-lock system entirely
// — for callers where each correction is really an independent single-store action, not
// a coordinated "sweep everything" bulk job (currently just the EatFit order-threshold
// enforcer). Never creates a bulk_toggle_jobs row and never touches the per-brand
// advisory lock above, so it can never be blocked by, or block, a real bulk job for the
// same brand — it can run any number of times, at any moment, whether a bulk job for
// that brand is active or not.
//
// resolveAction receives each store (with a freshly-read active_orders merged in — see
// below) and returns the action to take. Fresh state is re-read immediately before
// acting on each store, not decided in advance from the caller's candidate list — a
// manual override landing in between must win, same principle as the JIT check bulk
// jobs already do.
export async function applySingleCorrections(stores, resolveAction, actorEmail, source, performToggleAPI) {
  if (await isTogglePaused()) return;

  for (const store of stores) {
    const brand = store.brand || 'ovenfresh';
    if (await isToggleFrozen(brand)) continue;

    const freshRes = await pool.query(`SELECT desired_state, active_orders FROM store_state WHERE location_id = $1`, [store.location_id]);
    const fresh = freshRes.rows[0];
    if (!fresh || fresh.desired_state !== 'ONLINE') continue; // manually taken offline since the candidate list was built — leave it alone

    let action = resolveAction({ ...store, active_orders: fresh.active_orders });
    const storeLabel = `${store.name || store.store_name || store.location_id} (${store.location_id})`;

    while (true) {
      const rl = await checkAndIncrementRateLimit(brand);
      if (rl === -1) {
        const hRes = await pool.query(`SELECT minute_start_time FROM api_health WHERE brand = $1`, [brand]);
        const start = new Date(hRes.rows[0].minute_start_time);
        const elapsed = new Date() - start;
        const sleepTime = Math.min(Math.max(0, 60000 - elapsed) + 500, 65000);
        await new Promise(r => setTimeout(r, sleepTime));
      } else {
        break;
      }
    }

    // Re-read fresh state again right before acting — the rate-limit wait above can now
    // run for tens of seconds to a few minutes under real contention, long enough for a
    // manual override or a real change in order count to land in between. Deciding once
    // before the wait and blindly executing it after would otherwise be able to
    // re-enable a store the user just manually disabled, or apply a throttle decision
    // that's no longer correct now that the order count has moved.
    try {
      const recheckRes = await pool.query(`SELECT desired_state, active_orders FROM store_state WHERE location_id = $1`, [store.location_id]);
      const recheck = recheckRes.rows[0];
      if (!recheck || recheck.desired_state !== 'ONLINE') continue; // manually taken offline during the wait — leave it alone
      action = resolveAction({ ...store, active_orders: recheck.active_orders });
    } catch (err) {
      console.error("[Post-wait recheck error]", err);
    }

    try {
      const toggleRes = await performToggleAPI(store.location_id, action, brand);
      if (!toggleRes.success) throw new Error(toggleRes.error || 'Toggle failed');

      await pool.query(`UPDATE managed_stores SET status = $1, status_updated_at = NOW() WHERE location_id = $2`, [action === 'enable' ? 'online' : 'offline', store.location_id]);
      await pool.query(`UPDATE problem_stores SET resolved = true WHERE store_id = $1 AND resolved = false`, [store.location_id]);
      await pool.query(`UPDATE api_health SET last_sync_time = NOW() WHERE brand = $1`, [brand]);

      await logActivity({
        storeName: storeLabel, storeId: store.location_id, brand,
        actorEmail: 'System — Auto-Throttle', action: action.toUpperCase(), result: 'SUCCESS',
        isBulk: false, isAutomated: true, source,
        referenceIds: toggleRes.referenceIds,
      });
    } catch (err) {
      await logProblemStore(store, action, err.message);
      await logActivity({
        storeName: storeLabel, storeId: store.location_id, brand,
        actorEmail: 'System', action: action.toUpperCase(), result: 'FAILED', errorMsg: err.message,
        isBulk: false, isAutomated: true, source,
      });
    }
  }
}

// A filter-scoped manual bulk ("turn off all HSR kitchens" — a handful of stores, not
// the whole brand) runs as a plain sequence of single-store toggles: NO bulk_toggle_jobs
// row, NO per-brand overlap lock, so it can run alongside an Hourly Recheck sweep. Each
// store's desired_state is set first, so that concurrent sweep's own JIT check sees the
// fresh intent and leaves these stores alone — the targeted manual action wins. Only for
// small sets (see TARGETED_BULK_MAX); a brand-wide bulk still goes through initiateBulkJob
// with its progress bar, pause/cancel, and the lock. Fire-and-forget from the route —
// the caller responds immediately and the cards flip via polling.
export const TARGETED_BULK_MAX = 25;

export async function applyTargetedBulk(stores, action, actorEmail, performToggleAPI) {
  if (await isTogglePaused()) return;

  const desiredState = action === 'enable' ? 'ONLINE' : 'OFFLINE';

  const pausedRes = await pool.query(
    `SELECT location_id FROM managed_stores WHERE location_id = ANY($1) AND paused = true`,
    [stores.map(s => s.location_id)]
  );
  const pausedIds = new Set(pausedRes.rows.map(r => r.location_id));
  const activeStores = stores.filter(s => !pausedIds.has(s.location_id));
  if (activeStores.length === 0) return;

  // Set desired_state up front, batched — this is what a concurrent Hourly Recheck's
  // JIT check reads to decide it should skip these stores.
  await pool.query(`
    INSERT INTO store_state (location_id, brand, desired_state)
    SELECT location_id, brand, $3::text
    FROM unnest($1::text[], $2::text[]) AS t(location_id, brand)
    ON CONFLICT (location_id) DO UPDATE SET desired_state = $3, last_updated = NOW()
  `, [activeStores.map(s => s.location_id), activeStores.map(s => s.brand || 'ovenfresh'), desiredState]);

  for (const store of activeStores) {
    const brand = store.brand || 'ovenfresh';
    const storeLabel = `${store.name || store.store_name || store.location_id} (${store.location_id})`;

    let currentAction = action;
    let wasAutoThrottled = false;
    try {
      const fresh = (await pool.query(`SELECT desired_state, active_orders FROM store_state WHERE location_id = $1`, [store.location_id])).rows[0];
      if (fresh && fresh.desired_state !== desiredState) {
        await logActivity({
          storeName: storeLabel, storeId: store.location_id, brand, actorEmail,
          action: currentAction.toUpperCase(), result: 'SUCCESS',
          errorMsg: 'Skipped — superseded by a more recent change', isBulk: true, source: 'MANUAL_TARGETED_BULK',
        });
        continue;
      }
      if (action === 'enable') {
        currentAction = resolveOnlineAction(brand, fresh?.active_orders);
        wasAutoThrottled = currentAction === 'disable';
      }
    } catch (err) { console.error('[Targeted bulk JIT error]', err); }

    while (true) {
      const rl = await checkAndIncrementRateLimit(brand);
      if (rl === -1) {
        const hRes = await pool.query(`SELECT minute_start_time FROM api_health WHERE brand = $1`, [brand]);
        const start = new Date(hRes.rows[0]?.minute_start_time || Date.now());
        const elapsed = Date.now() - start.getTime();
        await new Promise(r => setTimeout(r, Math.min(Math.max(0, 60000 - elapsed) + 500, 65000)));
      } else break;
    }

    try {
      const toggleRes = await performToggleAPI(store.location_id, currentAction, brand);
      if (!toggleRes.success) throw new Error(toggleRes.error || 'Toggle failed');
      await pool.query(`UPDATE managed_stores SET status = $1, status_updated_at = NOW() WHERE location_id = $2`, [currentAction === 'enable' ? 'online' : 'offline', store.location_id]);
      await pool.query(`UPDATE problem_stores SET resolved = true WHERE store_id = $1 AND resolved = false`, [store.location_id]);
      await pool.query(`UPDATE api_health SET last_sync_time = NOW() WHERE brand = $1`, [brand]);
      await logActivity({
        storeName: storeLabel, storeId: store.location_id, brand,
        actorEmail: wasAutoThrottled ? 'System — Auto-Throttle' : actorEmail,
        action: currentAction.toUpperCase(), result: 'SUCCESS',
        isBulk: true, isAutomated: wasAutoThrottled,
        source: wasAutoThrottled ? 'AUTO_THROTTLE' : 'MANUAL_TARGETED_BULK',
        referenceIds: toggleRes.referenceIds,
      });
    } catch (err) {
      await logProblemStore(store, currentAction, err.message);
      await logActivity({
        storeName: storeLabel, storeId: store.location_id, brand, actorEmail,
        action: currentAction.toUpperCase(), result: 'FAILED', errorMsg: err.message,
        isBulk: true, source: 'MANUAL_TARGETED_BULK',
      });
    }
  }
}

// ─── HOURLY RECHECK — SELF-CHAINING, NOT A FIXED CLOCK ─────────────────────────
// Each brand runs its own independent chain: attempt a check → 30 minutes after the
// LATEST bulk activity for that brand (auto or manual, however it ended) → attempt
// again → repeat forever. Modeled directly on how Olio's own legacy Apps Script stays
// reliable — it never runs on a fixed clock either, it reschedules itself relative to
// when the last thing actually finished.
//
// One rule handles every case a fixed interval can't:
//   - auto → auto: the auto run finishing IS the latest activity, 30 min later it goes again.
//   - auto → manual → auto: the manual job finishing pushes the due time out further —
//     the chain never fires early just because its own last run was a while ago.
//   - auto interrupted (paused or cancelled) for a manual job: cancelling counts as
//     activity too, so even if no manual job ever follows, the chain still recovers
//     within 30 minutes — never silently stays off indefinitely.
//   - a manual job already running when the chain's turn comes up: the chain just
//     doesn't act this instant — it doesn't need its own timer for this, because that
//     manual job's own completion (see runBulkJob's tail) re-touches this brand and
//     re-arms the chain anyway.
// 10 minutes (was 30). Every derived time — the countdown the UI shows, the wait
// before the next attempt, the "not due yet" guard, the retry after a blocked
// attempt, and the auto-resume delay for a job left paused — is this one value.
const HOURLY_RECHECK_GAP_MS = 10 * 60 * 1000;
const lastBulkActivityAt = new Map(); // brand -> timestamp (ms)
const chainTimers = new Map(); // brand -> Timeout handle, always at most one live per brand
const recheckInFlight = new Set(); // brands whose runHourlyRecheckForBrand is mid-run right now

// Called by runBulkJob's completion (below) for EVERY job that finishes — auto or
// manual, completed, cancelled, or failed — by the pause route the moment a job is
// paused (pausing doesn't reach runBulkJob's completion, so it needs its own touch) —
// and by runHourlyRecheckForBrand itself when a check finds nothing to do. Whatever the
// reason, this brand's chain due time is now 30 minutes from THIS moment.
export function touchBulkActivity(brand) {
  lastBulkActivityAt.set(normalizeBrandKey(brand), Date.now());
}

// For the lightweight safety-net check in workers.js — if a chain tick ever throws
// before it gets to reschedule itself (a bug, an unexpected error), this brand's chain
// silently goes quiet with nothing left to revive it until the server restarts. This
// lets that check notice and kick it back on.
export function isChainAlive(brand) {
  const key = normalizeBrandKey(brand);
  // A pending timer OR an attempt currently executing (which has no timer set until it
  // finishes — a long bulk job can run for many minutes) both count as alive. Without
  // the second check the workers.js safety net would repeatedly declare a healthy chain
  // "dead" for the whole duration of every real run and pointlessly re-invoke it.
  return chainTimers.has(key) || recheckInFlight.has(key);
}

// The timestamp (ms) the next Hourly Recheck attempt for this brand is scheduled for,
// so the UI can show "next auto run in ~12 min" and offer a skip. Null if the brand
// isn't auto-managed, or has no pending timer right now (e.g. a job is currently
// running for it — the chain re-arms once that finishes).
export function getNextAutoRunAt(brand) {
  const brandKey = normalizeBrandKey(brand);
  if (!AUTO_MANAGED_BRANDS.includes(brandKey) || !chainTimers.has(brandKey)) return null;
  return (lastBulkActivityAt.get(brandKey) || 0) + HOURLY_RECHECK_GAP_MS;
}

// Ensures exactly one pending timer per brand, aimed at 30 minutes after the latest
// known activity — safe to call redundantly from multiple places (it always clears any
// existing timer first), which is what lets touchBulkActivity + scheduleNextAttempt be
// called liberally without ever double-scheduling a brand.
export function scheduleNextAttempt(brand, performToggleAPI, forceDelayMs = null) {
  const brandKey = normalizeBrandKey(brand);
  const existing = chainTimers.get(brandKey);
  if (existing) clearTimeout(existing);

  const last = lastBulkActivityAt.get(brandKey) || 0;
  // forceDelayMs overrides the normal "30 min after last activity" math — used for the
  // short self-heal retry when an attempt was blocked by another job (see
  // runHourlyRecheckForBrand). Without it, a block would leave `last` untouched and far
  // in the past, so the normal math yields ~0 and we'd hot-loop.
  const waitMs = forceDelayMs != null
    ? forceDelayMs
    : Math.max(0, (last + HOURLY_RECHECK_GAP_MS) - Date.now());
  const handle = setTimeout(() => {
    chainTimers.delete(brandKey);
    attemptChainTick(brandKey, performToggleAPI).catch(err => console.error(`[QUEUE] Hourly Recheck chain tick failed for ${brandKey}:`, err));
  }, waitMs);
  chainTimers.set(brandKey, handle);
}

async function attemptChainTick(brandKey, performToggleAPI) {
  // Something more recent touched this brand since this timer was set (e.g. a manual
  // job finished after the timer fired for it, pushing the due time out further) — don't
  // run yet, just reschedule for the new due time.
  const last = lastBulkActivityAt.get(brandKey) || 0;
  if (Date.now() < last + HOURLY_RECHECK_GAP_MS) {
    return scheduleNextAttempt(brandKey, performToggleAPI);
  }
  await runHourlyRecheckForBrand(brandKey, performToggleAPI);
}

// One check for one brand — the thing the chain above repeats every 30 minutes, also
// callable directly (e.g. immediately on unfreeze, so a brand doesn't have to wait for
// its next scheduled attempt just because it was frozen when the timer fired).
export async function runHourlyRecheckForBrand(brandKey, performToggleAPI) {
  if (!AUTO_MANAGED_BRANDS.includes(brandKey)) return;
  // Mark the brand as having an attempt in progress so isChainAlive() doesn't read a
  // long-running job (no timer set until it completes) as a dead chain. Always cleared
  // in the finally, even if this throws — a stuck flag would permanently hide a truly
  // dead chain from the safety net.
  recheckInFlight.add(brandKey);
  try {
    // Paused/frozen/nothing-to-check all still count as "checked" — the chain must keep
    // ticking every 30 minutes regardless, or a brand that's quiet for a while (or was
    // frozen) goes permanently silent instead of resuming once conditions change.
    if (await isTogglePaused()) {
      touchBulkActivity(brandKey);
      return scheduleNextAttempt(brandKey, performToggleAPI);
    }
    if (await isToggleFrozen(brandKey)) {
      touchBulkActivity(brandKey);
      return scheduleNextAttempt(brandKey, performToggleAPI);
    }

    // A job left PAUSED for this brand — auto or manual — is handled here, not by
    // starting a fresh job alongside it. If it's been paused for the full gap the user
    // has "forgotten" to resume it: flip it back to RUNNING (its own runBulkJob loop, or
    // the one relaunched at startup, picks up from where it stopped) and re-arm the
    // chain. If it was paused more recently, just wait until it's due.
    const pausedRes = await pool.query(`
      SELECT id, paused_at, actor_email, total_stores, pending_count
      FROM bulk_toggle_jobs
      WHERE $1 = ANY(brands) AND status = 'PAUSED'
        AND last_heartbeat_at > NOW() - INTERVAL '10 minutes'
      ORDER BY id DESC LIMIT 1
    `, [brandKey]);
    if (pausedRes.rows.length > 0) {
      const pj = pausedRes.rows[0];
      const pausedMs = pj.paused_at ? new Date(pj.paused_at).getTime() : 0;
      const dueIn = Math.max(0, pausedMs + HOURLY_RECHECK_GAP_MS - Date.now());
      if (dueIn > 0) {
        return scheduleNextAttempt(brandKey, performToggleAPI, dueIn);
      }
      await pool.query(`UPDATE bulk_toggle_jobs SET status = 'RUNNING', paused_at = NULL WHERE id = $1 AND status = 'PAUSED'`, [pj.id]);
      await logActivity({
        storeName: `— job #${pj.id} auto-resumed after ${Math.round(HOURLY_RECHECK_GAP_MS / 60000)} min paused (${pj.total_stores - pj.pending_count}/${pj.total_stores} done) —`,
        storeId: null, brand: brandKey, actorEmail: 'System', action: 'RESUME', result: 'SUCCESS',
        isBulk: true, isAutomated: true, bulkJobId: pj.id, source: 'AUTO_RESUME_PAUSED',
      }).catch(() => {});
      touchBulkActivity(brandKey);
      return scheduleNextAttempt(brandKey, performToggleAPI);
    }

    const storesRes = await pool.query(`SELECT location_id, brand FROM store_state WHERE desired_state = 'ONLINE'`);
    const brandStores = storesRes.rows.filter(s => normalizeBrandKey(s.brand || 'ovenfresh') === brandKey);
    if (brandStores.length === 0) {
      touchBulkActivity(brandKey);
      return scheduleNextAttempt(brandKey, performToggleAPI);
    }

    const result = await initiateBulkJob(brandStores, "enable", " (Hourly Recheck)", "System — Hourly Recheck", "AUTO_HOURLY_RECHECK", performToggleAPI);
    if (result.blocked) {
      // A real manual job is running for this brand. Its own completion (runBulkJob's
      // tail) re-arms this chain when it finishes — but if that job's process died and
      // left a stale row, nothing would. So also schedule our own retry one gap out: a
      // live job re-arms sooner via its tail, a dead one gets retried until the
      // stale-job cleanup (or startup relaunch) clears it.
      return scheduleNextAttempt(brandKey, performToggleAPI, HOURLY_RECHECK_GAP_MS);
    }
    // A job was created — wait for it to actually finish. Its own completion, inside
    // runBulkJob's tail below, is what calls touchBulkActivity + scheduleNextAttempt for
    // this brand; nothing further needed here.
    if (result.completionPromise) await result.completionPromise;
  } finally {
    recheckInFlight.delete(brandKey);
  }
}

export async function runBulkJob(jobId, stores, action, filterContext, performToggleAPI, actorEmail = 'System', source = 'MANUAL_BULK') {
  const CONCURRENCY = 10;
  const isAutomatedSource = source.startsWith('AUTO_');
  // Computed once — freezing mid-brand-job is the common case this loop needs to
  // notice (see the per-chunk check below); a job spanning multiple brands stops
  // entirely if any one of them gets frozen, which matches how bulk actions are
  // actually triggered today (always scoped to one brand at a time from the UI).
  const jobBrands = [...new Set(stores.map(s => normalizeBrandKey(s.brand || 'ovenfresh')))];

  for (let i = 0; i < stores.length; i += CONCURRENCY) {
    const chunk = stores.slice(i, i + CONCURRENCY);

    // Bump the heartbeat every chunk — this is what tells the overlap lock and the
    // stale-job cleanup cron that this job is still genuinely alive, not abandoned
    // by a crashed/restarted process.
    //
    // FAILED is stops-the-loop too, same as CANCELLED — it's ONLY ever set by that
    // same stale-job cleanup cron (nothing else marks a job FAILED), meaning "we
    // believe the process that owned this died." If this loop is still alive to read
    // that verdict, the cleanup was a false positive (this job just had one slow
    // stretch, e.g. a long rate-limit wait, that pushed its heartbeat past the 10-min
    // staleness window) — but the verdict has already been acted on: the overlap lock
    // no longer sees this job as blocking, so a fresh job for the same brand may
    // already be running. Ignoring FAILED and continuing anyway is exactly how a job
    // silently kept toggling real stores for hours under a "FAILED" label with zero
    // visibility in the UI, invisibly competing for the same rate-limit budget as
    // whatever replaced it.
    let jobRes = await pool.query('UPDATE bulk_toggle_jobs SET last_heartbeat_at = NOW() WHERE id = $1 RETURNING status', [jobId]);
    let status = jobRes.rows[0]?.status;

    if (['CANCELLED', 'FAILED'].includes(status)) break;

    while (status === 'PAUSED') {
      await new Promise(r => setTimeout(r, 2000));
      jobRes = await pool.query('UPDATE bulk_toggle_jobs SET last_heartbeat_at = NOW() WHERE id = $1 RETURNING status', [jobId]);
      status = jobRes.rows[0]?.status;
      if (['CANCELLED', 'FAILED'].includes(status)) break;
    }

    if (['CANCELLED', 'FAILED'].includes(status)) break;

    // Freezing a brand mid-run doesn't stop this loop on its own — performToggleAPI
    // already refuses every real UrbanPiper call for a frozen brand regardless (that
    // was always true), but without this check the loop would keep grinding through
    // every remaining store anyway, burning real rate-limit-check DB calls for
    // nothing and sitting there as "RUNNING" until it exhausted its whole list. This
    // stops it at the same chunk boundary as a Cancel, so a freeze mid-run actually
    // means nothing keeps running, not just "nothing reaches UrbanPiper."
    const anyBrandFrozen = (await Promise.all(jobBrands.map(b => isToggleFrozen(b)))).some(Boolean);
    if (anyBrandFrozen) {
      await pool.query('UPDATE bulk_toggle_jobs SET status = $1 WHERE id = $2 AND status IN ($3, $4)', ['CANCELLED', jobId, 'RUNNING', 'PAUSED']);
      await logActivity({
        storeName: `— job #${jobId} stopped — ${jobBrands.join(', ')} frozen mid-run —`, storeId: null,
        brand: jobBrands.join(', '), actorEmail: 'System', action: 'AUTO_CANCEL', result: 'SUCCESS',
        errorMsg: `${stores.length - i} store(s) never attempted`,
        isBulk: true, isAutomated: true, bulkJobId: jobId, source: 'AUTO_CANCEL_FROZEN',
      });
      break;
    }

    // Record which stores are about to be worked on, in one write for the whole chunk
    // (not one write per store) — this is what lets the UI show "currently processing"
    // during a bulk run without adding a query per store. Up to CONCURRENCY (10) stores
    // are genuinely in flight together, not one at a time, so this is a small batch,
    // not a single name.
    const chunkLabels = chunk.map(s => `${s.store_name || s.name || s.location_id} (${s.location_id})`);
    await pool.query('UPDATE bulk_toggle_jobs SET current_batch = $1 WHERE id = $2', [chunkLabels, jobId]);

    // Process chunk concurrently
    await Promise.all(chunk.map(async (store) => {
      let currentAction = action;
      let wasAutoThrottled = false;
      const brand = store.brand || "ovenfresh";
      const storeLabel = `${store.store_name || store.name || store.location_id} (${store.location_id})`;

     // Outer guard: whatever throws in here — a DB pool timeout under load being the
     // usual culprit — must never escape and reject Promise.all, which is how a job
     // used to freeze at "0/699, still RUNNING" forever. Anything unhandled below is
     // counted as one failed store and the job keeps going.
     try {
      // ─── JUST-IN-TIME VALIDATION & THRESHOLD CHECK ───
      try {
        const stateRes = await pool.query(`SELECT desired_state, active_orders FROM store_state WHERE location_id = $1`, [store.location_id]);
        if (stateRes.rows.length > 0) {
          const { desired_state, active_orders } = stateRes.rows[0];

          // Skip if manual override happened during the queue — a manual single-store
          // action always wins over whatever this bulk/auto job (manual bulk, Hourly
          // Recheck, or a manual bulk disable) was about to do to that same store.
          // Symmetric both ways: a manual disable beats an enable-direction job, and a
          // manual enable beats a disable-direction job.
          if (desired_state === 'OFFLINE' && currentAction === 'enable') {
            console.log(`[JIT] Skipping ${store.location_id} - user set to OFFLINE manually.`);
            await pool.query('UPDATE bulk_toggle_jobs SET success_count = success_count + 1, pending_count = pending_count - 1, completed_store_ids = array_append(completed_store_ids, $1) WHERE id = $2', [store.location_id, jobId]);
            await logActivity({
              storeName: storeLabel, storeId: store.location_id, brand,
              actorEmail, action: 'ENABLE', result: 'SUCCESS',
              errorMsg: 'Skipped — manually set OFFLINE mid-queue', isBulk: true,
              isAutomated: isAutomatedSource, bulkJobId: jobId, source,
            });
            return; // Skip this store
          }
          if (desired_state === 'ONLINE' && currentAction === 'disable') {
            console.log(`[JIT] Skipping ${store.location_id} - user set to ONLINE manually.`);
            await pool.query('UPDATE bulk_toggle_jobs SET success_count = success_count + 1, pending_count = pending_count - 1, completed_store_ids = array_append(completed_store_ids, $1) WHERE id = $2', [store.location_id, jobId]);
            await logActivity({
              storeName: storeLabel, storeId: store.location_id, brand,
              actorEmail, action: 'DISABLE', result: 'SUCCESS',
              errorMsg: 'Skipped — manually set ONLINE mid-queue', isBulk: true,
              isAutomated: isAutomatedSource, bulkJobId: jobId, source,
            });
            return; // Skip this store
          }

          // Apply the eatfit order threshold (ONLY for eatfit) — throttles once a
          // kitchen's acknowledged-order count goes above EATFIT_THROTTLE_THRESHOLD.
          if (desired_state === 'ONLINE') {
            currentAction = resolveOnlineAction(brand, active_orders);
            if (currentAction === 'disable') {
               console.log(`[THROTTLE] ${store.location_id} active_orders = ${active_orders} > ${EATFIT_THROTTLE_THRESHOLD}. Auto-throttling to OFFLINE.`);
               wasAutoThrottled = true;
            }
          }
        }
      } catch (err) {
        console.error("[JIT Check Error]", err);
      }

      // Wait for rate limit
      while (true) {
        const rl = await checkAndIncrementRateLimit(brand, BULK_RATE_LIMIT);
        if (rl === -1) {
          const hRes = await pool.query(`SELECT minute_start_time FROM api_health WHERE brand = $1`, [brand]);
          const start = new Date(hRes.rows[0].minute_start_time);
          const elapsed = new Date() - start;
          // Clamped defensively — the self-healing fix above means -1 should now only
          // ever come from a genuinely valid, recent window, but capping this at 65s
          // regardless means a future timestamp anomaly degrades to "waits a bit too
          // long" instead of overflowing setTimeout's ~24.8-day limit and firing near-
          // instantly, which is what turned this into a busy-loop hammering the DB before.
          const sleepTime = Math.min(Math.max(0, 60000 - elapsed) + 500, 65000);
          await new Promise(r => setTimeout(r, sleepTime));
        } else {
          break; // Allowed
        }
      }

      // Re-check for a manual override that landed *during* the rate-limit wait above.
      // The JIT check earlier only sees state as of before that wait — at a strict
      // 16-18/min budget that wait is now commonly tens of seconds, long enough for a
      // real manual click to land in between and otherwise get silently overwritten by
      // whatever this loop already decided to do before waiting.
      try {
        const freshState = await pool.query(`SELECT desired_state FROM store_state WHERE location_id = $1`, [store.location_id]);
        const freshDesired = freshState.rows[0]?.desired_state;
        const overriddenOffline = freshDesired === 'OFFLINE' && currentAction === 'enable';
        const overriddenOnline = freshDesired === 'ONLINE' && currentAction === 'disable';
        if (overriddenOffline || overriddenOnline) {
          console.log(`[JIT] Skipping ${store.location_id} - user set to ${freshDesired} manually during the rate-limit wait.`);
          await pool.query('UPDATE bulk_toggle_jobs SET success_count = success_count + 1, pending_count = pending_count - 1, completed_store_ids = array_append(completed_store_ids, $1) WHERE id = $2', [store.location_id, jobId]);
          await logActivity({
            storeName: storeLabel, storeId: store.location_id, brand,
            actorEmail, action: currentAction.toUpperCase(), result: 'SUCCESS',
            errorMsg: `Skipped — manually set ${freshDesired} during rate-limit wait`, isBulk: true,
            isAutomated: isAutomatedSource, bulkJobId: jobId, source,
          });
          return; // Skip this store — the rate-limit slot already spent is an acceptable
                   // small cost for actually respecting the manual action.
        }
      } catch (err) {
        console.error("[Post-wait override check error]", err);
      }

      // Perform toggle
      try {
        let toggleRes = await performToggleAPI(store.location_id, currentAction, brand);

        if (toggleRes.status === 429) {
          // Urban Piper returned 429. Force wait 61s and retry once.
          await new Promise(r => setTimeout(r, 61000));
          toggleRes = await performToggleAPI(store.location_id, currentAction, brand);
          if (!toggleRes.success) throw new Error(toggleRes.error || "429 Retry failed");
        } else if (!toggleRes.success) {
          throw new Error(toggleRes.error);
        }

        await pool.query(`UPDATE managed_stores SET status = $1, status_updated_at = NOW() WHERE location_id = $2`, [currentAction === 'enable' ? 'online' : 'offline', store.location_id]);
        await pool.query(`UPDATE problem_stores SET resolved = true WHERE store_id = $1 AND resolved = false`, [store.location_id]);
        await pool.query('UPDATE bulk_toggle_jobs SET success_count = success_count + 1, pending_count = pending_count - 1, completed_store_ids = array_append(completed_store_ids, $1) WHERE id = $2', [store.location_id, jobId]);
        await pool.query(`UPDATE api_health SET last_sync_time = NOW() WHERE brand = $1`, [brand]);

        // Auto-throttle mid-bulk-job needs its own dedicated, correctly-sourced audit
        // row: it's the ONLY way the Watchdog Cron (which matches on store_id) can find
        // and recover it within its 10-minute cycle, instead of falling back to the
        // much slower Hourly Recheck.
        await logActivity({
          storeName: storeLabel, storeId: store.location_id, brand,
          actorEmail: wasAutoThrottled ? 'System — Auto-Throttle' : actorEmail,
          action: currentAction.toUpperCase(), result: 'SUCCESS',
          isBulk: !wasAutoThrottled, isAutomated: wasAutoThrottled || isAutomatedSource,
          bulkJobId: jobId, source: wasAutoThrottled ? 'AUTO_THROTTLE' : source,
          referenceIds: toggleRes.referenceIds,
        });
      } catch (err) {
         await pool.query('UPDATE bulk_toggle_jobs SET failed_count = failed_count + 1, pending_count = pending_count - 1, completed_store_ids = array_append(completed_store_ids, $1) WHERE id = $2', [store.location_id, jobId]).catch(() => {});
         await logProblemStore(store, currentAction, err.message).catch(() => {});
         await logActivity({
           storeName: storeLabel, storeId: store.location_id, brand,
           actorEmail, action: currentAction.toUpperCase(), result: 'FAILED', errorMsg: err.message,
           isBulk: true, isAutomated: isAutomatedSource, bulkJobId: jobId, source,
         }).catch(() => {});
      }
     } catch (outerErr) {
       // Escaped every inner handler — count it once as a failed store and move on.
       // Best-effort cleanup: if the pool is still starved these just no-op.
       console.error(`[runBulkJob] store ${store.location_id} crashed:`, outerErr);
       await pool.query('UPDATE bulk_toggle_jobs SET failed_count = failed_count + 1, pending_count = pending_count - 1, completed_store_ids = array_append(completed_store_ids, $1) WHERE id = $2', [store.location_id, jobId]).catch(() => {});
       await logActivity({
         storeName: storeLabel, storeId: store.location_id, brand,
         actorEmail, action: currentAction.toUpperCase(), result: 'FAILED', errorMsg: `Unexpected: ${outerErr.message}`,
         isBulk: true, isAutomated: isAutomatedSource, bulkJobId: jobId, source,
       }).catch(() => {});
     }
    }));

    // Delay 2s between chunks for UP strictness
    await new Promise(r => setTimeout(r, 2000));
  }

  await pool.query('UPDATE bulk_toggle_jobs SET status = $1, current_batch = NULL WHERE id = $2 AND status IN ($3, $4)', ['COMPLETED', jobId, 'RUNNING', 'PAUSED']);
  await pool.query('UPDATE bulk_toggle_jobs SET current_batch = NULL WHERE id = $1', [jobId]); // also clear it for the CANCELLED/FAILED paths, which the update above doesn't touch

  // This job just reached a terminal state — completed, cancelled, or failed, doesn't
  // matter which — so for each brand it touched, that's now "the latest activity."
  // Re-arm that brand's Hourly Recheck chain for 30 minutes from right now. This is the
  // ONE hook that makes every case work: a normal auto run finishing, a manual job
  // finishing (whether or not it interrupted a paused/cancelled auto run), and an auto
  // run that got cancelled with no manual job ever following it (this same completion
  // still fires once the loop notices CANCELLED and exits) — all funnel through here.
  for (const b of jobBrands) {
    touchBulkActivity(b);
    scheduleNextAttempt(b, performToggleAPI);
  }

  const finalJob = await pool.query('SELECT * FROM bulk_toggle_jobs WHERE id = $1', [jobId]);
  const j = finalJob.rows[0];
  const uniqueBrands = [...new Set(stores.map(s => s.brand))].filter(Boolean).join(", ");
  // The summary must say how the job actually ended — CANCELLED or FAILED read very
  // differently from a normal finish, and previously this always read the same
  // regardless, making it look like every job simply completed even when it didn't.
  const endedNormally = j.status === 'COMPLETED';
  const summaryMsg = `Bulk ${action.toUpperCase()} [${uniqueBrands}]${filterContext}${endedNormally ? '' : ` — ${j.status}`} — ${j.total_stores} Total ✅ ${j.success_count} ❌ ${j.failed_count}`;
  await logActivity({
    storeName: summaryMsg, storeId: null, brand: uniqueBrands || null,
    actorEmail, action: action.toUpperCase(), result: endedNormally ? 'SUCCESS' : j.status,
    isBulk: true, isAutomated: isAutomatedSource, bulkJobId: jobId, source,
  });

  // A high failure RATE (as opposed to one store having a bad day, already handled by
  // the normal Problem Stores flow) usually means something systemic — UrbanPiper is
  // down, credentials expired, network issue — not that many individual stores
  // coincidentally broke at once. Ignore small jobs, where a couple of failures easily
  // push the percentage up without meaning anything.
  const attempted = j.success_count + j.failed_count;
  if (attempted >= 10 && j.failed_count / attempted > 0.25) {
    // Each bulk job is its own one-off event, not an ongoing state — so this only
    // ever raises, never resolves (a healthy job for a DIFFERENT brand finishing
    // shouldn't be able to clear an alert some other brand's job just raised).
    // The per-category cooldown in raiseAlert already prevents repeat-job spam.
    await raiseAlert(`HIGH_BULK_FAILURE_RATE:${uniqueBrands}`, 'CRITICAL',
      `Job #${jobId} (${uniqueBrands}, ${source}) failed on ${j.failed_count} of ${attempted} stores attempted — ${Math.round((j.failed_count / attempted) * 100)}%. This usually means UrbanPiper itself is having an issue for this brand, not that individual stores are broken.`,
      `Started by ${actorEmail}${filterContext}`);
  }
}

// Idempotent — safe to run on every boot. Adds the columns this file's newer code
// relies on to an existing bulk_toggle_jobs table (the base schema.sql predates them).
// Same ADD COLUMN IF NOT EXISTS pattern auth/init_db.js already uses.
export async function ensureToggleJobColumns() {
  await pool.query(`ALTER TABLE bulk_toggle_jobs ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP`);
  await pool.query(`ALTER TABLE bulk_toggle_jobs ADD COLUMN IF NOT EXISTS store_ids TEXT[]`);
  await pool.query(`ALTER TABLE bulk_toggle_jobs ADD COLUMN IF NOT EXISTS store_brands TEXT[]`);
}

// Called once at startup, before the Hourly Recheck chains are kicked. A freshly
// started process has no runBulkJob loop behind any of the RUNNING/PAUSED rows left by
// the previous process — so instead of marking them all FAILED (the old behaviour,
// which is what made a paused/interrupted job un-resumable across a deploy), re-drive
// each one from where it stopped:
//   - status is kept as-is: a RUNNING job resumes immediately, a PAUSED job's loop
//     parks in its wait loop until someone (or the 10-min auto-resume) sets it RUNNING.
//   - the remaining store list is store_ids minus completed_store_ids. For an auto
//     re-enable that predates store_ids, it's reconstructed from store_state instead.
//   - a manual job with no store_ids (predates this deploy) can't be reconstructed, so
//     it's marked FAILED and its brand's chain re-armed — same as the old behaviour,
//     but only for that one un-recoverable case.
//   - if two non-terminal rows somehow exist for the same brand, only the newest is
//     re-driven; the older is marked FAILED as superseded.
export async function resumeInterruptedJobs(performToggleAPI) {
  let rows;
  try {
    rows = (await pool.query(`
      SELECT id, action, brands, actor_email, status, pending_count, total_stores,
             store_ids, store_brands, completed_store_ids
      FROM bulk_toggle_jobs
      WHERE status IN ('RUNNING', 'PAUSED')
      ORDER BY id DESC
    `)).rows;
  } catch (err) {
    console.error('[resumeInterruptedJobs] could not read jobs:', err.message);
    return;
  }
  if (rows.length === 0) return;

  const handledBrands = new Set();
  for (const job of rows) {
    const jobBrandKeys = (job.brands || []).map(normalizeBrandKey);
    const isAuto = (job.actor_email || '').startsWith('System —');
    const source = isAuto ? 'AUTO_HOURLY_RECHECK' : 'MANUAL_BULK';
    const reArmChain = () => {
      for (const b of jobBrandKeys) {
        if (AUTO_MANAGED_BRANDS.includes(b)) {
          try { touchBulkActivity(b); scheduleNextAttempt(b, performToggleAPI); } catch { /* keep going */ }
        }
      }
    };

    const failJob = async (why) => {
      await pool.query(`UPDATE bulk_toggle_jobs SET status = 'FAILED', current_batch = NULL WHERE id = $1 AND status IN ('RUNNING','PAUSED')`, [job.id]).catch(() => {});
      await logActivity({
        storeName: `— job #${job.id} could not be resumed after restart — ${why} —`, storeId: null,
        brand: (job.brands || []).join(', '), actorEmail: 'System', action: (job.action || 'ENABLE').toUpperCase(),
        result: 'FAILED', errorMsg: why, isBulk: true, isAutomated: isAuto, bulkJobId: job.id, source: 'JOB_CRASH',
      }).catch(() => {});
      reArmChain();
    };

    if (jobBrandKeys.some(b => handledBrands.has(b))) {
      await failJob('superseded by a newer job for the same brand');
      continue;
    }
    jobBrandKeys.forEach(b => handledBrands.add(b));

    if ((job.pending_count ?? 0) <= 0) {
      await pool.query(`UPDATE bulk_toggle_jobs SET status = 'COMPLETED', current_batch = NULL WHERE id = $1 AND status IN ('RUNNING','PAUSED')`, [job.id]).catch(() => {});
      reArmChain();
      continue;
    }

    const done = new Set(job.completed_store_ids || []);
    let remaining = [];
    if (Array.isArray(job.store_ids) && job.store_ids.length > 0) {
      remaining = job.store_ids
        .map((id, i) => ({ location_id: id, brand: (job.store_brands || [])[i] || 'ovenfresh' }))
        .filter(s => !done.has(s.location_id));
    } else if (isAuto) {
      const all = (await pool.query(`SELECT location_id, brand FROM store_state WHERE desired_state = 'ONLINE'`)).rows;
      remaining = all
        .filter(s => jobBrandKeys.includes(normalizeBrandKey(s.brand || 'ovenfresh')))
        .filter(s => !done.has(s.location_id));
    } else {
      await failJob('manual job predates store-list tracking');
      continue;
    }

    if (remaining.length === 0) {
      await pool.query(`UPDATE bulk_toggle_jobs SET status = 'COMPLETED', current_batch = NULL WHERE id = $1 AND status IN ('RUNNING','PAUSED')`, [job.id]).catch(() => {});
      reArmChain();
      continue;
    }

    // Bump the heartbeat now, synchronously, before the fire-and-forget relaunch below
    // and before the chains get kicked — otherwise the chain's own overlap check could
    // see a pre-restart heartbeat older than 10 min, not count this job as alive, and
    // start a second job for the same brand alongside the one we're re-driving.
    await pool.query(`UPDATE bulk_toggle_jobs SET last_heartbeat_at = NOW() WHERE id = $1`, [job.id]).catch(() => {});

    console.log(`[resumeInterruptedJobs] re-driving job #${job.id} (${job.status}, ${isAuto ? 'auto' : 'manual'}) — ${remaining.length} of ${job.total_stores} stores remaining`);
    await logActivity({
      storeName: `— job #${job.id} resumed after restart — ${remaining.length} store(s) remaining —`, storeId: null,
      brand: (job.brands || []).join(', '), actorEmail: 'System', action: (job.action || 'ENABLE').toUpperCase(),
      result: 'SUCCESS', isBulk: true, isAutomated: isAuto, bulkJobId: job.id, source: 'JOB_RESUME',
    }).catch(() => {});

    runBulkJob(job.id, remaining, job.action, ' (resumed after restart)', performToggleAPI, job.actor_email, source)
      .catch(async (err) => {
        console.error(`[resumeInterruptedJobs] re-driven job #${job.id} crashed:`, err);
        await pool.query(`UPDATE bulk_toggle_jobs SET status = 'FAILED', current_batch = NULL WHERE id = $1 AND status IN ('RUNNING','PAUSED')`, [job.id]).catch(() => {});
        reArmChain();
        await raiseAlert(`BULK_JOB_CRASH:${jobBrandKeys.join(',')}`, 'CRITICAL',
          `Re-driven bulk job #${job.id} threw and was marked FAILED: ${err.message}.`, `Resumed at startup`).catch(() => {});
      });
  }
}
