import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders, API_BASE } from "../../api";
import { C, FONT } from "../../theme";

const STATUS_STYLE = {
  ok: { label: "OK", color: C.ok, bg: "rgba(40,167,69,0.08)" },
  rate_limited: { label: "Rate Limited", color: C.warn, bg: "rgba(255,193,7,0.12)" },
  invalid: { label: "Invalid Key", color: C.danger, bg: "rgba(220,53,69,0.08)" },
  error: { label: "Error", color: C.danger, bg: "rgba(220,53,69,0.08)" },
  untested: { label: "Untested", color: C.muted, bg: "rgba(19,38,100,0.04)" },
  unknown: { label: "Unknown", color: C.muted, bg: "rgba(19,38,100,0.04)" },
};

export default function ReviewsHealthSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [keys, setKeys] = useState([]);

  const fetchHealth = useCallback(() => {
    fetch(`${API_BASE}/api/reviews/ai-health`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => setKeys(d.keys || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 15000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)",
            backgroundColor: C.primary, color: "#fff", border: "none", borderRadius: "10px 0 0 10px",
            padding: "14px 10px", cursor: "pointer", fontFamily: FONT, fontSize: 11, fontWeight: 800,
            writingMode: "vertical-rl", letterSpacing: 1, zIndex: 400, boxShadow: "-4px 0 16px rgba(19,38,100,0.15)",
          }}
        >
          AI KEYS ▲
        </button>
      )}

      <div
        style={{
          position: "fixed", top: 0, right: isOpen ? 0 : -320, width: 300, height: "100vh",
          backgroundColor: "#ffffff", borderLeft: `2px solid ${C.border}`,
          boxShadow: isOpen ? "-8px 0 32px rgba(19,38,100,0.12)" : "none",
          transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)", zIndex: 450,
          display: "flex", flexDirection: "column", fontFamily: FONT, overflowY: "auto",
        }}
      >
        <div style={{ padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>AI Key Health</div>
          <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {keys.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted }}>No AI keys configured.</div>
          )}
          {keys.map((k) => {
            const s = STATUS_STYLE[k.status] || STATUS_STYLE.unknown;
            return (
              <div key={k.keyPreview} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, textTransform: "capitalize" }}>{k.provider}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: s.color, backgroundColor: s.bg, padding: "3px 8px", borderRadius: 12 }}>
                    {s.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>{k.keyPreview}</div>
                {k.lastError && (
                  <div style={{ fontSize: 10, color: C.danger, marginTop: 4 }}>{k.lastError.slice(0, 80)}</div>
                )}
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  {k.lastAttemptAt ? `Last checked: ${new Date(k.lastAttemptAt).toLocaleTimeString("en-IN")}` : "Never used yet"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isOpen && (
        <div onClick={() => setIsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 440, backgroundColor: "rgba(19,38,100,0.08)" }} />
      )}
    </>
  );
}
