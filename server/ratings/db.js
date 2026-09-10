import pg from 'pg';
import 'dotenv/config';

// Connection string to the target 'website' database
const connectionString = process.env.DATABASE_URL || "postgresql://new_user:StrongPassword123!@103.172.150.31/website";

export const pool = new pg.Pool({
  connectionString,
  // 20 was too small: a bulk toggle job runs 10 stores concurrently at ~5 queries each,
  // and with the dashboard polling several endpoints every few seconds plus the toggle
  // crons, the pool would starve — a query then times out waiting for a connection and
  // throws, which used to silently kill the whole bulk job. 35 gives real headroom and
  // is well under Postgres' default 100-connection ceiling (this app is the only client).
  max: 35,
  idleTimeoutMillis: 30000,
  // A little more patience before a query gives up on getting a connection, so a brief
  // spike degrades into "slightly slower" instead of "throws".
  connectionTimeoutMillis: 10000,
  // Hard ceilings so a query can NEVER hang forever. connectionTimeoutMillis above only
  // bounds opening a NEW socket — it does nothing for a query sitting in the hot loop of
  // a bulk job waiting on a pooled client that's checked out and not coming back. That
  // wait is otherwise unbounded: the query never returns and never throws, and the whole
  // bulk job freezes at "0/N RUNNING" with no error to catch. statement_timeout makes
  // Postgres kill any statement still running after 60s (releasing its connection back to
  // the pool); query_timeout is node-pg's client-side backstop for a query that finished
  // server-side but whose result never arrived (dead socket). A timed-out query THROWS,
  // which the per-store try/catch in runBulkJob already turns into one failed store while
  // the job keeps going. No legitimate query in this app runs anywhere near 60s.
  statement_timeout: 60000,
  query_timeout: 65000,
});

// Deliberately NOT using alertService here — it tracks alert cooldowns via the same
// database that's currently the problem, so relying on it for a DB-outage alert would
// be trying to use the broken thing to report that it's broken. This path is
// self-contained: an in-memory cooldown and a direct email send, nothing that
// depends on a working database connection.
let lastDbErrorAlertAt = 0;
pool.on('error', async (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
  if (Date.now() - lastDbErrorAlertAt < 30 * 60 * 1000) return; // 30 min in-memory cooldown
  lastDbErrorAlertAt = Date.now();
  try {
    const { sendAlertEmail } = await import('../alerts/dbAlertFallback.js');
    await sendAlertEmail(err.message);
  } catch (e) {
    console.error('[DB] Also failed to send the DB-error alert email:', e.message);
  }
});
