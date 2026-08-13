import express from "express";
import { pool } from "../ratings/db.js";
import { checkAndIncrementRateLimit, logProblemStore, initiateBulkJob } from "./queue.js";

const router = express.Router();

// ─── URBANPIPER CONFIG ───────────────────────────────────────
const UP_LOCATION_URL = "https://api.urbanpiper.com/hub/api/v1/location/";
const UP_PLATFORMS    = ["swiggy", "zomato"];

const UP_BRANDS = {
  ovenfresh: {
    username : process.env.UP_USERNAME_OVENFRESH || "biz_adm_pmNKQXRHStVR",
    apikey   : process.env.UP_APIKEY_OVENFRESH   || "78cb85198b12fa391437679c5878bc7b50e38896",
    biz_id   : process.env.UP_BIZ_ID_OVENFRESH   || "62978428",
  },
  paris_cakes___desserts: {
    username : process.env.UP_USERNAME_OVENFRESH || "biz_adm_pmNKQXRHStVR",
    apikey   : process.env.UP_APIKEY_OVENFRESH   || "78cb85198b12fa391437679c5878bc7b50e38896",
    biz_id   : process.env.UP_BIZ_ID_OVENFRESH   || "62978428",
  },
  eatfit: {
    username : process.env.UP_USERNAME_EATFIT || "biz_adm_QXJeFIgABXFq",
    apikey   : process.env.UP_APIKEY_EATFIT   || "a7d35eac21f5e6eab9d760d25d71a899c3ba2178",
    biz_id   : process.env.UP_BIZ_ID_EATFIT   || "60578050",
  },

  cake_zone: {
    username : process.env.UP_USERNAME_CAKEZONE || "biz_adm_zzXEiLApvfel",
    apikey   : process.env.UP_APIKEY_CAKEZONE   || "e4d7ccbe7e7342169523c37a516488fe3146a46c",
  },
  olio: {
    username : process.env.UP_USERNAME_OLIO || "biz_adm_iIqzrwJgxyOK",
    apikey   : process.env.UP_APIKEY_OLIO   || "c8e89a781c58a8ed636ff2a9c693d1bd503a454e",
  },
};

