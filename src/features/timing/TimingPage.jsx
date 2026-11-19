import { useEffect, useMemo, useState } from "react";
import { C, FONT } from "../../theme";
import { API_BASE, getAuthHeaders, handleApiError } from "../../api";
import MultiSearchableSelect from "../toggle/MultiSearchableSelect";
import useIsMobile from "../../useIsMobile";
import TimingSidebar from "./TimingSidebar";
import PlatformLogo from "./PlatformLogo";
import { BRANDS, PLATFORMS, PLATFORM_NAMES, platformByName, DAYS, storeTitle } from "./platforms";

// Option text for the Store dropdown — includes the RIDs so typing a Swiggy or
// Zomato RID in the dropdown's search finds the store.
function storeOption(s) {
  const rids = PLATFORMS.filter(p => s[p.rid]).map(p => `${p.name} ${s[p.rid]}`);
  return rids.length ? `${storeTitle(s)} (${rids.join(", ")})` : storeTitle(s);
}

// Empty selection = no restriction on that filter.
function inBrands(s, brands) {
  return !brands.length || brands.includes(s.brand_name);
}
function onPlatforms(s, platforms) {
  return !platforms.length || PLATFORMS.some(p => platforms.includes(p.name) && s[p.rid]);
}

// The platform a store row starts on: the first filtered platform it has a RID for.
function defaultPlatform(s, appliedPlatforms) {
  const order = appliedPlatforms.length ? PLATFORMS.filter(p => appliedPlatforms.includes(p.name)) : PLATFORMS;
  return (order.find(p => s[p.rid]) || PLATFORMS.find(p => s[p.rid]))?.name || null;
}


// Whether our login can reach this store's RID on a platform, plus a hover explanation.
function ridStatus(platform, store) {
  const rid = store[platform.rid];
  const connected = platform.connected ? store[platform.connected] : false;
  const state = !rid ? "none" : connected ? "ok" : "off";
  const detail = platform.name === "Swiggy" && store.s_outlet_name ? `${store.s_outlet_name} (account ${store.s_account})`
    : platform.name === "Zomato" ? store.z_outlet_name : null;
  const title = state === "ok" ? `${platform.name} ${rid} — connected${detail ? ` (${detail})` : ""}`
    : state === "off" ? `${platform.name} ${rid} — not visible to our login, not connected`
    : `No ${platform.name} RID`;
  return { rid, state, title };
}

// Monday-first weekday name for today, re-checked every minute so a page left open
// overnight rolls over to the new day on its own.
function todayName() {
  return DAYS[(new Date().getDay() + 6) % 7];
}
function useToday() {
  const [today, setToday] = useState(todayName);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayName()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return today;
}

// status: idle → saving → saved | failed (error holds the platform's reason)
const EMPTY_SLOT = { start: "", end: "", status: "idle", error: "" };

