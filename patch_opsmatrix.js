const fs = require('fs');
let content = fs.readFileSync('src/features/ops_matrix/OpsMatrixPage.jsx', 'utf8');

// 1. Add DateRangeButton Component
const dateRangeComp = `
function DateRangeButton({ startDate, endDate, onStartChange, onEndChange, hasError }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const d1 = new Date(startDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  const d2 = new Date(endDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button 
        onClick={() => setOpen(!open)}
        style={{ ...inputStyle, border: hasError ? "1px solid #ef4444" : inputStyle.border, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
      >
        <span>📅</span> {d1} - {d2}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", border: \`1px solid \${C.border}\`, borderRadius: 8, padding: 16, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", display: "flex", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>START DATE</div>
            <CustomDatePicker value={startDate} onChange={(e) => onStartChange(e.target.value)} max={endDate} hasError={hasError} />
          </div>
          <div style={{ color: C.muted, fontWeight: 600, marginTop: 16 }}>to</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>END DATE</div>
            <CustomDatePicker value={endDate} onChange={(e) => onEndChange(e.target.value)} min={startDate} max={new Date().toISOString().slice(0,10)} hasError={hasError} />
          </div>
        </div>
      )}
    </div>
  );
}
`;

content = content.replace('// --- Main Page ---', dateRangeComp + '\n// --- Main Page ---');

// 2. WeekSelector OptGroup
content = content.replace(/function WeekSelector[\s\S]*?return \(\s*<select[\s\S]*?<\/select>\s*\);\s*}/, `function WeekSelector({ onSelect }) {
  const weeksByYear = useMemo(() => {
    const year = new Date().getFullYear();
    const result = {};
    const firstDay = new Date(year, 0, 1);
    let startDay = new Date(firstDay);
    const offset = (startDay.getDay() === 0 ? 6 : startDay.getDay() - 1);
    startDay.setDate(startDay.getDate() - offset);
    
    for (let i = 1; i <= 52; i++) {
      const monday = new Date(startDay);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      
      const sStr = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const eStr = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const min = monday.toISOString().slice(0, 10);
      const max = sunday.toISOString().slice(0, 10);
      
      const yr = monday.getFullYear();
      if (!result[yr]) result[yr] = [];
      result[yr].push({ val: \`W\${i}\`, label: \`W\${i} (\${sStr} - \${eStr})\`, min, max });
      
      startDay.setDate(startDay.getDate() + 7);
    }
    return result;
  }, []);

  const years = Object.keys(weeksByYear).sort((a,b) => b.localeCompare(a));

  return (
    <select 
      onChange={(e) => {
        let selected = null;
        for (const yr of years) {
          selected = weeksByYear[yr].find(w => w.val === e.target.value);
          if (selected) break;
        }
        if (selected) onSelect(selected.min, selected.max);
        e.target.value = "";
      }}
      defaultValue=""
      style={{...inputStyle, padding: "8px 30px 8px 12px", background: "#f8fafc", cursor: "pointer", appearance: "none"}}
    >
      <option value="" disabled>Select Week...</option>
      {years.map(yr => (
        <optgroup key={yr} label={yr}>
          {weeksByYear[yr].map(w => <option key={\`\${yr}-\${w.val}\`} value={w.val}>{w.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}`);

// 3. State & fetchData & Filters overhaul
// Re-write the hooks portion completely to avoid regex mess

let hooksStart = content.indexOf('export default function OpsMatrixPage() {');
let layoutStart = content.indexOf('return (', hooksStart);

