import { pool } from "./server/ratings/db.js";

async function createTable() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS zomato_timing_queue (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(255) NOT NULL,
        brand VARCHAR(255),
        payload JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(query);
    console.log("Created zomato_timing_queue table successfully.");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    pool.end();
  }
}

createTable();
