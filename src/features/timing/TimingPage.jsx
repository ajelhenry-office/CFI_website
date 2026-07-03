import React, { useState } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

const TIME_OPTIONS = ["None"];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    const ampm = h < 12 ? 'AM' : 'PM';
    const hour12 = h % 12 || 12;
    const mins = m === 0 ? '00' : m;
    TIME_OPTIONS.push(`${hour12}:${mins} ${ampm}`);
  }
}

function TimingRow({ store }) {
  const [open1, setOpen1] = useState("10:00 AM");
  const [close1, setClose1] = useState("11:00 PM");
  const [open2, setOpen2] = useState("None");
  const [close2, setClose2] = useState("None");
  const [savingSlot, setSavingSlot] = useState(null);

  const handleSave = async (slotNumber) => {
    if (!store.zomato_id) {
      alert("Please add zomato_id to this store in your stores.js file to update Zomato.");
      return;
    }

    setSavingSlot(slotNumber);
    try {
      const response = await fetch(`${BACKEND_URL}/api/timing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: store.id,
          location_id: store.location_id || store.id || "",
          zomato_id: store.zomato_id,
          brand: store.brand,
          store_name: store.name,
          opening_time: open1,
          closing_time: close1,
          opening_time_2: open2,
          closing_time_2: close2,
          slot: slotNumber
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(`Backend Error: ${data.error}`);
      }
      setTimeout(() => setSavingSlot(null), 3000);
    } catch (error) {
      console.error("Connection error:", error);
      alert("Cannot connect to backend! Please open a second terminal and run 'node server.js'");
      setSavingSlot(null);
    }
  };

  const selectStyle = {
    background: "#ffffff",
    border: "1px solid #132664",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#132664",
    outline: "none",
    width: 110,
    fontSize: 12,
    fontWeight: "600",
    cursor: "pointer"
  };

  const btnStyle = (slot) => ({
    padding: "7px 14px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    border: "1px solid #132664",
    color: savingSlot === slot ? "#132664" : "#ffffff",
    background: savingSlot === slot ? "#ffffff" : "#132664",
    transition: "all 0.2s ease"
  });

  return (
    <div style={{ background: "#ffffff", border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: 12, padding: "16px 20px", marginBottom: 12, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 2px 6px rgba(19, 38, 100, 0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#132664" }}>{store.name}</div>
          <div style={{ fontSize: 10, color: "rgba(19, 38, 100, 0.6)", fontFamily: "ui-monospace, monospace", textTransform: "uppercase", marginTop: 2, fontWeight: "600" }}>
            {store.brand} {store.zomato_id ? `| ZOMATO: ${store.zomato_id}` : ""}
          </div>
        </div>
      </div>
      
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* SLOT 1 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(19, 38, 100, 0.03)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(19, 38, 100, 0.06)" }}>
          <span style={{ fontSize: 11, color: "#132664", fontWeight: 700 }}>SLOT 1:</span>
          <select value={open1} onChange={e => setOpen1(e.target.value)} style={selectStyle}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#132664", fontWeight: "600" }}>to</span>
          <select value={close1} onChange={e => setClose1(e.target.value)} style={selectStyle}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button style={btnStyle(1)} onClick={() => handleSave(1)} disabled={savingSlot !== null}>
            {savingSlot === 1 ? "✓ SAVED" : "APPLY S1"}
          </button>
        </div>

        {/* SLOT 2 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(19, 38, 100, 0.03)", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(19, 38, 100, 0.06)" }}>
          <span style={{ fontSize: 11, color: "#132664", fontWeight: 700 }}>SLOT 2:</span>
          <select value={open2} onChange={e => setOpen2(e.target.value)} style={selectStyle}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#132664", fontWeight: "600" }}>to</span>
          <select value={close2} onChange={e => setClose2(e.target.value)} style={selectStyle}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button style={btnStyle(2)} onClick={() => handleSave(2)} disabled={savingSlot !== null}>
            {savingSlot === 2 ? "✓ SAVED" : "APPLY S2"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimingPage({ stores, globalFilters }) {
  const [search, setSearch] = useState("");

  const filtered = stores.filter(s => {
    const matchBrand = !globalFilters?.brands || globalFilters.brands.length === 0 || globalFilters.brands.some(b => b.toLowerCase() === s.brand.toLowerCase());
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || (s.zomato_id && s.zomato_id.includes(search));
    return matchBrand && matchSearch;
  });

  return (
    <div style={{ padding: "32px 40px", overflowY: "auto", height: "100%", boxSizing: "border-box", backgroundColor: "#ffffff" }}>
      <div style={{ marginBottom: 20, padding: "16px", background: "rgba(19, 38, 100, 0.03)", borderRadius: 12, border: "1px solid #132664", borderLeft: "4px solid #132664" }}>
        <div style={{ fontSize: 11, color: "#132664", fontWeight: "800", fontFamily: "ui-monospace, monospace", marginBottom: 4, letterSpacing: "1px" }}>ZOMATO EXCLUSIVE PORTAL INTEGRATION</div>
        <div style={{ fontSize: 12, color: "rgba(19, 38, 100, 0.8)", lineHeight: "1.5" }}>
          Operating timings push directly to the partner portal listing database via custom automated jobs. Changes require up to 60 seconds to populate fully.
        </div>
      </div>
      
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: "#132664", fontWeight: "700" }}>{filtered.length} listings</span>
        <div style={{ display: "flex", alignItems: "center", background: "#ffffff", border: "1px solid #132664", borderRadius: 20, padding: "6px 14px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#132664" strokeWidth="2.5" style={{ marginRight: 8 }}>
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="text" 
            placeholder="Search Zomato ID or Store..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            style={{ background: "transparent", border: "none", outline: "none", color: "#132664", fontSize: 12, width: 220, fontWeight: "600" }} 
          />
        </div>
      </div>
      
      <div>
        {filtered.map(store => (
          <TimingRow key={store.id} store={store} />
        ))}
        {filtered.length === 0 && (
          <div style={{ color: "rgba(19, 38, 100, 0.6)", textAlign: "center", padding: "40px" }}>
            No stores found matching active search or filters.
          </div>
        )}
      </div>
    </div>
  );
}