import React, { useState } from "react";

export default function StoreCard({ store, onToggle, isBulking }) {
  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isOnline = store.status === "online";

  const handleToggleClick = async () => {
    if (loading || isBulking) return;
    setLoading(true);
    await onToggle(store);
    setLoading(false);
  };

  const styles = {
    card: {
      backgroundColor: "#ffffff",
      border: "1px solid rgba(19, 38, 100, 0.08)",
      borderRadius: "12px",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      opacity: (loading || isBulking) ? 0.7 : 1,
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      boxShadow: isHovered ? '0 8px 24px rgba(19, 38, 100, 0.12)' : '0 2px 8px rgba(19, 38, 100, 0.04)',
      transform: isHovered ? 'translateY(-2px)' : 'none'
    },
    brandBar: {
      height: "4px",
      width: "100%",
      backgroundColor: isOnline ? "#22c55e" : "#ef4444",
      transition: "background-color 0.3s"
    },
    content: {
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    },
    topRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start"
    },
    info: {
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    },
    name: {
      fontSize: "14px",
      fontWeight: "700",
      color: "#132664"
    },
    brand: {
      fontSize: "11px",
      fontWeight: "600",
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    bottomRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "4px"
    },
    locationId: {
      fontSize: "11px",
      color: "#94a3b8",
      fontWeight: "600"
    },
    badge: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "10px",
      fontWeight: "700",
      color: isOnline ? "#22c55e" : "#ef4444",
      textTransform: "uppercase",
      backgroundColor: isOnline ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
      padding: "4px 8px",
      borderRadius: "12px"
    },
    dot: {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      backgroundColor: isOnline ? "#22c55e" : "#ef4444"
    },
    // Toggle Styles
    toggleTrack: {
      width: "36px",
      height: "20px",
      backgroundColor: isOnline ? "#22c55e" : "#cbd5e1",
      border: "none",
      borderRadius: "10px",
      position: "relative",
      cursor: (loading || isBulking) ? "not-allowed" : "pointer",
      transition: "background-color 0.2s"
    },
    toggleThumb: {
      position: "absolute",
      top: "2px",
      left: isOnline ? "18px" : "2px",
      width: "16px",
      height: "16px",
      backgroundColor: "#ffffff",
      borderRadius: "50%",
      transition: "left 0.2s, background-color 0.2s",
      boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
    }
  };

  return (
    <div 
      style={styles.card}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={styles.brandBar}></div>
      <div style={styles.content}>
        <div style={styles.topRow}>
          <div style={styles.info}>
            <div style={styles.name}>{store.name}</div>
            <div style={styles.brand}>{store.brand}</div>
          </div>
          <div style={styles.toggleTrack} onClick={handleToggleClick}>
            <div style={styles.toggleThumb}></div>
          </div>
        </div>
        <div style={styles.bottomRow}>
          <div style={styles.locationId}>ID: {store.location_id}</div>
          <div style={styles.badge}>
            <div style={styles.dot}></div>
            {loading ? "UPDATING..." : isOnline ? "ONLINE" : "OFFLINE"}
          </div>
        </div>
      </div>
    </div>
  );
}