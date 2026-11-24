import { useCallback, useEffect, useState } from "react";
import { C, FONT } from "../../theme";
import { API_BASE, getAuthHeaders, handleApiError } from "../../api";
import PlatformLogo from "./PlatformLogo";
import { platformByName } from "./platforms";

// Top-right alerts on the Timing tab for any partner login that isn't working:
// which platform/account, what went wrong, which brands and how many stores it
// affects, and what to do. Refreshes every 5 minutes; dismissing hides an alert
// until the page is reloaded (it comes back if the problem is still there).
const REFRESH_MS = 5 * 60 * 1000;

const PROBLEM = {
  expired: "login expired",
  error: "login failed",
  changed: "account changed",
};

function describe(c) {
  const platform = c.platform === "zomato" ? "Zomato" : c.platform === "swiggy" ? "Swiggy" : c.platform;
  const who = c.platform === "swiggy" ? `${platform} account ${c.account}` : platform;
  const fix = c.platform === "zomato"
    ? 'Log in again: run server/timing/zomato_login.py and use "Continue with Email" (one-time code).'
    : `Check the phone number and password for ${who} (SWIGGY_PHONE_${c.account} / SWIGGY_PASSWORD_${c.account}) — the password may have changed.`;
  return { platform, title: `${who} — ${PROBLEM[c.status]}`, fix };
}

export default function TimingConnectionAlerts() {
  const [problems, setProblems] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/timing/connections`, { headers: getAuthHeaders() });
      if (handleApiError(res)) return;
      const body = await res.json();
      if (body.success) setProblems(body.connections.filter(c => PROBLEM[c.status]));
    } catch {
      // A failed status poll shouldn't itself raise an alert; the next poll retries.
    }
  }, []);

  useEffect(() => {
    // Initial load + periodic refresh; load() only sets state after its fetch resolves.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  const recheck = async () => {
    setChecking(true);
    setCheckMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/timing/connections/check`, { method: "POST", headers: getAuthHeaders() });
      if (handleApiError(res)) return;
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) throw new Error(body.error || `Re-check failed (${res.status})`);
      setDismissed(new Set());
      await load();
      setCheckMsg("Re-checked just now.");
    } catch (err) {
      setCheckMsg(err.message);
    } finally {
      setChecking(false);
    }
  };

  const visible = problems.filter(c => !dismissed.has(`${c.platform}/${c.account}`));
  if (!visible.length) return null;

  return (
    // right: 52 keeps the cards clear of the Status panel's handle on the right edge.
    <div style={{ position: "fixed", top: 84, right: 52, width: 360, maxWidth: "calc(100vw - 72px)", zIndex: 300, display: "flex", flexDirection: "column", gap: 10, fontFamily: FONT }}>
      {visible.map(c => {
        const { platform, title, fix } = describe(c);
        const logo = platformByName[platform];
        const affected = c.affected || [];
        const stores = affected.reduce((n, a) => n + a.stores, 0);
        const brands = [...new Set(affected.map(a => a.sub_brand))];
        const key = `${c.platform}/${c.account}`;
        return (
          <div key={key} role="alert" style={{ background: "#fff", border: "1.5px solid #f5c2c7", borderLeft: `5px solid ${C.danger}`, borderRadius: 10, padding: "12px 14px", boxShadow: "0 8px 24px rgba(19,38,100,0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {logo && <PlatformLogo platform={logo} size={18} />}
              <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: "#b02a37" }}>{title}</span>
              <button onClick={() => setDismissed(d => new Set(d).add(key))} title="Dismiss" style={{ background: "none", border: "none", fontSize: 18, lineHeight: 1, color: C.muted, cursor: "pointer" }}>×</button>
            </div>
            {stores > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: C.text }}>
                Affects <b>{stores} stores</b> across {brands.length} brand{brands.length === 1 ? "" : "s"}: {brands.slice(0, 6).join(", ")}{brands.length > 6 ? ` +${brands.length - 6} more` : ""}
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 12, color: C.text }}>{fix}</div>
            {c.last_error && <div style={{ marginTop: 6, fontSize: 11, color: C.muted, wordBreak: "break-word" }}>{c.last_error}</div>}
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 11, color: C.muted }}>
                {c.checked_at ? `Checked ${new Date(c.checked_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                {checkMsg && ` · ${checkMsg}`}
              </span>
              <button disabled={checking} onClick={recheck} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#0a1945", color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: FONT, cursor: checking ? "default" : "pointer", opacity: checking ? 0.6 : 1 }}>
                {checking ? "Checking…" : "Re-check"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
