import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C, FONT, cardStyle, spinnerStyle } from "../../theme";
import { fetchInsight } from "./ratingsApi";
import InsightResult from "./InsightResult";
import DefaultDashboard from "./insights/DefaultDashboard";
import DownloadDialog from "./insights/DownloadDialog";

// `paused: true` insights are kept here (not deleted) so re-enabling later is
// just flipping the flag back — the search box filters them out below, and
// the backend refuses to run them at all (see ACTIVE_INSIGHT_IDS in
// insights.routes.js), so they cost nothing while paused. Only Brand/Zone/
// City/Kitchen Level Rating (1-4) stay active for now.
export const INSIGHTS = [
  { id: 14, label: "Weekend vs Weekday Ratings", category: "Time", paused: true },
  { id: 15, label: "Peak Complaint Hours", category: "Time", paused: true },
  { id: 23, label: "Hourly Daypart Split", category: "Time", paused: true },
  { id: 12, label: "Monthly Trends Comparison", category: "Time", paused: true },
  { id: 1, label: "Brand Level Rating", category: "Performance" },
  { id: 2, label: "Zone Level Rating", category: "Location" },
  { id: 3, label: "City Level Rating", category: "Location" },
  { id: 4, label: "Kitchen Level Rating", category: "Location" },
  { id: 26, label: "Best & Worst Brand per City", category: "Location", paused: true },
  { id: 27, label: "Outlet vs Kitchen Average Gap", category: "Location", paused: true },
  { id: 28, label: "Best Item per Outlet", category: "Location", paused: true },
  { id: 6, label: "SKU Leaderboard - Top Rated", category: "SKUs", paused: true },
  { id: 7, label: "SKU Leaderboard - Worst Rated (Kill List)", category: "SKUs", paused: true },
  { id: 8, label: "High Volume SKUs", category: "SKUs", paused: true },
  { id: 10, label: "High Volume, Low Rating items", category: "SKUs", paused: true },
  { id: 29, label: "SKU Consistency (Variance)", category: "SKUs", paused: true },
  { id: 9, label: "Category Ratings", category: "Performance", paused: true },
  { id: 11, label: "Rating Distribution Stats", category: "Performance", paused: true },
  { id: 21, label: "Comments Insight", category: "Performance", paused: true },
  { id: 17, label: "AI Department Blame Split", category: "Performance", paused: true },
  { id: 16, label: "AI Repeat Complaint Finder", category: "Performance", paused: true },
  { id: 18, label: "AI Weekly Operations Brief", category: "Performance", paused: true },
  { id: 19, label: "AI Action Items Generator", category: "Performance", paused: true },
  { id: 20, label: "AI Packaging Issues Tracker", category: "Performance", paused: true },
  { id: 30, label: "Item Rating by City", category: "Item-wise", paused: true },
  { id: 31, label: "Item Trend Over Time", category: "Item-wise", paused: true },
  { id: 32, label: "Item vs Company Average Gap", category: "Item-wise", paused: true },
];

const ACTIVE_INSIGHTS = INSIGHTS.filter((i) => !i.paused);

const daysBetween = (from, to) => {
  if (!from || !to) return 0;
  return Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
};

