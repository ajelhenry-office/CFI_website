import React from "react";

const Icons = {
  toggle: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="5" width="22" height="14" rx="7" ry="7"></rect>
      <circle cx="16" cy="12" r="3"></circle>
    </svg>
  ),
  timing: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  ),
  reviews: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  ),
  backfill: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  ),
  ratings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  ),
  theme: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  ),
  logout: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  ),
  chevronLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  )
};

export default function Sidebar({ activeTab, setActiveTab, isCollapsed, setIsCollapsed }) {
  const styles = {
    sidebar: {
      width: isCollapsed ? "0px" : "260px",
      minWidth: isCollapsed ? "0px" : "260px",
      backgroundColor: "#132664",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      borderRight: "1px solid rgba(255, 255, 255, 0.1)",
      transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      overflow: "hidden",
      position: "relative"
    },
    header: {
      padding: "24px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
    },
    titleGroup: {
      flex: 1,
      overflow: "hidden"
    },
    title: {
      fontSize: "18px",
      fontWeight: "800",
      color: "#ffffff",
      margin: 0,
      letterSpacing: "0.5px",
      whiteSpace: "nowrap"
    },
    subtitle: {
      fontSize: "11px",
      color: "rgba(255, 255, 255, 0.6)",
      fontWeight: "500",
      marginTop: "2px",
      whiteSpace: "nowrap"
    },
    collapseBtn: {
      background: "rgba(255, 255, 255, 0.1)",
      border: "none",
      borderRadius: "50%",
      width: "28px",
      height: "28px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#ffffff",
      cursor: "pointer",
      transition: "background 0.2s"
    },
    nav: {
      flex: 1,
      padding: "20px 12px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      overflowY: "auto"
    },
    navItem: (isActive) => ({
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 16px",
      borderRadius: "8px",
      cursor: "pointer",
      color: isActive ? "#132664" : "rgba(255, 255, 255, 0.8)",
      backgroundColor: isActive ? "#ffffff" : "transparent",
      fontWeight: isActive ? "700" : "500",
      fontSize: "13.5px",
      transition: "background-color 0.2s, color 0.2s",
      outline: "none"
    }),
    bottomSection: {
      padding: "16px 12px",
      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
      backgroundColor: "rgba(0, 0, 0, 0.1)"
    },
    actionItem: (isLogout) => ({
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 16px",
      borderRadius: "8px",
      cursor: "pointer",
      color: isLogout ? "#ff8888" : "rgba(255, 255, 255, 0.8)",
      backgroundColor: "transparent",
      fontWeight: "500",
      fontSize: "13.5px",
      transition: "background-color 0.2s, color 0.2s"
    })
  };

  const menuItems = [
    { id: "toggle", name: "Toggle", icon: Icons.toggle },
    { id: "timing", name: "Timing", icon: Icons.timing },
    { id: "reviews", name: "Dine-in Reviews", icon: Icons.reviews },
    { id: "backfill", name: "Route Backfilling", icon: Icons.backfill },
    { id: "ratings", name: "Ratings & Insights", icon: Icons.ratings },
    { id: "settings", name: "Settings", icon: Icons.settings },
    { id: "theme", name: "System Theme", icon: Icons.theme }
  ];

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <h1 style={styles.title}>CUREFOODS</h1>
          <div style={styles.subtitle}>Partner Dashboard</div>
        </div>
        <button
          style={styles.collapseBtn}
          onClick={() => setIsCollapsed(true)}
          title="Collapse Sidebar"
        >
          {Icons.chevronLeft}
        </button>
      </div>
      
      <div style={styles.nav}>
        {menuItems.map((item) => (
          <div
            key={item.id}
            style={styles.navItem(activeTab === item.id)}
            onClick={() => setActiveTab(item.id)}
          >
            {item.icon}
            <span style={{ whiteSpace: "nowrap" }}>{item.name}</span>
          </div>
        ))}
      </div>

      <div style={styles.bottomSection}>
        <div 
          style={styles.actionItem(true)} 
          onClick={() => setActiveTab("logout")}
        >
          {Icons.logout}
          <span style={{ whiteSpace: "nowrap" }}>Logout</span>
        </div>
      </div>
    </div>
  );
}