import React, { useState, useEffect, useRef, useMemo, startTransition } from "react";
import { C, cardStyle } from "../../theme";
import { API_BASE, getAuthHeaders } from "../../api";

// --- Helpers ---
const inputStyle = {
  padding: "10px 14px",
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  outline: "none",
  fontSize: 14,
  background: "#fff"
};

const getBgColor = (val, t1, t2, t3) => {
  if (!val) return "";
  if (val <= t1) return "#28a745"; // Green
  if (val <= t2) return "#ffc107"; // Yellow
  if (val <= t3) return "#fd7e14"; // Orange
  return "#dc3545"; // Red
};

const getTextColor = (val, t1, t2, t3) => {
  if (!val) return C.text;
  if (val <= t1 || val > t3) return "#ffffff"; // White text on green and red
  return C.text; // Dark text on yellow and orange
};

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
};

// Metabase card columns the page reads — by name, so a column added or moved
// in Metabase can't shift the numbers into the wrong place.
const COLS = {
  brand: "main_brand", subBrand: "sub_brand_name", city: "standardized_city", kitchen: "kitchen", date: "order_date",
  orders: "Completed_orders", cancelled: "cancelled_orders", kpt: "KPT", p80: "KPT_80_percentile",
  wait: "waitTime", o2d: "o2D", p80O2d: "O2D_80_percentile",
};

// The Metabase card's value columns shown on this page (every one except O2A), in
// the card's own order. `color` = the legend's thresholds, for the ones that have one.
const METRICS = [
  { key: "orders", label: "Completed Orders", fmt: (v) => v.toLocaleString() },
  { key: "cancelled", label: "Cancelled Orders", fmt: (v) => v.toLocaleString() },
  { key: "kpt", label: "KPT (min)", color: [12, 18, 25] },
  { key: "p80", label: "KPT P80 (min)", color: [18, 25, 35] },
  { key: "wait", label: "Wait Time (min)" },
  { key: "o2d", label: "O2D (min)", color: [20, 28, 35] },
  { key: "p80O2d", label: "O2D P80 (min)" },
  { key: "cancelPct", label: "Cancellation %", fmt: (v) => `${v.toFixed(2)}%` },
];

// Rows are one kitchen-day each (positions: 5 orders, 6 cancelled, 7 KPT, 8 KPT P80,
// 9 wait, 11 O2D, 12 O2D P80). Counts are added up; times are averaged weighted by
// completed orders; cancellation % is cancelled / (completed + cancelled), the same
// formula the card uses.
const emptyTotals = () => ({ orders: 0, cancelled: 0, sKpt: 0, sP80: 0, sWait: 0, sO2d: 0, sP80O2d: 0 });
const addToTotals = (t, r) => {
  const orders = r[5] || 0;
  t.orders += orders;
  t.cancelled += r[6] || 0;
  t.sKpt += (r[7] || 0) * orders;
  t.sP80 += (r[8] || 0) * orders;
  t.sWait += (r[9] || 0) * orders;
  t.sO2d += (r[11] || 0) * orders;
  t.sP80O2d += (r[12] || 0) * orders;
};
const finishTotals = (t) => {
  const avg = (sum) => (t.orders ? sum / t.orders : 0);
  const all = t.orders + t.cancelled;
  return {
    orders: t.orders, cancelled: t.cancelled,
    kpt: avg(t.sKpt), p80: avg(t.sP80), wait: avg(t.sWait), o2d: avg(t.sO2d), p80O2d: avg(t.sP80O2d),
    cancelPct: all ? (t.cancelled / all) * 100 : 0,
  };
};
// Names for the row positions the table can be grouped by (0 brand, 1 sub-brand, 2 city, 3 kitchen, 14 channel).
const NAME_OF = { 0: "Brand", 1: "Sub Brand", 2: "City", 3: "Kitchen", 14: "Channel" };
const UNKNOWN = { 0: "Unknown Brand", 1: "None", 2: "Unknown City", 3: "Unknown Kitchen", 14: "Unknown Channel" };

// Each filter box in the top row takes an equal share of the row's width.
const FILTER_BOX = { flex: "1 1 0", minWidth: 0 };

const formatMetric = (m, v) => (m.fmt ? m.fmt(v || 0) : (v || 0).toFixed(1));

// Brand / Sub Brand / Channel are the Metabase card's own filters: their options
// come from the card, so they always match it. If Brand or Sub Brand has no option
// list set in Metabase, its options come from the brands / sub-brands in the query's
// rows instead. These two also decide how rows are grouped (Channel just narrows the data).
const BRAND_SLUG = "Brand";
const SUB_BRAND_SLUG = "sub_brand";
const CHANNEL_SLUG = "Channel";
const CHANNEL_COL = "channel";
// Which column of the filter lists each Metabase card filter matches.
const FILTER_COL = { [BRAND_SLUG]: COLS.brand, [SUB_BRAND_SLUG]: COLS.subBrand, [CHANNEL_SLUG]: CHANNEL_COL };
// Metabase takes only one Brand / Sub Brand at a time, so to let several be picked
// the page fetches every brand for the dates and keeps the picked ones itself.
const FILTERED_ON_PAGE = new Set([BRAND_SLUG, SUB_BRAND_SLUG]);
const NONE = [];

