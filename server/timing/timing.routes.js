import express from "express";
import { pool } from "../ratings/db.js";
import { listConnections } from "./sessionStore.js";
import { runTimingConnectionCheck } from "./connectionCheck.js";
import { listStores, addStore, deleteStore, setStorePaused } from "./storeMap.js";
import { applyTimingChange, listTimingChanges, retryTimingChange } from "./timingChanges.js";

const router = express.Router();

// ─── GITHUB ACTIONS CONFIG (for legacy store timing) ───────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_REPO  = process.env.GITHUB_REPO  || "ajelhenry-office/CFI_website";

// ─── TIMING ENDPOINT ──────────────────────────────────────────
router.post("/timing", async (req, res) => {
  const { store_id, location_id, zomato_id, store_name, opening_time, closing_time, opening_time_2, closing_time_2, slot } = req.body;

  if (!(location_id || zomato_id || store_id) || (!opening_time && !opening_time_2)) {
    return res.status(400).json({ error: "Store identifier and at least one opening_time required" });
  }
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: "GITHUB_TOKEN not configured" });
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/sync.yml/dispatches`,
      {
        method  : "POST",
        headers : {
          Authorization  : `Bearer ${GITHUB_TOKEN}`,
          Accept         : "application/vnd.github.v3+json",
          "Content-Type" : "application/json",
        },
        body: JSON.stringify({
          ref    : "main",
          inputs : {
            store_id     : String(store_id || location_id),
            location_id  : String(location_id || store_id || ""),
            zomato_id    : String(zomato_id || ""),
            store_name   : store_name || "",
            opening_time : opening_time || "",
            closing_time : closing_time || "",
            opening_time_2: opening_time_2 || "",
            closing_time_2: closing_time_2 || "",
            slot         : String(slot || "1"),
          },
        }),
      }
    );

    if (response.status === 204) {
      return res.json({ success: true, message: "GitHub Actions triggered." });
    }
    const body = await response.text();
    return res.status(response.status).json({ success: false, error: body });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

import crypto from "crypto";
import jwt from "jsonwebtoken";

// ─── BULK ADVANCED TIMING UPDATE ───────────────────────────────
router.post("/timing/bulk-update", async (req, res) => {
  const { platform, stores, timings } = req.body;
  if (!stores || !Array.isArray(stores) || stores.length === 0) {
    return res.status(400).json({ success: false, error: "No stores provided" });
  }
  if (!timings) {
    return res.status(400).json({ success: false, error: "No timings provided" });
  }

  let userEmail = 'System';
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretkey");
      userEmail = decoded.email || 'System';
    } catch (e) {}
  }
  
  const batchId = crypto.randomUUID();

  try {
    const values = stores.map(storeId => {
      // we assume platform is brand, or brand is unknown. Wait, stores is an array of IDs.
      // Wait, in TimingPage we mapped value to store[currentIdField]
      // Let's pass the brand from frontend in next step, but for now we'll put platform.
      return `('${storeId}', '${platform}', '${JSON.stringify(timings)}', 'pending', '${batchId}', '${userEmail}')`;
    }).join(", ");

    const query = `
      INSERT INTO zomato_timing_queue (store_id, brand, payload, status, batch_id, user_email) 
      VALUES ${values}
    `;
    await pool.query(query);
    
    res.json({ success: true, message: `Queued ${stores.length} stores`, batch_id: batchId });
  } catch (err) {
    console.error("[BULK UPDATE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── QUEUE STATUS POLL ─────────────────────────────────────────
router.get("/timing/queue-status", async (req, res) => {
  try {
    // Get the most recent 5 batches
    const batchRes = await pool.query(`
      SELECT batch_id 
      FROM zomato_timing_queue 
      WHERE batch_id IS NOT NULL 
      GROUP BY batch_id 
      ORDER BY MAX(id) DESC 
      LIMIT 5
    `);
    
    const batchIds = batchRes.rows.map(r => r.batch_id);
    if (batchIds.length === 0) {
       return res.json({ success: true, tasks: [] });
    }

    const inClause = batchIds.map(id => `'${id}'`).join(',');
    const result = await pool.query(`
      SELECT id, store_id, brand, status, error_message, batch_id, updated_at
      FROM zomato_timing_queue 
      WHERE batch_id IN (${inClause})
      ORDER BY id DESC
    `);
    res.json({ success: true, tasks: result.rows });
  } catch (err) {
    console.error("[QUEUE STATUS ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── AUDIT LOG ──────────────────────────────────────────────────
router.get("/timing/audit-log", async (req, res) => {
  try {
    const q = `
      SELECT batch_id, 
             MAX(created_at) as created_at,
             MAX(user_email) as email,
             COUNT(*) as total_stores,
             SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
             json_agg(json_build_object(
               'store_id', store_id,
               'brand', brand,
               'status', status,
               'error_message', error_message,
               'payload', payload
             )) as details
      FROM zomato_timing_queue
      WHERE batch_id IS NOT NULL
      GROUP BY batch_id
      ORDER BY MAX(created_at) DESC
      LIMIT 50
    `;
    const { rows } = await pool.query(q);
    res.json({ success: true, logs: rows });
  } catch (err) {
    console.error("Audit Log error:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

// ─── PARTNER CONNECTIONS (Zomato + Swiggy logins) ────────────
// Same role set the sidebar gives the Timing tab (ROLE_PERMISSIONS in Sidebar.jsx).
function canManageTiming(req, res, next) {
  const roles = req.user?.roles || [req.user?.role];
  if (!roles.some(r => ["super_admin", "admin"].includes(r))) {
    return res.status(403).json({ success: false, error: "You don't have permission to manage timings." });
  }
  next();
}

router.get("/timing/connections", canManageTiming, async (req, res) => {
  try {
    res.json({ success: true, connections: await listConnections() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/timing/connections/check", canManageTiming, async (req, res) => {
  try {
    res.json({ success: true, results: await runTimingConnectionCheck() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── STORE ↔ RID MAP ─────────────────────────────────────────
router.get("/timing/stores", canManageTiming, async (req, res) => {
  try {
    res.json({ success: true, stores: await listStores(req.query.brand) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/timing/stores", canManageTiming, async (req, res) => {
  try {
    const { store, report } = await addStore(req.body || {});
    res.json({ success: true, store, report });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete("/timing/stores/:id", canManageTiming, async (req, res) => {
  try {
    await deleteStore(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

for (const action of ["pause", "resume"]) {
  router.post(`/timing/stores/:id/${action}`, canManageTiming, async (req, res) => {
    try {
      await setStorePaused(req.params.id, action === "pause");
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
}

// ─── TIMING CHANGES (S1 / S2 saves) + AUDIT ──────────────────
router.post("/timing/changes", canManageTiming, async (req, res) => {
  const { storeId, platform, slot, days, start, end } = req.body || {};
  try {
    const change = await applyTimingChange({ storeId, platform, slot, days, start, end, userEmail: req.user?.email });
    res.json({ success: change.status === "success", change, error: change.error || undefined });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get("/timing/changes", canManageTiming, async (req, res) => {
  try {
    res.json({ success: true, changes: await listTimingChanges({ status: req.query.status, limit: req.query.limit }) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/timing/changes/:id/retry", canManageTiming, async (req, res) => {
  try {
    const change = await retryTimingChange(req.params.id, req.user?.email);
    res.json({ success: change.status === "success", change, error: change.error || undefined });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── CACHED TIMINGS ──────────────────────────────────────────
router.get("/timing/all-store-timings", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT store_id, timings FROM zomato_timing_cache`);
    const cacheMap = {};
    rows.forEach(r => {
      cacheMap[r.store_id] = r.timings;
    });
    res.json({ success: true, cache: cacheMap });
  } catch (err) {
    console.error("All store timings error:", err);
    res.status(500).json({ error: "Failed to fetch timing cache" });
  }
});

export default router;