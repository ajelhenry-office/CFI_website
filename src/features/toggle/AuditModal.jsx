import { Fragment, useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "../../api";
import { C, FONT } from "../../theme";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

const SOURCE_META = {
  MANUAL_SINGLE:        { label: "Manual",          color: "#132664", bg: "#eef1f9" },
  MANUAL_BULK:           { label: "Manual Bulk",     color: "#132664", bg: "#eef1f9" },
  MANUAL_RETRY:          { label: "Retry",           color: "#b45309", bg: "#fef3c7" },
  MANUAL_CORRECTION:     { label: "Correction",      color: "#7c3aed", bg: "#f3e8ff" },
  AUTO_HOURLY_RECHECK:   { label: "Hourly Recheck",  color: "#0f766e", bg: "#ccfbf1" },
  AUTO_WATCHDOG:         { label: "Watchdog",        color: "#0f766e", bg: "#ccfbf1" },
  AUTO_THROTTLE:         { label: "Auto-Throttle",   color: "#b91c1c", bg: "#fee2e2" },
  AUTO_EATFIT_THRESHOLD: { label: "Order Threshold", color: "#b91c1c", bg: "#fee2e2" },
};

function SourceBadge({ log }) {
  const meta = SOURCE_META[log.source] || (log.is_automated ? { label: "Automated", color: "#0f766e", bg: "#ccfbf1" } : { label: "Manual", color: "#132664", bg: "#eef1f9" });
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color: meta.color, backgroundColor: meta.bg, borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>
      {meta.label}
    </span>
  );
}

