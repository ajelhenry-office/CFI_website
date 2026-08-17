import { useState, useEffect } from "react";
import { C, FONT } from "../../theme";

const BRAND_COLOR = {
  "Cake Zone": "#d97706",
  "Ovenfresh": "#132664",
  "eatfit": "#15803d",
};

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

function timeAgo(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const smallBtn = {
  flex: 1,
  padding: "6px 0",
  borderRadius: 6,
  border: "none",
  fontSize: 9.5,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: FONT,
};

export default function StoreCard({ store, onToggle, onCorrect, isBulking, dbState }) {
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mockOrders, setMockOrders] = useState(dbState?.active_orders || 0);
  const [showCorrect, setShowCorrect] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  // useState's initial value only runs once on mount — without this, the badge stays
  // frozen at whatever active_orders was when the card first rendered, never picking
  // up the 15-second sidebar poll's fresher data.
  useEffect(() => {
    setMockOrders(dbState?.active_orders || 0);
  }, [dbState?.active_orders]);

  const isOnline = store.status === "online";
  const desiredState = dbState?.desired_state || (isOnline ? "ONLINE" : "OFFLINE");
  const busy = loading || isBulking;

  const handleClick = async () => {
    if (busy) return;
    setLoading(true);
    await onToggle(store, isOnline ? "disable" : "enable");
    setLoading(false);
  };

  const handleCorrect = async (actualStatus) => {
    setCorrecting(true);
    await onCorrect(store, actualStatus);
    setCorrecting(false);
    setShowCorrect(false);
  };

  const brandColor = BRAND_COLOR[store.brand] || C.primary;
  const confirmedText = timeAgo(store.status_updated_at);
  const isStale = store.status_updated_at && (Date.now() - new Date(store.status_updated_at).getTime()) > STALE_AFTER_MS;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: "#ffffff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        opacity: busy ? 0.7 : 1,
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: hovered ? "0 8px 24px rgba(19,38,100,0.12)" : "0 2px 8px rgba(19,38,100,0.04)",
        transform: hovered ? "translateY(-2px)" : "none",
        fontFamily: FONT,
      }}
    >
      {/* Status bar */}
      <div style={{ height: 4, backgroundColor: isOnline ? "#22c55e" : "#ef4444", transition: "background-color 0.3s" }} />

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {/* Brand badge + status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: brandColor, textTransform: "uppercase", letterSpacing: 0.8, backgroundColor: `${brandColor}12`, borderRadius: 6, padding: "3px 7px", alignSelf: "flex-start" }}>
              {(store.brand === 'olio' || store.brand === 'eatfit') && store.zone ? store.zone : store.brand}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 800,
              color: mockOrders > 15 ? "#dc2626" : "#15803d",
              backgroundColor: mockOrders > 15 ? "#fee2e2" : "#dcfce7",
              borderRadius: 4, padding: "2px 6px", alignSelf: "flex-start"
            }}>
              Orders: {mockOrders}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: isOnline ? "#15803d" : "#dc2626", border: `1px solid ${isOnline ? "#15803d" : "#dc2626"}33`, borderRadius: 20, padding: "3px 9px" }}>
              {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
            {desiredState && desiredState.toLowerCase() !== (isOnline ? "online" : "offline") && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "#d97706", backgroundColor: "#fef3c7", padding: "2px 6px", borderRadius: 4 }}>
                Target: {desiredState}
              </span>
            )}
          </div>
        </div>

        {/* Store name */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.primary, lineHeight: 1.3 }}>{store.name}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
            {[store.city, store.zone].filter(Boolean).join(" · ")}
          </div>
        </div>

        {/* Confidence indicator + manual correction trigger */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9, fontWeight: isStale ? 700 : 500, color: isStale ? "#d97706" : C.muted }}>
            {confirmedText ? `Confirmed ${confirmedText}` : "Not yet confirmed"}
          </span>
          {!showCorrect && (
            <button
              onClick={() => setShowCorrect(true)}
              title="Use this if UrbanPiper shows a different status than what's shown here"
              style={{ background: "none", border: "none", color: C.muted, fontSize: 9, fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0 }}
            >
              Fix mismatch?
            </button>
          )}
        </div>

        {showCorrect && (
          <div style={{ display: "flex", gap: 5 }}>
            <button
              onClick={() => handleCorrect("online")}
              disabled={correcting}
              style={{ ...smallBtn, backgroundColor: "#dcfce7", color: "#15803d", opacity: correcting ? 0.6 : 1 }}
            >
              Actually Online
            </button>
            <button
              onClick={() => handleCorrect("offline")}
              disabled={correcting}
              style={{ ...smallBtn, backgroundColor: "#fee2e2", color: "#b91c1c", opacity: correcting ? 0.6 : 1 }}
            >
              Actually Offline
            </button>
            <button
              onClick={() => setShowCorrect(false)}
              disabled={correcting}
              style={{ ...smallBtn, flex: "0 0 auto", padding: "6px 10px", backgroundColor: "transparent", color: C.muted }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={handleClick}
          disabled={busy}
          style={{
            marginTop: "auto",
            padding: "8px 0",
            borderRadius: 8,
            border: "none",
            fontSize: 12,
            fontWeight: 800,
            cursor: busy ? "not-allowed" : "pointer",
            fontFamily: FONT,
            transition: "all 0.2s",
            backgroundColor: isOnline ? "#fee2e2" : "#dcfce7",
            color: isOnline ? "#b91c1c" : "#15803d",
          }}
        >
          {loading ? "Working…" : isOnline ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}
