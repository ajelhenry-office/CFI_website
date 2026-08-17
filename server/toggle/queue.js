import { pool } from '../ratings/db.js';
import { raiseAlert } from '../alerts/alertService.js';

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

// effectiveLimit lets callers self-throttle below the real UrbanPiper ceiling. Bulk
// jobs pass a lower number so they always leave headroom for single urgent actions
// (e.g. "the store ran out of gas, disable it now") to go through immediately instead
// of getting flat-out rejected because a big bulk sync is consuming the whole budget.
export async function checkAndIncrementRateLimit(brand, effectiveLimit = 180) {
  // Normalize here, once, regardless of what casing/format the caller happens to pass
  // in ("Cake Zone" vs "cake_zone") — this is the same UrbanPiper account and needs to
  // share one rate-limit bucket. Without this, differently-formatted brand strings
  // (e.g. a store added via Manage Stores, which doesn't normalize before storing)
  // fragment into separate buckets, undercounting real UrbanPiper usage.
  const brandKey = brand.toLowerCase().replace(/[^a-z]/g, "_");

  // Try to increment atomically if we're still in the same minute
  let res = await pool.query(`
    UPDATE api_health
    SET requests_this_minute = requests_this_minute + 1
    WHERE brand = $1 AND EXTRACT(EPOCH FROM (NOW() - minute_start_time)) < 60
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

async function logActivity({ storeName, storeId, brand, actorEmail, action, result, errorMsg, isBulk, isAutomated, bulkJobId, source }) {
  await pool.query(
    `INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, error_msg, is_bulk, is_automated, bulk_job_id, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [storeName, storeId || null, brand || null, actorEmail, action, result, errorMsg || null, !!isBulk, !!isAutomated, bulkJobId || null, source]
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

  // Per-brand overlap lock: block only if a job already RUNNING/PAUSED touches one of
  // the SAME brands — unrelated brands (separate rate-limit budgets, no shared state)
  // are free to run concurrently. A job's heartbeat must be recent for it to count as
  // "still alive" — if the process that owned it crashed or restarted mid-run, its
  // heartbeat goes stale and it stops blocking anything (see the cleanup cron in
  // workers.js, which also marks it FAILED so it's not left dangling forever).
  const brands = [...new Set(stores.map(s => (s.brand || 'ovenfresh').toLowerCase()))];
  const conflictRes = await pool.query(`
    SELECT id, actor_email, created_at, total_stores, pending_count, brands
    FROM bulk_toggle_jobs
    WHERE status IN ('RUNNING', 'PAUSED')
      AND last_heartbeat_at > NOW() - INTERVAL '10 minutes'
      AND brands && $1::text[]
    ORDER BY id DESC LIMIT 1
  `, [brands]);

  if (conflictRes.rows.length > 0) {
    const job = conflictRes.rows[0];
    if (source.startsWith('AUTO_')) {
      // Automated callers just skip quietly this cycle — they'll try again next tick.
      return { jobId: null, blocked: true, conflictingJob: job };
    }
    const err = new Error(
      `A bulk job is already running for ${job.brands.join(', ')} — started by ${job.actor_email} ` +
      `${Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000)} min ago ` +
      `(${job.total_stores - job.pending_count}/${job.total_stores} done). Wait for it to finish, or cancel it, before starting another.`
    );
    err.conflictingJob = job;
    throw err;
  }

  const desiredState = action === 'enable' ? 'ONLINE' : 'OFFLINE';

  // Update all desired states immediately using the original location_id (even if it's comma-separated)
  for (const store of stores) {
    await pool.query(`
      INSERT INTO store_state (location_id, brand, desired_state)
      VALUES ($1, $2, $3)
      ON CONFLICT (location_id)
      DO UPDATE SET desired_state = $3, last_updated = NOW()
    `, [store.location_id, store.brand || "ovenfresh", desiredState]);
  }

  const jobRes = await pool.query(
    `INSERT INTO bulk_toggle_jobs (action, total_stores, pending_count, brands, actor_email, last_heartbeat_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
    [action, stores.length, stores.length, brands, actorEmail]
  );
  const jobId = jobRes.rows[0].id;

  runBulkJob(jobId, stores, action, filterContext, performToggleAPI, actorEmail, source)
    .catch(err => console.error("Bulk job error:", err));

  return { jobId };
}

export async function runBulkJob(jobId, stores, action, filterContext, performToggleAPI, actorEmail = 'System', source = 'MANUAL_BULK') {
  const CONCURRENCY = 10;
  const isAutomatedSource = source.startsWith('AUTO_');

  for (let i = 0; i < stores.length; i += CONCURRENCY) {
    const chunk = stores.slice(i, i + CONCURRENCY);

    // Bump the heartbeat every chunk — this is what tells the overlap lock and the
    // stale-job cleanup cron that this job is still genuinely alive, not abandoned
    // by a crashed/restarted process.
    let jobRes = await pool.query('UPDATE bulk_toggle_jobs SET last_heartbeat_at = NOW() WHERE id = $1 RETURNING status', [jobId]);
    let status = jobRes.rows[0]?.status;

    if (status === 'CANCELLED') break;

    while (status === 'PAUSED') {
      await new Promise(r => setTimeout(r, 2000));
      jobRes = await pool.query('UPDATE bulk_toggle_jobs SET last_heartbeat_at = NOW() WHERE id = $1 RETURNING status', [jobId]);
      status = jobRes.rows[0]?.status;
      if (status === 'CANCELLED') break;
    }

    if (status === 'CANCELLED') break;

    // Process chunk concurrently
    await Promise.all(chunk.map(async (store) => {
      let currentAction = action;
      let wasAutoThrottled = false;
      const brand = store.brand || "ovenfresh";
      const storeLabel = `${store.store_name || store.name || store.location_id} (${store.location_id})`;

      // ─── JUST-IN-TIME VALIDATION & THRESHOLD CHECK ───
      try {
        const stateRes = await pool.query(`SELECT desired_state, active_orders FROM store_state WHERE location_id = $1`, [store.location_id]);
        if (stateRes.rows.length > 0) {
          const { desired_state, active_orders } = stateRes.rows[0];

          // Skip if manual override happened during the queue
          if (desired_state === 'OFFLINE' && currentAction === 'enable') {
            console.log(`[JIT] Skipping ${store.location_id} - user set to OFFLINE manually.`);
            await pool.query('UPDATE bulk_toggle_jobs SET success_count = success_count + 1, pending_count = pending_count - 1 WHERE id = $1', [jobId]);
            await logActivity({
              storeName: storeLabel, storeId: store.location_id, brand,
              actorEmail, action: 'ENABLE', result: 'SUCCESS',
              errorMsg: 'Skipped — manually set OFFLINE mid-queue', isBulk: true,
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
        // Bulk jobs self-throttle to 160/min (not the real 180 ceiling) so single urgent
        // toggles always have headroom instead of getting a flat 429 while a large bulk
        // run is consuming the whole shared budget for that brand.
        const rl = await checkAndIncrementRateLimit(brand, 160);
        if (rl === -1) {
          const hRes = await pool.query(`SELECT minute_start_time FROM api_health WHERE brand = $1`, [brand]);
          const start = new Date(hRes.rows[0].minute_start_time);
          const elapsed = new Date() - start;
          const sleepTime = Math.max(0, 60000 - elapsed) + 500;
          await new Promise(r => setTimeout(r, sleepTime));
        } else {
          break; // Allowed
        }
      }

      // Perform toggle
      try {
        const toggleRes = await performToggleAPI(store.location_id, currentAction, brand);

        if (toggleRes.status === 429) {
          // Urban Piper returned 429. Force wait 61s and retry once.
          await new Promise(r => setTimeout(r, 61000));
          const retryRes = await performToggleAPI(store.location_id, currentAction, brand);
          if (!retryRes.success) throw new Error(retryRes.error || "429 Retry failed");
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
        });
      } catch (err) {
         await pool.query('UPDATE bulk_toggle_jobs SET failed_count = failed_count + 1, pending_count = pending_count - 1 WHERE id = $1', [jobId]);
         await logProblemStore(store, currentAction, err.message);
         await logActivity({
           storeName: storeLabel, storeId: store.location_id, brand,
           actorEmail, action: currentAction.toUpperCase(), result: 'FAILED', errorMsg: err.message,
           isBulk: true, isAutomated: isAutomatedSource, bulkJobId: jobId, source,
         });
      }
    }));

    // Delay 2s between chunks for UP strictness
    await new Promise(r => setTimeout(r, 2000));
  }

  await pool.query('UPDATE bulk_toggle_jobs SET status = $1 WHERE id = $2 AND status IN ($3, $4)', ['COMPLETED', jobId, 'RUNNING', 'PAUSED']);
  const finalJob = await pool.query('SELECT * FROM bulk_toggle_jobs WHERE id = $1', [jobId]);
  const j = finalJob.rows[0];
  const uniqueBrands = [...new Set(stores.map(s => s.brand))].filter(Boolean).join(", ");
  const summaryMsg = `Bulk ${action.toUpperCase()} [${uniqueBrands}]${filterContext} — ${j.total_stores} Total ✅ ${j.success_count} ❌ ${j.failed_count}`;
  await logActivity({
    storeName: summaryMsg, storeId: null, brand: uniqueBrands || null,
    actorEmail, action: action.toUpperCase(), result: 'SUCCESS',
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
