import { useEffect, useMemo, useState } from "react";
import { C, FONT } from "../../theme";
import { API_BASE, getAuthHeaders, handleApiError } from "../../api";
import PlatformLogo from "./PlatformLogo";
import { PLATFORMS, platformByName, DAYS, storeTitle } from "./platforms";

// Slide-out Status panel for the Timing tab — same handle + panel as the Toggle tab's.
const TABS = ["Audit", "Failed", "Stores"];
const panelWidth = 460;

// "23:00" → "11:00 PM"
function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const fmtSlot = s => (s ? `${fmt12(s.start)} – ${fmt12(s.end)}` : "none");

function fmtDays(days) {
  if (days.length === DAYS.length) return "All days";
  return days.map(d => d.slice(0, 3)).join(", ");
}

function fmtWhen(ts) {
  return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers: getAuthHeaders(), ...options });
  if (handleApiError(res)) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const STATUS_STYLE = {
  success: { label: "Done", bg: "rgba(40,167,69,0.1)", color: "#1e7e34" },
  failed: { label: "Failed", bg: "rgba(220,53,69,0.08)", color: "#b02a37" },
  retried: { label: "Failed → retried", bg: "#f4f6fa", color: C.muted },
  processing: { label: "Sending…", bg: "#f4f6fa", color: C.muted },
};

function ChangeItem({ change, onRetry, retrying }) {
  const platform = platformByName[change.platform];
  const st = STATUS_STYLE[change.status] || STATUS_STYLE.processing;
  const slotIndex = change.slot === "S2" ? 1 : 0;
  // What the slot was before, from the first changed day (days usually share hours).
  const first = Array.isArray(change.changes) ? change.changes[0] : null;
  const before = first?.before?.[slotIndex];

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {platform && <PlatformLogo platform={platform} size={16} />}
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.primary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={change.store_name}>
          {change.store_name}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>{st.label}</span>
      </div>
      <div style={{ fontSize: 12, color: C.text }}>
        <b>{change.slot}</b> · {fmtDays(change.days)} · {change.platform} {change.rid}
      </div>
      <div style={{ fontSize: 12, color: C.text }}>
        {change.status === "success" && before !== undefined ? (
          <>{fmtSlot(before)} <span style={{ color: C.muted }}>→</span> <b>{fmtSlot({ start: change.new_start, end: change.new_end })}</b></>
        ) : (
          <>Set to <b>{fmtSlot({ start: change.new_start, end: change.new_end })}</b></>
        )}
      </div>
      {change.error && change.status !== "success" && (
        <div style={{ fontSize: 11.5, color: "#b02a37", wordBreak: "break-word" }}>{change.error}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{change.user_email || "unknown"} · {fmtWhen(change.created_at)}</span>
        {onRetry && (
          <button disabled={retrying} onClick={onRetry} style={smallButton("#0a1945", "#fff", retrying)}>{retrying ? "Retrying…" : "Retry"}</button>
        )}
      </div>
    </div>
  );
}

const REPORT_COLOR = { connected: "#1e7e34", not_found: "#b02a37", failed: "#b02a37", saved: "#b45309" };

function AddStoreForm({ brands, onAdded }) {
  const empty = { brand_name: brands[brands.length - 1], urbanpiper_store: "", s_res_id: "", z_res_id: "", o_res_id: "", f_res_id: "" };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text, report? }
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = await api("/api/timing/stores", { method: "POST", body: JSON.stringify(form) });
      if (!body) return;
      setMsg({ ok: true, text: `Added ${storeTitle(body.store)}`, report: body.report });
      setForm(empty);
      onAdded();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const field = (label, key, placeholder) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: C.muted }}>
      {label}
      <input value={form[key]} onChange={set(key)} placeholder={placeholder} style={inputStyle} />
    </label>
  );

  return (
    <form onSubmit={submit} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.primary }}>Add store</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: C.muted }}>
          Brand
          <select value={form.brand_name} onChange={set("brand_name")} style={inputStyle}>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        {field("Store name", "urbanpiper_store", "e.g. BLR AUD EatFit")}
        {field("Swiggy RID", "s_res_id", "digits")}
        {field("Zomato RID", "z_res_id", "digits")}
        {field("Ownly RID", "o_res_id", "digits")}
        {field("Flipkart RID", "f_res_id", "digits")}
      </div>
      {msg && (
        <div style={{ fontSize: 11.5, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ color: msg.ok ? "#1e7e34" : "#b02a37", fontWeight: 700 }}>{msg.text}</span>
          {msg.report?.map(r => (
            <span key={r.platform} style={{ color: REPORT_COLOR[r.status] }}>• {r.message}</span>
          ))}
        </div>
      )}
      <button type="submit" disabled={busy} style={{ ...smallButton("#0a1945", "#fff", busy), alignSelf: "flex-end", padding: "7px 16px" }}>
        {busy ? "Adding…" : "Add store"}
      </button>
    </form>
  );
}

