import React from "react";

export default function RatingsPage() {
  const styles = {
    container: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "60vh",
      color: "#64748b"
    },
    text: {
      marginTop: "16px",
      fontSize: "16px",
      fontWeight: "500",
      letterSpacing: "0.5px"
    }
  };

  return (
    <div style={styles.container}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      <div style={styles.text}>Coming Soon — Ratings module will connect to ClickHouse for 20-level insights</div>
    </div>
  );
}