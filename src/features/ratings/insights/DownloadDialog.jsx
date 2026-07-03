import React, { useState } from "react";
import XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// --- Excel Formatting Helpers using xlsx-js-style ---
function applyExcelMatrixStyles(ws) {
  if (!ws || !ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  
  // 1. Style Header Row
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: "132664" } },
        font: { color: { rgb: "FFFFFF" }, bold: true, name: "Helvetica", sz: 10 },
        alignment: { horizontal: "center", vertical: "center" }
      };
    }
  }

  // 2. Style Body Rows
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    // Left column (Location name)
    const locCellRef = XLSX.utils.encode_cell({ r, c: range.s.c });
    const locCell = ws[locCellRef];
    
    // Check if this row is the final Grand Total row
    const isGrandTotalRow = r === range.e.r;

    if (locCell) {
      locCell.s = {
        font: { bold: true, color: { rgb: "132664" }, name: "Helvetica", sz: 9 },
        fill: { fgColor: { rgb: isGrandTotalRow ? "E8EBF5" : "F4F6FA" } },
        alignment: { horizontal: "left", vertical: "center" }
      };
    }

    // Rating columns
    for (let c = range.s.c + 1; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (cell) {
        const val = Number(cell.v);
        const isGrandTotalCol = c === range.e.c;
        const isTotalCell = isGrandTotalCol || isGrandTotalRow;
        
        let cellStyle = {
          font: { name: "Helvetica", sz: 9, bold: isTotalCell },
          alignment: { horizontal: "center", vertical: "center" }
        };

        if (isTotalCell) {
          cellStyle.fill = { fgColor: { rgb: "E8EBF5" } };
          cellStyle.font.color = { rgb: "132664" };
        } else if (!isNaN(val) && cell.v !== "" && cell.v !== "-") {
          if (val >= 4.0) {
            cellStyle.fill = { fgColor: { rgb: "132664" } };
            cellStyle.font.color = { rgb: "FFFFFF" };
            cellStyle.font.bold = true;
          } else if (val >= 3.0) {
            cellStyle.fill = { fgColor: { rgb: "AEBDEC" } }; // #AEBDEC matches rgba(19, 38, 100, 0.45)
            cellStyle.font.color = { rgb: "132664" };
            cellStyle.font.bold = true;
          } else if (val > 0) {
            cellStyle.fill = { fgColor: { rgb: "E4E8F5" } }; // #E4E8F5 matches rgba(19, 38, 100, 0.12)
            cellStyle.font.color = { rgb: "132664" };
            cellStyle.font.bold = true;
          }
        }
        
        cell.s = cellStyle;
      }
    }
  }
}

function applyExcelStandardStyles(ws) {
  if (!ws || !ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  
  // Style headers
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: "132664" } },
        font: { color: { rgb: "FFFFFF" }, bold: true, name: "Helvetica", sz: 10 },
        alignment: { horizontal: "left", vertical: "center" }
      };
    }
  }

  // Body rows alternating fills
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const rowBg = r % 2 === 0 ? "FFFFFF" : "F9FAFC";
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (cell) {
        cell.s = {
          fill: { fgColor: { rgb: rowBg } },
          font: { name: "Helvetica", sz: 9 },
          alignment: { horizontal: "left", vertical: "center" }
        };
      }
    }
  }
}

