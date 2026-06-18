import React from "react";

const Icons = {
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
};

export default function ActivityLog({ logs }) {
  const styles = {
    container: {
      width: "280px",
      backgroundColor: "rgba(255, 255, 255, 0.02)",
      borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      flexShrink: 0
    },
    header: {
      padding: "20px 24px",
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      fontSize: "14px",
      fontWeight: "600",
      color: "#ffffff",
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    logList: {
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      overflowY: "auto",
      flex: 1
    },
    empty: {
      color: "#64748b",
      fontSize: "13px",
      textAlign: "center",
      marginTop: "32px"
    },
    entry: {
      display: "flex",
      gap: "12px",
      alignItems: "flex-start",
      padding: "12px",
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      borderRadius: "8px",
      border: "1px solid rgba(255, 255, 255, 0.05)"
    },
    iconWrapper: (success) => ({
      width: "20px",
      height: "20px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: success ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
      color: success ? "#10b981" : "#ef4444",
      flexShrink: 0
    }),
    details: {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    storeName: {
      fontSize: "13px",
      fontWeight: "600",
      color: "#ffffff"
    },
    actionLine: (success) => ({
      fontSize: "12px",
      color: success ? "#10b981" : "#ef4444",
      fontWeight: "500"
    }),
    time: {
      fontSize: "11px",
      color: "#64748b"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>Activity Log</div>
      <div style={styles.logList}>
        {logs.length === 0 ? (
          <div style={styles.empty}>No recent activity</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={styles.entry}>
              <div style={styles.iconWrapper(log.success)}>
                {log.success ? Icons.check : Icons.x}
              </div>
              <div style={styles.details}>
                <div style={styles.storeName}>{log.store}</div>
                <div style={styles.actionLine(log.success)}>
                  → {log.action} {log.success ? "" : "(FAILED)"}
                </div>
                {log.errorMsg && (
                  <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px", lineHeight: "1.4" }}>
                    {log.errorMsg}
                  </div>
                )}
                <div style={styles.time}>{log.time}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}