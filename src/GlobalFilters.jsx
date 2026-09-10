import { useEffect, useMemo, useRef, useState } from "react";
import { C, FONT } from "./theme";
import useIsMobile from "./useIsMobile";

const popoverStyle = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 1000,
  backgroundColor: "#ffffff",
  border: `2px solid ${C.primary}`,
  borderRadius: 12,
  padding: 12,
  minWidth: 230,
  boxShadow: "0 8px 26px rgba(19,38,100,0.16)",
  fontFamily: FONT,
};

const linkStyle = {
  background: "none",
  border: "none",
  color: C.primary,
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
  padding: 0,
  fontFamily: FONT,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 12,
  color: C.text,
  fontFamily: FONT,
  outline: "none",
};

// Compact "value on top, label below" trigger used by every filter column — one
// grid cell each, so 7 columns always divide the full row width exactly evenly
// with zero leftover space, regardless of how short their own content is.
// (flex:1 siblings alongside separate divider elements turned out not to
// guarantee this — grid columns do, by definition.)
const columnTriggerStyle = {
  background: "none",
  border: "none",
  borderRight: `1px solid ${C.border}`,
  cursor: "pointer",
  padding: "0 16px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: 3,
  fontFamily: FONT,
  minWidth: 0,
  width: "100%",
  height: 40,
  boxSizing: "border-box",
};

const lastColumnTriggerStyle = { ...columnTriggerStyle, borderRight: "none" };

function ColumnValue({ children, active, color }) {
  return (
    <span
      style={{
        fontSize: 15,
        fontWeight: 800,
        color: color || (active ? C.primary : C.muted),
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 160,
      }}
    >
      {children}
    </span>
  );
}

function ColumnLabel({ children }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{children}</span>;
}

// Summarizes a multi-select filter's current value the same way everywhere:
// nothing picked → "All", one picked → its name, several → a count.
function summarize(selected) {
  if (selected.length === 0) return "All";
  if (selected.length === 1) return selected[0];
  return `${selected.length} selected`;
}

