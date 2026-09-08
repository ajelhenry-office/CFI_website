import express from "express";

const router = express.Router();

const METABASE_API_URL = "https://clickhouse.eatfit.in/api/card/1847/query";
const METABASE_API_URL_KITCHEN = "https://clickhouse.eatfit.in/api/card/2523/query";

const BRAND_ZONES = {
  Delhi: 'NORTH', Gurgaon: 'NORTH', Noida: 'NORTH', Lucknow: 'NORTH', Chandigarh: 'NORTH',
  Ludhiana: 'NORTH', Jaipur: 'NORTH', Faridabad: 'NORTH', Ghaziabad: 'NORTH', Amritsar: 'NORTH',
  Dehradun: 'NORTH', Bengaluru: 'SOUTH', Bangalore: 'SOUTH', Chennai: 'SOUTH', Hyderabad: 'SOUTH',
  Coimbatore: 'SOUTH', Mysuru: 'SOUTH', Cochin: 'SOUTH', Thiruvananthapuram: 'SOUTH', Vizag: 'SOUTH',
  Hosur: 'SOUTH', Mangalore: 'SOUTH', Manipal: 'SOUTH', Palakkad: 'SOUTH', Puducherry: 'SOUTH',
  Tumakuru: 'SOUTH', Anantapur: 'SOUTH', Calicut: 'SOUTH', Ernakulam: 'SOUTH', Kakinada: 'SOUTH',
  Nellore: 'SOUTH', Rajahmundry: 'SOUTH', Tirupati: 'SOUTH', Vijayawada: 'SOUTH', Warangal: 'SOUTH',
  Mumbai: 'WEST', Pune: 'WEST', Ahemadabad: 'WEST', Goa: 'WEST', Surat: 'WEST', Nagpur: 'WEST',
  Vadodara: 'WEST', Indore: 'WEST', Bhopal: 'WEST', Aurangabad: 'WEST', Nashik: 'WEST',
  Kolkata: 'EAST', Guwahati: 'EAST', Bhubaneswar: 'EAST', Patna: 'EAST', Ranchi: 'EAST',
  Siliguri: 'EAST', Cuttack: 'EAST', Raipur: 'EAST'
};

const queryCache = new Map();

// Some deploy environments (EC2 systemd/PM2 env, older dotenv) hand us the key
// with its surrounding quotes still attached -> Metabase replies "Unauthenticated"
// -> we rewrite that to 502 -> the tab shows no data. Strip quotes/whitespace defensively.
export const getMetabaseApiKey = () =>
  (process.env.METABASE_API || "").trim().replace(/^["']+|["']+$/g, "");

export const METABASE_CARD_KITCHEN_URL = METABASE_API_URL_KITCHEN;

const ALLOWED_BRANDS = new Set([
  "99SLICE",
  "Arambam - Start with Millet by Urbanpiper",
  "CakeZone ++",
  "Eatfit - MOC",
  "Krispy Kreme",
  "Nomad Pizza",
  "Olio ++",
  "Rolls On Wheels",
  "Roz Shawarma by Sharief Bhai",
  "Sharief Bhai"
]);

function cleanKitchenRows(rows) {
  if (!rows || !Array.isArray(rows)) return [];
  const cleaned = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let bName = r[0];
    let sbName = r[1];

    if (!bName || !ALLOWED_BRANDS.has(bName)) continue;
    if (sbName === "Home Plate - EatFit" || sbName === "Madras Curd Rice Company") continue;
    
    if (bName === "Krispy Kreme") {
      sbName = null;
    }

    const newRow = [...r];
    newRow[1] = sbName;
    cleaned.push(newRow);
  }
  return cleaned;
}

const getIsoDate = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

// Card 2523's ClickHouse query is SLOW: a cold run takes ~28s, after which
// Metabase caches the result and repeat calls return in <1s. So the timeout
// MUST comfortably exceed the cold runtime — abort it early and the query is
// cancelled, Metabase never caches it, and every future call is slow too.
// If Vercel's proxy gives up on the first (cold) request, that request has
// still warmed Metabase's cache, so the SPA's automatic retry lands fast.
// Overridable per-env in case the query gets slower/faster.
const asMs = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const METABASE_PROBE_TIMEOUT_MS = asMs(process.env.METABASE_PROBE_TIMEOUT_MS, 40000);
const METABASE_DAYSPLIT_TIMEOUT_MS = asMs(process.env.METABASE_DAYSPLIT_TIMEOUT_MS, 40000);
const METABASE_WARMUP_TIMEOUT_MS = asMs(process.env.METABASE_WARMUP_TIMEOUT_MS, 50000);

function buildKitchenPayload({ startDate, endDate, brand, subBrand, zone, city, area }) {
  const payload = {
    parameters: [
      { type: "date/single", target: ["variable", ["template-tag", "s"]], value: startDate || "2026-07-01" },
      { type: "date/single", target: ["variable", ["template-tag", "e"]], value: endDate || "2026-07-19" },
    ],
  };
  if (brand) payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "Brand"]], value: brand });
  if (subBrand) payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "sub_brand"]], value: subBrand });
  if (zone) payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "zone"]], value: zone });
  if (city) payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "city"]], value: city });
  if (area) payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "area"]], value: area });
  return payload;
}

