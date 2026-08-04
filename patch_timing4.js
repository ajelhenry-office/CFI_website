import fs from 'fs';

let content = fs.readFileSync('src/features/timing/TimingPage.jsx', 'utf8');

const oldFilters = `<button style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#4b5563", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          View on {activePlatform === "zomato" ? "Zomato" : "Swiggy"}
        </button>
        
        <button 
          onClick={() => { setSelectedBrands([]); setSelectedStores([]); }}
          style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #ef4444", backgroundColor: "#fef2f2", color: "#ef4444", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
        >
          Clear
        </button>
        
        <button 
          onClick={() => setShowBulkModal(true)}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", backgroundColor: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", marginLeft: "auto" }}
        >
          Apply to Multiple Stores
        </button>
      </div>`;

const newFilters = `<button 
          onClick={() => setShowBulkModal(true)}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", backgroundColor: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
        >
          Apply to Multiple Stores
        </button>
        
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button 
            onClick={() => { /* Apply placeholder as requested */ }}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #10b981", backgroundColor: "#ecfdf5", color: "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Apply
          </button>
          <button 
            onClick={() => { setSelectedBrands([]); setSelectedStores([]); }}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ef4444", backgroundColor: "#fef2f2", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
      </div>`;

content = content.replace(oldFilters, newFilters);
fs.writeFileSync('src/features/timing/TimingPage.jsx', content);
console.log("Patched successfully.");