let newHooks = \`export default function OpsMatrixPage() {
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState([]);
  const [weekDefs, setWeekDefs] = useState([]);
  
  // Draft States
  const [startDate, setStartDate] = useState(iso(8));
  const [endDate, setEndDate] = useState(iso(1));
  const [brands, setBrands] = useState([]);
  const [subBrands, setSubBrands] = useState([]);
  const [zones, setZones] = useState([]);
  const [cities, setCities] = useState([]);
  const [areas, setAreas] = useState([]);

  // Applied States
  const [appliedStartDate, setAppliedStartDate] = useState(iso(8));
  const [appliedEndDate, setAppliedEndDate] = useState(iso(1));
  const [appliedBrands, setAppliedBrands] = useState([]);
  const [appliedSubBrands, setAppliedSubBrands] = useState([]);
  const [appliedZones, setAppliedZones] = useState([]);
  const [appliedCities, setAppliedCities] = useState([]);
  const [appliedAreas, setAppliedAreas] = useState([]);

  const diffDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  const dateError = diffDays < 0 ? "Start date must be before end date." :
                    diffDays > 30 ? "Please choose a range of at most 1 month." : null;

  const [availBrands, setAvailBrands] = useState([]);
  const [availSubBrands, setAvailSubBrands] = useState([]);
  const [availZones, setAvailZones] = useState([]);
  const [availCities, setAvailCities] = useState([]);
  const [availAreas, setAvailAreas] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const bPayload = appliedBrands.length === 1 ? appliedBrands[0] : "";
      const zPayload = appliedZones.length === 1 ? appliedZones[0] : "";
      const cPayload = appliedCities.length === 1 ? appliedCities[0] : "";
      const aPayload = appliedAreas.length === 1 ? appliedAreas[0] : "";
      // subBrand logic if we want to pass it
      const sbPayload = appliedSubBrands.length === 1 ? appliedSubBrands[0] : "";

      const cacheKey = JSON.stringify({ startDate: appliedStartDate, endDate: appliedEndDate, brand: bPayload, subBrand: sbPayload, zone: zPayload, city: cPayload, area: aPayload });
      
      let rowsToProcess = [];

      if (queryCache.has(cacheKey)) {
        rowsToProcess = queryCache.get(cacheKey);
      } else {
        let json = null;
        let fetchSuccess = false;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const payloadParams = {
              startDate: appliedStartDate,
              endDate: appliedEndDate,
              brand: bPayload,
              zone: zPayload,
              city: cPayload,
              area: aPayload
            };
            if (sbPayload) payloadParams.subBrand = sbPayload;

            const response = await fetch(\`\${API_BASE}/api/ops-matrix/prep-time/kitchen\`, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                ...getAuthHeaders()
              },
              body: JSON.stringify(payloadParams)
            });

            if (response.ok) {
              json = await response.json();
              fetchSuccess = true;
              break;
            } else if (response.status === 504 && attempt < 3) {
              console.warn(\`[OpsMatrix] Vercel 504 Timeout on attempt \${attempt}. Waiting...\`);
              await new Promise(r => setTimeout(r, 4000));
            } else {
              break;
            }
          } catch (err) {
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 3000));
            }
          }
        }

        if (fetchSuccess && json && json.success && json.data && json.data.rows) {
          rowsToProcess = json.data.rows;
        }
      }

      if (rowsToProcess.length > 0) {
        const weekExtremes = {};
        rowsToProcess.forEach(r => {
          if (r[4]) {
            const wVal = getWeekInfo(r[4]);
            if (!weekExtremes[wVal]) weekExtremes[wVal] = { min: r[4], max: r[4] };
            if (r[4] < weekExtremes[wVal].min) weekExtremes[wVal].min = r[4];
            if (r[4] > weekExtremes[wVal].max) weekExtremes[wVal].max = r[4];
          }
        });

        const weekMap = {};
        Object.keys(weekExtremes).forEach(wVal => {
          const minStr = formatDateFriendly(weekExtremes[wVal].min);
          const maxStr = formatDateFriendly(weekExtremes[wVal].max);
          weekMap[wVal] = minStr === maxStr ? \`\${wVal} (\${minStr})\` : \`\${wVal} (\${minStr} - \${maxStr})\`;
        });

        const mappedRows = rowsToProcess.map(r => {
          const newRow = [...r];
          if (r[4]) {
            newRow[4] = getWeekInfo(r[4]);
          }
          return newRow;
        });

        const weeks = Object.keys(weekMap)
          .sort((a, b) => a.localeCompare(b))
          .map(val => ({ val, label: weekMap[val] }));

        setRawData(mappedRows);
        setWeekDefs(weeks);

        if (appliedBrands.length === 0 && appliedSubBrands.length === 0 && appliedZones.length === 0 && appliedCities.length === 0 && appliedAreas.length === 0) {
          updateCascadingOptions(mappedRows, [], [], [], [], []);
        }
      } else {
        setRawData([]);
        setWeekDefs([]);
      }
    } catch (err) {
      setRawData([]);
      setWeekDefs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [appliedStartDate, appliedEndDate]);

  useEffect(() => {
    if (rawData.length > 0) {
      updateCascadingOptions(rawData, brands, subBrands, zones, cities, areas);
    }
  }, [brands, subBrands, zones, cities, areas]);

  const updateCascadingOptions = (allRows, bFilter, sbFilter, zFilter, cFilter, aFilter) => {
    const bSet = new Set();
    const sbSet = new Set();
    const zSet = new Set();
    const cSet = new Set();
    const aSet = new Set();

    allRows.forEach(r => {
      const bName = r[0] || "Unknown";
      const sbName = r[1] || "None";
      const cName = r[2] || "Unknown City";
      const kName = r[3] || "Unknown Kitchen";
      const zName = CITY_TO_ZONE[cName] || "OTHER";

      const brandMatch = bFilter.length === 0 || bFilter.includes(bName);
      const subBrandMatch = sbFilter.length === 0 || sbFilter.includes(sbName);
      const zoneMatch = zFilter.length === 0 || zFilter.includes(zName);
      const cityMatch = cFilter.length === 0 || cFilter.includes(cName);
      const areaMatch = aFilter.length === 0 || aFilter.includes(kName);

      if (brandMatch && zoneMatch && cityMatch && areaMatch) sbSet.add(sbName);
      if (subBrandMatch && zoneMatch && cityMatch && areaMatch) bSet.add(bName);
      if (brandMatch && subBrandMatch && cityMatch && areaMatch) zSet.add(zName);
      if (brandMatch && subBrandMatch && zoneMatch && areaMatch) cSet.add(cName);
      if (brandMatch && subBrandMatch && zoneMatch && cityMatch) aSet.add(kName);
    });

    setAvailBrands(Array.from(bSet).sort());
    setAvailSubBrands(Array.from(sbSet).sort());
    setAvailZones(Array.from(zSet).sort());
    setAvailCities(Array.from(cSet).sort());
    setAvailAreas(Array.from(aSet).sort());
  };

  const filteredRows = useMemo(() => {
    return rawData.filter(r => {
      const bName = r[0] || "Unknown";
      const sbName = r[1] || "None";
      const cName = r[2] || "Unknown City";
      const kName = r[3] || "Unknown Kitchen";
      const zName = CITY_TO_ZONE[cName] || "OTHER";
      
      if (appliedBrands.length > 0 && !appliedBrands.includes(bName)) return false;
      if (appliedSubBrands.length > 0 && !appliedSubBrands.includes(sbName)) return false;
      if (appliedZones.length > 0 && !appliedZones.includes(zName)) return false;
      if (appliedCities.length > 0 && !appliedCities.includes(cName)) return false;
      if (appliedAreas.length > 0 && !appliedAreas.includes(kName)) return false;
      return true;
    });
  }, [rawData, appliedBrands, appliedSubBrands, appliedZones, appliedCities, appliedAreas]);

  // Overall Stats
  const stats = useMemo(() => {
    let tOrders = 0;
    let sKpt = 0;
    let sP80 = 0;
    let sO2d = 0;
    let sP80O2d = 0;
    let kitchens = new Set();
    
    filteredRows.forEach(r => {
      kitchens.add(r[3]);
      const orders = r[5] || 0;
      tOrders += orders;
      sKpt += (r[7] || 0) * orders;
      sP80 += (r[8] || 0) * orders;
      sO2d += (r[11] || 0) * orders;
      sP80O2d += (r[12] || 0) * orders;
    });

    return {
      totalKitchens: kitchens.size,
      totalOrders: tOrders,
      avgKpt: tOrders ? (sKpt / tOrders).toFixed(1) : 0,
      p80Kpt: tOrders ? (sP80 / tOrders).toFixed(1) : 0,
      avgO2d: tOrders ? (sO2d / tOrders).toFixed(1) : 0,
      avgO2del: tOrders ? (sO2d / tOrders + 15).toFixed(1) : 0,
      p80O2del: tOrders ? (sP80O2d / tOrders + 15).toFixed(1) : 0,
    };
  }, [filteredRows]);

  let isDefault = false;
  if (appliedAreas.length === 0 && appliedCities.length === 0 && appliedZones.length === 0 && appliedBrands.length === 0 && appliedSubBrands.length === 0) {
    isDefault = true;
  }
  
  let headerLabel = "Overall Summary";
  if (!isDefault) {
      if (appliedBrands.length > 0 && (appliedAreas.length || appliedCities.length || appliedZones.length)) headerLabel = "Brand / Location";
      else if (appliedBrands.length > 0) headerLabel = "Brand";
      else if (appliedSubBrands.length > 0) headerLabel = "Sub-Brand";
      else if (appliedAreas.length > 0) headerLabel = "Kitchen";
      else if (appliedCities.length > 0) headerLabel = "City";
      else if (appliedZones.length > 0) headerLabel = "Zone";
  }

  // Group Data for Display
  const groupedData = useMemo(() => {
    const groups = {};
    filteredRows.forEach(r => {
      let key = "Curefoods Overall Summary";
      
      const bName = r[0] || "Unknown Brand";
      const sbName = r[1] || "None";
      const zName = \`\${CITY_TO_ZONE[r[2]] || "OTHER"} Zone\`;
      const cName = r[2] || "Unknown City";
      const aName = r[3] || "Unknown Kitchen";

      if (!isDefault) {
        if (appliedAreas.length > 0) key = aName;
        else if (appliedCities.length > 0) key = cName;
        else if (appliedZones.length > 0) key = zName;
        else if (appliedSubBrands.length > 0) key = sbName;
        else if (appliedBrands.length > 0) key = bName;
      }

      if (!groups[key]) {
        groups[key] = { name: key, orders: 0, sKpt: 0, sP80: 0, sO2d: 0, sO2del: 0, sP80O2del: 0, weekMap: {} };
      }
      
      const orders = r[5] || 0;
      const kpt = r[7] || 0;
      const p80 = r[8] || 0;
      const o2d = r[11] || 0;
      const o2del = o2d ? o2d + 15 : 0;
      const p80O2del = r[12] ? r[12] + 15 : 0;

      groups[key].orders += orders;
      groups[key].sKpt += (kpt * orders);
      groups[key].sP80 += (p80 * orders);
      groups[key].sO2d += (o2d * orders);
      groups[key].sO2del += (o2del * orders);
      groups[key].sP80O2del += (p80O2del * orders);

      const weekStr = r[4];
      if (!groups[key].weekMap[weekStr]) {
        groups[key].weekMap[weekStr] = { orders: 0, sKpt: 0, sP80: 0, sO2d: 0, sO2del: 0, sP80O2del: 0 };
      }
      groups[key].weekMap[weekStr].orders += orders;
      groups[key].weekMap[weekStr].sKpt += (kpt * orders);
      groups[key].weekMap[weekStr].sP80 += (p80 * orders);
      groups[key].weekMap[weekStr].sO2d += (o2d * orders);
      groups[key].weekMap[weekStr].sO2del += (o2del * orders);
      groups[key].weekMap[weekStr].sP80O2del += (p80O2del * orders);
    });

    return Object.keys(groups).map(k => {
      const g = groups[k];
      const weeks = Object.keys(g.weekMap).map(w => {
        const wd = g.weekMap[w];
        const def = weekDefs.find(x => x.val === w);
        return {
          weekVal: w,
          weekLabel: def ? def.label : w,
          orders: wd.orders,
          kpt: wd.orders ? wd.sKpt / wd.orders : 0,
          p80: wd.orders ? wd.sP80 / wd.orders : 0,
          o2d: wd.orders ? wd.sO2d / wd.orders : 0,
          o2del: wd.orders ? wd.sO2del / wd.orders : 0,
          p80O2del: wd.orders ? wd.sP80O2del / wd.orders : 0,
        };
      }).sort((a, b) => a.weekVal.localeCompare(b.weekVal));

      return {
        name: g.name,
        orders: g.orders,
        kpt: g.orders ? g.sKpt / g.orders : 0,
        p80: g.orders ? g.sP80 / g.orders : 0,
        o2d: g.orders ? g.sO2d / g.orders : 0,
        o2del: g.orders ? g.sO2del / g.orders : 0,
        p80O2del: g.orders ? g.sP80O2del / g.orders : 0,
        weeks
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows, weekDefs, isDefault, appliedBrands, appliedSubBrands, appliedAreas, appliedCities, appliedZones]);

  const handleApply = () => {
    if (dateError) return;
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedBrands(brands);
    setAppliedSubBrands(subBrands);
    setAppliedZones(zones);
    setAppliedCities(cities);
    setAppliedAreas(areas);
  };

  const handleClear = () => {
    setStartDate(iso(8));
    setEndDate(iso(1));
    setBrands([]);
    setSubBrands([]);
    setZones([]);
    setCities([]);
    setAreas([]);
    
    setAppliedStartDate(iso(8));
    setAppliedEndDate(iso(1));
    setAppliedBrands([]);
    setAppliedSubBrands([]);
    setAppliedZones([]);
    setAppliedCities([]);
    setAppliedAreas([]);
  };

  `;

