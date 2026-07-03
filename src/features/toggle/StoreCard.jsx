import React, { useState } from "react";

export default function StoreCard({ store, onToggle }) {
  const [loading, setLoading] = useState(false);
  const isOnline = store.status === "online";

  const handleToggleClick = async () => {
    if (loading) return;
    setLoading(true);
    await onToggle(store);
    setLoading(false);
  };

  const styles = {
    card: {
      backgroundColor: "#ffffff",
      border: "1px solid rgba(19, 38, 100, 0.15)",
      borderRadius: "12px",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      opacity: loading ? 0.7 : 1,
      transition: "opacity 0.2s, box-shadow 0.2s",
      boxShadow: "0 2px 6px rgba(19, 38, 100, 0.04)"
    },
    brandBar: {
      height: "4px",
      width: "100%",
      backgroundColor: "#132664"
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
      color: "rgba(19, 38, 100, 0.7)",
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
      color: "rgba(19, 38, 100, 0.5)",
      fontWeight: "600"
    },
    badge: {
      display: "flex",
      alignItems: "center",
      gap: "5px",
      fontSize: "10px",
      fontWeight: "700",
      color: "#132664",
      textTransform: "uppercase"
    },
    dot: {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      backgroundColor: isOnline ? "#132664" : "transparent",
      border: "1px solid #132664"
    },
    // Toggle Styles
    toggleTrack: {
      width: "36px",
      height: "20px",
      backgroundColor: isOnline ? "#132664" : "rgba(19, 38, 100, 0.1)",
      border: isOnline ? "none" : "1px solid #132664",
      borderRadius: "10px",
      position: "relative",
      cursor: loading ? "not-allowed" : "pointer",
      transition: "background-color 0.2s"
    },
    toggleThumb: {
      position: "absolute",
      top: isOnline ? "2px" : "1px",
      left: isOnline ? "18px" : "2px",
      width: "16px",
      height: "16px",
      backgroundColor: isOnline ? "#ffffff" : "#132664",
      borderRadius: "50%",
      transition: "left 0.2s, background-color 0.2s",
      boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
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