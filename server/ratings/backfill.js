import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { pool } from './db.js';
import { getLastProcessedMailDate } from './gmailWatcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function getISTDateString(offsetDays = 0) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const t = Date.now() + IST_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Cross-checks two independent signals for "what's the last date we actually
// have," and starts from whichever is earlier — reprocessing an extra day or
// two is harmless (the pipeline dedupes on order_id+restaurant_id+item_name),
// but skipping a day because one signal was stale would not be.
async function computeStartDate() {
  const dbRes = await pool.query('SELECT MAX(date) AS max_date FROM order_reviews');
  const maxReportDate = dbRes.rows[0]?.max_date
    ? new Date(dbRes.rows[0].max_date).toISOString().split('T')[0]
    : null;

  const lastMailDate = await getLastProcessedMailDate();

  console.log(`Latest report-date (internal date column) in DB: ${maxReportDate || '(none)'}`);
  console.log(`Latest swiggy-processed mail date: ${lastMailDate || '(none)'}`);

  const candidates = [maxReportDate, lastMailDate].filter(Boolean);
  if (candidates.length === 0) {
    throw new Error('No existing data found in DB or Gmail labels — cannot determine a safe backfill start date.');
  }

  const earliest = candidates.sort()[0];
  if (maxReportDate !== lastMailDate) {
    console.log(`Signals disagree — starting from the earlier one (${earliest}) to be safe.`);
  }
  return addDays(earliest, 1);
}

async function runBackfill() {
  const startDate = await computeStartDate();
  const endDate = getISTDateString(0); // today, IST

  if (startDate > endDate) {
    console.log(`Nothing to backfill — already current through ${addDays(startDate, -1)}.`);
    return;
  }

  console.log(`\nBackfilling from ${startDate} through ${endDate}...`);
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    console.log(`\n=== Running pipeline for ${d} ===`);
    try {
      execSync(`node run_pipeline.js ${d}`, { stdio: 'inherit', cwd: __dirname });
    } catch (err) {
      console.error(`Error running pipeline for ${d}:`, err.message);
    }
  }
  console.log('\nBackfill complete.');
}

runBackfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[BACKFILL] Fatal error:', err.message);
    process.exit(1);
  });
