import { useState, useMemo } from "react";
import { C, FONT, pillButton } from "../../theme";
import SearchableSelect from "./SearchableSelect";
import { getAuthHeaders } from "../../api";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function ManageStoresModal({ onClose, refreshStores, stores = [] }) {
  const [loading, setLoading] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", brand: "", city: "", zone: "", location_id: "", status: "offline" });
  const [addError, setAddError] = useState("");
  const [search, setSearch] = useState("");
  const [pausingId, setPausingId] = useState(null); // location_id currently showing the reason prompt
  const [pauseReason, setPauseReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  const brandsList = useMemo(() => [...new Set(stores.map(s => s.brand).filter(Boolean))].sort(), [stores]);
  const zonesList = useMemo(() => [...new Set(stores.map(s => s.zone).filter(Boolean))].sort(), [stores]);
  const citiesList = useMemo(() => [...new Set(stores.map(s => s.city).filter(Boolean))].sort(), [stores]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError("");
    if (!addForm.name || !addForm.brand || !addForm.location_id || !addForm.city || !addForm.zone) {
      setAddError("All fields are required, including the current UrbanPiper status.");
      return;
    }
    setLoading(true);
    try {
      const data = await post("/api/toggle/stores", addForm);
      if (data.success) {
        setAddForm({ name: "", brand: "", city: "", zone: "", location_id: "", status: "offline" });
        refreshStores();
      } else {
        setAddError(data.error || "Failed to save store.");
      }
    } catch (err) {
      setAddError("Could not reach the server.");
    }
    setLoading(false);
  };

  const handleDelete = async (location_id, name) => {
    if (!confirm(`Remove "${name}" from our system? This does NOT delete anything in UrbanPiper — it only stops us tracking it here.`)) return;
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

  const confirmPause = async (location_id) => {
    setBusyId(location_id);
    const data = await post(`/api/toggle/stores/${location_id}/pause`, { reason: pauseReason });
    setBusyId(null);
    setPausingId(null);
    setPauseReason("");
    if (data.success) refreshStores();
    else alert(`Failed to pause: ${data.error}`);
  };

  const handleResume = async (location_id) => {
    setBusyId(location_id);
    const data = await post(`/api/toggle/stores/${location_id}/resume`, {});
    setBusyId(null);
    if (data.success) refreshStores();
    else alert(`Failed to resume: ${data.error}`);
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
      <div style={{ backgroundColor: "#ffffff", borderRadius: 16, boxShadow: "0 16px 48px rgba(19,38,100,0.22)", width: 860, padding: 30, display: "flex", flexDirection: "column", gap: 24, height: '82vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: C.text }}>Manage Stores</h2>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Add, remove, or pause stores in the toggle system</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 24 }}>&times;</button>
        </div>

        <div style={{ display: "flex", gap: 24, flex: 1, overflow: "hidden" }}>

          {/* Add Store Form */}
          <div style={{ flex: "0 0 320px", display: "flex", flexDirection: "column", gap: 16, borderRight: `1px solid ${C.border}`, paddingRight: 24, overflowY: "auto" }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.primary }}>Add New Store</h3>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                Create the store in UrbanPiper first — the Location ID is checked live against UrbanPiper before it's saved here.
              </div>
            </div>
            <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Store Name</label>
                  <input required value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} style={inputStyle} placeholder="e.g. Indiranagar Kitchen" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Brand</label>
                  <SearchableSelect
                    options={brandsList}
                    value={addForm.brand}
                    onChange={v => setAddForm({...addForm, brand: v})}
                    placeholder="Select or Type"
                    allowCustom={true}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>UrbanPiper Location ID</label>
                <input required value={addForm.location_id} onChange={e => setAddForm({...addForm, location_id: e.target.value})} style={inputStyle} placeholder="e.g. STP-L-114623" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>City</label>
                  <SearchableSelect
                    options={citiesList}
                    value={addForm.city}
                    onChange={v => setAddForm({...addForm, city: v})}
                    placeholder="Select or Type"
                    allowCustom={true}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Zone</label>
                  <SearchableSelect
                    options={zonesList}
                    value={addForm.zone}
                    onChange={v => setAddForm({...addForm, zone: v})}
                    placeholder="Select or Type"
                    allowCustom={true}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Current status in UrbanPiper</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["offline", "online"].map(s => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setAddForm({...addForm, status: s})}
                      style={{
                        flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 12, fontWeight: 800, fontFamily: FONT, cursor: "pointer",
                        border: `1.5px solid ${addForm.status === s ? (s === "online" ? "#15803d" : "#b91c1c") : C.border}`,
                        backgroundColor: addForm.status === s ? (s === "online" ? "#dcfce7" : "#fee2e2") : "#fff",
                        color: addForm.status === s ? (s === "online" ? "#15803d" : "#b91c1c") : C.muted,
                      }}
                    >
                      {s === "online" ? "Online" : "Offline"}
                    </button>
                  ))}
                </div>
              </div>
              {addError && <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600, lineHeight: 1.5 }}>{addError}</div>}
              <button disabled={loading} type="submit" style={{ ...pillButton(false), marginTop: 8, padding: "10px 16px", backgroundColor: C.primary, color: "#fff", opacity: loading ? 0.7 : 1 }}>
                {loading ? "Validating with UrbanPiper…" : "Add Store"}
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
              {filteredStores.map(s => {
                const busy = busyId === s.location_id;
                return (
                  <div key={s.location_id} style={{ padding: "12px 16px", backgroundColor: s.paused ? "#fffbeb" : "#f8fafc", borderRadius: 10, border: `1px solid ${s.paused ? "#fde68a" : C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{s.name}</div>
                          {s.paused && (
                            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#b45309", backgroundColor: "#fef3c7", borderRadius: 6, padding: "2px 7px" }}>⏸ PAUSED</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.brand} • {s.location_id} {s.city ? `• ${s.city}` : ''}</div>
                        {s.paused && s.pause_reason && (
                          <div style={{ fontSize: 11.5, color: "#b45309", marginTop: 4, fontStyle: "italic" }}>"{s.pause_reason}" — {s.paused_by}</div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {s.paused ? (
                          <button
                            onClick={() => handleResume(s.location_id)}
                            disabled={busy}
                            style={{ background: "#dcfce7", border: "1px solid #86efac", color: "#15803d", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            {busy ? "…" : "▶ Resume"}
                          </button>
                        ) : (
                          <button
                            onClick={() => { setPausingId(s.location_id); setPauseReason(""); }}
                            disabled={busy}
                            style={{ background: "#fef3c7", border: "1px solid #fde68a", color: "#b45309", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            ⏸ Pause
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(s.location_id, s.name)}
                          style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {pausingId === s.location_id && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.borderSoft}`, display: "flex", gap: 8 }}>
                        <input
                          autoFocus
                          value={pauseReason}
                          onChange={e => setPauseReason(e.target.value)}
                          placeholder="Reason (optional) — e.g. Renovation until further notice"
                          style={{ ...inputStyle, fontSize: 12, padding: "7px 10px" }}
                        />
                        <button onClick={() => confirmPause(s.location_id)} disabled={busy} style={{ background: "#b45309", color: "#fff", border: "none", borderRadius: 6, padding: "0 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                          {busy ? "Pausing…" : "Confirm"}
                        </button>
                        <button onClick={() => setPausingId(null)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "0 12px", fontSize: 11, cursor: "pointer" }}>
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
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