// Bordered dropdown trigger used by the per-store Platform and Day boxes.
function BoxTrigger({ isOpen, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, padding: "6px 10px", minHeight: 32, boxSizing: "border-box", border: `1.5px solid ${isOpen ? C.primary : C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700, color: C.primary }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
      <span style={{ fontSize: 10, color: C.muted }}>▼</span>
    </div>
  );
}

function SlotInput({ label, slot, blockedReason, onChange, onSave }) {
  const reason = blockedReason || (!(slot.start && slot.end) ? "Enter both times" : slot.start === slot.end ? "Opening and closing can't match" : "");
  const busy = slot.status === "saving";
  const clickable = !reason && !busy && slot.status !== "saved";
  const look = {
    saving: { bg: "#64748b", text: "Saving…" },
    saved: { bg: C.ok, text: "Saved" },
    failed: { bg: C.danger, text: "Retry" },
  }[slot.status] || { bg: reason ? "#cbd5e1" : "#0a1945", text: "Save" };
  // Editing a time after a save/failure makes it a fresh, unsaved change again.
  const edit = patch => onChange({ ...patch, status: "idle", error: "" });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, width: 18 }}>{label}</span>
      <input type="time" value={slot.start} disabled={busy} onChange={e => edit({ start: e.target.value })} style={timeInputStyle} aria-label={`${label} opens at`} />
      <span style={{ fontSize: 12, color: C.muted }}>–</span>
      <input type="time" value={slot.end} disabled={busy} onChange={e => edit({ end: e.target.value })} style={timeInputStyle} aria-label={`${label} closes at`} />
      <button
        type="button"
        disabled={!clickable}
        onClick={onSave}
        title={slot.status === "failed" ? `Failed: ${slot.error}` : reason}
        style={{
          padding: "6px 12px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: FONT,
          background: look.bg, color: "#fff", cursor: clickable ? "pointer" : "default", minWidth: 62,
        }}
      >
        {look.text}
      </button>
    </div>
  );
}

// One platform's line after the platform box: the day box and the S1 / S2 slots.
function PlatformLine({ line, today, paused, onChange, onSave }) {
  const days = line.days ?? [today];
  const dayLabel = days.length === 0 ? "None" : days.length === DAYS.length ? "All days" : days.length === 1 ? days[0] : `${days.length} days`;
  // Changing the days means a saved slot no longer matches what was sent.
  const reset = s => (s.status === "saving" ? s : { ...s, status: "idle", error: "" });
  const setDays = next => onChange({ days: next, s1: reset(line.s1), s2: reset(line.s2) });
  const blockedReason = paused ? "Store is paused — resume it from the Status panel" : !days.length ? "Pick at least one day" : "";

  return (
    <>
      <MultiSearchableSelect
        options={DAYS}
        selectedValues={days}
        onChange={setDays}
        placeholder="Day"
        width={120}
        customTrigger={(_, isOpen) => <BoxTrigger isOpen={isOpen}>{dayLabel}</BoxTrigger>}
      />
      {/* Side by side when there's room, S2 tucks under S1 when there isn't */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
        <SlotInput label="S1" slot={line.s1} blockedReason={blockedReason} onChange={patch => onChange({ s1: { ...line.s1, ...patch } })} onSave={() => onSave("s1", days)} />
        <SlotInput label="S2" slot={line.s2} blockedReason={blockedReason} onChange={patch => onChange({ s2: { ...line.s2, ...patch } })} onSave={() => onSave("s2", days)} />
      </div>
    </>
  );
}

function StoreRow({ store, edit, onEdit, onSave, today, first }) {
  const isMobile = useIsMobile();
  const available = PLATFORMS.filter(p => store[p.rid]).map(p => p.name);
  const selected = PLATFORMS.filter(p => edit.platforms.includes(p.name));
  const lineFor = name => ({ days: null, s1: EMPTY_SLOT, s2: EMPTY_SLOT, ...edit.lines[name] });
  const setLine = (name, patch) => onEdit({ lines: { ...edit.lines, [name]: { ...lineFor(name), ...patch } } });

  // One box per line: shows that line's platform logo + RID, and opens the store's
  // platform picker (every line's box edits the same selection).
  const platformBox = p => (
    <MultiSearchableSelect
      options={available}
      selectedValues={edit.platforms}
      onChange={platforms => onEdit({ platforms })}
      placeholder="Platform"
      width={150}
      renderOption={name => (
        <span title={`${name} ${store[platformByName[name].rid]}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PlatformLogo platform={platformByName[name]} size={18} />{name}
        </span>
      )}
      customTrigger={(_, isOpen) => {
        if (!p) return <BoxTrigger isOpen={isOpen}>None</BoxTrigger>;
        const { rid, state, title } = ridStatus(p, store);
        return (
          <div title={title}>
            <BoxTrigger isOpen={isOpen}>
              <PlatformLogo platform={p} size={16} />
              {rid}
              <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: state === "ok" ? C.ok : state === "off" ? C.danger : "#c3c8d4" }} />
            </BoxTrigger>
          </div>
        );
      }}
    />
  );

  // Fixed columns so every platform line (and every store) lines up: name | platform | day | slots.
  const lineStyle = isMobile
    ? { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }
    : { display: "grid", gridTemplateColumns: "minmax(150px, 260px) 150px 120px minmax(290px, 1fr)", alignItems: "center", gap: 12 };
  const nameCol = { minWidth: 0, fontSize: 13, fontWeight: 700, color: C.primary, flex: isMobile ? "1 1 100%" : undefined };

  // Always at least one line, keyed by position, so line 1's platform box stays
  // mounted (and its dropdown open) while platforms are ticked and unticked.
  const lines = selected.length ? selected : [null];

  return (
    <div style={{ padding: "10px 14px", borderTop: first ? "none" : `1px solid ${C.borderSoft}` }}>
      {lines.map((p, i) => (
        // 2+ platforms: each gets its own full line underneath, with its own day box and slots.
        <div key={i} style={{ ...lineStyle, marginTop: i ? 8 : 0 }}>
          <div style={nameCol}>
            {i === 0 ? storeTitle(store) : ""}
            {i === 0 && store.paused && (
              <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800, background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>PAUSED</span>
            )}
          </div>
          {platformBox(p)}
          {p ? (
            <PlatformLine
              line={lineFor(p.name)}
              today={today}
              paused={store.paused}
              onChange={patch => setLine(p.name, patch)}
              onSave={(slotKey, days) => onSave(p.name, slotKey, days)}
            />
          ) : (
            <span style={{ fontSize: 12, color: C.muted, gridColumn: "3 / -1" }}>{available.length ? "Pick a platform" : "No platform RIDs for this store"}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TimingPage() {
  const isMobile = useIsMobile();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Draft filters (what's ticked in the dropdowns) vs applied filters (what the list shows).
  const [brands, setBrands] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [storePicks, setStorePicks] = useState([]);
  const [applied, setApplied] = useState(null);

  // Per-store edits in the list, keyed by store id:
  // { platforms: [names], lines: { [platform]: { days, s1: {start, end, status, error}, s2 } } }
  const [edits, setEdits] = useState({});

  // Bumped after the Status panel adds/deletes/pauses a store, or a save lands, so the
  // list and the panel's audit refetch.
  const [storesVersion, setStoresVersion] = useState(0);
  const [changesVersion, setChangesVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/timing/stores`, { headers: getAuthHeaders() });
        if (handleApiError(res)) return;
        const body = await res.json();
        if (!body.success) throw new Error(body.error || "Failed to load stores");
        if (!cancelled) setStores(body.stores);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storesVersion]);

  // Store dropdown only offers stores under the ticked brands + platforms.
  const storeOptions = useMemo(
    () => [...new Set(stores.filter(s => inBrands(s, brands) && onPlatforms(s, platforms)).map(storeOption))],
    [stores, brands, platforms]
  );

  // Ticked stores that fall outside a narrowed brand/platform selection don't count.
  const validStorePicks = useMemo(
    () => storePicks.filter(p => storeOptions.includes(p)),
    [storePicks, storeOptions]
  );

  const results = useMemo(() => {
    if (!applied) return [];
    return stores.filter(s =>
      inBrands(s, applied.brands) &&
      onPlatforms(s, applied.platforms) &&
      (!applied.storePicks.length || applied.storePicks.includes(storeOption(s)))
    );
  }, [stores, applied]);

  const today = useToday();
  const baseEdit = (s, existing) => {
    const first = defaultPlatform(s, applied?.platforms || []);
    return { platforms: first ? [first] : [], lines: {}, ...existing };
  };
  const editFor = s => baseEdit(s, edits[s.id]);
  const updateEdit = (s, patch) => setEdits(prev => ({ ...prev, [s.id]: { ...baseEdit(s, prev[s.id]), ...patch } }));

  // Functional update of one slot — a save resolves after other edits may have landed.
  const patchSlot = (s, platform, slotKey, patch) => setEdits(prev => {
    const e = baseEdit(s, prev[s.id]);
    const line = { days: null, s1: EMPTY_SLOT, s2: EMPTY_SLOT, ...e.lines[platform] };
    return { ...prev, [s.id]: { ...e, lines: { ...e.lines, [platform]: { ...line, [slotKey]: { ...line[slotKey], ...patch } } } } };
  });

  // S1/S2 Save → the platform, via the server (which records it in the audit log).
  const saveSlot = async (s, platform, slotKey, days) => {
    const slot = { ...EMPTY_SLOT, ...edits[s.id]?.lines?.[platform]?.[slotKey] };
    patchSlot(s, platform, slotKey, { status: "saving", error: "" });
    try {
      const res = await fetch(`${API_BASE}/api/timing/changes`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ storeId: s.id, platform, slot: slotKey.toUpperCase(), days, start: slot.start, end: slot.end }),
      });
      if (handleApiError(res)) return;
      const body = await res.json();
      patchSlot(s, platform, slotKey, body.success ? { status: "saved" } : { status: "failed", error: body.error || "Failed" });
    } catch (err) {
      patchSlot(s, platform, slotKey, { status: "failed", error: err.message });
    }
    setChangesVersion(v => v + 1);
  };

  const handleApply = () => {
    setApplied({ brands, platforms, storePicks: validStorePicks });
    setEdits({});
  };
  const handleClear = () => {
    setBrands([]);
    setPlatforms([]);
    setStorePicks([]);
    setApplied(null);
    setEdits({});
  };

  const platformTriggerValue = platforms.length === 0 ? "None" : (
    <span style={{ display: "flex", gap: 4 }}>
      {PLATFORMS.filter(p => platforms.includes(p.name)).map(p => <PlatformLogo key={p.name} platform={p} size={20} />)}
    </span>
  );

  return (
    <div style={{ minHeight: "100%", background: "#fff", fontFamily: FONT, color: C.text }}>
      {/* Filter Bar — same look as the Toggle tab's */}
      <div style={{
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        flexDirection: isMobile ? "column" : "row",
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: isMobile ? "10px 12px" : "12px 20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
        gap: isMobile ? 8 : 16,
      }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minWidth: 0, gap: isMobile ? 6 : 0 }}>
          <MultiSearchableSelect options={BRANDS} selectedValues={brands} onChange={setBrands} placeholder="Brand"
            customTrigger={(label) => <FilterItem icon={<IconBrand />} label="Brand" value={label === "Brand" ? "None" : label} />} width="100%" />
          {!isMobile && <Divider />}
          <MultiSearchableSelect options={PLATFORM_NAMES} selectedValues={platforms} onChange={setPlatforms} placeholder="Platform"
            renderOption={name => (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PlatformLogo platform={platformByName[name]} size={20} />{name}
              </span>
            )}
            customTrigger={() => <FilterItem icon={<IconPlatform />} label="Platform" value={platformTriggerValue} />} width="100%" />
          {!isMobile && <Divider />}
          <MultiSearchableSelect options={storeOptions} selectedValues={validStorePicks} onChange={setStorePicks} placeholder="Store"
            customTrigger={(label) => <FilterItem icon={<IconStore />} label="Store" value={label === "Store" ? "None" : label} />} width="100%" />
        </div>

        {!isMobile && <Divider />}
        <div style={{ display: "flex", gap: isMobile ? 8 : 12 }}>
          <button onClick={handleClear} style={buttonStyle}>Clear</button>
          <button onClick={handleApply} disabled={loading} style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}>Apply</button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {error ? (
          <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>
        ) : !applied ? null : results.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13 }}>No stores match these filters.</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{results.length} stores</div>
            {/* No overflow:hidden here — it would clip each row's Days dropdown */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10 }}>
              {results.map((s, i) => (
                <StoreRow
                  key={s.id}
                  store={s}
                  first={i === 0}
                  today={today}
                  edit={editFor(s)}
                  onEdit={patch => updateEdit(s, patch)}
                  onSave={(platform, slotKey, days) => saveSlot(s, platform, slotKey, days)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <TimingSidebar
        stores={stores}
        brands={BRANDS}
        changesVersion={changesVersion}
        onStoresChanged={() => setStoresVersion(v => v + 1)}
        onChangesChanged={() => setChangesVersion(v => v + 1)}
      />
    </div>
  );
}

const buttonStyle = { padding: "10px 24px", background: "#0a1945", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" };

const timeInputStyle = { padding: "5px 6px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.primary, fontFamily: FONT, outline: "none" };

function FilterItem({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, padding: "0 16px", cursor: "pointer", minWidth: 0 }}>
      <div style={{ color: "#1e293b" }}>{icon}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginBottom: 2 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 40, background: "#e2e8f0", flexShrink: 0 }} />;
}

function IconBrand() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>;
}
function IconPlatform() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
}
function IconStore() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-5h16l1 5"></path><path d="M4 9v11h16V9"></path><path d="M9 20v-6h6v6"></path></svg>;
}
