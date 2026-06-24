import 'dotenv/config';
import fs from 'fs';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { checkForNewReports } from './gmailWatcher.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── HELPERS ──────────────────────────────────────────────────

function normalizeDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
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
  // Collect unique restaurants from this file
  const uniqueMap = new Map();
  for (const row of rows) {
    if (!row.restaurant_id) continue;
    const key = `${String(row.restaurant_id).replace(/\.0$/, '').trim()}_${row.area || ''}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        restaurant_id:  String(row.restaurant_id).replace(/\.0$/, '').trim(),
        brand_name:     row.brand_name      || null,
        business_entity:row.business_entity || null,
        city:           row.city            || null,
        area:           row.area            || null,
        zone:           row.Zone || row.zone || null,
      });
    }
  }

  const fromFile = Array.from(uniqueMap.values());
  const fileRestaurantIds = [...new Set(fromFile.map(r => r.restaurant_id))];

  // Check which restaurant_ids already exist in outlet_master
  const { data: existing } = await supabase
    .from('outlet_master')
    .select('restaurant_id, area')
    .in('restaurant_id', fileRestaurantIds);

  const existingKeys = new Set((existing || []).map(r => `${r.restaurant_id}_${r.area || ''}`));
  const newRestaurants = fromFile.filter(r => !existingKeys.has(`${r.restaurant_id}_${r.area || ''}`));

  if (newRestaurants.length === 0) {
    console.log('No new restaurants to add to outlet_master.');
    return;
  }

  console.log(`Adding ${newRestaurants.length} new restaurants to outlet_master...`);
  const CHUNK = 500;
  for (let i = 0; i < newRestaurants.length; i += CHUNK) {
    const { error } = await supabase.from('outlet_master').insert(newRestaurants.slice(i, i + CHUNK));
    if (error) console.error(`outlet_master insert error (batch ${i}):`, error.message);
    else console.log(`Inserted outlet_master rows ${i + 1}–${i + Math.min(CHUNK, newRestaurants.length - i)}`);
  }
}

// ─── STEP 3: PUSH ORDER REVIEWS ───────────────────────────────

async function pushOrderReviews(rows) {
  // Deduplicate locally on order_id + restaurant_id + item_name
  const uniqueMap = new Map();
  for (const row of rows) {
    const orderId  = row.order_id    != null ? String(row.order_id).replace(/\.0$/, '').trim() : null;
    const restId   = row.restaurant_id != null ? String(row.restaurant_id).replace(/\.0$/, '').trim() : null;
    const itemName = row.item_name   != null ? String(row.item_name).replace(/\u00A0/g, ' ').trim() : null;
    if (!orderId || !restId || !itemName) continue;

    const key = `${orderId}_${restId}_${itemName}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        order_id:          orderId,
        restaurant_id:     restId,
        date:              normalizeDate(row.date),
        ordered_time:      normalizeTime(row.ordered_time),
        gmv_total:         row.gmv_total         ?? null,
        item_name:         itemName,
        comments:          row.comments          ?? null,
        restaurant_rating: row.restaurant_rating ?? null,
        post_status:       row.post_status       ?? null,
      });
    }
  }

  const localRecords = Array.from(uniqueMap.values());
  console.log(`Unique records after local dedupe: ${localRecords.length}`);

  // Check Supabase for already existing rows
  const allOrderIds = [...new Set(localRecords.map(r => r.order_id))];
  const existingKeys = new Set();
  const FETCH_CHUNK = 200;

  for (let i = 0; i < allOrderIds.length; i += FETCH_CHUNK) {
    const chunk = allOrderIds.slice(i, i + FETCH_CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('order_reviews')
        .select('order_id, restaurant_id, item_name')
        .in('order_id', chunk)
        .range(from, from + 999);
      if (error) { console.error('Fetch error:', error.message); break; }
      (data || []).forEach(r => existingKeys.add(`${r.order_id}_${r.restaurant_id}_${r.item_name}`));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
  }

  const toInsert = localRecords.filter(r => !existingKeys.has(`${r.order_id}_${r.restaurant_id}_${r.item_name}`));
  console.log(`Skipped ${localRecords.length - toInsert.length} already existing rows.`);
  console.log(`Inserting ${toInsert.length} new rows into order_reviews...`);

  if (toInsert.length === 0) return console.log('Nothing new to insert.');

  const INSERT_CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const { error } = await supabase.from('order_reviews').insert(toInsert.slice(i, i + INSERT_CHUNK));
    if (error) console.error(`Insert error (batch ${i}):`, error.message);
    else console.log(`Inserted rows ${i + 1}–${i + Math.min(INSERT_CHUNK, toInsert.length - i)}`);
  }
}

// ─── MAIN PIPELINE ────────────────────────────────────────────

async function runPipeline(targetDate, attempt = 1, maxRetries = 3) {
  try {
    console.log(`\n[${new Date().toISOString()}] Running pipeline (attempt ${attempt}/${maxRetries})...`);

    const fetchTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('FETCH_TIMEOUT')), 300000)
    );

    const newFiles = await Promise.race([checkForNewReports(targetDate), fetchTimeout]);

    if (newFiles.length === 0) {
      console.log('No new files to process.');
      return;
    }

    for (const filePath of newFiles) {
      console.log(`\nProcessing: ${filePath}`);
      const rows = parseFile(filePath);
      if (rows.length === 0) { fs.unlinkSync(filePath); continue; }

      console.log(`Total rows in sheet: ${rows.length}`);

      // Step 1: Add any new restaurants to outlet_master
      await syncOutletMaster(rows);

      // Step 2: Push order data to order_reviews
      await pushOrderReviews(rows);

      fs.unlinkSync(filePath);
      console.log(`Deleted processed file: ${filePath}`);
    }
  } catch (error) {
    console.error(`Pipeline error (attempt ${attempt}):`, error.message);
    if (attempt < maxRetries) {
      await runPipeline(targetDate, attempt + 1, maxRetries);
    } else {
      console.error(`Pipeline failed after ${maxRetries} attempts.`);
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
    runPipeline(args[0]);
  } else {
    runPipeline();
  }
}
