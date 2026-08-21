import { useState, useEffect } from "react";
import { C, FONT } from "../../theme";

const BRAND_COLOR = {
  "Cake Zone": "#d97706",
  "Ovenfresh": "#132664",
  "eatfit": "#15803d",
  "Cheesecakes By CakeZone": "#9333ea",
};

export default function StoreCard({ store, onToggle, isBulking, dbState, readOnly = false }) {
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mockOrders, setMockOrders] = useState(dbState?.active_orders || 0);

  // useState's initial value only runs once on mount — without this, the badge stays
  // frozen at whatever active_orders was when the card first rendered, never picking
  // up the 15-second sidebar poll's fresher data.
  useEffect(() => {
    setMockOrders(dbState?.active_orders || 0);
  }, [dbState?.active_orders]);

  const isOnline = store.status === "online";
  const isPaused = !!store.paused;
  const desiredState = dbState?.desired_state || (isOnline ? "ONLINE" : "OFFLINE");
  const busy = loading || isBulking;

  const handleClick = async () => {
    if (busy || isPaused) return;
    setLoading(true);
    await onToggle(store, isOnline ? "disable" : "enable");
    setLoading(false);
  };

  const brandColor = BRAND_COLOR[store.brand] || C.primary;
  // The order-count badge and its threshold only mean anything for eatfit — it's the
  // only brand the backend tracks active_orders for or auto-throttles on (see
  // EATFIT_THROTTLE_THRESHOLD server-side); other brands' active_orders is never
  // populated, so showing it there would just be a meaningless stale zero.
  const isEatfit = String(store.brand).toLowerCase() === 'eatfit';

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
      <div style={{ height: 4, backgroundColor: isPaused ? "#f59e0b" : (isOnline ? "#22c55e" : "#ef4444"), transition: "background-color 0.3s" }} />

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {/* Brand badge + status */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: brandColor, textTransform: "uppercase", letterSpacing: 0.8, backgroundColor: `${brandColor}12`, borderRadius: 6, padding: "3px 7px", alignSelf: "flex-start" }}>
              {(store.brand === 'olio' || store.brand === 'eatfit') && store.zone ? store.zone : store.brand}
            </span>
            {isEatfit && (
              <span style={{
                fontSize: 9, fontWeight: 800,
                color: mockOrders > 15 ? "#dc2626" : "#15803d",
                backgroundColor: mockOrders > 15 ? "#fee2e2" : "#dcfce7",
                borderRadius: 4, padding: "2px 6px", alignSelf: "flex-start"
              }}>
                Orders: {mockOrders}
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            {isPaused ? (
              <span style={{ fontSize: 10, fontWeight: 800, color: "#b45309", border: "1px solid #b4530933", borderRadius: 20, padding: "3px 9px" }}>
                ⏸ PAUSED
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 800, color: isOnline ? "#15803d" : "#dc2626", border: `1px solid ${isOnline ? "#15803d" : "#dc2626"}33`, borderRadius: 20, padding: "3px 9px" }}>
                {isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            )}
            {!isPaused && desiredState && desiredState.toLowerCase() !== (isOnline ? "online" : "offline") && (
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

        {isPaused && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, fontWeight: 500, color: C.muted }}>
              {store.pause_reason ? `"${store.pause_reason}"` : "No reason given"}
            </span>
          </div>
        )}

        {/* Toggle button — hidden entirely in read-only (Home/all-brands) view */}
        {isPaused ? (
          <div style={{ marginTop: "auto", padding: "8px 0", borderRadius: 8, fontSize: 11, fontWeight: 700, textAlign: "center", backgroundColor: "#fef3c7", color: "#b45309" }}>
            Paused — resume in Manage Stores
          </div>
        ) : readOnly ? null : (
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
        )}
      </div>
    </div>
  );
}
