import fs from 'fs';

let content = fs.readFileSync('src/features/timing/TimingPage.jsx', 'utf8');

// 1. Locate the exact block
const startIndex = content.indexOf('  const ZOMATO_BLUE = "#2368ee";');
const endMarker = '  };';
// find the first '  };' after startIndex + 100
let endIndex = content.indexOf(endMarker, startIndex + 100);

if (startIndex !== -1 && endIndex !== -1) {
  // we want to include the '  };\n'
  const blockToMove = content.substring(startIndex, endIndex + endMarker.length + 1);
  
  // 2. Remove the block from the original location
  content = content.substring(0, startIndex) + content.substring(endIndex + endMarker.length + 1);
  
  // 3. Insert the block just before `export default function TimingPage() {`
  const targetIndex = content.indexOf('export default function TimingPage() {');
  
  // clean up the indentation of the block for the root level
  const cleanedBlock = blockToMove.split('\n').map(line => line.replace(/^  /, '')).join('\n');
  
  content = content.substring(0, targetIndex) + cleanedBlock + '\n' + content.substring(targetIndex);
  
  fs.writeFileSync('src/features/timing/TimingPage.jsx', content);
  console.log("Successfully moved MultiSelect out of TimingPage!");
} else {
  console.error("Could not find the block to move.");
}
