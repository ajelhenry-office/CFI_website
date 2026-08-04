import fs from 'fs';

let content = fs.readFileSync('src/features/timing/TimingPage.jsx', 'utf8');

// 1. Add X icon
content = content.replace(
  'const PencilIcon = () => (',
  `const X = ({ size }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;\n\nconst PencilIcon = () => (`
);

// 2. Add bulk states
content = content.replace(
  '  const [timingCache, setTimingCache] = useState({});',
  `  const [timingCache, setTimingCache] = useState({});
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSelectedStores, setBulkSelectedStores] = useState([]);
  const [bulkSelectedDays, setBulkSelectedDays] = useState({
    Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true
  });`
);

// 3. Add handleBulkSave function above handleSave
const bulkSaveFunc = `  const handleBulkSave = async () => {
    if (bulkSelectedStores.length === 0) {
      setToastMsg("Please select at least one store for bulk update.");
      setTimeout(() => setToastMsg(""), 3000);
      return;
    }
    const partialTimings = {};
    Object.keys(bulkSelectedDays).forEach(day => {
      if (bulkSelectedDays[day]) {
        partialTimings[day] = timings[day];
      }
    });
    if (Object.keys(partialTimings).length === 0) {
      setToastMsg("Please select at least one day to apply.");
      setTimeout(() => setToastMsg(""), 3000);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        platform: activePlatform,
        stores: bulkSelectedStores,
        timings: partialTimings
      };
      const res = await fetch(\`\${API_BASE}/api/timing/bulk-update\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      if (handleApiError(res)) return;
      const data = await res.json();
      if (data.success) {
        setToastMsg(\`Successfully queued \${bulkSelectedStores.length} stores for bulk update.\`);
        setTimeout(() => setToastMsg(""), 3000);
        setShowBulkModal(false);
        setBulkSelectedStores([]);
        fetchLiveTasks();
      } else {
        setToastMsg("Failed to queue bulk updates: " + data.error);
        setTimeout(() => setToastMsg(""), 4000);
      }
    } catch (err) {
      setToastMsg("Error: " + err.message);
      setTimeout(() => setToastMsg(""), 4000);
    }
    setLoading(false);
  };

  const handleSave`;
content = content.replace('  const handleSave', bulkSaveFunc);

// Fix handleSave toast
content = content.replace(
  'setToastMsg(`Successfully queued ${selectedStores.length} stores for update.`);',
  'setToastMsg(`Successfully queued store for update.`);'
);

// 4. Update MultiSelect for singleSelect
content = content.replace(
  'const MultiSelect = ({ options, selected, onChange, placeholder, width, hasSearch }) => {',
  'const MultiSelect = ({ options, selected, onChange, placeholder, width, hasSearch, singleSelect }) => {'
);

const multiSelectToggleStr = `    const toggle = (val) => {
      if (selected.includes(val)) {
        onChange(selected.filter(v => v !== val));
      } else {
        onChange([...selected, val]);
      }
    };`;
const singleSelectToggleStr = `    const toggle = (val) => {
      if (singleSelect) {
        onChange([val]);
        setIsOpen(false);
      } else {
        if (selected.includes(val)) {
          onChange(selected.filter(v => v !== val));
        } else {
          onChange([...selected, val]);
        }
      }
    };`;
content = content.replace(multiSelectToggleStr, singleSelectToggleStr);

const multiSelectActionsStr = `            <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 12, fontSize: 13, backgroundColor: "#f9fafb" }}>
              <span onClick={selectAll} style={{ color: ZOMATO_BLUE, cursor: "pointer", fontWeight: 500 }}>Select All</span>
              <span onClick={selectNone} style={{ color: "#6b7280", cursor: "pointer", fontWeight: 500 }}>Select None</span>
            </div>`;
const singleSelectActionsStr = `            {!singleSelect && (
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 12, fontSize: 13, backgroundColor: "#f9fafb" }}>
                <span onClick={selectAll} style={{ color: ZOMATO_BLUE, cursor: "pointer", fontWeight: 500 }}>Select All</span>
                <span onClick={selectNone} style={{ color: "#6b7280", cursor: "pointer", fontWeight: 500 }}>Select None</span>
              </div>
            )}`;
content = content.replace(multiSelectActionsStr, singleSelectActionsStr);

const multiSelectPlaceholderStr = `{selected.length === 0 ? placeholder : \`\${selected.length} selected\`}`;
const singleSelectPlaceholderStr = `{selected.length === 0 ? placeholder : selected.length === 1 ? options.find(o => o.value === selected[0])?.label : \`\${selected.length} selected\`}`;
content = content.replace(multiSelectPlaceholderStr, singleSelectPlaceholderStr);