// One bounded call to card 2523. Normalizes every outcome to
// { ok, data?, httpStatus?, error?, authFailure? } — never throws.
async function callMetabaseKitchenOnce(apiKey, payload, timeoutMs = METABASE_PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(METABASE_API_URL_KITCHEN, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        ok: false,
        httpStatus: response.status,
        error: errorText || `HTTP ${response.status}`,
        authFailure: [401, 403].includes(response.status),
      };
    }

    const json = await response.json().catch(() => null);
    const mbStatus = json?.data?.status || json?.status;
    if (!json || !json.data || !Array.isArray(json.data.rows) || mbStatus === "failed") {
      return { ok: false, httpStatus: 502, error: `Metabase query ${mbStatus || "returned an unexpected shape"}`, queryFailed: true };
    }
    return { ok: true, data: json.data };
  } catch (err) {
    const aborted = err.name === "AbortError";
    return {
      ok: false,
      httpStatus: aborted ? 504 : 502,
      error: aborted ? `Metabase did not respond within ${timeoutMs / 1000}s` : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Background-only (cache warmup): a few sequential attempts with backoff and a
// generous per-call timeout — no HTTP request is waiting on this.
async function callMetabaseKitchenWithRetry(apiKey, payload, attempts = 3) {
  let last = null;
  for (let i = 1; i <= attempts; i++) {
    last = await callMetabaseKitchenOnce(apiKey, payload, METABASE_WARMUP_TIMEOUT_MS);
    if (last.ok || last.authFailure) return last;
    if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
  }
  return last;
}

// Inclusive list of YYYY-MM-DD strings between two dates (capped for safety).
function eachDay(startDate, endDate, cap = 40) {
  const out = [];
  if (!startDate || !endDate) return out;
  const d = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(d) || isNaN(end)) return out;
  while (d <= end && out.length < cap) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function warmUpOpsCache() {
  console.log("[WORKERS] Starting Ops Matrix Cache Warmup...");
  const ranges = [
    { s: getIsoDate(8), e: getIsoDate(1) },   // 7 days
    { s: getIsoDate(15), e: getIsoDate(1) },  // 14 days
    { s: getIsoDate(31), e: getIsoDate(1) },  // 30 days
    { s: getIsoDate(91), e: getIsoDate(1) },  // 90 days
    { s: getIsoDate(182), e: getIsoDate(1) }  // 6 months
  ];

  const apiKey = getMetabaseApiKey();
  if (!apiKey) return;

  for (const { s, e } of ranges) {
    try {
      const result = await callMetabaseKitchenWithRetry(apiKey, buildKitchenPayload({ startDate: s, endDate: e }), 3);

      // Only cache a genuine, non-empty result — never a "failed"/empty one,
      // or the tab would serve "no records" from cache for the next 24h.
      if (result.ok && Array.isArray(result.data.rows) && result.data.rows.length > 0) {
        const data = { ...result.data, rows: cleanKitchenRows(result.data.rows) };
        const cacheKey = JSON.stringify({ startDate: s, endDate: e, brand: "", zone: "", city: "", area: "" });
        queryCache.set(cacheKey, { data, timestamp: Date.now() });
        console.log(`[WORKERS] Warmed up ops cache for ${s} to ${e} (${data.rows.length} rows)`);
      } else {
        console.warn(`[WORKERS] Skipped ops cache warmup for ${s} to ${e}: ${result.error || "empty result"}`);
      }

      // Wait a bit to not overwhelm the clickhouse db
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      console.error(`[WORKERS] Failed to warm up ops cache for ${s} to ${e}`, err);
    }
  }
}


router.post("/prep-time", async (req, res) => {
  try {
    const { startDate, endDate, brand, subBrand, zone, city, area } = req.body;
    
    // Ensure the API Key is loaded
    const apiKey = getMetabaseApiKey();
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Metabase API Key not configured in .env" });
    }

    const payload = {
      parameters: [
        { type: "date/single", target: ["variable", ["template-tag", "s"]], value: startDate || "2026-07-01" },
        { type: "date/single", target: ["variable", ["template-tag", "e"]], value: endDate || "2026-07-19" },
      ]
    };

    if (brand) {
      payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "Brand"]], value: brand });
    }
    if (subBrand) {
      payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "sub_brand"]], value: subBrand });
    }
    if (zone) {
      payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "zone"]], value: zone });
    }
    if (city) {
      payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "city"]], value: city });
    }
    if (area) {
      payload.parameters.push({ type: "category", target: ["variable", ["template-tag", "area"]], value: area });
    }

    const response = await fetch(METABASE_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Metabase API Error]", errorText);
      // Metabase's own 401/403 must never reach the browser as-is — the frontend
      // treats ANY 401/403 from anywhere as "your login is invalid" and logs the
      // user out. This is an upstream service failure, not an auth failure of ours.
      const statusToSend = [401, 403].includes(response.status) ? 502 : response.status;
      return res.status(statusToSend).json({ success: false, error: "Failed to fetch data from Metabase", details: errorText });
    }

    const data = await response.json();
    
    if (data.data && data.data.rows) {
      data.data.rows = cleanKitchenRows(data.data.rows);
    }
    
    // DEBUG: Log the structure so we know how to map it in the frontend!
    if (data.data && data.data.rows && data.data.rows.length > 0) {
      console.log("=== METABASE DATA STRUCTURE ===");
      console.log("Columns:", data.data.cols.map(c => c.name));
      console.log("Sample Row:", data.data.rows[0]);
    }
    
    // The data comes back as { data: { rows: [...], cols: [...] } }
    return res.json({ success: true, data: data.data });

  } catch (err) {
    console.error("[Ops Matrix Error]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/prep-time/kitchen", async (req, res) => {
  try {
    const { startDate, endDate, brand, subBrand, zone, city, area } = req.body;
    
    const apiKey = getMetabaseApiKey();
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Metabase API Key not configured in .env" });
    }

    const masterCacheKey = JSON.stringify({ startDate: startDate || "2026-07-01", endDate: endDate || "2026-07-19", brand: "", zone: "", city: "", area: "" });
    const exactCacheKey = JSON.stringify(req.body);

    // 1. Check exact cache match
    if (queryCache.has(exactCacheKey)) {
      const cacheEntry = queryCache.get(exactCacheKey);
      if (Date.now() - cacheEntry.timestamp < 24 * 60 * 60 * 1000) {
        return res.json({ success: true, data: cacheEntry.data, cached: true });
      }
    }

    // 2. Check if we have the master data and can just filter it in Node
    if (queryCache.has(masterCacheKey) && (brand || zone || city || area)) {
      const masterEntry = queryCache.get(masterCacheKey);
      if (Date.now() - masterEntry.timestamp < 24 * 60 * 60 * 1000) {
        let filteredRows = masterEntry.data.rows;
        
        if (brand) filteredRows = filteredRows.filter(r => r[0] === brand);
        if (city) filteredRows = filteredRows.filter(r => r[2] === city);
        if (area) filteredRows = filteredRows.filter(r => r[3] === area); // r[3] is kitchen
        if (zone) {
           filteredRows = filteredRows.filter(r => {
             const z = BRAND_ZONES[r[2]] || "OTHER";
             return z === zone;
           });
        }
        
        return res.json({ 
          success: true, 
          data: { ...masterEntry.data, rows: filteredRows }, 
          cached: true, 
          localFiltered: true 
        });
      }
    }

    const filters = { brand, subBrand, zone, city, area };
    const rangeDays = eachDay(startDate, endDate);
    // Day-splitting is only worth it (and only fits inside one HTTP request)
    // for short ranges; longer ranges rely on the warm cache.
    const canDaySplit = rangeDays.length >= 2 && rangeDays.length <= 7;

    let result = await callMetabaseKitchenOnce(apiKey, buildKitchenPayload({ startDate, endDate, ...filters }));

    // Upstream auth failure: mask as 502 (never forward 401/403 — the SPA reads
    // that as "your session died" and logs the user out).
    if (!result.ok && result.authFailure) {
      console.error("[Metabase API Error 2523]", result.error);
      return res.status(502).json({ success: false, error: "Failed to fetch kitchen data from Metabase", details: result.error });
    }

    // The multi-day query timed out or came back status:"failed". Retry the
    // days in parallel — single-day queries succeed even when the span doesn't.
    if (!result.ok && canDaySplit) {
      console.warn(`[OpsMatrix] ${startDate}..${endDate} failed upstream (${result.error}) — retrying ${rangeDays.length} days in parallel`);
      const perDay = await Promise.all(
        rangeDays.map((day) =>
          callMetabaseKitchenOnce(apiKey, buildKitchenPayload({ startDate: day, endDate: day, ...filters }), METABASE_DAYSPLIT_TIMEOUT_MS),
        ),
      );
      const good = perDay.filter((r) => r.ok);
      if (good.length > 0) {
        const rows = [];
        for (const r of good) rows.push(...(r.data.rows || []));
        result = { ok: true, data: { ...good[0].data, rows }, partialDays: good.length < rangeDays.length };
      }
    } else if (!result.ok && !result.authFailure) {
      // Not day-splittable (1 day, or a range too wide to split inside one
      // request) — one longer retry of the whole range.
      const retry = await callMetabaseKitchenOnce(apiKey, buildKitchenPayload({ startDate, endDate, ...filters }), METABASE_DAYSPLIT_TIMEOUT_MS);
      if (retry.ok) result = retry;
    }

    if (!result.ok) {
      console.error("[Metabase API Error 2523]", result.error);
      // 504 (not 502) so the SPA's existing retry loop gets a few more tries
      // before it gives up and shows the banner.
      return res.status(504).json({
        success: false,
        upstream: true,
        error: "The Ops Matrix data source (Metabase) isn't responding for this date range. Try a narrower range or retry in a minute.",
        details: result.error,
      });
    }

    // Cache only a real, non-empty result (never a failed/empty one — that would
    // pin "no records" for 24h). Skip caching partial day-split results too.
    if (Array.isArray(result.data.rows) && result.data.rows.length > 0 && !result.partialDays) {
      queryCache.set(exactCacheKey, { data: result.data, timestamp: Date.now() });
    }

    return res.json({ success: true, data: result.data, partialDays: !!result.partialDays });

  } catch (err) {
    console.error("[Ops Matrix Kitchen Error]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
