import { pool } from "../ratings/db.js";
import { spawnSync } from "child_process";
import { sendEmail } from "../auth/emailService.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "../../public/zomato_store_time/update_advanced_timings.py");

export async function processTimingQueue() {
  try {
    // 1. Get next pending task (using FOR UPDATE SKIP LOCKED to prevent concurrent processing if we ever scale)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const res = await client.query(`
        SELECT id, store_id, brand, payload 
        FROM zomato_timing_queue 
        WHERE status = 'pending' 
        ORDER BY id ASC 
        FOR UPDATE SKIP LOCKED 
        LIMIT 1
      `);
      
      if (res.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return; // No tasks
      }

      const task = res.rows[0];
      console.log(`[TIMING WORKER] Processing task ${task.id} for ${task.store_id} (${task.brand})`);
      
      await client.query(`UPDATE zomato_timing_queue SET status = 'processing' WHERE id = $1`, [task.id]);
      await client.query('COMMIT');
      
      // 2. Execute Python Script
      const payloadStr = JSON.stringify({
        store_id: task.store_id,
        brand: task.brand,
        timings: task.payload
      });

      console.log(`[TIMING WORKER] Spawning python script for ${task.store_id}...`);
      
      const pythonProcess = spawnSync('python3', [SCRIPT_PATH, payloadStr], {
        encoding: 'utf-8',
        timeout: 2 * 60 * 1000 // 2 minute timeout
      });

      let status = 'success';
      let errorMessage = '';

      if (pythonProcess.error) {
        status = 'failed';
        errorMessage = pythonProcess.error.message;
      } else if (pythonProcess.status !== 0) {
        status = 'failed';
        errorMessage = pythonProcess.stderr || pythonProcess.stdout || `Exited with code ${pythonProcess.status}`;
      } else {
        // Assume success if code 0, but check output just in case
        const output = pythonProcess.stdout;
        if (output.includes('SESSION_EXPIRED') || output.includes('LOGIN_FAILED')) {
          status = 'failed';
          errorMessage = 'SESSION_EXPIRED: The automation bot was logged out.';
        }
      }

      console.log(`[TIMING WORKER] Task ${task.id} finished with status: ${status}. Message: ${errorMessage.slice(0, 100)}`);

      // 3. Update DB
      await client.query(`UPDATE zomato_timing_queue SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`, [status, errorMessage, task.id]);
      
      if (status === 'success') {
        await client.query(`
          INSERT INTO zomato_timing_cache (store_id, timings, updated_at) 
          VALUES ($1, $2, NOW()) 
          ON CONFLICT (store_id) DO UPDATE SET timings = EXCLUDED.timings, updated_at = NOW()
        `, [task.store_id, JSON.stringify(task.payload)]);
      }

      client.release();

      // 4. Send Email on Session Expiry
      if (status === 'failed' && errorMessage.includes('SESSION_EXPIRED')) {
        console.log("[TIMING WORKER] Session expired! Sending SOS Email...");
        await sendEmail(
          process.env.ADMIN_EMAIL || 'ajelhenry@gmail.com',
          '🚨 URGENT: Zomato Automation Bot Session Expired',
          `The Zomato Timing Automation bot has crashed because the session expired.\n\nFailed Store: ${task.brand} (${task.store_id})\nError: ${errorMessage}\n\nPlease re-authenticate the bot.`
        );
      }

    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }
  } catch (err) {
    console.error("[TIMING WORKER ERROR]", err);
  }
}

export function startTimingWorker() {
  console.log("[TIMING WORKER] Started.");
  // Poll every 10 seconds
  setInterval(processTimingQueue, 10 * 1000);
}
