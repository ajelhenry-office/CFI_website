import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export { supabase };

function normalizeDate(d) {
  if (!d) return null;
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof d === 'string') {
    let cleanDate = d.split('T')[0].trim();
    
    // Catch DD-MM-YYYY or DD/MM/YYYY and flip to YYYY-MM-DD
    const parts = cleanDate.split(/[-/]/);
    if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    
    if (cleanDate.match(/^\d{4}-\d{2}-\d{2}/)) return cleanDate.substring(0, 10);
    
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed)) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return cleanDate;
  }
  return String(d).trim();
}

function generateDedupeKey(date, orderId, restId, itemName) {
  const safeDate = normalizeDate(date) || 'nodate';
  const safeOrderId = orderId == null ? 'null' : String(orderId).replace(/\.0$/, '').trim();
  const safeRestId = restId == null ? 'null' : String(restId).replace(/\.0$/, '').trim();
  const safeItem = itemName == null ? '' : String(itemName).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return `${safeDate}_${safeOrderId}_${safeRestId}_${safeItem}`;
}

async function insertRows(rows) {
  if (!rows || rows.length === 0) {
    return console.log("No valid rows found to insert.");
  }

  console.log(`Checking ${rows.length} rows against Supabase for exact duplicates...`);

  // 1. Format rows and drop empty/garbage Excel rows instantly
  const formattedRows = rows
    .map(row => {
      const orderId = row.order_id != null ? String(row.order_id).replace(/\.0$/, '').trim() : null;
      return {
        ...row,
        order_id: orderId,
        date: normalizeDate(row.date),
        ordered_time: row.ordered_time instanceof Date ? row.ordered_time.toISOString() : row.ordered_time
      };
    })
    .filter(row => row.order_id && row.order_id !== 'null' && row.order_id !== '');

  // Find unique Order IDs in this sheet
  const uniqueOrderIds = [...new Set(formattedRows.map(r => r.order_id))];
  console.log(`Querying Supabase for ${uniqueOrderIds.length} unique Order IDs...`);

  // 2. Fetch existing records by Order ID (in small chunks to prevent network timeouts)
  let existingData = [];
  const FETCH_CHUNK_SIZE = 50; // Reduced to 50 to keep query sizes highly optimized
  
  for (let i = 0; i < uniqueOrderIds.length; i += FETCH_CHUNK_SIZE) {
    const chunkIds = uniqueOrderIds.slice(i, i + FETCH_CHUNK_SIZE);
    
    let fetchFrom = 0;
    const fetchStep = 1000;
    let keepFetching = true;

    // Paginates through Supabase to guarantee we fetch EVERY existing row (bypassing the 1000 limit)
    while (keepFetching) {
      const { data: chunk, error: fetchError } = await supabase
        .from('swiggy_ratings_feedback')
        .select('id, date, order_id, restaurant_id, item_name, comments, restaurant_rating, post_status')
        .in('order_id', chunkIds)
        .order('id', { ascending: true }) // Crucial for reliable pagination
        .range(fetchFrom, fetchFrom + fetchStep - 1);
        
      if (fetchError) {
        console.error("Error fetching existing data from Supabase:", fetchError.message);
        break;
      }
      
      existingData = existingData.concat(chunk || []);
      
      if (!chunk || chunk.length < fetchStep) {
        keepFetching = false;
      } else {
        fetchFrom += fetchStep;
      }
    }
  }

  // Create a fast-lookup Map of existing records (Key: YYYY-MM-DD_ORDERID -> DB Row)
  const existingMap = new Map();
  (existingData || []).forEach(record => {
    existingMap.set(generateDedupeKey(record.date, record.order_id, record.restaurant_id, record.item_name), record);
  });

  const newRowsToInsert = [];
  const rowsToUpdate = [];

  // 3. Separate rows into "Completely New", "Needs Update", and "Unchanged Duplicates"
  formattedRows.forEach(row => {
    const key = generateDedupeKey(row.date, row.order_id, row.restaurant_id, row.item_name);
    const existingDbRow = existingMap.get(key);

    if (!existingDbRow) {
      // Order is completely missing from DB, queue it for Insert
      newRowsToInsert.push(row);
    } else {
      // Order exists! Let's check if there is delayed feedback to update.
      const hasNewComments = row.comments != null && row.comments !== existingDbRow.comments;
      const hasNewRating = row.restaurant_rating != null && row.restaurant_rating !== existingDbRow.restaurant_rating;
      const hasNewStatus = row.post_status != null && row.post_status !== existingDbRow.post_status;

      if (hasNewComments || hasNewRating || hasNewStatus) {
        // We attach the existing DB 'id' so Supabase knows exactly which row to update
        rowsToUpdate.push({ ...row, id: existingDbRow.id });
      }
    }
  });
  
  const skipped = formattedRows.length - newRowsToInsert.length - rowsToUpdate.length;
  console.log(`Skipped ${skipped} completely unchanged duplicate rows.`);

  if (newRowsToInsert.length === 0 && rowsToUpdate.length === 0) {
    return console.log("No new inserts or delayed feedback updates needed.");
  }

  // 4. Insert genuinely new orders
  if (newRowsToInsert.length > 0) {
    console.log(`Attempting to insert ${newRowsToInsert.length} brand new rows...`);
    
    const CHUNK_SIZE = 1000; // Reduced from 5000 to prevent Payload Too Large API errors
    for (let i = 0; i < newRowsToInsert.length; i += CHUNK_SIZE) {
      const chunk = newRowsToInsert.slice(i, i + CHUNK_SIZE);
      const { error: insertError } = await supabase.from('swiggy_ratings_feedback').insert(chunk);
      if (insertError) console.error(`Insert Error (Batch ${i}):`, insertError.message);
    }
    console.log("Successfully inserted new rows in batches!");
  }

  // 5. Update older orders that received delayed feedback
  if (rowsToUpdate.length > 0) {
    console.log(`Attempting to update ${rowsToUpdate.length} existing rows with new delayed feedback...`);
    
    const CHUNK_SIZE = 1000; // Reduced from 5000 for safe upserting
    for (let i = 0; i < rowsToUpdate.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpdate.slice(i, i + CHUNK_SIZE);
      // Because we attached the primary key 'id' to the objects, 'upsert' safely updates the existing records!
      const { error: updateError } = await supabase.from('swiggy_ratings_feedback').upsert(chunk);
      if (updateError) console.error(`Update Error (Batch ${i}):`, updateError.message);
    }
    console.log("Successfully updated existing rows with fresh feedback in batches!");
  }
}

export { insertRows };