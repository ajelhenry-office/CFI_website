from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.firefox.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    try:
        print("Navigating with Firefox...")
        page.goto("https://www.zomato.com/partners/onlineordering", wait_until="load")
        print("Success! Title:", page.title())
    except Exception as e:
        print("Error navigating:", e)
    browser.close()
