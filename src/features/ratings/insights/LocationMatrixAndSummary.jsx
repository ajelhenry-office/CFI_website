import React, { useState, useEffect } from "react";

const C = { text: "#132664", bg: "#ffffff", border: "rgba(19, 38, 100, 0.15)" };

function Card({ children, style }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, color: C.text, boxShadow: "0 2px 8px rgba(19, 38, 100, 0.03)", ...style }}>
      {children}
    </div>
  );
}

const getCellBgColor = (rating) => {
  if (rating === null || rating === "-") return "transparent";
  const numRating = Number(rating);
  if (isNaN(numRating)) return "transparent";
  if (numRating >= 4.0) return "#132664"; // Good
  if (numRating >= 3.0) return "rgba(19, 38, 100, 0.45)"; // Average
  return "rgba(19, 38, 100, 0.12)"; // Poor
};

const getCellTextColor = (rating) => {
  if (rating === null || rating === "-") return "rgba(19, 38, 100, 0.3)";
  const numRating = Number(rating);
  if (isNaN(numRating)) return "rgba(19, 38, 100, 0.3)";
  if (numRating >= 4.0) return "#ffffff";
  return "#132664";
};

export default function LocationMatrixAndSummary({ reviews, locationKey, locationTitle, onClose, allBrands = [], masterData = [], onRegisterDownload }) {
  const [matrixPage, setMatrixPage] = useState(1);
  const [summaryPage, setSummaryPage] = useState(1);
  const PAGE_SIZE = 100;

  const brands = (allBrands && allBrands.length > 0)
    ? allBrands
    : Array.from(new Set(reviews.map(r => r.brand_name).filter(Boolean))).sort();

  const orderLocBrandGroups = new Map();
  reviews.forEach(r => {
    const loc = r[locationKey] ? String(r[locationKey]).trim() : "";
    const brand = r.brand_name ? String(r.brand_name).trim() : "";
    const orderId = r.order_id;
    if (!loc || !brand || !orderId) return;

    const key = `${orderId}::${loc}::${brand}`;
    if (!orderLocBrandGroups.has(key)) {
      orderLocBrandGroups.set(key, { loc, brand, ratings: [], hasFeedback: false });
    }
    const group = orderLocBrandGroups.get(key);
    if (r.restaurant_rating != null && !isNaN(Number(r.restaurant_rating))) {
      group.ratings.push(Number(r.restaurant_rating));
    }
    if (r.has_comment || (r.comments && r.comments.trim() !== "")) {
      group.hasFeedback = true;
    }
  });

  const locationStats = new Map();
  if (Array.isArray(masterData)) {
    masterData.forEach(row => {
      const loc = row[locationKey] ? String(row[locationKey]).trim() : "";
      if (loc && !locationStats.has(loc)) {
        locationStats.set(loc, { ratings: [], ordersCount: 0 });
      }
    });
  }

  const matrixMap = new Map();
  const summaryGroupMap = new Map();

  orderLocBrandGroups.forEach(og => {
    if (!locationStats.has(og.loc)) {
      locationStats.set(og.loc, { ratings: [], ordersCount: 0 });
    }
    const locStat = locationStats.get(og.loc);
    locStat.ordersCount += 1;

    if (!matrixMap.has(og.loc)) matrixMap.set(og.loc, new Map());
    const brandMap = matrixMap.get(og.loc);
    if (!brandMap.has(og.brand)) brandMap.set(og.brand, { sum: 0, count: 0 });
    const cell = brandMap.get(og.brand);

    const sumKey = `${og.loc}::${og.brand}`;
    if (!summaryGroupMap.has(sumKey)) {
      summaryGroupMap.set(sumKey, {
        location: og.loc,
        brand: og.brand,
        ratings: [],
        ordersCount: 0,
        feedbacksCount: 0
      });
    }
    const sumGroup = summaryGroupMap.get(sumKey);
    sumGroup.ordersCount += 1;
    if (og.hasFeedback) sumGroup.feedbacksCount += 1;

    if (og.ratings.length > 0) {
      const avgOrderRating = og.ratings.reduce((sum, r) => sum + r, 0) / og.ratings.length;
      locStat.ratings.push(avgOrderRating);
      cell.sum += avgOrderRating;
      cell.count += 1;
      sumGroup.ratings.push(avgOrderRating);
    }
  });
  
  const sortedLocations = Array.from(locationStats.entries())
    .map(([loc, stat]) => {
      const avg = stat.ratings.length ? +(stat.ratings.reduce((sum, r) => sum + r, 0) / stat.ratings.length).toFixed(2) : 0;
      return { name: loc, avg, count: stat.ordersCount };
    })
    .sort((a, b) => b.avg - a.avg);

  const getCellData = (loc, brand) => {
    const normLoc = loc ? String(loc).trim() : "";
    const normBrand = brand ? String(brand).trim() : "";
    const brandMap = matrixMap.get(normLoc);
    if (!brandMap) return null;
    const cell = brandMap.get(normBrand);
    if (!cell || cell.count === 0) return null;
    return +(cell.sum / cell.count).toFixed(2);
  };

  const combinationMetaMap = new Map();
  if (Array.isArray(masterData)) {
    masterData.forEach(row => {
      const loc = row[locationKey] ? String(row[locationKey]).trim() : "";
      const brand = row.brand ? String(row.brand).trim() : "";
      if (!loc || !brand) return;
      
      const key = `${loc}::${brand}`;
      if (!combinationMetaMap.has(key)) {
        combinationMetaMap.set(key, {
          location: loc,
          brand: brand,
          cities: new Set(),
          areas: new Set(),
          outletsCount: 0
        });
      }
      
      const meta = combinationMetaMap.get(key);
      meta.outletsCount += 1;
      if (row.city) meta.cities.add(String(row.city).trim());
      if (row.area) meta.areas.add(String(row.area).trim());
    });
  }

  const summaryRows = Array.from(combinationMetaMap.values()).map(meta => {
    const key = `${meta.location}::${meta.brand}`;
    const g = summaryGroupMap.get(key);

    const outletsCount = meta.outletsCount;
    const citiesCount = meta.cities.size;
    const areasCount = meta.areas.size;

    if (g) {
      const ratedOrdersCount = g.ratings.length;
      const avgRating = ratedOrdersCount ? +(g.ratings.reduce((sum, r) => sum + r, 0) / ratedOrdersCount).toFixed(2) : "-";
      const ratingsAbove4 = g.ratings.filter(r => r >= 4.0).length;
      const ratingsBelow4 = ratedOrdersCount - ratingsAbove4;
      
      return {
        location: meta.location,
        brand: meta.brand,
        rating: avgRating === "-" ? "-" : `${avgRating}★`,
        citiesCount,
        areasCount,
        outletsCount,
        ordersCount: g.ordersCount,
        feedbacksCount: g.feedbacksCount,
        ratingsAbove4,
        ratingsBelow4
      };
    } else {
      return {
        location: meta.location,
        brand: meta.brand,
        rating: "-",
        citiesCount,
        areasCount,
        outletsCount,
        ordersCount: 0,
        feedbacksCount: 0,
        ratingsAbove4: 0,
        ratingsBelow4: 0
      };
    }
  }).sort((a, b) => {
    if (locationKey === "zone") {
      const zoneOrder = { "north": 1, "south": 2, "east": 3, "west": 4 };
      const zoneA = a.location ? a.location.toLowerCase() : "";
      const zoneB = b.location ? b.location.toLowerCase() : "";
      const orderA = zoneOrder[zoneA] || 99;
      const orderB = zoneOrder[zoneB] || 99;
      if (orderA !== orderB) return orderA - orderB;
    } else {
      const locCompare = a.location.localeCompare(b.location);
      if (locCompare !== 0) return locCompare;
    }
    return a.brand.localeCompare(b.brand);
  });

  const totalMatrixRows = sortedLocations.length;
  const totalMatrixPages = Math.ceil(totalMatrixRows / PAGE_SIZE);
  const matrixStart = (matrixPage - 1) * PAGE_SIZE;
  const matrixEnd = Math.min(matrixStart + PAGE_SIZE, totalMatrixRows);
  const paginatedLocations = sortedLocations.slice(matrixStart, matrixEnd);

  const totalSummaryRows = summaryRows.length;
  const totalSummaryPages = Math.ceil(totalSummaryRows / PAGE_SIZE);
  const summaryStart = (summaryPage - 1) * PAGE_SIZE;
  const summaryEnd = Math.min(summaryStart + PAGE_SIZE, totalSummaryRows);
  const paginatedSummaryRows = summaryRows.slice(summaryStart, summaryEnd);

  const ratedAllOrders = [];
  orderLocBrandGroups.forEach(og => {
    if (og.ratings.length > 0) {
      ratedAllOrders.push(og.ratings.reduce((sum, r) => sum + r, 0) / og.ratings.length);
    }
  });
  const totalAvg = ratedAllOrders.length ? +(ratedAllOrders.reduce((sum, r) => sum + r, 0) / ratedAllOrders.length).toFixed(2) : "-";

  // Prepare Sheets Data for Download
  const getDownloadDataSheets = () => {
    const matrixRows = sortedLocations.map(loc => {
      const rowObj = { Location: loc.name };
      brands.forEach(brand => {
        const val = getCellData(loc.name, brand);
        rowObj[brand] = val !== null ? val : "-";
      });
      const locOrderRatings = [];
      orderLocBrandGroups.forEach(og => {
        if (og.loc === loc.name && og.ratings.length > 0) {
          locOrderRatings.push(og.ratings.reduce((sum, r) => sum + r, 0) / og.ratings.length);
        }
      });
      const locAvg = locOrderRatings.length ? +(locOrderRatings.reduce((sum, r) => sum + r, 0) / locOrderRatings.length).toFixed(2) : "-";
      rowObj["Grand Total"] = locAvg;
      return rowObj;
    });

    const summaryRowsData = summaryRows.map(r => {
      const rowObj = {
        Location: r.location,
        Brand: r.brand,
        Rating: r.rating,
        Outlets: r.outletsCount,
        Orders: r.ordersCount,
        Feedbacks: r.feedbacksCount,
        "Above 4★": r.ratingsAbove4,
        "Below 4★": r.ratingsBelow4
      };
      if (locationKey !== "city") rowObj["Cities"] = r.citiesCount;
      if (locationKey !== "area") rowObj["Areas"] = r.areasCount;
      return rowObj;
    });

    return [
      { sheetName: `${locationTitle} Matrix`, rows: matrixRows },
      { sheetName: `${locationTitle} Summary`, rows: summaryRowsData }
    ];
  };

  useEffect(() => {
    if (onRegisterDownload) {
      onRegisterDownload(() => getDownloadDataSheets);
    }
    return () => {
      if (onRegisterDownload) onRegisterDownload(null);
    };
  }, [reviews, masterData, onRegisterDownload]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "40px" }}>
      
      {/* MATRIX CARD WITH STICKY HEADERS */}
      <Card style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "16px" }}>
          <h3 style={{ fontSize: "15px", color: "#132664", fontWeight: "800", margin: 0 }}>{locationTitle} &times; Brand Rating Matrix</h3>
          
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "12px", fontSize: "10px", fontWeight: "700" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", backgroundColor: "#132664", display: "inline-block", borderRadius: "2px" }} />
                &ge; 4.0
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", backgroundColor: "rgba(19, 38, 100, 0.45)", display: "inline-block", borderRadius: "2px" }} />
                3.0 - 3.9
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", backgroundColor: "rgba(19, 38, 100, 0.12)", display: "inline-block", borderRadius: "2px" }} />
                &le; 2.9
              </span>
            </div>
            
            {onClose && (
              <button onClick={onClose} style={{ background: "none", border: "none", color: "#132664", fontSize: "18px", cursor: "pointer", fontWeight: "bold" }}>✕</button>
            )}
          </div>
        </div>

        <div style={{ maxHeight: "480px", overflow: "auto", position: "relative", border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: "8px" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "11px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f4f6fa" }}>
                <th style={{ 
                  position: "sticky", top: 0, left: 0, zIndex: 20, 
                  backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800",
                  padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap",
                  borderRight: "2.5px solid rgba(19, 38, 100, 0.2)",
                  borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)"
                }}>
                  Location (Frozen)
                </th>
                {brands.map(brand => (
                  <th key={brand} style={{ 
                    position: "sticky", top: 0, zIndex: 10,
                    backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800",
                    padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap",
                    borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)",
                    borderRight: "1px solid rgba(19, 38, 100, 0.1)"
                  }}>
                    {brand}
                  </th>
                ))}
                <th style={{ 
                  position: "sticky", top: 0, zIndex: 10,
                  backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800",
                  padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap",
                  borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)"
                }}>
                  Grand Total
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedLocations.map((loc, idx) => {
                const locOrderRatings = [];
                orderLocBrandGroups.forEach(og => {
                  if (og.loc === loc.name && og.ratings.length > 0) {
                    locOrderRatings.push(og.ratings.reduce((sum, r) => sum + r, 0) / og.ratings.length);
                  }
                });
                const locAvg = locOrderRatings.length ? +(locOrderRatings.reduce((sum, r) => sum + r, 0) / locOrderRatings.length).toFixed(2) : null;
                const rowBg = idx % 2 === 0 ? "#ffffff" : "rgba(19, 38, 100, 0.01)";

                return (
                  <tr style={{ backgroundColor: rowBg }} key={loc.name}>
                    <td style={{ 
                      position: "sticky", left: 0, zIndex: 9, 
                      backgroundColor: rowBg, color: "#132664", fontWeight: "700",
                      padding: "8px 12px", whiteSpace: "nowrap",
                      borderRight: "2.5px solid rgba(19, 38, 100, 0.2)",
                      borderBottom: "1px solid rgba(19, 38, 100, 0.08)"
                    }}>
                      {loc.name} <span style={{ fontWeight: "500", fontSize: "9px", color: "rgba(19, 38, 100, 0.5)", marginLeft: "4px" }}>({loc.count})</span>
                    </td>
                    {brands.map(brand => {
                      const cellVal = getCellData(loc.name, brand);
                      return (
                        <td 
                          key={brand} 
                          style={{ 
                            padding: "8px 12px", textAlign: "center", fontWeight: "700", 
                            backgroundColor: getCellBgColor(cellVal),
                            color: getCellTextColor(cellVal),
                            borderBottom: "1px solid rgba(19, 38, 100, 0.08)",
                            borderRight: "1px solid rgba(19, 38, 100, 0.08)"
                          }}
                        >
                          {cellVal !== null ? cellVal : "-"}
                        </td>
                      );
                    })}
                    <td style={{ 
                      padding: "8px 12px", textAlign: "center", fontWeight: "800", color: "#132664", 
                      backgroundColor: "rgba(19, 38, 100, 0.04)",
                      borderBottom: "1px solid rgba(19, 38, 100, 0.08)"
                    }}>
                      {locAvg !== null ? `${locAvg}★` : "-"}
                    </td>
                  </tr>
                );
              })}

              <tr style={{ backgroundColor: "#e8ebf5", fontWeight: "800" }}>
                <td style={{ 
                  position: "sticky", left: 0, zIndex: 9,
                  backgroundColor: "#e8ebf5", color: "#132664", fontWeight: "800",
                  padding: "10px 12px", whiteSpace: "nowrap",
                  borderRight: "2.5px solid rgba(19, 38, 100, 0.2)",
                  borderTop: "1.5px solid rgba(19, 38, 100, 0.15)"
                }}>
                  Grand Total
                </td>
                {brands.map(brand => {
                  const brandOrderRatings = [];
                  orderLocBrandGroups.forEach(og => {
                    if (og.brand === brand && og.ratings.length > 0) {
                      brandOrderRatings.push(og.ratings.reduce((sum, r) => sum + r, 0) / og.ratings.length);
                    }
                  });
                  const brandAvg = brandOrderRatings.length ? +(brandOrderRatings.reduce((sum, r) => sum + r, 0) / brandOrderRatings.length).toFixed(2) : null;
                  return (
                    <td key={brand} style={{ padding: "10px 12px", textAlign: "center", color: "#132664", borderRight: "1px solid rgba(19, 38, 100, 0.08)", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)" }}>
                      {brandAvg !== null ? brandAvg : "-"}
                    </td>
                  );
                })}
                <td style={{ padding: "10px 12px", textAlign: "center", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)" }}>
                  {totalAvg !== "-" ? `${totalAvg}★` : "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {totalMatrixPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", fontSize: "12px", fontWeight: "700", color: "#132664" }}>
            <span>Showing matrix rows {matrixStart + 1}-{matrixEnd} of {totalMatrixRows} locations</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button 
                onClick={() => setMatrixPage(p => Math.max(p - 1, 1))} 
                disabled={matrixPage === 1}
                style={{
                  background: "none",
                  border: "1px solid #132664",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  color: "#132664",
                  cursor: matrixPage === 1 ? "not-allowed" : "pointer",
                  opacity: matrixPage === 1 ? 0.4 : 1,
                  fontWeight: "800"
                }}
              >
                &larr; Prev
              </button>
              <span>Page {matrixPage} of {totalMatrixPages}</span>
              <button 
                onClick={() => setMatrixPage(p => Math.min(p + 1, totalMatrixPages))} 
                disabled={matrixPage === totalMatrixPages}
                style={{
                  background: "none",
                  border: "1px solid #132664",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  color: "#132664",
                  cursor: matrixPage === totalMatrixPages ? "not-allowed" : "pointer",
                  opacity: matrixPage === totalMatrixPages ? 0.4 : 1,
                  fontWeight: "800"
                }}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* SUMMARY TABLE CARD WITH STICKY HEADERS */}
      <Card style={{ padding: "24px" }}>
        <h3 style={{ fontSize: "14px", color: "#132664", marginBottom: "16px", fontWeight: "800" }}>{locationTitle} Summary</h3>
        
        <div style={{ maxHeight: "400px", overflow: "auto", position: "relative", border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: "8px" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "11px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f4f6fa" }}>
                <th style={{ 
                  position: "sticky", top: 0, left: 0, zIndex: 20, 
                  backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800",
                  padding: "10px 12px", textAlign: "left", whiteSpace: "nowrap",
                  borderRight: "2.5px solid rgba(19, 38, 100, 0.2)",
                  borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)"
                }}>
                  {locationTitle} (Frozen)
                </th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Brand</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Rating</th>
                {locationKey !== "city" && <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Cities</th>}
                {locationKey !== "area" && <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Areas</th>}
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Outlets</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Orders</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Feedbacks</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Above 4★</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)" }}>Below 4★</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSummaryRows.map((row, idx) => {
                const rowBg = idx % 2 === 0 ? "#ffffff" : "rgba(19, 38, 100, 0.01)";
                return (
                  <tr key={idx}>
                    <td style={{ 
                      position: "sticky", left: 0, zIndex: 9, 
                      backgroundColor: rowBg, color: "#132664", fontWeight: "700",
                      padding: "8px 12px", whiteSpace: "nowrap",
                      borderRight: "2.5px solid rgba(19, 38, 100, 0.2)",
                      borderBottom: "1px solid rgba(19, 38, 100, 0.08)"
                    }}>
                      {row.location}
                    </td>
                    <td style={{ padding: "8px 12px", fontWeight: "600", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.brand}</td>
                    <td style={{ padding: "8px 12px", fontWeight: "700", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.rating}</td>
                    {locationKey !== "city" && <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.citiesCount}</td>}
                    {locationKey !== "area" && <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.areasCount}</td>}
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.outletsCount}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.ordersCount.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.feedbacksCount.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.ratingsAbove4.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", fontWeight: row.ratingsBelow4 > 0 ? "700" : "500" }}>{row.ratingsBelow4.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalSummaryPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", fontSize: "12px", fontWeight: "700", color: "#132664" }}>
            <span>Showing summary records {summaryStart + 1}-{summaryEnd} of {totalSummaryRows} entries</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button 
                onClick={() => setSummaryPage(p => Math.max(p - 1, 1))} 
                disabled={summaryPage === 1}
                style={{
                  background: "none",
                  border: "1px solid #132664",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  color: "#132664",
                  cursor: summaryPage === 1 ? "not-allowed" : "pointer",
                  opacity: summaryPage === 1 ? 0.4 : 1,
                  fontWeight: "800"
                }}
              >
                &larr; Prev
              </button>
              <span>Page {summaryPage} of {totalSummaryPages}</span>
              <button 
                onClick={() => setSummaryPage(p => Math.min(p + 1, totalSummaryPages))} 
                disabled={summaryPage === totalSummaryPages}
                style={{
                  background: "none",
                  border: "1px solid #132664",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  color: "#132664",
                  cursor: summaryPage === totalSummaryPages ? "not-allowed" : "pointer",
                  opacity: summaryPage === totalSummaryPages ? 0.4 : 1,
                  fontWeight: "800"
                }}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
