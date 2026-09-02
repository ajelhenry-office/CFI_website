import 'dotenv/config';
import fs from 'fs';
import xlsx from 'xlsx';
import { pool } from './db.js';
import { checkForNewReports } from './gmailWatcher.js';

// ─── HELPERS ──────────────────────────────────────────────────

function normalizeDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  const parts = str.split(/[-/]/);
  if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4)
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return str.substring(0, 10);
}

function normalizeTime(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString();
  }
  return String(val).trim();
}

// ─── STEP 1: PARSE EXCEL ──────────────────────────────────────

function parseFile(filePath) {
  const wb = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames.find(s => s.trim() === 'Rating & Feedback');
  if (!sheetName) {
    console.log('Sheet "Rating & Feedback" not found in:', filePath);
    return [];
  }
  return xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
}

// ─── STEP 2: SYNC OUTLET MASTER ───────────────────────────────

async function syncOutletMaster(rows) {
  // 1. Fetch all existing restaurant_ids from outlet_master.
  // Uniqueness is now on restaurant_id alone — `kitchen` comes from the
  // reference sheet (not the daily report), so it can no longer be part of
  // the dedupe key.
  console.log('Fetching existing outlets from database...');
  let existingOutlets = [];
  try {
    const res = await pool.query('SELECT restaurant_id FROM outlet_master');
    existingOutlets = res.rows || [];
  } catch (err) {
    console.error('Error fetching existing outlets:', err.message);
  }

  // Create lookup maps/sets for fast checking
  const existingSet = new Set(existingOutlets.map(o => String(o.restaurant_id)));
  const uniqueNewMap = new Map();

  for (const row of rows) {
    if (!row.restaurant_id) continue;
    const restId = String(row.restaurant_id).trim();

    if (existingSet.has(restId) || uniqueNewMap.has(restId)) continue;

    const rawBrandName = row.brand_name ? String(row.brand_name).trim() : null;
    // Krispy Kreme has no real sub-brand distinction — the old North/South split was
    // a data-entry mistake, corrected once for existing rows. Canonicalizing the
    // brand name and sub_brand here (regardless of "Krispy Kreme" vs "Krispy_Kreme"
    // casing in the raw report) means a brand-new Krispy Kreme outlet is never
    // fragmented by casing or left hidden as unmatched (NULL sub_brand) again.
    // This is the ONLY exception to the "unknown stores get nulled out" rule below,
    // and only for brand_name/sub_brand specifically — those are a confidently-known
    // pattern match, not a guess. city/zone/kitchen are NOT reliably knowable for a
    // brand-new outlet (an earlier version of this tried to guess zone from a
    // reference lookup that could never actually work for a new store — removed;
    // guessing isn't the rule here, matching every other unknown store's fields is).
    const isKrispyKreme = rawBrandName && /^krispy[\s_]*kreme$/i.test(rawBrandName);

    if (isKrispyKreme) {
      uniqueNewMap.set(restId, {
        restaurant_id: restId,
        brand_name: 'Krispy Kreme',
        sub_brand: 'Krispy Kreme',
        city: null,
        zone: null,
        kitchen: null,
      });
    } else {
      // A genuinely new/unmatched restaurant_id — nothing about it is
      // verified until the reference sheet is updated to include it, so
      // store nothing but the id. No guessing at brand/city/zone from the
      // daily report (which has messy, inconsistent naming anyway) —
      // sub_brand stays NULL, which is what already keeps it out of every
      // insight and off the website until someone reconciles it against
      // the sheet.
      uniqueNewMap.set(restId, {
        restaurant_id: restId,
        brand_name: null,
        sub_brand: null,
        city: null,
        zone: null,
        kitchen: null,
      });
    }
  }

  const outletsToInsert = Array.from(uniqueNewMap.values());
  if (outletsToInsert.length === 0) {
    console.log('No new outlets to insert.');
    return;
  }

  console.log(`Inserting ${outletsToInsert.length} new unique outlets into outlet_master...`);
  for (const o of outletsToInsert) {
    try {
      await pool.query(`
        INSERT INTO outlet_master (restaurant_id, brand_name, sub_brand, city, zone, kitchen)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (restaurant_id) DO NOTHING
      `, [o.restaurant_id, o.brand_name, o.sub_brand, o.city, o.zone, o.kitchen]);
    } catch (err) {
      console.error(`outlet_master insert error for ID ${o.restaurant_id}:`, err.message);
    }
  }
  console.log('Successfully completed outlet_master sync.');
}

// ─── STEP 3: PUSH ORDER REVIEWS ───────────────────────────────

