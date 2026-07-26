import React, { useState, useEffect, useRef } from "react";
import InsightResult, { DownloadDialog } from "./InsightResult";
import * as api from "./ratingsApi";

const INSIGHT_FN = {
  1: api.fetchBrandRating,
  2: api.fetchZoneRating,
  3: api.fetchCityRating,
  4: api.fetchKitchenRating,
  5: api.fetchPlatformComparison,
  6: api.fetchTopSKU,
  7: api.fetchWorstSKU,
  8: api.fetchBestSellingSKU,
  9: api.fetchCategoryRating,
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
  21: api.fetchRawReviews,
  22: api.fetchLightweightReviews,
  23: api.fetchHourlyDaypartSplit,
  26: api.fetchBestWorstBrandCity,
  27: api.fetchOutletKitchenGap,
  28: api.fetchBestItemOutlet,
  29: api.fetchSKUConsistency,
  30: api.fetchItemRatingCity,
  31: api.fetchItemTrendTime,
  32: api.fetchItemCompanyGap
};

const INSIGHTS_LIST = [
  // 1. TIME
  { id: 14, label: "Weekend vs Weekday Ratings", category: "TIME" },
  { id: 15, label: "Peak Complaint Hours", category: "TIME" },
  { id: 23, label: "Hourly Daypart Split", category: "TIME" },
  { id: 12, label: "Monthly Trends Comparison", category: "TIME" },

  // 2. LOCATION LEVEL RATINGS
  { id: 2, label: "Zone Level Rating", category: "LOCATION LEVEL RATINGS" },
  { id: 3, label: "City Level Rating", category: "LOCATION LEVEL RATINGS" },
  { id: 4, label: "Area Level Rating", category: "LOCATION LEVEL RATINGS" },
  { id: 26, label: "Best & Worst Brand per City", category: "LOCATION LEVEL RATINGS" },
  { id: 27, label: "Outlet vs Kitchen Average Gap", category: "LOCATION LEVEL RATINGS" },
  { id: 28, label: "Best Item per Outlet", category: "LOCATION LEVEL RATINGS" },

  // 3. SKUs
  { id: 6, label: "SKU Leaderboard - Top Rated", category: "SKUs" },
  { id: 7, label: "SKU Leaderboard - Worst Rated (Kill List)", category: "SKUs" },
  { id: 8, label: "High Volume SKUs", category: "SKUs" },
  { id: 10, label: "High Volume, Low Rating items", category: "SKUs" },
  { id: 29, label: "SKU Consistency (Variance)", category: "SKUs" },

  // 4. PERFORMANCE & DIAGNOSTICS
  { id: 1, label: "Brand Level Rating", category: "PERFORMANCE & DIAGNOSTICS" },
  { id: 9, label: "Category Ratings (Pizza/Dessert/etc)", category: "PERFORMANCE & DIAGNOSTICS" },
  { id: 11, label: "Rating Distribution Stats", category: "PERFORMANCE & DIAGNOSTICS" },
  { id: 21, label: "Comments Insight", category: "PERFORMANCE & DIAGNOSTICS" },
  { id: 17, label: "AI Department Blame Split", category: "PERFORMANCE & DIAGNOSTICS" },
  { id: 16, label: "AI Repeat Complaint Finder", category: "PERFORMANCE & DIAGNOSTICS" },
  { id: 18, label: "AI Weekly Operations Brief", category: "PERFORMANCE & DIAGNOSTICS" },
  { id: 19, label: "AI Action Items Generator", category: "PERFORMANCE & DIAGNOSTICS" },
  { id: 20, label: "AI Packaging Issues Tracker", category: "PERFORMANCE & DIAGNOSTICS" },

  // 5. ITEM-WISE
  { id: 30, label: "Item Rating by City", category: "ITEM-WISE" },
  { id: 31, label: "Item Trend Over Time", category: "ITEM-WISE" },
  { id: 32, label: "Item vs Company Average Gap", category: "ITEM-WISE" }
];

