import { useEffect, useMemo, useState } from "react";
import { C, cardStyle } from "../../../theme";
import { wilsonLowerBound } from "../wilson";

const ZONE_ABBR = { North: "N", South: "S", East: "E", West: "W" };
const PAGE = 100;

export default function BrandDashboard({ reviews = [], onClose, allBrands = [], masterData = [], filters, onRegisterDownload }) {
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    // Scope the outlet directory to the active location/sub-brand filters
    // before counting kitchens per brand — otherwise a brand's "Kitchens"
    // count was always its company-wide total, ignoring e.g. an active zone
    // filter. Brand itself is left unfiltered here since brand is the row dimension
    // being broken out; which brands actually appear as rows is handled
    // separately below via `candidateBrands`.
    const scopedMaster = masterData.filter((m) =>
      (!filters?.subBrands?.length || filters.subBrands.includes(m.subBrand)) &&
      (!filters?.cities?.length || filters.cities.includes(m.city)) &&
      (!filters?.zones?.length || filters.zones.includes(m.zone)) &&
      (!filters?.kitchens?.length || filters.kitchens.includes(m.kitchen))
    );

    const orderMap = new Map();
    reviews.forEach((r) => {
      // restaurant_id, not just brand_name, disambiguates order_id collisions
      // across two different outlets of the same brand — matches the
      // backend's dedupeByOrder() key.
      const key = `${r.restaurant_id}::${r.order_id}::${r.brand_name}`;
      if (!orderMap.has(key)) orderMap.set(key, { brand: r.brand_name, ratings: [], hasComment: false });
      const g = orderMap.get(key);
      if (r.restaurant_rating) g.ratings.push(Number(r.restaurant_rating));
      if (r.has_comment) g.hasComment = true;
    });
    const brands = new Map();
    orderMap.forEach((g) => {
      if (!brands.has(g.brand)) brands.set(g.brand, { ordersCount: 0, feedbacksCount: 0, ratings: [], above: 0, below: 0 });
      const b = brands.get(g.brand);
      b.ordersCount++;
      if (g.hasComment) b.feedbacksCount++;
      if (g.ratings.length) {
        const avg = g.ratings.reduce((x, y) => x + y, 0) / g.ratings.length;
        b.ratings.push(avg);
        if (avg >= 4) b.above++;
        else b.below++;
      }
    });
    const meta = new Map();
    scopedMaster.forEach((m) => {
      if (!meta.has(m.brand)) meta.set(m.brand, { zones: new Set(), cities: new Set(), kitchens: new Set() });
      const x = meta.get(m.brand);
      x.zones.add(m.zone);
      x.cities.add(m.city);
      x.kitchens.add(m.kitchen);
    });
    // allBrands is the full company-wide brand list — only fall back to it
    // when no brand filter is active (so brands with zero reviews still show
    // up for comparison). With a brand filter active, showing every other
    // company brand here would be exactly the same bug as the kitchen counts:
    // supporting data ignoring the selected scope.
    const candidateBrands = filters?.brands?.length ? filters.brands : allBrands;
    const names = [...new Set([...candidateBrands, ...brands.keys()])];
    const out = names.map((name) => {
      const b = brands.get(name);
      const mt = meta.get(name) || { zones: new Set(), cities: new Set(), kitchens: new Set() };
      const avg = b && b.ratings.length ? b.ratings.reduce((x, y) => x + y, 0) / b.ratings.length : null;
      return {
        brand: name,
        avg,
        // b.above/b.ratings.length are already the positive/total counts
        // tracked above — Wilson score ranks brands by confidence-adjusted
        // rate rather than raw average, so a brand with only a handful of
        // orders can't out-rank one with a large, well-evidenced sample just
        // because its small sample happened to land high.
        wilson: b && b.ratings.length ? wilsonLowerBound(b.above, b.ratings.length) : null,
        count: b?.ratings.length || 0,
        zones: [...mt.zones].map((z) => ZONE_ABBR[z] || z).join(", ") || "-",
        cities: mt.cities.size,
        kitchens: mt.kitchens.size,
        orders: b?.ordersCount || 0,
        feedbacks: b?.feedbacksCount || 0,
        above: b?.above || 0,
        below: b?.below || 0,
      };
    });
    const rated = out.filter((r) => r.avg !== null).sort((a, b) => (b.wilson ?? -1) - (a.wilson ?? -1) || b.count - a.count);
    const unrated = out.filter((r) => r.avg === null).sort((a, b) => a.brand.localeCompare(b.brand));
    return [...rated, ...unrated];
  }, [reviews, allBrands, masterData, filters]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          orders: a.orders + r.orders,
          feedbacks: a.feedbacks + r.feedbacks,
          above: a.above + r.above,
          below: a.below + r.below,
        }),
        { orders: 0, feedbacks: 0, above: 0, below: 0 },
      ),
    [rows],
  );

  useEffect(() => {
    if (!onRegisterDownload) return;
    onRegisterDownload(() => [
      {
        sheetName: "Brand Summary",
        rows: rows.map((r) => ({
          Brand: r.brand,
          Rating: r.avg === null ? "-" : r.avg.toFixed(2),
          Zones: r.zones,
          Cities: r.cities,
          Kitchens: r.kitchens,
          Orders: r.orders,
          Feedbacks: r.feedbacks,
          "Above 4★": r.above,
          "Below 4★": r.below,
        })),
      },
    ]);
  }, [rows, onRegisterDownload]);

  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const th = {
    backgroundColor: C.headerBg,
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 800,
    fontSize: 11.5,
    color: C.primary,
    position: "sticky",
    top: 0,
    zIndex: 10,
    borderBottom: `2.5px solid rgba(19,38,100,0.2)`,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>Brand Ratings</div>
          {onClose && (
            <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted }}>
              ✕
            </button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
          {pageRows.map((r) => (
            <div key={r.brand} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.brand}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.primary, marginTop: 6 }}>
                ★ {r.avg === null ? "—" : r.avg.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginBottom: 12 }}>Brand Summary</div>
        <div style={{ maxHeight: 400, overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...th, position: "sticky", left: 0, zIndex: 20, borderRight: `2.5px solid rgba(19,38,100,0.2)` }}>Brand</th>
                {["Rating", "Zones", "Cities", "Kitchens", "Orders", "Feedbacks", "Above 4★", "Below 4★"].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => {
                const bg = i % 2 === 0 ? "#ffffff" : "#f7f8fc";
                return (
                  <tr key={r.brand} style={{ backgroundColor: bg }}>
                    <td style={{ padding: "9px 12px", fontWeight: 800, color: C.primary, position: "sticky", left: 0, zIndex: 9, backgroundColor: bg, borderRight: `2.5px solid rgba(19,38,100,0.2)`, whiteSpace: "nowrap" }}>
                      {r.brand}
                    </td>
                    {[r.avg === null ? "—" : r.avg.toFixed(2), r.zones, r.cities, r.kitchens, r.orders, r.feedbacks, r.above, r.below].map((v, vi) => (
                      <td key={vi} style={{ padding: "9px 12px", color: C.text, borderBottom: `1px solid ${C.borderSoft}` }}>
                        {v}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr style={{ backgroundColor: "#e8ebf5", fontWeight: 800 }}>
                <td style={{ padding: "10px 12px", position: "sticky", left: 0, zIndex: 9, backgroundColor: "#e8ebf5", borderRight: `2.5px solid rgba(19,38,100,0.2)`, color: C.primary }}>
                  Grand Total
                </td>
                <td style={{ padding: "10px 12px", color: C.primary }}>—</td>
                <td style={{ padding: "10px 12px", color: C.primary }}>—</td>
                <td style={{ padding: "10px 12px", color: C.primary }}>—</td>
                <td style={{ padding: "10px 12px", color: C.primary }}>—</td>
                <td style={{ padding: "10px 12px", color: C.primary }}>{totals.orders}</td>
                <td style={{ padding: "10px 12px", color: C.primary }}>{totals.feedbacks}</td>
                <td style={{ padding: "10px 12px", color: C.primary }}>{totals.above}</td>
                <td style={{ padding: "10px 12px", color: C.primary }}>{totals.below}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
