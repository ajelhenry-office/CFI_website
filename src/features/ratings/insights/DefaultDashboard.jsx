import { useEffect, useMemo } from "react";
import { C, cardStyle } from "../../../theme";

export const BRAND_COLORS = {
  cakezone: { bg: "#fce7f3", text: "#db2777" },
  eatfit: { bg: "#dcfce7", text: "#15803d" },
  "chaat street": { bg: "#fef9c3", text: "#a16207" },
  olio: { bg: "#ffedd5", text: "#c2410c" },
  ovenfresh: { bg: "#fee2e2", text: "#b91c1c" },
  "krispy kreme": { bg: "#d1fae5", text: "#047857" },
  lunchbox: { bg: "#fef3c7", text: "#b45309" },
  "firangi bake": { bg: "#ffe4e6", text: "#be123c" },
  "nomad pizza": { bg: "#fee2e2", text: "#991b1b" },
  default: { bg: "#f1f5f9", text: "#475569" },
};

export const brandColor = (name) => BRAND_COLORS[String(name || "").toLowerCase()] || BRAND_COLORS.default;

export default function DefaultDashboard({ data, allBrands, masterData, filters, onClose, onRegisterDownload }) {
  const reviews = data?.reviews || [];
  const brandRatings = data?.brandRatings || [];

  // Main Brands / Sub Brands counts come from the outlet directory (masterData),
  // scoped to the current filter — not from review activity. A selected sub-brand
  // with zero orders in the current date range still has exactly one real main
  // brand; deriving the count from `reviews` would wrongly fall back to the full
  // company total whenever there's no matching activity yet.
  const scopedOutlets = useMemo(() => {
    const md = masterData || [];
    return md.filter((r) =>
      (!filters?.brands?.length || filters.brands.includes(r.brand)) &&
      (!filters?.subBrands?.length || filters.subBrands.includes(r.subBrand)) &&
      (!filters?.cities?.length || filters.cities.includes(r.city)) &&
      (!filters?.zones?.length || filters.zones.includes(r.zone)) &&
      (!filters?.kitchens?.length || filters.kitchens.includes(r.kitchen))
    );
  }, [masterData, filters]);

  // Sub brand takes priority over Brand when both narrow to exactly one — it's the
  // more specific selection, and this also covers picking a sub-brand directly
  // without ever touching the Brand filter. Anything ambiguous (0 selected → company
  // view, 2+ selected → no single name makes sense) falls through to the two cases
  // below rather than guessing.
  const heroName =
    filters?.subBrands?.length === 1 ? filters.subBrands[0]
    : filters?.brands?.length === 1 ? filters.brands[0]
    : (!filters?.brands?.length && !filters?.subBrands?.length) ? "CUREFOODS"
    : null;

  const stats = useMemo(() => {
    const orders = new Map();
    reviews.forEach((r) => {
      // Keyed on restaurant_id+order_id, not order_id alone, matching the
      // backend's own dedupeByOrder() key — order_id isn't guaranteed unique
      // across different outlets.
      const key = `${r.restaurant_id}::${r.order_id}`;
      if (!orders.has(key)) orders.set(key, { ratings: [], hasComment: false });
      const g = orders.get(key);
      if (r.restaurant_rating) g.ratings.push(Number(r.restaurant_rating));
      if (r.has_comment) g.hasComment = true;
    });
    const orderAvgs = [];
    let totalFeedbacks = 0;
    let above = 0;
    let below = 0;
    orders.forEach((g) => {
      if (g.hasComment) totalFeedbacks++;
      if (!g.ratings.length) return;
      const avg = g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length;
      orderAvgs.push(avg);
      if (avg >= 4) above++;
      else below++;
    });
    const companyRating = orderAvgs.length ? orderAvgs.reduce((a, b) => a + b, 0) / orderAvgs.length : 0;

    // A sub_brand only counts here if it's actually distinct from its own main
    // brand — brands like Krispy Kreme or 99SLICE have sub_brand set equal to
    // brand_name (no real sub-brand concept), and those shouldn't inflate this
    // count. Only brands with genuinely different sub-brand identities (e.g.
    // CakeZone's "OvenFresh") contribute here.
    const realSubBrands = new Set(
      scopedOutlets.filter((r) => r.subBrand && r.subBrand !== r.brand).map((r) => r.subBrand)
    );

    return {
      companyRating,
      totalOrders: orders.size,
      totalOutlets: new Set(reviews.map((r) => r.restaurant_id)).size,
      totalBrandsCount: new Set(scopedOutlets.map((r) => r.brand)).size,
      totalSubBrandsCount: realSubBrands.size,
      totalFeedbacks,
      ratingsAbove4: above,
      ratingsBelow4: below,
    };
  }, [reviews, scopedOutlets]);

  const cards = [
    { title: "Main Brands", value: stats.totalBrandsCount, sub: "live in this scope" },
    { title: "Sub Brands", value: stats.totalSubBrandsCount, sub: "distinct sub-brands" },
    { title: "Outlets", value: stats.totalOutlets, sub: "kitchens reporting" },
    { title: "Orders", value: stats.totalOrders.toLocaleString(), sub: "unique orders rated" },
    { title: "Feedbacks", value: stats.totalFeedbacks.toLocaleString(), sub: "orders with comments" },
    { title: "Ratings Above 4★", value: stats.ratingsAbove4.toLocaleString(), sub: "healthy orders" },
    { title: "Ratings Below 4★", value: stats.ratingsBelow4.toLocaleString(), sub: "at-risk orders" },
  ];

  useEffect(() => {
    if (!onRegisterDownload) return;
    onRegisterDownload(() => [
      {
        sheetName: "Company Overview",
        rows: [
          { Metric: "Overall Company Rating", Value: stats.companyRating.toFixed(2), Detail: "mean of per-order averages" },
          ...cards.map((c) => ({ Metric: c.title, Value: c.value, Detail: c.sub })),
        ],
      },
      { sheetName: "Brand Ratings", rows: brandRatings },
    ]);
  }, [stats, brandRatings, onRegisterDownload]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ ...cardStyle, padding: "30px 24px", textAlign: "center", position: "relative" }}>
        {onClose && (
          <button
            onClick={onClose}
            style={{ position: "absolute", top: 14, right: 16, border: "none", background: "none", cursor: "pointer", color: C.muted }}
          >
            ✕
          </button>
        )}
        {heroName && (
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 1, color: C.primary }}>{heroName.toUpperCase()}</div>
        )}
        <div style={{ fontSize: 32, fontWeight: 900, color: C.primary, marginTop: 8 }}>
          ★ {stats.companyRating.toFixed(2)}
        </div>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: C.muted, marginTop: 6, fontWeight: 700 }}>
          Overall Company Rating
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.primary, marginBottom: 10 }}>Company Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {cards.map((c) => (
            <div key={c.title} style={{ ...cardStyle, padding: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.primary }}>{c.value}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.primary, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {c.title}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
