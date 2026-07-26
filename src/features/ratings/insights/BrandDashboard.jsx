import React, { useState, useEffect } from "react";

const C = { text: "#132664", bg: "#ffffff", border: "rgba(19, 38, 100, 0.15)" };

function Card({ children, style }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, color: C.text, boxShadow: "0 2px 8px rgba(19, 38, 100, 0.03)", ...style }}>
      {children}
    </div>
  );
}

export default function BrandDashboard({ reviews, onClose, allBrands = [], masterData = [], onRegisterDownload }) {
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;

  const orderBrandGroups = new Map();
  reviews.forEach(r => {
    const brand = r.brand_name ? String(r.brand_name).trim() : "";
    const orderId = r.order_id;
    if (!brand || !orderId) return;

    const key = `${orderId}::${brand}`;
    if (!orderBrandGroups.has(key)) {
      orderBrandGroups.set(key, { brand, ratings: [], hasFeedback: false });
    }
    const group = orderBrandGroups.get(key);
    if (r.restaurant_rating != null && !isNaN(Number(r.restaurant_rating))) {
      group.ratings.push(Number(r.restaurant_rating));
    }
    if (r.has_comment || (r.comments && r.comments.trim() !== "")) {
      group.hasFeedback = true;
    }
  });

  const brandGroupMap = new Map();
  orderBrandGroups.forEach(og => {
    if (!brandGroupMap.has(og.brand)) {
      brandGroupMap.set(og.brand, {
        brand: og.brand,
        ratings: [],
        ordersCount: 0,
        feedbacksCount: 0
      });
    }
    const g = brandGroupMap.get(og.brand);
    g.ordersCount += 1;
    if (og.hasFeedback) g.feedbacksCount += 1;

    if (og.ratings.length > 0) {
      const avgOrderRating = og.ratings.reduce((sum, r) => sum + r, 0) / og.ratings.length;
      g.ratings.push(avgOrderRating);
    }
  });

  const brandMetaMap = new Map();
  if (Array.isArray(masterData)) {
    masterData.forEach(row => {
      const brand = row.brand;
      if (!brand) return;
      if (!brandMetaMap.has(brand)) {
        brandMetaMap.set(brand, {
          brand: brand,
          zones: new Set(),
          cities: new Set(),
          areas: new Set(),
          outletsCount: 0
        });
      }
      const bMeta = brandMetaMap.get(brand);
      bMeta.outletsCount += 1;
      if (row.zone) bMeta.zones.add(row.zone);
      if (row.city) bMeta.cities.add(row.city);
      if (row.area) bMeta.areas.add(row.area);
    });
  }

  const displayBrands = (allBrands && allBrands.length > 0)
    ? allBrands
    : Array.from(new Set(reviews.map(r => r.brand_name).filter(Boolean))).sort();

  const brandSummaryRows = displayBrands.map(brandName => {
    const g = brandGroupMap.get(brandName);
    const bMeta = brandMetaMap.get(brandName);

    const zoneAbbrs = [];
    if (bMeta) {
      if (bMeta.zones.has("North")) zoneAbbrs.push("N");
      if (bMeta.zones.has("South")) zoneAbbrs.push("S");
      if (bMeta.zones.has("East")) zoneAbbrs.push("E");
      if (bMeta.zones.has("West")) zoneAbbrs.push("W");
    }
    const zonesStr = zoneAbbrs.join(", ") || "-";

    const citiesCount = bMeta ? bMeta.cities.size : 0;
    const areasCount = bMeta ? bMeta.areas.size : 0;
    const outletsCount = bMeta ? bMeta.outletsCount : 0;

    if (g) {
      const ratedOrdersCount = g.ratings.length;
      const avgRating = ratedOrdersCount ? +(g.ratings.reduce((sum, r) => sum + r, 0) / ratedOrdersCount).toFixed(2) : "-";
      const above4 = g.ratings.filter(r => r >= 4.0).length;
      const below4 = ratedOrdersCount - above4;
      return {
        brand: brandName,
        rating: avgRating === "-" ? "-" : `${avgRating}★`,
        zonesStr,
        citiesCount,
        areasCount,
        outletsCount,
        ordersCount: g.ordersCount,
        feedbacksCount: g.feedbacksCount,
        ratingsAbove4: above4,
        ratingsBelow4: below4
      };
    } else {
      return {
        brand: brandName,
        rating: "-",
        zonesStr,
        citiesCount,
        areasCount,
        outletsCount,
        ordersCount: 0,
        feedbacksCount: 0,
        ratingsAbove4: 0,
        ratingsBelow4: 0
      };
    }
  });

  brandSummaryRows.sort((a, b) => {
    if (a.rating === "-" && b.rating !== "-") return 1;
    if (a.rating !== "-" && b.rating === "-") return -1;
    if (a.rating !== "-" && b.rating !== "-") {
      const numA = Number(a.rating.replace("★", ""));
      const numB = Number(b.rating.replace("★", ""));
      return numB - numA;
    }
    return a.brand.localeCompare(b.brand);
  });

  const totalOrders = new Set(reviews.map(r => r.order_id).filter(Boolean)).size;

  const ratedAllOrders = [];
  orderBrandGroups.forEach(og => {
    if (og.ratings.length > 0) {
      ratedAllOrders.push(og.ratings.reduce((sum, r) => sum + r, 0) / og.ratings.length);
    }
  });
  const companyRating = ratedAllOrders.length ? +(ratedAllOrders.reduce((sum, r) => sum + r, 0) / ratedAllOrders.length).toFixed(2) : 0;
  
  const totalOutlets = new Set(reviews.map(r => r.restaurant_id).filter(Boolean)).size;

  const totalFeedbacks = new Set(
    reviews.filter(r => r.has_comment || (r.comments && r.comments.trim() !== ""))
           .map(r => r.order_id)
           .filter(Boolean)
  ).size;

  const ratingsAbove4 = ratedAllOrders.filter(r => r >= 4.0).length;
  const ratingsBelow4 = ratedAllOrders.length - ratingsAbove4;

  const totalRows = brandSummaryRows.length;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalRows);
  const paginatedRows = brandSummaryRows.slice(startIndex, endIndex);

  // Prepare Sheets for Download
  const getDownloadDataSheets = () => {
    const rows = brandSummaryRows.map(r => ({
      Brand: r.brand,
      Rating: r.rating,
      Zones: r.zonesStr,
      Cities: r.citiesCount,
      Areas: r.areasCount,
      Outlets: r.outletsCount,
      Orders: r.ordersCount,
      Feedbacks: r.feedbacksCount,
      "Above 4★": r.ratingsAbove4,
      "Below 4★": r.ratingsBelow4
    }));
    return [
      { sheetName: "Brand Summary", rows }
    ];
  };

  // Register callback to parent page
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
      {/* BRAND CARDS LIST */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: "800", color: "#132664", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>Brand Wise Ratings</h3>
          
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {onClose && (
              <button onClick={onClose} style={{ background: "none", border: "none", color: "#132664", fontSize: "18px", cursor: "pointer", fontWeight: "bold" }}>✕</button>
            )}
          </div>
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "12px" }}>
          {paginatedRows.map((b, i) => (
            <Card key={i} style={{ padding: "14px 10px", textAlign: "center", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ fontSize: "12px", fontWeight: "800", color: "#132664", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {b.brand}
              </div>
              <div style={{ fontSize: "13px", fontWeight: "800", color: "#132664" }}>
                {b.rating === "-" ? "-" : `★ ${b.rating}`}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* BRAND SUMMARY TABLE */}
      <Card style={{ padding: "24px" }}>
        <h3 style={{ fontSize: "14px", color: "#132664", marginBottom: "16px", fontWeight: "800" }}>Brand Summary</h3>
        
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
                  Brand (Frozen)
                </th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Rating</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Zones</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Cities</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Areas</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Outlets</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Orders</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Feedbacks</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>Above 4★</th>
                <th style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#f4f6fa", color: "#132664", fontWeight: "800", padding: "10px 12px", borderBottom: "2px solid rgba(19, 38, 100, 0.2)" }}>Below 4★</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, idx) => {
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
                      {row.brand}
                    </td>
                    <td style={{ 
                      padding: "8px 12px", 
                      fontWeight: "700", 
                      color: "#132664", 
                      borderBottom: row.rating !== "-" ? "1px solid rgba(19, 38, 100, 0.08)" : "1px solid transparent", 
                      borderRight: row.rating !== "-" ? "1px solid rgba(19, 38, 100, 0.08)" : "1px solid transparent",
                      backgroundColor: row.rating !== "-" ? "transparent" : "transparent"
                    }}>
                      {row.rating !== "-" ? row.rating : ""}
                    </td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)", whiteSpace: "nowrap" }}>{row.zonesStr}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.citiesCount}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.areasCount}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.outletsCount}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.ordersCount.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.feedbacksCount.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.ratingsAbove4.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)", fontWeight: row.ratingsBelow4 > 0 ? "700" : "500" }}>{row.ratingsBelow4.toLocaleString()}</td>
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
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{companyRating}★</td>
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{Array.from(new Set(masterData.map(r => r.zone).filter(Boolean))).length}</td>
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{Array.from(new Set(masterData.map(r => r.city).filter(Boolean))).length}</td>
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{Array.from(new Set(masterData.map(r => r.area).filter(Boolean))).length}</td>
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{totalOutlets}</td>
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{totalOrders.toLocaleString()}</td>
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{totalFeedbacks.toLocaleString()}</td>
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)", borderRight: "1px solid rgba(19, 38, 100, 0.08)" }}>{ratingsAbove4.toLocaleString()}</td>
                <td style={{ padding: "10px 12px", color: "#132664", borderTop: "1.5px solid rgba(19, 38, 100, 0.15)" }}>{ratingsBelow4.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", fontSize: "12px", fontWeight: "700", color: "#132664" }}>
            <span>Showing summary records {startIndex + 1}-{endIndex} of {totalRows} entries</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button 
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
                disabled={currentPage === 1}
                style={{
                  background: "none",
                  border: "1px solid #132664",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  color: "#132664",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  opacity: currentPage === 1 ? 0.4 : 1,
                  fontWeight: "800"
                }}
              >
                &larr; Prev
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} 
                disabled={currentPage === totalPages}
                style={{
                  background: "none",
                  border: "1px solid #132664",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  color: "#132664",
                  cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                  opacity: currentPage === totalPages ? 0.4 : 1,
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