// --- Helper Functions for Downloads and Emails ---
function downloadSheet(dataSheets, format, destination, emailAddress, onComplete) {
  const wb = XLSX.utils.book_new();
  dataSheets.forEach(sheet => {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    
    // Auto style matrices or standard sheets
    if (sheet.sheetName.includes("Matrix")) {
      applyExcelMatrixStyles(ws);
    } else {
      applyExcelStandardStyles(ws);
    }
    
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName);
  });
  
  if (format === "csv") {
    const firstSheetName = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheetName];
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    
    if (destination === "device") {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `curefoods_report_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onComplete(true, "Report downloaded successfully!");
    } else {
      const base64 = btoa(unescape(encodeURIComponent(csvContent)));
      sendEmailRequest(emailAddress, `curefoods_report_${Date.now()}.csv`, base64, onComplete);
    }
  } else {
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
    function s2ab(s) {
      const buf = new ArrayBuffer(s.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
      return buf;
    }
    const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
    
    if (destination === "device") {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `curefoods_report_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onComplete(true, "Report downloaded successfully!");
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        sendEmailRequest(emailAddress, `curefoods_report_${Date.now()}.xlsx`, base64data, onComplete);
      };
      reader.readAsDataURL(blob);
    }
  }
}

function generatePDF(dataSheets, fileName, destination, emailAddress, onComplete) {
  try {
    const hasWideSheet = dataSheets.some(sheet => {
      if (sheet.sheetName.includes("Matrix")) return true;
      if (sheet.rows && sheet.rows.length > 0 && Object.keys(sheet.rows[0]).length > 6) return true;
      return false;
    });

    const orientation = hasWideSheet ? "landscape" : "portrait";
    const doc = new jsPDF({ orientation: orientation, unit: "mm", format: "a4" });
    
    dataSheets.forEach((sheet, idx) => {
      if (idx > 0) {
        doc.addPage();
      }
      
      // Page header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(19, 38, 100); // #132664
      doc.text("CUREFOODS RATINGS REPORT", 14, 15);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 20);
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(19, 38, 100);
      doc.text(sheet.sheetName.toUpperCase(), 14, 28);
      
      const rows = sheet.rows;
      if (rows && rows.length > 0) {
        const headers = Object.keys(rows[0]);
        const body = rows.map(row => headers.map(h => row[h] != null ? String(row[h]) : ""));
        
        // Calculate dynamic font size and cell padding based on column count to prevent digit wrapping
        const colCount = headers.length;
        let fontSize = 7;
        let cellPadding = 2;
        let firstColWidth = "auto";

        if (sheet.sheetName.includes("Matrix")) {
          if (colCount > 15) {
            fontSize = 4.5;
            cellPadding = 0.5;
            firstColWidth = 25;
          } else if (colCount > 10) {
            fontSize = 5.5;
            cellPadding = 1.0;
            firstColWidth = 30;
          } else {
            fontSize = 6.5;
            cellPadding = 1.5;
            firstColWidth = 35;
          }
        } else {
          // Standard tables
          if (colCount > 10) {
            fontSize = 6.5;
            cellPadding = 1.5;
          }
        }

        autoTable(doc, {
          head: [headers.map(h => String(h).toUpperCase())],
          body: body,
          startY: 32,
          theme: "grid",
          headStyles: { 
            fillColor: [19, 38, 100], 
            textColor: [255, 255, 255], 
            fontStyle: "bold", 
            fontSize: fontSize,
            halign: "center",
            valign: "middle"
          },
          styles: { 
            fontSize: fontSize, 
            cellPadding: cellPadding, 
            overflow: "ellipsize", 
            halign: "center", 
            valign: "middle" 
          },
          columnStyles: {
            0: { halign: "left", fontStyle: "bold", cellWidth: firstColWidth }
          },
          margin: { left: 14, right: 14 },
          didParseCell: function (data) {
            if (data.row.section === "body") {
              if (sheet.sheetName.includes("Matrix")) {
                const val = Number(data.cell.raw);
                const isGrandTotalCol = data.column.index === headers.length - 1;
                const isGrandTotalRow = data.row.index === body.length - 1;
                
                if (isGrandTotalCol || isGrandTotalRow) {
                  data.cell.styles.fillColor = [232, 235, 245];
                  data.cell.styles.textColor = [19, 38, 100];
                  data.cell.styles.fontStyle = "bold";
                } else if (data.column.index > 0 && !isNaN(val) && data.cell.raw !== "" && data.cell.raw !== "-") {
                  if (val >= 4.0) {
                    data.cell.styles.fillColor = [19, 38, 100];
                    data.cell.styles.textColor = [255, 255, 255];
                    data.cell.styles.fontStyle = "bold";
                  } else if (val >= 3.0) {
                    data.cell.styles.fillColor = [174, 187, 222];
                    data.cell.styles.textColor = [19, 38, 100];
                    data.cell.styles.fontStyle = "bold";
                  } else if (val > 0) {
                    data.cell.styles.fillColor = [228, 232, 245];
                    data.cell.styles.textColor = [19, 38, 100];
                    data.cell.styles.fontStyle = "bold";
                  }
                }
              }
            }
          }
        });
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("No data records available for this section.", 14, 35);
      }
    });

    if (destination === "device") {
      doc.save(fileName);
      onComplete(true, "Report downloaded successfully!");
    } else {
      const base64String = doc.output("datauristring").split(",")[1];
      sendEmailRequest(emailAddress, fileName, base64String, onComplete);
    }
  } catch (err) {
    console.error(err);
    onComplete(false, err.message || "Failed to generate PDF");
  }
}