// Two severities, not one flat "warning":
//   "info"  — the current filters are a legitimate, narrower slice of real
//             data. Never blocks Apply. Worded as neutral information, not a
//             problem to fix, since narrowing to e.g. one zone or one city is
//             often exactly what the user wants, not a mistake.
//   "block" — the current combination would produce a genuinely wrong number,
//             not just a narrower one (item/SKU-name-based insights mixing
//             brands can silently merge two unrelated items that happen to
//             share a name), or a combination with zero real data behind it.
//             Disables Apply until fixed.
function buildValidation(insightId, f, allBrands, masterData) {
  const issues = [];
  const days = daysBetween(f.dateFrom, f.dateTo);
  const timeSet = Boolean(f.timeFrom || f.timeTo);
  const setDays = (n) => ({
    label: `⚡ Set date range to ${n} days`,
    patch: () => {
      const to = new Date();
      to.setDate(to.getDate() - 1);
      const from = new Date(to);
      from.setDate(from.getDate() - (n - 1));
      return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
    },
  });
  const clearTime = { label: "⚡ Clear time filter", patch: () => ({ timeFrom: "", timeTo: "" }) };
  const allBrandsFix = { label: "⚡ Select all brands (Clear brand filter)", patch: () => ({ brands: [] }) };
  const oneBrandFix = allBrands.length
    ? { label: `⚡ Select '${allBrands[0]}'`, patch: () => ({ brands: [allBrands[0]] }) }
    : null;

  const needDays = (n) => {
    if (days < n) issues.push({ level: "info", msg: `This insight is more meaningful with at least ${n} days of data (currently ${days}) — it'll still run.`, fixes: [setDays(n)] });
  };

  if ([14].includes(insightId)) needDays(7);
  if ([15, 23].includes(insightId)) needDays(3);
  if (insightId === 31) needDays(3);
  if ([14, 15, 23].includes(insightId) && timeSet)
    issues.push({ level: "info", msg: "A time filter will hide part of the daily cycle for this insight.", fixes: [clearTime] });
  if (insightId === 12 && days < 15)
    issues.push({ level: "info", msg: `Monthly trends are more meaningful with at least 15 days of history (currently ${days}) — it'll still run.`, fixes: [setDays(30)] });
  if (insightId === 2 && f.zones.length === 1)
    issues.push({ level: "info", msg: "One zone selected — you'll see that zone's number, not a comparison across zones. Clear the zone filter to compare.", fixes: [{ label: "⚡ Clear zone filter", patch: () => ({ zones: [] }) }] });
  if (insightId === 3 && f.cities.length === 1)
    issues.push({ level: "info", msg: "One city selected — you'll see that city's number, not a comparison across cities. Clear the city filter to compare.", fixes: [{ label: "⚡ Clear city filter", patch: () => ({ cities: [] }) }] });
  if (insightId === 4 && f.kitchens.length === 1)
    issues.push({ level: "info", msg: "One kitchen selected — you'll see that kitchen's number, not a comparison across kitchens. Clear the kitchen filter to compare.", fixes: [{ label: "⚡ Clear kitchen filter", patch: () => ({ kitchens: [] }) }] });
  if ([26, 1].includes(insightId) && f.brands.length === 1)
    issues.push({ level: "info", msg: "One brand selected — you'll see that brand's number, not a comparison across brands. Clear the brand filter to compare.", fixes: [allBrandsFix] });
  // Case 10 groups by kitchen, not by item name, despite its "items" label —
  // mixing brands there is a narrower view, not a name-collision risk, so it
  // only gets a soft note, unlike the genuine item/SKU insights below.
  if (insightId === 10 && f.brands.length !== 1)
    issues.push({ level: "info", msg: "Works across multiple brands too — select exactly one brand for a single-brand view.", fixes: oneBrandFix ? [oneBrandFix] : [] });
  if ([6, 7, 8, 29, 30, 31, 32].includes(insightId) && f.brands.length !== 1)
    issues.push({
      level: "block",
      msg: "Item-level insights group by item name — with more than one brand selected, two unrelated items from different brands that happen to share a name would get silently merged into one row. Select exactly one brand to continue.",
      fixes: oneBrandFix ? [oneBrandFix] : [],
    });
  if (insightId === 18 && (days < 7 || days > 14))
    issues.push({ level: "info", msg: "The weekly brief reads best over a 7–14 day window.", fixes: [setDays(7)] });

  // Zero real-outlet overlap: not wrong, just empty — worth knowing before
  // Apply rather than discovering it from a blank result.
  const hasBrandFilter = f.brands.length > 0 || (f.subBrands || []).length > 0;
  const hasLocationFilter = f.cities.length > 0 || f.zones.length > 0 || f.kitchens.length > 0;
  if (masterData && hasBrandFilter && hasLocationFilter) {
    const overlaps = masterData.some(
      (m) =>
        (!f.brands.length || f.brands.includes(m.brand)) &&
        (!(f.subBrands || []).length || f.subBrands.includes(m.subBrand)) &&
        (!f.cities.length || f.cities.includes(m.city)) &&
        (!f.zones.length || f.zones.includes(m.zone)) &&
        (!f.kitchens.length || f.kitchens.includes(m.kitchen)),
    );
    if (!overlaps) {
      issues.push({
        level: "info",
        msg: "The selected brand(s) have no outlets matching the selected location filter(s) — this will return no data.",
        fixes: [
          { label: "⚡ Clear city/zone/kitchen filters", patch: () => ({ cities: [], zones: [], kitchens: [] }) },
        ],
      });
    }
  }

  return issues;
}

