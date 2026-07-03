import React, { useState, useEffect } from "react";

const C = { text: "#132664", bg: "#ffffff", border: "rgba(19, 38, 100, 0.15)" };

function Card({ children, style }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, color: C.text, boxShadow: "0 2px 8px rgba(19, 38, 100, 0.03)", ...style }}>
      {children}
    </div>
  );
}

export default function CommentsInsight({ reviews, onClose, onRegisterDownload }) {
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;

  const totalRows = Array.isArray(reviews) ? reviews.length : 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalRows);
  const paginatedRows = Array.isArray(reviews) ? reviews.slice(startIndex, endIndex) : [];

  const header = (title) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#132664" }}>{title}</div>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        {onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#132664", fontSize: 18, cursor: "pointer", fontWeight: "bold" }}>✕</button>
        )}
      </div>
    </div>
  );

  // Prepare Sheets for Download
  const getDownloadDataSheets = () => {
    const rows = reviews.map(r => ({
      "Review ID": r.review_id,
      "Outlet ID": r.outlet_id,
      "Restaurant ID": r.restaurant_id,
      "Brand Name": r.brand_name,
      "Business Entity": r.business_entity,
      City: r.city,
      Area: r.area,
      Zone: r.zone,
      "Order ID": r.order_id,
      Date: r.date,
      "Ordered Time": r.ordered_time,
      "GMV Total": r.gmv_total,
      "Item Name": r.item_name,
      Comments: r.comments,
      Rating: r.restaurant_rating,
      "Post Status": r.post_status,
      "Updated At": r.updated_at
    }));
    return [
      { sheetName: "Comments", rows }
    ];
  };

  // Register callback to parent page
  useEffect(() => {
    if (onRegisterDownload) {
      onRegisterDownload(() => getDownloadDataSheets);
    }
    return () => {
      if (onRegisterDownload) onRegisterDownload(null);
    };
  }, [reviews, onRegisterDownload]);

  return (
    <Card style={{ overflowX: "auto" }}>
      {header("Comments Insight")}
      
      <div style={{ maxHeight: 600, overflowY: "auto", overflowX: "auto", position: "relative", border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: "8px" }}>
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "separate", borderSpacing: 0, color: "#132664", fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 11 }}>
            <tr style={{ backgroundColor: "#132664", color: "#ffffff" }}>
              <th style={{ 
                position: "sticky", top: 0, zIndex: 10,
                backgroundColor: "#132664", color: "#ffffff",
                padding: "12px 10px", whiteSpace: "nowrap",
                borderRight: "1px solid rgba(255, 255, 255, 0.1)",
                borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)"
              }}>
                Review ID
              </th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Outlet ID</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Restaurant ID</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Brand Name</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Business Entity</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>City</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Area</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Zone</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Order ID</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Date</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Ordered Time</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>GMV Total</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Item Name</th>
              <th style={{ padding: "12px 10px", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Comments</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Rating</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Post Status</th>
              <th style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>Updated At</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, i) => {
              const rowBg = i % 2 === 0 ? "#ffffff" : "rgba(19, 38, 100, 0.02)";
              return (
                <tr key={i} style={{ backgroundColor: rowBg }}>
                  <td style={{ 
                    color: "#132664", fontWeight: "700",
                    padding: "12px 10px", whiteSpace: "nowrap",
                    borderRight: "1px solid rgba(19, 38, 100, 0.08)",
                    borderBottom: "1px solid rgba(19, 38, 100, 0.08)"
                  }}>
                    {row.review_id || "-"}
                  </td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.outlet_id || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.restaurant_id || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.brand_name || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.02)" }}>{row.business_entity || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.city || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.area || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.zone || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.order_id || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.date || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.ordered_time ? new Date(row.ordered_time).toLocaleString() : "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.gmv_total != null ? Number(row.gmv_total).toFixed(2) : "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.item_name || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "pre-wrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.comments || "-"}</td>
                  <td style={{ padding: "12px 10px", fontWeight: "bold", color: "#132664", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.restaurant_rating ? `${row.restaurant_rating}★` : "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.post_status || "-"}</td>
                  <td style={{ padding: "12px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", fontSize: "12px", fontWeight: "700", color: "#132664" }}>
          <span>Showing reviews {startIndex + 1}-{endIndex} of {totalRows} entries</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button 
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
              disabled={currentPage === 1}
              style={{
                background: "none",
                border: "1px solid #132664",
                borderRadius: "6px",
                padding: "4px 10px",
                color: "#132664",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.4 : 1,
                fontWeight: "800"
              }}
            >
              &larr; Prev
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} 
              disabled={currentPage === totalPages}
              style={{
                background: "none",
                border: "1px solid #132664",
                borderRadius: "6px",
                padding: "4px 10px",
                color: "#132664",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.4 : 1,
                fontWeight: "800"
              }}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
