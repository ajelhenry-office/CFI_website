import pg from 'pg';
import 'dotenv/config';

// Connection string to the target 'website' database
const connectionString = process.env.DATABASE_URL || "postgresql://new_user:StrongPassword123!@103.172.150.31/website";

export const pool = new pg.Pool({
  connectionString,
  max: 20, // Max clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