const s = {
  page:    { padding: "32px 40px", overflowY: "auto", height: "100%", boxSizing: "border-box", color: "#132664", backgroundColor: "#ffffff" },
  error:   { background: "rgba(19, 38, 100, 0.03)", border: "1px solid #132664", borderRadius: 12, padding: "16px 20px", color: "#132664", fontSize: 13, display: "flex", alignItems: "center", gap: 12, marginBottom: 16, fontWeight: "600" },
  retryBtn:{ background: "#132664", border: "none", borderRadius: 18, padding: "6px 14px", color: "#ffffff", fontSize: 11, fontWeight: "700", cursor: "pointer" },
};

const INSIGHT_RULES = {
  14: {
    minDays: 7,
    warning: "Weekend vs Weekday analysis requires at least 7 days of data to compare both periods.",
    timeWarning: "Time range filters should be cleared for clean day-level averages.",
    fixTime: true
  },
  15: {
    minDays: 3,
    warning: "Peak hours analysis is more reliable with at least 3 days of data.",
    narrowTimeWarning: "Clear time filters to capture the full 24-hour peak pattern.",
    fixTime: true
  },
  23: {
    minDays: 3,
    warning: "Hourly Daypart Split requires at least 3 days to gather significant volume.",
    timeWarning: "Hourly split works best when all hours of the day are analyzed.",
    fixTime: true
  },
  12: {
    minDays: 15,
    critical: "Monthly trends comparison requires at least 15 days (ideally 30+ days) to display monthly changes.",
  },
  2: {
    noSingleZone: true,
    warning: "Zone Level Rating compares zones; selecting a single zone limits comparison utility."
  },
  3: {
    noSingleCity: true,
    warning: "City Level Rating compares cities; selecting a single city limits comparison utility."
  },
  4: {
    noSingleArea: true,
    warning: "Area Level Rating compares areas; selecting a single area limits comparison utility."
  },
  26: {
    noSingleBrand: true,
    warning: "This insight compares all brands; selecting a single brand limits comparison utility."
  },
  6: { minDays: 7, requiresSingleBrand: true, warning: "SKU Leaderboard works best with a single brand selected to avoid mixing menu items." },
  7: { minDays: 7, requiresSingleBrand: true, warning: "Worst Rated (Kill List) works best with a single brand selected to avoid mixing menu items." },
  8: { minDays: 7, requiresSingleBrand: true, warning: "High Volume SKUs works best with a single brand selected." },
  10: { minDays: 7, requiresSingleBrand: true, warning: "High Volume, Low Rating works best with a single brand selected." },
  29: { minDays: 7, requiresSingleBrand: true, warning: "SKU Consistency works best with a single brand selected." },
  1: {
    noSingleBrand: true,
    warning: "Brand Level Rating compares brands; selecting a single brand limits comparison utility."
  },
  18: {
    exactDaysRange: { min: 7, max: 14 },
    warning: "AI Weekly Ops Brief is optimized for a 7 to 14 day period.",
  },
  30: { requiresSingleBrand: true, critical: "Item Rating by City requires selecting a single brand first." },
  31: { minDays: 3, requiresSingleBrand: true, critical: "Item Trend Over Time requires a single brand and at least 3 days of data." },
  32: { requiresSingleBrand: true, critical: "Item vs Company Average Gap requires selecting a single brand first." }
};