export function CheckboxFilterPopover({ label, options, selected, onChange, searchable, isLast }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const visible = useMemo(
    () => (query ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options),
    [options, query],
  );

  const toggle = (opt) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button style={isLast ? lastColumnTriggerStyle : columnTriggerStyle} onClick={() => setOpen((o) => !o)}>
        <ColumnValue active={selected.length > 0}>{summarize(selected)}</ColumnValue>
        <ColumnLabel>{label}</ColumnLabel>
      </button>
      {open && (
        <div style={popoverStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.primary, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {label}
            </span>
            <span style={{ display: "flex", gap: 10 }}>
              <button style={linkStyle} onClick={() => onChange([...options])}>
                All
              </button>
              <button style={linkStyle} onClick={() => onChange([])}>
                None
              </button>
            </span>
          </div>
          {searchable && (
            <input
              style={{ ...inputStyle, marginBottom: 8 }}
              placeholder={`Search ${label.toLowerCase()}...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <div style={{ maxHeight: 210, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {visible.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, padding: "6px 2px" }}>No options available</div>
            )}
            {visible.map((opt) => (
              <label
                key={opt}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text, padding: "4px 2px", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  style={{ accentColor: C.primary, width: 14, height: 14 }}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// No local draft here — edits write straight through to the shared filter
// state on every change, same as the checkbox popovers. Nothing refetches
// data on that write (RatingsPage only fetches on mount, on switching away
// from a selected insight, or on the single global Apply click), so there's
// no live-apply side effect to guard against; the per-field values just need
// to be visible immediately while the popover is open.
function RangePopover({ label, value, active, fields, onFieldChange, onClear, isLast }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button style={isLast ? lastColumnTriggerStyle : columnTriggerStyle} onClick={() => setOpen((o) => !o)}>
        <ColumnValue active={active} color={active ? "#d97706" : undefined}>{value}</ColumnValue>
        <ColumnLabel>{label}</ColumnLabel>
      </button>
      {open && (
        <div style={popoverStyle}>
          {fields.map((f, i) => (
            <div key={f.label} style={{ marginBottom: 9 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>
                {f.label}
              </div>
              <input
                type={f.type}
                style={inputStyle}
                value={f.value || ""}
                onChange={(e) => onFieldChange(i, e.target.value)}
              />
            </div>
          ))}
          <button
            onClick={onClear}
            style={{
              marginTop: 4, width: "100%", padding: "7px 0", borderRadius: 8, border: `1.5px solid ${C.primary}`,
              backgroundColor: "#ffffff", color: C.primary, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: FONT,
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

export default function GlobalFilters({ filters, masterData, onChange }) {
  const isMobile = useIsMobile();
  const opts = useMemo(() => {
    const match = (row, skip) =>
      (skip === "brand" || !filters.brands.length || filters.brands.includes(row.brand)) &&
      (skip === "subBrand" || !filters.subBrands?.length || filters.subBrands.includes(row.subBrand)) &&
      (skip === "city" || !filters.cities.length || filters.cities.includes(row.city)) &&
      (skip === "zone" || !filters.zones.length || filters.zones.includes(row.zone)) &&
      (skip === "kitchen" || !filters.kitchens.length || filters.kitchens.includes(row.kitchen));
    const uniq = (key) => [...new Set(masterData.filter((r) => match(r, key)).map((r) => r[key]))].filter(Boolean).sort();
    return {
      brands: uniq("brand"),
      subBrands: uniq("subBrand"),
      cities: uniq("city"),
      zones: uniq("zone"),
      kitchens: uniq("kitchen"),
    };
  }, [masterData, filters]);

  return (
    // Grid, not flex — 7 equal columns are guaranteed to divide the full row
    // width exactly, with no leftover space at the end, regardless of how
    // short any one column's content is. Divider lines are each column's own
    // right border now instead of separate elements between them.
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(7, 1fr)", rowGap: isMobile ? 8 : 0, width: "100%", border: isMobile ? `1px solid ${C.border}` : "none", borderRadius: isMobile ? 10 : 0, overflow: "hidden" }}>
      <CheckboxFilterPopover
        label="Brand"
        options={opts.brands}
        selected={filters.brands}
        onChange={(v) => onChange({ brands: v })}
      />
      <CheckboxFilterPopover
        label="Sub brand"
        options={opts.subBrands}
        selected={filters.subBrands || []}
        onChange={(v) => onChange({ subBrands: v })}
        searchable
      />
      <CheckboxFilterPopover
        label="Zone"
        options={opts.zones}
        selected={filters.zones}
        onChange={(v) => onChange({ zones: v })}
      />
      <CheckboxFilterPopover
        label="City"
        options={opts.cities}
        selected={filters.cities}
        onChange={(v) => onChange({ cities: v })}
        searchable
      />
      <CheckboxFilterPopover
        label="Kitchen"
        options={opts.kitchens}
        selected={filters.kitchens}
        onChange={(v) => onChange({ kitchens: v })}
        searchable
      />
      <RangePopover
        label="Date"
        value={filters.dateFrom || filters.dateTo ? `${filters.dateFrom || "…"} → ${filters.dateTo || "…"}` : "All"}
        active={Boolean(filters.dateFrom || filters.dateTo)}
        fields={[
          { label: "From Date", type: "date", value: filters.dateFrom },
          { label: "To Date", type: "date", value: filters.dateTo },
        ]}
        onFieldChange={(i, v) => onChange(i === 0 ? { dateFrom: v } : { dateTo: v })}
        onClear={() => onChange({ dateFrom: "", dateTo: "" })}
      />
      <RangePopover
        label="Time"
        value={filters.timeFrom || filters.timeTo ? `${filters.timeFrom || "…"} → ${filters.timeTo || "…"}` : "All"}
        active={Boolean(filters.timeFrom || filters.timeTo)}
        fields={[
          { label: "From Time", type: "time", value: filters.timeFrom },
          { label: "To Time", type: "time", value: filters.timeTo },
        ]}
        onFieldChange={(i, v) => onChange(i === 0 ? { timeFrom: v } : { timeTo: v })}
        onClear={() => onChange({ timeFrom: "", timeTo: "" })}
        isLast
      />
    </div>
  );
}
