import express from "express";

const router = express.Router();

// The Ops Matrix tab shows this Metabase card's numbers exactly as returned —
// no maths happens on our side. Card 2523 is the website's own copy of the
// original 1847, so Metabase users can change 1847 without breaking the site.
// Overridable so we can point at another card without a deploy.
const METABASE_BASE_URL = "https://clickhouse.eatfit.in";
export const OPS_CARD_ID = String(process.env.OPS_MATRIX_CARD_ID || "2523").trim();
export const METABASE_CARD_KITCHEN_URL = `${METABASE_BASE_URL}/api/card/${OPS_CARD_ID}/query`;

// The card's own /query endpoint returns at most 2,000 rows and silently drops
// the rest, so the card's SQL is run through /api/dataset, which accepts a
// higher row limit. If even this limit is hit, the UI is told.
const METABASE_DATASET_URL = `${METABASE_BASE_URL}/api/dataset`;
const METABASE_ROW_CAP = 1000000;

// Some deploy environments (EC2 systemd/PM2 env, older dotenv) hand us the key
// with its surrounding quotes still attached -> Metabase replies "Unauthenticated"
// -> we rewrite that to 502 -> the tab shows no data. Strip quotes/whitespace defensively.
export const getMetabaseApiKey = () =>
  (process.env.METABASE_API || "").trim().replace(/^["']+|["']+$/g, "");

const getIsoDate = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The card's ClickHouse query is SLOW: a cold run takes 30-80s (longer with
// filters, or with several runs at once). Aborting it cancels the query and
// nothing gets cached, so the Metabase call is given a generous timeout and
// keeps running even after the HTTP request that started it has given up —
// the SPA's retry then picks up the same in-flight run instead of starting over.
// Overridable per-env in case the query gets slower/faster.
const asMs = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
// How long one HTTP request waits before answering 504 "still running".
const REQUEST_WAIT_MS = asMs(process.env.METABASE_PROBE_TIMEOUT_MS, 40000);
// How long the Metabase call itself may take.
const METABASE_QUERY_TIMEOUT_MS = asMs(process.env.METABASE_QUERY_TIMEOUT_MS, 180000);

const DAY_MS = 24 * 60 * 60 * 1000;
const META_TTL_MS = 10 * 60 * 1000;
const FILTERS_TTL_MS = 6 * 60 * 60 * 1000;

// Interlinked dropdowns: every brand → sub-brand → city → kitchen → channel
// combination the card produces over this many days, refreshed every OPTIONS_TTL_MS.
const OPTIONS_LOOKBACK_DAYS = 31;
const OPTIONS_TTL_MS = 6 * 60 * 60 * 1000;
// Lists built without Channel (the Channel-linked query failed) are kept only this
// long, so the Channel-linked version is tried again soon.
const OPTIONS_FALLBACK_TTL_MS = 15 * 60 * 1000;
const OPTION_COLS = ["main_brand", "sub_brand_name", "standardized_city", "kitchen"];
const OPTION_COLS_WITH_CHANNEL = [...OPTION_COLS, "channel"];

const queryCache = new Map();
const inFlight = new Map(); // cacheKey -> Promise of a callCardOnce result

// Each run of the card scans ~376M rows on the shared ClickHouse; 8 at once
// blew its 56 GB memory limit and tripped TOO_SLOW, failing every run. So runs
// queue here and only a couple ever execute at the same time.
const MAX_CONCURRENT_RUNS = Math.max(1, Number(process.env.OPS_METABASE_CONCURRENCY) || 2);
let activeRuns = 0;
const runQueue = [];
async function withRunSlot(fn) {
  if (activeRuns >= MAX_CONCURRENT_RUNS) await new Promise((resolve) => runQueue.push(resolve));
  activeRuns++;
  try {
    return await fn();
  } finally {
    activeRuns--;
    runQueue.shift()?.();
  }
}
let cardMetaCache = null; // { card, timestamp }
let filtersCache = null; // { filters, timestamp }

async function metabaseGet(apiKey, path, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${METABASE_BASE_URL}${path}`, {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });
    if (!resp.ok) {
      const err = new Error(`Metabase ${path} returned HTTP ${resp.status}`);
      err.authFailure = [401, 403].includes(resp.status);
      throw err;
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// The card as it is in Metabase right now: its SQL, and its filter definitions
// (slug, type, target, option list). Every change the SQL person makes to the
// card — query or filters — reaches the website from here.
async function getCard(apiKey) {
  if (cardMetaCache && Date.now() - cardMetaCache.timestamp < META_TTL_MS) return cardMetaCache.card;
  const raw = await metabaseGet(apiKey, `/api/card/${OPS_CARD_ID}`);
  if (raw.dataset_query?.type !== "native" || !raw.dataset_query.native?.query) {
    throw new Error(`Metabase card ${OPS_CARD_ID} is not a native SQL question`);
  }
  const card = {
    databaseId: raw.dataset_query.database,
    native: raw.dataset_query.native,
    params: Array.isArray(raw.parameters) ? raw.parameters : [],
  };
  cardMetaCache = { card, timestamp: Date.now() };
  return card;
}

// Text variables ({{Brand}}) take one value; field filters ({{Channel}},
// type "string/=") take a list — same as in Metabase itself.
const isMultiParam = (p) => typeof p.type === "string" && p.type.startsWith("string/");
const isDateParam = (p) => typeof p.type === "string" && p.type.startsWith("date/");

// One bounded run of the card's SQL (or `query`, a wrapper around it). Normalizes
// every outcome to { ok, data?, httpStatus?, error?, authFailure? } — never throws.
async function callCardOnce(apiKey, card, payload, { query = card.native.query, timeoutMs = METABASE_QUERY_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(METABASE_DATASET_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        database: card.databaseId,
        type: "native",
        native: { ...card.native, query },
        parameters: payload.parameters,
        constraints: { "max-results": METABASE_ROW_CAP, "max-results-bare-rows": METABASE_ROW_CAP },
      }),
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
      const reason = json?.error ? `: ${String(json.error).slice(0, 300)}` : "";
      return { ok: false, httpStatus: 502, error: `Metabase query ${mbStatus || "returned an unexpected shape"}${reason}`, queryFailed: true };
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

// Maps { slug: value | [values] } from the UI onto the card's own parameter
// definitions. Unknown slugs and empty values are dropped, so a filter removed
// from the card in Metabase can't break the request.
function buildCardPayload(params, { startDate, endDate, filters = {} }) {
  const payload = { parameters: [] };
  for (const p of params) {
    if (p.slug === "s" && startDate) payload.parameters.push({ type: p.type, target: p.target, value: startDate });
    else if (p.slug === "e" && endDate) payload.parameters.push({ type: p.type, target: p.target, value: endDate });
    else if (!isDateParam(p) && p.slug in filters) {
      const raw = filters[p.slug];
      const values = (Array.isArray(raw) ? raw : [raw]).filter((v) => typeof v === "string" && v !== "");
      if (values.length === 0) continue;
      payload.parameters.push({ type: p.type, target: p.target, value: isMultiParam(p) ? values : values[0] });
    }
  }
  return payload;
}

const shapeResult = (data) => ({
  cols: (data.cols || []).map((c) => ({ name: c.name, base_type: c.base_type, semantic_type: c.semantic_type })),
  rows: data.rows,
  truncated: data.rows.length >= METABASE_ROW_CAP,
});

// A range that includes today is still changing — cache it briefly; past
// ranges are final and can sit for a day.
const cacheTtlFor = (endDate) => (endDate >= getIsoDate(0) ? 15 * 60 * 1000 : DAY_MS);

function cacheKeyFor(startDate, endDate, filters) {
  const sorted = Object.keys(filters || {}).sort().reduce((acc, k) => {
    const v = filters[k];
    acc[k] = Array.isArray(v) ? [...v].sort() : v;
    return acc;
  }, {});
  return JSON.stringify({ card: OPS_CARD_ID, startDate, endDate, filters: sorted });
}

// Runs the card once per distinct request: concurrent/retried callers share the
// same in-flight run, and a genuine non-empty result is cached when it lands.
function runCard(apiKey, card, { startDate, endDate, filters = {}, query, cacheKey = cacheKeyFor(startDate, endDate, filters), ttl = cacheTtlFor(endDate) }) {
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const run = (async () => {
    const payload = buildCardPayload(card.params, { startDate, endDate, filters });
    let result = await withRunSlot(() => callCardOnce(apiKey, card, payload, { query }));
    // One more go for a query Metabase reported as failed (not for our own timeout).
    if (!result.ok && result.queryFailed) result = await withRunSlot(() => callCardOnce(apiKey, card, payload, { query }));
    if (result.ok) {
      const data = shapeResult(result.data);
      if (data.truncated) console.warn(`[OpsMatrix] ${startDate}..${endDate} hit the ${METABASE_ROW_CAP}-row limit`);
      // Cache only a real, non-empty result (never a failed/empty one — that
      // would pin "no records" for the whole TTL).
      if (data.rows.length > 0) queryCache.set(cacheKey, { data, timestamp: Date.now(), ttl });
      return { ok: true, data };
    }
    console.error(`[Metabase API Error ${OPS_CARD_ID}] ${startDate}..${endDate}:`, result.error);
    return result;
  })().finally(() => inFlight.delete(cacheKey));

  inFlight.set(cacheKey, run);
  return run;
}

// The card's per-order inner query — the "(select ...)" its outer SELECT reads
// FROM. That level still has `channel` (the outer query groups it away). Returns
// null if the SQL isn't shaped that way. Skips string literals and comments.
function extractInnerQuery(sql) {
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      for (i++; i < sql.length; i++) {
        if (sql[i] === "'" && sql[i + 1] === "'") i++;
        else if (sql[i] === "'") break;
      }
    } else if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 1;
    } else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && /^from\s*\(/i.test(sql.slice(i, i + 40)) && /\W/.test(sql[i - 1] || " ")) {
      const open = sql.indexOf("(", i);
      let d = 0;
      for (let j = open; j < sql.length; j++) {
        const c = sql[j];
        if (c === "'") {
          for (j++; j < sql.length; j++) {
            if (sql[j] === "'" && sql[j + 1] === "'") j++;
            else if (sql[j] === "'") break;
          }
        } else if (c === "-" && sql[j + 1] === "-") {
          while (j < sql.length && sql[j] !== "\n") j++;
        } else if (c === "(") d++;
        else if (c === ")" && --d === 0) return sql.slice(open, j + 1);
      }
      return null;
    }
  }
  return null;
}

// Every unique brand → sub-brand → city → kitchen (→ channel) combination,
// built from the card's own SQL so these lists follow every change to the card.
// Channel comes from the card's inner query; if that can't be used, the lists
// are built from the card's output instead (everything but Channel still links up).
// The column the card's Channel filter compares against — e.g. `[[AND channel_name = {{Channel}}]]`
// gives "channel_name". A field-filter style `{{Channel}}` names no column, so fall back to "channel".
function channelColumn(sql) {
  const m = sql.match(/([A-Za-z_][\w.]*)\s*=\s*\{\{\s*Channel\s*\}\}/i);
  return m ? m[1].split(".").pop() : "channel";
}

function runOptions(apiKey, card) {
  const cacheKey = optionsCacheKey();
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const startDate = getIsoDate(OPTIONS_LOOKBACK_DAYS);
  const endDate = getIsoDate(1);
  const cardSql = card.native.query.trim().replace(/;+\s*$/, "");
  const inner = extractInnerQuery(cardSql);
  const channelCol = channelColumn(cardSql);

  const run = (async () => {
    if (inner && new RegExp(`\\b${channelCol}\\b`, "i").test(inner)) {
      const withChannel = await runCard(apiKey, card, {
        startDate,
        endDate,
        query: `SELECT DISTINCT ${OPTION_COLS.join(", ")}, ${channelCol} AS channel\nFROM ${inner} AS ops_inner`,
        cacheKey: `${cacheKey}:channel`,
        ttl: OPTIONS_TTL_MS,
      });
      if (withChannel.ok) return { ...withChannel, columns: OPTION_COLS_WITH_CHANNEL };
      console.warn("[OpsMatrix] Channel-linked filter lists failed; falling back to the card's output:", withChannel.error);
    }
    const plain = await runCard(apiKey, card, {
      startDate,
      endDate,
      query: `SELECT DISTINCT ${OPTION_COLS.join(", ")}\nFROM (\n${cardSql}\n) AS ops_card`,
      cacheKey: `${cacheKey}:plain`,
      ttl: OPTIONS_FALLBACK_TTL_MS,
    });
    return { ...plain, columns: OPTION_COLS, ttl: OPTIONS_FALLBACK_TTL_MS };
  })().then((result) => {
    if (result.ok) queryCache.set(cacheKey, { data: result.data, columns: result.columns, timestamp: Date.now(), ttl: result.ttl || OPTIONS_TTL_MS });
    return result;
  }).finally(() => inFlight.delete(cacheKey));

  inFlight.set(cacheKey, run);
  return run;
}
const optionsCacheKey = () => JSON.stringify({ card: OPS_CARD_ID, options: true, startDate: getIsoDate(OPTIONS_LOOKBACK_DAYS), endDate: getIsoDate(1) });

export async function warmUpOpsCache() {
  const apiKey = getMetabaseApiKey();
  if (!apiKey) return;
  console.log("[WORKERS] Starting Ops Matrix Cache Warmup...");

  let card;
  try {
    card = await getCard(apiKey);
  } catch (err) {
    console.error("[WORKERS] Ops warmup: could not read the Metabase card", err.message);
    return;
  }

  // The City / Kitchen lists, then the page's default view (last 8 days, no filters).
  const jobs = [
    { label: "City / Kitchen lists", key: optionsCacheKey(), run: () => runOptions(apiKey, card) },
    {
      label: `${getIsoDate(8)} to ${getIsoDate(1)}`,
      key: cacheKeyFor(getIsoDate(8), getIsoDate(1), {}),
      run: () => runCard(apiKey, card, { startDate: getIsoDate(8), endDate: getIsoDate(1) }),
    },
  ];

  for (const job of jobs) {
    const hit = queryCache.get(job.key);
    if (hit && Date.now() - hit.timestamp < hit.ttl) continue;

    const result = await job.run();
    if (result.ok && result.data.rows.length > 0) {
      console.log(`[WORKERS] Warmed up ops cache: ${job.label} (${result.data.rows.length} rows)`);
    } else {
      console.warn(`[WORKERS] Skipped ops cache warmup: ${job.label}: ${result.error || "empty result"}`);
    }

    // Wait a bit to not overwhelm the clickhouse db
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// Filter dropdowns, taken straight from the card's filters in Metabase:
// static lists (Brand, Sub Brand) and field-value lists (Channel) alike.
router.get("/filters", async (req, res) => {
  try {
    const apiKey = getMetabaseApiKey();
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Metabase API Key not configured in .env" });
    }

    const refresh = req.query.refresh === "1";
    if (!refresh && filtersCache && Date.now() - filtersCache.timestamp < FILTERS_TTL_MS) {
      return res.json({ success: true, filters: filtersCache.filters, cached: true });
    }
    if (refresh) cardMetaCache = null;

    const { params } = await getCard(apiKey);
    const filters = await Promise.all(
      params.filter((p) => !isDateParam(p)).map(async (p) => {
        let values = [];
        if (p.values_source_type === "static-list" && Array.isArray(p.values_source_config?.values)) {
          values = p.values_source_config.values.map((v) => (Array.isArray(v) ? v[0] : v));
        } else {
          try {
            const r = await metabaseGet(apiKey, `/api/card/${OPS_CARD_ID}/params/${p.id}/values`);
            values = (r.values || []).map((v) => (Array.isArray(v) ? v[0] : v));
          } catch (err) {
            console.warn(`[OpsMatrix] No option list for filter "${p.slug}": ${err.message}`);
          }
        }
        values = values.filter((v) => typeof v === "string" && v !== "");
        // The card always excludes POS orders, so offering it would only ever return nothing.
        if (p.slug.toLowerCase() === "channel") values = values.filter((v) => v.toLowerCase() !== "pos");
        return { slug: p.slug, name: p.name || p.slug, multi: isMultiParam(p), values };
      }),
    );

    filtersCache = { filters, timestamp: Date.now() };
    return res.json({ success: true, filters });
  } catch (err) {
    console.error("[Ops Matrix Filters Error]", err);
    // Never forward Metabase's 401/403 — the SPA reads that as "your session died".
    res.status(502).json({ success: false, error: "Could not load filters from Metabase", details: err.message });
  }
});

// One run of the card for one date range + filters, returned as-is.
router.post("/data", async (req, res) => {
  try {
    const { startDate, endDate, filters = {} } = req.body || {};
    if (!ISO_DATE_RE.test(startDate || "") || !ISO_DATE_RE.test(endDate || "") || startDate > endDate) {
      return res.status(400).json({ success: false, error: "startDate and endDate must be YYYY-MM-DD, with startDate <= endDate" });
    }

    const apiKey = getMetabaseApiKey();
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Metabase API Key not configured in .env" });
    }

    const cacheKey = cacheKeyFor(startDate, endDate, filters);
    const hit = queryCache.get(cacheKey);
    if (hit && Date.now() - hit.timestamp < hit.ttl) {
      return res.json({ success: true, ...hit.data, cached: true });
    }

    const run = runCard(apiKey, await getCard(apiKey), { startDate, endDate, filters });
    const result = await Promise.race([run, new Promise((r) => setTimeout(() => r(null), REQUEST_WAIT_MS))]);

    // Still running: answer 504 so the SPA retries — the run keeps going and the
    // retry joins it (or finds its cached result).
    if (result === null) {
      return res.status(504).json({
        success: false,
        upstream: true,
        error: "The Ops Matrix data source (Metabase) is still working on this date range. Retry in a minute.",
      });
    }

    // Upstream auth failure: mask as 502 (never forward 401/403 — the SPA reads
    // that as "your session died" and logs the user out).
    if (!result.ok && result.authFailure) {
      return res.status(502).json({ success: false, error: "Failed to fetch Ops Matrix data from Metabase", details: result.error });
    }

    if (!result.ok) {
      // 504 (not 502) so the SPA's retry loop gets a few more tries before it
      // gives up and shows the banner.
      return res.status(504).json({
        success: false,
        upstream: true,
        error: "The Ops Matrix data source (Metabase) isn't responding for this date range. Retry in a minute.",
        details: result.error,
      });
    }

    return res.json({ success: true, ...result.data });
  } catch (err) {
    console.error("[Ops Matrix Data Error]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Interlinked dropdowns: every unique brand → sub-brand → city → kitchen →
// channel combination, so picking any filter narrows all the others.
router.get("/options", async (req, res) => {
  try {
    const apiKey = getMetabaseApiKey();
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Metabase API Key not configured in .env" });
    }

    if (req.query.refresh === "1") {
      for (const suffix of ["", ":channel", ":plain"]) queryCache.delete(`${optionsCacheKey()}${suffix}`);
      cardMetaCache = null;
    }
    const hit = queryCache.get(optionsCacheKey());
    if (hit && Date.now() - hit.timestamp < hit.ttl) {
      return res.json({ success: true, columns: hit.columns, combos: hit.data.rows, cached: true });
    }

    const run = runOptions(apiKey, await getCard(apiKey));
    const result = await Promise.race([run, new Promise((r) => setTimeout(() => r(null), REQUEST_WAIT_MS))]);
    if (result === null) {
      return res.status(504).json({ success: false, upstream: true, error: "Metabase is still building the City / Kitchen lists. Retry in a minute." });
    }
    if (!result.ok) {
      // Never forward Metabase's 401/403 — the SPA reads that as "your session died".
      return res.status(result.authFailure ? 502 : 504).json({ success: false, upstream: true, error: "Could not load the City / Kitchen lists from Metabase", details: result.error });
    }
    return res.json({ success: true, columns: result.columns, combos: result.data.rows });
  } catch (err) {
    console.error("[Ops Matrix Options Error]", err);
    res.status(502).json({ success: false, error: "Could not load the City / Kitchen lists from Metabase", details: err.message });
  }
});

export default router;