function generateHTML(dataSheets, fileName, destination, emailAddress, onComplete) {
  try {
    let htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Curefoods Ratings Report</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 24px;
      color: #132664;
      background-color: #f4f6fa;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .meta {
      font-size: 12px;
      color: rgba(19, 38, 100, 0.6);
      margin-bottom: 24px;
    }
    .sheet-container {
      background-color: #ffffff;
      border: 1px solid rgba(19, 38, 100, 0.15);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      box-shadow: 0 4px 12px rgba(19, 38, 100, 0.05);
    }
    .sheet-title {
      font-size: 16px;
      font-weight: 800;
      margin-top: 0;
      margin-bottom: 16px;
      text-transform: uppercase;
    }
    .table-wrapper {
      max-height: 450px;
      overflow: auto;
      border: 1px solid rgba(19, 38, 100, 0.15);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 11px;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 10;
      background-color: #132664;
      color: #ffffff;
      font-weight: 700;
      padding: 10px 12px;
      text-align: center;
      white-space: nowrap;
      border-bottom: 2px solid rgba(19, 38, 100, 0.2);
      border-right: 1px solid rgba(255, 255, 255, 0.1);
    }
    th.frozen {
      left: 0;
      z-index: 20;
      border-right: 2.5px solid rgba(19, 38, 100, 0.2);
    }
    td {
      padding: 8px 12px;
      text-align: center;
      border-bottom: 1px solid rgba(19, 38, 100, 0.08);
      border-right: 1px solid rgba(19, 38, 100, 0.08);
    }
    td.frozen {
      position: sticky;
      left: 0;
      z-index: 9;
      font-weight: 700;
      border-right: 2.5px solid rgba(19, 38, 100, 0.2);
    }
    .good {
      background-color: #132664 !important;
      color: #ffffff !important;
      font-weight: 700;
    }
    .average {
      background-color: #aebdec !important;
      color: #132664 !important;
      font-weight: 700;
    }
    .poor {
      background-color: #e4e8f5 !important;
      color: #132664 !important;
      font-weight: 700;
    }
    .total-cell {
      background-color: #e8ebf5 !important;
      color: #132664 !important;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <h1>CUREFOODS RATINGS REPORT</h1>
  <div class="meta">Generated: ${new Date().toLocaleString()}</div>
`;

    dataSheets.forEach(sheet => {
      const rows = sheet.rows;
      if (!rows || rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      const isMatrix = sheet.sheetName.includes("Matrix");

      htmlContent += `
  <div class="sheet-container">
    <div class="sheet-title">${sheet.sheetName}</div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
      `;

      headers.forEach((h, colIdx) => {
        const isFirst = colIdx === 0;
        const frozenClass = isFirst ? 'class="frozen"' : '';
        htmlContent += `            <th ${frozenClass}>${h.toUpperCase()}</th>\n`;
      });

      htmlContent += `          </tr>
        </thead>
        <tbody>
      `;

      rows.forEach((row, rowIdx) => {
        const isLastRow = rowIdx === rows.length - 1;
        const rowBg = rowIdx % 2 === 0 ? "#ffffff" : "rgba(19, 38, 100, 0.01)";
        
        htmlContent += `          <tr style="background-color: ${rowBg};">\n`;
        
        headers.forEach((h, colIdx) => {
          const isFirst = colIdx === 0;
          const isLastCol = colIdx === headers.length - 1;
          const val = Number(row[h]);
          
          let cellClass = "";
          let inlineStyle = "";
          
          if (isFirst) {
            cellClass = "frozen";
            inlineStyle = `style="background-color: ${isLastRow ? '#e8ebf5' : rowBg};"`;
          } else if (isMatrix) {
            if (isLastCol || isLastRow) {
              cellClass = "total-cell";
            } else if (!isNaN(val) && row[h] !== "" && row[h] !== "-") {
              if (val >= 4.0) cellClass = "good";
              else if (val >= 3.0) cellClass = "average";
              else if (val > 0) cellClass = "poor";
            }
          } else if (isLastRow) {
            cellClass = "total-cell";
          }
          
          htmlContent += `            <td class="${cellClass}" ${inlineStyle}>${row[h] != null ? row[h] : "-"}</td>\n`;
        });
        
        htmlContent += `          </tr>\n`;
      });

      htmlContent += `        </tbody>
      </table>
    </div>
  </div>
      `;
    });

    htmlContent += `
</body>
</html>
`;

    if (destination === "device") {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onComplete(true, "Report downloaded successfully!");
    } else {
      const base64 = btoa(unescape(encodeURIComponent(htmlContent)));
      sendEmailRequest(emailAddress, fileName, base64, onComplete);
    }
  } catch (err) {
    console.error(err);
    onComplete(false, err.message || "Failed to generate HTML");
  }
}

async function sendEmailRequest(email, fileName, base64Data, onComplete) {
  try {
    const res = await fetch("/api/insights/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        subject: "Requested Curefoods Ratings Report",
        body: `Hello,\n\nPlease find attached your requested Curefoods ratings report: ${fileName}.\n\nBest regards,\nCurefoods Analytics Ops Team`,
        fileName,
        fileBase64: base64Data
      })
    });
    const result = await res.json();
    if (res.ok && result.success) {
      onComplete(true, "Email sent successfully!");
    } else {
      onComplete(false, result.error || "Failed to send email");
    }
  } catch (err) {
    onComplete(false, err.message || "Failed to send email");
  }
}

// Reusable Download Dialog Modal Component
export function DownloadDialog({ dataSheets, onClose }) {
  const [format, setFormat] = useState("xlsx");
  const [destination, setDestination] = useState("device");
  const [emailAddress, setEmailAddress] = useState("");
  const [status, setStatus] = useState(null);

  const handleAction = () => {
    if (destination === "email") {
      if (!emailAddress || !emailAddress.includes("@")) {
        setStatus({ type: "error", message: "Please enter a valid email address." });
        return;
      }
    }
    
    setStatus({ type: "loading", message: destination === "email" ? "Sending email..." : "Downloading report..." });
    
    setTimeout(() => {
      const extension = format === "pdf" ? "pdf" : format === "xlsx" ? "xlsx" : format === "html" ? "html" : "csv";
      const fileName = `curefoods_report_${Date.now()}.${extension}`;

      if (format === "pdf") {
        generatePDF(dataSheets, fileName, destination, emailAddress, (success, msg) => {
          if (success) {
            setStatus({ type: "success", message: msg });
          } else {
            setStatus({ type: "error", message: msg });
          }
        });
      } else if (format === "html") {
        generateHTML(dataSheets, fileName, destination, emailAddress, (success, msg) => {
          if (success) {
            setStatus({ type: "success", message: msg });
          } else {
            setStatus({ type: "error", message: msg });
          }
        });
      } else {
        downloadSheet(dataSheets, format, destination, emailAddress, (success, msg) => {
          if (success) {
            setStatus({ type: "success", message: msg });
          } else {
            setStatus({ type: "error", message: msg });
          }
        });
      }
    }, 200);
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(19, 38, 100, 0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, color: "#132664"
    }}>
      <div style={{
        backgroundColor: "#ffffff", padding: "24px", borderRadius: "12px",
        width: "380px", border: "1px solid rgba(19, 38, 100, 0.15)",
        boxShadow: "0 4px 20px rgba(19, 38, 100, 0.15)"
      }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "800" }}>Download Report</h3>
        
        {/* Format */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", marginBottom: "6px", textTransform: "uppercase", color: "rgba(19, 38, 100, 0.6)" }}>Format</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {["xlsx", "csv", "pdf", "html"].map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                style={{
                  flex: 1, padding: "8px", borderRadius: "6px", fontWeight: "700", fontSize: "12px", cursor: "pointer",
                  border: "1px solid #132664",
                  backgroundColor: format === f ? "#132664" : "transparent",
                  color: format === f ? "#ffffff" : "#132664"
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Destination */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", marginBottom: "6px", textTransform: "uppercase", color: "rgba(19, 38, 100, 0.6)" }}>Deliver to</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setDestination("device")}
              style={{
                flex: 1, padding: "8px", borderRadius: "6px", fontWeight: "700", fontSize: "12px", cursor: "pointer",
                border: "1px solid #132664",
                backgroundColor: destination === "device" ? "#132664" : "transparent",
                color: destination === "device" ? "#ffffff" : "#132664"
              }}
            >
              Device
            </button>
            <button
              onClick={() => setDestination("email")}
              style={{
                flex: 1, padding: "8px", borderRadius: "6px", fontWeight: "700", fontSize: "12px", cursor: "pointer",
                border: "1px solid #132664",
                backgroundColor: destination === "email" ? "#132664" : "transparent",
                color: destination === "email" ? "#ffffff" : "#132664"
              }}
            >
              Email
            </button>
          </div>
        </div>

        {/* Email Input */}
        {destination === "email" && (
          <div style={{ marginBottom: "16px" }}>
            <input
              type="email"
              placeholder="Enter email address..."
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              style={{
                width: "100%", padding: "10px", borderRadius: "6px", fontSize: "13px",
                border: "1px solid rgba(19, 38, 100, 0.3)", boxSizing: "border-box"
              }}
            />
          </div>
        )}

        {/* Status */}
        {status && (
          <div style={{
            fontSize: "12px", fontWeight: "700", padding: "10px", borderRadius: "6px", marginBottom: "16px",
            backgroundColor: status.type === "success" ? "#dcfce7" : status.type === "error" ? "#fee2e2" : "#f1f5f9",
            color: status.type === "success" ? "#15803d" : status.type === "error" ? "#b91c1c" : "#475569"
          }}>
            {status.message}
          </div>
        )}

        {/* Help Note */}
        <div style={{ fontSize: "11px", color: "rgba(19, 38, 100, 0.6)", marginBottom: "16px", fontStyle: "italic", lineHeight: "1.4" }}>
          * The exported file contains the complete report (all rows), not just the paginated view.
        </div>

        {/* Footer Buttons */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer",
              border: "1px solid rgba(19, 38, 100, 0.3)", backgroundColor: "transparent", color: "#132664"
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAction}
            disabled={status && status.type === "loading"}
            style={{
              padding: "8px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: status && status.type === "loading" ? "not-allowed" : "pointer",
              border: "none", backgroundColor: "#132664", color: "#ffffff"
            }}
          >
            {destination === "email" ? "Send" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
