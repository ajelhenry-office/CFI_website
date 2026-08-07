import { useCallback, useEffect, useMemo, useState } from "react";
import { C, FONT, cardStyle, pillButton } from "../../theme";
import { getAuthHeaders, handleApiError } from "../../api";
import StoreCard from "./StoreCard";
import ToggleSidebar from "./ToggleSidebar";
import MultiSearchableSelect from "./MultiSearchableSelect";
import BulkProgressIsland from "./BulkProgressIsland";
import AuditModal from "./AuditModal";
import ManageStoresModal from "./ManageStoresModal";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (handleApiError(res)) return { success: false, error: "Session expired" };
  return res.json();
}

const selectStyle = { padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.primary}`, color: C.primary, fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer", outline: "none" };

export default function TogglePage({ userRole }) {
  const [stores, setStores] = useState([]);
  
  // Pending filters (multi-select)
  const [brand, setBrand] = useState([]);
  const [zone, setZone] = useState([]);
  const [city, setCity] = useState([]);
  const [area, setArea] = useState([]);
  const [search, setSearch] = useState("");
  
  // Active filters (applied when "Apply" is clicked)
  const [activeFilters, setActiveFilters] = useState({ brand: [], zone: [], city: [], area: [], search: "" });
  
  const [statusFilter, setStatusFilter] = useState("Total");
  const [sidebarData, setSidebarData] = useState(null);
  const [isBulking, setIsBulking] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [storeStates, setStoreStates] = useState({});

  const canManageStores = ["admin", "control_tower", "clock_tower"].includes(String(userRole).toLowerCase().replace(/ /g, '_'));

  const handleBrandChange = (b) => { setBrand(b); setZone([]); setCity([]); setArea([]); };
  const handleZoneChange = (z) => { setZone(z); setCity([]); setArea([]); };
  const handleCityChange = (c) => { setCity(c); setArea([]); };

  const handleApply = () => {
    setActiveFilters({ brand, zone, city, area, search });
  };

  const handleClear = () => {
    setBrand([]);
    setZone([]);
    setCity([]);
    setArea([]);
    setSearch("");
    setActiveFilters({ brand: [], zone: [], city: [], area: [], search: "" });
  };

  const fetchSidebar = useCallback(() => {
    fetch(`${API_BASE}/api/toggle/stores`, { headers: getAuthHeaders() })
      .then((r) => { handleApiError(r); return r.json(); })
      .then((d) => { if (d.data) setStores(d.data); })
      .catch(() => {});

    fetch(`${API_BASE}/api/toggle/sidebar-data`, { headers: getAuthHeaders() })
      .then((r) => { handleApiError(r); return r.json(); })
      .then((d) => setSidebarData(d.data || null))
      .catch(() => {});
      
    fetch(`${API_BASE}/api/toggle/store-states`, { headers: getAuthHeaders() })
      .then((r) => { handleApiError(r); return r.json(); })
      .then((d) => {
        if (d.data) {
           const map = {};
           d.data.forEach(st => map[st.location_id] = st);
           setStoreStates(map);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSidebar();
    const timer = setInterval(fetchSidebar, 15000);
    return () => clearInterval(timer);
  }, [fetchSidebar]);

  const brandsList = useMemo(() => [...new Set(stores.map(s => s.brand).filter(Boolean))].sort(), [stores]);
  
  const zonesList = useMemo(() => {
    const list = stores.filter(s => brand.length === 0 || brand.includes(s.brand))
                       .map(s => s.zone)
                       .filter(Boolean);
    return [...new Set(list)].sort();
  }, [stores, brand]);

  const citiesList = useMemo(() => {
    const list = stores.filter(s => 
                          (brand.length === 0 || brand.includes(s.brand)) &&
                          (zone.length === 0 || zone.includes(s.zone))
                       )
                       .map(s => s.city)
                       .filter(Boolean);
    return [...new Set(list)].sort();
  }, [stores, brand, zone]);

  const areasList = useMemo(() => {
    const list = stores.filter(s => 
                          (brand.length === 0 || brand.includes(s.brand)) &&
                          (zone.length === 0 || zone.includes(s.zone)) &&
                          (city.length === 0 || city.includes(s.city))
                       )
                       .map(s => s.name)
                       .filter(Boolean);
    return [...new Set(list)].sort();
  }, [stores, brand, zone, city]);

  const baseFiltered = useMemo(() => {
    const q = activeFilters.search.toLowerCase();
    return stores.filter((s) => {
      if (activeFilters.brand.length > 0 && !activeFilters.brand.includes(s.brand)) return false;
      if (activeFilters.zone.length > 0 && !activeFilters.zone.includes(s.zone)) return false;
      if (activeFilters.city.length > 0 && !activeFilters.city.includes(s.city)) return false;
      if (activeFilters.area.length > 0 && !activeFilters.area.includes(s.name)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.location_id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stores, activeFilters]);

  const onlineCount = baseFiltered.filter((s) => s.status === "online").length;
  const offlineCount = baseFiltered.length - onlineCount;

  const filtered = useMemo(() => {
    if (statusFilter === "Total") return baseFiltered;
    return baseFiltered.filter(s => s.status === statusFilter.toLowerCase());
  }, [baseFiltered, statusFilter]);

  const handleToggle = async (store, action) => {
    const res = await post("/api/toggle", {
      location_id: store.location_id,
      store_name: store.name,
      action,
      brand: store.brand.toLowerCase().replace(/[^a-z]/g, "_"),
    });
    if (res.success) {
      setStores((prev) => prev.map((s) => s.id === store.id ? { ...s, status: action === "enable" ? "online" : "offline" } : s));
      fetchSidebar();
    } else {
      alert(`Toggle failed: ${res.error || "Unknown error"}`);
    }
  };

  const handleBulk = async (action) => {
    const targets = filtered.filter((s) => action === "enable" ? s.status !== "online" : s.status === "online");
    if (!targets.length) return;
    if (!confirm(`${action === "enable" ? "Enable" : "Disable"} ${targets.length} stores?`)) return;
    setIsBulking(true);
    const storePayload = targets.map((s) => ({
      location_id: s.location_id,
      store_name: s.name,
      brand: s.brand.toLowerCase().replace(/[^a-z]/g, "_"),
    }));
    const res = await post("/api/toggle/bulk", { stores: storePayload, action }).catch(() => null);
    if (res?.success) fetchSidebar();
    else if (res?.error) alert(`Bulk failed: ${res.error}`);
    setIsBulking(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONT }}>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 24 }}>
        
        {/* Top Header / Stats */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          
          <div style={{ background: "#0a1945", color: "#fff", padding: "12px 24px", borderRadius: 8, fontSize: 20, fontWeight: 700 }}>
            Minimal Icon Bar
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            <StatBox label="TOTAL" value={baseFiltered.length} color="#1e3a8a" bg="#f0fdfa" isActive={statusFilter === "Total"} onClick={() => setStatusFilter("Total")} />
            <StatBox label="ONLINE" value={onlineCount} color="#16a34a" bg="#f0fdf4" isActive={statusFilter === "Online"} onClick={() => setStatusFilter("Online")} />
            <StatBox label="OFFLINE" value={offlineCount} color="#dc2626" bg="#fef2f2" isActive={statusFilter === "Offline"} onClick={() => setStatusFilter("Offline")} />
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          background: "#fff", 
          border: "1px solid #e2e8f0", 
          borderRadius: 8, 
          padding: "12px 20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
          flexWrap: "wrap",
          gap: 16
        }}>
          
          <div style={{ display: "flex", flex: 1, minWidth: 400 }}>
            <MultiSearchableSelect options={brandsList} selectedValues={brand} onChange={handleBrandChange} placeholder="Brand" 
              customTrigger={(label) => <FilterItem icon={<IconBrand />} label="Brand" value={label} />} width="100%" />
            <Divider />
            <MultiSearchableSelect options={zonesList} selectedValues={zone} onChange={handleZoneChange} placeholder="Zone" 
              customTrigger={(label) => <FilterItem icon={<IconZone />} label="Zone" value={label} />} width="100%" />
            <Divider />
            <MultiSearchableSelect options={citiesList} selectedValues={city} onChange={handleCityChange} placeholder="City" 
              customTrigger={(label) => <FilterItem icon={<IconCity />} label="City" value={label} />} width="100%" />
            <Divider />
            <MultiSearchableSelect options={areasList} selectedValues={area} onChange={setArea} placeholder="Area" 
              customTrigger={(label) => <FilterItem icon={<IconArea />} label="Area" value={label} />} width="100%" />
          </div>

          <Divider />

          {/* Search & Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, paddingLeft: 16 }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
                <IconSearch />
              </span>
              <input 
                type="text" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search store ID / name..." 
                style={{ 
                  padding: "10px 10px 10px 36px", 
                  border: "1px solid #e2e8f0", 
                  borderRadius: 6, 
                  outline: "none",
                  width: 200,
                  fontSize: 13,
                  color: "#334155"
                }} 
              />
            </div>
            
            <button onClick={handleApply} style={{ padding: "10px 24px", background: "#0a1945", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Apply
            </button>
            <button onClick={handleClear} style={{ padding: "10px 12px", background: "none", color: "#2563eb", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Clear
            </button>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
          {(() => {
            const hasCakeZone = filtered.some(s => s.brand === "Cake Zone");
            return (
              <>
                <ActionButton 
                  icon={<IconEye />} 
                  label="Enable Visible" 
                  color="#16a34a" 
                  bg="#f0fdf4" 
                  borderColor="#bbf7d0"
                  onClick={() => handleBulk("enable")}
                  disabled={isBulking || hasCakeZone}
                  title={hasCakeZone ? "Bulk Actions are disabled for Cake Zone" : ""}
                />
                <ActionButton 
                  icon={<IconEyeOff />} 
                  label="Disable Visible" 
                  color="#ef4444" 
                  bg="#fef2f2" 
                  borderColor="#fecaca"
                  onClick={() => handleBulk("disable")}
                  disabled={isBulking || hasCakeZone}
                  title={hasCakeZone ? "Bulk Actions are disabled for Cake Zone" : ""}
                />
              </>
            );
          })()}
          {canManageStores && (
            <ActionButton 
              icon={<IconStore />} 
              label="Manage Stores" 
              color="#2563eb" 
              bg="#eff6ff" 
              borderColor="#bfdbfe" 
              onClick={() => setShowManage(true)}
            />
          )}
          <ActionButton 
            icon={<IconFile />} 
            label="Audit Log" 
            color="#9333ea" 
            bg="#faf5ff" 
            borderColor="#e9d5ff" 
            onClick={() => setShowAudit(true)}
          />
        </div>

      </div>

      {/* Store card grid */}
      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: C.muted }}>No stores match the current filters.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {filtered.map((store) => (
            <StoreCard 
              key={store.id} 
              store={store} 
              dbState={storeStates[store.location_id]}
              onToggle={handleToggle} 
              isBulking={isBulking} 
            />
          ))}
        </div>
      )}

      {/* Sidebar, bulk island, audit modal */}
      <ToggleSidebar data={sidebarData} fetchData={fetchSidebar} />
      <BulkProgressIsland activeBulkJob={sidebarData?.activeBulkJob} fetchData={fetchSidebar} />
      {showAudit && <AuditModal onClose={() => setShowAudit(false)} stores={stores} selectedBrands={activeFilters.brand} />}
      {showManage && <ManageStoresModal onClose={() => setShowManage(false)} refreshStores={fetchSidebar} stores={stores} />}
    </div>
  );
}

// --- Helper Components for Minimal Icon Bar ---

function StatBox({ label, value, color, bg, isActive, onClick }) {
  return (
    <button onClick={onClick} style={{ 
      background: isActive ? (bg || "#fff") : "#fff", 
      border: `2px solid ${isActive ? color : "#e2e8f0"}`, 
      borderRadius: 8, 
      padding: "12px 24px", 
      minWidth: 100,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      cursor: "pointer",
      outline: "none"
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: color, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color }}>
        {value}
      </div>
    </button>
  );
}

function FilterItem({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, padding: "0 16px", cursor: "pointer" }}>
      <div style={{ color: "#1e293b" }}>{icon}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 2 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>{value}</span>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 40, background: "#e2e8f0", flexShrink: 0 }} />;
}

function ActionButton({ icon, label, color, bg, borderColor, onClick, disabled, title }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ 
        flex: 1, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        gap: 10,
        padding: "16px",
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        color: color,
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Icons ---

function IconBrand() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>;
}
function IconZone() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>;
}
function IconCity() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;
}
function IconArea() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>;
}
function IconSearch() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
}
function IconEye() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
}
function IconEyeOff() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>;
}
function IconStore() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
}
function IconFile() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;
}
