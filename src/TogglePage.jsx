import React, { useState } from "react";
import StoreCard from "./StoreCard";
import ActivityLog from "./ActivityLog";
import { toggleStore } from "./api";

export default function TogglePage({ stores, setStores, logs, setLogs }) {
  const [filterBrand, setFilterBrand] = useState("All Brands");
  const [searchQuery, setSearchQuery] = useState("");

  const handleToggle = async (store) => {
    const currentStatus = store.status;
    const newStatus = currentStatus === "online" ? "offline" : "online";
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
        success: false
      }, ...prev]);
    }
  };

  const filteredStores = stores.filter(s => {
    const matchBrand = filterBrand === "All Brands" || s.brand === filterBrand;
    const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchBrand && matchSearch;
  });

  const onlineCount = stores.filter(s => s.status === "online").length;
  const offlineCount = stores.length - onlineCount;

  const styles = {
    container: {
      display: "flex",
      height: "100%",
      overflow: "hidden"
    },
    mainCol: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      padding: "32px 40px",
      overflowY: "auto"
    },
    statsRow: {
      display: "flex",
      gap: "24px",
      marginBottom: "32px"
    },
    statText: (color) => ({
      fontSize: "14px",
      fontWeight: "600",
      color: color,
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      padding: "10px 16px",
      borderRadius: "8px",
      border: "1px solid rgba(255, 255, 255, 0.1)"
    }),
    controlsRow: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "24px"
    },
    searchBox: {
      padding: "10px 16px",
      borderRadius: "8px",
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      color: "#ffffff",
      outline: "none",
      fontFamily: "Inter",
      width: "260px"
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "20px"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.mainCol}>
        <div style={styles.statsRow}>
          <div style={styles.statText("#10b981")}>{onlineCount} Online</div>
          <div style={styles.statText("#64748b")}>{offlineCount} Offline</div>
          <div style={styles.statText("#ffffff")}>{stores.length} Total</div>
        </div>
        <div style={styles.grid}>
          {filteredStores.map(store => (
            <StoreCard key={store.id} store={store} onToggle={handleToggle} />
          ))}
        </div>
      </div>
      <ActivityLog logs={logs} />
    </div>
  );
}