// ─── HELPER: PERFORM API CALL ────────────────────────────────
// Exported so the background crons (workers.js) can call it directly, in-process,
// instead of making a self-referential HTTP request to this same server.
export async function performToggleAPI(location_id, action, brand) {
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
            if (currentPlatforms.length > 2) {
              currentPlatforms = ["swiggy", "zomato"];
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

// ─── SINGLE TOGGLE ENDPOINT ──────────────────────────────────
router.post("/toggle", async (req, res) => {
  const { location_id, store_name, action, brand = "ovenfresh" } = req.body;
  if (!location_id || !action) return res.status(400).json({ error: "location_id and action required" });
  if (!["enable", "disable"].includes(action)) return res.status(400).json({ error: 'action must be enable or disable' });

  const actorEmail = req.user?.email || 'Unknown';

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
    return res.status(429).json({ error: "Rate limit exceeded (18/min). Try again later." });
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
router.post("/toggle/bulk", async (req, res) => {
  const { stores, action, filterContext = "" } = req.body;
  if (!stores || !Array.isArray(stores) || stores.length === 0 || !action) {
    return res.status(400).json({ error: "stores array and action required" });
  }

  try {
    const actorEmail = req.user?.email || 'Unknown';
    const { jobId } = await initiateBulkJob(stores, action, filterContext, actorEmail, 'MANUAL_BULK', performToggleAPI);
    return res.json({ success: true, jobId, message: "Bulk job initiated" });
  } catch (err) {
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
        apiHealth: {
          status: healthStatus,
          requestsThisMinute: requestsUsed, // Max among brands
          maxLimit: 18,
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
router.post("/toggle/problem/retry", async (req, res) => {
  const { id } = req.body;
  try {
    const probRes = await pool.query(`SELECT * FROM problem_stores WHERE id = $1`, [id]);
    const problem = probRes.rows[0];
    if (!problem) return res.status(404).json({ success: false, error: "Problem not found" });

    const stateRes = await pool.query(`SELECT desired_state FROM store_state WHERE location_id = $1`, [problem.store_id]);
    const desiredState = stateRes.rows[0]?.desired_state;
    if (!desiredState) return res.status(400).json({ success: false, error: "No desired state recorded for this store" });

    const action = desiredState === 'ONLINE' ? 'enable' : 'disable';

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

router.post("/toggle/bulk/cancel", async (req, res) => {
  const { jobId } = req.body;
  await pool.query(`UPDATE bulk_toggle_jobs SET status = 'CANCELLED' WHERE id = $1`, [jobId]);
  res.json({ success: true });
});

router.post("/toggle/bulk/pause", async (req, res) => {
  const { jobId } = req.body;
  await pool.query(`UPDATE bulk_toggle_jobs SET status = 'PAUSED' WHERE id = $1`, [jobId]);
  res.json({ success: true });
});

router.post("/toggle/bulk/resume", async (req, res) => {
  const { jobId } = req.body;
  await pool.query(`UPDATE bulk_toggle_jobs SET status = 'RUNNING' WHERE id = $1`, [jobId]);
  res.json({ success: true });
});

// ─── UTILITY LOCATIONS (EXISTING) ─────────────────────────
router.get("/locations", async (req, res) => {
  const brand = req.query.brand || "ovenfresh";
  const brandKey = brand.toLowerCase().replace(/[^a-z]/g, "_");
  const creds = UP_BRANDS[brandKey];
  if (!creds) return res.status(400).json({ error: `Unknown brand: ${brand}` });
  try {
    const response = await fetch(UP_LOCATION_URL, {
      method  : "GET",
      headers : { "Authorization" : `apikey ${creds.username}:${creds.apikey}`, ...(creds.biz_id ? { "x-upr-biz-id": creds.biz_id } : {}) }
    });
    const responseText = await response.text();
    try { return res.json({ success: true, locations: JSON.parse(responseText) }); } catch(e) { return res.status(500).json({error: "Parse failed"}); }
  } catch (err) { return    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/history/download', async (req, res) => {
  try {
    const historyRes = await pool.query(`SELECT * FROM toggle_activity ORDER BY created_at DESC`);
    
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

// ─── ORDER VOLUME ENDPOINT (WEBHOOK) ─────────────────────────
router.post("/toggle/update-orders", async (req, res) => {
  const { location_id, active_orders, brand, store_name } = req.body;
  if (!location_id || active_orders === undefined) {
    return res.status(400).json({ error: "location_id and active_orders required" });
  }

  const brandClean = brand || "ovenfresh";
  const brandKey = brandClean.toLowerCase().replace(/[^a-z]/g, "_");

  try {
    const currentStateRes = await pool.query(`
      INSERT INTO store_state (location_id, brand, active_orders) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (location_id) 
      DO UPDATE SET active_orders = $3, last_updated = NOW()
      RETURNING desired_state
    `, [location_id, brandClean, active_orders]);
    
    const desiredState = currentStateRes.rows[0]?.desired_state;

    // Auto-disable logic (ONLY for eatfit)
    if (brandKey.includes("eatfit") && active_orders >= 15 && desiredState === 'ONLINE') {
      console.log(`[AUTO-TOGGLE] ${location_id} has ${active_orders} orders. Disabling.`);
      
      const apiRes = await performToggleAPI(location_id, 'disable', brandClean);
      
      if (apiRes.success) {
        await pool.query(`UPDATE managed_stores SET status = 'offline', status_updated_at = NOW() WHERE location_id = $1`, [location_id]);
        await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, is_automated, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [`${store_name || location_id} (${location_id})`, location_id, brandClean, 'System — Auto-Throttle', 'DISABLE', 'SUCCESS', true, 'AUTO_THROTTLE']);
      } else {
        await pool.query(`INSERT INTO toggle_activity (store_name, store_id, brand, email, action, result, is_automated, error_msg, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [`${store_name || location_id} (${location_id})`, location_id, brandClean, 'System — Auto-Throttle', 'DISABLE', 'FAILED', true, apiRes.error, 'AUTO_THROTTLE']);
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Failed to update orders:", err);
    return res.status(500).json({ success: false, error: err.message });
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

router.post("/toggle/stores", async (req, res) => {
  const { id, name, brand, city, zone, location_id, status } = req.body;
  if (!name || !brand || !location_id) {
    return res.status(400).json({ error: "name, brand, and location_id required" });
  }
  const storeId = id || `ST-${Date.now()}`;

  try {
    await pool.query(`
      INSERT INTO managed_stores (id, name, brand, city, zone, location_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (location_id) DO UPDATE 
      SET name=$2, brand=$3, city=$4, zone=$5, status=$7
    `, [storeId, name, brand, city || null, zone || null, location_id, status || 'offline']);
    res.json({ success: true, message: "Store saved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/toggle/stores/:location_id", async (req, res) => {
  const { location_id } = req.params;
  try {
    await pool.query(`DELETE FROM managed_stores WHERE location_id = $1`, [location_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;