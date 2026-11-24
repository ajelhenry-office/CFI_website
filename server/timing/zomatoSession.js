// Zomato partner session for the Timing tab — the ZOMATO_TIMING_EMAIL account.
// 2-step verification is on, so the session comes from a manual browser login
// (server/timing/zomato_login.py → importZomatoSession.js) and lives on as cookies
// in timing_platform_sessions; every call merges back any Set-Cookie Zomato returns
// so the saved session keeps rolling forward.

import { getSession, saveSession } from "./sessionStore.js";

export const ZOMATO_ACCOUNT = "main";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

async function loadCookies() {
  const session = await getSession("zomato", ZOMATO_ACCOUNT);
  if (!session?.cookies?.length) throw new Error("SESSION_EXPIRED: no Zomato session — run server/timing/zomato_login.py");
  return session.cookies;
}

function cookieHeaderFor(cookies, host) {
  return cookies
    .filter(c => (c.domain.startsWith(".") ? host.endsWith(c.domain.slice(1)) : host === c.domain))
    .map(c => `${c.name}=${c.value}`)
    .join("; ");
}

// Fold Set-Cookie values back into the saved session.
async function mergeSetCookies(cookies, res, host) {
  const setCookies = res.headers.getSetCookie?.() || [];
  if (!setCookies.length) return;
  for (const sc of setCookies) {
    const [pair, ...attrs] = sc.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const domainAttr = attrs.find(a => a.trim().toLowerCase().startsWith("domain="));
    const domain = domainAttr ? domainAttr.split("=")[1].trim() : host;
    const existing = cookies.find(c => c.name === name && c.domain.replace(/^\./, "") === domain.replace(/^\./, ""));
    if (existing) existing.value = value;
    else cookies.push({ name, value, domain, path: "/", expires: -1 });
  }
  // Keep the rest of the session (e.g. the pinned userId) — only the cookies roll forward.
  const session = await getSession("zomato", ZOMATO_ACCOUNT);
  await saveSession("zomato", ZOMATO_ACCOUNT, { ...session, cookies });
}

async function zrequest(url, { method = "GET", body, headers = {} } = {}) {
  const host = new URL(url).host;
  const cookies = await loadCookies();
  const res = await fetch(url, {
    method,
    headers: {
      Cookie: cookieHeaderFor(cookies, host),
      Accept: "application/json",
      "User-Agent": UA,
      Referer: "https://www.zomato.com/partners/onlineordering/",
      Origin: "https://www.zomato.com",
      // merchant-gw (api.zomato.com) 403s with "invalid client id" without these
      "x-client-id": "zomato_web_merchant",
      "x-zomato-app-version": "2",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  await mergeSetCookies(cookies, res, host);
  const text = await res.text();
  // www.zomato.com sits behind Akamai, which turns away cloud/datacenter addresses
  // (e.g. our EC2 server) with an HTML "Access Denied" — the login itself is fine.
  if (res.status === 403 && (/akamai/i.test(res.headers.get("server") || "") || text.includes("Access Denied"))) {
    throw new Error(`BLOCKED: Zomato's website firewall (Akamai) refused this server's network address for ${new URL(url).pathname} — the Zomato login is still valid`);
  }
  // A live session asking for an outlet it has no access to — not a dead login.
  if (res.status === 403 && text.includes('"code":1020')) {
    throw new Error(`NOT_AUTHORISED: this Zomato account has no access to ${new URL(url).search}`);
  }
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new Error(`SESSION_EXPIRED: Zomato returned HTTP ${res.status} for ${new URL(url).pathname}`);
  }
  try { return JSON.parse(text); } catch { throw new Error(`Zomato ${new URL(url).pathname}: non-JSON response (HTTP ${res.status})`); }
}

const zget = url => zrequest(url);

// Which Zomato user the saved cookies belong to (null if logged out).
export async function getZomatoUser() {
  const body = await zget("https://www.zomato.com/restaurant-onboard-diy/check-auth");
  return body?.loggedIn ? { id: body.userId, name: body.userName, email: body.userEmail } : null;
}

// All outlets this account can see; throws SESSION_EXPIRED if the cookies are dead.
export async function getZomatoOutlets() {
  const body = await zget("https://api.zomato.com/merchant-gw/web/restaurant/get-all-minimal-lite");
  if (!Array.isArray(body?.entities)) throw new Error("SESSION_EXPIRED: outlet list missing from Zomato response");
  return body.entities.map(e => ({ res_id: String(e.id), name: e.name, subzone: e.subzone }));
}

// Read-only: current delivery timings for one outlet.
export async function fetchZomatoTimings(resId) {
  const body = await zget(`https://www.zomato.com/merchant-api/restaurant/fetch-timings?res_id=${encodeURIComponent(resId)}&service_type=delivery`);
  if (body?.status !== "success") throw new Error(`Zomato fetch-timings failed for ${resId}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.data.timings.find(t => t.type === "delivery") || body.data.timings[0];
}

const hhmm = t => String(t).slice(0, 5); // "11:00:00" → "11:00"

// Sets slot `slotIndex` (0 = S1, 1 = S2) to start–end on the given days (Monday-first
// names), leaving every other slot and every other day exactly as Zomato has it now.
// Zomato's update takes the whole week, so the current week is read first and only the
// chosen days go back marked isEdited. Returns each changed day's slots before/after.
export async function updateZomatoSlot(resId, days, slotIndex, start, end) {
  const current = await fetchZomatoTimings(resId);
  const wanted = new Set(days.map(d => d.toLowerCase()));
  const changes = [];

  const timings = current.days.map(d => {
    const slots = (d.time_slots || []).map(s => ({ start: hhmm(s.start), end: hhmm(s.end) }));
    if (!wanted.has(d.display_slug)) {
      return { day: d.display_slug, active: d.active, isEdited: false, slots };
    }
    const next = slots.map(s => ({ ...s }));
    if (slotIndex > next.length) throw new Error(`${d.display_text} has no S${slotIndex} on Zomato yet — set S${slotIndex} first`);
    next[slotIndex] = { start, end }; // replaces S1/S2, or adds S2 when the day has only one slot
    changes.push({ day: d.display_text, before: slots, after: next, wasActive: d.active });
    // Setting a time on a day means it's open that day.
    return { day: d.display_slug, active: true, isEdited: true, slots: next };
  });
  if (!changes.length) throw new Error(`None of ${days.join(", ")} found in Zomato's timings for ${resId}`);

  const { csrf } = await zget("https://www.zomato.com/webroutes/auth/csrf");
  if (!csrf) throw new Error("SESSION_EXPIRED: Zomato returned no CSRF token");
  const body = await zrequest("https://www.zomato.com/merchant-api/restaurant/update-timings", {
    method: "POST",
    headers: {
      "x-zomato-csrft": csrf,
      Referer: `https://www.zomato.com/partners/onlineordering/outletInfo/outletTimings?resId=${resId}`,
    },
    body: { res_id: resId, data: [{ action: "update", service_type: "delivery", timings }] },
  });
  // Zomato answers an accepted update with an empty data list and no message.
  const ok = (body?.data === null || body?.data === undefined || (Array.isArray(body.data) && body.data.length === 0)) && !body?.message;
  if (!ok) throw new Error(`Zomato rejected the update: ${JSON.stringify(body).slice(0, 300)}`);
  return changes;
}
