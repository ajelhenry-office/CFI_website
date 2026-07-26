// All data aggregation and AI calls have been moved to the Express backend
// to secure API keys and prevent downloading thousands of rows to the browser.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

async function fetchInsight(insightId, filters) {
  const res = await fetch(`${API_BASE}/api/insights/${insightId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters || {})
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch insight");
  }
  return res.json();
}

export const fetchBrandRating = (f) => fetchInsight(1, f);
export const fetchZoneRating = (f) => fetchInsight(2, f);
export const fetchCityRating = (f) => fetchInsight(3, f);
export const fetchKitchenRating = (f) => fetchInsight(4, f);
export const fetchPlatformComparison = (f) => fetchInsight(5, f);
export const fetchTopSKU = (f) => fetchInsight(6, f);
export const fetchWorstSKU = (f) => fetchInsight(7, f);
export const fetchBestSellingSKU = (f) => fetchInsight(8, f);
export const fetchCategoryRating = (f) => fetchInsight(9, f);
export const fetchHighVolumeLowRating = (f) => fetchInsight(10, f);
export const fetchStarDistribution = (f) => fetchInsight(11, f);
export const fetchMoMTrend = (f) => fetchInsight(12, f);
export const fetchVolumeVsRating = (f) => fetchInsight(13, f);
export const fetchWeekendVsWeekday = (f) => fetchInsight(14, f);
export const fetchPeakBadHours = (f) => fetchInsight(15, f);
export const fetchRepeatComplaints = (f) => fetchInsight(16, f);
export const fetchDeliveryVsKitchen = (f) => fetchInsight(17, f);
export const fetchWeeklyBrief = (f) => fetchInsight(18, f);
export const fetchActionItems = (f) => fetchInsight(19, f);
export const fetchPackagingIssues = (f) => fetchInsight(20, f);
export const fetchRawReviews = (f) => fetchInsight(21, f);
export const fetchLightweightReviews = (f) => fetchInsight(22, f);
export const fetchHourlyDaypartSplit = (f) => fetchInsight(23, f);
export const fetchBestWorstBrandCity = (f) => fetchInsight(26, f);
export const fetchOutletKitchenGap = (f) => fetchInsight(27, f);
export const fetchBestItemOutlet = (f) => fetchInsight(28, f);
export const fetchSKUConsistency = (f) => fetchInsight(29, f);
export const fetchItemRatingCity = (f) => fetchInsight(30, f);
export const fetchItemTrendTime = (f) => fetchInsight(31, f);
export const fetchItemCompanyGap = (f) => fetchInsight(32, f);
