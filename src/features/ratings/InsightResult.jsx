import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter, ZAxis,
  PieChart, Pie, Cell,
} from "recharts";

const C = { text: "#a0b4c8", bg: "#0c1117", border: "#1a2535" };
const CHART_PROPS = { style: { background: "transparent" } };

const starColors = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#14b8a6", 5: "#22c55e" };
const PIE_COLORS = { delivery: "#f97316", kitchen: "#ef4444", packaging: "#a78bfa", other: "#4a6080" };

function Card({ children, style }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>{children}</div>;
}

function AvgBar({ data, color = "#3b82f6" }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 40 }} {...CHART_PROPS}>
        <XAxis type="number" domain={[0, 5]} tick={{ fill: C.text, fontSize: 11 }} />
        <YAxis type="category" dataKey="name" tick={{ fill: C.text, fontSize: 11 }} width={160} />
        <Tooltip contentStyle={{ background: "#0c1117", border: `1px solid ${C.border}`, color: "#fff" }} formatter={(v) => [v, "Avg Rating"]} />
        <Bar dataKey="avg" fill={color} radius={[0, 4, 4, 0]} label={{ position: "right", fill: C.text, fontSize: 11, formatter: (v) => v }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RankedTable({ data, valueKey = "avg", valueSuffix = "★", badgeColor }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((row, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: "#475569", width: 24 }}>#{i + 1}</span>
          <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{row.name}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: badgeColor || "#a0b4c8" }}>{row[valueKey]}{valueSuffix}</span>
          <span style={{ fontSize: 11, color: "#4a6080" }}>{row.count} orders</span>
        </div>
      ))}
    </div>
  );
}

function AIText({ text }) {
  return (
    <Card>
      <pre style={{ whiteSpace: "pre-wrap", color: "#e2e8f0", fontSize: 13, lineHeight: 1.7, margin: 0, fontFamily: "Inter, sans-serif" }}>
        {text}
      </pre>
    </Card>
  );
}

