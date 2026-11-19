// Partner-portal sessions for the Timing tab, kept in Postgres so the deployed server
// and this Mac share one live login per platform account.
//   zomato / main  → { cookies: [...] }        (from zomato_login.py, rolled forward on every call)
//   swiggy / 1, 2  → { accessToken: "..." }    (re-logged-in by phone + password when it dies)

import { pool } from "../ratings/db.js";

let tableReady = null;

export function ensureSessionTable() {
  tableReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS timing_platform_sessions (
      platform     VARCHAR(20)  NOT NULL,
      account      VARCHAR(50)  NOT NULL,
      session      JSONB,
      status       VARCHAR(20)  NOT NULL DEFAULT 'unknown',
      outlet_count INT,
      last_error   TEXT,
      checked_at   TIMESTAMPTZ,
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY (platform, account)
    )
  `).catch(err => { tableReady = null; throw err; });
  return tableReady;
}

export async function getSession(platform, account) {
  await ensureSessionTable();
  const { rows } = await pool.query(
    `SELECT session FROM timing_platform_sessions WHERE platform = $1 AND account = $2`,
    [platform, String(account)]
  );
  return rows[0]?.session || null;
}

export async function saveSession(platform, account, session) {
  await ensureSessionTable();
  await pool.query(`
    INSERT INTO timing_platform_sessions (platform, account, session, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (platform, account) DO UPDATE SET session = EXCLUDED.session, updated_at = NOW()
  `, [platform, String(account), JSON.stringify(session)]);
}

export async function recordCheck(platform, account, { status, outletCount = null, error = null }) {
  await ensureSessionTable();
  await pool.query(`
    INSERT INTO timing_platform_sessions (platform, account, status, outlet_count, last_error, checked_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (platform, account) DO UPDATE
      SET status = EXCLUDED.status, outlet_count = EXCLUDED.outlet_count,
          last_error = EXCLUDED.last_error, checked_at = NOW()
  `, [platform, String(account), status, outletCount, error]);
}

export async function listConnections() {
  await ensureSessionTable();
  const { rows } = await pool.query(`
    SELECT platform, account, status, outlet_count, last_error, checked_at, updated_at
    FROM timing_platform_sessions ORDER BY platform, account
  `);
  return rows;
}
