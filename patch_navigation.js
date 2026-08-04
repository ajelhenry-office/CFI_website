import fs from 'fs';

const file = 'public/zomato_store_time/update_advanced_timings.py';
let content = fs.readFileSync(file, 'utf8');

const oldBlock = `            # Select store
            from zomato_playwright import select_outlet_by_last4
            if not select_outlet_by_last4(page, store_id[-4:], 0):
                print(f"FAILED: Could not select store {store_id}")
                sys.exit(1)
                
            page.wait_for_timeout(2000)
            
            # Navigate to Store Timings (Common Zomato selectors)
            try:
                timing_link = page.get_by_role("link", name="Timings").first
                if timing_link.is_visible(timeout=2000):
                    timing_link.click()
                else:
                    # Alternative navigation
                    page.goto(f"{ZOMATO_BASE}/partners/onlineordering/timings")
                page.wait_for_load_state("networkidle")
            except Exception:
                page.goto(f"{ZOMATO_BASE}/partners/onlineordering/timings")
                page.wait_for_load_state("networkidle")
                
            page.wait_for_timeout(2000)`;

const newBlock = `            # Navigate directly to the Store Timings page using the resId URL parameter
            direct_timings_url = f"{ZOMATO_BASE}/partners/onlineordering/outletInfo/outletTimings?resId={store_id}"
            print(f"Navigating directly to {direct_timings_url}")
            page.goto(direct_timings_url)
            page.wait_for_load_state("networkidle", timeout=15000)
            page.wait_for_timeout(2000)`;

content = content.replace(oldBlock, newBlock);
fs.writeFileSync(file, content);
console.log("Patched store navigation successfully!");
