import express from "express";
import { pool } from "./ratings/db.js";
import { getMetabaseApiKey, METABASE_CARD_KITCHEN_URL } from "./ops_matrix/ops.routes.js";

const router = express.Router();

// India Standard Time is a fixed UTC+5:30 offset with no DST — same approach
// used throughout the ratings pipeline (insights.routes.js, daily_automation.js).
function todayISTDateString() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const d = new Date(Date.now() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Reads system_alerts + pipeline_state directly — no dependency on any mail
// service, so this can never go silent for the same reason the task it's
// reporting on went silent (unlike an email alert, which shares a failure
// domain with whatever it's supposed to warn about).
async function ratingsMailFetchHealth() {
  const CATEGORY = "Ratings & Insights Mail Fetch";
  try {
    const marker = await pool.query(`SELECT value FROM pipeline_state WHERE key = 'last_checked_received_date'`);
    const markerDate = marker.rows[0]?.value || null;
    const today = todayISTDateString();
    const daysBehind = markerDate ? Math.round((new Date(today) - new Date(markerDate)) / 86400000) : null;

    const alertRes = await pool.query(
      `SELECT severity FROM system_alerts WHERE category = $1 AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [CATEGORY],
    );
    const openSeverity = alertRes.rows[0]?.severity || null;

    let status = "healthy";
    let detail = markerDate ? `Up to date — last checked ${markerDate}` : "No check has ever run";

    if (daysBehind === null) {
      status = "error";
    } else if (openSeverity === "CRITICAL" || daysBehind >= 3) {
      status = "error";
      detail = `${daysBehind} day${daysBehind === 1 ? "" : "s"} behind — last checked ${markerDate}`;
    } else if (openSeverity === "WARNING" || daysBehind === 2) {
      status = "medium";
      detail = `${daysBehind} day${daysBehind === 1 ? "" : "s"} behind — last checked ${markerDate}`;
    }

    return { id: "ratings_mail_fetch", name: "Ratings Mail Fetch", status, detail };
  } catch (err) {
    return { id: "ratings_mail_fetch", name: "Ratings Mail Fetch", status: "error", detail: `Health check itself failed: ${err.message}` };
  }
}

// Live probe of the Metabase path the Ops Matrix tab depends on. The tab goes
// blank whenever card 2523 stops answering — most often because METABASE_API is
// missing, revoked, or (see ops.routes.js) arrives quote-wrapped and reads as
// "Unauthenticated". A 401/403 from Metabase is surfaced by /prep-time/kitchen
// as a 502, so this card is the only place that failure is legible before a
// user notices an empty table.
async function opsMatrixMetabaseHealth() {
  const base = { id: "ops_matrix_metabase", name: "Ops Matrix (Metabase)" };

  const apiKey = getMetabaseApiKey();
  if (!apiKey) {
    return { ...base, status: "error", detail: "METABASE_API is not configured on the server" };
  }

  // 1-day window keeps the probe cheap; it exercises auth + connectivity, not volume.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const y = new Date(Date.now() + IST_OFFSET_MS - 86400000);
  const day = `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, "0")}-${String(y.getUTCDate()).padStart(2, "0")}`;
  const payload = {
    parameters: [
      { type: "date/single", target: ["variable", ["template-tag", "s"]], value: day },
      { type: "date/single", target: ["variable", ["template-tag", "e"]], value: day },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const t0 = Date.now();
    const resp = await fetch(METABASE_CARD_KITCHEN_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const ms = Date.now() - t0;

    if (resp.status === 401 || resp.status === 403) {
      return { ...base, status: "error", detail: `Metabase rejected the API key (HTTP ${resp.status}) — Ops Matrix will show no data. Check METABASE_API on the server.` };
    }
    if (!resp.ok) {
      return { ...base, status: "error", detail: `Metabase card 2523 returned HTTP ${resp.status}` };
    }

    const json = await resp.json().catch(() => null);
    if (!json || !json.data || !Array.isArray(json.data.rows)) {
      return { ...base, status: "medium", detail: `Metabase responded (HTTP ${resp.status}) but the payload shape was unexpected` };
    }
    if (ms > 10000) {
      return { ...base, status: "medium", detail: `Responding slowly — ${(ms / 1000).toFixed(1)}s for a 1-day query` };
    }
    return { ...base, status: "healthy", detail: `Metabase API responding (HTTP ${resp.status}, ${(ms / 1000).toFixed(1)}s)` };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ...base, status: "error", detail: "Metabase did not respond within 15s" };
    }
    return { ...base, status: "error", detail: `Metabase unreachable: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// One card per monitored task. Adding a future task (a different tab's
// automation) is just adding another entry to this array — the frontend
// renders whatever comes back, no changes needed there.
router.get("/tasks", async (req, res) => {
  const tasks = await Promise.all([ratingsMailFetchHealth(), opsMatrixMetabaseHealth()]);
  res.json({ tasks });
});

export default router;
