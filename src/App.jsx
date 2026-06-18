import React, { useState } from "react";
import Sidebar from "./Sidebar";
import TogglePage from "./features/toggle/TogglePage";
import RatingsPage from "./features/ratings/RatingsPage";
import { STORES } from "./features/toggle/stores";
import TimingPage from "./features/timing/TimingPage";
import ReviewsPage from "./features/reviews/ReviewsPage";
import { ZOMATO_STORES } from "../zomato_data";

export default function App() {
  const [activeTab, setActiveTab] = useState("automation");
  const [activeSubTab, setActiveSubTab] = useState("toggle");
  const [stores, setStores] = useState(STORES);
  const [zomatoStores, setZomatoStores] = useState(ZOMATO_STORES);
  const [logs, setLogs] = useState([]);

  const styles = {
    layout: {
      display: "flex",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      fontFamily: "'Inter', sans-serif",
      backgroundColor: "#0b1628",
    },
    mainContent: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    },
    topbar: {
      padding: "32px 40px",
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
    },
    headerRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "24px"
    },
    title: {
      fontSize: "28px",
      fontWeight: "800",
      color: "#ffffff",
      margin: "0 0 4px 0",
      letterSpacing: "-0.5px"
    },
    subtitle: {
      fontSize: "14px",
      color: "#94a3b8",
      fontWeight: "400"
    },
    globalBtn: {
      padding: "10px 18px",
      borderRadius: "24px",
      border: "1px solid rgba(255, 255, 255, 0.3)",
      backgroundColor: "transparent",
      color: "#ffffff",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "background 0.2s"
    },
    filtersAndTabs: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    filterBar: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    chip: {
      padding: "6px 14px",
      borderRadius: "20px",
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      color: "#94a3b8",
      fontSize: "12px",
      fontWeight: "500",
    },
    dot: { color: "#475569", fontSize: "12px" },
    subtabs: { display: "flex", gap: "8px" },
    subtab: (isActive) => ({
      padding: "8px 24px",
      borderRadius: "20px",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: isActive ? "600" : "500",
      color: isActive ? "#0b1628" : "#94a3b8",
      backgroundColor: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.05)",
      border: "none",
      transition: "all 0.2s"
    }),
    contentArea: { flex: 1, overflow: "hidden" }
  };

  return (
    <div style={styles.layout}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={styles.mainContent}>
        <div style={styles.topbar}>
          <div style={styles.headerRow}>
            <div><h1 style={styles.title}>{activeTab === "automation" ? "Automation Hub" : "Ratings & Insights"}</h1><p style={styles.subtitle}>{activeTab === "automation" ? "Manage your store lifecycle seamlessly across platforms" : "Deep drill-down operational metrics"}</p></div>
            <button style={styles.globalBtn}>Global Filters</button>
          </div>
          <div style={styles.filtersAndTabs}>
            <div style={styles.filterBar}><div style={styles.chip}>All Locations</div><span style={styles.dot}>•</span><div style={styles.chip}>All Brands</div><span style={styles.dot}>•</span><div style={styles.chip}>All Platforms</div><span style={styles.dot}>•</span><div style={styles.chip}>Last 7 Days</div></div>
            {activeTab === "automation" && (<div style={styles.subtabs}><button style={styles.subtab(activeSubTab === "toggle")} onClick={() => setActiveSubTab("toggle")}>Toggle</button><button style={styles.subtab(activeSubTab === "timing")} onClick={() => setActiveSubTab("timing")}>Timing</button><button style={styles.subtab(activeSubTab === "reviews")} onClick={() => setActiveSubTab("reviews")}>Dine-in Reviews</button></div>)}
          </div>
        </div>
        <div style={styles.contentArea}>
          {activeTab === "automation" ? (activeSubTab === "toggle" ? <TogglePage stores={stores} setStores={setStores} logs={logs} setLogs={setLogs} /> : activeSubTab === "timing" ? <TimingPage stores={zomatoStores} /> : <ReviewsPage />) : <RatingsPage />}
        </div>
      </div>
    </div>
  );
}
