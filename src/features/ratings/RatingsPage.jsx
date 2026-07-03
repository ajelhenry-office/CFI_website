import React, { useState, useEffect, useRef } from "react";
import InsightResult, { DownloadDialog } from "./InsightResult";
import * as api from "./ratingsApi";

const INSIGHT_FN = {
  1:  api.fetchBrandRating,
  2:  api.fetchZoneRating,
  3:  api.fetchCityRating,
  4:  api.fetchKitchenRating,
  21: api.fetchRawReviews,
  22: api.fetchLightweightReviews,
};

const INSIGHTS_LIST = [
  { id: 1, label: "Brand Level Rating", category: "PERFORMANCE" },
  { id: 2, label: "Zone Level Rating", category: "PERFORMANCE" },
  { id: 3, label: "City Level Rating", category: "PERFORMANCE" },
  { id: 4, label: "Area Level Rating", category: "PERFORMANCE" },
  { id: 21, label: "Comments Insight", category: "RAW DATA" }
];

const s = {
  page:    { padding: "32px 40px", overflowY: "auto", height: "100%", boxSizing: "border-box", color: "#132664", backgroundColor: "#ffffff" },
  error:   { background: "rgba(19, 38, 100, 0.03)", border: "1px solid #132664", borderRadius: 12, padding: "16px 20px", color: "#132664", fontSize: 13, display: "flex", alignItems: "center", gap: 12, marginBottom: 16, fontWeight: "600" },
  retryBtn:{ background: "#132664", border: "none", borderRadius: 18, padding: "6px 14px", color: "#ffffff", fontSize: 11, fontWeight: "700", cursor: "pointer" },
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

export default function RatingsPage({ globalFilters, allBrands, masterData }) {
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
