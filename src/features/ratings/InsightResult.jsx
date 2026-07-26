import React from "react";
import DefaultDashboard from "./insights/DefaultDashboard";
import BrandDashboard from "./insights/BrandDashboard";
import LocationMatrixAndSummary from "./insights/LocationMatrixAndSummary";
import CommentsInsight from "./insights/CommentsInsight";
import GenericTableInsight from "./insights/GenericTableInsight";
import TextAIInsight from "./insights/TextAIInsight";

export { DownloadDialog } from "./insights/DownloadDialog";

export default function InsightResult({ insightId, data, onClose, allBrands, masterData, onRegisterDownload }) {
  if (!data) return null;

  // ── 0. Default Dashboard View (Landing page) ──────────────────
  if (insightId === null) {
    return <DefaultDashboard data={data} onClose={onClose} allBrands={allBrands} masterData={masterData} onRegisterDownload={onRegisterDownload} />;
  }

  // ── 1. Brand Level Rating (Comparison) ────────────────────────
  if (insightId === 1) {
    return <BrandDashboard reviews={data} onClose={onClose} allBrands={allBrands} masterData={masterData} onRegisterDownload={onRegisterDownload} />;
  }

  // ── 2. Zone Level Rating (Matrix Comparison) ─────────────────
  if (insightId === 2) {
    return <LocationMatrixAndSummary reviews={data} locationKey="zone" locationTitle="Zone" onClose={onClose} allBrands={allBrands} masterData={masterData} onRegisterDownload={onRegisterDownload} />;
  }

  // ── 3. City Level Rating (Matrix Comparison) ─────────────────
  if (insightId === 3) {
    return <LocationMatrixAndSummary reviews={data} locationKey="city" locationTitle="City" onClose={onClose} allBrands={allBrands} masterData={masterData} onRegisterDownload={onRegisterDownload} />;
  }

  // ── 4. Area Level Rating (Matrix Comparison) ─────────────────
  if (insightId === 4) {
    return <LocationMatrixAndSummary reviews={data} locationKey="area" locationTitle="Area" onClose={onClose} allBrands={allBrands} masterData={masterData} onRegisterDownload={onRegisterDownload} />;
  }

  // ── 21. Raw Reviews Data / Comments Insight ───────────────────
  if (insightId === 21) {
    return <CommentsInsight reviews={data} onClose={onClose} onRegisterDownload={onRegisterDownload} />;
  }

  // ── TIME INSIGHTS ─────────────────────────────────────────────
  if (insightId === 14) {
    return (
      <GenericTableInsight 
        title="Weekend vs Weekday Ratings" 
        columns={[
          { header: "Day Category", key: "name", bold: true },
          { header: "Average Rating", key: "avg", render: v => `${v}★` },
          { header: "Total Reviews", key: "count" }
        ]}
        data={data}
        onClose={onClose}
        searchField=""
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 15) {
    return (
      <GenericTableInsight 
        title="Peak Complaint Hours (Volume-wise)" 
        columns={[
          { header: "Hour of Day", key: "name", bold: true },
          { header: "Complaint Count (ratings <= 2★)", key: "count" },
          { header: "Peak Status", key: "worst", render: v => v ? "🔴 PEAK COMPLAINT HOUR" : "Normal" }
        ]}
        data={data}
        onClose={onClose}
        searchField="name"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 23) {
    return (
      <GenericTableInsight 
        title="Hourly Daypart Split" 
        columns={[
          { header: "Daypart Slot", key: "name", bold: true },
          { header: "Average Rating", key: "avg", render: v => `${v}★` },
          { header: "Total Reviews", key: "count" }
        ]}
        data={data}
        onClose={onClose}
        searchField=""
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 12) {
    return (
      <GenericTableInsight 
        title="Monthly Trends Comparison" 
        columns={[
          { header: "Month", key: "name", bold: true },
          { header: "Average Rating", key: "avg", render: v => `${v}★` }
        ]}
        data={data}
        onClose={onClose}
        searchField=""
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  // ── LOCATION INSIGHTS ─────────────────────────────────────────
  if (insightId === 26) {
    return (
      <GenericTableInsight 
        title="Best & Worst Brand per City" 
        columns={[
          { header: "City", key: "city", bold: true },
          { header: "Best Brand", key: "bestBrand" },
          { header: "Best Avg", key: "bestAvg", render: v => `${v}★` },
          { header: "Worst Brand", key: "worstBrand" },
          { header: "Worst Avg", key: "worstAvg", render: v => `${v}★` }
        ]}
        data={data}
        onClose={onClose}
        searchField="city"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 27) {
    return (
      <GenericTableInsight 
        title="Outlet vs Kitchen Average Gap" 
        columns={[
          { header: "Outlet ID", key: "outletId", bold: true },
          { header: "Area", key: "area" },
          { header: "Brand", key: "brand" },
          { header: "Outlet Avg", key: "outletAvg", render: v => `${v}★` },
          { header: "Kitchen Avg", key: "kitchenAvg", render: v => `${v}★` },
          { header: "Rating Gap", key: "gap", render: v => v > 0 ? `+${v}★` : `${v}★` },
          { header: "Status", key: "status" }
        ]}
        data={data}
        onClose={onClose}
        searchField="area"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 28) {
    return (
      <GenericTableInsight 
        title="Best Item per Outlet" 
        columns={[
          { header: "Outlet ID", key: "outletId", bold: true },
          { header: "Outlet Name (Area)", key: "name" },
          { header: "Best Item", key: "bestItem" },
          { header: "Item Rating", key: "rating", render: v => `${v}★` },
          { header: "Reviews Count", key: "count" }
        ]}
        data={data}
        onClose={onClose}
        searchField="name"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  // ── SKU INSIGHTS ──────────────────────────────────────────────
  if (insightId === 6 || insightId === 7 || insightId === 8 || insightId === 10) {
    const titleMap = {
      6: "SKU Leaderboard - Top Rated",
      7: "SKU Leaderboard - Worst Rated (Kill List)",
      8: "High Volume SKUs",
      10: "High Volume, Low Rating Areas"
    };
    return (
      <GenericTableInsight 
        title={titleMap[insightId]} 
        columns={[
          { header: insightId === 10 ? "Kitchen Area" : "Item Name", key: "name", bold: true },
          { header: "Average Rating", key: "avg", render: v => `${v}★` },
          { header: "Total Reviews", key: "count" }
        ]}
        data={data}
        onClose={onClose}
        searchField="name"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 29) {
    return (
      <GenericTableInsight 
        title="SKU Consistency (Variance Analysis)" 
        columns={[
          { header: "Item Name", key: "name", bold: true },
          { header: "Average Rating", key: "avg", render: v => `${v}★` },
          { header: "Reviews Count", key: "count" },
          { header: "Std Dev (Variance)", key: "stddev" },
          { header: "Consistency", key: "status" }
        ]}
        data={data}
        onClose={onClose}
        searchField="name"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  // ── PERFORMANCE INSIGHTS ──────────────────────────────────────
  if (insightId === 9) {
    return (
      <GenericTableInsight 
        title="Category Ratings Overview" 
        columns={[
          { header: "Product Category", key: "name", bold: true },
          { header: "Average Rating", key: "avg", render: v => `${v}★` },
          { header: "Total Reviews", key: "count" }
        ]}
        data={data}
        onClose={onClose}
        searchField="name"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 11) {
    return (
      <GenericTableInsight 
        title="Rating Star Distribution" 
        columns={[
          { header: "Star Rating", key: "name", bold: true },
          { header: "Count of Reviews", key: "count" },
          { header: "Percentage", key: "pct", render: v => `${v}%` }
        ]}
        data={data}
        onClose={onClose}
        searchField=""
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 17) {
    const blameData = [
      { name: "Kitchen Fault", count: data.kitchen, pct: Math.round(data.kitchen / (data.kitchen + data.delivery + data.packaging + data.other || 1) * 100) },
      { name: "Delivery Fault", count: data.delivery, pct: Math.round(data.delivery / (data.kitchen + data.delivery + data.packaging + data.other || 1) * 100) },
      { name: "Packaging Fault", count: data.packaging, pct: Math.round(data.packaging / (data.kitchen + data.delivery + data.packaging + data.other || 1) * 100) },
      { name: "Other / Unclear", count: data.other, pct: Math.round(data.other / (data.kitchen + data.delivery + data.packaging + data.other || 1) * 100) }
    ];
    return (
      <GenericTableInsight 
        title="AI Department Blame Split" 
        columns={[
          { header: "Fault Responsibility", key: "name", bold: true },
          { header: "Classified Complaints Count", key: "count" },
          { header: "Percentage", key: "pct", render: v => `${v}%` }
        ]}
        data={blameData}
        onClose={onClose}
        searchField=""
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 16 || insightId === 18 || insightId === 19 || insightId === 20) {
    const aiTitles = {
      16: "AI Repeat Complaint Finder",
      18: "AI Weekly Operations Brief",
      19: "AI Action Items Generator",
      20: "AI Packaging Issues Tracker"
    };
    return (
      <TextAIInsight 
        title={aiTitles[insightId]} 
        textContent={data} 
        onClose={onClose}
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  // ── ITEM-WISE INSIGHTS ────────────────────────────────────────
  if (insightId === 30) {
    return (
      <GenericTableInsight 
        title="Item Rating by City" 
        columns={[
          { header: "Item Name", key: "item", bold: true },
          { header: "City", key: "city" },
          { header: "Average Rating", key: "avg", render: v => `${v}★` },
          { header: "Reviews Count", key: "count" }
        ]}
        data={data}
        onClose={onClose}
        searchField="item"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 31) {
    return (
      <GenericTableInsight 
        title="Item Trend Over Time" 
        columns={[
          { header: "Item Name", key: "item", bold: true },
          { header: "Month", key: "month" },
          { header: "Average Rating", key: "avg", render: v => `${v}★` },
          { header: "Reviews Count", key: "count" }
        ]}
        data={data}
        onClose={onClose}
        searchField="item"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  if (insightId === 32) {
    return (
      <GenericTableInsight 
        title="Item vs Company Average Gap" 
        columns={[
          { header: "Item Name", key: "name", bold: true },
          { header: "Item Average", key: "avg", render: v => `${v}★` },
          { header: "Company Average", key: "companyAvg", render: v => `${v}★` },
          { header: "Rating Gap", key: "gap", render: v => v > 0 ? `+${v}★` : `${v}★` },
          { header: "Performance Status", key: "status" }
        ]}
        data={data}
        onClose={onClose}
        searchField="name"
        onRegisterDownload={onRegisterDownload}
      />
    );
  }

  return null;
}
