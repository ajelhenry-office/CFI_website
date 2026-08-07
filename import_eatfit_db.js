import fs from 'fs';
import { pool } from './server/ratings/db.js';

async function importEatfit() {
  try {
    const rawData = fs.readFileSync('eatfit_stores_parsed.json', 'utf8');
    const data = JSON.parse(rawData);

    // Delete existing eatfit stores
    await pool.query("DELETE FROM managed_stores WHERE brand = 'eatfit'");

    let inserted = 0;
    for (const row of data) {
      const city = row['City'];
      const kitchen = row['Kitchen'];
      const originalBrand = row['Brand']; // "Eatfit"
      const brandStr = 'eatfit'; // Grouping for the backend
      const location_id = row['Location Ref ID'];

      const name = `${city} ${kitchen}`;
      const zone = originalBrand;

      await pool.query(`
        INSERT INTO managed_stores (id, name, brand, city, zone, location_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'offline')
        ON CONFLICT (location_id) DO UPDATE SET 
          name = EXCLUDED.name,
          brand = EXCLUDED.brand,
          city = EXCLUDED.city,
          zone = EXCLUDED.zone
      `, [location_id, name, brandStr, city, zone, location_id]);

      inserted++;
    }
    console.log(`Successfully imported ${inserted} stores for Eatfit into DB.`);
  } catch (err) {
    console.error('Error importing:', err);
  } finally {
    process.exit(0);
  }
}

importEatfit();
