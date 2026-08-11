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
    console.log("Columns:", json.data.cols.map((c, i) => `${i}: ${c.name}`).join(', '));
    if (json.data.rows && json.data.rows.length > 0) {
      const relationships = {};
      json.data.rows.forEach(r => {
        const brand = r[0]; // Assuming Brand is 0
        const subBrand = r[1]; // We need to check the actual index of sub_brand
        
        // Find sub_brand index dynamically
        const sbIndex = json.data.cols.findIndex(c => c.name === 'sub_brand' || c.name.toLowerCase().includes('sub'));
        const bIndex = json.data.cols.findIndex(c => c.name === 'brand' || c.name === 'Brand');
        
        if (sbIndex !== -1 && bIndex !== -1) {
          const b = r[bIndex];
          const sb = r[sbIndex] || "None";
          if (!relationships[b]) relationships[b] = new Set();
          relationships[b].add(sb);
        }
      });
      console.log("\nBrand -> Sub-Brand Relationships:");
      for (const b in relationships) {
        console.log(`- ${b}: ${Array.from(relationships[b]).join(', ')}`);
      }
    }
  } else {
    console.log("No columns found in response:", json);
  }
}

run();