content = content.slice(0, hooksStart) + newHooks + content.slice(layoutStart);

// 4. Update the UI layout
const uiRegex = /<div style={{ display: "flex", gap: 12, alignItems: "center",[\s\S]*?<\/div>\s*<\/div>/;
const newUI = \`
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", background: C.surface, padding: "16px 24px", borderRadius: 12, border: \\\`1px solid \${C.border}\\\`, overflowX: "auto", whiteSpace: "nowrap" }}>
          
          <DateRangeButton startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} hasError={!!dateError} />
          
          <div style={{ position: "relative", flexShrink: 0 }}>
            <WeekSelector onSelect={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }} />
            <svg style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.muted }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
          
          {dateError && <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>{dateError}</span>}
          
          <div style={{ width: 1, height: 24, background: C.border, margin: "0 4px", flexShrink: 0 }} />

          <div style={{ flexShrink: 0 }}><MultiSelectDropdown label="Brands" options={availBrands} selected={brands} onChange={setBrands} /></div>
          <div style={{ flexShrink: 0 }}><MultiSelectDropdown label="Sub-Brands" options={availSubBrands} selected={subBrands} onChange={setSubBrands} /></div>
          <div style={{ flexShrink: 0 }}><MultiSelectDropdown label="Zones" options={availZones} selected={zones} onChange={setZones} /></div>
          <div style={{ flexShrink: 0 }}><MultiSelectDropdown label="Cities" options={availCities} selected={cities} onChange={setCities} /></div>
          <div style={{ flexShrink: 0 }}><MultiSelectDropdown label="Areas" options={availAreas} selected={areas} onChange={setAreas} /></div>
        </div>
        
        {/* Centered Apply/Clear Buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <button 
            onClick={handleClear}
            style={{ padding: "8px 24px", background: "#f1f5f9", color: "#334155", border: \`1px solid \${C.border}\`, borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }} 
          >
            Clear
          </button>
          <button 
            onClick={handleApply}
            style={{ padding: "8px 32px", background: "#1e3a8a", color: "#ffffff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14, boxShadow: "0 2px 4px rgba(0,0,0,0.1)", letterSpacing: 0.3 }} 
          >
            Apply
          </button>
        </div>
      </div>\`;
content = content.replace(uiRegex, newUI);

fs.writeFileSync('src/features/ops_matrix/OpsMatrixPage.jsx', content);
console.log("OpsMatrixPage.jsx patched!");