function StoresTab({ stores, brands, onStoresChanged }) {
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null); // { ok, text } — result of the last Pause/Resume/Delete

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return stores;
    return stores.filter(s => `${storeTitle(s)} ${s.sub_brand_name || ""} ${PLATFORMS.map(p => s[p.rid] || "").join(" ")}`.toLowerCase().includes(needle));
  }, [stores, q]);

  const DONE = {
    pause: name => `Paused ${name} — its timings can't be changed until you resume it.`,
    resume: name => `Resumed ${name} — timing changes are allowed again.`,
    delete: name => `Deleted ${name} from the Timing tab (nothing changed on Swiggy or Zomato).`,
  };

  const act = async (s, action) => {
    const name = storeTitle(s);
    if (action === "delete" && !confirm(`Delete ${name} from the Timing tab? This only removes it here, not from Swiggy or Zomato.`)) return;
    setBusyId(s.id);
    setNotice(null);
    try {
      await api(`/api/timing/stores/${s.id}${action === "delete" ? "" : `/${action}`}`, { method: action === "delete" ? "DELETE" : "POST" });
      setNotice({ ok: true, text: DONE[action](name) });
      onStoresChanged();
    } catch (e) {
      setNotice({ ok: false, text: `Couldn't ${action} ${name}: ${e.message}` });
    } finally {
      setBusyId(null);
    }
  };

  const paused = stores.filter(s => s.paused).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <AddStoreForm brands={brands} onAdded={onStoresChanged} />
      <div style={{ fontSize: 11, color: C.muted }}>{stores.length} stores{paused ? ` · ${paused} paused` : ""}</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search store, sub-brand or RID…" style={inputStyle} />
      {notice && (
        <div style={{ fontSize: 11.5, padding: "7px 10px", borderRadius: 8, color: notice.ok ? "#1e7e34" : "#b02a37", background: notice.ok ? "rgba(40,167,69,0.08)" : "rgba(220,53,69,0.06)" }}>
          {notice.text}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {matches.slice(0, 100).map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${C.borderSoft}`, borderRadius: 8, background: s.paused ? "#fffbeb" : "#fff" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={storeTitle(s)}>{storeTitle(s)}</div>
              <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.muted, marginTop: 2 }}>
                {PLATFORMS.filter(p => s[p.rid]).map(p => (
                  <span key={p.name} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <PlatformLogo platform={p} size={12} />{s[p.rid]}
                  </span>
                ))}
                {s.paused && <b style={{ color: "#b45309" }}>PAUSED</b>}
              </div>
            </div>
            <button disabled={busyId === s.id} onClick={() => act(s, s.paused ? "resume" : "pause")} style={smallButton(s.paused ? "#1e7e34" : "#b45309", "#fff", busyId === s.id)}>
              {s.paused ? "Resume" : "Pause"}
            </button>
            <button disabled={busyId === s.id} onClick={() => act(s, "delete")} style={smallButton("#fff", "#b02a37", busyId === s.id, "#f5c2c7")}>
              Delete
            </button>
          </div>
        ))}
        {matches.length > 100 && <div style={{ fontSize: 11, color: C.muted }}>Showing first 100 of {matches.length} — search to narrow down.</div>}
        {matches.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>No stores match “{q}”.</div>}
      </div>
    </div>
  );
}

export default function TimingSidebar({ stores, brands, changesVersion, onStoresChanged, onChangesChanged }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState("Audit");
  const [changes, setChanges] = useState([]);
  const [loadErr, setLoadErr] = useState("");
  const [retryingId, setRetryingId] = useState(null);

  // Audit + Failed both read timing_changes; refetch whenever the panel opens or a save lands.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api("/api/timing/changes?limit=300")
      .then(body => { if (body && !cancelled) { setChanges(body.changes); setLoadErr(""); } })
      .catch(err => { if (!cancelled) setLoadErr(err.message); });
    return () => { cancelled = true; };
  }, [isOpen, changesVersion]);

  const failed = changes.filter(c => c.status === "failed");

  const retry = async change => {
    setRetryingId(change.id);
    try {
      await api(`/api/timing/changes/${change.id}/retry`, { method: "POST" });
    } catch {
      // The retry is recorded as its own row either way; the refetch below shows the outcome.
    } finally {
      setRetryingId(null);
      onChangesChanged();
    }
  };

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
          {failed.length ? `STATUS ▲ (${failed.length} FAILED)` : "STATUS ▲"}
        </button>
      )}

      <div
        style={{
          position: "fixed", top: 0, right: isOpen ? 0 : -(panelWidth + 20), width: panelWidth, maxWidth: "92vw", height: "100vh",
          backgroundColor: "#ffffff", borderLeft: `2px solid ${C.border}`, boxShadow: isOpen ? "-8px 0 32px rgba(19,38,100,0.12)" : "none",
          transition: "right 0.3s cubic-bezier(0.4, 0, 0.2, 1)", zIndex: 450, display: "flex", flexDirection: "column", fontFamily: FONT,
        }}
      >
        <div style={{ padding: "18px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>Timing Status</div>
          <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 4, padding: "12px 20px", borderBottom: `1px solid ${C.border}` }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "6px 0", borderRadius: 8, border: `1.5px solid ${C.primary}`,
                backgroundColor: tab === t ? C.primary : "transparent", color: tab === t ? "#fff" : C.primary,
                fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
              }}
            >
              {t === "Failed" && failed.length ? `Failed (${failed.length})` : t}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {loadErr && tab !== "Stores" && <div style={{ fontSize: 12, color: "#b02a37" }}>{loadErr}</div>}

          {tab === "Audit" && (changes.length
            ? changes.map(c => <ChangeItem key={c.id} change={c} />)
            : <div style={{ fontSize: 12, color: C.muted }}>No timing changes yet.</div>)}

          {tab === "Failed" && (failed.length
            ? failed.map(c => <ChangeItem key={c.id} change={c} onRetry={() => retry(c)} retrying={retryingId === c.id} />)
            : <div style={{ fontSize: 12, color: C.muted }}>No failed changes.</div>)}

          {tab === "Stores" && <StoresTab stores={stores} brands={brands} onStoresChanged={onStoresChanged} />}
        </div>
      </div>
    </>
  );
}

const inputStyle = { padding: "7px 9px", border: `1.5px solid ${C.border}`, borderRadius: 7, fontSize: 12, color: C.primary, fontFamily: FONT, outline: "none", width: "100%", boxSizing: "border-box", background: "#fff" };

function smallButton(bg, color, disabled, border) {
  return {
    padding: "5px 10px", borderRadius: 6, border: `1px solid ${border || bg}`, background: bg, color,
    fontSize: 11, fontWeight: 700, fontFamily: FONT, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap",
  };
}
