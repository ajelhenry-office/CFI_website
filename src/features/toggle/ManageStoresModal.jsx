import { useState, useMemo } from "react";
import { C, FONT, pillButton } from "../../theme";
import SearchableSelect from "./SearchableSelect";
import { getAuthHeaders } from "../../api";
import useIsMobile from "../../useIsMobile";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  return res.json();
}

const emptyStoreRow = (lockedBrand) => ({ name: "", brand: lockedBrand || "", city: "", zone: "", location_id: "", status: "offline" });

export default function ManageStoresModal({ onClose, refreshStores, stores = [], lockedBrand = null }) {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  // One row per store being added — starts at 1, grows via "+ Add Another Store".
  // Submitting always goes through the bulk endpoint, whether there's 1 row or 10, so
  // there's only one code path to keep working instead of a separate single-store one.
  const [addRows, setAddRows] = useState([emptyStoreRow(lockedBrand)]);
  const [addError, setAddError] = useState("");
  // Per-store pass/fail from the last submit — shown instead of the form until
  // dismissed, so "which of these 4 actually went in" is never left to guesswork.
  const [addResults, setAddResults] = useState(null);
  const [search, setSearch] = useState("");
  const [pausingId, setPausingId] = useState(null); // location_id currently showing the reason prompt
  const [pauseReason, setPauseReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  const brandsList = useMemo(() => [...new Set(stores.map(s => s.brand).filter(Boolean))].sort(), [stores]);
  const zonesList = useMemo(() => [...new Set(stores.map(s => s.zone).filter(Boolean))].sort(), [stores]);
  const citiesList = useMemo(() => [...new Set(stores.map(s => s.city).filter(Boolean))].sort(), [stores]);

  const updateRow = (i, patch) => setAddRows(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setAddRows(rows => [...rows, emptyStoreRow(lockedBrand)]);
  const removeRow = (i) => setAddRows(rows => rows.filter((_, idx) => idx !== i));

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError("");
    setAddResults(null);
    const incomplete = addRows.some(r => !r.name || !r.brand || !r.location_id || !r.city || !r.zone);
    if (incomplete) {
      setAddError("Every store needs all fields filled in, including the current UrbanPiper status.");
      return;
    }
    setLoading(true);
    try {
      const data = await post("/api/toggle/stores/bulk", { stores: addRows });
      if (data.success) {
        setAddResults(data.results); // shown in place of the form until dismissed
        // Keep only the rows that failed, pre-filled — fixing and resubmitting
        // shouldn't mean retyping the ones that already went in fine. Falls back to
        // one empty row once everything succeeded.
        const stillNeeded = addRows.filter((_, i) => !data.results[i].success);
        setAddRows(stillNeeded.length > 0 ? stillNeeded : [emptyStoreRow(lockedBrand)]);
        refreshStores();
      } else {
        setAddError(data.error || "Failed to save stores.");
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
      <div style={{ backgroundColor: "#ffffff", borderRadius: 16, boxShadow: "0 16px 48px rgba(19,38,100,0.22)", width: "min(860px, 95vw)", padding: isMobile ? 16 : 30, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 24, height: isMobile ? "90vh" : "82vh" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: C.text }}>Manage Stores</h2>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Add, remove, or pause stores in the toggle system</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 24 }}>&times;</button>
        </div>

        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 24, flex: 1, overflow: isMobile ? "auto" : "hidden" }}>

          {/* Add Store Form — one or more rows, submitted together via the bulk endpoint */}
          <div style={{ flex: isMobile ? "0 0 auto" : "0 0 340px", display: "flex", flexDirection: "column", gap: 16, borderRight: isMobile ? "none" : `1px solid ${C.border}`, borderBottom: isMobile ? `1px solid ${C.border}` : "none", paddingRight: isMobile ? 0 : 24, paddingBottom: isMobile ? 16 : 0, overflowY: isMobile ? "visible" : "auto" }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.primary }}>Add New Store{addRows.length > 1 ? `s (${addRows.length})` : ""}</h3>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                Create the store in UrbanPiper first — each Location ID is checked live against UrbanPiper before it's saved here. Add several at once with "+ Add Another Store" below.
              </div>
            </div>

            {addResults ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {addResults.filter(r => r.success).length} added, {addResults.filter(r => !r.success).length} failed
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: isMobile ? "none" : 420, overflowY: "auto", paddingRight: 4 }}>
                  {addResults.map((r, i) => (
                    <div key={i} style={{
                      padding: "8px 10px", borderRadius: 8, fontSize: 12,
                      backgroundColor: r.success ? "#dcfce7" : "#fee2e2",
                      border: `1px solid ${r.success ? "#86efac" : "#fca5a5"}`,
                      color: r.success ? "#15803d" : "#b91c1c",
                    }}>
                      <div style={{ fontWeight: 700 }}>{r.success ? "✅" : "❌"} {r.name || r.location_id}</div>
                      {!r.success && <div style={{ marginTop: 2 }}>{r.error}</div>}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setAddResults(null)} style={{ ...pillButton(true), padding: "8px 14px", fontSize: 12 }}>
                  {addRows.some(r => r.location_id) ? "Fix Failed Stores" : "Add More Stores"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: isMobile ? "none" : 420, overflowY: isMobile ? "visible" : "auto", paddingRight: 4 }}>
                  {addRows.map((row, i) => (
                    <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
                      {addRows.length > 1 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted }}>Store {i + 1}</div>
                          <button type="button" onClick={() => removeRow(i)} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>&times;</button>
                        </>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Store Name</label>
                          <input required value={row.name} onChange={e => updateRow(i, { name: e.target.value })} style={inputStyle} placeholder="e.g. Indiranagar Kitchen" />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Brand</label>
                          {lockedBrand ? (
                            <div style={{ ...inputStyle, backgroundColor: "#f1f5f9", color: C.muted, cursor: "not-allowed" }}>
                              {lockedBrand}
                            </div>
                          ) : (
                            <SearchableSelect
                              options={brandsList}
                              value={row.brand}
                              onChange={v => updateRow(i, { brand: v })}
                              placeholder="Select or Type"
                              allowCustom={true}
                            />
                          )}
                        </div>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>UrbanPiper Location ID</label>
                        <input required value={row.location_id} onChange={e => updateRow(i, { location_id: e.target.value })} style={inputStyle} placeholder="e.g. STP-L-114623" />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>City</label>
                          <SearchableSelect
                            options={citiesList}
                            value={row.city}
                            onChange={v => updateRow(i, { city: v })}
                            placeholder="Select or Type"
                            allowCustom={true}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Zone</label>
                          <SearchableSelect
                            options={zonesList}
                            value={row.zone}
                            onChange={v => updateRow(i, { zone: v })}
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
                              onClick={() => updateRow(i, { status: s })}
                              style={{
                                flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 12, fontWeight: 800, fontFamily: FONT, cursor: "pointer",
                                border: `1.5px solid ${row.status === s ? (s === "online" ? "#15803d" : "#b91c1c") : C.border}`,
                                backgroundColor: row.status === s ? (s === "online" ? "#dcfce7" : "#fee2e2") : "#fff",
                                color: row.status === s ? (s === "online" ? "#15803d" : "#b91c1c") : C.muted,
                              }}
                            >
                              {s === "online" ? "Online" : "Offline"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addRow} style={{ ...pillButton(true), padding: "8px 14px", fontSize: 12 }}>
                  + Add Another Store
                </button>
                {addError && <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600, lineHeight: 1.5 }}>{addError}</div>}
                <button disabled={loading} type="submit" style={{ ...pillButton(false), marginTop: 8, padding: "10px 16px", backgroundColor: C.primary, color: "#fff", opacity: loading ? 0.7 : 1 }}>
                  {loading ? `Adding ${addRows.length} store${addRows.length > 1 ? "s" : ""}…` : `Add ${addRows.length} Store${addRows.length > 1 ? "s" : ""}`}
                </button>
              </form>
            )}
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
