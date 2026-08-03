import { pool } from "./server/ratings/db.js";

async function createTable() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS zomato_timing_cache (
        store_id VARCHAR(255) PRIMARY KEY,
        timings JSONB,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    await pool.query(query);
    console.log("Successfully created zomato_timing_cache table.");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    pool.end();
  }
}

createTable();
