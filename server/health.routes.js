import express from "express";
import { pool } from "./ratings/db.js";

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

// One card per monitored task. Adding a future task (a different tab's
// automation) is just adding another entry to this array — the frontend
// renders whatever comes back, no changes needed there.
router.get("/tasks", async (req, res) => {
  const tasks = await Promise.all([ratingsMailFetchHealth()]);
  res.json({ tasks });
});

export default router;