const pluralLabel = (name) => (name.endsWith("y") ? `${name.slice(0, -1)}ies` : `${name}s`);

// --- Date to Week Helpers ---
const getWeekInfo = (dateStr) => {
  const d = new Date(dateStr);
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `W${weekNum}`;
};

const formatDayLabel = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const formatDateFriendly = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// --- Custom MultiSelect (single = pick one, like Metabase's text filters) ---
function MultiSelectDropdown({ label, options, selected, onChange, single = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef();
  
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));
  const displayOptions = filteredOptions.slice(0, 50);

  const toggleAll = () => {
    const allVisibleSelected = filteredOptions.length > 0 && filteredOptions.every(opt => selected.includes(opt));
    startTransition(() => {
      if (allVisibleSelected) {
        onChange(selected.filter(opt => !filteredOptions.includes(opt)));
      } else {
        onChange(Array.from(new Set([...selected, ...filteredOptions])));
      }
    });
  };

  const displayText = selected.length === 0 ? `All ${label}` : 
                      selected.length === 1 ? selected[0] : 
                      `${selected.length} ${label}`;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button onClick={() => setOpen(!open)} style={{...inputStyle, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer"}}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: selected.length > 0 ? 700 : 400, color: selected.length > 0 ? C.primary : C.text }}>
          {displayText}
        </span>
        <span style={{ fontSize: 10, color: C.muted }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, width: "max(240px, 100%)", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, zIndex: 50, maxHeight: 350, display: "flex", flexDirection: "column", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.borderSoft}` }}>
            <input 
              type="text" 
              placeholder={`Search ${label}...`} 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              style={{ width: "100%", padding: "6px 10px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ padding: "8px 12px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {displayOptions.map(opt => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", color: C.text }}>
                <input type="checkbox" checked={selected.includes(opt)} onChange={(e) => {
                  startTransition(() => {
                    if (single) onChange(e.target.checked ? [opt] : []);
                    else if (e.target.checked) onChange([...selected, opt]);
                    else onChange(selected.filter(x => x !== opt));
                  });
                }} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt}</span>
              </label>
            ))}
            {filteredOptions.length > 50 && (
              <div style={{ fontSize: 11, color: C.muted, textAlign: "center", paddingTop: 4 }}>
                Showing top 50 matches. Use search for more.
              </div>
            )}
            {filteredOptions.length === 0 && <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "12px 0" }}>No matches found</div>}
          </div>
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.borderSoft}`, background: "#f8fafc", position: "sticky", bottom: 0, borderRadius: "0 0 8px 8px" }}>
            <button onClick={single ? () => onChange([]) : toggleAll} style={{ fontSize: 13, padding: "8px 12px", cursor: "pointer", background: "#e2e8f0", color: "#334155", border: "none", borderRadius: 4, width: "100%", fontWeight: 600 }}>{single ? "Clear" : "Toggle All / None"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ ...cardStyle, padding: "clamp(10px, 1vw, 16px)", flex: "1 1 0", minWidth: 0, textAlign: "left", background: "#fff", border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: "clamp(9px, 0.7vw, 11px)", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "clamp(15px, 1.5vw, 24px)", fontWeight: 800, color: "#1e3a8a", marginTop: 8, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function CustomDatePicker({ value, min, max, onChange, hasError }) {
  const [val, setVal] = useState(value);
  
  useEffect(() => { setVal(value); }, [value]);

  const handleBlur = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      onChange({ target: { value: val } });
    } else {
      setVal(value);
    }
  };

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <input 
        type="text" 
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
        placeholder="YYYY-MM-DD"
        style={{...inputStyle, border: hasError ? "1px solid #ef4444" : inputStyle.border, paddingRight: 32, width: 110, letterSpacing: 0.5}} 
      />
      <input 
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          setVal(e.target.value);
          onChange(e);
        }}
        style={{
          position: "absolute",
          right: 0,
          opacity: 0,
          width: 32,
          height: "100%",
          cursor: "pointer"
        }}
      />
      <svg style={{ position: "absolute", right: 10, pointerEvents: "none", color: C.muted }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
    </div>
  );
}

