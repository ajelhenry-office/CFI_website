import React, { useEffect } from "react";

const C = { text: "#132664", bg: "#ffffff", border: "rgba(19, 38, 100, 0.15)" };

const BRAND_COLORS = {
  cakezone: { bg: "#fce7f3", text: "#db2777" },       // Pink
  eatfit: { bg: "#dcfce7", text: "#15803d" },         // Green
  "chaat street": { bg: "#fef9c3", text: "#a16207" }, // Yellow
  olio: { bg: "#ffedd5", text: "#c2410c" },           // Orange
  ovenfresh: { bg: "#fee2e2", text: "#b91c1c" },       // Red
  "krispy kreme": { bg: "#d1fae5", text: "#047857" },  // Emerald
  lunchbox: { bg: "#fef3c7", text: "#b45309" },       // Gold
  "firangi bake": { bg: "#ffe4e6", text: "#be123c" },  // Rose
  "nomad pizza": { bg: "#fee2e2", text: "#991b1b" },   // Crimson
  default: { bg: "#f1f5f9", text: "#475569" }
};

function Card({ children, style }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, color: C.text, boxShadow: "0 2px 8px rgba(19, 38, 100, 0.03)", ...style }}>
      {children}
    </div>
  );
}

export default function DefaultDashboard({ data, onClose, allBrands = [], masterData = [], onRegisterDownload }) {
  const reviews = data.reviews || [];
  
  const orderGroups = new Map();
  reviews.forEach(r => {
    const orderId = r.order_id;
    if (!orderId) return;
    if (!orderGroups.has(orderId)) {
      orderGroups.set(orderId, { ratings: [], hasFeedback: false });
    }
    const group = orderGroups.get(orderId);
    if (r.restaurant_rating != null && !isNaN(Number(r.restaurant_rating))) {
      group.ratings.push(Number(r.restaurant_rating));
    }
    if (r.has_comment || (r.comments && r.comments.trim() !== "")) {
      group.hasFeedback = true;
    }
  });

  let companyRatingSum = 0;
  let companyRatingCount = 0;
  let ratingsAbove4 = 0;
  let totalFeedbacks = 0;

  orderGroups.forEach(og => {
    if (og.hasFeedback) totalFeedbacks += 1;
    if (og.ratings.length > 0) {
      const avgOrderRating = og.ratings.reduce((sum, r) => sum + r, 0) / og.ratings.length;
      companyRatingSum += avgOrderRating;
      companyRatingCount += 1;
      if (avgOrderRating >= 4.0) {
        ratingsAbove4 += 1;
      }
    }
  });

  const companyRating = companyRatingCount ? +(companyRatingSum / companyRatingCount).toFixed(2) : 0;
  const ratingsBelow4 = companyRatingCount - ratingsAbove4;
  const totalOrders = orderGroups.size;
  
  const totalOutlets = new Set(reviews.map(r => r.restaurant_id).filter(Boolean)).size;
  const totalBrandsCount = new Set(reviews.map(r => r.brand_name).filter(Boolean)).size;

  const displayBrands = (allBrands && allBrands.length > 0)
    ? allBrands
    : Array.from(new Set(reviews.map(r => r.brand_name).filter(Boolean))).sort();

  const statsList = [
    { title: "Brands", value: totalBrandsCount, color: "#132664", sub: "Registered entities" },
    { title: "Outlets", value: totalOutlets, color: "#132664", sub: "Operational hubs" },
    { title: "Orders", value: totalOrders.toLocaleString(), color: "#132664", sub: "Unique orders" },
    { title: "Feedbacks", value: totalFeedbacks.toLocaleString(), color: "#132664", sub: "Reviews with comments" },
    { title: "Ratings Above 4★", value: ratingsAbove4.toLocaleString(), color: "#132664", sub: "Excellent performance" },
    { title: "Ratings Below 4★", value: ratingsBelow4.toLocaleString(), color: "#132664", sub: "Requires intervention" }
  ];

  // Prepare Sheets for Download
  const getDownloadDataSheets = () => {
    const overviewRows = [
      { Metric: "Brands", Value: totalBrandsCount, Detail: "Active entities in range" },
      { Metric: "Outlets", Value: totalOutlets, Detail: "Operational active hubs" },
      { Metric: "Orders", Value: totalOrders, Detail: "Unique orders" },
      { Metric: "Feedbacks", Value: totalFeedbacks, Detail: "Reviews with comments" },
      { Metric: "Ratings Above 4★", Value: ratingsAbove4, Detail: "Excellent performance" },
      { Metric: "Ratings Below 4★", Value: ratingsBelow4, Detail: "Requires intervention" },
      { Metric: "Company Average Rating", Value: companyRating, Detail: "Out of 5.0" }
    ];

    const brandRatingsData = (data.brandRatings || []).map(b => ({
      Brand: b.name,
      Rating: b.avg,
      "Reviews Count": b.count
    }));

    return [
      { sheetName: "Company Overview", rows: overviewRows },
      { sheetName: "Brand Ratings", rows: brandRatingsData }
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
  }, [data, onRegisterDownload]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "10px" }}>
      {/* MAIN COMPANY CUREFOODS RATING */}
      <Card style={{ textAlign: "center", padding: "30px 24px", position: "relative" }}>
        <div style={{ position: "absolute", right: "20px", top: "20px" }}>
          {onClose && (
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#132664", fontSize: "18px", cursor: "pointer", fontWeight: "bold" }}>✕</button>
          )}
        </div>
        <h1 style={{ fontSize: "36px", letterSpacing: "1px", fontWeight: "900", color: "#132664", margin: "0 0 10px 0" }}>CUREFOODS</h1>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", margin: "0 auto" }}>
          <span style={{ color: "#132664", fontSize: "32px", fontWeight: "900" }}>★ {companyRating}</span>
        </div>
        <p style={{ color: "rgba(19, 38, 100, 0.6)", fontSize: "11px", fontWeight: "700", marginTop: "4px", textTransform: "uppercase" }}>Overall Company Rating</p>
      </Card>

      {/* STATS GRID */}
      <div>
        <h3 style={{ fontSize: "13px", fontWeight: "800", color: "#132664", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Company Overview</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "16px" }}>
          {statsList.map((stat, i) => (
            <div key={i} style={{ padding: "16px", border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: "12px", backgroundColor: "#ffffff" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "rgba(19, 38, 100, 0.6)" }}>{stat.title}</div>
              <div style={{ fontSize: "22px", fontWeight: "900", color: stat.color, margin: "6px 0 2px 0" }}>{stat.value}</div>
              <div style={{ fontSize: "10px", color: "rgba(19, 38, 100, 0.5)", fontWeight: "500" }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CUREFOODS BRANDS */}
      <div>
        <h3 style={{ fontSize: "13px", fontWeight: "800", color: "#132664", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Curefoods Brands</h3>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", paddingBottom: "4px" }}>
          {displayBrands.map((brandName, i) => {
            const color = BRAND_COLORS[brandName.toLowerCase()] || BRAND_COLORS.default;
            return (
              <div 
                key={i} 
                style={{ 
                  padding: "8px 16px", 
                  borderRadius: "20px", 
                  backgroundColor: color.bg, 
                  color: color.text, 
                  fontSize: "12px", 
                  fontWeight: "700",
                  display: "inline-flex",
                  alignItems: "center",
                  border: `1px solid ${color.text}33`
                }}
              >
                {brandName}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
