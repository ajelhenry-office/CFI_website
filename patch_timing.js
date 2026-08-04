import fs from 'fs';

let content = fs.readFileSync('src/features/timing/TimingPage.jsx', 'utf8');

// 1. Fix useEffect dependency
content = content.replace(
  `} else if (selectedStores.length === 0) {
      setTimings(getDefaultTimings());
    }
  }, [selectedStores.length === 1 ? selectedStores[0] : null]);`,
  `} else {
      // If 0 or >1 stores, reset to default blank slate
      setTimings(getDefaultTimings());
    }
  }, [selectedStores.length === 1 ? selectedStores[0] : 'multiple']);`
);

// 2. Add banner right before the days list
const targetLine = `<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: "#111827" }}>
              {activePlatform === "zomato" ? "Zomato Timings" : "Swiggy Timings"}
            </h3>`;

const banner = `{selectedStores.length > 1 && (
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
          )}
          
          `;

content = content.replace(targetLine, banner + targetLine);

fs.writeFileSync('src/features/timing/TimingPage.jsx', content);
console.log('Patched TimingPage.jsx');