async function pushOrderReviews(rows) {
  // Deduplicate locally on order_id + restaurant_id + item_name
  const uniqueMap = new Map();
  for (const row of rows) {
    const orderId  = row.order_id    != null ? String(row.order_id).replace(/\.0$/, '').trim() : null;
    const restId   = row.restaurant_id != null ? String(row.restaurant_id).replace(/\.0$/, '').trim() : null;
    const itemName = row.item_name   != null ? String(row.item_name).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() : '';

    if (!orderId || orderId === 'null' || !restId || restId === 'null') continue;

    const key = `${orderId}_${restId}_${itemName}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        order_id: orderId,
        restaurant_id: restId,
        item_name: row.item_name ? String(row.item_name).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim() : 'NO_ITEM',
        date: normalizeDate(row.date),
        ordered_time: normalizeTime(row.ordered_time),
        gmv_total: row.gmv_total != null ? parseFloat(row.gmv_total) : null,
        comments: row.comments ? String(row.comments).trim() : null,
        restaurant_rating: row.restaurant_rating != null ? parseInt(row.restaurant_rating) : null,
        post_status: row.post_status ? String(row.post_status).trim() : null,
        updated_at: new Date().toISOString()
      });
    }
  }

  const localRecords = Array.from(uniqueMap.values());
  console.log(`Unique records after local dedupe: ${localRecords.length}`);

  // Check PostgreSQL for already existing rows
  const allOrderIds = [...new Set(localRecords.map(r => r.order_id))];
  const existingKeys = new Set();
  const FETCH_CHUNK = 200;

  for (let i = 0; i < allOrderIds.length; i += FETCH_CHUNK) {
    const chunkIds = allOrderIds.slice(i, i + FETCH_CHUNK);
    try {
      const res = await pool.query(
        `SELECT order_id, restaurant_id, item_name 
         FROM order_reviews 
         WHERE order_id = ANY($1)`,
        [chunkIds]
      );
      (res.rows || []).forEach(r => existingKeys.add(`${r.order_id}_${r.restaurant_id}_${r.item_name}`));
    } catch (err) {
      console.error('Fetch error from Postgres:', err.message);
    }
  }

  const toInsert = localRecords.filter(r => !existingKeys.has(`${r.order_id}_${r.restaurant_id}_${r.item_name}`));
  console.log(`Skipped ${localRecords.length - toInsert.length} already existing reviews.`);
  console.log(`Inserting ${toInsert.length} new reviews into order_reviews...`);

  if (toInsert.length === 0) return console.log('Nothing new to insert.');

  const CHUNK_SIZE = 1000;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    
    // Build query placeholders like ($1, $2, ... $10), ($11, $12, ... $20)
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const r of chunk) {
      placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(r.order_id, r.restaurant_id, r.item_name, r.date,
        r.ordered_time, r.gmv_total, r.comments, r.restaurant_rating,
        r.post_status, r.updated_at);
    }

    const query = `
      INSERT INTO order_reviews (
        order_id, restaurant_id, item_name, date,
        ordered_time, gmv_total, comments, restaurant_rating,
        post_status, updated_at
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (order_id, restaurant_id, item_name) DO NOTHING
    `;
    
    try {
      await pool.query(query, values);
    } catch (err) {
      console.error(`Bulk insert error at chunk ${i / CHUNK_SIZE + 1}:`, err.message);
    }
  }
  console.log('Successfully completed order_reviews sync.');
}

// ─── MAIN PIPELINE ────────────────────────────────────────────

// Returns { success: true } when this date's check genuinely completed —
// mail found and processed, or confirmed no mail exists for that date, both
// count as success — and { success: false, error } only when it actually
// failed after exhausting retries, carrying the real error message so a
// caller can report *what* broke (e.g. in an alert email), not just that
// something did. This used to swallow a final failure silently and just log
// it, which meant a caller had no way to tell "nothing to find" apart from
// "broke," let alone why.
async function runPipeline(targetDate, attempt = 1, maxRetries = 3) {
  try {
    console.log(`\n[${new Date().toISOString()}] Running pipeline (attempt ${attempt}/${maxRetries})...`);

    const fetchTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('FETCH_TIMEOUT')), 300000)
    );

    const newFiles = await Promise.race([checkForNewReports(targetDate), fetchTimeout]);

    if (newFiles.length === 0) {
      console.log('No new files to process.');
      return { success: true };
    }

    for (const filePath of newFiles) {
      try {
        console.log(`\nProcessing: ${filePath}`);
        const rows = parseFile(filePath);
        if (rows.length === 0) continue;

        console.log(`Total rows in sheet: ${rows.length}`);

        // Step 1: Add any new restaurants to outlet_master
        await syncOutletMaster(rows);

        // Step 2: Push order data to order_reviews
        await pushOrderReviews(rows);
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted processed file: ${filePath}`);
        }
      }
    }
    return { success: true };
  } catch (error) {
    console.error(`Pipeline error (attempt ${attempt}):`, error.message);
    if (attempt < maxRetries) {
      return await runPipeline(targetDate, attempt + 1, maxRetries);
    } else {
      console.error(`Pipeline failed after ${maxRetries} attempts.`);
      return { success: false, error: error.message };
    }
  }
}

// ─── SCHEDULER: 12:00 PM and 12:00 AM ─────────────────────────

function msUntilNext(hour) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function startScheduler() {
  console.log('Pipeline scheduler started. Runs at 12:00 AM and 12:00 PM daily.');

  function scheduleNext(hour) {
    const ms = msUntilNext(hour);
    const nextRun = new Date(Date.now() + ms);
    console.log(`Next run at ${hour === 0 ? '12:00 AM' : '12:00 PM'}: ${nextRun.toLocaleString()}`);
    setTimeout(async () => {
      await runPipeline();
      scheduleNext(hour); // reschedule for next day
    }, ms);
  }

  scheduleNext(0);  // 12:00 AM
  scheduleNext(12); // 12:00 PM
}

export default { runPipeline };

// ─── ENTRY POINT ──────────────────────────────────────────────

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  if (args.includes('--schedule')) {
    startScheduler();
  } else if (args.length > 0) {
    runPipeline(args[0]).then(() => { process.exit(0); });
  } else {
    runPipeline().then(() => { process.exit(0); });
  }
}
