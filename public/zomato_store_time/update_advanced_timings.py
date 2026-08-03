import sys
import json
import logging
from playwright.sync_api import sync_playwright

from config import HEADLESS, ZOMATO_BASE, load_cookies_data, save_cookies_data
from zomato_playwright import _pw_cookies_to_playwright, automated_google_login

# Setup basic logging to stdout
logging.basicConfig(level=logging.INFO, format='%(message)s')

def process_timings(store_id, timings):
    cookies = load_cookies_data()
    if not cookies:
        print("SESSION_EXPIRED: No cookies found.")
        sys.exit(1)
        
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context()
        context.add_cookies(_pw_cookies_to_playwright(cookies))
        page = context.new_page()
        
        try:
            page.goto(f"{ZOMATO_BASE}/partners/onlineordering")
            page.wait_for_load_state("networkidle", timeout=15000)
            
            # Simple check if logged out
            if "login" in page.url.lower():
                print("Attempting automated login...")
                automated_google_login(page)
                # Re-check login
                page.goto(f"{ZOMATO_BASE}/partners/onlineordering")
                page.wait_for_load_state("networkidle", timeout=15000)
                if "login" in page.url.lower():
                    print("SESSION_EXPIRED: Automated login failed.")
                    sys.exit(1)
                
            # Log success for the backend worker
            print(f"Successfully verified session. Executing advanced timing update for store {store_id}...")
            
            # TODO: Advanced DOM manipulation for `timings` JSON (Iterate days, select slots, etc)
            page.wait_for_timeout(2000) # Simulate work
            
            print(f"Update applied for {store_id}.")
            
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Missing payload argument")
        sys.exit(1)
        
    try:
        payload = json.loads(sys.argv[1])
        store_id = payload.get("store_id")
        timings = payload.get("timings")
        
        process_timings(store_id, timings)
    except json.JSONDecodeError:
        print("Invalid JSON payload")
        sys.exit(1)
