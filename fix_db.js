import { Pool } from 'pg';

const pool = new Pool({
  connectionString: "postgresql://new_user:StrongPassword123!@103.172.150.31/website",
});

const cityMap = {
  "BLR": "Bangalore",
  "BOM": "Mumbai",
  "NCR": "Delhi NCR",
  "PUNE": "Pune",
  "HYD": "Hyderabad",
  "CHN": "Chennai",
  "KLK": "Kolkata",
  "AMD": "Ahmedabad",
  "LKO": "Lucknow",
  "GOA": "Goa",
  "BBI": "Bhubaneswar",
  "CCJ": "Calicut",
  "CJB": "Coimbatore",
  "COK": "Kochi",
  "DED": "Dehradun",
  "GUW": "Guwahati",
  "GWL": "Gwalior",
  "IND": "Indore",
  "JAI": "Jaipur",
  "NAG": "Nagpur",
  "NSK": "Nashik",
  "PAT": "Patna",
  "RNC": "Ranchi",
  "RPR": "Raipur",
  "SALEM": "Salem",
  "SURAT": "Surat",
  "TRI": "Trichy",
  "TVR": "Trivandrum",
  "UDP": "Udaipur",
  "UJN": "Ujjain",
  "VAD": "Vadodara",
  "VIZAG": "Visakhapatnam",
  "WRG": "Warangal"
};

async function fixDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Fix zones for eatfit and olio
    console.log("Fixing fake zones...");
    await client.query(`UPDATE managed_stores SET zone = NULL WHERE brand IN ('eatfit', 'olio')`);

    // 2. Fix Olio cities and names
    console.log("Fixing Olio cities and areas...");
    const { rows: olioStores } = await client.query(`SELECT id, city, name FROM managed_stores WHERE brand = 'olio'`);
    for (const store of olioStores) {
      let newCity = cityMap[store.city] || store.city;
      // The name is usually "BLR WHITEFIELD". We want just "WHITEFIELD".
      let newName = store.name;
      if (newName.startsWith(store.city + " ")) {
        newName = newName.substring(store.city.length + 1);
      }
      
      await client.query(`UPDATE managed_stores SET city = $1, name = $2 WHERE id = $3`, [newCity, newName, store.id]);
    }

    // 3. Fix Eatfit area names
    console.log("Fixing Eatfit areas...");
    const { rows: eatfitStores } = await client.query(`SELECT id, city, name FROM managed_stores WHERE brand = 'eatfit'`);
    for (const store of eatfitStores) {
      // name is like "Bangalore BLR_ULS". We want "BLR_ULS".
      let newName = store.name;
      if (store.city && newName.toLowerCase().startsWith(store.city.toLowerCase() + " ")) {
        newName = newName.substring(store.city.length + 1).trim();
      }
      await client.query(`UPDATE managed_stores SET name = $1 WHERE id = $2`, [newName, store.id]);
    }

    await client.query('COMMIT');
    console.log("Database successfully cleaned up!");
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("Error:", e);
  } finally {
    client.release();
    pool.end();
  }
}

fixDb();
