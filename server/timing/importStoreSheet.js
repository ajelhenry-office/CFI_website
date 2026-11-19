// Loads the "Curefoods RIDs" sheet's Consolidated tab into timing_stores for one
// brand (replacing that brand's rows), then links every RID against our live logins.
//
//   node server/timing/importStoreSheet.js "/path/to/Curefoods RIDs.xlsx" [brand]
//
// Columns read: Kitchen, UP name, Brand (→ sub-brand), Swiggy RID, Zomato RID.

import XLSX from "xlsx";
import { pool } from "../ratings/db.js";
import { cleanRid, replaceBrandStores, refreshStoreLinks } from "./storeMap.js";

// Only these sub-brands are live; every other sub-brand in the sheet is closed and skipped.
const ACTIVE_SUB_BRANDS = {
  EatFit: [
    "EatFit",
    "Great Indian Khichdi by EatFit",
    "Papacream - Ice Creams & Desserts",
    "Rolls & Wraps By Eatfit",
    "Rolls On Wheels - Shawarma & Wraps",
  ],
};

const [file, brand = "EatFit"] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node server/timing/importStoreSheet.js "<xlsx path>" [brand]');
  process.exit(1);
}

try {
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets["Consolidated"];
  if (!sheet) throw new Error(`No "Consolidated" tab — found: ${wb.SheetNames.join(", ")}`);

  const allRows = XLSX.utils.sheet_to_json(sheet, { defval: "" })
    .map(r => ({
      kitchen: String(r["Kitchen"]).trim(),
      urbanpiper_store: String(r["UP name"]).trim(),
      sub_brand_name: String(r["Brand"]).trim(),
      s_res_id: cleanRid(r["Swiggy RID"]),
      z_res_id: cleanRid(r["Zomato RID"]),
    }))
    .filter(s => s.kitchen || s.urbanpiper_store);

  const active = ACTIVE_SUB_BRANDS[brand]?.map(b => b.toLowerCase());
  const stores = active ? allRows.filter(s => active.includes(s.sub_brand_name.toLowerCase())) : allRows;
  if (active) console.log(`Keeping ${stores.length} of ${allRows.length} rows (active sub-brands only).`);

  await replaceBrandStores(brand, stores);
  console.log(`Imported ${stores.length} ${brand} stores.`);

  const links = await refreshStoreLinks();
  console.log("Linked against live logins:", links);
} catch (err) {
  console.error(`Import FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
