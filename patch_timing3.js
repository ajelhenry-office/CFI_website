import fs from 'fs';

let content = fs.readFileSync('src/features/timing/TimingPage.jsx', 'utf8');

// 1. Restore the single Save button at the bottom of the accordion
const oldSaveBtns = `<div style={{ display: "flex", gap: 12 }}>
                        <button 
                          onClick={handleSave}
                          disabled={loading || selectedStores.length === 0}
                          style={{
                            padding: "10px 24px",
                            backgroundColor: loading || selectedStores.length === 0 ? "#d1d5db" : platformColor,
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: loading || selectedStores.length === 0 ? "not-allowed" : "pointer"
                          }}
                        >
                          {loading ? "Saving..." : "Save (Selected Store Only)"}
                        </button>
                        <button 
                          onClick={() => setShowBulkModal(true)}
                          disabled={loading || selectedStores.length === 0}
                          style={{
                            padding: "10px 24px",
                            backgroundColor: loading || selectedStores.length === 0 ? "#d1d5db" : "#111827",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: loading || selectedStores.length === 0 ? "not-allowed" : "pointer"
                          }}
                        >
                          Apply to Multiple Stores
                        </button>
                      </div>`;

const newSaveBtn = `<button 
                          onClick={handleSave}
                          disabled={loading || selectedStores.length === 0}
                          style={{
                            padding: "10px 24px",
                            backgroundColor: loading || selectedStores.length === 0 ? "#d1d5db" : platformColor,
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 15,
                            fontWeight: 500,
                            cursor: loading || selectedStores.length === 0 ? "not-allowed" : "pointer",
                            transition: "background-color 0.2s"
                          }}
                        >
                          {loading ? "Saving..." : "Save"}
                        </button>`;
content = content.replace(oldSaveBtns, newSaveBtn);

// 2. Add Clear and Bulk Apply buttons to the top filters
const oldFilters = `<button style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#4b5563", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          View on {activePlatform === "zomato" ? "Zomato" : "Swiggy"}
        </button>
      </div>`;

const newFilters = `<button style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#4b5563", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
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
content = content.replace(oldFilters, newFilters);

fs.writeFileSync('src/features/timing/TimingPage.jsx', content);
console.log("Patched UX successfully!");