// 5. Update main store MultiSelect
content = content.replace(
  `hasSearch={true}
        />`,
  `hasSearch={true}
          singleSelect={true}
        />`
);

// 6. Remove yellow banner
const yellowBanner = `{selectedStores.length > 1 && (
            <div style={{ padding: 12, backgroundColor: "#fff3cd", border: "1px solid #ffeeba", color: "#856404", borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                Multiple Stores Selected ({selectedStores.length})
              </div>
              <p style={{ margin: "6px 0 0 0", fontSize: 13, lineHeight: "1.4" }}>
                Because you are updating multiple stores, the timing schedule below has been reset to a <strong>blank slate</strong> (08:00 to 23:59). <br/>
                Any changes you make and save here will overwrite the existing timings for <strong>ALL {selectedStores.length} selected stores</strong>.
              </p>
            </div>
          )}`;
content = content.replace(yellowBanner, '');

// 7. Change Save button to group
const oldSaveBtn = `<button 
                        onClick={handleSave}
                        disabled={loading || selectedStores.length === 0}
                        style={{
                          padding: "10px 24px",
                          backgroundColor: loading || selectedStores.length === 0 ? "#d1d5db" : platformColor,
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 15,
                          fontWeight: 500,
                          cursor: loading || selectedStores.length === 0 ? "not-allowed" : "pointer",
                          transition: "background-color 0.2s"
                        }}
                      >
                        {loading ? "Saving..." : "Save"}
                      </button>`;
const newSaveBtns = `<div style={{ display: "flex", gap: 12 }}>
                        <button 
                          onClick={handleSave}
                          disabled={loading || selectedStores.length === 0}
                          style={{
                            padding: "10px 24px",
                            backgroundColor: loading || selectedStores.length === 0 ? "#d1d5db" : platformColor,
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: loading || selectedStores.length === 0 ? "not-allowed" : "pointer"
                          }}
                        >
                          {loading ? "Saving..." : "Save (Selected Store Only)"}
                        </button>
                        <button 
                          onClick={() => setShowBulkModal(true)}
                          disabled={loading || selectedStores.length === 0}
                          style={{
                            padding: "10px 24px",
                            backgroundColor: loading || selectedStores.length === 0 ? "#d1d5db" : "#111827",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: loading || selectedStores.length === 0 ? "not-allowed" : "pointer"
                          }}
                        >
                          Apply to Multiple Stores
                        </button>
                      </div>`;
content = content.replace(oldSaveBtn, newSaveBtns);

// 8. Inject modal at the bottom above TimingAuditModal
const bulkModalJSX = `
      {showBulkModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 600, maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Bulk Apply Timings</h2>
              <button onClick={() => setShowBulkModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14, color: "#374151" }}>1. Which days do you want to apply?</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {DAYS.map(day => (
                    <label key={day} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#4b5563", cursor: "pointer" }}>
                      <input 
                        type="checkbox" 
                        checked={bulkSelectedDays[day]}
                        onChange={(e) => setBulkSelectedDays(prev => ({ ...prev, [day]: e.target.checked }))}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14, color: "#374151" }}>2. Select the target stores</h4>
                <MultiSelect 
                  options={currentStores.map(s => ({
                    value: s[currentIdField], 
                    label: s.name, 
                    sublabel: s.brand
                  }))}
                  selected={bulkSelectedStores}
                  onChange={setBulkSelectedStores}
                  placeholder="Select stores to overwrite..."
                  width="100%"
                  hasSearch={true}
                />
              </div>
            </div>
            
            <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 12, backgroundColor: "#f9fafb", borderRadius: "0 0 12px 12px" }}>
              <button 
                onClick={() => setShowBulkModal(false)}
                style={{ padding: "8px 16px", backgroundColor: "#fff", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 500 }}
              >
                Cancel
              </button>
              <button 
                onClick={handleBulkSave}
                disabled={loading || bulkSelectedStores.length === 0}
                style={{ padding: "8px 16px", backgroundColor: loading ? "#d1d5db" : "#111827", color: "#fff", border: "none", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500 }}
              >
                {loading ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Modal */}`;
content = content.replace('{/* Audit Modal */}', bulkModalJSX);

fs.writeFileSync('src/features/timing/TimingPage.jsx', content);
console.log("Patched successfully!");