function Row({ log, indent }) {
  const ok = log.result === "SUCCESS";
  return (
    <tr style={{ backgroundColor: indent ? "rgba(19,38,100,0.02)" : "#fff" }}>
      <td style={{ padding: "7px 14px", paddingLeft: indent ? 34 : 14, color: C.text }}>{log.store_name}</td>
      <td style={{ padding: "7px 14px", color: C.muted, fontFamily: "monospace", fontSize: 11 }}>{log.store_id || "—"}</td>
      <td style={{ padding: "7px 14px", color: C.muted }}>{log.brand || "—"}</td>
      <td style={{ padding: "7px 14px", color: C.muted }}>{log.email || "—"}</td>
      <td style={{ padding: "7px 14px" }}><SourceBadge log={log} /></td>
      <td style={{ padding: "7px 14px", fontWeight: 700, color: log.action === "ENABLE" ? "#15803d" : (log.action === "DISABLE" ? "#b91c1c" : C.primary) }}>{log.action}</td>
      <td style={{ padding: "7px 14px", fontWeight: 800, color: ok ? "#15803d" : "#b91c1c" }} title={log.error_msg || ""}>{log.result}</td>
      <td style={{ padding: "7px 14px", color: C.muted, whiteSpace: "nowrap" }}>
        {new Date(log.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
      </td>
    </tr>
  );
}

export default function AuditModal({ onClose, stores = [], selectedBrands = [] }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSystemSyncs, setShowSystemSyncs] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    fetch(`${API_BASE}/api/toggle/audit-log`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  // Only show logs for stores belonging to the currently selected brands.
  // When no brands are selected (length === 0), show all.
  const validStoreIds = useMemo(() => {
    if (!selectedBrands || selectedBrands.length === 0) return null;
    return new Set(stores.filter((s) => selectedBrands.includes(s.brand)).map((s) => s.location_id));
  }, [stores, selectedBrands]);

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (!showSystemSyncs && log.is_automated) return false;
        if (selectedBrands && selectedBrands.length > 0) {
          if (log.store_id === null) {
            // Bulk summary row — match on its real brand column.
            const matchesBrand = log.brand && selectedBrands.some((b) => log.brand.toLowerCase().includes(b.toLowerCase()));
            if (!matchesBrand) return false;
          } else {
            if (validStoreIds && !validStoreIds.has(log.store_id)) return false;
          }
        }
        return true;
      }),
    [logs, showSystemSyncs, validStoreIds, selectedBrands]
  );

  // Group rows that share a bulk_job_id. The row with store_id === null is the
  // summary/header; rows with a real store_id are the per-store detail underneath it.
  const groupedRows = useMemo(() => {
    const bulkGroups = new Map();
    const standalone = [];
    for (const log of filteredLogs) {
      if (log.bulk_job_id) {
        if (!bulkGroups.has(log.bulk_job_id)) bulkGroups.set(log.bulk_job_id, []);
        bulkGroups.get(log.bulk_job_id).push(log);
      } else {
        standalone.push({ type: "single", log });
      }
    }
    const groups = [...bulkGroups.entries()].map(([jobId, rows]) => {
      const header = rows.find((r) => r.store_id === null) || rows[0];
      const details = rows.filter((r) => r !== header).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { type: "group", jobId, header, details, sortTime: new Date(header.created_at).getTime() };
    });
    const merged = [
      ...standalone.map((s) => ({ ...s, sortTime: new Date(s.log.created_at).getTime() })),
      ...groups,
    ];
    merged.sort((a, b) => b.sortTime - a.sortTime);
    return merged;
  }, [filteredLogs]);

  const toggleExpanded = (jobId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(19,38,100,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, fontFamily: FONT }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: "min(1080px, 96vw)", maxHeight: "82vh", backgroundColor: "#ffffff", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 16px 48px rgba(19,38,100,0.22)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>
              Toggle Audit Log{selectedBrands && selectedBrands.length > 0 ? ` (${selectedBrands.join(", ")})` : ""}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Who changed what, whether it worked, and why — last 48 hours</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.muted, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={showSystemSyncs}
                onChange={(e) => setShowSystemSyncs(e.target.checked)}
                style={{ accentColor: C.primary, cursor: "pointer" }}
              />
              System syncs
            </label>
            <a
              href={`${API_BASE}/api/history/download`}
              style={{ fontSize: 12, fontWeight: 700, color: C.primary, textDecoration: "none", border: `1.5px solid ${C.primary}`, borderRadius: 8, padding: "6px 14px" }}
            >
              ⬇ CSV
            </a>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading…</div>
          ) : groupedRows.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
              No recent activity for {selectedBrands && selectedBrands.length > 0 ? selectedBrands.join(", ") : "all brands"}.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0 }}>
                <tr style={{ backgroundColor: C.primary, color: "#fff" }}>
                  {["Store / Batch", "Store ID", "Brand", "By", "Type", "Action", "Result", "Time"].map((h) => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((entry) => {
                  if (entry.type === "single") {
                    return <Row key={entry.log.id} log={entry.log} />;
                  }
                  const { jobId, header, details } = entry;
                  const isOpen = expanded.has(jobId);
                  const successCount = details.filter((d) => d.result === "SUCCESS").length;
                  const failCount = details.length - successCount;
                  return (
                    <Fragment key={jobId}>
                      <tr style={{ backgroundColor: "#f8fafc", cursor: details.length > 0 ? "pointer" : "default" }} onClick={() => details.length > 0 && toggleExpanded(jobId)}>
                        <td style={{ padding: "7px 14px", color: C.text, fontWeight: 700 }}>
                          {details.length > 0 && <span style={{ display: "inline-block", width: 14, color: C.muted }}>{isOpen ? "▾" : "▸"}</span>}
                          {header.store_name}
                        </td>
                        <td style={{ padding: "7px 14px", color: C.muted, fontFamily: "monospace", fontSize: 11 }}>
                          {details.length > 0 ? `${details.length} stores` : "—"}
                        </td>
                        <td style={{ padding: "7px 14px", color: C.muted }}>{header.brand || "—"}</td>
                        <td style={{ padding: "7px 14px", color: C.muted }}>{header.email || "—"}</td>
                        <td style={{ padding: "7px 14px" }}><SourceBadge log={header} /></td>
                        <td style={{ padding: "7px 14px", fontWeight: 700, color: header.action === "ENABLE" ? "#15803d" : "#b91c1c" }}>{header.action}</td>
                        <td style={{ padding: "7px 14px", fontWeight: 800, color: "#15803d" }}>
                          {details.length > 0 ? `✅ ${successCount} ❌ ${failCount}` : header.result}
                        </td>
                        <td style={{ padding: "7px 14px", color: C.muted, whiteSpace: "nowrap" }}>
                          {new Date(header.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </td>
                      </tr>
                      {isOpen && details.map((d) => <Row key={d.id} log={d} indent />)}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
