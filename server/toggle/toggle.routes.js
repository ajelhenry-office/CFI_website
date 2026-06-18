import express from "express";

const router = express.Router();

// ─── URBANPIPER CONFIG ───────────────────────────────────────
const UP_LOCATION_URL = "https://api.urbanpiper.com/hub/api/v1/location/";
const UP_PLATFORMS    = ["swiggy", "zomato", "urbanpiper", "masalabox", "bitsila", "magicpin", "ownly"];

const UP_BRANDS = {
  ovenfresh: {
    username : process.env.UP_USERNAME_OVENFRESH || "biz_adm_pmNKQXRHStVR",
    apikey   : process.env.UP_APIKEY_OVENFRESH   || "78cb85198b12fa391437679c5878bc7b50e38896",
    biz_id   : process.env.UP_BIZ_ID_OVENFRESH   || "62978428",
  },
  paris_cakes___desserts: {
    username : process.env.UP_USERNAME_OVENFRESH || "biz_adm_pmNKQXRHStVR",
    apikey   : process.env.UP_APIKEY_OVENFRESH   || "78cb85198b12fa391437679c5878bc7b50e38896",
    biz_id   : process.env.UP_BIZ_ID_OVENFRESH   || "62978428",
  },
  eatfit: {
    username : process.env.UP_USERNAME_EATFIT || "biz_adm_QXJeFIgABXFq",
    apikey   : process.env.UP_APIKEY_EATFIT   || "a7d35eac21f5e6eab9d760d25d71a899c3ba2178",
    biz_id   : process.env.UP_BIZ_ID_EATFIT   || "60578050",
  },
};

// ─── TOGGLE ENDPOINT ──────────────────────────────────────────
router.post("/toggle", async (req, res) => {
  const { location_id, action, brand = "ovenfresh" } = req.body;

  if (!location_id || !action) {
    return res.status(400).json({ error: "location_id and action are required" });
  }
  if (!["enable", "disable"].includes(action)) {
    return res.status(400).json({ error: 'action must be "enable" or "disable"' });
  }

  const brandKey = brand.toLowerCase().replace(/[^a-z]/g, "_");
  const creds    = UP_BRANDS[brandKey];

  if (!creds) {
    return res.status(400).json({ error: `Unknown brand: ${brand}` });
  }

  console.log(`[TOGGLE] ${action.toUpperCase()} → location ${location_id} (${brand})`);

  try {
    let currentPlatforms = [...UP_PLATFORMS];
    let finalStatus = 500;
    let finalResponseText = "";

    while (currentPlatforms.length > 0) {
      const payload = {
        location_ref_id: String(location_id),
        action: action,
        platforms: currentPlatforms,
      };

      const response = await fetch(UP_LOCATION_URL, {
        method: "POST",
        headers: {
          "Authorization": `apikey ${creds.username}:${creds.apikey}`,
          "x-upr-biz-id": creds.biz_id,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      finalStatus = response.status;
      finalResponseText = await response.text();

      if (response.status >= 200 && response.status < 300) {
        return res.json({ success: true, message: `Store ${action}d across platforms` });
      }

      if (response.status === 400) {
        try {
          const errBody = JSON.parse(finalResponseText);
          if (errBody.message && errBody.message.includes("not valid for platform")) {
            const badPlatformMatch = errBody.message.match(/platform['"\s]*([\w]+)/i);
            if (badPlatformMatch && badPlatformMatch[1]) {
              const badPlatform = badPlatformMatch[1].toLowerCase();
              currentPlatforms = currentPlatforms.filter(p => p !== badPlatform);
              console.log(`[TOGGLE RETRY] Stripping unsupported platform: ${badPlatform}`);
              continue;
            }
          }
        } catch (e) {}
      }
      break;
    }

    let upErrorMsg = `UrbanPiper returned ${finalStatus}`;
    try {
      const errObj = JSON.parse(finalResponseText);
      if (errObj.message) upErrorMsg += ` - ${errObj.message}`;
    } catch (e) {}

    return res.status(finalStatus).json({ success: false, error: upErrorMsg });

  } catch (err) {
    console.error("[TOGGLE ERROR]", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET LOCATIONS ENDPOINT (UTILITY) ─────────────────────────
router.get("/locations", async (req, res) => {
  const brand = req.query.brand || "ovenfresh";
  const brandKey = brand.toLowerCase().replace(/[^a-z]/g, "_");
  const creds    = UP_BRANDS[brandKey];

  if (!creds) {
    return res.status(400).json({ error: `Unknown brand: ${brand}` });
  }

  try {
    const response = await fetch(UP_LOCATION_URL, {
      method  : "GET",
      headers : {
        "Authorization" : `apikey ${creds.username}:${creds.apikey}`,
        "x-upr-biz-id"  : creds.biz_id,
      }
    });

    const responseText = await response.text();

    try {
      const data = JSON.parse(responseText);
      return res.json({ success: true, locations: data });
    } catch (parseError) {
      return res.status(response.status).json({ success: false, error: `UrbanPiper responded: ${responseText}` });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── VERIFY API KEY ENDPOINT ──────────────────────────────────
router.get("/verify-keys", async (req, res) => {
  const creds = UP_BRANDS["ovenfresh"];

  if (!creds) {
    return res.status(400).json({ error: "No credentials found for ovenfresh" });
  }

  try {
    const response = await fetch(UP_LOCATION_URL, {
      method  : "POST",
      headers : {
        "Authorization" : `apikey ${creds.username}:${creds.apikey}`,
        "x-upr-biz-id"  : creds.biz_id,
        "Content-Type"  : "application/json",
      },
      body: JSON.stringify({
        location_ref_id: "DUMMY_TEST_LOCATION",
        action: "enable",
        platforms: UP_PLATFORMS
      }),
    });

    const responseText = await response.text();

    if (response.status === 401 || response.status === 403) {
      return res.json({ status: "❌ FAILED", message: `API Key is INVALID. (Status: ${response.status})` });
    } else if (response.status === 400) {
      return res.json({ status: "✅ SUCCESS", message: "API Key is VALID!", raw_error: responseText });
    } else {
      return res.json({ status: "❓ UNKNOWN", message: `Received status ${response.status}`, raw_response: responseText });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;