function validateFilters(insightId, filters, allBrands = []) {
  if (insightId === null) return null;
  const rule = INSIGHT_RULES[insightId];
  if (!rule) return null;

  const messages = [];
  const fixes = [];
  let status = "success";

  let daysCount = 0;
  if (filters.dateFrom && filters.dateTo) {
    const start = new Date(filters.dateFrom);
    const end = new Date(filters.dateTo);
    const diffTime = Math.abs(end - start);
    daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  if (rule.minDays && daysCount < rule.minDays) {
    const isCritical = rule.critical && daysCount < rule.minDays;
    status = isCritical ? "error" : (status === "error" ? "error" : "warning");
    messages.push(rule.critical || rule.warning || `Recommended range is at least ${rule.minDays} days (Current: ${daysCount} days).`);
    fixes.push({
      label: `⚡ Set date range to ${rule.minDays} days`,
      action: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const toStr = d.toISOString().split('T')[0];
        const dFrom = new Date();
        dFrom.setDate(dFrom.getDate() - rule.minDays);
        const fromStr = dFrom.toISOString().split('T')[0];
        return { dateFrom: fromStr, dateTo: toStr };
      }
    });
  }

  if (rule.exactDaysRange && (daysCount < rule.exactDaysRange.min || daysCount > rule.exactDaysRange.max)) {
    status = "warning";
    messages.push(rule.warning || `Optimized for ${rule.exactDaysRange.min}-${rule.exactDaysRange.max} days (Current: ${daysCount} days).`);
    fixes.push({
      label: `⚡ Set date range to 7 days`,
      action: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const toStr = d.toISOString().split('T')[0];
        const dFrom = new Date();
        dFrom.setDate(dFrom.getDate() - 7);
        const fromStr = dFrom.toISOString().split('T')[0];
        return { dateFrom: fromStr, dateTo: toStr };
      }
    });
  }

  if (rule.requiresSingleBrand) {
    const brandCount = filters.brands ? filters.brands.length : 0;
    if (brandCount !== 1) {
      const isCritical = !!rule.critical;
      status = isCritical ? "error" : (status === "error" ? "error" : "warning");
      messages.push(rule.critical || rule.warning || "Please select a single brand to analyze its items.");
      
      if (allBrands && allBrands.length > 0) {
        fixes.push({
          label: `⚡ Select "${allBrands[0]}"`,
          action: () => ({ brands: [allBrands[0]] })
        });
      }
    }
  }

  if (rule.noSingleBrand && filters.brands && filters.brands.length === 1) {
    status = "warning";
    messages.push(rule.warning);
    fixes.push({
      label: "⚡ Select all brands (Clear brand filter)",
      action: () => ({ brands: [] })
    });
  }

  if (rule.noSingleZone && filters.zones && filters.zones.length === 1) {
    status = "warning";
    messages.push(rule.warning);
    fixes.push({
      label: "⚡ Select all zones (Clear zone filter)",
      action: () => ({ zones: [] })
    });
  }

  if (rule.noSingleCity && filters.cities && filters.cities.length === 1) {
    status = "warning";
    messages.push(rule.warning);
    fixes.push({
      label: "⚡ Select all cities (Clear city filter)",
      action: () => ({ cities: [] })
    });
  }

  if (rule.noSingleArea && filters.areas && filters.areas.length === 1) {
    status = "warning";
    messages.push(rule.warning);
    fixes.push({
      label: "⚡ Select all areas (Clear area filter)",
      action: () => ({ areas: [] })
    });
  }

  if (rule.fixTime && (filters.timeFrom || filters.timeTo)) {
    status = status === "error" ? "error" : "warning";
    messages.push(rule.timeWarning || rule.narrowTimeWarning || "Time filter is set. It is recommended to analyze full 24-hour days.");
    fixes.push({
      label: "⚡ Clear time filters",
      action: () => ({ timeFrom: "", timeTo: "" })
    });
  }

  return { status, messages, fixes };
}

