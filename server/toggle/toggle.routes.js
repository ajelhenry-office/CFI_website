import express from "express";
import { pool } from "../ratings/db.js";
import { checkAndIncrementRateLimit, logProblemStore, initiateBulkJob, resolveOnlineAction } from "./queue.js";
import { raiseAlert } from "../alerts/alertService.js";

const router = express.Router();

// Store management (add/delete/pause/resume) was only ever gated in the frontend —
// any authenticated user could call these endpoints directly regardless of role.
// Matches the same role set the frontend's canManageStores check already uses.
function canManageStores(req, res, next) {
  // Employees can hold more than one role — check the full set (req.user.roles), not
  // just req.user.role (the highest-ranked one), so Control Tower still grants access
  // even when it's someone's secondary role.
  const roles = req.user?.roles || [req.user?.role];
  if (!roles.some(r => ['super_admin', 'admin', 'control_tower'].includes(r))) {
    return res.status(403).json({ success: false, error: "You don't have permission to manage stores." });
  }
  next();
}

// ─── TOGGLE FREEZE ────────────────────────────────────────────
// A manual, DB-backed kill switch for "no store changes right now" (e.g. testing
// windows). Backed by a table (not an env var/in-memory flag) so it survives restarts
// and can be flipped with one UPDATE, with no redeploy needed to lift it.
export async function isToggleFrozen() {
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'toggle_frozen'`);
  return rows.length > 0 && rows[0].value === 'true';
}

const FROZEN_MESSAGE = "The Toggle tab is frozen right now — no store changes can be made until it's unfrozen.";

// Route-level gate: blocks anything that can start a NEW real UrbanPiper action
// (manual toggle, bulk, retry, add/pause/resume a store). Deliberately does NOT
// block bulk/cancel or bulk/pause — those only stop an already-running job, never
// start one, so leaving them live is strictly safer during a freeze.
async function blockIfFrozen(req, res, next) {
  if (await isToggleFrozen()) {
    return res.status(423).json({ success: false, error: FROZEN_MESSAGE, frozen: true });
  }
  next();
}

// ─── URBANPIPER CONFIG ───────────────────────────────────────
const UP_LOCATION_URL = "https://api.urbanpiper.com/hub/api/v1/location/";
// Matches the platform list used by CakeZone's own working Apps Script tool, which
// confirms real stores exist on more than just swiggy/zomato — the narrower list here
// meant KitchenPulse could never toggle a store's listing on any of the others. Safe
// to widen: performToggleAPI already strips a platform from the list and retries if
// UrbanPiper says it's "not valid for platform X", so an extra platform a given store
// doesn't actually have never breaks the call.
const UP_PLATFORMS    = ["swiggy", "zomato", "dotpe", "ownly", "dunzo", "magicpin", "masalabox", "tipplr", "bitsila"];

// No hardcoded fallbacks — a missing credential must fail loudly (see the startup
// check in server.js), not silently run on a value that's sitting in git history.
export const UP_BRANDS = {
  ovenfresh: {
    username : process.env.UP_USERNAME_OVENFRESH,
    apikey   : process.env.UP_APIKEY_OVENFRESH,
    biz_id   : process.env.UP_BIZ_ID_OVENFRESH,
  },
  paris_cakes___desserts: {
    username : process.env.UP_USERNAME_OVENFRESH,
    apikey   : process.env.UP_APIKEY_OVENFRESH,
    biz_id   : process.env.UP_BIZ_ID_OVENFRESH,
  },
  eatfit: {
    username : process.env.UP_USERNAME_EATFIT,
    apikey   : process.env.UP_APIKEY_EATFIT,
    biz_id   : process.env.UP_BIZ_ID_EATFIT,
  },
  cake_zone: {
    username : process.env.UP_USERNAME_CAKEZONE,
    apikey   : process.env.UP_APIKEY_CAKEZONE,
  },
  olio: {
    username : process.env.UP_USERNAME_OLIO,
    apikey   : process.env.UP_APIKEY_OLIO,
  },
};

// ─── HELPER: PERFORM API CALL ────────────────────────────────
// Exported so the background crons (workers.js) can call it directly, in-process,
// instead of making a self-referential HTTP request to this same server.
export async function performToggleAPI(location_id, action, brand) {
  // Backstop for the background crons (Hourly Recheck, EatFit threshold enforcer) —
  // they call this directly, in-process, bypassing every HTTP route, so the route-level
  // freeze gate never sees them. Checking here too means a freeze truly stops every
  // path that can touch a real store, not just the ones triggered from the UI.
  if (await isToggleFrozen()) {
    return { success: false, error: FROZEN_MESSAGE, status: 423 };
  }

  const brandKey = brand.toLowerCase().replace(/[^a-z]/g, "_");
  const creds = UP_BRANDS[brandKey];
  if (!creds) return { success: false, error: `Unknown brand: ${brand}` };

  const ids = String(location_id).split(',').map(s => s.trim()).filter(Boolean);
  let successCount = 0;
  let overallError = "";

  for (const id of ids) {
    let currentPlatforms = [...UP_PLATFORMS];
    let finalStatus = 500;
    let finalResponseText = "";

    while (currentPlatforms.length > 0) {
      const payload = {
        location_ref_id: String(id),
        action: action,
        platforms: currentPlatforms,
      };

      const response = await fetch(UP_LOCATION_URL, {
        method: "POST",
        headers: {
          "Authorization": `apikey ${creds.username}:${creds.apikey}`,
          "Content-Type": "application/json",
          ...(creds.biz_id ? { "x-upr-biz-id": creds.biz_id } : {})
        },
        body: JSON.stringify(payload),
      });

      finalStatus = response.status;
      finalResponseText = await response.text();
      console.log("[UP] Raw Response for", id, ":", finalStatus, finalResponseText);

      // 401/403 means the API credentials themselves are the problem — invalid,
      // revoked, or expired — not that this one store/ID is wrong. Every future call
      // for this brand will fail the same way until someone fixes the credentials, so
      // this is worth a distinct, urgent alert rather than looking like an ordinary
      // per-store failure.
      if (finalStatus === 401 || finalStatus === 403) {
        raiseAlert(`UP_AUTH_ERROR:${brand}`, 'CRITICAL',
          `UrbanPiper rejected our API credentials for "${brand}" (HTTP ${finalStatus}). Every toggle for this brand will fail until this is fixed.`,
          finalResponseText).catch(() => {});
      }

      // Simple 429 Rate Limit backoff
      if (finalStatus === 429) {
        console.log(`[UP] Rate limited (429) for ${id}, waiting 2 seconds before retry...`);
        await new Promise(res => setTimeout(res, 2000));
        continue; // Retry the same platforms
      }

      if (response.status >= 200 && response.status < 300) {
        successCount++;
        break; // Success for this ID, move to next ID
      }

      if (response.status === 400) {
        try {
          const errBody = JSON.parse(finalResponseText);
          if (errBody.message && errBody.message.includes("not valid for platform")) {
            const badPlatformMatch = errBody.message.match(/platform['"\s]*([\w]+)/i);
            if (badPlatformMatch && badPlatformMatch[1]) {
              const badPlatform = badPlatformMatch[1].toLowerCase();
              currentPlatforms = currentPlatforms.filter(p => p !== badPlatform);
              continue;
            }
          } else if (errBody.message && (errBody.message.includes("Invalid platform") || errBody.message.includes("not associated"))) {
            // Can't tell WHICH platform this message is about, so narrow one at a time
            // (drop the last one and retry) instead of jumping straight to a hardcoded
            // 2-platform fallback — with a 9-platform list now, that used to mean losing
            // up to 7 legitimately-valid platforms over a single ambiguous error.
            if (currentPlatforms.length > 1) {
              currentPlatforms = currentPlatforms.slice(0, -1);
              continue;
            }
          }
        } catch (e) {}
      }
      
      // If we reach here, it failed and can't be retried
      let upErrorMsg = `UrbanPiper returned ${finalStatus} for ${id}`;
      try {
        const errObj = JSON.parse(finalResponseText);
        if (errObj.message) upErrorMsg += ` - ${errObj.message}`;
      } catch (e) {}
      overallError = upErrorMsg;
      break;
    }
    
    // Slight delay between different IDs to prevent UrbanPiper rate limiting
    if (ids.length > 1) {
      await new Promise(res => setTimeout(res, 500));
    }
  }

  // If at least one ID succeeded, we consider the toggle successful for the UI.
  // Otherwise we return the last error encountered.
  if (successCount > 0) {
    return { success: true, message: `Store ${action}d across platforms`, status: 200 };
  } else {
    // We want to pass the actual status from UP if available, else 400 for validation errors, else 500
    const returnStatus = overallError.includes("returned 400") ? 400 : (overallError.includes("returned 429") ? 429 : 500);
    return { success: false, error: overallError || "All location IDs failed.", status: returnStatus };
  }
}

// Checks a location ID is a real UrbanPiper location before we let it into our system.
// Tries the "verify" action first (menu/catalog check, never touches live status) — but
// not every UrbanPiper account routes "verify" the same way. Confirmed live: for
// cake_zone/olio, "verify" comes back as a raw, unbranded nginx 404 (no JSON body at
// all) even for real, working location IDs, while enable/disable work completely
// normally for those exact same accounts. A bare-HTML 404 means "verify" itself isn't
// supported here, not that the ID is wrong — falling back to the real declared-status
// action instead of incorrectly rejecting a valid store.
async function tryVerifyAction(ids, creds) {
  const errors = [];
  let actionUnsupported = false;
  for (const id of ids) {
    try {
      const response = await fetch(UP_LOCATION_URL, {
        method: "POST",
        headers: {
          "Authorization": `apikey ${creds.username}:${creds.apikey}`,
          "Content-Type": "application/json",
          ...(creds.biz_id ? { "x-upr-biz-id": creds.biz_id } : {})
        },
        body: JSON.stringify({ location_ref_id: String(id), action: "verify", platforms: UP_PLATFORMS }),
      });
      if (response.status === 200) return { valid: true };
      const text = await response.text();
      if (response.status === 404 && text.trim().startsWith('<')) actionUnsupported = true;
      errors.push(`${id}: ${text.slice(0, 200)}`);
    } catch (err) {
      errors.push(`${id}: ${err.message}`);
    }
  }
  return { valid: false, actionUnsupported, error: `Not found in UrbanPiper. ${errors.join(' | ')}` };
}

// Fallback for accounts where "verify" isn't supported — uses the real, working action
// matching whatever current status was declared for the store. Idempotent for a
// correctly-described existing store (it's already in that state); for an incorrectly
// declared status it reconciles UrbanPiper to match what was entered, which is
// reasonable for an admin actively adding a store, not a surprising side effect.
//
// Attempts EVERY id in the group, not just until the first success — a multi-ID store
// is several brand storefronts sharing one kitchen, and stopping early would leave the
// rest of the group untouched (never reconciled to the declared status) instead of
// matching performToggleAPI's behavior, which always attempts every id in the group.
async function tryStatusAction(ids, creds, currentStatus) {
  const action = currentStatus === 'online' ? 'enable' : 'disable';
  const errors = [];
  let anySucceeded = false;
  for (const id of ids) {
    try {
      const response = await fetch(UP_LOCATION_URL, {
        method: "POST",
        headers: {
          "Authorization": `apikey ${creds.username}:${creds.apikey}`,
          "Content-Type": "application/json",
          ...(creds.biz_id ? { "x-upr-biz-id": creds.biz_id } : {})
        },
        body: JSON.stringify({ location_ref_id: String(id), action, platforms: UP_PLATFORMS }),
      });
      if (response.status >= 200 && response.status < 300) {
        anySucceeded = true;
        continue;
      }
      const text = await response.text();
      errors.push(`${id}: ${text.slice(0, 200)}`);
    } catch (err) {
      errors.push(`${id}: ${err.message}`);
    }
  }
  if (anySucceeded) return { valid: true };
  return { valid: false, error: `Not found in UrbanPiper. ${errors.join(' | ')}` };
}

async function verifyLocationExists(location_id, brand, currentStatus) {
  const brandKey = brand.toLowerCase().replace(/[^a-z]/g, "_");
  const creds = UP_BRANDS[brandKey];
  if (!creds) return { valid: false, error: `Unknown brand "${brand}" — no UrbanPiper credentials configured for it.` };

  const ids = String(location_id).split(',').map(s => s.trim()).filter(Boolean);

  const verifyResult = await tryVerifyAction(ids, creds);
  if (verifyResult.valid || !verifyResult.actionUnsupported) return verifyResult;

  return await tryStatusAction(ids, creds, currentStatus);
}

// ─── SINGLE TOGGLE ENDPOINT ──────────────────────────────────
router.post("/toggle", blockIfFrozen, async (req, res) => {
  const { location_id, store_name, action, brand = "ovenfresh" } = req.body;
  if (!location_id || !action) return res.status(400).json({ error: "location_id and action required" });
  if (!["enable", "disable"].includes(action)) return res.status(400).json({ error: 'action must be enable or disable' });

  const actorEmail = req.user?.email || 'Unknown';

  // Paused stores are hands-off until explicitly resumed — block even a direct
  // single-store click, so a normal Enable can't accidentally undo an intentional pause.
  const pausedCheck = await pool.query(`SELECT paused, pause_reason FROM managed_stores WHERE location_id = $1`, [location_id]);
  if (pausedCheck.rows[0]?.paused) {
    return res.status(409).json({ success: false, error: `Store is paused (${pausedCheck.rows[0].pause_reason || 'no reason given'}) — resume it first in Manage Stores.` });
  }

  // Update desired state in DB for the exact UI location_id string
  const desiredState = action === 'enable' ? 'ONLINE' : 'OFFLINE';
  try {
    await pool.query(`
      INSERT INTO store_state (location_id, brand, desired_state)
      VALUES ($1, $2, $3)
      ON CONFLICT (location_id)
      DO UPDATE SET desired_state = $3, last_updated = NOW()
    `, [location_id, brand, desiredState]);
  } catch (err) {
    console.error("Failed to update store_state:", err);
  }

  // Rate Limiting check
  const rl = await checkAndIncrementRateLimit(brand);
  if (rl === -1) {
    await logProblemStore({ location_id, name: store_name, brand }, action, "Rate Limit Exceeded locally");
    await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, error_msg, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`${store_name} (${location_id})`, location_id, brand, actorEmail, action.toUpperCase(), 'FAILED', 'Rate Limit Exceeded', 'MANUAL_SINGLE']);
    return res.status(429).json({ error: "Rate limit exceeded (180/min). Try again later." });
  }

  try {
    const apiRes = await performToggleAPI(location_id, action, brand);

    if (apiRes.success) {
      await pool.query(`UPDATE managed_stores SET status = $1, status_updated_at = NOW() WHERE location_id = $2`, [action === 'enable' ? 'online' : 'offline', location_id]);
      await pool.query(`UPDATE problem_stores SET resolved = true WHERE store_id = $1 AND resolved = false`, [location_id]);
      await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, source) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`${store_name} (${location_id})`, location_id, brand, actorEmail, action.toUpperCase(), 'SUCCESS', 'MANUAL_SINGLE']);
      await pool.query(`UPDATE api_health SET last_sync_time = NOW() WHERE brand = $1`, [brand]);
      return res.json(apiRes);
    } else {
      await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, error_msg, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [`${store_name} (${location_id})`, location_id, brand, actorEmail, action.toUpperCase(), 'FAILED', apiRes.error, 'MANUAL_SINGLE']);
      await logProblemStore({ location_id, name: store_name, brand }, action, apiRes.error);
      return res.status(apiRes.status || 500).json(apiRes);
    }
  } catch (err) {
    console.error("[TOGGLE ERROR]", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── BULK TOGGLE ENDPOINT ──────────────────────────────────
router.post("/toggle/bulk", blockIfFrozen, async (req, res) => {
  const { stores, action, filterContext = "" } = req.body;
  if (!stores || !Array.isArray(stores) || stores.length === 0 || !action) {
    return res.status(400).json({ error: "stores array and action required" });
  }

  try {
    const actorEmail = req.user?.email || 'Unknown';
    const { jobId, skippedPaused } = await initiateBulkJob(stores, action, filterContext, actorEmail, 'MANUAL_BULK', performToggleAPI);
    const pausedNote = skippedPaused ? ` (${skippedPaused} paused store${skippedPaused > 1 ? 's' : ''} skipped)` : '';
    if (!jobId) {
      return res.json({ success: true, jobId: null, message: `All selected stores are paused — nothing to do.${pausedNote}` });
    }
    return res.json({ success: true, jobId, message: `Bulk job initiated${pausedNote}` });
  } catch (err) {
    // A brand-overlap conflict carries structured details (who/when/progress) so the
    // frontend can show a real message instead of a generic error.
    if (err.conflictingJob) {
      return res.status(409).json({ success: false, error: err.message, conflictingJob: err.conflictingJob });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SIDEBAR DATA API ──────────────────────────────────────
router.get("/toggle/sidebar-data", async (req, res) => {
  try {
    // 1. API Health
    const healthRes = await pool.query(`SELECT * FROM api_health`);
    let healthStatus = "Healthy";
    let requestsUsed = 0;
    healthRes.rows.forEach(r => {
      requestsUsed = Math.max(requestsUsed, r.requests_this_minute);
    });

    // 2. Latest Bulk Job (Running, Paused, or recently Completed)
    const bulkRes = await pool.query(`SELECT * FROM bulk_toggle_jobs ORDER BY id DESC LIMIT 1`);
    const activeBulkJob = bulkRes.rows[0] || null;

    // 3. Recent Actions (last 30) — retention purge now runs on its own cron in workers.js
    const actionsRes = await pool.query(`SELECT * FROM toggle_activity ORDER BY id DESC LIMIT 30`);
    
    // 4. Problem Stores
    const problemsRes = await pool.query(`SELECT * FROM problem_stores WHERE resolved = false ORDER BY last_attempt_at DESC`);

    // 5. Daily Stats
    const todayRes = await pool.query(`SELECT COUNT(*) as count FROM toggle_activity WHERE result = 'SUCCESS' AND created_at >= CURRENT_DATE`);
    const dailySuccessCount = parseInt(todayRes.rows[0].count, 10);

    return res.json({
      success: true,
      data: {
        frozen: await isToggleFrozen(),
        apiHealth: {
          status: healthStatus,
          requestsThisMinute: requestsUsed, // Max among brands
          maxLimit: 180,
          lastSyncTime: healthRes.rows[0]?.last_sync_time || new Date(),
          keepaliveStatus: "Stopped"
        },
        activeBulkJob,
        recentActions: actionsRes.rows,
        problemStores: problemsRes.rows,
        dailyStats: {
          successCount: dailySuccessCount,
          problemCount: problemsRes.rows.length
        }
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── AUDIT LOG ENDPOINT ──────────────────────────────────────
router.get("/toggle/audit-log", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM toggle_activity ORDER BY created_at DESC LIMIT 500`);
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── RESOLVE PROBLEM ENDPOINTS ────────────────────────────────
// Actually re-attempts the toggle that previously failed, using the store's
// recorded desired_state to know which action (enable/disable) to retry.
router.post("/toggle/problem/retry", blockIfFrozen, async (req, res) => {
  const { id } = req.body;
  try {
    const probRes = await pool.query(`SELECT * FROM problem_stores WHERE id = $1`, [id]);
    const problem = probRes.rows[0];
    if (!problem) return res.status(404).json({ success: false, error: "Problem not found" });

    // Defensive: a paused store should never get a real UrbanPiper call from here,
    // even though pausing already resolves any open problem for it.
    const pausedCheck = await pool.query(`SELECT paused FROM managed_stores WHERE location_id = $1`, [problem.store_id]);
    if (pausedCheck.rows[0]?.paused) {
      return res.status(409).json({ success: false, error: "This store is paused — resume it first before retrying." });
    }

    const stateRes = await pool.query(`SELECT desired_state, active_orders FROM store_state WHERE location_id = $1`, [problem.store_id]);
    const desiredState = stateRes.rows[0]?.desired_state;
    if (!desiredState) return res.status(400).json({ success: false, error: "No desired state recorded for this store" });

    // Must respect the eatfit threshold too — otherwise retrying a store whose
    // AUTO_THROTTLE disable failed (landing it in Problem Stores) would incorrectly
    // re-enable an overloaded kitchen instead of retrying the disable it actually needs.
    const action = desiredState === 'ONLINE'
      ? resolveOnlineAction(problem.brand, stateRes.rows[0]?.active_orders)
      : 'disable';

    const rl = await checkAndIncrementRateLimit(problem.brand);
    if (rl === -1) return res.status(429).json({ success: false, error: "Rate limit exceeded, try again shortly" });

    const apiRes = await performToggleAPI(problem.store_id, action, problem.brand);
    if (apiRes.success) {
      await pool.query(`UPDATE managed_stores SET status = $1, status_updated_at = NOW() WHERE location_id = $2`, [action === 'enable' ? 'online' : 'offline', problem.store_id]);
      await pool.query(`UPDATE problem_stores SET resolved = true WHERE id = $1`, [id]);
      await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, is_automated, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [`${problem.store_name || problem.store_id} (${problem.store_id})`, problem.store_id, problem.brand, req.user?.email || 'Unknown', action.toUpperCase(), 'SUCCESS', false, 'MANUAL_RETRY']);
      return res.json({ success: true, message: "Retry succeeded" });
    } else {
      await logProblemStore({ location_id: problem.store_id, name: problem.store_name, brand: problem.brand }, action, apiRes.error);
      return res.status(apiRes.status || 500).json({ success: false, error: apiRes.error });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Human already fixed this store directly in UrbanPiper — record that correction
// (matches our own desired_state, since that's what the manual fix targets) without
// calling UrbanPiper again.
router.post("/toggle/problem/force-sync", async (req, res) => {
  const { id } = req.body;
  try {
    const probRes = await pool.query(`SELECT * FROM problem_stores WHERE id = $1`, [id]);
    const problem = probRes.rows[0];
    if (!problem) return res.status(404).json({ success: false, error: "Problem not found" });

    const stateRes = await pool.query(`SELECT desired_state FROM store_state WHERE location_id = $1`, [problem.store_id]);
    const desiredState = stateRes.rows[0]?.desired_state || 'OFFLINE';
    const status = desiredState === 'ONLINE' ? 'online' : 'offline';

    await pool.query(`UPDATE managed_stores SET status = $1, status_updated_at = NOW() WHERE location_id = $2`, [status, problem.store_id]);
    await pool.query(`UPDATE problem_stores SET resolved = true WHERE id = $1`, [id]);
    await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, is_automated, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`${problem.store_name || problem.store_id} (${problem.store_id})`, problem.store_id, problem.brand, req.user?.email || 'Unknown', 'MANUAL_CORRECTION', 'SUCCESS', false, 'MANUAL_CORRECTION']);
    return res.json({ success: true, message: `Marked as ${status} (manually confirmed in UrbanPiper)` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// General manual reconcile: any store, any time — for when staff confirm the real
// status directly in UrbanPiper (not just ones already flagged as failed). This never
// calls UrbanPiper (it's already correct there) — it only corrects our own records.
router.post("/toggle/correct-status", async (req, res) => {
  const { location_id, brand, store_name, status } = req.body;
  if (!location_id || !["online", "offline"].includes(status)) {
    return res.status(400).json({ success: false, error: "location_id and status ('online'|'offline') required" });
  }
  const desiredState = status === 'online' ? 'ONLINE' : 'OFFLINE';
  try {
    await pool.query(`UPDATE managed_stores SET status = $1, status_updated_at = NOW() WHERE location_id = $2`, [status, location_id]);
    await pool.query(`
      INSERT INTO store_state (location_id, brand, desired_state)
      VALUES ($1, $2, $3)
      ON CONFLICT (location_id)
      DO UPDATE SET desired_state = $3, last_updated = NOW()
    `, [location_id, brand || "ovenfresh", desiredState]);
    await pool.query(`UPDATE problem_stores SET resolved = true WHERE store_id = $1 AND resolved = false`, [location_id]);
    await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, is_automated, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`${store_name || location_id} (${location_id})`, location_id, brand || null, req.user?.email || 'Unknown', 'MANUAL_CORRECTION', 'SUCCESS', false, 'MANUAL_CORRECTION']);
    return res.json({ success: true, message: `Store marked ${status} to match UrbanPiper` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Only the job's own owner, or an Admin/Super Admin, can pause/resume/cancel it —
// previously anyone with the tab open could stop someone else's job.
async function canControlJob(req, res, jobId) {
  const jobRes = await pool.query(`SELECT actor_email FROM bulk_toggle_jobs WHERE id = $1`, [jobId]);
  if (jobRes.rows.length === 0) {
    res.status(404).json({ success: false, error: "Job not found" });
    return false;
  }
  const isOwner = jobRes.rows[0].actor_email === req.user?.email;
  const isAdmin = ['admin', 'super_admin'].includes(req.user?.role);
  if (!isOwner && !isAdmin) {
    res.status(403).json({ success: false, error: "Only the job's owner or an Admin can control it." });
    return false;
  }
  return true;
}

router.post("/toggle/bulk/cancel", async (req, res) => {
  const { jobId } = req.body;
  if (!(await canControlJob(req, res, jobId))) return;
  await pool.query(`UPDATE bulk_toggle_jobs SET status = 'CANCELLED' WHERE id = $1`, [jobId]);
  res.json({ success: true });
});

router.post("/toggle/bulk/pause", async (req, res) => {
  const { jobId } = req.body;
  if (!(await canControlJob(req, res, jobId))) return;
  await pool.query(`UPDATE bulk_toggle_jobs SET status = 'PAUSED' WHERE id = $1`, [jobId]);
  res.json({ success: true });
});

router.post("/toggle/bulk/resume", blockIfFrozen, async (req, res) => {
  const { jobId } = req.body;
  if (!(await canControlJob(req, res, jobId))) return;
  await pool.query(`UPDATE bulk_toggle_jobs SET status = 'RUNNING' WHERE id = $1`, [jobId]);
  res.json({ success: true });
});

router.get('/history/download', async (req, res) => {
  try {
    const historyRes = await pool.query(`SELECT * FROM toggle_activity WHERE created_at >= NOW() - INTERVAL '48 hours' ORDER BY created_at DESC`);
    
    let csvStr = "Date/Time,User Email,Brand,Source,Action Type,Result,Is Automated,Details\n";
    historyRes.rows.forEach(row => {
      const dt = new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const email = row.email || 'System';
      const brand = row.brand || '';
      const source = row.source || '';
      const action = row.action;
      const result = row.result;
      const isAuto = row.is_automated ? "Yes" : "No";
      // Escape commas in store_name for CSV
      const details = `"${(row.store_name || '').replace(/"/g, '""')}"`;

      csvStr += `"${dt}","${email}","${brand}","${source}","${action}","${result}","${isAuto}",${details}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="Toggle_History_48h.csv"');
    res.send(csvStr);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/toggle/store-states", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM store_state`);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── STORE MANAGEMENT ENDPOINTS ──────────────────────────────
router.get("/toggle/stores", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM managed_stores ORDER BY brand, name`);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/toggle/stores", canManageStores, blockIfFrozen, async (req, res) => {
  const { id, name, brand, city, zone, location_id, status } = req.body;
  if (!name || !brand || !location_id) {
    return res.status(400).json({ error: "name, brand, and location_id required" });
  }
  if (!["online", "offline"].includes(status)) {
    return res.status(400).json({ error: "Current status in UrbanPiper (online/offline) is required" });
  }
  const storeId = id || `ST-${Date.now()}`;

  // Must actually exist in UrbanPiper before we let it into our system — catches typos
  // and unconfigured brands at add-time instead of the first time someone toggles it.
  const check = await verifyLocationExists(location_id, brand, status);
  if (!check.valid) {
    return res.status(400).json({ success: false, error: check.error });
  }

  const desiredState = status === 'online' ? 'ONLINE' : 'OFFLINE';
  try {
    await pool.query(`
      INSERT INTO managed_stores (id, name, brand, city, zone, location_id, status, status_updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (location_id) DO UPDATE
      SET name=$2, brand=$3, city=$4, zone=$5, status=$7, status_updated_at=NOW()
    `, [storeId, name, brand, city || null, zone || null, location_id, status]);
    await pool.query(`
      INSERT INTO store_state (location_id, brand, desired_state)
      VALUES ($1, $2, $3)
      ON CONFLICT (location_id) DO UPDATE SET desired_state = $3, last_updated = NOW()
    `, [location_id, brand, desiredState]);
    res.json({ success: true, message: "Store saved and confirmed in UrbanPiper" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Deliberately one-way: removes the store from our tracking only. We never try to
// delete or touch anything in UrbanPiper — if it still exists there, that's expected
// and fine. But we DO clean up our own related rows so a deleted store can never
// reappear in an Hourly Recheck/Watchdog batch or linger in the Problems list.
router.delete("/toggle/stores/:location_id", canManageStores, blockIfFrozen, async (req, res) => {
  const { location_id } = req.params;
  try {
    await pool.query(`DELETE FROM managed_stores WHERE location_id = $1`, [location_id]);
    await pool.query(`DELETE FROM store_state WHERE location_id = $1`, [location_id]);
    await pool.query(`DELETE FROM problem_stores WHERE store_id = $1`, [location_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PAUSE / RESUME ───────────────────────────────────────────
// Pause turns the store off for real and marks it hands-off — excluded from every
// bulk/automated path (see the paused filter in initiateBulkJob) and from the normal
// single-toggle button, until explicitly resumed.
router.post("/toggle/stores/:location_id/pause", canManageStores, blockIfFrozen, async (req, res) => {
  const { location_id } = req.params;
  const { reason } = req.body;
  const actorEmail = req.user?.email || 'Unknown';
  try {
    const storeRes = await pool.query(`SELECT name, brand FROM managed_stores WHERE location_id = $1`, [location_id]);
    const store = storeRes.rows[0];
    if (!store) return res.status(404).json({ success: false, error: "Store not found" });

    const apiRes = await performToggleAPI(location_id, 'disable', store.brand);

    await pool.query(`
      UPDATE managed_stores
      SET paused = true, paused_at = NOW(), paused_by = $1, pause_reason = $2,
          status = 'offline', status_updated_at = NOW()
      WHERE location_id = $3
    `, [actorEmail, reason || null, location_id]);
    await pool.query(`
      INSERT INTO store_state (location_id, brand, desired_state)
      VALUES ($1, $2, 'OFFLINE')
      ON CONFLICT (location_id) DO UPDATE SET desired_state = 'OFFLINE', last_updated = NOW()
    `, [location_id, store.brand]);
    // Pausing supersedes any open problem for this store — it's deliberately offline
    // now, not "failed and needs retrying". Without this it could still show in the
    // Problems list, where Retry doesn't check for a pause and would call UrbanPiper
    // again on a store that's supposed to be completely hands-off.
    await pool.query(`UPDATE problem_stores SET resolved = true WHERE store_id = $1 AND resolved = false`, [location_id]);
    await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, error_msg, is_automated, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [`${store.name} (${location_id})`, location_id, store.brand, actorEmail, 'DISABLE', apiRes.success ? 'SUCCESS' : 'FAILED', apiRes.success ? (reason || null) : apiRes.error, false, 'MANUAL_PAUSE']);

    res.json({ success: true, message: apiRes.success ? "Store paused" : `Store marked paused, but the UrbanPiper call failed: ${apiRes.error}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/toggle/stores/:location_id/resume", canManageStores, blockIfFrozen, async (req, res) => {
  const { location_id } = req.params;
  const actorEmail = req.user?.email || 'Unknown';
  try {
    const storeRes = await pool.query(`SELECT name, brand FROM managed_stores WHERE location_id = $1`, [location_id]);
    const store = storeRes.rows[0];
    if (!store) return res.status(404).json({ success: false, error: "Store not found" });

    // Resume just makes it a normal store again — it does NOT auto-enable. The next
    // explicit Enable click or bulk run is what actually turns it back on.
    await pool.query(`UPDATE managed_stores SET paused = false, paused_at = NULL, paused_by = NULL, pause_reason = NULL WHERE location_id = $1`, [location_id]);
    await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, is_automated, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [`${store.name} (${location_id})`, location_id, store.brand, actorEmail, 'MANUAL_RESUME', 'SUCCESS', false, 'MANUAL_RESUME']);

    res.json({ success: true, message: "Store resumed — still offline until enabled" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin/Super Admin can flip the freeze themselves without needing direct DB/SSH
// access — e.g. to lock the tab before a maintenance window and unlock it after.
router.post("/toggle/freeze", async (req, res) => {
  const roles = req.user?.roles || [req.user?.role];
  if (!roles.some(r => ['super_admin', 'admin'].includes(r))) {
    return res.status(403).json({ success: false, error: "Admin access required." });
  }
  const { frozen } = req.body;
  if (typeof frozen !== 'boolean') {
    return res.status(400).json({ success: false, error: "frozen (boolean) is required." });
  }
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('toggle_frozen', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(frozen)]
    );
    await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, is_automated, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['— Toggle tab —', null, null, req.user?.email || 'Unknown', frozen ? 'FREEZE' : 'UNFREEZE', 'SUCCESS', false, frozen ? 'MANUAL_FREEZE' : 'MANUAL_UNFREEZE']);
    res.json({ success: true, frozen });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;