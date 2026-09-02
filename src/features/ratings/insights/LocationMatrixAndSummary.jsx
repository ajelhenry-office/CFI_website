import { useEffect, useMemo } from "react";
import { C, cardStyle } from "../../../theme";
import { wilsonLowerBound } from "../wilson";

const ZONE_ORDER = { North: 1, South: 2, East: 3, West: 4 };

// Exactly two bands, no middle tier: >= 4 is positive, anything below 4 is
// negative — matches the "Above/Below 4★" split used everywhere else in the
// Ratings tab (Company Overview, Brand Summary, etc.), so a rating is never
// green in one place and amber in another.
const cellStyle = (avg) => {
  if (avg === null || avg === undefined) return { backgroundColor: "transparent", color: C.primary };
  if (avg >= 4) return { backgroundColor: C.ok, color: "#ffffff" };
  return { backgroundColor: C.danger, color: "#ffffff" };
};

export default function LocationMatrixAndSummary({
  reviews = [],
  locationKey,
  locationTitle,
  onClose,
  masterData = [],
  filters,
  onRegisterDownload,
}) {
  const { locations, brandList, grandTotal, summary, useSubBrand } = useMemo(() => {
    // masterData is the full, company-wide outlet directory — scope it to the
    // active filters first, the same way the reviews themselves are already
    // scoped server-side.
    const scopedMaster = masterData.filter((m) =>
      (!filters?.brands?.length || filters.brands.includes(m.brand)) &&
      (!filters?.subBrands?.length || filters.subBrands.includes(m.subBrand)) &&
      (!filters?.cities?.length || filters.cities.includes(m.city)) &&
      (!filters?.zones?.length || filters.zones.includes(m.zone)) &&
      (!filters?.kitchens?.length || filters.kitchens.includes(m.kitchen))
    );

    // Which identity the matrix groups by follows which filter the user
    // actually touched: leaving Sub brand on "All" means main-brand
    // ratings (regardless of what's in the Brand filter); explicitly
    // narrowing Sub brand switches the matrix to sub-brand ratings. Brand no
    // longer auto-fills Sub brand (GlobalFilters.jsx), so this is now purely
    // "did the user pick specific sub-brands," not "does sub-brand data
    // technically exist."
    const useSubBrand = (filters?.subBrands || []).length > 0;
    const brandLabel = (r) => (useSubBrand ? r.sub_brand : r.brand_name);

    const orders = new Map();
    reviews.forEach((r) => {
      const loc = r[locationKey];
      const label = brandLabel(r);
      const key = `${r.restaurant_id}::${r.order_id}::${loc}::${label}`;
      if (!orders.has(key)) orders.set(key, { loc, brand: label, ratings: [], hasComment: false });
      const g = orders.get(key);
      if (r.restaurant_rating) g.ratings.push(Number(r.restaurant_rating));
      if (r.has_comment) g.hasComment = true;
    });

    // matrixMap: loc -> brand -> { sum, count }. `sum` is a sum of per-order
    // averages and `count` is a count of orders, so sum/count at ANY level —
    // one cell, a whole row, a whole column, or the grand total — is always
    // the same weighted-by-orders formula. That's what makes every rollup
    // reconcile with the numbers under it instead of drifting from them:
    // a row's Avg is the sum of its cells' sums over the sum of its cells'
    // counts, never an unweighted mean of the cell averages themselves.
    const matrixMap = new Map();
    const summaryMap = new Map();
    const brandSet = new Set();
    orders.forEach((g) => {
      const avg = g.ratings.length ? g.ratings.reduce((x, y) => x + y, 0) / g.ratings.length : null;
      brandSet.add(g.brand);
      if (!matrixMap.has(g.loc)) matrixMap.set(g.loc, new Map());
      const brands = matrixMap.get(g.loc);
      if (!brands.has(g.brand)) brands.set(g.brand, { sum: 0, count: 0, positive: 0 });
      if (avg !== null) {
        const cell = brands.get(g.brand);
        cell.sum += avg;
        cell.count++;
        if (avg >= 4) cell.positive++;
      }
      const sk = `${g.loc}|||${g.brand}`;
      if (!summaryMap.has(sk)) summaryMap.set(sk, { loc: g.loc, brand: g.brand, ratings: [], orders: 0, feedbacks: 0 });
      const s = summaryMap.get(sk);
      s.orders++;
      if (g.hasComment) s.feedbacks++;
      if (avg !== null) s.ratings.push(avg);
    });

    const brands = [...brandSet].filter(Boolean).sort();

    const geo = new Map();
    scopedMaster.forEach((m) => {
      const k = `${m[locationKey]}|||${useSubBrand ? m.subBrand : m.brand}`;
      // No separate outlet count — one outlet is one kitchen in this data
      // model, so it was just a duplicate of the Kitchens column.
      if (!geo.has(k)) geo.set(k, { cities: new Set(), kitchens: new Set() });
      const x = geo.get(k);
      x.cities.add(m.city);
      x.kitchens.add(m.kitchen);
    });

    const locs = [...matrixMap.entries()]
      .map(([name, brandCells]) => {
        let totalSum = 0;
        let totalCount = 0;
        let totalPositive = 0;
        const cellMap = {};
        for (const b of brands) {
          const v = brandCells.get(b);
          if (v && v.count) {
            cellMap[b] = { avg: v.sum / v.count, count: v.count };
            totalSum += v.sum;
            totalCount += v.count;
            totalPositive += v.positive;
          } else {
            cellMap[b] = { avg: null, count: 0 };
          }
        }
        return {
          name,
          cellMap,
          avg: totalCount ? totalSum / totalCount : null,
          count: totalCount,
          wilson: totalCount ? wilsonLowerBound(totalPositive, totalCount) : null,
        };
      })
      // Zone always keeps its fixed geographic order. City/Kitchen rank by
      // Wilson score, not raw avg — a location with only a handful of orders
      // shouldn't be able to out-rank one with a large, well-evidenced
      // sample just because its small sample happened to land high.
      .sort((a, b) =>
        locationKey === "zone"
          ? (ZONE_ORDER[a.name] || 9) - (ZONE_ORDER[b.name] || 9)
          : (b.wilson ?? -1) - (a.wilson ?? -1) || b.count - a.count,
      );

    // Same weighted sum/count rollup, read the other way: down each brand
    // column across every location, then across the whole matrix for the
    // single bottom-right grand total.
    const colTotals = {};
    let grandSum = 0;
    let grandCount = 0;
    for (const b of brands) {
      let sum = 0;
      let count = 0;
      for (const [, brandCells] of matrixMap) {
        const v = brandCells.get(b);
        if (v && v.count) {
          sum += v.sum;
          count += v.count;
        }
      }
      colTotals[b] = { avg: count ? sum / count : null, count };
      grandSum += sum;
      grandCount += count;
    }
    const grand = { cols: colTotals, avg: grandCount ? grandSum / grandCount : null, count: grandCount };

    const summaryRows = [...summaryMap.values()]
      .map((s) => {
        const g = geo.get(`${s.loc}|||${s.brand}`) || { cities: new Set(), kitchens: new Set() };
        const avg = s.ratings.length ? s.ratings.reduce((x, y) => x + y, 0) / s.ratings.length : null;
        return {
          loc: s.loc,
          brand: s.brand,
          avg,
          cities: g.cities.size,
          kitchens: g.kitchens.size,
          orders: s.orders,
          feedbacks: s.feedbacks,
          above: s.ratings.filter((r) => r >= 4).length,
          below: s.ratings.filter((r) => r < 4).length,
        };
      })
      .sort((a, b) => {
        const la = locationKey === "zone" ? (ZONE_ORDER[a.loc] || 9) - (ZONE_ORDER[b.loc] || 9) : a.loc.localeCompare(b.loc);
        return la !== 0 ? la : a.brand.localeCompare(b.brand);
      });

    return { locations: locs, brandList: brands, grandTotal: grand, summary: summaryRows, useSubBrand };
  }, [reviews, locationKey, masterData, filters]);

  useEffect(() => {
    if (!onRegisterDownload) return;
    onRegisterDownload(() => [
      {
        sheetName: `${locationTitle} Matrix`,
        rows: [
          ...locations.map((l) => {
            const row = { [locationTitle]: l.name, Feedbacks: l.count };
            brandList.forEach((b) => {
              row[b] = l.cellMap[b].avg === null ? "" : Number(l.cellMap[b].avg.toFixed(2));
            });
            row["Avg"] = l.avg === null ? "" : Number(l.avg.toFixed(2));
            return row;
          }),
          {
            [locationTitle]: "Grand Total",
            Feedbacks: grandTotal.count,
            ...Object.fromEntries(
              brandList.map((b) => [b, grandTotal.cols[b].avg === null ? "" : Number(grandTotal.cols[b].avg.toFixed(2))]),
            ),
            Avg: grandTotal.avg === null ? "" : Number(grandTotal.avg.toFixed(2)),
          },
        ],
      },
      {
        sheetName: `${locationTitle} Summary`,
        rows: summary.map((s) => ({
          [locationTitle]: s.loc,
          [useSubBrand ? "Sub Brand" : "Brand"]: s.brand,
          Rating: s.avg === null ? "-" : s.avg.toFixed(2),
          Cities: s.cities,
          Kitchens: s.kitchens,
          Orders: s.orders,
          Feedbacks: s.feedbacks,
          "Above 4★": s.above,
          "Below 4★": s.below,
        })),
      },
    ]);
  }, [locations, brandList, grandTotal, summary, locationTitle, useSubBrand, onRegisterDownload]);

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
  const headers = [useSubBrand ? "Sub Brand" : "Brand", "Rating"]
    .concat(locationKey !== "city" ? ["Cities"] : [])
    .concat(locationKey !== "kitchen" ? ["Kitchens"] : [])
    .concat(["Orders", "Feedbacks", "Above 4★", "Below 4★"]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>{locationTitle} × {useSubBrand ? "Sub Brand" : "Brand"} Ratings</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {[
              ["≥ 4.0", 4.2],
              ["< 4.0", 3.4],
            ].map(([label, v]) => (
              <span key={label} style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 20, ...cellStyle(v) }}>
                {label}
              </span>
            ))}
            {onClose && (
              <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted }}>
                ✕
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>1 unique order = 1 feedback</div>
        <div style={{ overflow: "auto", maxHeight: 600, marginTop: 16 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...th, position: "sticky", left: 0, zIndex: 20, borderRight: `2.5px solid rgba(19,38,100,0.2)` }}>
                  {locationTitle}
                </th>
                {brandList.map((b) => (
                  <th key={b} style={{ ...th, textAlign: "center" }}>
                    {b}
                  </th>
                ))}
                <th style={{ ...th, textAlign: "center", borderLeft: `2.5px solid rgba(19,38,100,0.2)` }}>Avg</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((l, i) => {
                const bg = i % 2 === 0 ? "#ffffff" : "#f7f8fc";
                return (
                  <tr key={l.name}>
                    <td
                      style={{
                        padding: "10px 14px",
                        position: "sticky",
                        left: 0,
                        zIndex: 9,
                        backgroundColor: bg,
                        borderRight: `2.5px solid rgba(19,38,100,0.2)`,
                        borderBottom: `1px solid ${C.borderSoft}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div style={{ fontWeight: 800, color: C.primary }}>{l.name}</div>
                      <div style={{ fontSize: 10.5, color: C.muted }}>{l.count.toLocaleString()} fb</div>
                    </td>
                    {brandList.map((b) => {
                      const c = l.cellMap[b];
                      return (
                        <td key={b} style={{ padding: "8px 10px", textAlign: "center", backgroundColor: bg, borderBottom: `1px solid ${C.borderSoft}` }}>
                          <span style={{ display: "inline-block", minWidth: 56, padding: "5px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700, ...cellStyle(c.avg) }}>
                            {c.avg === null ? "—" : c.avg.toFixed(2)}
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ padding: "8px 10px", textAlign: "center", backgroundColor: bg, borderLeft: `2.5px solid rgba(19,38,100,0.2)`, borderBottom: `1px solid ${C.borderSoft}` }}>
                      <span style={{ display: "inline-block", minWidth: 56, padding: "5px 8px", borderRadius: 8, fontSize: 12.5, fontWeight: 800, ...cellStyle(l.avg) }}>
                        {l.avg === null ? "—" : l.avg.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td
                  style={{
                    padding: "10px 14px",
                    position: "sticky",
                    left: 0,
                    zIndex: 9,
                    backgroundColor: "#e8ebf5",
                    borderRight: `2.5px solid rgba(19,38,100,0.2)`,
                    borderTop: `2px solid rgba(19,38,100,0.25)`,
                    whiteSpace: "nowrap",
                  }}
                >
                  <div style={{ fontWeight: 800, color: C.primary }}>Grand Total</div>
                  <div style={{ fontSize: 10.5, color: C.muted }}>{grandTotal.count.toLocaleString()} fb</div>
                </td>
                {brandList.map((b) => {
                  const c = grandTotal.cols[b];
                  return (
                    <td key={b} style={{ padding: "8px 10px", textAlign: "center", backgroundColor: "#e8ebf5", borderTop: `2px solid rgba(19,38,100,0.25)` }}>
                      <span style={{ display: "inline-block", minWidth: 56, padding: "5px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700, ...cellStyle(c.avg) }}>
                        {c.avg === null ? "—" : c.avg.toFixed(2)}
                      </span>
                    </td>
                  );
                })}
                <td style={{ padding: "8px 10px", textAlign: "center", backgroundColor: "#e8ebf5", borderLeft: `2.5px solid rgba(19,38,100,0.2)`, borderTop: `2px solid rgba(19,38,100,0.25)` }}>
                  <span style={{ display: "inline-block", minWidth: 56, padding: "5px 8px", borderRadius: 8, fontSize: 12.5, fontWeight: 800, ...cellStyle(grandTotal.avg) }}>
                    {grandTotal.avg === null ? "—" : grandTotal.avg.toFixed(2)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, marginBottom: 12 }}>{locationTitle} Summary</div>
        <div style={{ maxHeight: 400, overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...th, position: "sticky", left: 0, zIndex: 20, borderRight: `2.5px solid rgba(19,38,100,0.2)` }}>{locationTitle}</th>
                {headers.map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.slice(0, 100).map((s, i) => {
                const bg = i % 2 === 0 ? "#ffffff" : "#f7f8fc";
                const values = [s.brand, s.avg === null ? "—" : s.avg.toFixed(2)]
                  .concat(locationKey !== "city" ? [s.cities] : [])
                  .concat(locationKey !== "kitchen" ? [s.kitchens] : [])
                  .concat([s.orders, s.feedbacks, s.above, s.below]);
                return (
                  <tr key={`${s.loc}-${s.brand}`} style={{ backgroundColor: bg }}>
                    <td style={{ padding: "9px 12px", fontWeight: 800, color: C.primary, position: "sticky", left: 0, zIndex: 9, backgroundColor: bg, borderRight: `2.5px solid rgba(19,38,100,0.2)`, whiteSpace: "nowrap" }}>
                      {s.loc}
                    </td>
                    {values.map((v, vi) => (
                      <td key={vi} style={{ padding: "9px 12px", color: C.text, borderBottom: `1px solid ${C.borderSoft}` }}>
                        {v}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
