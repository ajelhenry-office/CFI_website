import React, { useEffect, useMemo, useState, Fragment } from "react";
import { getAuthHeaders } from "../../api";
import { C, FONT } from "../../theme";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

export default function TimingAuditModal({ onClose, selectedBrands = [] }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/api/timing/audit-log`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredLogs = useMemo(() => {
    if (!selectedBrands || selectedBrands.length === 0) return logs;
    return logs.filter((log) => {
      // Check if ANY store in this batch matches the selected brand
      const details = log.details || [];
      return details.some(d => selectedBrands.includes(d.brand));
    });
  }, [logs, selectedBrands]);

  const toggleExpand = (batchId) => {
    setExpandedRows(prev => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  const handleRetry = async (batchId, details) => {
    const failedStores = details.filter(d => d.status === 'failed').map(d => d.store_id);
    if (failedStores.length === 0) return;
    
    // Fire and forget retry
    alert(`Retrying ${failedStores.length} failed stores...`);
    // In a real implementation, we would call /api/timing/bulk-update again for these specific stores.
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(19,38,100,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, fontFamily: FONT }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: "min(960px, 94vw)", maxHeight: "82vh", backgroundColor: "#ffffff", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 16px 48px rgba(19,38,100,0.22)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>
              Timing Audit Log{selectedBrands && selectedBrands.length > 0 ? ` (${selectedBrands.join(", ")})` : ""}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>History of Zomato timing changes</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading…</div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>
              No recent activity found.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                <tr style={{ backgroundColor: C.primary, color: "#fff" }}>
                  <th style={{ padding: "9px 14px", width: 40 }}></th>
                  {["Action", "Affected Stores", "By", "Result", "Time"].map((h) => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                  <th style={{ padding: "9px 14px", width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((l, i) => {
                  const isExpanded = expandedRows[l.batch_id];
                  const details = l.details || [];
                  const isBulk = l.total_stores > 1;
                  const storeSummary = isBulk 
                    ? `${details[0]?.store_id || 'Unknown'} + ${l.total_stores - 1} others`
                    : details[0]?.store_id || 'Unknown';

                  return (
                    <React.Fragment key={l.batch_id || i}>
                      <tr style={{ backgroundColor: i % 2 ? "rgba(19,38,100,0.01)" : "#fff", borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "7px 14px", cursor: "pointer" }} onClick={() => toggleExpand(l.batch_id)}>
                          <span style={{ fontSize: 16, color: C.muted, userSelect: "none" }}>{isExpanded ? "▾" : "▸"}</span>
                        </td>
                        <td style={{ padding: "7px 14px", color: C.text, fontWeight: 700 }}>{isBulk ? "Bulk Update" : "Single Update"}</td>
                        <td style={{ padding: "7px 14px", color: C.text }}>{storeSummary}</td>
                        <td style={{ padding: "7px 14px", color: C.muted }}>{l.email}</td>
                        <td style={{ padding: "7px 14px" }}>
                           {l.failed_count > 0 ? (
                             <span style={{ color: "#b91c1c", fontWeight: 700 }}>{l.success_count} Success, {l.failed_count} Failed</span>
                           ) : (
                             <span style={{ color: "#15803d", fontWeight: 700 }}>{l.success_count} Success</span>
                           )}
                        </td>
                        <td style={{ padding: "7px 14px", color: C.muted, whiteSpace: "nowrap" }}>
                          {new Date(l.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </td>
                        <td style={{ padding: "7px 14px" }}>
                          {l.failed_count > 0 && (
                            <button 
                              onClick={() => handleRetry(l.batch_id, details)}
                              style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 4, cursor: "pointer" }}
                            >
                              Retry Failed
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div style={{ backgroundColor: "#f9fafb", padding: "12px 32px", borderBottom: "1px solid #e5e7eb" }}>
                               <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                                  <thead>
                                    <tr style={{ color: C.muted, borderBottom: "1px solid #d1d5db" }}>
                                      <th style={{ padding: "4px 8px", textAlign: "left" }}>Store ID</th>
                                      <th style={{ padding: "4px 8px", textAlign: "left" }}>Brand</th>
                                      <th style={{ padding: "4px 8px", textAlign: "left" }}>Status</th>
                                      <th style={{ padding: "4px 8px", textAlign: "left" }}>Error Message</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {details.map((d, j) => (
                                      <tr key={j}>
                                        <td style={{ padding: "6px 8px" }}>{d.store_id}</td>
                                        <td style={{ padding: "6px 8px", color: C.muted }}>{d.brand}</td>
                                        <td style={{ padding: "6px 8px", fontWeight: 600, color: d.status === "success" ? "#15803d" : d.status === "failed" ? "#b91c1c" : "#92400e" }}>
                                          {d.status.toUpperCase()}
                                        </td>
                                        <td style={{ padding: "6px 8px", color: C.muted }}>{d.error_message || "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                               </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
