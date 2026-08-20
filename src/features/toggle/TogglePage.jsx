import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { C, FONT, cardStyle, pillButton } from "../../theme";
import { getAuthHeaders, handleApiError } from "../../api";
import StoreCard from "./StoreCard";
import ToggleSidebar from "./ToggleSidebar";
import MultiSearchableSelect from "./MultiSearchableSelect";
import AuditModal from "./AuditModal";
import ManageStoresModal from "./ManageStoresModal";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

// The 3 real, day-to-day brands — each run by a different person, each its own
// independent workspace. Ovenfresh (and anything else) is test-only: it never gets a
// tile, it's only reachable from Home by picking it explicitly in the Brand filter.
const REAL_BRANDS = [
  { key: "olio", label: "Olio" },
  { key: "eatfit", label: "EatFit" },
  { key: "cake_zone", label: "CakeZone" },
];
const normalizeBrand = (b) => String(b || "").toLowerCase().replace(/[^a-z]/g, "_");

async function post(path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (handleApiError(res)) return { success: false, error: "Session expired" };

    if (!res.ok) {
      try {
        const data = await res.json();
        return { success: false, error: data.error || `HTTP ${res.status}`, conflictingJob: data.conflictingJob };
      } catch (e) {
        return { success: false, error: `HTTP ${res.status} from server` };
      }
    }
    return res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const selectStyle = { padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.primary}`, color: C.primary, fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer", outline: "none" };

export default function TogglePage({ userRole, userRoles }) {
  const [stores, setStores] = useState([]);

  // null = Home (all-brands, view-only). Otherwise one of REAL_BRANDS[].key, or a
  // normalized non-tile brand key (e.g. "ovenfresh") entered via the Home filter.
  const [selectedBrand, setSelectedBrand] = useState(null);

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
  // Every brand's active bulk jobs, regardless of which workspace is open — feeds the
  // Status sidebar's Jobs tab. Home's sidebarData is already all-brand, so this only
  // needs its own fetch while a specific brand workspace has sidebarData scoped down.
  const [globalActiveJobs, setGlobalActiveJobs] = useState([]);
  const [isBulking, setIsBulking] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [storeStates, setStoreStates] = useState({});
  const [freezeBusy, setFreezeBusy] = useState(false);

  // An employee can hold more than one role — check the full set so Control Tower
  // still grants store-management access even when it's a secondary role, not just
  // whichever single role happened to be passed down.
  const normalize = (r) => String(r).toLowerCase().replace(/ /g, '_');
  const roleSet = (userRoles && userRoles.length ? userRoles : [userRole]).map(normalize);
  const canManageStores = roleSet.some(r => ["super_admin", "admin", "control_tower"].includes(r));
  const isAdmin = roleSet.some(r => ["super_admin", "admin"].includes(r));

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

  // Entering or leaving a brand workspace starts filters fresh — each brand (and Home)
  // is its own independent context, so a Zone filter picked inside CakeZone shouldn't
  // silently carry into Olio.
  const enterBrand = (key) => { handleClear(); setStatusFilter("Total"); setSelectedBrand(key); };
  const goHome = () => { handleClear(); setStatusFilter("Total"); setSelectedBrand(null); };

  const fetchSidebar = useCallback(() => {
    fetch(`${API_BASE}/api/toggle/stores`, { headers: getAuthHeaders() })
      .then((r) => { handleApiError(r); return r.json(); })
      .then((d) => { if (d.data) setStores(d.data); })
      .catch(() => {});

    // Home fetches the all-brand aggregate (no ?brand=); a brand workspace scopes
    // every section of this response (health, jobs, activity, problems, stats, frozen)
    // to just that one brand.
    const sidebarUrl = selectedBrand
      ? `${API_BASE}/api/toggle/sidebar-data?brand=${selectedBrand}`
      : `${API_BASE}/api/toggle/sidebar-data`;
    fetch(sidebarUrl, { headers: getAuthHeaders() })
      .then((r) => { handleApiError(r); return r.json(); })
      .then((d) => setSidebarData(d.data || null))
      .catch(() => {});

    // The Status sidebar's Jobs tab always shows every brand's active jobs — only
    // needs its own fetch while inside a brand workspace, where the fetch above is
    // scoped down to just that brand.
    if (selectedBrand) {
      fetch(`${API_BASE}/api/toggle/sidebar-data`, { headers: getAuthHeaders() })
        .then((r) => { handleApiError(r); return r.json(); })
        .then((d) => setGlobalActiveJobs(d.data?.activeBulkJobs || []))
        .catch(() => {});
    }

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
  }, [selectedBrand]);

  useEffect(() => {
    fetchSidebar();
    const timer = setInterval(fetchSidebar, 15000);
    return () => clearInterval(timer);
  }, [fetchSidebar]);

  const brandsList = useMemo(() => [...new Set(stores.map(s => s.brand).filter(Boolean))].sort(), [stores]);

  // Store count per real brand, for the Home tiles.
  const brandCounts = useMemo(() => {
    const counts = {};
    REAL_BRANDS.forEach(b => { counts[b.key] = 0; });
    stores.forEach(s => {
      const k = normalizeBrand(s.brand);
      if (counts[k] !== undefined) counts[k]++;
    });
    return counts;
  }, [stores]);

  // The exact, as-stored casing/spacing for each brand key (e.g. "Cake Zone", "eatfit")
  // — REAL_BRANDS' `label` is a cosmetic tile name and does NOT necessarily normalize
  // back to the same key (e.g. "CakeZone" normalizes to "cakezone", not "cake_zone"), so
  // anything that gets submitted back to the API (Add Store's brand field, Audit Log's
  // brand filter) must use this instead of the tile label.
  const rawBrandByKey = useMemo(() => {
    const map = {};
    stores.forEach(s => {
      const k = normalizeBrand(s.brand);
      if (!(k in map)) map[k] = s.brand;
    });
    return map;
  }, [stores]);
  const rawBrandLabel = (key) => rawBrandByKey[key] || REAL_BRANDS.find(b => b.key === key)?.label || key;

  // Drives the Zone/City/Area dropdown *options* — mirrors the pending (not-yet-applied)
  // Brand filter on Home so those options narrow live as soon as a brand is picked, same
  // as before. Inside a brand workspace it's just that brand's stores.
  const pendingScopedStores = useMemo(() => {
    if (selectedBrand) return stores.filter(s => normalizeBrand(s.brand) === selectedBrand);
    if (brand.length > 0) return stores.filter(s => brand.includes(s.brand));
    const realKeys = new Set(REAL_BRANDS.map(b => b.key));
    return stores.filter(s => realKeys.has(normalizeBrand(s.brand)));
  }, [stores, selectedBrand, brand]);

  const zonesList = useMemo(() => {
    const list = pendingScopedStores.map(s => s.zone).filter(Boolean);
    return [...new Set(list)].sort();
  }, [pendingScopedStores]);

  const citiesList = useMemo(() => {
    const list = pendingScopedStores.filter(s => zone.length === 0 || zone.includes(s.zone))
                       .map(s => s.city)
                       .filter(Boolean);
    return [...new Set(list)].sort();
  }, [pendingScopedStores, zone]);

  const areasList = useMemo(() => {
    const list = pendingScopedStores.filter(s =>
                          (zone.length === 0 || zone.includes(s.zone)) &&
                          (city.length === 0 || city.includes(s.city))
                       )
                       .map(s => s.name)
                       .filter(Boolean);
    return [...new Set(list)].sort();
  }, [pendingScopedStores, zone, city]);

  // The actual grid/stats scope: on Home this is the 3 real brands unless the applied
  // Brand filter narrows it further (that's how Ovenfresh stays reachable without a
  // tile); inside a brand workspace it's always just that one brand, full stop.
  const scopedStores = useMemo(() => {
    if (selectedBrand) return stores.filter(s => normalizeBrand(s.brand) === selectedBrand);
    if (activeFilters.brand.length > 0) return stores.filter(s => activeFilters.brand.includes(s.brand));
    const realKeys = new Set(REAL_BRANDS.map(b => b.key));
    return stores.filter(s => realKeys.has(normalizeBrand(s.brand)));
  }, [stores, selectedBrand, activeFilters.brand]);

  const baseFiltered = useMemo(() => {
    const q = activeFilters.search.toLowerCase();
    return scopedStores.filter((s) => {
      if (activeFilters.zone.length > 0 && !activeFilters.zone.includes(s.zone)) return false;
      if (activeFilters.city.length > 0 && !activeFilters.city.includes(s.city)) return false;
      if (activeFilters.area.length > 0 && !activeFilters.area.includes(s.name)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.location_id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scopedStores, activeFilters]);

  const onlineCount = baseFiltered.filter((s) => s.status === "online").length;
  const offlineCount = baseFiltered.length - onlineCount;

  const filtered = useMemo(() => {
    if (statusFilter === "Total") return baseFiltered;
    return baseFiltered.filter(s => s.status === statusFilter.toLowerCase());
  }, [baseFiltered, statusFilter]);

  // Home-only: if the applied Brand filter narrows down to exactly one brand that
  // isn't one of the 3 tiles (i.e. Ovenfresh), offer a way to actually enter it —
  // otherwise it'd be visible but permanently un-actionable.
  const singleNonTileBrand = useMemo(() => {
    if (selectedBrand || activeFilters.brand.length !== 1) return null;
    const key = normalizeBrand(activeFilters.brand[0]);
    return REAL_BRANDS.some(b => b.key === key) ? null : { key, label: activeFilters.brand[0] };
  }, [selectedBrand, activeFilters.brand]);

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

  // Brands currently in view, so we can tell if the active job (if any) actually
  // overlaps with what these buttons would touch — an unrelated brand's job running
  // shouldn't block this one.
  const filteredBrandSlugs = useMemo(
    () => new Set(filtered.map(s => s.brand.toLowerCase().replace(/[^a-z]/g, "_"))),
    [filtered]
  );
  // Different brands run concurrently as separate jobs (see initiateBulkJob's per-brand
  // overlap lock server-side) — so this checks ALL currently active jobs, not just one,
  // for whichever (if any) overlaps the brands currently in view.
  const activeJobs = sidebarData?.activeBulkJobs || [];
  const conflictingJob = activeJobs.find(
    (job) => ["RUNNING", "PAUSED"].includes(job.status) && job.brands?.some((b) => filteredBrandSlugs.has(b))
  ) || null;

  const handleBulk = async (action) => {
    // Send every currently-filtered store, regardless of our own possibly-stale local
    // status — this must hit UrbanPiper for all of them, not just ones we think need it.
    const targets = filtered;
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
    else if (res?.conflictingJob) {
      const j = res.conflictingJob;
      alert(`Can't start — a bulk job is already running for ${j.brands.join(", ")}.\nStarted by ${j.actor_email}, ${j.total_stores - j.pending_count}/${j.total_stores} done.\nWait for it to finish or cancel it below.`);
    }
    else if (res?.error) alert(`Bulk failed: ${res.error}`);
    setIsBulking(false);
  };

  const handleFreeze = async (frozen) => {
    setFreezeBusy(true);
    const res = await post("/api/toggle/freeze", { frozen, brand: selectedBrand });
    setFreezeBusy(false);
    if (res?.success) fetchSidebar();
    else alert(`Freeze action failed: ${res?.error || "Unknown error"}`);
  };

  // The as-stored brand value (not the cosmetic tile label) — this is what actually
  // gets submitted to the API from inside this workspace (Add Store, Audit Log filter).
  const brandLabel = selectedBrand ? rawBrandLabel(selectedBrand) : null;

  // Full-brand freeze — a manual, DB-backed kill switch admins can flip per brand when
  // that brand's store changes need to stop entirely (e.g. a testing window). No store
  // cards, no buttons, nothing that could start a real UrbanPiper action gets rendered
  // at all. Home and the other two brands are unaffected.
  if (selectedBrand && sidebarData?.frozen) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, fontFamily: FONT, textAlign: "center" }}>
        <button onClick={goHome} style={{ ...selectStyle, alignSelf: "flex-start" }}>← All Brands</button>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.primary }}>{brandLabel} Workspace Frozen</div>
        <div style={{ fontSize: 14, color: C.muted, maxWidth: 420, lineHeight: 1.6 }}>
          No store changes can be made for {brandLabel} right now — manual toggles, bulk actions, and store management are all paused for testing. This will be unlocked once testing is confirmed.
        </div>
        {isAdmin && (
          <button disabled={freezeBusy} onClick={() => handleFreeze(false)} style={{ ...pillButton(true), padding: "10px 20px" }}>
            {freezeBusy ? "Unfreezing…" : `Unfreeze ${brandLabel}`}
          </button>
        )}
      </div>
    );
  }

  const headerActionsNode = document.getElementById("header-actions");

  const statsContent = (
    <div style={{ display: "flex", gap: 12 }}>
      <StatBox label="TOTAL" value={baseFiltered.length} color="#1e3a8a" bg="#f0fdfa" isActive={statusFilter === "Total"} onClick={() => setStatusFilter("Total")} />
      <StatBox label="ONLINE" value={onlineCount} color="#16a34a" bg="#f0fdf4" isActive={statusFilter === "Online"} onClick={() => setStatusFilter("Online")} />
      <StatBox label="OFFLINE" value={offlineCount} color="#dc2626" bg="#fef2f2" isActive={statusFilter === "Offline"} onClick={() => setStatusFilter("Offline")} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONT }}>
      {headerActionsNode && createPortal(statsContent, headerActionsNode)}

      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 24 }}>

        {selectedBrand && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={goHome} style={selectStyle}>← All Brands</button>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>{brandLabel} Workspace</div>
            </div>
            {isAdmin && (
              <button
                disabled={freezeBusy}
                onClick={() => { if (confirm(`Freeze the ${brandLabel} workspace? No store changes will be possible until it's unfrozen.`)) handleFreeze(true); }}
                style={{ ...selectStyle, borderColor: "#dc2626", color: "#dc2626" }}
              >
                {freezeBusy ? "…" : "🔒 Freeze"}
              </button>
            )}
          </div>
        )}

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

          <div style={{ display: "flex", flex: 1, minWidth: selectedBrand ? 300 : 400 }}>
            {!selectedBrand && (
              <>
                <MultiSearchableSelect options={brandsList} selectedValues={brand} onChange={handleBrandChange} placeholder="Brand"
                  customTrigger={(label) => <FilterItem icon={<IconBrand />} label="Brand" value={label === "Brand" ? "All" : label} />} width="100%" />
                <Divider />
              </>
            )}
            <MultiSearchableSelect options={zonesList} selectedValues={zone} onChange={handleZoneChange} placeholder="Zone"
              customTrigger={(label) => <FilterItem icon={<IconZone />} label="Zone" value={label === "Zone" ? "All" : label} />} width="100%" />
            <Divider />
            <MultiSearchableSelect options={citiesList} selectedValues={city} onChange={handleCityChange} placeholder="City"
              customTrigger={(label) => <FilterItem icon={<IconCity />} label="City" value={label === "City" ? "All" : label} />} width="100%" />
            <Divider />
            <MultiSearchableSelect options={areasList} selectedValues={area} onChange={setArea} placeholder="Area"
              customTrigger={(label) => <FilterItem icon={<IconArea />} label="Area" value={label === "Area" ? "All" : label} />} width="100%" />
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

            <button onClick={handleApply} style={{ padding: "10px 24px", background: "#0a1945", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
              Apply
            </button>
            <button onClick={handleClear} style={{ padding: "10px 24px", background: "#0a1945", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
              Clear
            </button>
          </div>
        </div>

        {/* Home: brand workspace tiles. Brand view: the real action buttons. */}
        {!selectedBrand ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {singleNonTileBrand && (
              <div style={{ ...cardStyle, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: C.muted }}>Showing only <strong style={{ color: C.primary }}>{singleNonTileBrand.label}</strong> — this is a test brand, not one of the 3 workspaces.</span>
                <button onClick={() => enterBrand(singleNonTileBrand.key)} style={{ ...selectStyle }}>
                  Enter {singleNonTileBrand.label} workspace →
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {REAL_BRANDS.map((b) => (
                <BrandTile key={b.key} label={rawBrandLabel(b.key)} count={brandCounts[b.key] || 0} onClick={() => enterBrand(b.key)} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
            <ActionButton
              icon={<IconPower />}
              label="Bulk Enable"
              color="#16a34a"
              bg="#f0fdf4"
              borderColor="#bbf7d0"
              onClick={() => handleBulk("enable")}
              disabled={isBulking || !!conflictingJob}
              title={conflictingJob ? `A bulk job for ${conflictingJob.brands.join(", ")} is already running (started by ${conflictingJob.actor_email})` : undefined}
            />
            <ActionButton
              icon={<IconPower />}
              label="Bulk Disable"
              color="#ef4444"
              bg="#fef2f2"
              borderColor="#fecaca"
              onClick={() => handleBulk("disable")}
              disabled={isBulking || !!conflictingJob}
              title={conflictingJob ? `A bulk job for ${conflictingJob.brands.join(", ")} is already running (started by ${conflictingJob.actor_email})` : undefined}
            />
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
        )}

      </div>

      {/* Store card grid — read-only on Home, fully interactive inside a brand workspace */}
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
              readOnly={!selectedBrand}
            />
          ))}
        </div>
      )}

      {/* Status sidebar — Jobs tab (any bulk job, any brand, manual or automated) is
          always available including from Home, so staff check status on their own
          instead of a popup interrupting them. Health/Recent/Problems only apply once
          a specific brand workspace is open. */}
      <ToggleSidebar
        data={sidebarData}
        jobs={selectedBrand ? globalActiveJobs : (sidebarData?.activeBulkJobs || [])}
        hasBrandContext={!!selectedBrand}
        fetchData={fetchSidebar}
        currentUserEmail={JSON.parse(localStorage.getItem("user") || "{}").email}
        isAdmin={isAdmin}
      />
      {showAudit && <AuditModal onClose={() => setShowAudit(false)} stores={stores} selectedBrands={selectedBrand ? [brandLabel] : activeFilters.brand} />}
      {showManage && <ManageStoresModal onClose={() => setShowManage(false)} refreshStores={fetchSidebar} stores={scopedStores} lockedBrand={brandLabel} />}
    </div>
  );
}

// --- Helper Components for Minimal Icon Bar ---

function StatBox({ label, value, color, bg, isActive, onClick }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: isActive ? (bg || "#fff") : "#fff",
        border: `1.5px solid ${isActive ? color : (isHovered ? "#cbd5e1" : "#e2e8f0")}`,
        borderRadius: 8,
        padding: "8px 16px",
        minWidth: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        cursor: "pointer",
        outline: "none",
        transition: "all 0.2s ease",
        boxShadow: isActive ? `0 2px 8px ${color}33` : (isHovered ? "0 2px 4px rgba(0,0,0,0.05)" : "none"),
        transform: isHovered && !isActive ? "translateY(-1px)" : "none"
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: color, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color }}>
        {value}
      </div>
    </button>
  );
}

function BrandTile({ label, count, onClick }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        flex: "1 1 220px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "28px 20px",
        background: "#fff",
        border: `1.5px solid ${isHovered ? C.primary : "#e2e8f0"}`,
        borderRadius: 12,
        cursor: "pointer",
        boxShadow: isHovered ? "0 8px 24px rgba(19,38,100,0.12)" : "0 2px 8px rgba(19,38,100,0.04)",
        transform: isHovered ? "translateY(-2px)" : "none",
        transition: "all 0.2s ease",
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>{label}</div>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{count} store{count === 1 ? "" : "s"}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, marginTop: 4 }}>Enter workspace →</div>
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
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>;
}
function IconZone() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>;
}
function IconCity() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;
}
function IconArea() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>;
}
function IconSearch() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
}
function IconPower() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>;
}
function IconStore() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
}
function IconFile() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;
}
