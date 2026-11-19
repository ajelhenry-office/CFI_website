// Applies a single S1/S2 timing change for one store on one platform, and records it in
// timing_changes — that table is both the Timing tab's audit log (who changed which store,
// platform, slot, days, from what to what, when) and its failed-changes list. Entries are
// kept for 48 hours, then deleted automatically.

import { pool } from "../ratings/db.js";
import { getSession, saveSession } from "./sessionStore.js";
import { getStore } from "./storeMap.js";
import { updateZomatoSlot } from "./zomatoSession.js";
import { loginSwiggy, updateSwiggySlot } from "./swiggySession.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS = { S1: 0, S2: 1 };
const PLATFORM_RID = { Swiggy: "s_res_id", Zomato: "z_res_id", Ownly: "o_res_id", Flipkart: "f_res_id" };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

let tableReady = null;

function ensureChangesTable() {
  tableReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS timing_changes (
      id          SERIAL PRIMARY KEY,
      user_email  VARCHAR(255),
      store_id    INT,
      store_name  VARCHAR(255),
      platform    VARCHAR(20)  NOT NULL,
      rid         VARCHAR(50),
      slot        VARCHAR(2)   NOT NULL,
      days        TEXT[]       NOT NULL,
      new_start   VARCHAR(5)   NOT NULL,
      new_end     VARCHAR(5)   NOT NULL,
      changes     JSONB,
      status      VARCHAR(20)  NOT NULL DEFAULT 'processing',
      error       TEXT,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS timing_changes_created_idx ON timing_changes (created_at DESC);
  `).catch(err => { tableReady = null; throw err; });
  return tableReady;
}

const RETENTION = "48 hours";

// Called on every read and write of the log (and by the daily check), so expired
// entries go even when nobody opens the panel for a while.
export async function purgeOldTimingChanges() {
  await ensureChangesTable();
  const { rowCount } = await pool.query(`DELETE FROM timing_changes WHERE created_at < NOW() - INTERVAL '${RETENTION}'`);
  return rowCount;
}

function storeName(s) {
  return (s.urbanpiper_store || `${s.kitchen} ${s.sub_brand_name}`).replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

function validate({ platform, slot, days, start, end }) {
  if (!PLATFORM_RID[platform]) throw new Error(`Unknown platform ${platform}`);
  if (!(slot in SLOTS)) throw new Error("Slot must be S1 or S2");
  if (!Array.isArray(days) || !days.length || days.some(d => !DAYS.includes(d))) throw new Error("Pick at least one valid day");
  if (!TIME.test(start || "") || !TIME.test(end || "")) throw new Error("Times must be HH:MM");
  if (start === end) throw new Error("Opening and closing time can't be the same");
}

async function pushToPlatform(store, platform, slot, days, start, end) {
  const rid = store[PLATFORM_RID[platform]];
  const slotIndex = SLOTS[slot];

  if (platform === "Zomato") {
    if (!store.z_connected) throw new Error(`Zomato RID ${rid} isn't on our Zomato login — not connected`);
    return updateZomatoSlot(rid, days, slotIndex, start, end);
  }

  if (platform === "Swiggy") {
    if (!store.s_connected || !store.s_account) throw new Error(`Swiggy RID ${rid} isn't on either Swiggy login — not connected`);
    const account = store.s_account;
    const session = await getSession("swiggy", account);
    try {
      if (!session?.accessToken) throw new Error("SESSION_EXPIRED: no saved token");
      return await updateSwiggySlot(session.accessToken, rid, days, slotIndex, start, end);
    } catch (err) {
      if (!err.message.startsWith("SESSION_EXPIRED")) throw err;
      // Token died since the last daily check — log in again once and retry.
      const fresh = await loginSwiggy(account);
      await saveSession("swiggy", account, { accessToken: fresh.accessToken });
      return updateSwiggySlot(fresh.accessToken, rid, days, slotIndex, start, end);
    }
  }

  throw new Error(`${platform} timing changes aren't connected yet`);
}

// Returns the timing_changes row (status success | failed). Validation problems and
// paused/missing stores throw before anything is recorded or sent.
export async function applyTimingChange({ storeId, platform, slot, days, start, end, userEmail }) {
  validate({ platform, slot, days, start, end });
  const store = await getStore(storeId);
  if (!store) throw new Error("Store not found");
  if (store.paused) throw new Error(`${storeName(store)} is paused — resume it to change timings`);
  const rid = store[PLATFORM_RID[platform]];
  if (!rid) throw new Error(`${storeName(store)} has no ${platform} RID`);

  const orderedDays = DAYS.filter(d => days.includes(d));
  await purgeOldTimingChanges();
  const { rows: [row] } = await pool.query(`
    INSERT INTO timing_changes (user_email, store_id, store_name, platform, rid, slot, days, new_start, new_end)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
  `, [userEmail, store.id, storeName(store), platform, rid, slot, orderedDays, start, end]);

  try {
    const changes = await pushToPlatform(store, platform, slot, orderedDays, start, end);
    await pool.query(
      `UPDATE timing_changes SET status = 'success', changes = $2, finished_at = NOW() WHERE id = $1`,
      [row.id, JSON.stringify(changes)]
    );
  } catch (err) {
    console.error(`[TIMING CHANGE] #${row.id} ${platform} ${rid} failed:`, err.message);
    await pool.query(
      `UPDATE timing_changes SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`,
      [row.id, err.message]
    );
  }
  return getTimingChange(row.id);
}

export async function getTimingChange(id) {
  await ensureChangesTable();
  const { rows } = await pool.query(`SELECT * FROM timing_changes WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Re-runs a failed change with the same inputs, recorded as a new row by the retrier.
export async function retryTimingChange(id, userEmail) {
  const prev = await getTimingChange(id);
  if (!prev) throw new Error("Change not found");
  if (prev.status !== "failed") throw new Error("Only failed changes can be retried");
  const result = await applyTimingChange({
    storeId: prev.store_id, platform: prev.platform, slot: prev.slot, days: prev.days,
    start: prev.new_start, end: prev.new_end, userEmail,
  });
  // A successful retry clears the old failure off the Failed list.
  if (result.status === "success") await pool.query(`UPDATE timing_changes SET status = 'retried' WHERE id = $1`, [id]);
  return result;
}

export async function listTimingChanges({ status, limit = 200 } = {}) {
  await purgeOldTimingChanges();
  const { rows } = await pool.query(`
    SELECT * FROM timing_changes
    WHERE ($1::text IS NULL OR status = $1)
    ORDER BY created_at DESC
    LIMIT $2
  `, [status || null, Math.min(Number(limit) || 200, 1000)]);
  return rows;
}
