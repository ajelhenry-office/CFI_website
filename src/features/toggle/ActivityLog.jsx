import React from "react";

const Icons = {
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
};

export default function ActivityLog({ logs }) {
  const styles = {
    container: {
      width: "280px",
      backgroundColor: "#ffffff",
      borderLeft: "1px solid rgba(19, 38, 100, 0.15)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      flexShrink: 0
    },
    header: {
      padding: "20px 24px",
      borderBottom: "1px solid rgba(19, 38, 100, 0.15)",
      fontSize: "13px",
      fontWeight: "700",
      color: "#132664",
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
      color: "rgba(19, 38, 100, 0.6)",
      fontSize: "13px",
      textAlign: "center",
      marginTop: "32px"
    },
    entry: {
      display: "flex",
      gap: "12px",
      alignItems: "flex-start",
      padding: "12px",
      backgroundColor: "rgba(19, 38, 100, 0.03)",
      borderRadius: "8px",
      border: "1px solid rgba(19, 38, 100, 0.08)"
    },
    iconWrapper: (success) => ({
      width: "20px",
      height: "20px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: success ? "#132664" : "#ffffff",
      border: "1px solid #132664",
      color: success ? "#ffffff" : "#132664",
      flexShrink: 0
    }),
    details: {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    storeName: {
      fontSize: "13px",
      fontWeight: "700",
      color: "#132664"
    },
    actionLine: {
      fontSize: "12px",
      color: "#132664",
      fontWeight: "600"
    },
    time: {
      fontSize: "11px",
      color: "rgba(19, 38, 100, 0.5)"
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
                <div style={styles.actionLine}>
                  → {log.action} {log.success ? "" : "(FAILED)"}
                </div>
                {log.errorMsg && (
                  <div style={{ fontSize: "11px", color: "#132664", fontWeight: "600", marginTop: "4px", lineHeight: "1.4" }}>
                    Error: {log.errorMsg}
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