function DateRangeButton({ startDate, endDate, onStartChange, onEndChange, hasError }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const d1 = new Date(startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  const d2 = new Date(endDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button 
        onClick={() => setOpen(!open)}
        style={{ ...inputStyle, border: hasError ? "1px solid #ef4444" : inputStyle.border, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
      >
        <span>📅</span> {d1} - {d2}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", display: "flex", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>START DATE</div>
            <CustomDatePicker value={startDate} onChange={(e) => onStartChange(e.target.value)} max={endDate} hasError={hasError} />
          </div>
          <div style={{ color: C.muted, fontWeight: 600, marginTop: 16 }}>to</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>END DATE</div>
            <CustomDatePicker value={endDate} onChange={(e) => onEndChange(e.target.value)} min={startDate} max={new Date().toISOString().slice(0,10)} hasError={hasError} />
          </div>
        </div>
      )}
    </div>
  );
}

function WeekSelector({ onSelect }) {
  const weeksByYear = useMemo(() => {
    const year = new Date().getFullYear();
    const result = {};
    const firstDay = new Date(year, 0, 1);
    let startDay = new Date(firstDay);
    const offset = (startDay.getDay() === 0 ? 6 : startDay.getDay() - 1);
    startDay.setDate(startDay.getDate() - offset);
    
    for (let i = 1; i <= 52; i++) {
      const monday = new Date(startDay);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      
      const sStr = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const eStr = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const min = monday.toISOString().slice(0, 10);
      const max = sunday.toISOString().slice(0, 10);
      
      const yr = monday.getFullYear();
      if (!result[yr]) result[yr] = [];
      result[yr].push({ val: `W${i}`, label: `W${i} (${sStr} - ${eStr})`, min, max });
      
      startDay.setDate(startDay.getDate() + 7);
    }
    return result;
  }, []);

  const years = Object.keys(weeksByYear).sort((a,b) => b.localeCompare(a));

  return (
    <select 
      onChange={(e) => {
        let selected = null;
        for (const yr of years) {
          selected = weeksByYear[yr].find(w => w.val === e.target.value);
          if (selected) break;
        }
        if (selected) onSelect(selected.min, selected.max);
        e.target.value = "";
      }}
      defaultValue=""
      style={{...inputStyle, padding: "8px 30px 8px 12px", background: "#f8fafc", cursor: "pointer", appearance: "none"}}
    >
      <option value="" disabled>Select Week...</option>
      {years.map(yr => (
        <optgroup key={yr} label={yr}>
          {weeksByYear[yr].map(w => <option key={`${yr}-${w.val}`} value={w.val}>{w.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// --- Main Page ---
const queryCache = new Map();

export default function OpsMatrixPage() {
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState([]);
  const [weekDefs, setWeekDefs] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [truncated, setTruncated] = useState(false);

  // The Metabase card's own filters: [{ slug, name, multi, values }]
  const [cardFilters, setCardFilters] = useState([]);
  const [filtersError, setFiltersError] = useState("");
  // Every unique brand / sub-brand / city / kitchen / channel combination the
  // Metabase card produces — what links the dropdowns. null until it has loaded.
  const [combos, setCombos] = useState(null); // [{ main_brand, sub_brand_name, ... }]
  
  // Draft States
  const [startDate, setStartDate] = useState(iso(8));
  const [endDate, setEndDate] = useState(iso(1));
  const [selections, setSelections] = useState({}); // card filter slug -> [values]
  const [cities, setCities] = useState([]);
  const [kitchens, setKitchens] = useState([]);

  // Applied States
  const [appliedStartDate, setAppliedStartDate] = useState(iso(8));
  const [appliedEndDate, setAppliedEndDate] = useState(iso(1));
  const [appliedSelections, setAppliedSelections] = useState({});
  const [appliedCities, setAppliedCities] = useState([]);
  const [appliedKitchens, setAppliedKitchens] = useState([]);

  const appliedBrands = appliedSelections[BRAND_SLUG] || NONE;
  const appliedSubBrands = appliedSelections[SUB_BRAND_SLUG] || NONE;

  const diffDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  const dateError = diffDays < 0 ? "Start date must be before end date." :
                    diffDays > 30 ? "Please choose a range of at most 1 month." : null;

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/ops-matrix/filters`, { headers: getAuthHeaders() });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(json?.error || `HTTP ${response.status}`);
        setCardFilters(json.filters || []);
      } catch (err) {
        setFiltersError(`Filters couldn't be loaded from Metabase (${err.message}).`);
      }
    })();

    // Building the lists can take ~40s when Metabase is cold; the server keeps
    // working on it, so keep asking until it's ready.
    (async () => {
      for (let attempt = 1; attempt <= 8; attempt++) {
        try {
          const response = await fetch(`${API_BASE}/api/ops-matrix/options`, { headers: getAuthHeaders() });
          const json = await response.json().catch(() => null);
          if (response.ok && json?.success) {
            const columns = json.columns || [];
            setCombos((json.combos || []).map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]]))));
            return;
          }
          if (response.status !== 504) return;
        } catch {
          // network blip — retry
        }
        await new Promise(r => setTimeout(r, 7000));
      }
    })();
  }, []);

  // The last 31 days' combinations plus everything in the dates being viewed, so
  // brands / sub-brands / cities / kitchens that only existed in an older range
  // still show up (and can be picked) when that range is loaded. Loaded rows
  // carry the channels they were fetched with (null = all, i.e. not known).
  const optionRows = useMemo(() => {
    const seen = new Set();
    const loaded = [];
    const appliedChannels = appliedSelections[CHANNEL_SLUG]?.length ? appliedSelections[CHANNEL_SLUG] : null;
    rawData.forEach(r => {
      const key = `${r[0]}\u241f${r[1]}\u241f${r[2]}\u241f${r[3]}`;
      if (seen.has(key)) return;
      seen.add(key);
      loaded.push({ [COLS.brand]: r[0], [COLS.subBrand]: r[1], [COLS.city]: r[2], [COLS.kitchen]: r[3], [CHANNEL_COL]: appliedChannels });
    });
    return combos ? combos.concat(loaded) : loaded;
  }, [combos, rawData, appliedSelections]);

  // Every filter narrows every other: each dropdown offers only the values that
  // appear together with everything picked in the *other* dropdowns.
  const dims = useMemo(() => {
    const list = cardFilters
      .filter(f => FILTER_COL[f.slug])
      .map(f => ({ key: f.slug, col: FILTER_COL[f.slug], selected: selections[f.slug] || NONE }));
    list.push({ key: "city", col: COLS.city, selected: cities });
    list.push({ key: "kitchen", col: COLS.kitchen, selected: kitchens });
    return list;
  }, [cardFilters, selections, cities, kitchens]);

  // A row whose value for a filter isn't known (e.g. no channel info, if the server
  // couldn't build the Channel-linked lists) neither rules itself out nor narrows that
  // filter's own list.
  const available = useMemo(() => {
    const matches = (val, selected) => (Array.isArray(val) ? val.some(v => selected.includes(v)) : val == null || selected.includes(val));
    const out = {};
    for (const d of dims) {
      const known = optionRows.some(r => r[d.col] != null);
      const others = dims.filter(o => o !== d && o.selected.length > 0);
      const set = new Set();
      optionRows.forEach(r => {
        const v = r[d.col];
        if (typeof v !== "string" || v === "") return;
        if (others.every(o => matches(r[o.col], o.selected))) set.add(v);
      });
      out[d.key] = { set, narrowed: others.length > 0 && known };
    }
    return out;
  }, [dims, optionRows]);

  // A filter with its own list in Metabase (Brand, Sub Brand, Channel) offers
  // exactly that list — nothing extra from the data. City / Kitchen (no Metabase
  // list) offer what's in the data. Once another filter is picked, only values
  // that go with it remain. Whatever is already picked always stays listed so it
  // can be un-picked.
  const optionsFor = (key, metabaseValues = []) => {
    const avail = available[key];
    if (!avail) return metabaseValues;
    const base = metabaseValues.length > 0 ? metabaseValues : Array.from(avail.set).sort();
    const narrowed = avail.narrowed ? base.filter(v => avail.set.has(v)) : base;
    const picked = (dims.find(d => d.key === key)?.selected || []).filter(v => !narrowed.includes(v));
    return picked.concat(narrowed);
  };

  // One Metabase run for one set of filters, mapped into the fixed row positions
  // the rest of this page reads. Cached per filter set.
  const fetchRows = async (filters) => {
    const cacheKey = JSON.stringify({ startDate: appliedStartDate, endDate: appliedEndDate, filters });
    if (queryCache.has(cacheKey)) return { rows: queryCache.get(cacheKey) };

    let json = null;
    let lastErr = "";

    // The first (cold) request for a range can take ~30s and may hit the
    // proxy's timeout — but the server keeps the query running, so a retry
    // picks up its result.
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = await fetch(`${API_BASE}/api/ops-matrix/data`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            ...getAuthHeaders()
          },
          body: JSON.stringify({ startDate: appliedStartDate, endDate: appliedEndDate, filters })
        });

        if (response.ok) {
          json = await response.json();
          break;
        } else if (response.status === 504 && attempt < 4) {
          console.warn(`[OpsMatrix] 504 on attempt ${attempt} — cold query warming, retrying...`);
          lastErr = "The data source timed out.";
          await new Promise(r => setTimeout(r, 7000));
        } else {
          try {
            const body = await response.json();
            lastErr = body?.error || `Request failed (HTTP ${response.status}).`;
          } catch {
            lastErr = `Request failed (HTTP ${response.status}).`;
          }
          break;
        }
      } catch (err) {
        lastErr = err?.message || "Network error.";
        if (attempt < 4) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    if (!json || !json.success || !json.rows) return { error: lastErr || "Could not load Ops Matrix data." };

    // Rebuild each row in the fixed positions the rest of this page reads,
    // looking every column up by its Metabase name.
    const at = {};
    for (const [key, name] of Object.entries(COLS)) at[key] = (json.cols || []).findIndex(c => c.name === name);
    const v = (r, i) => (i >= 0 ? r[i] : null);
    const rows = json.rows.map(r => [
      v(r, at.brand), v(r, at.subBrand), v(r, at.city), v(r, at.kitchen), v(r, at.date), v(r, at.orders),
      v(r, at.cancelled), v(r, at.kpt), v(r, at.p80), v(r, at.wait), null, v(r, at.o2d), v(r, at.p80O2d),
    ]);
    if (rows.length > 0) queryCache.set(cacheKey, rows);
    return { rows, truncated: !!json.truncated };
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError("");
    setTruncated(false);
    try {
      const filters = {};
      for (const [slug, vals] of Object.entries(appliedSelections)) {
        if (vals.length > 0 && !FILTERED_ON_PAGE.has(slug) && slug !== CHANNEL_SLUG) filters[slug] = vals;
      }

      // Metabase takes one Channel at a time, and its rows add all channels together,
      // so several picked channels mean one run per channel, combined here. Every
      // channel picked is the same as no Channel filter.
      const channels = appliedSelections[CHANNEL_SLUG] || NONE;
      const allChannels = cardFilters.find(f => f.slug === CHANNEL_SLUG)?.values || NONE;
      const runs = channels.length === 0 || (allChannels.length > 0 && allChannels.every(c => channels.includes(c)))
        ? [filters]
        : channels.map(c => ({ ...filters, [CHANNEL_SLUG]: [c] }));

      const results = await Promise.all(runs.map(fetchRows));
      const failed = results.find(r => r.error);
      if (failed) setLoadError(failed.error);
      else if (results.some(r => r.truncated)) setTruncated(true);
      // With one run per channel, tag every row with its channel (position 14) so
      // the table can split the numbers by channel.
      const rowsToProcess = failed ? [] : results.flatMap((r, i) => (runs.length > 1
        ? r.rows.map(row => { const tagged = [...row]; tagged[14] = runs[i][CHANNEL_SLUG][0]; return tagged; })
        : r.rows));

      if (rowsToProcess.length > 0) {
        const weekExtremes = {};
        rowsToProcess.forEach(r => {
          if (r[4]) {
            const wVal = getWeekInfo(r[4]);
            if (!weekExtremes[wVal]) weekExtremes[wVal] = { min: r[4], max: r[4] };
            if (r[4] < weekExtremes[wVal].min) weekExtremes[wVal].min = r[4];
            if (r[4] > weekExtremes[wVal].max) weekExtremes[wVal].max = r[4];
          }
        });

        const weekMap = {};
        Object.keys(weekExtremes).forEach(wVal => {
          const minStr = formatDateFriendly(weekExtremes[wVal].min);
          const maxStr = formatDateFriendly(weekExtremes[wVal].max);
          weekMap[wVal] = minStr === maxStr ? `${wVal} (${minStr})` : `${wVal} (${minStr} - ${maxStr})`;
        });

        const mappedRows = rowsToProcess.map(r => {
          const newRow = [...r];
          if (r[4]) {
            newRow[4] = getWeekInfo(r[4]);
            newRow[13] = r[4]; // the row's own date, for the day rows under each week
          }
          return newRow;
        });

        const weeks = Object.keys(weekMap)
          .sort((a, b) => a.localeCompare(b))
          .map(val => ({ val, label: weekMap[val] }));

        setRawData(mappedRows);
        setWeekDefs(weeks);
      } else {
        setRawData([]);
        setWeekDefs([]);
      }
    } catch {
      setRawData([]);
      setWeekDefs([]);
    } finally {
      setLoading(false);
    }
  };

  // Only the filters sent to Metabase need a new fetch; Brand / Sub Brand are applied below.
  const metabaseFilterKey = JSON.stringify(Object.entries(appliedSelections).filter(([slug]) => !FILTERED_ON_PAGE.has(slug)));
  useEffect(() => {
    fetchData();
  }, [appliedStartDate, appliedEndDate, metabaseFilterKey]);

  // Channel was already applied by Metabase.
  const filteredRows = useMemo(() => {
    return rawData.filter(r => {
      if (appliedBrands.length > 0 && (!r[0] || !appliedBrands.includes(r[0]))) return false;
      if (appliedSubBrands.length > 0 && (!r[1] || !appliedSubBrands.includes(r[1]))) return false;
      if (appliedCities.length > 0 && (!r[2] || !appliedCities.includes(r[2]))) return false;
      if (appliedKitchens.length > 0 && (!r[3] || !appliedKitchens.includes(r[3]))) return false;
      return true;
    });
  }, [rawData, appliedBrands, appliedSubBrands, appliedCities, appliedKitchens]);

  // Overall Stats
  const stats = useMemo(() => {
    const totals = emptyTotals();
    const kitchenSet = new Set();
    filteredRows.forEach(r => {
      kitchenSet.add(r[3]);
      addToTotals(totals, r);
    });
    return { totalKitchens: kitchenSet.size, ...finishTotals(totals) };
  }, [filteredRows]);

  // Rows carry their channel only when 2+ channels were picked (one Metabase run each).
  const splitByChannel = rawData.length > 0 && rawData[0][14] != null;

  // Rows follow the most detailed pick on each side: sub-brands (else brands), and
  // kitchens (else cities), then channel. Each level opens to the next one, and
  // the last one opens to its weeks, which open to their days.
  const brandCol = appliedSubBrands.length > 0 ? 1 : appliedBrands.length > 0 ? 0 : null;
  const placeCol = appliedKitchens.length > 0 ? 3 : appliedCities.length > 0 ? 2 : null;
  const levels = useMemo(() => [brandCol, placeCol, splitByChannel ? 14 : null].filter(c => c != null), [brandCol, placeCol, splitByChannel]);
  const isDefault = levels.length === 0;

  // A single picked channel has nothing to split, so it's just named in the header.
  const appliedChannels = appliedSelections[CHANNEL_SLUG] || NONE;
  const channelNote = !splitByChannel && appliedChannels.length === 1 ? ` · ${appliedChannels[0]}` : "";
  const headerLabel = (isDefault ? "Week" : levels.map(c => NAME_OF[c]).join(" / ")) + channelNote;

  // Group Data for Display
  const groupedData = useMemo(() => {
    const buildGroups = (rows, col) => {
      const groups = {};
      rows.forEach(r => {
        const key = col == null ? "Curefoods Overall Summary" : (r[col] || UNKNOWN[col]);
        if (!groups[key]) groups[key] = { name: key, totals: emptyTotals(), weekMap: {}, rows: [] };
        addToTotals(groups[key].totals, r);
        groups[key].rows.push(r);

        const weekStr = r[4];
        if (!groups[key].weekMap[weekStr]) groups[key].weekMap[weekStr] = { totals: emptyTotals(), dayMap: {} };
        const week = groups[key].weekMap[weekStr];
        addToTotals(week.totals, r);
        if (!week.dayMap[r[13]]) week.dayMap[r[13]] = emptyTotals();
        addToTotals(week.dayMap[r[13]], r);
      });

      return Object.values(groups).map(g => {
        const weeks = Object.keys(g.weekMap).map(w => {
          const def = weekDefs.find(x => x.val === w);
          const days = Object.keys(g.weekMap[w].dayMap).sort()
            .map(d => ({ date: d, label: formatDayLabel(d), ...finishTotals(g.weekMap[w].dayMap[d]) }));
          return { weekVal: w, weekLabel: def ? def.label : w, ...finishTotals(g.weekMap[w].totals), days };
        }).sort((a, b) => a.weekVal.localeCompare(b.weekVal));
        return { name: g.name, ...finishTotals(g.totals), weeks, rows: g.rows };
      }).sort((a, b) => a.name.localeCompare(b.name));
    };

    const withoutRows = ({ rows: _unused, ...g }) => g; // eslint-disable-line no-unused-vars
    const nest = (groups, rest) => groups.map(g => (rest.length > 0
      ? { ...withoutRows(g), children: nest(buildGroups(g.rows, rest[0]), rest.slice(1)) }
      : withoutRows(g)));
    return nest(buildGroups(filteredRows, levels[0] ?? null), levels.slice(1));
  }, [filteredRows, weekDefs, levels]);

  const handleApply = () => {
    if (dateError) return;
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedSelections(selections);
    setAppliedCities(cities);
    setAppliedKitchens(kitchens);
  };

  const handleClear = () => {
    setStartDate(iso(8));
    setEndDate(iso(1));
    setSelections({});
    setCities([]);
    setKitchens([]);
    
    setAppliedStartDate(iso(8));
    setAppliedEndDate(iso(1));
    setAppliedSelections({});
    setAppliedCities([]);
    setAppliedKitchens([]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 64 }}>
      {/* Top Filters (Draft state, applied via Apply button) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "nowrap", overflowX: "visible" }}>
          
          <DateRangeButton startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} hasError={!!dateError} />

          {dateError && <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>{dateError}</span>}
          
          <div style={{ width: 1, height: 24, background: C.border, margin: "0 4px", flexShrink: 0 }} />

          {/* Filters defined on the Metabase card — added, removed or changed there, they change here too */}
          {cardFilters.map(f => (
            <div key={f.slug} style={FILTER_BOX}>
              <MultiSelectDropdown
                label={pluralLabel(f.name)}
                options={optionsFor(f.slug, f.values)}
                selected={selections[f.slug] || []}
                onChange={(vals) => setSelections(prev => ({ ...prev, [f.slug]: vals }))}
                single={!f.multi && !FILTERED_ON_PAGE.has(f.slug) && f.slug !== CHANNEL_SLUG}
              />
            </div>
          ))}
          <div style={FILTER_BOX}><MultiSelectDropdown label="Cities" options={optionsFor("city")} selected={cities} onChange={setCities} /></div>
          <div style={FILTER_BOX}><MultiSelectDropdown label="Kitchens" options={optionsFor("kitchen")} selected={kitchens} onChange={setKitchens} /></div>
        </div>
        
        {/* Centered Apply/Clear Buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <button 
            onClick={handleClear}
            style={{ padding: "8px 24px", background: "#f1f5f9", color: "#334155", border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }} 
          >
            Clear
          </button>
          <button 
            onClick={handleApply}
            style={{ padding: "8px 32px", background: "#1e3a8a", color: "#ffffff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14, boxShadow: "0 2px 4px rgba(0,0,0,0.1)", letterSpacing: 0.3 }} 
          >
            Apply
          </button>
        </div>
      </div>

      {dateError ? (
        <div style={{ padding: 60, textAlign: "center", color: "#ef4444", background: "#fef2f2", borderRadius: 12, border: "1px solid #fecaca" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Invalid Date Range</div>
          <div style={{ fontSize: 14 }}>{dateError}</div>
        </div>
      ) : (
        <React.Fragment>
          {/* Top Stat Cards */}
          <div style={{ display: "flex", gap: "clamp(8px, 1vw, 16px)" }}>
            <StatCard label="Total Kitchens" value={stats.totalKitchens} />
            {METRICS.map(m => (
              <StatCard key={m.key} label={m.key === "orders" ? `Completed Orders (${weekDefs.length} Weeks)` : m.label.replace(" (min)", "")}
                value={`${formatMetric(m, stats[m.key])}${m.label.endsWith("(min)") ? " min" : ""}`} />
            ))}
          </div>

          {/* Legend Block */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px", background: "#f8fafc", border: `1px solid ${C.border}`, borderRadius: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, fontSize: 13, fontWeight: 600, color: C.text }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 14, height: 14, borderRadius: 3, background: "#28a745" }}></div>Excellent</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 14, height: 14, borderRadius: 3, background: "#ffc107" }}></div>Good</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 14, height: 14, borderRadius: 3, background: "#fd7e14" }}></div>Needs Attention</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 14, height: 14, borderRadius: 3, background: "#dc3545" }}></div>Critical</div>
              
              <div style={{ width: 1, height: 18, background: C.border }}></div>
              
              <div style={{ display: "flex", gap: 16, color: C.muted }}>
                <div><span style={{ color: C.text }}>KPT:</span> ≤12 / ≤18 / ≤25 / {'>'}25</div>
                <div><span style={{ color: C.text }}>P80 KPT:</span> ≤18 / ≤25 / ≤35 / {'>'}35</div>
                <div><span style={{ color: C.text }}>O2D:</span> ≤20 / ≤28 / ≤35 / {'>'}35</div>
              </div>
              
              <div style={{ width: 1, height: 18, background: C.border }}></div>
              <div style={{ display: "flex", gap: 12, color: C.muted }}>
                <div><span style={{ color: "#28a745" }}>▼</span> Improved</div>
                <div><span style={{ color: "#dc3545" }}>▲</span> Worsened (vs prev week)</div>
              </div>
            </div>
          </div>

          {/* Upstream data-source problem (Metabase not responding for this range) */}
          {!loading && loadError && (
            <div style={{ padding: "14px 18px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, color: "#b91c1c", fontSize: 13.5, fontWeight: 600 }}>
              {loadError}
            </div>
          )}
          {filtersError && (
            <div style={{ padding: "14px 18px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, color: "#b45309", fontSize: 13.5, fontWeight: 600 }}>
              {filtersError}
            </div>
          )}
          {!loading && !loadError && truncated && (
            <div style={{ padding: "14px 18px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, color: "#b45309", fontSize: 13.5, fontWeight: 600 }}>
              Metabase returned its 2,000-row maximum, so some rows are missing and the numbers below are partial. Narrow the filters or the date range.
            </div>
          )}

          {/* Single Unified Table */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#214a70", color: "#fff", textAlign: "left" }}>
              <th style={{ padding: "14px 20px", fontSize: 14 }}>{headerLabel}</th>
              {METRICS.map(m => <th key={m.key} style={{ padding: "14px 20px", fontSize: 14 }}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={METRICS.length + 1} style={{ padding: 40, textAlign: "center", color: C.muted }}>Loading...</td></tr>}
            {!loading && groupedData.length === 0 && <tr><td colSpan={METRICS.length + 1} style={{ padding: 40, textAlign: "center", color: C.muted }}>{loadError ? "Data couldn't be loaded — see the message above." : "No records match your selection."}</td></tr>}
            
            {/* If Default Mode (No filters), just show overall weeks directly */}
            {!loading && isDefault && groupedData.map(group => (
              <React.Fragment key={group.name}>
                {group.weeks.map(row => (
                  <WeekRow key={row.weekVal} week={row} indent={20} startOpen={weekDefs.length <= 1}
                    rowStyle={{ background: "#fff" }} labelStyle={{ fontWeight: 700, color: "#1e3a8a" }} cellStyle={{ padding: "12px 20px", fontWeight: 700 }} />
                ))}
              </React.Fragment>
            ))}

            {/* If Filtered Mode, show Accordion Rows inside the table */}
            {!loading && !isDefault && groupedData.map(group => (
              <AccordionTableRow key={group.name} group={group} isOneWeek={weekDefs.length <= 1} />
            ))}
          </tbody>
        </table>
      </div>
        </React.Fragment>
      )}
    </div>
  );
}

function MetricCells({ row, cellStyle }) {
  return METRICS.map(m => (
    <td key={m.key} style={m.color
      ? { ...cellStyle, backgroundColor: getBgColor(row[m.key], ...m.color), color: getTextColor(row[m.key], ...m.color) }
      : cellStyle}>
      {formatMetric(m, row[m.key])}
    </td>
  ));
}

// A week row that opens to its days (at most 7). A 1-week range starts open.
function WeekRow({ week, indent, startOpen, rowStyle, labelStyle, cellStyle }) {
  const [open, setOpen] = useState(startOpen);

  return (
    <React.Fragment>
      <tr onClick={() => setOpen(!open)} style={{ ...rowStyle, borderBottom: `1px solid ${C.borderSoft}`, cursor: "pointer" }}>
        <td style={{ ...cellStyle, ...labelStyle, paddingLeft: indent }}>
          <span style={{ display: "inline-block", width: 16, color: C.primary, fontSize: 11 }}>{open ? "▼" : "▶"}</span>
          {week.weekLabel}
        </td>
        <MetricCells row={week} cellStyle={cellStyle} />
      </tr>
      {open && week.days.map(day => (
        <tr key={day.date} style={{ background: "#ffffff", borderBottom: `1px solid ${C.borderSoft}` }}>
          <td style={{ padding: `8px 20px 8px ${indent + 36}px`, fontWeight: 500, color: C.muted, fontSize: 12.5 }}>{day.label}</td>
          <MetricCells row={day} cellStyle={{ padding: "8px 20px", fontWeight: 500, fontSize: 12.5 }} />
        </tr>
      ))}
    </React.Fragment>
  );
}

function AccordionTableRow({ group, isOneWeek, depth = 0 }) {
  // A group with children (brand → locations) opens to them; otherwise to its weeks.
  const hasChildren = !!group.children;
  const autoOpen = isOneWeek && !hasChildren;
  const [expanded, setExpanded] = useState(autoOpen);

  useEffect(() => {
    if (autoOpen) setExpanded(true);
  }, [autoOpen]);

  const indent = 20 + depth * 20;

  return (
    <React.Fragment>
      {/* Group Summary Row */}
      <tr 
        onClick={() => !autoOpen && setExpanded(!expanded)} 
        style={{ borderBottom: `1px solid ${C.borderSoft}`, cursor: autoOpen ? "default" : "pointer", background: expanded ? C.surfaceHover : depth > 0 ? "#fbfcfe" : "#fff" }}
      >
        <td style={{ padding: `14px 20px 14px ${indent}px`, fontWeight: depth > 0 ? 700 : 800, color: "#1e3a8a", fontSize: depth > 0 ? 13 : 14 }}>
          {!autoOpen && (
            <span style={{ display: "inline-block", width: 16, color: C.primary, fontSize: 12 }}>
              {expanded ? "▼" : "▶"}
            </span>
          )}
          {group.name}
        </td>
        <MetricCells row={group} cellStyle={{ padding: "14px 20px", fontWeight: depth > 0 ? 600 : 700 }} />
      </tr>

      {/* Expanded locations (brand rows) */}
      {expanded && hasChildren && group.children.map(child => (
        <AccordionTableRow key={child.name} group={child} isOneWeek={isOneWeek} depth={depth + 1} />
      ))}

      {/* Expanded Weeks Rows */}
      {expanded && !hasChildren && group.weeks.map(row => (
        <WeekRow key={row.weekVal} week={row} indent={indent + 20} startOpen={isOneWeek}
          rowStyle={{ background: "#f8fafc" }} labelStyle={{ fontWeight: 600, color: C.muted, fontSize: 13 }} cellStyle={{ padding: "10px 20px", fontWeight: 600, fontSize: 13 }} />
      ))}
    </React.Fragment>
  );
}
