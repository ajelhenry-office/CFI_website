import { useState, useEffect } from "react";
import { C, FONT } from "../../theme";
import { ZOMATO_STORES } from "./zomato_data";
import { SWIGGY_STORES } from "./swiggy_data";
import { getAuthHeaders, handleApiError } from "../../api";
import TimingAuditModal from "./TimingAuditModal";

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3001");

// --- Icons ---
const ChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const ChevronUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15"></polyline>
  </svg>
);

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{cursor: "pointer"}}>
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

const LocationIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>
);

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"></path>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
  </svg>
);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function TimingPage() {
  const [activePlatform, setActivePlatform] = useState("zomato");
  const [loading, setLoading] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [copyAll, setCopyAll] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [liveTasks, setLiveTasks] = useState([]);
  const [showAudit, setShowAudit] = useState(false);

  // Initialize state for all days
  const [timings, setTimings] = useState(() => {
    const init = {};
    DAYS.forEach(d => {
      init[d] = {
        open: true,
        slots: [{ start: "08:00", end: "23:59" }]
      };
    });
    return init;
  });

  // Filter state
  const [selectedBrand, setSelectedBrand] = useState("");

  const currentStores = activePlatform === "zomato" ? ZOMATO_STORES : SWIGGY_STORES;
  const currentIdField = activePlatform === "zomato" ? "zomato_id" : "swiggy_id";

  const allBrands = [...new Set(currentStores.map(s => s.brand))].sort();
  
  const filteredStores = currentStores.filter(store => {
    return selectedBrand ? store.brand === selectedBrand : true;
  });

  const handlePlatformChange = (p) => {
    setActivePlatform(p);
    setSelectedBrand("");
    setStoreName("");
  };

  const updateSlot = (day, slotIndex, field, value) => {
    setTimings(prev => {
      const newTimings = { ...prev };
      const newDay = { ...newTimings[day], slots: [...newTimings[day].slots] };
      newDay.slots[slotIndex] = { ...newDay.slots[slotIndex], [field]: value };
      newTimings[day] = newDay;
      
      // If copy all is checked, copy this exact slot configuration to all other days
      if (copyAll) {
        DAYS.forEach(d => {
          if (d !== day) newTimings[d] = { ...newTimings[d], slots: [...newDay.slots] };
        });
      }
      return newTimings;
    });
  };

  const addSlot = (day) => {
    setTimings(prev => {
      const newTimings = { ...prev };
      const newDay = { ...newTimings[day], slots: [...newTimings[day].slots] };
      if (newDay.slots.length < 3) {
        newDay.slots.push({ start: "", end: "" });
      }
      newTimings[day] = newDay;

      if (copyAll) {
        DAYS.forEach(d => {
          if (d !== day) newTimings[d] = { ...newTimings[d], slots: [...newDay.slots] };
        });
      }
      return newTimings;
    });
  };

  const removeSlot = (day, slotIndex) => {
    setTimings(prev => {
      const newTimings = { ...prev };
      const newDay = { ...newTimings[day], slots: [...newTimings[day].slots] };
      newDay.slots.splice(slotIndex, 1);
      newTimings[day] = newDay;

      if (copyAll) {
        DAYS.forEach(d => {
          if (d !== day) newTimings[d] = { ...newTimings[d], slots: [...newDay.slots] };
        });
      }
      return newTimings;
    });
  };

  const toggleOutletOpen = (day, isOpen) => {
    setTimings(prev => {
      const newTimings = { ...prev };
      newTimings[day] = { ...newTimings[day], open: isOpen };
      
      if (copyAll) {
        DAYS.forEach(d => {
          if (d !== day) newTimings[d] = { ...newTimings[d], open: isOpen };
        });
      }
      return newTimings;
    });
  };

  const handleCopyAllChange = (e, currentExpandedDay) => {
    const isChecked = e.target.checked;
    setCopyAll(isChecked);
    if (isChecked) {
      // Immediately copy current expanded day to all others
      const template = timings[currentExpandedDay];
      setTimings(prev => {
        const next = { ...prev };
        DAYS.forEach(d => {
          next[d] = { open: template.open, slots: [...template.slots.map(s => ({...s}))] };
        });
        return next;
      });
    }
  };

  const fetchLiveTasks = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/timing/queue-status`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLiveTasks(data.tasks || []);
        }
      }
    } catch (err) {
      // Ignore poll errors
    }
  };

  useEffect(() => {
    fetchLiveTasks();
    const interval = setInterval(fetchLiveTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    if (selectedStores.length === 0) {
      setToastMsg("Please select at least one store.");
      setTimeout(() => setToastMsg(""), 3000);
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        platform: activePlatform,
        stores: selectedStores,
        timings: timings
      };
      
      const res = await fetch(`${API_BASE}/api/timing/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      
      if (handleApiError(res)) return;
      const data = await res.json();
      
      if (data.success) {
        setToastMsg(`Successfully queued ${selectedStores.length} stores for update.`);
        setTimeout(() => setToastMsg(""), 3000);
        fetchLiveTasks();
      } else {
        setToastMsg("Failed to queue updates: " + data.error);
        setTimeout(() => setToastMsg(""), 4000);
      }
    } catch (err) {
      setToastMsg("Error: " + err.message);
      setTimeout(() => setToastMsg(""), 4000);
    }
    setLoading(false);
  };

  const ZOMATO_BLUE = "#2368ee";

  // --- MultiSelect Component ---
  const MultiSelect = ({ options, selected, onChange, placeholder, width, hasSearch }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");

    const filteredOptions = hasSearch && search 
      ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase())))
      : options;

    const toggle = (val) => {
      if (selected.includes(val)) {
        onChange(selected.filter(v => v !== val));
      } else {
        onChange([...selected, val]);
      }
    };

    const selectAll = () => onChange(filteredOptions.map(o => o.value));
    const selectNone = () => onChange([]);

    return (
      <div style={{ position: "relative", width }}>
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: "10px 36px 10px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            backgroundColor: "#fff",
            color: "#374151",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            minHeight: 20
          }}
        >
          <div style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {selected.length === 0 ? placeholder : selected.length === 1 ? options.find(o => o.value === selected[0])?.label : `${selected.length} selected`}
          </div>
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }}>
            {isOpen ? <ChevronUp /> : <ChevronDown />}
          </div>
        </div>
        
        {isOpen && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
            backgroundColor: "#fff", border: "1px solid #d1d5db", borderRadius: 8,
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", zIndex: 10,
            maxHeight: 300, display: "flex", flexDirection: "column"
          }}>
            {hasSearch && (
              <div style={{ padding: 8, borderBottom: "1px solid #e5e7eb" }}>
                <input 
                  type="text" 
                  placeholder="Search..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: "100%", padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 4, boxSizing: "border-box", fontSize: 13 }}
                />
              </div>
            )}
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 12, fontSize: 13, backgroundColor: "#f9fafb" }}>
              <span onClick={selectAll} style={{ color: ZOMATO_BLUE, cursor: "pointer", fontWeight: 500 }}>Select All</span>
              <span onClick={selectNone} style={{ color: "#6b7280", cursor: "pointer", fontWeight: 500 }}>Select None</span>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
              {filteredOptions.length === 0 ? (
                <div style={{ padding: "8px 12px", color: "#6b7280", fontSize: 13 }}>No results found</div>
              ) : (
                filteredOptions.map(opt => (
                  <label key={opt.value} style={{ display: "flex", alignItems: "center", padding: "8px 12px", cursor: "pointer", gap: 8, fontSize: 13, color: "#374151" }}>
                    <input 
                      type="checkbox" 
                      checked={selected.includes(opt.value)}
                      onChange={() => toggle(opt.value)}
                      style={{ cursor: "pointer", accentColor: ZOMATO_BLUE }}
                    />
                    <div>
                      <div>{opt.label}</div>
                      {opt.sublabel && <div style={{ fontSize: 11, color: "#6b7280" }}>{opt.sublabel}</div>}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 20, width: "100%", boxSizing: "border-box", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      
      {/* Top Controls: Zomato delivery tab */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, borderBottom: "1px solid #e8e8e8" }}>
        {/* Platform Tabs */}
        <div style={{ display: "flex", gap: 24 }}>
          {["zomato", "swiggy"].map(p => {
            const isActive = activePlatform === p;
            return (
              <div
                key={p}
                onClick={() => handlePlatformChange(p)}
                style={{
                  padding: "0 8px 12px",
                  color: isActive ? (p === "zomato" ? ZOMATO_BLUE : "#fc8019") : "#6b7280",
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: "pointer",
                  position: "relative",
                  textTransform: "capitalize"
                }}
              >
                {p === "zomato" ? "Zomato delivery" : "Swiggy delivery"}
                {isActive && (
                  <div style={{
                    position: "absolute",
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 2,
                    backgroundColor: p === "zomato" ? ZOMATO_BLUE : "#fc8019"
                  }}></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters & Store Selection */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "center", flexWrap: "wrap", zIndex: 11, position: "relative" }}>
        
        <MultiSelect 
          options={allBrands.map(b => ({ label: b, value: b }))}
          selected={selectedBrands}
          onChange={(vals) => {
            setSelectedBrands(vals);
            setSelectedStores([]); // Reset stores when brands change
          }}
          placeholder="All Brands"
          width={220}
          hasSearch={false}
        />

        <MultiSelect 
          options={filteredStores.map(s => ({ label: s.name, sublabel: s[currentIdField], value: s[currentIdField] }))}
          selected={selectedStores}
          onChange={setSelectedStores}
          placeholder="Select stores to edit timings..."
          width={320}
          hasSearch={true}
        />

        <button style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#4b5563", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          View on {activePlatform === "zomato" ? "Zomato" : "Swiggy"}
        </button>
      </div>

      {/* Accordion List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {DAYS.map((day) => {
          const isExpanded = expandedDay === day;
          const data = timings[day];
          const platformColor = activePlatform === "zomato" ? ZOMATO_BLUE : "#fc8019";

          return (
            <div key={day} style={{ 
              border: "1px solid #e5e7eb", 
              borderRadius: 8, 
              backgroundColor: "#fff",
              overflow: "hidden" 
            }}>
              {/* Header */}
              <div 
                onClick={() => setExpandedDay(isExpanded ? null : day)}
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  backgroundColor: isExpanded ? platformColor : "#fff",
                  color: isExpanded ? "#fff" : "#374151",
                  fontWeight: 500,
                  fontSize: 15,
                  cursor: "pointer",
                  transition: "background-color 0.2s"
                }}
              >
                  {day}
                  {isExpanded ? <ChevronUp /> : <ChevronDown />}
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div style={{ padding: "24px 20px", backgroundColor: "#fff" }}>
                    
                    {/* Headers */}
                    <div style={{ display: "flex", marginBottom: 12, fontSize: 13, color: "#6b7280" }}>
                      <div style={{ width: 80 }}></div>
                      <div style={{ width: 140, textAlign: "center" }}>Start time</div>
                      <div style={{ width: 40 }}></div>
                      <div style={{ width: 140, textAlign: "center" }}>End time</div>
                    </div>

                    {/* Time Slots */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                      {data.slots.map((slot, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", position: "relative" }}>
                          
                          {/* Slot Label */}
                          <div style={{ width: 80, fontSize: 13, fontWeight: 500, color: "#6b7280" }}>
                            SLOT {idx + 1}
                          </div>

                          {/* Start Time Input */}
                          <div style={{ position: "relative", width: 140 }}>
                            <input 
                              type="time" 
                              value={slot.start}
                              onChange={(e) => updateSlot(day, idx, "start", e.target.value)}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                paddingRight: 32,
                                borderRadius: 6,
                                border: "1px solid #e5e7eb",
                                fontSize: 14,
                                color: "#374151",
                                boxSizing: "border-box",
                                outline: "none",
                                cursor: "pointer"
                              }}
                            />
                            <div style={{ position: "absolute", right: 10, top: 12, pointerEvents: "none" }}>
                              <PencilIcon />
                            </div>
                          </div>

                          {/* "to" separator */}
                          <div style={{ width: 40, textAlign: "center", fontSize: 13, color: "#4b5563" }}>to</div>

                          {/* End Time Input */}
                          <div style={{ position: "relative", width: 140 }}>
                            <input 
                              type="time" 
                              value={slot.end}
                              onChange={(e) => updateSlot(day, idx, "end", e.target.value)}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                paddingRight: 32,
                                borderRadius: 6,
                                border: "1px solid #e5e7eb",
                                fontSize: 14,
                                color: "#374151",
                                boxSizing: "border-box",
                                outline: "none",
                                cursor: "pointer"
                              }}
                            />
                            <div style={{ position: "absolute", right: 10, top: 12, pointerEvents: "none" }}>
                              <PencilIcon />
                            </div>
                          </div>

                          {/* Actions: Trash / Add */}
                          <div style={{ display: "flex", alignItems: "center", marginLeft: 24, gap: 16, flex: 1 }}>
                            {data.slots.length > 1 && (
                              <div onClick={() => removeSlot(day, idx)}>
                                <TrashIcon />
                              </div>
                            )}
                            
                            {/* Show "Add time slot" only on the last slot, if slots < 3 */}
                            {idx === data.slots.length - 1 && data.slots.length < 3 && (
                              <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                                <div 
                                  onClick={() => addSlot(day)}
                                  style={{ color: platformColor, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
                                >
                                  + Add time slot
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, backgroundColor: "#f3f4f6", margin: "24px 0" }}></div>

                    {/* Footer Actions */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      
                      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                        {/* Copy to all days */}
                        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 15, color: "#374151" }}>
                          <input 
                            type="checkbox" 
                            checked={copyAll}
                            onChange={(e) => handleCopyAllChange(e, day)}
                            style={{ width: 18, height: 18, cursor: "pointer", accentColor: platformColor, margin: 0, padding: 0 }}
                          />
                          Copy above timings to all days
                        </label>

                        <div style={{ width: 1, height: 20, backgroundColor: "#e5e7eb" }}></div>

                        {/* Outlet open toggle */}
                        <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontSize: 15, color: "#374151" }}>
                          <div style={{ 
                            width: 44, 
                            height: 24, 
                            backgroundColor: data.open ? "#22c55e" : "#d1d5db", 
                            borderRadius: 12, 
                            position: "relative",
                            transition: "background-color 0.2s"
                          }}>
                            <div style={{
                              width: 20,
                              height: 20,
                              backgroundColor: "#fff",
                              borderRadius: "50%",
                              position: "absolute",
                              top: 2,
                              left: data.open ? 22 : 2,
                              transition: "left 0.2s",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                            }}></div>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={data.open}
                            onChange={(e) => toggleOutletOpen(day, e.target.checked)}
                            style={{ display: "none" }}
                          />
                          Outlet open
                        </label>
                      </div>

                      {/* Save Button */}
                      <button 
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
                      </button>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
        
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", backgroundColor: "#333", color: "#fff", padding: "12px 24px", borderRadius: 8, zIndex: 9999, boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
          {toastMsg}
        </div>
      )}

      {/* Live Status Panel */}
      {liveTasks.length > 0 && (
        <div style={{ marginTop: 40, border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, backgroundColor: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Live Queue Status</h3>
            {liveTasks.some(t => t.status === "failed") && (
              <button 
                onClick={() => {
                   const failedStores = liveTasks.filter(t => t.status === "failed").map(t => t.store_id);
                   alert(`Retrying ${failedStores.length} failed stores...`);
                   // Future: hook this up to the bulk-update endpoint automatically
                }}
                style={{ padding: "6px 12px", backgroundColor: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Retry Failed Stores
              </button>
            )}
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead style={{ position: "sticky", top: 0, backgroundColor: "#f9fafb", zIndex: 5 }}>
                <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left", color: "#6b7280" }}>
                  <th style={{ padding: "12px 16px" }}>Store ID</th>
                  <th style={{ padding: "12px 16px" }}>Brand</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 16px" }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {liveTasks.map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 500 }}>{t.store_id}</td>
                    <td style={{ padding: "12px 16px" }}>{t.brand}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ 
                        padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500,
                        backgroundColor: t.status === "success" ? "#dcfce7" : t.status === "failed" ? "#fee2e2" : "#fef3c7",
                        color: t.status === "success" ? "#166534" : t.status === "failed" ? "#991b1b" : "#92400e"
                      }}>
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6b7280" }}>{t.error_message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showAudit && <TimingAuditModal onClose={() => setShowAudit(false)} selectedBrands={selectedBrands} />}
    </div>
  );
}

