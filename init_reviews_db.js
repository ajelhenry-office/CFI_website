import { pool } from './server/ratings/db.js';
import fs from 'fs';
import { ACCOUNT_NAME, BRAND, LOCATIONS } from './server/reviews/locations.seed.js';

async function run() {
  try {
    const sql = fs.readFileSync('server/reviews/schema.sql', 'utf8');
    await pool.query(sql);
    console.log('Reviews tables created successfully');

    for (const [storeName, locationPath] of Object.entries(LOCATIONS)) {
      await pool.query(
        `INSERT INTO review_locations (store_name, brand, google_account, google_location_path)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (google_account, google_location_path) DO UPDATE SET store_name = EXCLUDED.store_name`,
        [storeName, BRAND, ACCOUNT_NAME, locationPath]
      );
    }
    console.log(`Seeded ${Object.keys(LOCATIONS).length} ${BRAND} locations`);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
