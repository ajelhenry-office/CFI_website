import sys
import json
from playwright.sync_api import sync_playwright

from config import HEADLESS, ZOMATO_BASE, load_cookies_data
from zomato_playwright import _pw_cookies_to_playwright

cookies = load_cookies_data()
with sync_playwright() as p:
    browser = p.firefox.launch(headless=True)
    context = browser.new_context()
    context.add_cookies(_pw_cookies_to_playwright(cookies))
    page = context.new_page()
    
    url = f"{ZOMATO_BASE}/partners/onlineordering/outletInfo/outletTimings?resId=20366294"
    print(f"Going to {url}")
    page.goto(url)
    page.wait_for_load_state("networkidle", timeout=15000)
    page.wait_for_timeout(3000)
    
    html = page.content()
    with open("zomato_timings_dump.html", "w") as f:
        f.write(html)
        
    print("Page title:", page.title())
    print("Text on page containing 'Mon' or 'day':")
    import re
    # Just grab all text content to see what it looks like
    print(page.locator("body").inner_text()[:1000])
    
    browser.close()
