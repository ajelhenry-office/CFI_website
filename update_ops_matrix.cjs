const fs = require('fs');

const file = '/Users/ajelhenry/CFI_website/src/features/ops_matrix/OpsMatrixPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Insert DateFilterDropdown component before OpsMatrixPage
const dateDropdownCode = `
function DateFilterDropdown({ start, end, onStart, onEnd, error }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 180, flex: 1 }}>
      <button onClick={() => setOpen(!open)} style={{...inputStyle, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer"}}>
        <span style={{ fontWeight: 400, color: C.text }}>
          {start} to {end}
        </span>
        <span style={{ fontSize: 10, color: C.muted }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, padding: "16px", background: "#fff", border: \`1px solid \${C.border}\`, borderRadius: 8, zIndex: 50, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>From</span>
              <CustomDatePicker value={start} onChange={onStart} max={end} hasError={!!error} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>To</span>
              <CustomDatePicker value={end} onChange={onEnd} min={start} max={iso(0)} hasError={!!error} />
            </div>
          </div>
          {error && <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 600 }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

// --- Main Page ---`;
content = content.replace('// --- Main Page ---', dateDropdownCode);

// 2. Add draft state in OpsMatrixPage
const stateRegex = /  \/\/ Date Filters\s+const \[startDate, setStartDate\] = useState\(iso\(8\)\);\s+const \[endDate, setEndDate\] = useState\(iso\(1\)\);[\s\S]*?const \[areas, setAreas\] = useState\(\[\]\);/;
const newStateCode = `  // Applied Filters
  const [startDate, setStartDate] = useState(iso(8));
  const [endDate, setEndDate] = useState(iso(1));
  const [brands, setBrands] = useState([]);
  const [zones, setZones] = useState([]);
  const [cities, setCities] = useState([]);
  const [areas, setAreas] = useState([]);

  // Draft Filters (UI State)
  const [draftStartDate, setDraftStartDate] = useState(iso(8));
  const [draftEndDate, setDraftEndDate] = useState(iso(1));
  const [draftBrands, setDraftBrands] = useState([]);
  const [draftZones, setDraftZones] = useState([]);
  const [draftCities, setDraftCities] = useState([]);
  const [draftAreas, setDraftAreas] = useState([]);

  const diffDays = (new Date(draftEndDate) - new Date(draftStartDate)) / (1000 * 60 * 60 * 24);
  const draftDateError = diffDays < 0 ? "Start date must be before end date." :
                    diffDays > 30 ? "Please choose a range of at most 1 month." : null;
  const appliedDiffDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  const dateError = appliedDiffDays < 0 || appliedDiffDays > 30 ? "Invalid applied date." : null;
`;
content = content.replace(stateRegex, newStateCode);

// 3. Update useEffect for cascading to use draft state
content = content.replace(
  `  useEffect(() => {\n    if (rawData.length > 0) {\n      updateCascadingOptions(rawData, brands, zones, cities, areas);\n    }\n  }, [brands, zones, cities, areas]);`,
  `  useEffect(() => {\n    if (rawData.length > 0) {\n      updateCascadingOptions(rawData, draftBrands, draftZones, draftCities, draftAreas);\n    }\n  }, [draftBrands, draftZones, draftCities, draftAreas, rawData]);`
);

// 4. Update JSX filters UI
const oldJsxRegex = /\{\/\* Top Filters \(Instant Apply\) \*\/\}[\s\S]*?<\/div>\s*<\/div>/;
const newJsxCode = `{/* Top Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, background: C.surface, padding: "16px 24px", borderRadius: 12, border: \`1px solid \${C.border}\` }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <DateFilterDropdown start={draftStartDate} end={draftEndDate} onStart={e => setDraftStartDate(e.target.value)} onEnd={e => setDraftEndDate(e.target.value)} error={draftDateError} />
          
          <div style={{ width: 1, height: 24, background: C.border, margin: "0 8px" }} />

          <MultiSelectDropdown label="Brands" options={availBrands} selected={draftBrands} onChange={setDraftBrands} />
          <MultiSelectDropdown label="Zones" options={availZones} selected={draftZones} onChange={setDraftZones} />
          <MultiSelectDropdown label="Cities" options={availCities} selected={draftCities} onChange={setDraftCities} />
          <MultiSelectDropdown label="Areas" options={availAreas} selected={draftAreas} onChange={setDraftAreas} />
        </div>

        {/* Apply and Clear centered */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, borderTop: \`1px solid \${C.borderSoft}\`, paddingTop: 16 }}>
          <button 
            style={{ padding: "8px 24px", background: C.primary, color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
            onClick={() => {
              if (draftDateError) return;
              setStartDate(draftStartDate);
              setEndDate(draftEndDate);
              setBrands(draftBrands);
              setZones(draftZones);
              setCities(draftCities);
              setAreas(draftAreas);
            }}
          >
            Apply Filters
          </button>
          <button 
            style={{ padding: "8px 24px", background: "none", color: "#ef4444", border: \`1px solid #ef4444\`, borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13 }} 
            onClick={() => {
              setDraftStartDate(iso(8));
              setDraftEndDate(iso(1));
              setDraftBrands([]);
              setDraftZones([]);
              setDraftCities([]);
              setDraftAreas([]);
              
              setStartDate(iso(8));
              setEndDate(iso(1));
              setBrands([]);
              setZones([]);
              setCities([]);
              setAreas([]);
            }}
          >
            Clear Filters
          </button>
        </div>
      </div>`;

content = content.replace(oldJsxRegex, newJsxCode);

fs.writeFileSync(file, content);
console.log('File updated successfully.');
