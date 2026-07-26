import React, { useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";
import TogglePage from "./features/toggle/TogglePage";
import RatingsPage from "./features/ratings/RatingsPage";
import TimingPage from "./features/timing/TimingPage";
import ReviewsPage from "./features/reviews/ReviewsPage";
import RouteBackfillingPage from "./features/backfilling/RouteBackfillingPage";
import { STORES } from "./features/toggle/stores";
import { ZOMATO_STORES } from "../zomato_data";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

// Simple UI Views for Settings, Theme, and Logout
function SettingsView() {
  return (
    <div style={{ padding: "32px 40px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <h2 style={{ fontSize: "22px", marginBottom: "8px", color: "#132664" }}>Settings</h2>
      <p style={{ color: "rgba(19, 38, 100, 0.7)", marginBottom: "24px" }}>Configure dashboard and integration systems.</p>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "600px" }}>
        <div style={{ padding: "20px", border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: "12px", backgroundColor: "#ffffff" }}>
          <h3 style={{ fontSize: "15px", marginBottom: "8px", color: "#132664" }}>User Profile</h3>
          <div style={{ fontSize: "13px", color: "rgba(19, 38, 100, 0.8)", display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px 12px" }}>
            <span style={{ fontWeight: "600" }}>Name:</span><span>Curefoods Admin</span>
            <span style={{ fontWeight: "600" }}>Email:</span><span>admin@curefoods.in</span>
            <span style={{ fontWeight: "600" }}>Role:</span><span>Operations Manager</span>
          </div>
        </div>
        
        <div style={{ padding: "20px", border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: "12px", backgroundColor: "#ffffff" }}>
          <h3 style={{ fontSize: "15px", marginBottom: "8px", color: "#132664" }}>Connected Platforms</h3>
          <div style={{ fontSize: "13px", color: "rgba(19, 38, 100, 0.8)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Swiggy API Status</span><span style={{ fontWeight: "700" }}>Connected</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Zomato partner portal API</span><span style={{ fontWeight: "700" }}>Connected</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Google reviews API</span><span style={{ fontWeight: "700" }}>Connected</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeView() {
  return (
    <div style={{ padding: "32px 40px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <h2 style={{ fontSize: "22px", marginBottom: "8px", color: "#132664" }}>System Theme</h2>
      <p style={{ color: "rgba(19, 38, 100, 0.7)", marginBottom: "24px" }}>Manage visual preferences.</p>
      
      <div style={{ padding: "20px", border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: "12px", maxWidth: "600px", backgroundColor: "#ffffff" }}>
        <h3 style={{ fontSize: "15px", marginBottom: "8px", color: "#132664" }}>Visual Configuration Locked</h3>
        <p style={{ fontSize: "13px", color: "rgba(19, 38, 100, 0.8)", lineHeight: "1.6" }}>
          Your organization has locked the dashboard template to the premium **Monochrome Royal Blue & White** palette to maintain compliance with brand design standards.
        </p>
        <div style={{ marginTop: "16px", display: "inline-flex", padding: "8px 16px", backgroundColor: "#132664", color: "#ffffff", borderRadius: "8px", fontWeight: "600", fontSize: "12px" }}>
          Active Theme: Royal Blue (#132664) & White
        </div>
      </div>
    </div>
  );
}

function LogoutView({ onLogin }) {
  return (
    <div style={{ display: "flex", flex: 1, height: "100%", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: "40px", textAlign: "center", backgroundColor: "#ffffff" }}>
      <div style={{ width: "80px", height: "80px", borderRadius: "50%", border: "2px solid #132664", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px", color: "#132664" }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </div>
      <h2 style={{ fontSize: "24px", marginBottom: "12px", color: "#132664" }}>Logged Out</h2>
      <p style={{ color: "rgba(19, 38, 100, 0.7)", marginBottom: "32px", maxWidth: "400px", fontSize: "14px" }}>
        You have successfully logged out of the Curefoods dashboard. Your session was ended securely.
      </p>
      <button 
        onClick={onLogin} 
        style={{ padding: "12px 28px", backgroundColor: "#132664", color: "#ffffff", border: "none", borderRadius: "24px", fontWeight: "700", cursor: "pointer", fontSize: "14px" }}
      >
        Sign In Again
      </button>
    </div>
  );
}

// Checkbox popover filter sub-component
function CheckboxFilterPopover({ label, filterKey, optionsList, selectedValues, onToggle, showSearch = false, styles }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filtered = optionsList.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));

  const triggerLabel = selectedValues.length > 0
    ? `${label} (${selectedValues.length})`
    : `${label}: All`;

  return (
    <div style={{ position: "relative" }} ref={popoverRef}>
      <button 
        style={styles.filterTriggerButton(selectedValues.length > 0)}
        onClick={() => setOpen(!open)}
      >
        {triggerLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: "4px" }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      
      {open && (
        <div style={styles.popover}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid rgba(19, 38, 100, 0.1)", paddingBottom: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: "800", color: "#132664", textTransform: "uppercase" }}>{label}</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                style={styles.smallLinkBtn} 
                onClick={() => {
                  optionsList.forEach(opt => {
                    if (!selectedValues.includes(opt)) onToggle(filterKey, opt);
                  });
                }}
              >
                All
              </button>
              <button 
                style={styles.smallLinkBtn} 
                onClick={() => {
                  selectedValues.forEach(opt => {
                    onToggle(filterKey, opt);
                  });
                }}
              >
                None
              </button>
            </div>
          </div>

          {showSearch && (
            <input 
              type="text" 
              placeholder="Search..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              style={styles.popoverInput} 
            />
          )}

          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "140px", padding: "2px 0" }}>
            {filtered.map(opt => {
              const checked = selectedValues.includes(opt);
              return (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", fontWeight: "600", color: "#132664" }}>
                  <input 
                    type="checkbox" 
                    checked={checked} 
                    onChange={() => onToggle(filterKey, opt)} 
                    style={{ accentColor: "#132664", cursor: "pointer" }}
                  />
                  <span>{opt.replace(/_/g, " ")}</span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ fontSize: "11px", color: "rgba(19, 38, 100, 0.5)", textAlign: "center", padding: "8px 0" }}>No matches</div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid rgba(19, 38, 100, 0.1)", paddingTop: "8px", marginTop: "6px" }}>
            <button 
              style={styles.popoverApplyBtn} 
              onClick={() => setOpen(false)}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("toggle");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [stores, setStores] = useState(STORES);
  const [zomatoStores, setZomatoStores] = useState(ZOMATO_STORES);
  const [logs, setLogs] = useState([]);

  const getPastDateStr = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  };

  const [defaultDateRange, setDefaultDateRange] = useState({
    from: getPastDateStr(7),
    to: getPastDateStr(1)
  });

  // Global filters (Pluralized for array selections)
  const [filters, setFilters] = useState({ 
    brands: [], 
    cities: [], 
    zones: [], 
    areas: [], 
    dateFrom: getPastDateStr(7), 
    dateTo: getPastDateStr(1), 
    timeFrom: "", 
    timeTo: "" 
  });
  const [masterData, setMasterData] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  // Date/Time Popover state
  const [showDatePopover, setShowDatePopover] = useState(false);
  const [showTimePopover, setShowTimePopover] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/filters`)
      .then(r => r.json())
      .then(data => {
        setMasterData(data.masterData || []);
        setLoadingFilters(false);
      })
      .catch(e => {
        console.error("Failed to load filters:", e);
        setLoadingFilters(false);
      });
  }, []);

  const getOptions = (columnName, excludeFilterName) => {
    const filtered = masterData.filter(row => {
      if (filters.brands && filters.brands.length > 0 && excludeFilterName !== 'brand') {
        if (!row.brand || !filters.brands.some(b => b.toLowerCase() === row.brand.toLowerCase())) return false;
      }
      if (filters.cities && filters.cities.length > 0 && excludeFilterName !== 'city') {
        if (!row.city || !filters.cities.some(c => c.toLowerCase() === row.city.toLowerCase())) return false;
      }
      if (filters.zones && filters.zones.length > 0 && excludeFilterName !== 'zone') {
        if (!row.zone || !filters.zones.some(z => z.toLowerCase() === row.zone.toLowerCase())) return false;
      }
      if (filters.areas && filters.areas.length > 0 && excludeFilterName !== 'area') {
        if (!row.area || !filters.areas.some(a => a.toLowerCase() === row.area.toLowerCase())) return false;
      }
      return true;
    });

    const valueMap = new Map();
    filtered.forEach(row => {
      const val = row[columnName];
      if (val && val.trim() !== '') {
        const trimmed = val.trim();
        valueMap.set(trimmed.toLowerCase(), trimmed);
      }
    });
    return Array.from(valueMap.values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  };

  const options = {
    brands: getOptions('brand', 'brand'),
    cities: getOptions('city', 'city'),
    zones: getOptions('zone', 'zone'),
    areas: getOptions('area', 'area')
  };

  // Toggles filter item array state
  const toggleFilterOption = (key, val) => {
    setFilters(prev => {
      const current = prev[key] || [];
      const exists = current.includes(val);
      const nextArray = exists ? current.filter(x => x !== val) : [...current, val];
      return { ...prev, [key]: nextArray };
    });
  };

  // Specific Date/Time filters
  const setRangeFilter = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  const clearAllFilters = () => {
    setFilters({
      brands: [],
      cities: [],
      zones: [],
      areas: [],
      dateFrom: defaultDateRange.from,
      dateTo: defaultDateRange.to,
      timeFrom: "",
      timeTo: ""
    });
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case "toggle": return "Toggle Outlet Status";
      case "timing": return "Store Timings";
      case "reviews": return "Dine-in Reviews";
      case "backfill": return "Route Backfilling";
      case "ratings": return "Ratings & Insights";
      case "settings": return "Settings";
      case "theme": return "System Theme";
      default: return "Dashboard";
    }
  };

  const getPageSubtitle = () => {
    switch (activeTab) {
      case "toggle": return "Instantly enable/disable kitchen outlets on delivery aggregates";
      case "timing": return "Configure operating hours for Zomato portal listings";
      case "reviews": return "Monitor dine-in client reviews and generate AI replies";
      case "backfill": return "Sync historic and missing route maps data instantly";
      case "ratings": return "Query and analyze customer ratings with semantic insights";
      case "settings": return "Access connected platform webhooks and profile details";
      case "theme": return "Lock or review visual palette details";
      default: return "";
    }
  };

  const styles = {
    layout: {
      display: "flex",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      backgroundColor: "#ffffff",
    },
    mainContent: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      position: "relative",
      backgroundColor: "#ffffff",
    },
    sidebarTriggerBtn: {
      position: "absolute",
      left: "12px",
      top: "22px",
      background: "#ffffff",
      border: "2px solid #132664",
      borderRadius: "50%",
      width: "28px",
      height: "28px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#132664",
      cursor: "pointer",
      zIndex: 99,
      boxShadow: "0 2px 8px rgba(19, 38, 100, 0.15)"
    },
    topbar: {
      padding: isSidebarCollapsed ? "24px 24px 20px 48px" : "24px 32px 20px 32px",
      borderBottom: "1px solid rgba(19, 38, 100, 0.1)",
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    },
    headerRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    title: {
      fontSize: "24px",
      fontWeight: "800",
      color: "#132664",
      letterSpacing: "-0.5px"
    },
    subtitle: {
      fontSize: "13px",
      color: "rgba(19, 38, 100, 0.6)",
      fontWeight: "500",
      marginTop: "2px"
    },
    filtersRow: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      flexWrap: "wrap",
    },
    filterTriggerButton: (isSet) => ({
      backgroundColor: isSet ? "#132664" : "#ffffff",
      border: "1px solid #132664",
      borderRadius: "18px",
      padding: "6px 14px",
      color: isSet ? "#ffffff" : "#132664",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
      outline: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px"
    }),
    clearAllBtn: {
      backgroundColor: "transparent",
      border: "none",
      color: "rgba(19, 38, 100, 0.6)",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer",
      textDecoration: "underline",
      padding: "6px 10px",
    },
    popoverContainer: {
      position: "relative",
    },
    popover: {
      position: "absolute",
      top: "100%",
      left: "0",
      marginTop: "8px",
      backgroundColor: "#ffffff",
      border: "2px solid #132664",
      borderRadius: "12px",
      padding: "12px 14px",
      boxShadow: "0 8px 24px rgba(19, 38, 100, 0.12)",
      zIndex: 1000,
      width: "200px",
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    },
    popoverLabel: {
      fontSize: "11px",
      fontWeight: "700",
      color: "#132664",
      marginBottom: "4px",
      display: "block"
    },
    popoverInput: {
      width: "100%",
      boxSizing: "border-box",
      padding: "6px 8px",
      border: "1px solid #132664",
      borderRadius: "6px",
      fontSize: "11px",
      color: "#132664",
      backgroundColor: "#ffffff",
      outline: "none",
      marginBottom: "4px"
    },
    popoverApplyBtn: {
      backgroundColor: "#132664",
      color: "#ffffff",
      border: "none",
      borderRadius: "6px",
      padding: "6px 12px",
      fontSize: "11px",
      fontWeight: "700",
      cursor: "pointer"
    },
    popoverClearBtn: {
      backgroundColor: "transparent",
      color: "#132664",
      border: "1px solid #132664",
      borderRadius: "6px",
      padding: "5px 11px",
      fontSize: "11px",
      fontWeight: "700",
      cursor: "pointer"
    },
    smallLinkBtn: {
      background: "none",
      border: "none",
      color: "#132664",
      fontSize: "10px",
      fontWeight: "800",
      cursor: "pointer",
      textDecoration: "underline",
      padding: 0
    },
    contentArea: {
      flex: 1,
      overflow: "hidden",
      backgroundColor: "#ffffff"
    }
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case "toggle":
        return <TogglePage stores={stores} setStores={setStores} logs={logs} setLogs={setLogs} globalFilters={filters} />;
      case "timing":
        return <TimingPage stores={zomatoStores} globalFilters={filters} />;
      case "reviews":
        return <ReviewsPage globalFilters={filters} />;
      case "backfill":
        return <RouteBackfillingPage globalFilters={filters} />;
      case "ratings":
        return (
          <RatingsPage 
            globalFilters={filters} 
            allBrands={options.brands} 
            masterData={masterData} 
            onUpdateFilters={(newFilters) => setFilters(prev => ({ ...prev, ...newFilters }))}
          />
        );
      case "settings":
        return <SettingsView />;
      case "theme":
        return <ThemeView />;
      case "logout":
        return <LogoutView onLogin={() => setActiveTab("toggle")} />;
      default:
        return <TogglePage stores={stores} setStores={setStores} logs={logs} setLogs={setLogs} globalFilters={filters} />;
    }
  };

  const hasAnyFilterActive = 
    filters.brands.length > 0 || 
    filters.cities.length > 0 || 
    filters.zones.length > 0 || 
    filters.areas.length > 0 || 
    filters.dateFrom !== defaultDateRange.from || 
    filters.dateTo !== defaultDateRange.to || 
    filters.timeFrom !== "" || 
    filters.timeTo !== "";

  return (
    <div style={styles.layout}>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isCollapsed={isSidebarCollapsed} 
        setIsCollapsed={setIsSidebarCollapsed} 
      />
      
      <div style={styles.mainContent}>
        {isSidebarCollapsed && (
          <button 
            style={styles.sidebarTriggerBtn} 
            onClick={() => setIsSidebarCollapsed(false)}
            title="Expand Sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        )}

        {activeTab !== "logout" && (
          <div style={styles.topbar}>
            <div style={styles.headerRow}>
              <div>
                <h1 style={styles.title}>{getPageTitle()}</h1>
                <p style={styles.subtitle}>{getPageSubtitle()}</p>
              </div>
            </div>

            {activeTab !== "toggle" && (
            <div style={styles.filtersRow}>
              {/* Checkbox Brand Select */}
              <CheckboxFilterPopover 
                label="Brands" 
                filterKey="brands" 
                optionsList={options.brands} 
                selectedValues={filters.brands} 
                onToggle={toggleFilterOption} 
                showSearch={false}
                styles={styles} 
              />

              {/* Checkbox City Select */}
              <CheckboxFilterPopover 
                label="Cities" 
                filterKey="cities" 
                optionsList={options.cities} 
                selectedValues={filters.cities} 
                onToggle={toggleFilterOption} 
                showSearch={true}
                styles={styles} 
              />

              {/* Checkbox Zone Select */}
              <CheckboxFilterPopover 
                label="Zones" 
                filterKey="zones" 
                optionsList={options.zones} 
                selectedValues={filters.zones} 
                onToggle={toggleFilterOption} 
                showSearch={false}
                styles={styles} 
              />

              {/* Checkbox Area Select */}
              <CheckboxFilterPopover 
                label="Areas" 
                filterKey="areas" 
                optionsList={options.areas} 
                selectedValues={filters.areas} 
                onToggle={toggleFilterOption} 
                showSearch={true}
                styles={styles} 
              />

              {/* Date Filter Popover */}
              <div style={styles.popoverContainer}>
                <button 
                  style={styles.filterTriggerButton(filters.dateFrom || filters.dateTo)}
                  onClick={() => { setShowDatePopover(!showDatePopover); setShowTimePopover(false); }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "2px" }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  {filters.dateFrom || filters.dateTo 
                    ? `${filters.dateFrom || "Start"} to ${filters.dateTo || "End"}` 
                    : "Date Range"}
                </button>
                
                {showDatePopover && (
                  <div style={styles.popover}>
                    <div>
                      <span style={styles.popoverLabel}>From Date</span>
                      <input 
                        type="date" 
                        value={filters.dateFrom} 
                        onChange={e => setRangeFilter("dateFrom", e.target.value)} 
                        style={styles.popoverInput} 
                      />
                    </div>
                    <div>
                      <span style={styles.popoverLabel}>To Date</span>
                      <input 
                        type="date" 
                        value={filters.dateTo} 
                        onChange={e => setRangeFilter("dateTo", e.target.value)} 
                        style={styles.popoverInput} 
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginTop: "4px" }}>
                      <button 
                        style={styles.popoverClearBtn} 
                        onClick={() => { setRangeFilter("dateFrom", ""); setRangeFilter("dateTo", ""); setShowDatePopover(false); }}
                      >
                        Clear
                      </button>
                      <button 
                        style={styles.popoverApplyBtn} 
                        onClick={() => setShowDatePopover(false)}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Time Filter Popover */}
              <div style={styles.popoverContainer}>
                <button 
                  style={styles.filterTriggerButton(filters.timeFrom || filters.timeTo)}
                  onClick={() => { setShowTimePopover(!showTimePopover); setShowDatePopover(false); }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "2px" }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  {filters.timeFrom || filters.timeTo 
                    ? `${filters.timeFrom || "Start"} to ${filters.timeTo || "End"}` 
                    : "Time Range"}
                </button>

                {showTimePopover && (
                  <div style={styles.popover}>
                    <div>
                      <span style={styles.popoverLabel}>From Time</span>
                      <input 
                        type="time" 
                        value={filters.timeFrom} 
                        onChange={e => setRangeFilter("timeFrom", e.target.value)} 
                        style={styles.popoverInput} 
                      />
                    </div>
                    <div>
                      <span style={styles.popoverLabel}>To Time</span>
                      <input 
                        type="time" 
                        value={filters.timeTo} 
                        onChange={e => setRangeFilter("timeTo", e.target.value)} 
                        style={styles.popoverInput} 
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginTop: "4px" }}>
                      <button 
                        style={styles.popoverClearBtn} 
                        onClick={() => { setRangeFilter("timeFrom", ""); setRangeFilter("timeTo", ""); setShowTimePopover(false); }}
                      >
                        Clear
                      </button>
                      <button 
                        style={styles.popoverApplyBtn} 
                        onClick={() => setShowTimePopover(false)}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {hasAnyFilterActive && (
                <button style={styles.clearAllBtn} onClick={clearAllFilters}>
                  Clear All
                </button>
              )}
            </div>
            )}
          </div>
        )}

        <div style={styles.contentArea}>
          {renderActiveView()}
        </div>
      </div>
    </div>
  );
}
