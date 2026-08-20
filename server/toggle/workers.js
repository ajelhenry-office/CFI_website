import { pool } from '../ratings/db.js';
import { warmUpOpsCache } from '../ops_matrix/ops.routes.js';
import { startTimingWorker } from '../timing/timingWorker.js';
import { initiateBulkJob, normalizeBrandKey, AUTO_MANAGED_BRANDS } from './queue.js';
import { performToggleAPI } from './toggle.routes.js';
import { raiseAlert, resolveAlert } from '../alerts/alertService.js';
import { scheduleDailyHealthCheck } from '../alerts/dailyHealthCheck.js';
import { scheduleEatfitOrderSync, scheduleEatfitThresholdEnforcer } from './eatfitOrderSync.js';

export function startWorkers() {
  console.log("[WORKERS] Starting background workers...");
  startTimingWorker();
  scheduleDailyHealthCheck(8, 0); // 8:00 AM IST daily
  scheduleEatfitOrderSync(); // every 5 min — keeps active_orders fresh
  scheduleEatfitThresholdEnforcer(); // every 10 min — throttles down/wakes up based on that data

  // Hourly Recheck Cron (Runs every 60 minutes)
  // Re-pushes "enable" to every store the user wants online (desired_state = ONLINE).
  // This is safe to do blindly: UrbanPiper's enable/disable only controls whether a store
  // is ALLOWED to be live within its own Swiggy/Zomato operating-hours window — it never
  // forces a store live outside those hours, and it never touches stores the user has
  // explicitly disabled (desired_state = OFFLINE is excluded here entirely). So this can
  // never fight the daily schedule or a manual override — it only ever reinforces intent
  // that's already supposed to be in effect.
  //
  // Runs the bulk job directly in-process via initiateBulkJob (not a self-HTTP-call to
  // our own API) — a self-call needs a matching port and a valid auth token, neither of
  // which this cron has, so it was silently failing every single time before this fix.
  setInterval(async () => {
    try {
      console.log("[WORKERS] Running Hourly Recheck Cron...");

      // Fetch all stores that should be online
      const storesRes = await pool.query(`SELECT location_id, brand FROM store_state WHERE desired_state = 'ONLINE'`);
      const stores = storesRes.rows;

      if (stores.length === 0) return;

      // One initiateBulkJob call PER BRAND, not one call spanning every brand together.
      // initiateBulkJob's own overlap lock only blocks a brand that's already RUNNING/
      // PAUSED elsewhere (see queue.js) — but that lock is computed over whatever set of
      // brands a single call touches. A single call across every brand at once meant one
      // brand's manual bulk job (e.g. Olio) made this skip ALL brands, every hour, until
      // it finished — even ones with no relation to it. Splitting per brand lets each
      // brand's Hourly Recheck run independently, exactly like the eatfit threshold
      // enforcer and manual bulk actions already do.
      //
      // Only ever groups brands in AUTO_MANAGED_BRANDS — this cron acts with nobody at
      // the wheel, so it must never pick up Ovenfresh (or anything else outside the 3
      // real brands) just because a store was left at desired_state = 'ONLINE' there
      // from earlier testing. Uses the shared normalizeBrandKey (not a bare
      // .toLowerCase()) so "Cake Zone" / "cake zone" / "cake_zone" all land in the same
      // bucket instead of silently fragmenting.
      const storesByBrand = new Map();
      for (const store of stores) {
        const key = normalizeBrandKey(store.brand || 'ovenfresh');
        if (!AUTO_MANAGED_BRANDS.includes(key)) continue;
        if (!storesByBrand.has(key)) storesByBrand.set(key, []);
        storesByBrand.get(key).push(store);
      }

      if (storesByBrand.size === 0) return;
      const actedOnCount = [...storesByBrand.values()].reduce((sum, s) => sum + s.length, 0);
      console.log(`[WORKERS] Hourly Recheck found ${actedOnCount} ONLINE stores across ${storesByBrand.size} auto-managed brand(s) to verify.`);

      for (const [brandKey, brandStores] of storesByBrand) {
        const result = await initiateBulkJob(brandStores, "enable", " (Hourly Recheck)", "System — Hourly Recheck", "AUTO_HOURLY_RECHECK", performToggleAPI);
        if (result.blocked) {
          console.log(`[WORKERS] Hourly Recheck skipped ${brandKey} this cycle — a job already running for it.`);
        }
      }
      await resolveAlert('HOURLY_RECHECK_ERROR');

    } catch (err) {
      console.error("[WORKERS] Hourly Recheck failed:", err);
      await raiseAlert('HOURLY_RECHECK_ERROR', 'CRITICAL',
        'The Hourly Recheck cron threw an error and did not complete its run. This is the safety net that keeps stores online — if this keeps happening, that automation may be effectively off.',
        err.message);
    }
  }, 60 * 60 * 1000); // 60 minutes


  // Watchdog Cron — removed. Its entire job (waking up eatfit stores once their order
  // count drops back down) is now done by scheduleEatfitThresholdEnforcer() above,
  // which does it more correctly (uses the shared EATFIT_THROTTLE_THRESHOLD constant
  // and the correct <= boundary — this cron's old `active_orders < 15` had an off-by-one
  // gap where a store sitting at exactly 15 would never get picked up) and more
  // completely (it also handles throttling DOWN, not just waking up). Running both was
  // pure redundant work.

  // Stale Bulk Job Cleanup (Runs every 10 minutes)
  // If the server crashes or restarts mid-job, that job's row is stuck at RUNNING
  // forever — nothing else ever resolves it. The overlap lock in initiateBulkJob
  // already ignores jobs whose heartbeat has gone stale, so this doesn't block new
  // jobs from starting — but the stuck row would sit there indefinitely otherwise,
  // showing as "still running" in the UI. Mark it FAILED so it's honestly reported.
  setInterval(async () => {
    try {
      const res = await pool.query(`
        UPDATE bulk_toggle_jobs SET status = 'FAILED'
        WHERE status IN ('RUNNING', 'PAUSED') AND last_heartbeat_at < NOW() - INTERVAL '10 minutes'
        RETURNING id, brands, actor_email, total_stores, pending_count
      `);
      if (res.rowCount > 0) {
        console.log(`[WORKERS] Marked ${res.rowCount} stale bulk job(s) as FAILED (no heartbeat for 10+ min).`);
        for (const job of res.rows) {
          await raiseAlert('BULK_JOB_STUCK', 'WARNING',
            `A bulk job (started by ${job.actor_email} for ${job.brands?.join(', ')}) stopped sending a heartbeat and was marked FAILED — likely the server restarted or crashed mid-run.`,
            `Job #${job.id} — ${job.total_stores - job.pending_count}/${job.total_stores} stores had completed before it stopped.`);
        }
      }
    } catch (err) {
      console.error("[WORKERS] Stale bulk job cleanup failed:", err);
    }
  }, 10 * 60 * 1000); // 10 minutes

  // Audit Log Retention (Runs every hour) — keep only the last 48 hours, on its own
  // reliable schedule instead of being tied to whether anyone happens to load the sidebar.
  setInterval(async () => {
    try {
      const res = await pool.query(`DELETE FROM toggle_activity WHERE created_at < NOW() - INTERVAL '48 hours'`);
      if (res.rowCount > 0) console.log(`[WORKERS] Purged ${res.rowCount} toggle_activity rows older than 48h.`);
    } catch (err) {
      console.error("[WORKERS] Audit retention purge failed:", err);
    }
  }, 60 * 60 * 1000); // 60 minutes

  // Warmup Ops Cache (Runs every 1 hour)
  setInterval(() => {
    warmUpOpsCache();
  }, 60 * 60 * 1000);

  // Initial run on startup
  setTimeout(() => warmUpOpsCache(), 5000);

}
