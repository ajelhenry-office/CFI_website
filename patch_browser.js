import fs from 'fs';

// Patch update_advanced_timings.py
let t_file = 'public/zomato_store_time/update_advanced_timings.py';
let t_content = fs.readFileSync(t_file, 'utf8');
t_content = t_content.replace(
  'browser = p.chromium.launch(headless=HEADLESS)',
  'browser = p.firefox.launch(headless=HEADLESS)'
);
fs.writeFileSync(t_file, t_content);

// Patch zomato_playwright.py
let z_file = 'public/zomato_store_time/zomato_playwright.py';
let z_content = fs.readFileSync(z_file, 'utf8');
const old_launch = `        browser = p.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--no-sandbox",
            ]
        )`;
const new_launch = `        browser = p.firefox.launch(
            headless=headless
        )`;
z_content = z_content.replace(old_launch, new_launch);
fs.writeFileSync(z_file, z_content);

console.log('Patched browser launch to Firefox successfully!');
