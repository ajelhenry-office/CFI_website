import fs from 'fs';
import { pool } from './server/ratings/db.js';

async function importOlio() {
  try {
    const rawData = fs.readFileSync('olio_stores.json', 'utf8');
    const data = JSON.parse(rawData);

    let updated = 0;
    for (const row of data) {
      const city = row['City'];
      const kitchen = row['Kitchen'];
      const originalBrand = row['Brand'];
      const brandStr = 'olio';
      const location_id = row['Location Ref ID'];

      if (!location_id || location_id === 'nan') continue;

      const name = `${city} ${kitchen}`;
      const zone = originalBrand;

      await pool.query(`
        UPDATE managed_stores 
        SET name = $1, zone = $2
        WHERE location_id = $3 AND brand = 'olio'
      `, [name, zone, location_id]);

      updated++;
    }
    console.log(`Successfully updated ${updated} stores for Olio.`);
  } catch (err) {
    console.error('Error importing:', err);
  } finally {
    process.exit(0);
  }
}

importOlio();
