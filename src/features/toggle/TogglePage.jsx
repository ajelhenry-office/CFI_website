import React, { useState } from "react";
import StoreCard from "./StoreCard";
import ActivityLog from "./ActivityLog";
import { toggleStore } from "../../api";

export default function TogglePage({ stores, setStores, logs, setLogs, globalFilters }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isBulking, setIsSyncing] = useState(false);

  const handleToggle = async (store, forceStatus = null) => {
    const currentStatus = store.status;
    const newStatus = forceStatus || (currentStatus === "online" ? "offline" : "online");
    if (currentStatus === newStatus) return;

    const actionStr = newStatus === "online" ? "enable" : "disable";
    
    // Optimistic UI update
    setStores(prev => prev.map(s => s.id === store.id ? { ...s, status: newStatus } : s));

    try {
      await toggleStore(store.location_id, actionStr, store.brand);
      // Add success log
      setLogs(prev => [{
        store: store.name,
        action: newStatus.toUpperCase(),
        time: new Date().toLocaleTimeString("en-IN"),
        success: true
      }, ...prev]);
    } catch (error) {
      // Revert UI update
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, status: currentStatus } : s));
      // Add failure log
      setLogs(prev => [{
        store: store.name,
        action: newStatus.toUpperCase(),
        time: new Date().toLocaleTimeString("en-IN"),
        success: false,
        errorMsg: error.message
      }, ...prev]);
    }
  };

  const handleBulkToggle = async (desiredStatus) => {
    const storesToChange = filteredStores.filter(s => s.status !== desiredStatus);
    if (storesToChange.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to turn ${storesToChange.length} stores ${desiredStatus.toUpperCase()}?`)) return;

    setIsSyncing(true);
    for (const store of storesToChange) {
      await handleToggle(store, desiredStatus);
      // Small delay to prevent UrbanPiper rate limiting
      await new Promise(res => setTimeout(res, 300));
    }
    setIsSyncing(false);
  };

  const filteredStores = stores.filter(s => {
    const matchBrand = !globalFilters?.brands || globalFilters.brands.length === 0 || globalFilters.brands.some(b => b.toLowerCase() === s.brand.toLowerCase());
    const matchCity = !globalFilters?.cities || globalFilters.cities.length === 0 || globalFilters.cities.some(c => c.toLowerCase() === s.city.toLowerCase());
    const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchBrand && matchCity && matchSearch;
  });

  const onlineCount = stores.filter(s => s.status === "online").length;
  const offlineCount = stores.length - onlineCount;

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
      border: `1px solid ${isActive ? "#132664" : "rgba(19, 38, 100, 0.15)"}`
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
      justifyContent: "flex-end",
      marginBottom: "20px"
    },
    searchBox: {
      padding: "8px 16px",
      borderRadius: "20px",
      backgroundColor: "#ffffff",
      border: "1px solid #132664",
      color: "#132664",
      outline: "none",
      fontFamily: "Inter, sans-serif",
      fontSize: "13px",
      width: "240px"
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: "20px",
      paddingBottom: "40px"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.mainCol}>
        <div style={styles.topActionsRow}>
          <div style={styles.statsRow}>
            <div style={styles.statText(true)}>{onlineCount} Online</div>
            <div style={styles.statText(false)}>{offlineCount} Offline</div>
            <div style={styles.statText(false)}>{stores.length} Total</div>
          </div>
          <div style={styles.bulkActions}>
            <button style={styles.bulkBtn(true)} onClick={() => handleBulkToggle("online")} disabled={isBulking}>
              Bulk Go Online
            </button>
            <button style={styles.bulkBtn(false)} onClick={() => handleBulkToggle("offline")} disabled={isBulking}>
              Bulk Go Offline
            </button>
          </div>
        </div>
        
        <div style={styles.controlsRow}>
          <input 
            type="text" 
            placeholder="Search stores..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            style={styles.searchBox}
          />
        </div>

        <div style={styles.grid}>
          {filteredStores.map(store => (
            <StoreCard key={store.id} store={store} onToggle={handleToggle} />
          ))}
          {filteredStores.length === 0 && (
            <div style={{ color: "rgba(19, 38, 100, 0.6)", gridColumn: "1 / -1", textAlign: "center", padding: "40px" }}>
              No stores match the active search or filters.
            </div>
          )}
        </div>
      </div>
      <ActivityLog logs={logs} />
    </div>
  );
}