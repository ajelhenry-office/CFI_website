import React, { useEffect } from "react";

const C = { text: "#132664", bg: "#ffffff", border: "rgba(19, 38, 100, 0.15)" };

function Card({ children, style }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, color: C.text, boxShadow: "0 2px 8px rgba(19, 38, 100, 0.03)", ...style }}>
      {children}
    </div>
  );
}

export default function TextAIInsight({ title, textContent, onClose, onRegisterDownload }) {
  useEffect(() => {
    if (onRegisterDownload) {
      const getDownloadDataSheets = () => {
        return [{
          sheetName: "AI Summary",
          rows: [{ "AI Operations Report": textContent }]
        }];
      };
      onRegisterDownload(getDownloadDataSheets);
    }
    return () => {
      if (onRegisterDownload) onRegisterDownload(null);
    };
  }, [textContent, onRegisterDownload]);

  const renderLines = () => {
    if (typeof textContent !== "string") return null;
    return textContent.split("\n").map((line, idx) => {
      if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
        return (
          <li key={idx} style={{ marginBottom: "8px", lineHeight: "1.6" }}>
            {line.trim().substring(1).trim()}
          </li>
        );
      }
      return (
        <p key={idx} style={{ margin: "0 0 10px 0", lineHeight: "1.6", fontWeight: line.includes(":") ? "700" : "500" }}>
          {line}
        </p>
      );
    });
  };

  return (
    <Card style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid rgba(19, 38, 100, 0.15)", paddingBottom: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>✨</span>
          <h3 style={{ fontSize: "15px", fontWeight: "800", margin: 0, color: "#132664" }}>{title}</h3>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#132664", fontSize: "18px", cursor: "pointer", fontWeight: "bold" }}>✕</button>
        )}
      </div>

      <div style={{ 
        backgroundColor: "rgba(19, 38, 100, 0.02)", 
        border: "1px solid rgba(19, 38, 100, 0.08)", 
        borderRadius: "8px", 
        padding: "20px", 
        fontSize: "13px", 
        color: "#132664",
        overflowY: "auto",
        maxHeight: "400px"
      }}>
        {renderLines()}
      </div>
    </Card>
  );
}
