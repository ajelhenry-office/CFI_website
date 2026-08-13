import { pool } from '../ratings/db.js';

export async function checkAndIncrementRateLimit(brand) {
  // Try to increment atomically if we're still in the same minute
  let res = await pool.query(`
    UPDATE api_health
    SET requests_this_minute = requests_this_minute + 1
    WHERE brand = $1 AND EXTRACT(EPOCH FROM (NOW() - minute_start_time)) < 60
    RETURNING requests_this_minute
  `, [brand]);

  if (res.rows.length > 0) {
    const count = res.rows[0].requests_this_minute;
    if (count > 180) { // Limit increased to 180
      // We exceeded the limit, revert the increment we just did
      await pool.query(`
        UPDATE api_health
        SET requests_this_minute = requests_this_minute - 1
        WHERE brand = $1
      `, [brand]);
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
  `, [brand]);

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

  // Paused stores are completely hands-off — excluded from every bulk and automated
  // path (manual bulk, Hourly Recheck, Watchdog all funnel through here), regardless
  // of which one triggered this run. Only an explicit Resume can bring one back in.
  const pausedRes = await pool.query(
    `SELECT location_id FROM managed_stores WHERE location_id = ANY($1) AND paused = true`,
    [stores.map(s => s.location_id)]
  );
  const pausedIds = new Set(pausedRes.rows.map(r => r.location_id));
  const activeStores = stores.filter(s => !pausedIds.has(s.location_id));

  if (activeStores.length === 0) {
    return { jobId: null, skippedPaused: pausedIds.size };
  }

  const desiredState = action === 'enable' ? 'ONLINE' : 'OFFLINE';

  // Update all desired states immediately using the original location_id (even if it's comma-separated)
  for (const store of activeStores) {
    await pool.query(`
      INSERT INTO store_state (location_id, brand, desired_state)
      VALUES ($1, $2, $3)
      ON CONFLICT (location_id)
      DO UPDATE SET desired_state = $3, last_updated = NOW()
    `, [store.location_id, store.brand || "ovenfresh", desiredState]);
  }

  const jobRes = await pool.query(
    `INSERT INTO bulk_toggle_jobs (action, total_stores, pending_count) VALUES ($1, $2, $3) RETURNING id`,
    [action, activeStores.length, activeStores.length]
  );
  const jobId = jobRes.rows[0].id;

  runBulkJob(jobId, activeStores, action, filterContext, performToggleAPI, actorEmail, source)
    .catch(err => console.error("Bulk job error:", err));

  return { jobId, skippedPaused: pausedIds.size };
}

export async function runBulkJob(jobId, stores, action, filterContext, performToggleAPI, actorEmail = 'System', source = 'MANUAL_BULK') {
  const CONCURRENCY = 10;
  const isAutomatedSource = source.startsWith('AUTO_');

  for (let i = 0; i < stores.length; i += CONCURRENCY) {
    const chunk = stores.slice(i, i + CONCURRENCY);

    let jobRes = await pool.query('SELECT status FROM bulk_toggle_jobs WHERE id = $1', [jobId]);
    let status = jobRes.rows[0]?.status;

    if (status === 'CANCELLED') break;

    while (status === 'PAUSED') {
      await new Promise(r => setTimeout(r, 2000));
      jobRes = await pool.query('SELECT status FROM bulk_toggle_jobs WHERE id = $1', [jobId]);
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
            return; // Skip this store
          }

          // Apply 15-order threshold (ONLY for eatfit)
          if (desired_state === 'ONLINE') {
            if (brand.toLowerCase().includes('eatfit') && active_orders >= 15) {
               console.log(`[THROTTLE] ${store.location_id} active_orders = ${active_orders} >= 15. Auto-throttling to OFFLINE.`);
               currentAction = 'disable';
               wasAutoThrottled = true;
            } else {
               currentAction = 'enable';
            }
          }
        }
      } catch (err) {
        console.error("[JIT Check Error]", err);
      }

      // Wait for rate limit
      while (true) {
        const rl = await checkAndIncrementRateLimit(brand);
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
}
