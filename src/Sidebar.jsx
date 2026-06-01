import React from "react";

const Icons = {
  automation: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>,
  ratings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  theme: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>,
  logout: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
};

export default function Sidebar({ activeTab, setActiveTab }) {
  const styles = {
    sidebar: {
      width: "260px",
      minWidth: "260px",
      backgroundColor: "#ffffff",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      borderRight: "1px solid #e2e8f0"
    },
    header: {
      padding: "24px",
    },
    title: {
      fontSize: "20px",
      fontWeight: "800",
      color: "#0f172a",
      margin: 0,
      letterSpacing: "-0.5px"
    },
    subtitle: {
      fontSize: "12px",
      color: "#64748b",
      fontWeight: "500",
      marginTop: "4px"
    },
    nav: {
      flex: 1,
      padding: "16px 12px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    },
    navItem: (isActive) => ({
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px 16px",
      borderRadius: "8px",
      cursor: "pointer",
      color: isActive ? "#0f172a" : "#64748b",
      backgroundColor: isActive ? "#f1f5f9" : "transparent",
      fontWeight: isActive ? "600" : "500",
      fontSize: "14px",
      transition: "background-color 0.2s, color 0.2s"
    }),
    bottomSection: {
      padding: "16px 12px",
      borderTop: "1px solid #e2e8f0"
    },
    actionItem: (isLogout) => ({
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px 16px",
      borderRadius: "8px",
      cursor: "pointer",
      color: isLogout ? "#ef4444" : "#64748b",
      fontWeight: "500",
      fontSize: "14px",
      transition: "background-color 0.2s"
    })
  };

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <h1 style={styles.title}>CUREFOODS</h1>
        <div style={styles.subtitle}>Dashboard</div>
      </div>
      <div style={styles.nav}>
        <div style={styles.navItem(activeTab === "automation")} onClick={() => setActiveTab("automation")}>
          {Icons.automation} Automation
        </div>
        <div style={styles.navItem(activeTab === "ratings")} onClick={() => setActiveTab("ratings")}>
          {Icons.ratings} Ratings
        </div>
        <div style={styles.navItem(activeTab === "settings")} onClick={() => setActiveTab("settings")}>
          {Icons.settings} Settings
        </div>
      </div>
      <div style={styles.bottomSection}>
        <div style={styles.actionItem(false)}>{Icons.theme} System Theme</div>
        <div style={styles.actionItem(true)}>{Icons.logout} Logout</div>
      </div>
    </div>
  );
}