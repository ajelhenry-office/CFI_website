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

// ─── ZONE DETAILS REFERENCE MAPPING ───────────────────────────

let zoneMap = null;

async function loadZoneMap() {
  if (zoneMap) return zoneMap;
  zoneMap = new Map();

  const paths = [
    new URL('../curefoods_tables_with_zone_mumbai.xlsx', import.meta.url).pathname,
    '/Users/ajelhenry/Downloads/curefoods_tables_zone_details_mumbai.xlsx',
    '/Users/ajelhenry/Downloads/curefoods_tables_with_zone_mumbai.xlsx',
    new URL('downloads/curefoods_tables_zone_details_mumbai.xlsx', import.meta.url).pathname,
    new URL('downloads/curefoods_tables_with_zone_mumbai.xlsx', import.meta.url).pathname
  ];

  let filePath = null;
  for (const p of paths) {
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    console.log('Warning: Zone details reference file not found in Downloads. Zone mapping will be skipped.');
    return zoneMap;
  }

  console.log(`Loading zone details from reference file: ${filePath}`);
  try {
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames.find(name => 
      name.toLowerCase().includes('zone') || 
      name.toLowerCase().includes('outlet_master')
    ) || wb.SheetNames[0];

    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

    const getColVal = (row, keyStr) => {
      const foundKey = Object.keys(row).find(k => k && k.toLowerCase().replace(/_/g, ' ').includes(keyStr.toLowerCase().replace(/_/g, ' ')));
      return foundKey ? String(row[foundKey]).trim() : null;
    };

    for (const row of rows) {
      const city = getColVal(row, 'city');
      const area = getColVal(row, 'area');
      const zone = getColVal(row, 'zone');
      if (city && area && zone) {
        const key = `${city.toLowerCase()}_${area.toLowerCase()}`;
        zoneMap.set(key, zone);
      }
    }
    console.log(`Loaded ${zoneMap.size} zone mappings successfully from sheet "${sheetName}".`);
  } catch (err) {
    console.error('Failed to parse zone details reference file:', err.message);
  }

  return zoneMap;
}

// ─── STEP 2: SYNC OUTLET MASTER ───────────────────────────────

async function syncOutletMaster(rows) {
  // Load the zone mappings from the reference file
  const zMap = await loadZoneMap();

  // 1. Fetch all existing restaurant_id + area combinations from outlet_master along with city and zone
  console.log('Fetching existing outlets from database...');
  let existingOutlets = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('outlet_master')
      .select('restaurant_id, area, city, zone')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) {
      console.error('Error fetching existing outlets:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    existingOutlets = existingOutlets.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  // Set of existing keys: "restaurant_id_area"
  const existingSet = new Set(
    existingOutlets.map(o => `${String(o.restaurant_id).trim()}_${String(o.area || '').trim()}`)
  );

  // Build city -> zone map from reference file (zMap) and existing DB records
  const dbCityToZone = new Map();
  
  // First, populate from reference zMap keys (format is "city_area")
  for (const [key, zone] of zMap.entries()) {
    const cityPart = key.split('_')[0];
    if (cityPart && zone) {
      dbCityToZone.set(cityPart.toLowerCase(), String(zone).trim());
    }
  }

  // Next, populate/override from existing database records (which contain validated zone data)
  for (const o of existingOutlets) {
    if (o.city && o.zone) {
      const cleanCity = String(o.city).trim().toLowerCase();
      const cleanZone = String(o.zone).trim();
      if (cleanCity && cleanZone) {
        dbCityToZone.set(cleanCity, cleanZone);
      }
    }
  }

  // 2. Identify new unique outlets from the parsed Excel sheet
  const uniqueNewMap = new Map();
  for (const row of rows) {
    if (!row.restaurant_id) continue;
    const restId = String(row.restaurant_id).replace(/\.0$/, '').trim();
    const area = row.area ? String(row.area).trim() : '';
    const key = `${restId}_${area}`;

    if (!existingSet.has(key) && !uniqueNewMap.has(key)) {
      // Map the zone based on city and area from our reference file
      const city = row.city ? String(row.city).trim() : '';
      const zoneKey = `${city.toLowerCase()}_${area.toLowerCase()}`;
      
      let mappedZone = zMap.get(zoneKey) || row.zone || row.Zone || null;
      
      // Fallback 1: Look up zone of similar city from database / reference map
      if (!mappedZone && city) {
        mappedZone = dbCityToZone.get(city.toLowerCase()) || null;
      }
      
      // Fallback 2: Look at other rows in the incoming Excel sheet for a zone
      if (!mappedZone && city) {
        for (const r of rows) {
          if (r.city && String(r.city).trim().toLowerCase() === city.toLowerCase()) {
            const z = r.zone || r.Zone || null;
            if (z) {
              mappedZone = String(z).trim();
              break;
            }
          }
        }
      }

      uniqueNewMap.set(key, {
        restaurant_id:  restId,
        brand_name:     row.brand_name      || null,
        business_entity:row.business_entity || null,
        city:           row.city            || null,
        area:           row.area            || null,
        zone:           mappedZone,
      });
    }
  }

  const outletsToInsert = Array.from(uniqueNewMap.values());
  if (outletsToInsert.length === 0) {
    console.log('No new outlets to insert.');
    return;
  }

  console.log(`Inserting ${outletsToInsert.length} new unique outlets into outlet_master...`);
  const CHUNK = 500;
  for (let i = 0; i < outletsToInsert.length; i += CHUNK) {
    const chunk = outletsToInsert.slice(i, i + CHUNK);
    const { error } = await supabase.from('outlet_master').insert(chunk);
    if (error) console.error(`outlet_master insert error (batch ${i}):`, error.message);
    else console.log(`Inserted outlet_master rows ${i + 1}–${i + chunk.length}`);
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
  console.log(`Skipped ${localRecords.length - toInsert.length} already existing reviews.`);
  console.log(`Inserting ${toInsert.length} new reviews into order_reviews...`);

  if (toInsert.length === 0) return console.log('Nothing new to insert.');

  const INSERT_CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { error } = await supabase.from('order_reviews').insert(chunk);
    if (error) console.error(`Insert error (batch ${i}):`, error.message);
    else console.log(`Inserted rows ${i + 1}–${i + chunk.length}`);
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
