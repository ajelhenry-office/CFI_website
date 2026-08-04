import fs from 'fs';

let content = fs.readFileSync('src/features/timing/TimingPage.jsx', 'utf8');

const targetStr = `                />
              </div>
            </div>`;

const previewBlock = `                />
              </div>

              <div>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14, color: "#374151" }}>3. Preview of Timings to Apply</h4>
                <div style={{ padding: 12, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#4b5563" }}>
                  <p style={{ margin: "0 0 8px 0", fontStyle: "italic", color: "#6b7280" }}>
                    The following timings (currently loaded on the main screen) will be copied to all selected stores:
                  </p>
                  {DAYS.filter(day => bulkSelectedDays[day]).length === 0 ? (
                    <div style={{ color: "#ef4444", fontWeight: 500 }}>No days selected. Nothing will be saved!</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {DAYS.filter(day => bulkSelectedDays[day]).map(day => {
                        const dayData = timings[day];
                        if (!dayData.open) {
                          return <div key={day} style={{ display: "flex", gap: 8 }}><strong style={{ width: 80 }}>{day}:</strong> <span style={{ color: "#ef4444" }}>Closed</span></div>;
                        }
                        return (
                          <div key={day} style={{ display: "flex", gap: 8 }}>
                            <strong style={{ width: 80 }}>{day}:</strong>
                            <span>{dayData.slots.map(s => \`\${s.start || "00:00"} - \${s.end || "00:00"}\`).join(", ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>`;

content = content.replace(targetStr, previewBlock);

fs.writeFileSync('src/features/timing/TimingPage.jsx', content);
console.log("Patched modal with preview successfully.");
