// Store ↔ platform RID map for the Timing tab: one row per UrbanPiper store (a
// sub-brand in a kitchen) with its Zomato / Swiggy / Ownly / F res IDs. Loaded from
// the "Curefoods RIDs" sheet (importStoreSheet.js); refreshStoreLinks() then marks
// which RIDs our partner logins can actually reach.

import { pool } from "../ratings/db.js";
import { getSession } from "./sessionStore.js";
import { getZomatoOutlets } from "./zomatoSession.js";
import { checkSwiggy, SWIGGY_ACCOUNTS } from "./swiggySession.js";

let tableReady = null;

export function ensureStoreTable() {
  tableReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS timing_stores (
      id               SERIAL PRIMARY KEY,
      urbanpiper_store VARCHAR(255),
      kitchen          VARCHAR(100),
      brand_name       VARCHAR(100) NOT NULL,
      sub_brand_name   VARCHAR(150),
      z_res_id         VARCHAR(50),
      s_res_id         VARCHAR(50),
      o_res_id         VARCHAR(50),
      f_res_id         VARCHAR(50),
      z_connected      BOOLEAN,
      z_outlet_name    VARCHAR(255),
      s_connected      BOOLEAN,
      s_account        VARCHAR(20),
      s_outlet_name    VARCHAR(255),
      links_checked_at TIMESTAMPTZ,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Paused stores stay listed but refuse timing changes until resumed.
    ALTER TABLE timing_stores ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT false;
  `).catch(err => { tableReady = null; throw err; });
  return tableReady;
}

// Sheet cells use "-" / 0 / blank for "not on this platform".
export function cleanRid(v) {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) && s !== "0" ? s : null;
}

// Replaces every row of one brand in a single transaction.
export async function replaceBrandStores(brand, stores) {
  await ensureStoreTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM timing_stores WHERE brand_name = $1`, [brand]);
    await client.query(`
      INSERT INTO timing_stores (urbanpiper_store, kitchen, brand_name, sub_brand_name, z_res_id, s_res_id, o_res_id, f_res_id)
      SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
    `, [
      stores.map(s => s.urbanpiper_store || null),
      stores.map(s => s.kitchen || null),
      stores.map(() => brand),
      stores.map(s => s.sub_brand_name || null),
      stores.map(s => s.z_res_id),
      stores.map(s => s.s_res_id),
      stores.map(s => s.o_res_id ?? null),
      stores.map(s => s.f_res_id ?? null),
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Marks each RID connected / not connected against what our logins can see right now.
// A platform whose login fails is left untouched rather than flipped to "not connected".
export async function refreshStoreLinks() {
  await ensureStoreTable();
  const summary = {};

  try {
    const outlets = await getZomatoOutlets();
    const ids = outlets.map(o => o.res_id);
    const names = outlets.map(o => (o.subzone ? `${o.name} – ${o.subzone}` : o.name));
    await pool.query(`
      UPDATE timing_stores t
      SET z_connected = (o.id IS NOT NULL), z_outlet_name = o.name, links_checked_at = NOW()
      FROM timing_stores t2
      LEFT JOIN unnest($1::text[], $2::text[]) AS o(id, name) ON o.id = t2.z_res_id
      WHERE t.id = t2.id AND t.z_res_id IS NOT NULL
    `, [ids, names]);
    summary.zomato = outlets.length;
  } catch (err) {
    summary.zomato = `skipped: ${err.message}`;
  }

  try {
    const ids = [], accounts = [], names = [];
    for (const account of SWIGGY_ACCOUNTS) {
      const session = await getSession("swiggy", account);
      if (!session?.accessToken) throw new Error(`SESSION_EXPIRED: no saved token for account ${account}`);
      const { restaurants } = await checkSwiggy(session.accessToken);
      for (const r of restaurants) {
        ids.push(String(r.rest_id));
        accounts.push(String(account));
        names.push(r.display_area_name || r.area_name ? `${r.rest_name} – ${r.display_area_name || r.area_name}` : r.rest_name);
      }
    }
    await pool.query(`
      UPDATE timing_stores t
      SET s_connected = (o.id IS NOT NULL), s_account = o.account, s_outlet_name = o.name, links_checked_at = NOW()
      FROM timing_stores t2
      LEFT JOIN (SELECT DISTINCT ON (id) * FROM unnest($1::text[], $2::text[], $3::text[]) AS u(id, account, name)) o
        ON o.id = t2.s_res_id
      WHERE t.id = t2.id AND t.s_res_id IS NOT NULL
    `, [ids, accounts, names]);
    summary.swiggy = ids.length;
  } catch (err) {
    summary.swiggy = `skipped: ${err.message}`;
  }

  return summary;
}

export async function listStores(brand) {
  await ensureStoreTable();
  const { rows } = await pool.query(`
    SELECT id, urbanpiper_store, kitchen, brand_name, sub_brand_name,
           z_res_id, s_res_id, o_res_id, f_res_id,
           z_connected, z_outlet_name, s_connected, s_account, s_outlet_name, links_checked_at, paused
    FROM timing_stores
    WHERE ($1::text IS NULL OR brand_name = $1)
    ORDER BY kitchen, sub_brand_name
  `, [brand || null]);
  return rows;
}

export async function getStore(id) {
  await ensureStoreTable();
  const { rows } = await pool.query(`SELECT * FROM timing_stores WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Manual add from the Timing tab's Status panel — then links its RIDs right away and
// reports, per platform, whether each RID is connected, not found, or couldn't be checked.
export async function addStore({ brand_name, urbanpiper_store, s_res_id, z_res_id, o_res_id, f_res_id }) {
  await ensureStoreTable();
  const name = String(urbanpiper_store || "").trim();
  if (!brand_name || !name) throw new Error("Brand and store name are required");
  const raw = { s_res_id, z_res_id, o_res_id, f_res_id };
  const bad = Object.entries(raw).filter(([, v]) => String(v ?? "").trim() && !cleanRid(v));
  if (bad.length) throw new Error("RIDs must be digits only");
  const rids = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, cleanRid(v)]));
  if (!Object.values(rids).some(Boolean)) throw new Error("Enter at least one platform RID");

  const { rows } = await pool.query(`
    INSERT INTO timing_stores (brand_name, urbanpiper_store, s_res_id, z_res_id, o_res_id, f_res_id)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `, [brand_name, name, rids.s_res_id, rids.z_res_id, rids.o_res_id, rids.f_res_id]);
  const links = await refreshStoreLinks();
  const store = await getStore(rows[0].id);

  const report = [];
  const check = (platform, rid, connected, summary, account) => {
    if (!rid) return;
    if (typeof summary === "string") report.push({ platform, rid, status: "failed", message: `${platform} ${rid}: connection failed — ${summary.replace(/^skipped: /, "")}` });
    else if (connected) report.push({ platform, rid, status: "connected", message: `${platform} ${rid}: connected${account ? ` (Swiggy account ${account})` : ""}` });
    else report.push({ platform, rid, status: "not_found", message: `${platform} ${rid}: number not found on our ${platform} login` });
  };
  check("Swiggy", store.s_res_id, store.s_connected, links.swiggy, store.s_account);
  check("Zomato", store.z_res_id, store.z_connected, links.zomato);
  for (const [platform, key] of [["Ownly", "o_res_id"], ["Flipkart", "f_res_id"]]) {
    if (store[key]) report.push({ platform, rid: store[key], status: "saved", message: `${platform} ${store[key]}: saved — ${platform} isn't connected yet, so it can't be checked` });
  }
  return { store, report };
}

export async function deleteStore(id) {
  await ensureStoreTable();
  const { rowCount } = await pool.query(`DELETE FROM timing_stores WHERE id = $1`, [id]);
  if (!rowCount) throw new Error("Store not found");
}

export async function setStorePaused(id, paused) {
  await ensureStoreTable();
  const { rowCount } = await pool.query(`UPDATE timing_stores SET paused = $2, updated_at = NOW() WHERE id = $1`, [id, paused]);
  if (!rowCount) throw new Error("Store not found");
}
