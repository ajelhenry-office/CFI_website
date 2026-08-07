import fs from 'fs';
import { pool } from './server/ratings/db.js';

async function importEatfit() {
  try {
    const rawData = fs.readFileSync('eatfit_stores_parsed.json', 'utf8');
    const data = JSON.parse(rawData);

    // Alter column size to safely fit long comma-separated string
    await pool.query("ALTER TABLE managed_stores ALTER COLUMN location_id TYPE VARCHAR(2000)");

    // Delete existing eatfit stores
    await pool.query("DELETE FROM managed_stores WHERE brand = 'eatfit'");

    // Group by physical kitchen name
    const groupedStores = {};

    for (const row of data) {
      const city = row['City'];
      const kitchen = row['Kitchen'];
      const originalBrand = row['Brand']; // "Eatfit"
      const brandStr = 'eatfit';
      const location_id = row['Location Ref ID'];

      const name = kitchen; // Just kitchen without city prefix, since we fixed that
      const zone = null; // No fake zones!

      // Grouping key
      const key = `${city}_${kitchen}`;

      if (!groupedStores[key]) {
        groupedStores[key] = {
          name,
          brand: brandStr,
          city,
          zone,
          location_ids: new Set()
        };
      }
      
      groupedStores[key].location_ids.add(location_id);
    }

    let inserted = 0;
    for (const key of Object.keys(groupedStores)) {
      const store = groupedStores[key];
      // Convert Set of ids into comma-separated string
      const location_id_str = Array.from(store.location_ids).join(',');

      await pool.query(`
        INSERT INTO managed_stores (id, name, brand, city, zone, location_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'offline')
        ON CONFLICT (location_id) DO UPDATE SET 
          name = EXCLUDED.name,
          brand = EXCLUDED.brand,
          city = EXCLUDED.city,
          zone = EXCLUDED.zone
      `, [location_id_str, store.name, store.brand, store.city, store.zone, location_id_str]);

      inserted++;
    }
    console.log(`Successfully imported ${inserted} physical kitchen stores for Eatfit into DB.`);
  } catch (err) {
    console.error('Error importing:', err);
  } finally {
    process.exit(0);
  }
}

importEatfit();
