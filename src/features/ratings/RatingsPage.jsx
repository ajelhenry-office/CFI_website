import React, { useState } from "react";
import InsightButtons from "./InsightButtons";
import InsightResult from "./InsightResult";
import * as api from "./ratingsApi";

const INSIGHT_FN = {
  1:  api.fetchBrandRating,
  2:  api.fetchZoneRating,
  3:  api.fetchCityRating,
  4:  api.fetchKitchenRating,
  5:  api.fetchPlatformComparison,
  6:  api.fetchTopSKU,
  7:  api.fetchWorstSKU,
  8:  api.fetchBestSellingSKU,
  9:  api.fetchCategoryRating,
  10: api.fetchHighVolumeLowRating,
  11: api.fetchStarDistribution,
  12: api.fetchMoMTrend,
  13: api.fetchVolumeVsRating,
  14: api.fetchWeekendVsWeekday,
  15: api.fetchPeakBadHours,
  16: api.fetchRepeatComplaints,
  17: api.fetchDeliveryVsKitchen,
  18: api.fetchWeeklyBrief,
  19: api.fetchActionItems,
  20: api.fetchPackagingIssues,
};

const s = {
  page:    { padding: "28px 32px", overflowY: "auto", height: "100%", boxSizing: "border-box", color: "#e2e8f0" },
  filters: { display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" },
  input:   { background: "#0c1117", border: "1px solid #1a2535", borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontSize: 13, outline: "none" },
  label:   { fontSize: 11, color: "#4a6080", marginBottom: 4, display: "block" },
  error:   { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "12px 16px", color: "#ef4444", fontSize: 13, display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  retryBtn:{ background: "none", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 12px", color: "#ef4444", fontSize: 12, cursor: "pointer" },
};

export default function RatingsPage() {
  const [filters, setFilters] = useState({ brand: "", city: "", zone: "", dateFrom: "", dateTo: "" });
  const [activeId,  setActiveId]  = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const handleSelect = async (id) => {
    if (loadingId) return;
    setLoadingId(id);
    setError(null);
    setResult(null);
    setActiveId(id);
    try {
      const data = await INSIGHT_FN[id](filters);
      if (!data || (Array.isArray(data) && data.length === 0)) {
        setError("NO_DATA");
      } else {
        setResult(data);
      }
    } catch (e) {
      if (e.message === "RATE_LIMITED") setError("RATE_LIMITED");
      else if (e.message === "NO_DATA")  setError("NO_DATA");
      else setError("ERROR");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div style={s.page}>
      {/* ── FILTERS ── */}
      <div style={s.filters}>
        {[
          { key: "brand",    placeholder: "Brand",     type: "text" },
          { key: "city",     placeholder: "City",      type: "text" },
          { key: "zone",     placeholder: "Zone",      type: "text" },
          { key: "dateFrom", placeholder: "Date From", type: "date" },
          { key: "dateTo",   placeholder: "Date To",   type: "date" },
        ].map(({ key, placeholder, type }) => (
          <div key={key}>
            <label style={s.label}>{placeholder}</label>
            <input
              type={type}
              placeholder={placeholder}
              value={filters[key]}
              onChange={e => setFilter(key, e.target.value)}
              style={s.input}
            />
          </div>
        ))}
      </div>

      {/* ── BUTTONS ── */}
      <InsightButtons activeId={activeId} loadingId={loadingId} onSelect={handleSelect} />

      {/* ── RESULT / ERROR ── */}
      <div style={{ marginTop: 28 }}>
        {error === "NO_DATA" && (
          <div style={s.error}>No data found for selected filters.</div>
        )}
        {error === "RATE_LIMITED" && (
          <div style={s.error}>
            Please wait 1 minute and retry.
            <button style={s.retryBtn} onClick={() => handleSelect(activeId)}>Retry</button>
          </div>
        )}
        {error === "ERROR" && (
          <div style={s.error}>
            AI unavailable. Try again.
            <button style={s.retryBtn} onClick={() => handleSelect(activeId)}>Retry</button>
          </div>
        )}
        {result && !error && (
          <InsightResult
            insightId={activeId}
            data={result}
            onClose={() => { setResult(null); setActiveId(null); }}
          />
        )}
      </div>
    </div>
  );
}
