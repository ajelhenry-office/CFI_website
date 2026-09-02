import { useEffect, useState } from "react";
import { C, FONT } from "../../theme";
import { API_BASE, getAuthHeaders } from "../../api";

// A small warning indicator, fixed to the top-right of the viewport so it's
// visible regardless of which tab is open — not just the Ratings tab —
// since a stuck mail fetch is easy to miss otherwise until someone happens
// to notice the Ratings numbers look stale. Renders nothing at all unless
// there's actually something to flag; a failed health check itself stays
// silent here rather than showing a false alarm — the backend's own email
// alert is the real safety net, this is just an at-a-glance extra.
export default function RatingsHealthBadge() {
  const [health, setHealth] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => {
      fetch(`${API_BASE}/api/insights/health`, { headers: getAuthHeaders() })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (alive && data) setHealth(data);
        })
        .catch(() => {});
    };
    check();
    // Re-checks periodically so a badge doesn't sit stale (either showing a
    // warning that's since cleared, or missing one that just started) for
    // however long someone happens to leave a tab open without reloading.
    const interval = setInterval(check, 20 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (!health?.isStale) return null;

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1000, fontFamily: FONT }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ratings & Insights mail fetch may be stuck"
        aria-label="Ratings & Insights mail fetch may be stuck"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          border: "1.5px solid #d97706",
          backgroundColor: "#fffbeb",
          boxShadow: "0 2px 10px rgba(217,119,6,0.35)",
          fontSize: 17,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ⚠️
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            width: 280,
            backgroundColor: "#ffffff",
            border: "1.5px solid #d97706",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 8px 26px rgba(217,119,6,0.25)",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#d97706", marginBottom: 6 }}>
            Ratings mail fetch may be stuck
          </div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
            Last confirmed check: <b>{health.markerDate || "never"}</b>
            {health.daysBehind != null && ` (${health.daysBehind} day${health.daysBehind === 1 ? "" : "s"} ago)`}
            <br />
            Latest data available: <b>{health.latestDataDate || "none"}</b>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            The daily automation should always reach at least yesterday. If this
            keeps showing, the mail pipeline needs attention.
          </div>
        </div>
      )}
    </div>
  );
}