export default function RatingsPage({ globalFilters, allBrands, masterData, onUpdateFilters, onClearAllFilters }) {
  // globalFilters is the live, editable draft the filter bar writes to on every
  // click. appliedFilters is a snapshot of it, only ever updated by the Apply
  // button — every fetch and every value rendered on screen reads from this
  // snapshot instead, so nothing on the page changes just from picking filters.
  const [appliedFilters, setAppliedFilters] = useState(globalFilters);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [defaultData, setDefaultData] = useState(null);
  const [showDownload, setShowDownload] = useState(false);
  const downloadRef = useRef(null);
  const [hasDownload, setHasDownload] = useState(false);
  const inputRef = useRef(null);
  const searchRef = useRef(null);

  const registerDownload = useCallback((fn) => {
    downloadRef.current = fn;
    setHasDownload(Boolean(fn));
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Closes the dropdown on an outside click — it previously had no such handler
  // at all, so clicking anywhere else (another filter, the page body) left it
  // stuck open on top of everything.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reopening the box right after picking an insight (query still holds that
  // insight's full label, unedited) should show every option again, not just
  // the one that happens to match the current text — otherwise switching to a
  // different insight means manually clearing the box first.
  const matches = useMemo(() => {
    const q = query.replace(/^\d+\.\s*/, "").trim().toLowerCase();
    const unedited = selected && query === `${selected.id}. ${selected.label}`;
    if (!q || unedited) return ACTIVE_INSIGHTS;
    return ACTIVE_INSIGHTS.filter((i) => i.label.toLowerCase().includes(q) || String(i.id) === q);
  }, [query, selected]);

  // Both fetchers take an explicit filters argument (falling back to the
  // appliedFilters snapshot) instead of only ever reading appliedFilters from
  // closure. The Apply button needs to trigger a fetch on every click, even
  // when the filters it's committing are identical to what's already applied
  // (e.g. picking a new insight without touching any filter first) — relying
  // on a useEffect keyed to appliedFilters *changing* silently did nothing in
  // that case, since React bails out of a state update that's the same
  // object reference, so the effect never re-ran.
  const loadDefault = useCallback((f) => {
    const useFilters = f || appliedFilters;
    setLoading(true);
    Promise.all([fetchInsight(1, useFilters), fetchInsight(22, useFilters)])
      .then(([brandRatings, rv]) => {
        setDefaultData({ brandRatings, reviews: rv });
        setError(null);
      })
      .catch((e) => setError(e.message === "NO_DATA" ? "NO_DATA" : "ERROR"))
      .finally(() => setLoading(false));
  }, [appliedFilters]);

  // Reloads the default dashboard on mount and whenever the view switches
  // back to it (e.g. closing an insight result). Apply no longer relies on
  // this effect — it calls loadDefault directly — so this only needs to react
  // to `selected` toggling, not to appliedFilters.
  useEffect(() => {
    if (!selected) loadDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const runInsight = useCallback(
    async (insight, f) => {
      const useFilters = f || appliedFilters;
      setLoading(true);
      setError(null);
      registerDownload(null);
      try {
        if ([1, 2, 3, 4].includes(insight.id)) {
          const [agg, rv] = await Promise.all([fetchInsight(insight.id, useFilters), fetchInsight(22, useFilters)]);
          setResult(agg);
          setReviews(rv);
        } else {
          const data = await fetchInsight(insight.id, useFilters);
          setResult(data);
          setReviews([]);
        }
        setDefaultData(null);
      } catch (e) {
        setResult(null);
        setError(e.message === "NO_DATA" ? "NO_DATA" : e.message === "RATE_LIMITED" ? "RATE_LIMITED" : "ERROR");
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters, registerDownload],
  );

  const pick = (insight) => {
    setSelected(insight);
    setQuery(`${insight.id}. ${insight.label}`);
    setOpen(false);
  };

  // Panel below only renders at all when issues.length > 0, so there's no
  // "everything's fine" state left to color/title here.
  const issues = selected ? buildValidation(selected.id, globalFilters, allBrands, masterData) : [];
  const hasBlock = issues.some((i) => i.level === "block");
  const panelColor = hasBlock ? C.danger : C.warn;
  const panelTitle = hasBlock ? "Fix Required Before Running" : "Heads Up";

  const highlightText = (text) => {
    const q = query.replace(/^\d+\.\s*/, "").toLowerCase();
    const idx = q ? text.toLowerCase().indexOf(q) : -1;
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ backgroundColor: C.primary, color: "#ffffff" }}>{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const errorCopy = {
    NO_DATA: "No rating/insights data matches the selected global filters.",
    RATE_LIMITED: "Rate limit reached. Please wait 60 seconds.",
    ERROR: "Analytical service unavailable. Please retry.",
  };

  const actionsBar = (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
      <div ref={searchRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !matches.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % matches.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + matches.length) % matches.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(matches[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={`Search ${ACTIVE_INSIGHTS.length} insights...`}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "11px 18px",
            borderRadius: 24,
            border: `2px solid ${C.primary}`,
            fontSize: 13,
            color: C.text,
            fontFamily: FONT,
            outline: "none",
          }}
        />
        {open && matches.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              border: `2px solid ${C.primary}`,
              borderRadius: 12,
              backgroundColor: "#ffffff",
              maxHeight: 260,
              overflowY: "auto",
              zIndex: 1001,
            }}
          >
            {matches.map((m, i) => (
              <div
                key={m.id}
                onMouseDown={() => pick(m)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "9px 14px",
                  cursor: "pointer",
                  fontSize: 12.5,
                  backgroundColor: highlight === i ? C.primary : "#ffffff",
                  color: highlight === i ? "#ffffff" : C.primary,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {m.id}. {highlightText(m.label)}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.7, whiteSpace: "nowrap" }}>{m.category}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onClearAllFilters}
        style={{
          padding: "11px 18px",
          borderRadius: 24,
          border: `1.5px solid ${C.border}`,
          backgroundColor: "transparent",
          color: C.muted,
          fontSize: 12.5,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: FONT,
        }}
      >
        Clear
      </button>

      <button
        disabled={loading || hasBlock}
        onClick={() => {
          setAppliedFilters(globalFilters);
          if (selected) runInsight(selected, globalFilters);
          else loadDefault(globalFilters);
        }}
        style={{
          padding: "11px 22px",
          borderRadius: 24,
          border: "none",
          backgroundColor: C.primary,
          color: "#ffffff",
          fontSize: 13,
          fontWeight: 800,
          cursor: loading || hasBlock ? "not-allowed" : "pointer",
          opacity: loading || hasBlock ? 0.6 : 1,
          fontFamily: FONT,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {loading && <span style={{ ...spinnerStyle, borderColor: "#ffffff", borderTopColor: "transparent" }} />}
        {loading ? "Calculating..." : "Apply"}
      </button>

      {hasDownload && (
        <button
          onClick={() => setShowDownload(true)}
          title="Download Report"
          aria-label="Download Report"
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            border: `2px solid ${C.primary}`,
            backgroundColor: "transparent",
            color: C.primary,
            fontSize: 16,
            cursor: "pointer",
            fontFamily: FONT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          📥
        </button>
      )}
    </div>
  );

  const actionsSlot = typeof document !== "undefined" ? document.getElementById("ratings-actions-slot") : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT }}>
      {actionsSlot ? createPortal(actionsBar, actionsSlot) : actionsBar}

      {selected && issues.length > 0 && (
        <div style={{ ...cardStyle, borderLeft: `4px solid ${panelColor}`, padding: "14px 18px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: panelColor }}>{panelTitle}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            {issues.map((iss, i) => (
              <div key={i} style={{ fontSize: 12, color: C.text }}>
                <div style={{ fontWeight: 600 }}>
                  {iss.level === "block" ? "⛔" : "ℹ️"} {iss.msg}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {iss.fixes.map((fix) => (
                    <button
                      key={fix.label}
                      onClick={() => onUpdateFilters(fix.patch())}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 18,
                        border: `1.5px solid ${C.primary}`,
                        backgroundColor: "#ffffff",
                        color: C.primary,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                        fontFamily: FONT,
                      }}
                    >
                      {fix.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>{errorCopy[error]}</div>
          {error !== "NO_DATA" && (
            <button
              onClick={() => (selected ? runInsight(selected) : loadDefault())}
              style={{
                marginTop: 12,
                padding: "8px 20px",
                borderRadius: 20,
                border: "none",
                backgroundColor: C.primary,
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {!error && selected && result && (
        <InsightResult
          insightId={selected.id}
          label={selected.label}
          data={result}
          reviews={reviews}
          allBrands={allBrands}
          masterData={masterData}
          filters={appliedFilters}
          onClose={() => {
            setSelected(null);
            setResult(null);
            setQuery("");
            registerDownload(null);
          }}
          onRegisterDownload={registerDownload}
        />
      )}

      {!error && !selected && defaultData && (
        <DefaultDashboard
          data={defaultData}
          allBrands={allBrands}
          masterData={masterData}
          filters={appliedFilters}
          onRegisterDownload={registerDownload}
        />
      )}

      {showDownload && (
        <DownloadDialog dataSheets={downloadRef.current ? downloadRef.current() : []} onClose={() => setShowDownload(false)} />
      )}
    </div>
  );
}
