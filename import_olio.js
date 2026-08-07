import * as xlsx from 'xlsx';
import { pool } from './server/ratings/db.js';

async function importOlio() {
  try {
    console.log('Reading Excel file...');
    const workbook = xlsx.readFile('/Users/ajelhenry/Downloads/CT - Olio++.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    // Skip header row
    const rows = data.slice(1);
    
    let inserted = 0;
    for (const row of rows) {
      if (!row || row.length === 0) continue;
      const city = row[0];
      const name = row[1]; // Kitchen
      const brand = row[2]; // Brand
      const location_id = row[3]; // Location Ref ID

      if (!location_id || !brand) continue;

      // Ensure brand is 'olio' for consistency based on user's instruction "brand name : olio"
      const brandStr = 'olio';

      // Insert into managed_stores
      await pool.query(`
        INSERT INTO managed_stores (id, name, brand, city, location_id, status)
        VALUES ($1, $2, $3, $4, $5, 'offline')
        ON CONFLICT (location_id) DO UPDATE SET 
          name = EXCLUDED.name,
          brand = EXCLUDED.brand,
          city = EXCLUDED.city
      `, [location_id, name, brandStr, city, location_id]);

      inserted++;
    }
    console.log(`Successfully imported ${inserted} stores for Olio.`);
  } catch (err) {
    console.error('Error importing:', err);
  } finally {
    process.exit(0);
  }
}

importOlio();
