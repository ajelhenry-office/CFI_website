// ============================================================
// KitchenPulse Backend — Node.js + Express
// Deploy this on Railway.app (free tier)
// ============================================================

import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ─── URBANPIPER CONFIG ───────────────────────────────────────
// Add these as environment variables in Railway:
//   UP_BIZ_ID_OVENFRESH = your Ovenfresh biz ID from UrbanPiper
// The API key below is already set from your sheet.

const UP_LOCATION_URL = "https://api.urbanpiper.com/hub/api/v1/location/";
const UP_PLATFORMS    = ["zomato", "swiggy"];

// One entry per brand. Add more brands here later.
const UP_BRANDS = {
  ovenfresh: {
    username : process.env.UP_USERNAME_OVENFRESH || "biz_adm_pmNKQXRHStVR",
    apikey   : process.env.UP_APIKEY_OVENFRESH   || "78cb85198b12fa391437679c5878bc7b50e38896",
    biz_id   : process.env.UP_BIZ_ID_OVENFRESH   || "62978428",
  },
  paris_cakes___desserts: {
    // Paris Cakes uses same Ovenfresh credentials (same UrbanPiper account)
    username : process.env.UP_USERNAME_OVENFRESH || "biz_adm_pmNKQXRHStVR",
    apikey   : process.env.UP_APIKEY_OVENFRESH   || "78cb85198b12fa391437679c5878bc7b50e38896",
    biz_id   : process.env.UP_BIZ_ID_OVENFRESH   || "62978428",
  },
  // EatFit (from your existing sheet — add when ready)
  eatfit: {
    username : process.env.UP_USERNAME_EATFIT || "biz_adm_QXJeFIgABXFq",
    apikey   : process.env.UP_APIKEY_EATFIT   || "a7d35eac21f5e6eab9d760d25d71a899c3ba2178",
    biz_id   : process.env.UP_BIZ_ID_EATFIT   || "60578050",
  },
};

// ─── GITHUB ACTIONS CONFIG (for store timing) ────────────────
// Add these in Railway env vars:
//   GITHUB_TOKEN = your GitHub personal access token
//   GITHUB_REPO  = ajelhenry-office/zomato-store-timing (from your script)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_REPO  = process.env.GITHUB_REPO  || "ajelhenry-office/zomato-store-timing";

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── TOGGLE ENDPOINT ──────────────────────────────────────────
// POST /api/toggle
// Body: { location_id: "65749", action: "enable"|"disable", brand: "ovenfresh" }
app.post("/api/toggle", async (req, res) => {
  const { location_id, action, brand = "ovenfresh" } = req.body;

  if (!location_id || !action) {
    return res.status(400).json({ error: "location_id and action are required" });
  }
  if (!["enable", "disable"].includes(action)) {
    return res.status(400).json({ error: 'action must be "enable" or "disable"' });
  }

  // Normalize brand key (remove spaces, lowercase)
  const brandKey = brand.toLowerCase().replace(/[^a-z]/g, "_");
  const creds    = UP_BRANDS[brandKey];

  if (!creds) {
    return res.status(400).json({ error: `Unknown brand: ${brand}` });
  }

  const payload = {
    location_ref_id: String(location_id),
    action          : action,
    platforms       : UP_PLATFORMS,
  };

  console.log(`[TOGGLE] ${action.toUpperCase()} → location ${location_id} (${brand})`);

  try {
    const response = await fetch(UP_LOCATION_URL, {
      method  : "POST",
      headers : {
        "Authorization" : `apikey ${creds.username}:${creds.apikey}`,
        "x-upr-biz-id"  : creds.biz_id,
        "Content-Type"  : "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log(`[TOGGLE] UrbanPiper responded ${response.status}: ${responseText}`);

    if (response.status >= 200 && response.status < 300) {
      return res.json({ success: true, message: `Store ${action}d on UrbanPiper` });
    }

    // Handle 400 with "not valid for platform" (platform mismatch — retry without that platform)
    if (response.status === 400) {
      try {
        const errBody = JSON.parse(responseText);
        if (errBody.message && errBody.message.includes("not valid for platform")) {
          const badPlatform = errBody.message.match(/platform["\s]*([\w]+)/i)?.[1]?.toLowerCase();
          if (badPlatform) {
            const retryPlatforms = UP_PLATFORMS.filter(p => p !== badPlatform);
            if (retryPlatforms.length > 0) {
              const retry = await fetch(UP_LOCATION_URL, {
                method  : "POST",
                headers : {
                  "Authorization" : `apikey ${creds.username}:${creds.apikey}`,
                  "x-upr-biz-id"  : creds.biz_id,
                  "Content-Type"  : "application/json",
                },
                body: JSON.stringify({ ...payload, platforms: retryPlatforms }),
              });
              if (retry.status >= 200 && retry.status < 300) {
                return res.json({ success: true, message: `Store ${action}d (skipped ${badPlatform})` });
              }
            }
          }
        }
      } catch (_) {}
    }

    return res.status(response.status).json({ success: false, error: `UrbanPiper returned ${response.status}` });

  } catch (err) {
    console.error("[TOGGLE ERROR]", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── TIMING ENDPOINT ──────────────────────────────────────────
// POST /api/timing
// Body: { store_id, location_id, brand, store_name, opening_time, closing_time }
// This triggers your existing GitHub Actions → Playwright workflow
app.post("/api/timing", async (req, res) => {
  const { store_id, location_id, store_name, opening_time, closing_time } = req.body;

  if (!location_id || !opening_time || !closing_time) {
    return res.status(400).json({ error: "location_id, opening_time, closing_time required" });
  }
  if (!GITHUB_TOKEN) {
    console.log(`[TIMING - MOCK MODE] Missing GITHUB_TOKEN. Simulating success for ${store_name}.`);
    return res.json({ success: true, message: "Mock: GitHub Actions triggered. Changes apply in ~60 seconds." });
  }

  console.log(`[TIMING] ${store_name} → open ${opening_time} close ${closing_time}`);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/sync.yml/dispatches`,
      {
        method  : "POST",
        headers : {
          Authorization  : `Bearer ${GITHUB_TOKEN}`,
          Accept         : "application/vnd.github.v3+json",
          "Content-Type" : "application/json",
        },
        body: JSON.stringify({
          ref    : "main",
          inputs : {
            store_id     : String(store_id || location_id),
            location_id  : String(location_id),
            store_name   : store_name || "",
            opening_time : opening_time,
            closing_time : closing_time,
          },
        }),
      }
    );

    if (response.status === 204) {
      return res.json({ success: true, message: "GitHub Actions triggered. Changes apply in ~60 seconds." });
    }
    const body = await response.text();
    return res.status(response.status).json({ success: false, error: body });

  } catch (err) {
    console.error("[TIMING ERROR]", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── START SERVER ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`KitchenPulse backend running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
