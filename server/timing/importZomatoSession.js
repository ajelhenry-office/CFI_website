// Pushes the cookies saved by zomato_login.py into timing_platform_sessions, then
// confirms they work. zomato_login.py runs this automatically after a login.
//
//   node server/timing/importZomatoSession.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../ratings/db.js";
import { getSession, saveSession, recordCheck } from "./sessionStore.js";
import { getZomatoOutlets, getZomatoUser, ZOMATO_ACCOUNT } from "./zomatoSession.js";
import { resolveAlert } from "../alerts/alertService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, "sessions", "zomato_cookies.json");

try {
  const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8")).filter(c => c.domain.includes("zomato.com"));
  const previous = await getSession("zomato", ZOMATO_ACCOUNT);
  await saveSession("zomato", ZOMATO_ACCOUNT, { cookies });

  // The browser login offers every Google account on the machine — refuse a session
  // for the wrong one (it once picked an @eatfit.in account that can't see the brands).
  const user = await getZomatoUser();
  const expected = (process.env.ZOMATO_TIMING_EMAIL || "").toLowerCase();
  if (!user || (expected && user.email?.toLowerCase() !== expected)) {
    if (previous) await saveSession("zomato", ZOMATO_ACCOUNT, previous);
    throw new Error(`logged in as ${user?.email || "nobody"}, expected ${expected} — log in again and pick the right Google account (previous session kept)`);
  }

  const outlets = await getZomatoOutlets();
  await recordCheck("zomato", ZOMATO_ACCOUNT, { status: "connected", outletCount: outlets.length });
  await resolveAlert("TIMING_SESSION:zomato:main", "The Zomato timing session was re-imported and is working again.", ["super_admin"]);
  console.log(`Zomato session imported for ${user.email} — connected, ${outlets.length} outlets visible.`);
} catch (err) {
  console.error(`Zomato session import FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
