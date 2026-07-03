import React from "react";
import DefaultDashboard from "./insights/DefaultDashboard";
import BrandDashboard from "./insights/BrandDashboard";
import LocationMatrixAndSummary from "./insights/LocationMatrixAndSummary";
import CommentsInsight from "./insights/CommentsInsight";

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

  return null;
}
