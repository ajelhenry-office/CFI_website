import React, { useState, useEffect } from "react";
import { STORES } from "../toggle/stores";

export default function RouteBackfillingPage({ globalFilters }) {
  const [localBrand, setLocalBrand] = useState("");
  const [localStore, setLocalStore] = useState("");
  const [platform, setPlatform] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);

  // Sync state with global filters if they change
  useEffect(() => {
    if (globalFilters.brand) setLocalBrand(globalFilters.brand);
    if (globalFilters.dateFrom) setDateFrom(globalFilters.dateFrom);
    if (globalFilters.dateTo) setDateTo(globalFilters.dateTo);
  }, [globalFilters]);

  // Options
  const uniqueBrands = Array.from(new Set(STORES.map(s => s.brand))).sort();
  const filteredStores = STORES.filter(s => !localBrand || s.brand === localBrand);

  const startBackfilling = () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setSyncLogs([]);

    const logSteps = [
      { text: "⚡ Initializing route backfill pipeline...", delay: 200 },
      { text: `🔑 Authenticating connection to platforms (Selected: ${platform.toUpperCase()})...`, delay: 800 },
      { text: "✅ Authentication successful.", delay: 1300 },
      { text: `🔍 Querying missing route maps for brand: ${localBrand || "All Brands"}, outlet: ${localStore || "All Outlets"}...`, delay: 2000 },
      { text: `📅 Selected interval: ${dateFrom || "Start of time"} to ${dateTo || "Present"}`, delay: 2700 },
      { text: "📥 Fetching delivery coordinate logs from aggregator databases...", delay: 3500 },
      { text: "📊 Found 37 order routes with missing or corrupt track coordinates.", delay: 4200 },
      { text: "⚙️ Repairing route segment datasets...", delay: 5000 },
      { text: "➡️ Injecting repaired route logs back into analytical tables (outlet_master/insights)...", delay: 5800 },
      { text: "🔄 Re-aggregating ratings and travel duration models...", delay: 6800 },
      { text: "✨ Route backfilling completed successfully! 37 routes recovered & synced.", delay: 7600 }
    ];

    logSteps.forEach(step => {
      setTimeout(() => {
        setSyncLogs(prev => [...prev, { text: step.text, timestamp: new Date().toLocaleTimeString() }]);
      }, step.delay);
    });

    setTimeout(() => {
      setIsSyncing(false);
    }, 7800);
  };

  const styles = {
    container: {
      padding: "32px 40px",
      height: "100%",
      overflowY: "auto",
      boxSizing: "border-box",
      backgroundColor: "#ffffff"
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "40px",
      alignItems: "start",
      marginTop: "16px"
    },
    card: {
      border: "1px solid rgba(19, 38, 100, 0.15)",
      borderRadius: "12px",
      padding: "24px",
      backgroundColor: "#ffffff"
    },
    formGroup: {
      marginBottom: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    label: {
      fontSize: "12px",
      fontWeight: "700",
      color: "#132664"
    },
    input: {
      padding: "10px 14px",
      border: "1px solid #132664",
      borderRadius: "8px",
      fontSize: "13px",
      color: "#132664",
      backgroundColor: "#ffffff",
      outline: "none"
    },
    btn: {
      backgroundColor: isSyncing ? "rgba(19, 38, 100, 0.5)" : "#132664",
      color: "#ffffff",
      padding: "12px 24px",
      border: "none",
      borderRadius: "24px",
      fontWeight: "700",
      fontSize: "13px",
      cursor: isSyncing ? "not-allowed" : "pointer",
      marginTop: "12px",
      transition: "background-color 0.2s"
    },
    console: {
      backgroundColor: "#132664",
      color: "#ffffff",
      borderRadius: "12px",
      padding: "20px",
      height: "380px",
      display: "flex",
      flexDirection: "column",
      fontFamily: "ui-monospace, Consolas, monospace",
      fontSize: "12px",
      boxShadow: "inset 0 2px 8px rgba(0,0,0,0.3)"
    },
    consoleHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: "1px solid rgba(255,255,255,0.15)",
      paddingBottom: "8px",
      marginBottom: "12px",
      fontSize: "11px",
      color: "rgba(255, 255, 255, 0.7)",
      textTransform: "uppercase",
      letterSpacing: "1px"
    },
    consoleLogArea: {
      flex: 1,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    logLine: {
      lineHeight: "1.4"
    },
    logTime: {
      color: "rgba(255,255,255,0.5)",
      marginRight: "8px"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        {/* FORM */}
        <div style={styles.card}>
          <h3 style={{ fontSize: "16px", marginBottom: "16px", color: "#132664" }}>Trigger Backfilling</h3>
          
          <div style={styles.formGroup}>
            <label style={styles.label}>Brand</label>
            <select style={styles.input} value={localBrand} onChange={e => { setLocalBrand(e.target.value); setLocalStore(""); }}>
              <option value="">All Brands</option>
              {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Select Outlet</label>
            <select style={styles.input} value={localStore} onChange={e => setLocalStore(e.target.value)}>
              <option value="">All Outlets</option>
              {filteredStores.map(s => <option key={s.id} value={s.name}>{s.name} ({s.city})</option>)}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Platform</label>
            <select style={styles.input} value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="all">All Platforms</option>
              <option value="zomato">Zomato Only</option>
              <option value="swiggy">Swiggy Only</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date From</label>
              <input type="date" style={styles.input} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date To</label>
              <input type="date" style={styles.input} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>

          <button style={styles.btn} onClick={startBackfilling} disabled={isSyncing}>
            {isSyncing ? "🔄 Syncing Route Data..." : "🚀 Run Route Backfill"}
          </button>
        </div>

        {/* SIMULATOR CONSOLE */}
        <div style={styles.console}>
          <div style={styles.consoleHeader}>
            <span>Pipeline Console</span>
            <span>Status: {isSyncing ? "RUNNING" : "IDLE"}</span>
          </div>
          <div style={styles.consoleLogArea}>
            {syncLogs.length === 0 ? (
              <div style={{ color: "rgba(255, 255, 255, 0.4)", textAlign: "center", marginTop: "120px" }}>
                Console idle. Configure parameters and click "Run Route Backfill" to start.
              </div>
            ) : (
              syncLogs.map((log, index) => (
                <div key={index} style={styles.logLine}>
                  <span style={styles.logTime}>[{log.timestamp}]</span>
                  <span>{log.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
