import React from "react";

const BUTTONS = [
  {
    group: "PERFORMANCE", color: "#3b82f6",
    items: [
      { id: 1,  label: "Brand vs Brand Rating" },
      { id: 2,  label: "Zone Level Rating" },
      { id: 3,  label: "City Level Rating" },
      { id: 4,  label: "Kitchen Level Rating" },
      { id: 5,  label: "Platform Comparison" },
      { id: 6,  label: "Top Rated SKU" },
      { id: 7,  label: "Worst Rated SKU" },
      { id: 8,  label: "Best Selling SKU" },
      { id: 9,  label: "Category Rating" },
      { id: 10, label: "High Volume Low Rating" },
    ],
  },
  {
    group: "TRENDS", color: "#06b6d4",
    items: [
      { id: 11, label: "Star Distribution" },
      { id: 12, label: "Month over Month Trend" },
      { id: 13, label: "Volume vs Rating" },
      { id: 14, label: "Weekend vs Weekday" },
      { id: 15, label: "Peak Bad Rating Hours" },
    ],
  },
  {
    group: "AI POWERED", color: "#a78bfa",
    items: [
      { id: 16, label: "Repeat Complaints" },
      { id: 17, label: "Delivery vs Kitchen" },
      { id: 18, label: "Weekly AI Brief" },
      { id: 19, label: "Action Items" },
      { id: 20, label: "Packaging Issues" },
    ],
  },
];

export default function InsightButtons({ activeId, loadingId, onSelect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {BUTTONS.map(({ group, color, items }) => (
        <div key={group}>
          <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "1.5px", marginBottom: 10 }}>
            {group}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {items.map(({ id, label }) => {
              const isActive  = activeId === id;
              const isLoading = loadingId === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  disabled={isLoading}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: isLoading ? "not-allowed" : "pointer",
                    border: `1px solid ${isActive ? color : "rgba(255,255,255,0.1)"}`,
                    background: isActive ? `${color}22` : "rgba(255,255,255,0.03)",
                    color: isActive ? color : "#94a3b8",
                    transition: "all 0.2s",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {isLoading && (
                    <span style={{
                      width: 10, height: 10, border: `2px solid ${color}`,
                      borderTopColor: "transparent", borderRadius: "50%",
                      display: "inline-block", animation: "spin 0.6s linear infinite",
                    }} />
                  )}
                  {id}. {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
