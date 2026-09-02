// Wilson score lower bound for a binomial proportion — the statistically
// correct way to rank/compare a rate (e.g. "% of orders rated >= 4") across
// groups with different sample sizes, so a small-sample result doesn't
// unfairly outrank a much larger sample that happens to look slightly worse.
// Mirrors server/ratings/insights.routes.js's wilsonLowerBound() — same
// formula, same one-sided 95% confidence (z ≈ 1.645), so a brand/location's
// ranking is consistent whether it's computed here (client-side, from raw
// review rows) or on the backend for a picked insight.
const WILSON_Z = 1.645;

export function wilsonLowerBound(positive, n) {
  if (!n) return null;
  const p = positive / n;
  const z2 = WILSON_Z * WILSON_Z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = WILSON_Z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return (center - margin) / denom;
}
