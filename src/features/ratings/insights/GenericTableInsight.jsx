import React, { useState, useEffect } from "react";

const C = { text: "#132664", bg: "#ffffff", border: "rgba(19, 38, 100, 0.15)" };

function Card({ children, style }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, color: C.text, boxShadow: "0 2px 8px rgba(19, 38, 100, 0.03)", ...style }}>
      {children}
    </div>
  );
}

export default function GenericTableInsight({ title, columns, data, onClose, searchField = "name", onRegisterDownload }) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(false);
  const PAGE_SIZE = 25;

  // Setup Excel Download Registry
  useEffect(() => {
    if (onRegisterDownload) {
      const getDownloadDataSheets = () => {
        const rows = data.map(item => {
          const rowObj = {};
          columns.forEach(col => {
            rowObj[col.header] = item[col.key];
          });
          return rowObj;
        });
        return [{ sheetName: title.substring(0, 30), rows }];
      };
      onRegisterDownload(getDownloadDataSheets);
    }
    return () => {
      if (onRegisterDownload) onRegisterDownload(null);
    };
  }, [data, columns, title, onRegisterDownload]);

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <Card style={{ padding: "24px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: "800", margin: 0 }}>{title}</h3>
          {onClose && <button onClick={onClose} style={{ background: "none", border: "none", color: "#132664", fontSize: "18px", cursor: "pointer", fontWeight: "bold" }}>✕</button>}
        </div>
        <div style={{ padding: "40px", color: "rgba(19, 38, 100, 0.5)", fontStyle: "italic", fontSize: "13px" }}>No data records available for this range.</div>
      </Card>
    );
  }

  // Sorting
  let sortedData = [...data];
  if (sortKey) {
    sortedData.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  // Filtering
  const filteredData = sortedData.filter(item => {
    if (!search || !searchField) return true;
    const target = item[searchField];
    return target && String(target).toLowerCase().includes(search.toLowerCase());
  });

  const totalRows = filteredData.length;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalRows);
  const paginatedRows = filteredData.slice(startIndex, endIndex);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setCurrentPage(1);
  };

  return (
    <Card style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: "800", margin: 0 }}>{title}</h3>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {searchField && data.length > 5 && (
            <input 
              type="text"
              placeholder={`Search ${searchField}...`}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              style={{
                padding: "6px 12px",
                border: "1px solid rgba(19, 38, 100, 0.2)",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#132664",
                outline: "none"
              }}
            />
          )}
          {onClose && (
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#132664", fontSize: "18px", cursor: "pointer", fontWeight: "bold" }}>✕</button>
          )}
        </div>
      </div>

      <div style={{ border: "1px solid rgba(19, 38, 100, 0.15)", borderRadius: "8px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "#f4f6fa", borderBottom: "2.5px solid rgba(19, 38, 100, 0.2)" }}>
              {columns.map((col, idx) => (
                <th 
                  key={idx}
                  onClick={() => toggleSort(col.key)}
                  style={{ 
                    padding: "10px 12px", 
                    color: "#132664", 
                    fontWeight: "800", 
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {col.header}
                    <span style={{ fontSize: "9px", opacity: 0.6 }}>
                      {sortKey === col.key ? (sortAsc ? "▲" : "▼") : "↕"}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, rIdx) => {
              const rowBg = rIdx % 2 === 0 ? "#ffffff" : "rgba(19, 38, 100, 0.01)";
              return (
                <tr key={rIdx} style={{ backgroundColor: rowBg, borderBottom: "1px solid rgba(19, 38, 100, 0.08)" }}>
                  {columns.map((col, cIdx) => {
                    const val = row[col.key];
                    return (
                      <td 
                        key={cIdx} 
                        style={{ 
                          padding: "8px 12px", 
                          color: "#132664",
                          fontWeight: col.bold ? "700" : "500",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {col.render ? col.render(val, row) : (val != null ? val : "-")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", fontSize: "12px", fontWeight: "700", color: "#132664" }}>
          <span>Showing records {startIndex + 1}-{endIndex} of {totalRows}</span>
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
