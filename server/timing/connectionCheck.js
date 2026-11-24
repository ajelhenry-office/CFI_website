// Daily keep-alive for the Timing tab's partner logins (Zomato + both Swiggy accounts).
// Each run uses every session for a real call — that both proves it works and, for
// Zomato, rolls its cookies forward. Swiggy sessions that died are logged back in
// with phone + password; a dead Zomato session needs a human (2-step verification),
// so it raises an alert instead.

import { getSession, saveSession, recordCheck, getConnection } from "./sessionStore.js";
import { getZomatoOutlets, ZOMATO_ACCOUNT } from "./zomatoSession.js";
import { loginSwiggy, checkSwiggy, SWIGGY_ACCOUNTS } from "./swiggySession.js";
import { raiseAlert, resolveAlert } from "../alerts/alertService.js";
import { refreshStoreLinks } from "./storeMap.js";
import { purgeOldTimingChanges } from "./timingChanges.js";

const ALERT_ROLES = ["super_admin"];

async function checkZomato() {
  const category = `TIMING_SESSION:zomato:${ZOMATO_ACCOUNT}`;
  try {
    const previous = await getConnection("zomato", ZOMATO_ACCOUNT);
    const outlets = await getZomatoOutlets();
    // Same email can be a different Zomato user with far fewer outlets (857 vs 140) —
    // a sudden big drop means the session landed on the wrong account.
    const before = previous?.outlet_count;
    if (before >= 50 && outlets.length < before * 0.7) {
      const message = `Zomato now sees ${outlets.length} outlets instead of ${before} — the saved login may have switched to a different Zomato account`;
      await recordCheck("zomato", ZOMATO_ACCOUNT, { status: "changed", outletCount: outlets.length, error: message });
      await raiseAlert(category, "CRITICAL", `${message}. Log in again with server/timing/zomato_login.py ("Continue with Email").`, null, ALERT_ROLES);
      return { platform: "zomato", account: ZOMATO_ACCOUNT, status: "changed", outlets: outlets.length };
    }
    await recordCheck("zomato", ZOMATO_ACCOUNT, { status: "connected", outletCount: outlets.length });
    await resolveAlert(category, "The Zomato timing session is working again.", ALERT_ROLES);
    return { platform: "zomato", account: ZOMATO_ACCOUNT, status: "connected", outlets: outlets.length };
  } catch (err) {
    const status = err.message.startsWith("SESSION_EXPIRED") ? "expired" : "error";
    await recordCheck("zomato", ZOMATO_ACCOUNT, { status, error: err.message });
    await raiseAlert(category, "CRITICAL",
      status === "expired"
        ? "The Zomato timing session has expired. Re-login needed: run server/timing/zomato_login.py on the Mac (2-step verification can't be automated)."
        : "The Zomato timing connection check failed.",
      err.message, ALERT_ROLES);
    return { platform: "zomato", account: ZOMATO_ACCOUNT, status, error: err.message };
  }
}

async function checkSwiggyAccount(account) {
  const category = `TIMING_SESSION:swiggy:${account}`;
  let relogged = false;
  try {
    const saved = await getSession("swiggy", account);
    let outlets;
    try {
      if (!saved?.accessToken) throw new Error("SESSION_EXPIRED: no saved token");
      ({ restaurants: outlets } = await checkSwiggy(saved.accessToken));
    } catch (err) {
      if (!err.message.startsWith("SESSION_EXPIRED")) throw err;
      const fresh = await loginSwiggy(account);
      await saveSession("swiggy", account, { accessToken: fresh.accessToken });
      ({ restaurants: outlets } = await checkSwiggy(fresh.accessToken));
      relogged = true;
    }
    await recordCheck("swiggy", account, { status: "connected", outletCount: outlets.length });
    await resolveAlert(category, `Swiggy timing account ${account} is working again.`, ALERT_ROLES);
    return { platform: "swiggy", account: String(account), status: "connected", outlets: outlets.length, relogged };
  } catch (err) {
    await recordCheck("swiggy", account, { status: "error", error: err.message });
    await raiseAlert(category, "CRITICAL",
      `Swiggy timing account ${account} could not log in. Check SWIGGY_PHONE_${account} / SWIGGY_PASSWORD_${account} — the password may have changed.`,
      err.message, ALERT_ROLES);
    return { platform: "swiggy", account: String(account), status: "error", error: err.message };
  }
}

export async function runTimingConnectionCheck() {
  const results = [await checkZomato()];
  for (const account of SWIGGY_ACCOUNTS) results.push(await checkSwiggyAccount(account));
  console.log("[TIMING CONNECTIONS]", results.map(r => `${r.platform}/${r.account}=${r.status}${r.outlets != null ? `(${r.outlets})` : ""}`).join(" "));
  // Outlets get added to / removed from accounts — re-mark which store RIDs are reachable.
  try {
    console.log("[TIMING CONNECTIONS] store links:", await refreshStoreLinks());
  } catch (err) {
    console.error("[TIMING CONNECTIONS] store link refresh failed:", err.message);
  }
  try {
    console.log("[TIMING CONNECTIONS] audit entries older than 48h deleted:", await purgeOldTimingChanges());
  } catch (err) {
    console.error("[TIMING CONNECTIONS] audit purge failed:", err.message);
  }
  return results;
}

// Same anchoring as scheduleDailyHealthCheck: first run at the next hourIST:minuteIST,
// then every 24h. Also runs once at startup so a restart re-confirms every login.
export function scheduleTimingConnectionCheck(hourIST = 9, minuteIST = 0) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const now = Date.now();
  const nowIST = new Date(now + IST_OFFSET_MS);
  const targetIST = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate(), hourIST, minuteIST, 0));
  let targetUTCms = targetIST.getTime() - IST_OFFSET_MS;
  if (targetUTCms <= now) targetUTCms += 24 * 60 * 60 * 1000;

  const run = () => runTimingConnectionCheck().catch(err => console.error("[TIMING CONNECTIONS] Failed to run:", err.message));
  const delay = targetUTCms - now;
  console.log(`[TIMING CONNECTIONS] Scheduled — first daily run in ${Math.round(delay / 60000)} minutes (${hourIST}:${String(minuteIST).padStart(2, "0")} IST).`);
  run();
  setTimeout(() => {
    run();
    setInterval(run, 24 * 60 * 60 * 1000);
  }, delay);
}
