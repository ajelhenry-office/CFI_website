import { pool } from "./server/ratings/db.js";

async function alterTable() {
  try {
    const query = `
      ALTER TABLE zomato_timing_queue 
      ADD COLUMN IF NOT EXISTS batch_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
    `;
    await pool.query(query);
    console.log("Successfully altered zomato_timing_queue table.");
  } catch (err) {
    console.error("Error altering table:", err);
  } finally {
    pool.end();
  }
}

alterTable();
