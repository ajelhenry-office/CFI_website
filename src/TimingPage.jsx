import React, { useState } from "react";
import { updateTiming } from "./api";

export default function TimingPage({ stores }) {
  const [filterBrand, setFilterBrand] = useState("All Brands");

  const filteredStores = stores.filter(s => 
    filterBrand === "All Brands" || s.brand === filterBrand
  );

  const styles = {
    container: {
      padding: "32px 40px",
      maxWidth: "1000px",
      margin: "0 auto"
    },
    banner: {
      backgroundColor: "rgba(245, 158, 11, 0.1)",
      border: "1px solid rgba(245, 158, 11, 0.3)",
      color: "#fcd34d",
      padding: "16px",
      borderRadius: "8px",
      marginBottom: "32px",
      fontSize: "14px",
      fontWeight: "500",
      display: "flex",
      alignItems: "center",
      gap: "12px"
    },
    list: {
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.banner}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        Zomato only — timing changes take ~60 seconds to apply via automation
      </div>
      <div style={styles.list}>
        {filteredStores.map(store => (
          <TimingRow key={store.id} store={store} />
        ))}
      </div>
    </div>
  );
}

function TimingRow({ store }) {
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("23:00");
  const [status, setStatus] = useState("idle"); // idle, loading, success

  const handleApply = async () => {
    setStatus("loading");
    try {
      await updateTiming(store.location_id, store.name, openTime, closeTime);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e) {
      setStatus("idle");
    }
  };

  const styles = {
    row: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 24px",
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: "8px"
    },
    info: { flex: 1 },
    name: { fontSize: "15px", fontWeight: "600", color: "#ffffff", marginBottom: "4px" },
    brand: { fontSize: "12px", color: "#94a3b8" },
    inputs: { display: "flex", gap: "24px", alignItems: "center" },
    inputGroup: { display: "flex", alignItems: "center", gap: "8px" },
    label: { fontSize: "12px", color: "#64748b", fontWeight: "600" },
    timeInput: {
      backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.2)",
      color: "#ffffff", padding: "8px 12px", borderRadius: "6px", fontFamily: "Inter", outline: "none"
    },
    btn: {
      padding: "10px 24px", borderRadius: "6px", fontWeight: "600", fontSize: "13px",
      border: "none", cursor: status === "loading" ? "not-allowed" : "pointer",
      backgroundColor: status === "success" ? "#10b981" : "#ffffff",
      color: status === "success" ? "#ffffff" : "#0f172a",
      transition: "all 0.2s", width: "100px"
    }
  };

  return (
    <div style={styles.row}>
      <div style={styles.info}>
        <div style={styles.name}>{store.name}</div>
        <div style={styles.brand}>{store.brand}</div>
      </div>
      <div style={styles.inputs}>
        <div style={styles.inputGroup}><span style={styles.label}>OPEN</span><input type="time" style={styles.timeInput} value={openTime} onChange={e=>setOpenTime(e.target.value)} /></div>
        <div style={styles.inputGroup}><span style={styles.label}>CLOSE</span><input type="time" style={styles.timeInput} value={closeTime} onChange={e=>setCloseTime(e.target.value)} /></div>
        <button style={styles.btn} onClick={handleApply}>{status === "loading" ? "..." : status === "success" ? "✓ Applied" : "Apply"}</button>
      </div>
    </div>
  );
}