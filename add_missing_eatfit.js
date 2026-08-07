import { pool } from './server/ratings/db.js';

async function addMissingStore() {
  try {
    const kitchen = 'BOM_Lower Parel Junos';
    const city = 'Mumbai'; 
    const brand = 'eatfit';
    const location_id_str = 'unmapped_bom_lower_parel_junos';

    await pool.query(`
      INSERT INTO managed_stores (id, name, brand, city, zone, location_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'offline')
      ON CONFLICT (location_id) DO UPDATE SET 
        name = EXCLUDED.name,
        brand = EXCLUDED.brand,
        city = EXCLUDED.city,
        zone = EXCLUDED.zone
    `, [location_id_str, kitchen, brand, city, null, location_id_str]);

    console.log(`Successfully added missing store: ${kitchen}`);
  } catch (err) {
    console.error('Error adding store:', err);
  } finally {
    process.exit(0);
  }
}

addMissingStore();
