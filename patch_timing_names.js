import fs from 'fs';

let content = fs.readFileSync('src/features/timing/TimingPage.jsx', 'utf8');

// Change the MultiSelect for store names to use the formatted labels
const oldMap = `options={filteredStores.map(s => ({ label: s.name, sublabel: s[currentIdField], value: s[currentIdField] }))}`;
// Wait, in my current file it might be:
// options={filteredStores.map(s => ({
//   value: s[currentIdField], 
//   label: s.name, 
//   sublabel: s.brand
// }))}

const newMapStr = `options={filteredStores.map(s => {
            const parts = s.name.split(" - ");
            const locality = parts.length >= 2 ? parts[0] : s.name;
            const bName = parts.length >= 2 ? parts[1] : s.brand;
            return {
              value: s[currentIdField], 
              label: bName, 
              sublabel: \`\${locality} | Res ID: \${s[currentIdField]}\`
            };
          })}`;

content = content.replace(
  `options={filteredStores.map(s => ({ label: s.name, sublabel: s[currentIdField], value: s[currentIdField] }))}`,
  newMapStr
);
content = content.replace(
  `options={filteredStores.map(s => ({
                value: s[currentIdField], 
                label: s.name, 
                sublabel: s.brand
              }))}`,
  newMapStr
);
content = content.replace(
  `options={currentStores.map(s => ({
                    value: s[currentIdField], 
                    label: s.name, 
                    sublabel: s.brand
                  }))}`,
  newMapStr.replace('filteredStores', 'currentStores')
);

fs.writeFileSync('src/features/timing/TimingPage.jsx', content);
console.log("Patched store names layout.");
