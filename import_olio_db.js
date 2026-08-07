import fs from 'fs';
import { pool } from './server/ratings/db.js';

async function importOlio() {
  try {
    const rawData = fs.readFileSync('olio_stores.json', 'utf8');
    const data = JSON.parse(rawData);

    let inserted = 0;
    for (const row of data) {
      const city = row['City'];
      const name = row['Kitchen'];
      const brandStr = 'olio'; // Enforce brand name as 'olio' per user instructions
      const location_id = row['Location Ref ID'];

      if (!location_id || location_id === 'nan') continue;

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
    console.log(`Successfully imported ${inserted} stores for Olio into DB.`);
  } catch (err) {
    console.error('Error importing:', err);
  } finally {
    process.exit(0);
  }
}

importOlio();
