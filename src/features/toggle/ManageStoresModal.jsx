import { useState } from "react";
import { C, FONT, pillButton } from "../../theme";
import { getAuthHeaders } from "../../api";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

export default function ManageStoresModal({ onClose, refreshStores, stores }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", brand: "", city: "", zone: "", location_id: "" });
  const [search, setSearch] = useState("");

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/toggle/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setFormData({ name: "", brand: "", city: "", zone: "", location_id: "" });
        refreshStores();
      } else {
        alert("Failed to save store: " + data.error);
      }
    } catch (err) {
      alert("Error saving store.");
    }
    setLoading(false);
  };

  const handleDelete = async (location_id, name) => {
    if (!confirm(`Are you sure you want to completely delete "${name}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/toggle/stores/${location_id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) refreshStores();
    } catch (err) {
      alert("Failed to delete store.");
    }
  };

  const filteredStores = stores.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.location_id.toLowerCase().includes(search.toLowerCase()) ||
    s.brand.toLowerCase().includes(search.toLowerCase())
  );

  const inputStyle = {
    padding: "10px 14px",
    borderRadius: 8,
    border: `1.5px solid ${C.border}`,
    outline: "none",
    fontFamily: FONT,
    fontSize: 13,
    color: C.text,
    backgroundColor: "#fff",
    width: "100%",
    boxSizing: "border-box"
  };

  return (
    <div 
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(19,38,100,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, fontFamily: FONT }} 
      onClick={onClose}
    >
      <div style={{ backgroundColor: "#ffffff", borderRadius: 16, boxShadow: "0 16px 48px rgba(19,38,100,0.22)", width: 800, padding: 30, display: "flex", flexDirection: "column", gap: 24, height: '80vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: C.text }}>Manage Stores</h2>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Add or remove stores from the toggle system</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 24 }}>&times;</button>
        </div>

        <div style={{ display: "flex", gap: 24, flex: 1, overflow: "hidden" }}>
          
          {/* Add Store Form */}
          <div style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", gap: 16, borderRight: `1px solid ${C.border}`, paddingRight: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.primary }}>Add New Store</h3>
            <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input required placeholder="Store Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={inputStyle} />
              <input required placeholder="Brand (e.g. Ovenfresh)" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} style={inputStyle} />
              <input required placeholder="Location ID" value={formData.location_id} onChange={e => setFormData({...formData, location_id: e.target.value})} style={inputStyle} />
              <input placeholder="City" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} style={inputStyle} />
              <input placeholder="Zone" value={formData.zone} onChange={e => setFormData({...formData, zone: e.target.value})} style={inputStyle} />
              <button disabled={loading} type="submit" style={{ ...pillButton(false), marginTop: 8, padding: "10px 16px", backgroundColor: C.primary, color: "#fff" }}>
                {loading ? "Saving..." : "Add Store"}
              </button>
            </form>
          </div>

          {/* Store List */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.primary }}>Existing Stores</h3>
              <input 
                placeholder="Search..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...inputStyle, width: 200, padding: "6px 12px", fontSize: 12 }} 
              />
            </div>
            
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 8 }}>
              {filteredStores.map(s => (
                <div key={s.location_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", backgroundColor: "#f8fafc", borderRadius: 10, border: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.brand} • {s.location_id} {s.city ? `• ${s.city}` : ''}</div>
                  </div>
                  <button 
                    onClick={() => handleDelete(s.location_id, s.name)}
                    style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {filteredStores.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>No stores found.</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