export default function InsightResult({ insightId, data, onClose }) {
  if (!data) return null;

  const header = (title) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>{title}</div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer" }}>✕</button>
    </div>
  );

  // ── 1. Brand vs Brand ─────────────────────────────────────────
  if (insightId === 1) return (
    <Card>
      {header("Brand vs Brand Rating")}
      <AvgBar data={data} color="#3b82f6" />
    </Card>
  );

  // ── 2. Zone Level ─────────────────────────────────────────────
  if (insightId === 2) return (
    <Card>
      {header("Zone Level Rating")}
      <AvgBar data={data} color="#06b6d4" />
    </Card>
  );

  // ── 3. City Level ─────────────────────────────────────────────
  if (insightId === 3) return (
    <Card>
      {header("City Level Rating — Top 20")}
      <AvgBar data={data} color="#10b981" />
    </Card>
  );

  // ── 4. Kitchen Level ──────────────────────────────────────────
  if (insightId === 4) return (
    <Card>
      {header("Kitchen Level Rating")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 700, marginBottom: 10 }}>🏆 TOP 10 BEST</div>
          <AvgBar data={data.best} color="#22c55e" />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginBottom: 10 }}>⚠ WORST 10</div>
          <AvgBar data={data.worst} color="#ef4444" />
        </div>
      </div>
    </Card>
  );

  // ── 5. Platform Comparison ────────────────────────────────────
  if (insightId === 5) return (
    <Card>
      {header("Platform Comparison")}
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ background: "#ff6900", borderRadius: 12, padding: "20px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>SWIGGY</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>{data[0]?.avg}★</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{data[0]?.count} orders</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 32px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#e53e3e", fontWeight: 700 }}>ZOMATO</div>
            <div style={{ fontSize: 11, color: "#4a6080", marginTop: 4 }}>Coming Soon</div>
          </div>
        </div>
      </div>
    </Card>
  );

  // ── 6. Top Rated SKU ──────────────────────────────────────────
  if (insightId === 6) return (
    <Card>
      {header("Top Rated SKU")}
      <RankedTable data={data} valueKey="avg" valueSuffix="★" badgeColor="#22c55e" />
    </Card>
  );

  // ── 7. Worst Rated SKU ────────────────────────────────────────
  if (insightId === 7) return (
    <Card>
      {header("Worst Rated SKU")}
      <RankedTable data={data} valueKey="avg" valueSuffix="★" badgeColor="#ef4444" />
    </Card>
  );

  // ── 8. Best Selling SKU ───────────────────────────────────────
  if (insightId === 8) return (
    <Card>
      {header("Best Selling SKU")}
      <RankedTable data={data} valueKey="count" valueSuffix=" orders" badgeColor="#3b82f6" />
    </Card>
  );

  // ── 9. Category Rating ────────────────────────────────────────
  if (insightId === 9) return (
    <Card>
      {header("Category Rating")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {data.map((cat, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 24px", minWidth: 120, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{cat.name}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#ffffff", margin: "8px 0" }}>{cat.avg}★</div>
            <div style={{ fontSize: 11, color: "#4a6080" }}>{cat.count} orders</div>
          </div>
        ))}
      </div>
    </Card>
  );

  // ── 10. High Volume Low Rating ────────────────────────────────
  if (insightId === 10) return (
    <Card>
      {header("High Volume Low Rating — Needs Attention")}
      {data.length === 0
        ? <div style={{ color: C.text, fontSize: 13 }}>No kitchens match this criteria.</div>
        : data.map((row, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, marginBottom: 8 }}>
            <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>URGENT</span>
            <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0" }}>{row.name}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{row.avg}★</span>
            <span style={{ fontSize: 11, color: "#4a6080" }}>{row.count} orders</span>
          </div>
        ))
      }
    </Card>
  );

  // ── 11. Star Distribution ─────────────────────────────────────
  if (insightId === 11) return (
    <Card>
      {header("Star Distribution")}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" {...CHART_PROPS}>
          <XAxis type="number" tick={{ fill: C.text, fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fill: C.text, fontSize: 11 }} width={40} />
          <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, color: "#fff" }} formatter={(v, n, p) => [`${v} (${p.payload.pct}%)`, "Orders"]} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry) => <Cell key={entry.star} fill={starColors[entry.star]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        {data.map(d => (
          <div key={d.star} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: starColors[d.star], display: "inline-block" }} />
            <span style={{ color: C.text }}>{d.name}: {d.pct}%</span>
          </div>
        ))}
      </div>
    </Card>
  );

  // ── 12. Month over Month Trend ────────────────────────────────
  if (insightId === 12) return (
    <Card>
      {header("Month over Month Trend")}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} {...CHART_PROPS}>
          <XAxis dataKey="name" tick={{ fill: C.text, fontSize: 11 }} />
          <YAxis domain={[0, 5]} tick={{ fill: C.text, fontSize: 11 }} />
          <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, color: "#fff" }} />
          <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );

  // ── 13. Volume vs Rating ──────────────────────────────────────
  if (insightId === 13) return (
    <Card>
      {header("Volume vs Rating (per Kitchen)")}
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart {...CHART_PROPS}>
          <XAxis dataKey="volume" name="Volume" tick={{ fill: C.text, fontSize: 11 }} label={{ value: "Orders", position: "insideBottom", fill: C.text, fontSize: 11 }} />
          <YAxis dataKey="rating" name="Rating" domain={[0, 5]} tick={{ fill: C.text, fontSize: 11 }} label={{ value: "Rating", angle: -90, position: "insideLeft", fill: C.text, fontSize: 11 }} />
          <ZAxis range={[40, 40]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, color: "#fff" }} formatter={(v, n) => [v, n]} />
          <Scatter data={data} fill="#3b82f6" fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );

  // ── 14. Weekend vs Weekday ────────────────────────────────────
  if (insightId === 14) return (
    <Card>
      {header("Weekend vs Weekday Rating")}
      <div style={{ display: "flex", gap: 20 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{d.name}</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#ffffff", margin: "12px 0" }}>{d.avg}★</div>
            <div style={{ fontSize: 12, color: "#4a6080" }}>{d.count} orders</div>
          </div>
        ))}
      </div>
    </Card>
  );

  // ── 15. Peak Bad Rating Hours ─────────────────────────────────
  if (insightId === 15) return (
    <Card>
      {header("Peak Bad Rating Hours (≤2★)")}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} {...CHART_PROPS}>
          <XAxis dataKey="name" tick={{ fill: C.text, fontSize: 10 }} interval={1} />
          <YAxis tick={{ fill: C.text, fontSize: 11 }} />
          <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, color: "#fff" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={entry.worst ? "#ef4444" : "#1e3a5f"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>🔴 Red bars = worst 3 hours</div>
    </Card>
  );

  // ── 16. Repeat Complaints ─────────────────────────────────────
  if (insightId === 16) return (
    <Card>
      {header("Repeat Complaints")}
      <AIText text={data} />
    </Card>
  );

  // ── 17. Delivery vs Kitchen (Pie) ─────────────────────────────
  if (insightId === 17) {
    const pieData = Object.entries(data).map(([k, v]) => ({ name: k, value: v }));
    return (
      <Card>
        {header("Delivery vs Kitchen Issues")}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <ResponsiveContainer width={220} height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {pieData.map((entry) => <Cell key={entry.name} fill={PIE_COLORS[entry.name] || "#4a6080"} />)}
              </Pie>
              <Tooltip contentStyle={{ background: C.bg, border: `1px solid ${C.border}`, color: "#fff" }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[d.name] || "#4a6080", display: "inline-block" }} />
                <span style={{ fontSize: 13, color: "#e2e8f0", textTransform: "capitalize" }}>{d.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  // ── 18. Weekly AI Brief ───────────────────────────────────────
  if (insightId === 18) return (
    <Card>
      {header("Weekly AI Brief")}
      <AIText text={data} />
    </Card>
  );

  // ── 19. Action Items ──────────────────────────────────────────
  if (insightId === 19) {
    const ownerColor = { Kitchen: "#f97316", Delivery: "#3b82f6", Packaging: "#a78bfa", Management: "#06b6d4" };
    const impactColor = { High: "#ef4444", Medium: "#eab308", Low: "#22c55e" };
    const lines = data.split("\n").filter(Boolean);
    const items = [];
    let current = {};
    for (const line of lines) {
      if (line.startsWith("Action:")) { if (current.action) items.push(current); current = { action: line.replace("Action:", "").trim() }; }
      else if (line.startsWith("Owner:")) current.owner = line.replace("Owner:", "").trim();
      else if (line.startsWith("Impact:")) current.impact = line.replace("Impact:", "").trim();
    }
    if (current.action) items.push(current);
    return (
      <Card>
        {header("Action Items")}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.length > 0 ? items.map((item, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px" }}>
              <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 8 }}>{i + 1}. {item.action}</div>
              <div style={{ display: "flex", gap: 8 }}>
                {item.owner && <span style={{ fontSize: 11, fontWeight: 700, color: ownerColor[item.owner] || "#a0b4c8", background: `${ownerColor[item.owner] || "#a0b4c8"}22`, padding: "2px 8px", borderRadius: 4 }}>{item.owner}</span>}
                {item.impact && <span style={{ fontSize: 11, fontWeight: 700, color: impactColor[item.impact] || "#a0b4c8", background: `${impactColor[item.impact] || "#a0b4c8"}22`, padding: "2px 8px", borderRadius: 4 }}>{item.impact} Impact</span>}
              </div>
            </div>
          )) : <AIText text={data} />}
        </div>
      </Card>
    );
  }

  // ── 20. Packaging Issues ──────────────────────────────────────
  if (insightId === 20) return (
    <Card>
      {header("📦 Packaging Issues")}
      <AIText text={data} />
    </Card>
  );

  return null;
}
