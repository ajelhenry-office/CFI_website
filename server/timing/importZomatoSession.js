// Pushes the cookies saved by zomato_login.py into timing_platform_sessions, then
// confirms they work. zomato_login.py runs this automatically after a login.
//
//   node server/timing/importZomatoSession.js            (refuses a different Zomato user)
//   node server/timing/importZomatoSession.js --replace  (deliberately switch accounts)
//
// Zomato keeps separate users per sign-in method that can share one email: "Continue
// with Email" (one-time code) for santhosh.s@curefoods.in is user 42732360 (857 outlets,
// confirmed from the 2026-11-18 login capture), while signing in through Google lands on
// a second user with the same email and only 140 outlets. So the saved session pins its
// Zomato user ID, and a login as any other user is refused.

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
  // The user the current session belongs to: pinned on the session, or asked of Zomato
  // while the old cookies are still the saved ones (null if they've already died).
  const pinnedId = previous?.userId ?? (previous ? (await getZomatoUser().catch(() => null))?.id : null);
  await saveSession("zomato", ZOMATO_ACCOUNT, { cookies });

  const restore = async reason => {
    if (previous) await saveSession("zomato", ZOMATO_ACCOUNT, previous);
    throw new Error(`${reason} (previous session kept)`);
  };

  // The browser login offers every Google account on the machine — refuse a session
  // for the wrong one (it once picked an @eatfit.in account that can't see the brands).
  const user = await getZomatoUser();
  const expected = (process.env.ZOMATO_TIMING_EMAIL || "").toLowerCase();
  if (!user || (expected && user.email?.toLowerCase() !== expected)) {
    await restore(`logged in as ${user?.email || "nobody"}, expected ${expected} — log in again and pick the right Google account`);
  }

  const outlets = await getZomatoOutlets();
  if (pinnedId && String(user.id) !== String(pinnedId) && !process.argv.includes("--replace")) {
    await restore(`this is Zomato user ${user.id} "${user.name}" with ${outlets.length} outlets, not the saved user ${pinnedId} — same email, different Zomato account. Log in with "Continue with Email" (one-time code), not "Sign in with Google". To switch accounts on purpose, re-run with --replace`);
  }
  await saveSession("zomato", ZOMATO_ACCOUNT, { cookies, userId: user.id });
  await recordCheck("zomato", ZOMATO_ACCOUNT, { status: "connected", outletCount: outlets.length });
  await resolveAlert("TIMING_SESSION:zomato:main", "The Zomato timing session was re-imported and is working again.", ["super_admin"]);
  console.log(`Zomato session imported for ${user.email} (Zomato user ${user.id}) — connected, ${outlets.length} outlets visible.`);
} catch (err) {
  console.error(`Zomato session import FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
