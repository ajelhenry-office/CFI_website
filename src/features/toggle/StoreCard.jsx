import React, { useState } from "react";

export default function StoreCard({ store, onToggle }) {
  const [loading, setLoading] = useState(false);
  const isOnline = store.status === "online";

  const brandColors = {
    "Ovenfresh": "#f97316",
    "Paris Cakes & Desserts": "#7c3aed"
  };
  const brandColor = brandColors[store.brand] || "#3b82f6";

  const handleToggleClick = async () => {
    if (loading) return;
    setLoading(true);
    await onToggle(store);
    setLoading(false);
  };

  const styles = {
    card: {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: "12px",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      opacity: loading ? 0.7 : 1,
      transition: "opacity 0.2s"
    },
    brandBar: {
      height: "4px",
      width: "100%",
      backgroundColor: brandColor
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
      gap: "4px"
    },
    name: {
      fontSize: "15px",
      fontWeight: "600",
      color: "#ffffff"
    },
    brand: {
      fontSize: "11px",
      fontWeight: "500",
      color: brandColor,
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    bottomRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: "8px"
    },
    locationId: {
      fontSize: "11px",
      color: "#64748b",
      fontWeight: "500"
    },
    badge: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "11px",
      fontWeight: "600",
      color: isOnline ? "#10b981" : "#64748b",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    dot: {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      backgroundColor: isOnline ? "#10b981" : "#64748b"
    },
    // Toggle Styles
    toggleTrack: {
      width: "36px",
      height: "20px",
      backgroundColor: isOnline ? "#10b981" : "rgba(255, 255, 255, 0.1)",
      borderRadius: "10px",
      position: "relative",
      cursor: loading ? "not-allowed" : "pointer",
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
      transition: "left 0.2s",
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
    }
  };

  return (
    <div style={styles.card}>
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