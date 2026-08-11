const fs = require('fs');
let content = fs.readFileSync('src/features/ops_matrix/OpsMatrixPage.jsx', 'utf8');

const newHooks = fs.readFileSync('new_hooks.txt', 'utf8');
const newUI = fs.readFileSync('new_ui.txt', 'utf8');

let hooksStart = content.indexOf('export default function OpsMatrixPage() {');
let layoutStart = content.indexOf('return (', hooksStart);

// Inject hooks
content = content.slice(0, hooksStart) + newHooks + '\  ' + content.slice(layoutStart);

// Replace UI
const uiRegex = /<div style=\{\{ display: "flex", gap: 12, alignItems: "center",[\s\S]*?<\/div>\s*<\/div>/;
content = content.replace(uiRegex, newUI);

fs.writeFileSync('src/features/ops_matrix/OpsMatrixPage.jsx', content);
console.log("Patched successfully.");
