import { pool } from '../ratings/db.js';
import { warmUpOpsCache } from '../ops_matrix/ops.routes.js';
import { startTimingWorker } from '../timing/timingWorker.js';
import { initiateBulkJob } from './queue.js';
import { performToggleAPI } from './toggle.routes.js';

export function startWorkers() {
  console.log("[WORKERS] Starting background workers...");
  startTimingWorker();

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

      // Check if there is already a RUNNING or PAUSED bulk job. If so, skip this hour to prevent overlap lock.
      const lockRes = await pool.query(`SELECT id FROM bulk_toggle_jobs WHERE status IN ('RUNNING', 'PAUSED')`);
      if (lockRes.rows.length > 0) {
         console.log("[WORKERS] Hourly Recheck skipped due to active bulk job lock.");
         return;
      }

      // Fetch all stores that should be online
      const storesRes = await pool.query(`SELECT location_id, brand FROM store_state WHERE desired_state = 'ONLINE'`);
      const stores = storesRes.rows;

      if (stores.length === 0) return;

      console.log(`[WORKERS] Hourly Recheck found ${stores.length} ONLINE stores to verify.`);

      await initiateBulkJob(stores, "enable", " (Hourly Recheck)", "System — Hourly Recheck", "AUTO_HOURLY_RECHECK", performToggleAPI);

    } catch (err) {
      console.error("[WORKERS] Hourly Recheck failed:", err);
    }
  }, 60 * 60 * 1000); // 60 minutes


  // Watchdog Cron (Runs every 10 minutes)
  // Grabs eatfit stores where desired_state = 'ONLINE' but they are physically OFFLINE due to threshold cooling
  setInterval(async () => {
    try {
      console.log("[WORKERS] Running Watchdog Cron...");

      // Look for stores that want to be online, but currently have < 15 active_orders
      const storesRes = await pool.query(`
        SELECT location_id, brand
        FROM store_state
        WHERE desired_state = 'ONLINE' AND active_orders < 15
      `);

      const stores = storesRes.rows;
      if (stores.length === 0) return;

      // Find stores that we recently disabled automatically (Auto-throttled).
      const coolingRes = await pool.query(`
        SELECT DISTINCT store_id as location_id
        FROM toggle_activity
        WHERE created_at >= NOW() - INTERVAL '2 hour'
        AND action = 'DISABLE'
        AND (source = 'AUTO_THROTTLE' OR is_automated = true OR store_name LIKE 'Bulk%')
      `);
      const coolingStoreIds = coolingRes.rows.map(r => r.location_id);

      const storesToWakeUp = stores.filter(s => coolingStoreIds.includes(s.location_id));

      if (storesToWakeUp.length === 0) return;

      console.log(`[WORKERS] Watchdog found ${storesToWakeUp.length} cooled stores ready to wake up.`);

      await initiateBulkJob(storesToWakeUp, "enable", " (Watchdog Wakeup)", "System — Watchdog", "AUTO_WATCHDOG", performToggleAPI);

    } catch (err) {
      console.error("[WORKERS] Watchdog failed:", err);
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
