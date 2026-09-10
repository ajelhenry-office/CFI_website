import { pool } from '../ratings/db.js';
import { warmUpOpsCache } from '../ops_matrix/ops.routes.js';
import { startTimingWorker } from '../timing/timingWorker.js';
import { AUTO_MANAGED_BRANDS, isTogglePaused, runHourlyRecheckForBrand, isChainAlive, normalizeBrandKey, touchBulkActivity, scheduleNextAttempt } from './queue.js';
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

  // Hourly Recheck — self-chaining, not a fixed clock (see queue.js). Each brand's chain
  // is kicked off once here at startup; from then on it reschedules itself 30 minutes
  // after whatever the latest bulk activity was for that brand (its own last run, a
  // manual bulk job, or an interruption like a cancel), forever. Re-pushes "enable" to
  // every store the user wants online (desired_state = ONLINE) — safe to do blindly,
  // since UrbanPiper's enable/disable only controls whether a store is ALLOWED to be
  // live within its own Swiggy/Zomato operating-hours window, it never forces a store
  // live outside those hours, and it never touches stores the user has explicitly
  // disabled (desired_state = OFFLINE is excluded entirely). So this can never fight the
  // daily schedule or a manual override — it only ever reinforces intent that's already
  // supposed to be in effect.
  // Clear orphaned jobs BEFORE kicking the chains, then kick the chains — strictly in
  // that order, which is why both live in one async block. A freshly started process
  // owns zero in-flight bulk jobs by definition, so any job still at RUNNING/PAUSED is a
  // zombie left behind by the previous process (a deploy or crash). If the chains start
  // first, the startup Hourly Recheck sees the zombie as a live conflict, stands down
  // waiting for a completion that will never come, and that brand's chain stays dormant
  // until the next restart. No heartbeat-age check on the sweep on purpose — at t=0
  // there is no such thing as a legitimately-running job.
  (async () => {
    try {
      const res = await pool.query(
        `UPDATE bulk_toggle_jobs SET status = 'FAILED', current_batch = NULL
         WHERE status IN ('RUNNING', 'PAUSED')
         RETURNING id, brands, total_stores, pending_count`
      );
      if (res.rowCount > 0) {
        console.log(`[WORKERS] Startup: marked ${res.rowCount} orphaned bulk job(s) FAILED (owning process is gone).`);
        for (const job of res.rows) console.log(`[WORKERS]   job #${job.id} (${(job.brands || []).join(', ')}) — ${job.total_stores - job.pending_count}/${job.total_stores} done`);
      }
    } catch (err) {
      console.error("[WORKERS] Startup orphaned-job sweep failed:", err);
    }

    console.log("[WORKERS] Starting Hourly Recheck chains...");
    for (const brandKey of AUTO_MANAGED_BRANDS) {
      runHourlyRecheckForBrand(brandKey, performToggleAPI)
        .then(() => resolveAlert('HOURLY_RECHECK_ERROR'))
        .catch(err => {
          console.error(`[WORKERS] Initial Hourly Recheck failed for ${brandKey}:`, err);
          raiseAlert('HOURLY_RECHECK_ERROR', 'CRITICAL',
            `The Hourly Recheck chain threw an error on startup for ${brandKey} and never got a chance to schedule its own next attempt. This is the safety net that keeps stores online for this brand.`,
            err.message).catch(() => {});
        });
    }
  })();

  // Safety net — the self-chain above is normally what keeps Hourly Recheck alive, but a
  // chain can still end up with no pending timer: a tick that throws before it reaches
  // its own reschedule, or a startup attempt that was blocked by a job which then got
  // cleared. Either way that brand goes silently quiet with nothing to revive it. This
  // notices a chain with no live timer and kicks it back on. Runs every 10 minutes (was
  // 60 — an hour of a dead safety net for the brand that keeps stores online was too
  // long) with a first pass 2 minutes after boot, so a chain that failed to arm during
  // startup recovers quickly instead of waiting a full interval.
  const chainHealthCheck = async () => {
    try {
      if (await isTogglePaused()) return;
      for (const brandKey of AUTO_MANAGED_BRANDS) {
        if (isChainAlive(brandKey)) continue;
        console.warn(`[WORKERS] Hourly Recheck chain for ${brandKey} appears to have died — restarting it.`);
        runHourlyRecheckForBrand(brandKey, performToggleAPI).catch(err => console.error(`[WORKERS] Chain restart failed for ${brandKey}:`, err));
      }
    } catch (err) {
      console.error("[WORKERS] Hourly Recheck chain health check failed:", err);
    }
  };
  setTimeout(chainHealthCheck, 2 * 60 * 1000); // first pass 2 min after boot
  setInterval(chainHealthCheck, 10 * 60 * 1000); // every 10 minutes thereafter


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
      if (await isTogglePaused()) return;

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
          // Its own runBulkJob completion never ran, so re-arm each brand's Hourly
          // Recheck chain here — otherwise a stale auto job could leave that brand
          // with no next attempt scheduled until a server restart.
          for (const b of (job.brands || [])) {
            const key = normalizeBrandKey(b);
            if (AUTO_MANAGED_BRANDS.includes(key)) {
              try { touchBulkActivity(key); scheduleNextAttempt(key, performToggleAPI); } catch { /* keep going */ }
            }
          }
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
      if (await isTogglePaused()) return;

      const res = await pool.query(`DELETE FROM toggle_activity WHERE created_at < NOW() - INTERVAL '48 hours'`);
      if (res.rowCount > 0) console.log(`[WORKERS] Purged ${res.rowCount} toggle_activity rows older than 48h.`);
    } catch (err) {
      console.error("[WORKERS] Audit retention purge failed:", err);
    }
  }, 60 * 60 * 1000); // 60 minutes

  // Problem Stores Retention (Runs every 24 hours) — only ever purges rows already
  // marked resolved (a store gets marked resolved the moment any toggle for it
  // succeeds, so it's already off the Problems list well before this runs) and only
  // once they've sat resolved for a while, keeping a short-term audit trail (e.g. "this
  // kept failing 3 times last week") without letting the table grow forever. An
  // unresolved row is never touched here — it stays until the store is actually fixed.
  setInterval(async () => {
    try {
      const res = await pool.query(`DELETE FROM problem_stores WHERE resolved = true AND last_attempt_at < NOW() - INTERVAL '14 days'`);
      if (res.rowCount > 0) console.log(`[WORKERS] Purged ${res.rowCount} resolved problem_stores rows older than 14 days.`);
    } catch (err) {
      console.error("[WORKERS] Problem Stores retention purge failed:", err);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours

  // Warmup Ops Cache (Runs every 1 hour)
  setInterval(() => {
    warmUpOpsCache();
  }, 60 * 60 * 1000);

  // Initial run on startup
  setTimeout(() => warmUpOpsCache(), 5000);

}
