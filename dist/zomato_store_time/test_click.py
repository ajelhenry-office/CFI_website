import sys
from playwright.sync_api import sync_playwright
from config import ZOMATO_BASE, load_cookies_data
from zomato_playwright import _pw_cookies_to_playwright

cookies = load_cookies_data()
with sync_playwright() as p:
    browser = p.firefox.launch(headless=True)
    context = browser.new_context()
    context.add_cookies(_pw_cookies_to_playwright(cookies))
    page = context.new_page()
    page.goto(f"{ZOMATO_BASE}/partners/onlineordering/outletInfo/outletTimings?resId=20366294")
    page.wait_for_load_state("networkidle", timeout=15000)
    
    print("Clicking Monday...")
    try:
        monday = page.get_by_text("Monday", exact=True).first
        monday.click(timeout=3000)
        page.wait_for_timeout(1000)
        
        # Click the first time block
        print("Clicking Start Time...")
        # Since we know "10:00 AM" is there, click it to open dropdown
        page.get_by_text("10:00 AM", exact=True).first.click()
        page.wait_for_timeout(1000)
        
        # See if dropdown appeared containing "08:00 AM"
        options = page.locator("text='08:00 AM'").count()
        print("Dropdown options found for 08:00 AM:", options)
        
    except Exception as e:
        print("Error:", e)
    
    browser.close()
