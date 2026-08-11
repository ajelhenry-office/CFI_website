import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const METABASE_API_URL_KITCHEN = "https://clickhouse.eatfit.in/api/card/2523/query";
  const apiKey = process.env.METABASE_API;
  
  const payload = {
    parameters: [
      { type: "date/single", target: ["variable", ["template-tag", "s"]], value: "2026-07-01" },
      { type: "date/single", target: ["variable", ["template-tag", "e"]], value: "2026-07-10" }
    ]
  };

  const response = await fetch(METABASE_API_URL_KITCHEN, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  const json = await response.json();
  if (json.data && json.data.cols) {
    if (json.data.rows && json.data.rows.length > 0) {
      const relationships = {};
      json.data.rows.forEach(r => {
        const b = r[0]; // main_brand
        const sb = r[1] || "None"; // sub_brand_name
        
        if (!relationships[b]) relationships[b] = new Set();
        relationships[b].add(sb);
      });
      console.log("\nBrand -> Sub-Brand Relationships:");
      for (const b in relationships) {
        console.log(`- ${b}: ${Array.from(relationships[b]).join(', ')}`);
      }
    }
  }
}
run();