const optStyles = {
  container: (status) => {
    const isError = status === "error";
    const isWarning = status === "warning";
    return {
      background: isError ? "rgba(220, 53, 69, 0.04)" : isWarning ? "rgba(255, 193, 7, 0.04)" : "rgba(40, 167, 69, 0.04)",
      border: `1px solid ${isError ? "#dc3545" : isWarning ? "#ffc107" : "#28a745"}`,
      borderRadius: "12px",
      padding: "16px 20px",
      marginBottom: "20px",
      maxWidth: "900px",
      color: "#132664",
    };
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontWeight: "700",
    fontSize: "13px",
    marginBottom: "8px",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  icon: (status) => ({
    fontSize: "14px",
    color: status === "error" ? "#dc3545" : status === "warning" ? "#d39e00" : "#28a745",
  }),
  statusText: (status) => ({
    color: status === "error" ? "#dc3545" : status === "warning" ? "#d39e00" : "#28a745",
    textTransform: "uppercase",
    fontSize: "10px",
    fontWeight: "800",
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: status === "error" ? "rgba(220, 53, 69, 0.1)" : status === "warning" ? "rgba(255, 193, 7, 0.15)" : "rgba(40, 167, 69, 0.1)",
  }),
  list: {
    margin: "0 0 12px 0",
    paddingLeft: "18px",
    fontSize: "12.5px",
    lineHeight: "1.5",
    color: "rgba(19, 38, 100, 0.85)",
  },
  actionsRow: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  fixBtn: {
    backgroundColor: "#132664",
    color: "#ffffff",
    border: "none",
    borderRadius: "16px",
    padding: "5px 12px",
    fontSize: "11px",
    fontWeight: "700",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  optimizedText: {
    fontSize: "12.5px",
    color: "#28a745",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    gap: "6px"
  }
};

function highlightMatch(text, query) {
  if (!query) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <span>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() 
          ? <span key={i} style={{ backgroundColor: "#132664", color: "#ffffff", padding: "0 2px", borderRadius: "2px" }}>{part}</span> 
          : part
      )}
    </span>
  );
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function RatingsPage({ globalFilters, allBrands, masterData, onUpdateFilters }) {
  const [activeId,  setActiveId]  = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);

  // Command palette state
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedInsight, setSelectedInsight] = useState(null);

  // Default dashboard data
  const [defaultData, setDefaultData] = useState(null);
  const [loadingDefault, setLoadingDefault] = useState(false);

  // Download state
  const [showDownload, setShowDownload] = useState(false);
  const [getDownloadData, setGetDownloadData] = useState(null);

  // Reset download data on active change
  useEffect(() => {
    setGetDownloadData(null);
  }, [activeId, result]);

  const inputRef = useRef(null);
  const paletteRef = useRef(null);
  const dropdownRef = useRef(null);

  // Load default dashboard (Curefoods brand summaries)
  useEffect(() => {
    if (activeId === null) {
      setLoadingDefault(true);
      setError(null);
      Promise.all([
        INSIGHT_FN[1](globalFilters),  // Brand Rating
        INSIGHT_FN[22](globalFilters)  // Lightweight reviews data for overview calculations
      ])
        .then(([brandRatings, reviews]) => {
          setDefaultData({ brandRatings, reviews });
          setLoadingDefault(false);
        })
        .catch(err => {
          console.error("Failed to load default dashboard data:", err);
          setError("ERROR");
          setLoadingDefault(false);
        });
    }
  }, [globalFilters, activeId]);

  // Listen for global '/' key
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleSelect = async (id) => {
    if (loadingId) return;
    setLoadingId(id);
    setError(null);
    setResult(null);
    setActiveId(id);
    try {
      const fetchId = (id === 1 || id === 2 || id === 3 || id === 4) ? 22 : id;
      const data = await INSIGHT_FN[fetchId](globalFilters);
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

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setIsOpen(true);
    setHighlightedIndex(0);
    if (!selectedInsight || val !== selectedInsight.label) {
      setSelectedInsight(null);
    }
    if (val.trim() === "") {
      setResult(null);
      setActiveId(null);
    }
  };

  const handleOptionSelect = (item) => {
    setSelectedInsight(item);
    setSearchQuery(item.label);
    setIsOpen(false);
  };

  // Keyboard navigation inside options dropdown
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
        break;
      case "Enter":
        e.preventDefault();
        if (filteredOptions.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleOptionSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleApply = () => {
    let target = selectedInsight;
    if (!target) {
      target = INSIGHTS_LIST.find(item => item.label.toLowerCase() === searchQuery.toLowerCase());
    }
    if (target) {
      setSelectedInsight(target);
      setSearchQuery(target.label);
      setIsOpen(false);
      handleSelect(target.id);
    } else {
      alert("Please select a valid rating insight from the suggestion list.");
    }
  };

  // Filter options based on input query (show all if input matches selected label exactly)
  const isInputFullMatch = selectedInsight && searchQuery.toLowerCase() === selectedInsight.label.toLowerCase();
  const filteredOptions = INSIGHTS_LIST.filter(item => {
    if (isInputFullMatch || !searchQuery) return true;
    return (
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Auto-scroll highlighted list item into view inside suggestion box
  useEffect(() => {
    if (dropdownRef.current && isOpen) {
      const activeEl = dropdownRef.current.children[highlightedIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const paletteStyles = {
    wrapper: {
      position: "relative",
      width: "100%",
      maxWidth: "540px",
      marginBottom: "28px"
    },
    inputGroup: {
      display: "flex",
      alignItems: "center",
      gap: "10px"
    },
    input: {
      flex: 1,
      padding: "10px 18px",
      borderRadius: "24px",
      border: "2px solid #132664",
      color: "#132664",
      backgroundColor: "#ffffff",
      outline: "none",
      fontSize: "13px",
      fontWeight: "600"
    },
    applyBtn: {
      backgroundColor: loadingId ? "rgba(19, 38, 100, 0.5)" : "#132664",
      color: "#ffffff",
      border: "none",
      borderRadius: "24px",
      padding: "10px 24px",
      fontWeight: "700",
      fontSize: "13px",
      cursor: loadingId ? "not-allowed" : "pointer",
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    dropdown: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      marginTop: "8px",
      backgroundColor: "#ffffff",
      border: "2px solid #132664",
      borderRadius: "12px",
      maxHeight: "260px",
      overflowY: "auto",
      zIndex: 1001,
      boxShadow: "0 8px 24px rgba(19, 38, 100, 0.12)"
    },
    item: (isHighlighted) => ({
      padding: "10px 16px",
      cursor: "pointer",
      backgroundColor: isHighlighted ? "#132664" : "#ffffff",
      color: isHighlighted ? "#ffffff" : "#132664",
      fontWeight: "600",
      fontSize: "13px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      transition: "background-color 0.1s"
    }),
    badge: (isHighlighted) => ({
      fontSize: "9px",
      fontWeight: "800",
      padding: "2px 6px",
      borderRadius: "4px",
      letterSpacing: "0.5px",
      backgroundColor: isHighlighted ? "rgba(255, 255, 255, 0.2)" : "rgba(19, 38, 100, 0.05)",
      color: isHighlighted ? "#ffffff" : "rgba(19, 38, 100, 0.6)"
    })
  };

  return (
    <div style={s.page}>
      {/* ── COMMAND PALETTE SEARCH BAR WITH PARALLEL DOWNLOAD BUTTON ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: "900px", marginBottom: "28px", gap: "20px" }}>
        <div style={{ ...paletteStyles.wrapper, marginBottom: 0 }} ref={paletteRef}>
          <div style={paletteStyles.inputGroup}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search insights... (Press '/' to focus)"
              value={searchQuery}
              onChange={handleInputChange}
              onFocus={(e) => { 
                setIsOpen(true); 
                e.target.select(); 
              }}
              onClick={(e) => {
                setIsOpen(true);
                e.target.select();
              }}
              onKeyDown={handleKeyDown}
              style={paletteStyles.input}
            />
            <button 
              style={paletteStyles.applyBtn} 
              onClick={handleApply}
              disabled={loadingId !== null}
            >
              {loadingId ? "Calculating..." : "Apply"}
            </button>
          </div>

          {isOpen && filteredOptions.length > 0 && (
            <div style={paletteStyles.dropdown} ref={dropdownRef}>
              {filteredOptions.map((item, i) => {
                const isHighlighted = i === highlightedIndex;
                return (
                  <div
                    key={item.id}
                    style={paletteStyles.item(isHighlighted)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    onClick={() => handleOptionSelect(item)}
                  >
                    <div>
                      <span style={{ marginRight: "8px", opacity: 0.6 }}>{item.id}.</span>
                      {highlightMatch(item.label, searchQuery)}
                    </div>
                    <span style={paletteStyles.badge(isHighlighted)}>{item.category}</span>
                  </div>
                );
              })}
            </div>
          )}

          {isOpen && filteredOptions.length === 0 && (
            <div style={{ ...paletteStyles.dropdown, padding: "16px", color: "rgba(19, 38, 100, 0.6)", textAlign: "center", fontSize: "12px", fontWeight: "600" }}>
              No matching insights found.
            </div>
          )}
        </div>

        {/* Download Option Parallel to the End of the Search Insight Option */}
        {getDownloadData && (
          <button
            onClick={() => setShowDownload(true)}
            style={{
              backgroundColor: "transparent",
              border: "2px solid #132664",
              borderRadius: "24px",
              padding: "10px 24px",
              color: "#132664",
              fontWeight: "700",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              height: "42px",
              whiteSpace: "nowrap"
            }}
          >
            📥 Download Report
          </button>
        )}
      </div>

      {/* ── INSIGHT FILTER OPTIMIZER ── */}
      {(() => {
        const validation = validateFilters(activeId, globalFilters, allBrands);
        if (!validation) return null;

        const { status, messages, fixes } = validation;

        return (
          <div style={optStyles.container(status)}>
            <div style={optStyles.header}>
              <div style={optStyles.titleRow}>
                <span style={optStyles.icon(status)}>
                  {status === "error" ? "❌" : status === "warning" ? "⚠️" : "✨"}
                </span>
                <span>
                  {status === "error" 
                    ? "Critical Filter Adjustment Required" 
                    : status === "warning" 
                    ? "Filter Optimization Recommendations" 
                    : "Filters Optimized"}
                </span>
              </div>
              <span style={optStyles.statusText(status)}>
                {status}
              </span>
            </div>

            {messages.length > 0 ? (
              <>
                <ul style={optStyles.list}>
                  {messages.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
                {fixes.length > 0 && (
                  <div style={optStyles.actionsRow}>
                    {fixes.map((fix, i) => (
                      <button
                        key={i}
                        style={optStyles.fixBtn}
                        onClick={() => onUpdateFilters && onUpdateFilters(fix.action())}
                      >
                        {fix.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={optStyles.optimizedText}>
                <span>🟢</span>
                <span>Your filters are perfectly configured for this rating insight!</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── RESULT / DEFAULT DASHBOARD / ERROR PANELS ── */}
      <div style={{ marginTop: 12 }}>
        {error === "NO_DATA" && (
          <div style={s.error}>No rating/insights data matches the selected global filters.</div>
        )}
        {error === "RATE_LIMITED" && (
          <div style={s.error}>
            Rate limit reached. Please wait 60 seconds.
            <button style={s.retryBtn} onClick={() => (activeId === null ? setActiveId(null) : handleSelect(activeId))}>Retry Now</button>
          </div>
        )}
        {error === "ERROR" && (
          <div style={s.error}>
            Analytical service unavailable. Please retry.
            <button style={s.retryBtn} onClick={() => (activeId === null ? setActiveId(null) : handleSelect(activeId))}>Retry Now</button>
          </div>
        )}

        {activeId !== null && result && !error && (
          <InsightResult
            insightId={activeId}
            data={result}
            allBrands={allBrands}
            masterData={masterData}
            onRegisterDownload={setGetDownloadData}
            onClose={() => { setResult(null); setActiveId(null); setSearchQuery(""); }}
          />
        )}

        {/* Render default Curefoods dashboard when no insight is active */}
        {activeId === null && !error && (
          loadingDefault ? (
            <div style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "13px", color: "#132664", fontWeight: "600", padding: "20px 0" }}>
              <span style={{
                width: 14, height: 14, border: "2px solid #132664",
                borderTopColor: "transparent", borderRadius: "50%",
                animation: "spin 0.6s linear infinite"
              }} />
              <span>Loading Curefoods Brand Overview...</span>
            </div>
          ) : defaultData ? (
            <InsightResult
              insightId={null}
              data={defaultData}
              allBrands={allBrands}
              masterData={masterData}
              onRegisterDownload={setGetDownloadData}
              onClose={null}
            />
          ) : null
        )}
      </div>

      {showDownload && getDownloadData && (
        <DownloadDialog 
          dataSheets={getDownloadData()} 
          onClose={() => setShowDownload(false)} 
        />
      )}
    </div>
  );
}
