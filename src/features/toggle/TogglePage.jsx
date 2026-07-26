import React, { useState, useEffect } from "react";
import StoreCard from "./StoreCard";
import ToggleSidebar from "./ToggleSidebar";
import AuditModal from "./AuditModal";
import BulkProgressIsland from "./BulkProgressIsland";
import { toggleStore, bulkToggleStores } from "../../api";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function TogglePage({ stores, setStores, logs, setLogs }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isBulking, setIsSyncing] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [toast, setToast] = useState(null);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  
  // Data for sidebar and grid
  const [data, setData] = useState({
    apiHealth: null,
    activeBulkJob: null,
    recentActions: [],
    problemStores: [],
    dailyStats: null
  });

  const fetchData = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/toggle/sidebar-data`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error("Sidebar fetch error:", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, data.activeBulkJob ? 2000 : 10000);
    return () => clearInterval(interval);
  }, [data.activeBulkJob ? data.activeBulkJob.id : null]);
  
  // Progressive UI updating during bulk job
  useEffect(() => {
    if (data.activeBulkJob && data.activeBulkJob.completed_store_ids) {
      const completedSet = new Set(data.activeBulkJob.completed_store_ids);
      const targetStatus = data.activeBulkJob.action === 'enable' ? 'online' : 'offline';
      
      setStores(prev => {
        let changed = false;
        const next = prev.map(s => {
          if (completedSet.has(s.location_id) && s.status !== targetStatus) {
            changed = true;
            return { ...s, status: targetStatus };
          }
          return s;
        });
        return changed ? next : prev;
      });
    }
  }, [data.activeBulkJob]);
  
  // Local filters
  const [selectedBrand, setSelectedBrand] = useState("Cake Zone");
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Only allow Cake Zone and Ovenfresh in the brand filter
  const uniqueBrands = [...new Set(stores.map(s => s.brand).filter(Boolean))].sort();
  const uniqueZones = [...new Set(stores.filter(s => !selectedBrand || s.brand === selectedBrand).map(s => s.zone).filter(Boolean))].sort();
  const uniqueCities = [...new Set(stores.filter(s => (!selectedBrand || s.brand === selectedBrand) && (!selectedZone || s.zone === selectedZone)).map(s => s.city).filter(Boolean))].sort();
  const uniqueAreas = [...new Set(stores.filter(s => (!selectedBrand || s.brand === selectedBrand) && (!selectedZone || s.zone === selectedZone) && (!selectedCity || s.city === selectedCity)).map(s => s.name).filter(Boolean))].sort();

  const handleBrandChange = (e) => {
    setSelectedBrand(e.target.value);
    setSelectedZone("");
    setSelectedCity("");
    setSelectedArea("");
  };

  const handleZoneChange = (e) => {
    setSelectedZone(e.target.value);
    setSelectedCity("");
    setSelectedArea("");
  };

  const handleCityChange = (e) => {
    setSelectedCity(e.target.value);
    setSelectedArea("");
  };

  const showToast = (message, newStatus) => {
    setToast({ message, newStatus });
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggle = async (store, forceStatus = null) => {
    const currentStatus = store.status;
    const newStatus = forceStatus || (currentStatus === "online" ? "offline" : "online");
    if (currentStatus === newStatus) return;

    const actionStr = newStatus === "online" ? "enable" : "disable";
    
    // Optimistic UI update
    setStores(prev => prev.map(s => s.id === store.id ? { ...s, status: newStatus } : s));

    try {
      await toggleStore(store.location_id, actionStr, store.brand, store.name);
      fetchData();
      showToast(`${store.name} successfully turned ${newStatus.toUpperCase()}`, newStatus);
    } catch (error) {
      // Revert UI update
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, status: currentStatus } : s));
      showToast(`Failed to turn ${store.name} ${newStatus.toUpperCase()}`, "error");
      fetchData();
    }
  };

  const handleBulkToggle = async (desiredStatus) => {
    const storesToChange = filteredStores.filter(s => s.status !== desiredStatus);
    if (storesToChange.length === 0) {
      alert(`All currently filtered stores are already ${desiredStatus.toUpperCase()}! There is nothing to do.`);
      return;
    }
    
    if (!window.confirm(`Are you sure you want to turn ${storesToChange.length} stores ${desiredStatus.toUpperCase()}?`)) return;

    const actionStr = desiredStatus === "online" ? "enable" : "disable";
    
    const getFilterContextString = () => {
      let parts = [];
      if (selectedBrand) parts.push(`Brand: ${selectedBrand}`);
      if (selectedCity) parts.push(`City: ${selectedCity}`);
      if (selectedZone) parts.push(`Zone: ${selectedZone}`);
      if (selectedArea) parts.push(`Area: ${selectedArea}`);
      
      if (parts.length === 0) return "";
      return ` in [${parts.join(' | ')}]`;
    };
    
    const filterContext = getFilterContextString();
    
    try {
      await bulkToggleStores(storesToChange, actionStr, filterContext);
      fetchData();
    } catch (error) {
      alert(`Failed to start bulk toggle: ${error.message}`);
    }
  };

  const baseFilteredStores = stores.filter(s => {
    const matchBrand = selectedBrand === "" || s.brand === selectedBrand;
    const matchZone = selectedZone === "" || s.zone === selectedZone;
    const matchCity = selectedCity === "" || s.city === selectedCity;
    const matchArea = selectedArea === "" || s.name === selectedArea;
    const q = searchQuery.toLowerCase();
    const matchSearch = s.name.toLowerCase().includes(q) || s.location_id.toLowerCase().includes(q);
    return matchBrand && matchZone && matchCity && matchArea && matchSearch;
  });

  const onlineCount = baseFilteredStores.filter(s => s.status === "online").length;
  const offlineCount = baseFilteredStores.length - onlineCount;
  
  const filteredStores = baseFilteredStores.filter(s => {
    if (statusFilter === 'online') return s.status === 'online';
    if (statusFilter === 'offline') return s.status === 'offline';
    return true; // all
  });

  const styles = {
    container: {
      display: "flex",
      height: "100%",
      overflow: "hidden",
      backgroundColor: "#ffffff"
    },
    mainCol: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      padding: "32px 40px",
      overflowY: "auto"
    },
    topActionsRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "24px",
      gap: "16px",
      flexWrap: "wrap"
    },
    statsRow: {
      display: "flex",
      gap: "12px",
      alignItems: "center"
    },
    statText: (isActive) => ({
      fontSize: "13px",
      fontWeight: "700",
      color: isActive ? "#ffffff" : "#132664",
      backgroundColor: isActive ? "#132664" : "rgba(19, 38, 100, 0.05)",
      padding: "8px 14px",
      borderRadius: "20px",
      border: `1px solid ${isActive ? "#132664" : "rgba(19, 38, 100, 0.15)"}`,
      cursor: "pointer",
      transition: "all 0.2s"
    }),
    bulkActions: {
      display: "flex",
      gap: "8px"
    },
    bulkBtn: (isOnlineAction) => ({
      fontSize: "12px",
      fontWeight: "700",
      color: isOnlineAction ? "#ffffff" : "#132664",
      backgroundColor: isOnlineAction ? "#132664" : "#ffffff",
      padding: "8px 16px",
      borderRadius: "20px",
      border: isOnlineAction ? "none" : "1px solid #132664",
      cursor: isBulking ? "not-allowed" : "pointer",
      opacity: isBulking ? 0.6 : 1,
      transition: "opacity 0.2s"
    }),
    controlsRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
      gap: "16px",
      flexWrap: "wrap"
    },
    filtersGroup: {
      display: "flex",
      gap: "12px",
      flexWrap: "wrap"
    },
    selectBox: {
      padding: "8px 12px",
      borderRadius: "20px",
      backgroundColor: "#ffffff",
      border: "1px solid rgba(19, 38, 100, 0.3)",
      color: "#132664",
      outline: "none",
      fontFamily: "Inter, sans-serif",
      fontSize: "12px",
      fontWeight: "600",
      cursor: "pointer"
    },
    searchBox: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      backgroundColor: '#f1f5f9',
      padding: '8px 16px',
      borderRadius: '20px',
      width: '280px',
      gap: '8px'
    },
    searchInput: {
      border: 'none',
      backgroundColor: 'transparent',
      outline: 'none',
      fontSize: '13px',
      width: '100%',
      color: '#132664',
      fontWeight: '500'
    },
    searchDropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: '8px',
      backgroundColor: '#ffffff',
      border: '1px solid rgba(19, 38, 100, 0.1)',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(19, 38, 100, 0.12)',
      zIndex: 100,
      maxHeight: '250px',
      overflowY: 'auto',
      display: (isSearchFocused && searchQuery.length > 0) ? 'block' : 'none'
    },
    searchDropdownItem: {
      padding: '10px 16px',
      borderBottom: '1px solid rgba(19, 38, 100, 0.05)',
      cursor: 'pointer',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: "20px",
      paddingBottom: "40px"
    },
    toastContainer: {
      position: 'fixed',
      bottom: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#ffffff',
      color: '#000000',
      border: `2px solid ${toast?.newStatus === 'online' ? '#22c55e' : (toast?.newStatus === 'offline' || toast?.newStatus === 'error' ? '#ef4444' : '#132664')}`,
      padding: '12px 24px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: 'bold',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1000,
      opacity: toast ? 1 : 0,
      pointerEvents: toast ? 'auto' : 'none',
      transition: 'opacity 0.3s ease'
    },
    historyBtn: {
      fontSize: "12px",
      fontWeight: "700",
      color: "#132664",
      backgroundColor: "transparent",
      padding: "8px 16px",
      borderRadius: "20px",
      border: "1px solid rgba(19, 38, 100, 0.2)",
      cursor: "pointer",
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }
  };

  return (
    <div style={{...styles.container, position: 'relative'}}>
      <BulkProgressIsland activeBulkJob={data.activeBulkJob} fetchData={fetchData} />
      
      <div style={styles.mainCol}>
        <div style={styles.topActionsRow}>
          <div style={styles.statsRow}>
            <div style={styles.statText(statusFilter === 'online')} onClick={() => setStatusFilter('online')}>{onlineCount} Online</div>
            <div style={styles.statText(statusFilter === 'offline')} onClick={() => setStatusFilter('offline')}>{offlineCount} Offline</div>
            <div style={styles.statText(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>{baseFilteredStores.length} Total</div>
          </div>
          <div style={styles.bulkActions}>
            <button style={styles.historyBtn} onClick={() => setIsAuditOpen(true)}>
              📋 View History
            </button>
            <button style={styles.bulkBtn(true)} onClick={() => handleBulkToggle("online")} disabled={isBulking}>
              Bulk Go Online
            </button>
            <button style={styles.bulkBtn(false)} onClick={() => handleBulkToggle("offline")} disabled={isBulking}>
              Bulk Go Offline
            </button>
          </div>
        </div>
        
        <div style={styles.controlsRow}>
          <div style={styles.filtersGroup}>
            <select value={selectedBrand} onChange={handleBrandChange} style={styles.selectBox}>
              {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={selectedZone} onChange={handleZoneChange} style={styles.selectBox}>
              <option value="">All Zones</option>
              {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <select value={selectedCity} onChange={handleCityChange} style={styles.selectBox}>
              <option value="">All Cities</option>
              {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={selectedArea} onChange={e => setSelectedArea(e.target.value)} style={styles.selectBox}>
              <option value="">All Areas</option>
              {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={styles.searchBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              placeholder="Search location id or name..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              style={styles.searchInput}
            />
            {isSearchFocused && searchQuery.length > 0 && (
              <div style={styles.searchDropdown}>
                {filteredStores.slice(0, 8).map(store => (
                  <div 
                    key={store.id} 
                    style={styles.searchDropdownItem}
                    onMouseDown={(e) => {
                      // use onMouseDown to fire before onBlur
                      e.preventDefault();
                      setSearchQuery(store.location_id);
                      setIsSearchFocused(false);
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(19, 38, 100, 0.04)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{fontWeight: '700', color: '#132664'}}>{store.name}</div>
                    <div style={{color: '#64748b', fontSize: '11px', fontWeight: '600'}}>{store.location_id} • {store.brand}</div>
                  </div>
                ))}
                {filteredStores.length === 0 && (
                  <div style={{padding: '12px 16px', fontSize: '12px', color: '#64748b', textAlign: 'center'}}>No matching stores</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={styles.grid}>
          {filteredStores.map(store => (
            <StoreCard 
              key={store.id} 
              store={store} 
              onToggle={handleToggle} 
              isBulking={!!data.activeBulkJob}
            />
          ))}
          {filteredStores.length === 0 && (
            <div style={{ color: "rgba(19, 38, 100, 0.6)", gridColumn: "1 / -1", textAlign: "center", padding: "40px" }}>
              No stores match the active search or filters.
            </div>
          )}
        </div>
      </div>

      
      {/* Toast Notification */}
      <div style={styles.toastContainer}>
        {toast?.message}
      </div>

      {/* Audit Modal */}
      {isAuditOpen && <AuditModal onClose={() => setIsAuditOpen(false)} stores={stores} selectedBrand={selectedBrand} />}
    </div>
  );
}