import { pool } from '../ratings/db.js';
import { UP_BRANDS, performToggleAPI } from './toggle.routes.js';
import { initiateBulkJob, EATFIT_THROTTLE_THRESHOLD } from './queue.js';
import { raiseAlert, resolveAlert } from '../alerts/alertService.js';

// KitchenPulse's inbound webhook for active_orders (POST /toggle/update-orders) has
// no real caller — nothing external can reach it, since every /api/* route requires
// a user JWT and there's no service-account exception. The actual, working source of
// truth for eatfit order counts is UrbanPiper's Orders API itself, polled directly —
// the same approach the pre-existing "Eatfit Kitchen Status Automation" Apps Script
// already uses hourly. This replaces the dead push model with a pull model.
const ORDERS_API_URL = "https://api.urbanpiper.com/external/api/v1/orders/";
const PAGE_SIZE = 50;
const MAX_PAGES = 50; // matches the Apps Script's own cap — this business currently runs ~80 acknowledged orders at a time

// Each managed_stores row for eatfit is a comma-separated GROUP of UrbanPiper ref
// IDs — one physical kitchen's several brand storefronts (EatFit, GIK, HRX, Papacream,
// Rolls & Wraps, etc.) that all share one kitchen and one combined order queue. The
// Orders API's order.store.merchant_ref_id is an individual ref ID, so counts get
// summed across every ref ID in a kitchen's group before being compared to the
// threshold — a kitchen throttles or un-throttles as a whole, matching how the
// Apps Script (and the business) actually thinks about it, not per individual brand.
export async function fetchAcknowledgedOrderCounts(creds) {
  const countsByRefId = {};
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${ORDERS_API_URL}?biz_id=${encodeURIComponent(creds.biz_id)}&status=Acknowledged&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `apikey ${creds.username}:${creds.apikey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Orders API returned ${res.status}`);
    }
    const data = await res.json();
    const orders = data.orders || [];
    for (const o of orders) {
      const refId = o.order?.store?.merchant_ref_id;
      if (refId) countsByRefId[refId] = (countsByRefId[refId] || 0) + 1;
    }
    if (orders.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return countsByRefId;
}

export async function syncEatfitOrderCounts() {
  const creds = UP_BRANDS.eatfit;
  if (!creds) return;

  try {
    const countsByRefId = await fetchAcknowledgedOrderCounts(creds);

    const storesRes = await pool.query(`SELECT location_id FROM managed_stores WHERE LOWER(TRIM(brand)) = 'eatfit'`);
    for (const { location_id } of storesRes.rows) {
      const refIds = location_id.split(',').map(s => s.trim());
      const total = refIds.reduce((sum, id) => sum + (countsByRefId[id] || 0), 0);
      await pool.query(`
        INSERT INTO store_state (location_id, brand, active_orders)
        VALUES ($1, 'eatfit', $2)
        ON CONFLICT (location_id) DO UPDATE SET active_orders = $2, last_updated = NOW()
      `, [location_id, total]);
    }

    await resolveAlert('EATFIT_ORDER_SYNC_ERROR');
  } catch (err) {
    console.error("[EATFIT ORDER SYNC] Failed:", err.message);
    await raiseAlert('EATFIT_ORDER_SYNC_ERROR', 'CRITICAL',
      `The Eatfit order-count sync failed to reach UrbanPiper's Orders API. active_orders will go stale, and the ${EATFIT_THROTTLE_THRESHOLD}-order auto-throttle will stop reacting to real order volume until this recovers.`,
      err.message);
  }
}

export function scheduleEatfitOrderSync() {
  const INTERVAL_MS = 5 * 60 * 1000; // order volume changes fast — much tighter than the old hourly-only Apps Script cadence
  setInterval(syncEatfitOrderCounts, INTERVAL_MS);
  setTimeout(syncEatfitOrderCounts, 5000); // initial run shortly after boot, same pattern as warmUpOpsCache
}

// The order-count sync above only writes data — it never calls UrbanPiper. Acting on
// that data used to only happen as a side effect of the once-an-hour Hourly Recheck
// cron, which meant a kitchen crossing the threshold could sit overloaded for up to an
// hour before anything reacted. This runs every 10 minutes and ONLY touches stores
// whose current on/off status doesn't match what active_orders vs the threshold says
// it should be — a kitchen already in the right state is left untouched, so this
// doesn't spam UrbanPiper with redundant calls every cycle.
//
// This can't conflict with Hourly Recheck: both funnel through initiateBulkJob →
// runBulkJob, whose JIT check (queue.js) always re-derives the REAL action per store
// from the live desired_state + active_orders at the moment it actually runs,
// regardless of which cron kicked the job off or what top-level action was requested.
// Whichever cron happens to touch a store first will always compute the same correct
// answer — there's nothing for them to disagree about.
export async function enforceEatfitThreshold() {
  try {
    const candidatesRes = await pool.query(`
      SELECT ms.location_id, ms.brand, ms.name
      FROM managed_stores ms
      JOIN store_state ss ON ss.location_id = ms.location_id
      WHERE LOWER(TRIM(ms.brand)) = 'eatfit' AND ss.desired_state = 'ONLINE'
        AND (
          (ss.active_orders > $1 AND ms.status = 'online')
          OR
          (ss.active_orders <= $1 AND ms.status = 'offline')
        )
    `, [EATFIT_THROTTLE_THRESHOLD]);

    if (candidatesRes.rows.length === 0) return;

    console.log(`[EATFIT THRESHOLD] ${candidatesRes.rows.length} kitchen(s) need a state correction.`);
    await initiateBulkJob(
      candidatesRes.rows, 'enable', ' (EatFit Threshold Enforcer)',
      'System — EatFit Threshold', 'AUTO_EATFIT_THRESHOLD', performToggleAPI
    );

    // Note: if an eatfit bulk job (this enforcer, Hourly Recheck, Watchdog, or a
    // manual bulk action) is already RUNNING/PAUSED, initiateBulkJob returns quietly
    // with { blocked: true } for AUTO_ sources rather than throwing — this cron just
    // tries again next cycle, same as Hourly Recheck/Watchdog already do.
    await resolveAlert('EATFIT_THRESHOLD_ENFORCER_ERROR');
  } catch (err) {
    console.error("[EATFIT THRESHOLD] Failed:", err.message);
    await raiseAlert('EATFIT_THRESHOLD_ENFORCER_ERROR', 'CRITICAL',
      `The Eatfit threshold enforcer failed to run. Kitchens crossing the ${EATFIT_THROTTLE_THRESHOLD}-order threshold will stop being auto-throttled until this recovers (Hourly Recheck will still catch it, just up to an hour later).`,
      err.message);
  }
}

export function scheduleEatfitThresholdEnforcer() {
  const INTERVAL_MS = 10 * 60 * 1000;
  setInterval(enforceEatfitThreshold, INTERVAL_MS);
  setTimeout(enforceEatfitThreshold, 60000); // let the first order-count sync land first
}
