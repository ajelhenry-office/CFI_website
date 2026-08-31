// Receives UrbanPiper's "store_action" webhook callback — the real confirmation that a
// toggle actually took effect, as opposed to our own POST just being accepted/queued.
// Mounted in server.js BEFORE authMiddleware: UrbanPiper can't send our JWT, so the
// shared-secret header below (set on webhook registration, see the registration script)
// is what stands in for auth here.
import express from "express";
import { pool } from "../ratings/db.js";

const router = express.Router();

const WEBHOOK_SHARED_SECRET = process.env.WEBHOOK_SHARED_SECRET;

router.post("/toggle/webhooks/store-action", async (req, res) => {
  const token = req.headers["x-webhook-token"];
  if (!WEBHOOK_SHARED_SECRET || token !== WEBHOOK_SHARED_SECRET) {
    console.warn("[WEBHOOK] Rejected store_action callback — missing/bad x-webhook-token");
    return res.status(401).json({ received: false });
  }

  const eventType = req.headers["x-upr-event-type"] || req.body?.event_type || null;
  const bizId = req.headers["x-upr-biz-id"] || null;
  console.log(`[WEBHOOK] store_action callback — event_type=${eventType} biz_id=${bizId} body=${JSON.stringify(req.body)}`);

  // Ack fast, before any DB work: UrbanPiper's circuit breaker disables ALL webhooks on
  // this hostname after 15 failures/min, so a slow query or an unexpected payload shape
  // must never turn into a non-200 response.
  res.status(200).json({ received: true });

  try {
    // The exact payload schema isn't documented — this covers the plausible field
    // names; the raw log above is what confirms the real shape on the first live call.
    const referenceId = req.body?.reference_id || req.body?.data?.reference_id || req.body?.task_id || null;
    if (!referenceId) {
      console.warn("[WEBHOOK] No reference_id found in payload — see raw body above to refine field lookup");
      return;
    }

    const rawStatus = String(req.body?.status || req.body?.data?.status || "").toLowerCase();
    const confirmedResult = ["success", "completed", "done", "ok"].includes(rawStatus)
      ? "CONFIRMED_SUCCESS"
      : ["failed", "failure", "error"].includes(rawStatus)
      ? "CONFIRMED_FAILED"
      : "CONFIRMED_UNKNOWN";

    const result = await pool.query(
      `UPDATE toggle_activity SET confirmed_result = $1, confirmed_at = NOW() WHERE $2 = ANY(reference_ids)`,
      [confirmedResult, referenceId]
    );
    console.log(`[WEBHOOK] reference_id=${referenceId} -> ${confirmedResult} (${result.rowCount} row(s) updated)`);
  } catch (err) {
    console.error("[WEBHOOK] Failed to process store_action callback:", err.message);
  }
});

export default router;
