import express from "express";

const router = express.Router();

const METABASE_API_URL = "https://clickhouse.eatfit.in/api/card/1847/query";
const METABASE_API_URL_KITCHEN = "https://clickhouse.eatfit.in/api/card/2523/query";

router.post("/prep-time", async (req, res) => {
  try {
    const { startDate, endDate, brand, subBrand, zone, city, area } = req.body;
    
    // Ensure the API Key is loaded
    const apiKey = process.env.METABASE_API;
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
      return res.status(response.status).json({ success: false, error: "Failed to fetch data from Metabase", details: errorText });
    }

    const data = await response.json();
    
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
    
    const apiKey = process.env.METABASE_API;
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

    const response = await fetch(METABASE_API_URL_KITCHEN, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Metabase API Error 2523]", errorText);
      return res.status(response.status).json({ success: false, error: "Failed to fetch kitchen data from Metabase", details: errorText });
    }

    const data = await response.json();
    return res.json({ success: true, data: data.data });

  } catch (err) {
    console.error("[Ops Matrix Kitchen Error]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
