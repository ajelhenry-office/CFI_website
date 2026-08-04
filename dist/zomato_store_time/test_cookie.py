from playwright.sync_api import sync_playwright
import json

def test_cookie():
    try:
        with open("cookies.json", "r") as f:
            cookies = json.load(f)
    except Exception as e:
        print("Error loading cookies:", e)
        return

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-http2", "--disable-blink-features=AutomationControlled"]
        )
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        
        pw_cookies = []
        for c in cookies:
            entry = {
                "name": c["name"],
                "value": c["value"],
                "domain": c["domain"],
                "path": c.get("path", "/")
            }
            if c.get("expires"):
                entry["expires"] = c["expires"]
            pw_cookies.append(entry)
            
        for c in pw_cookies:
            try:
                ctx.add_cookies([c])
            except Exception:
                pass

        page = ctx.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        print("Navigating to dashboard...")
        try:
            page.goto("https://www.zomato.com/partners/onlineordering", wait_until="domcontentloaded", timeout=15000)
        except Exception as e:
            print("Page load timeout (expected):", e)
            
        page.wait_for_timeout(3000)
        
        print("Current URL:", page.url)
        if "login" in page.url or "accounts.google.com" in page.url:
            print("Cookie is EXPIRED or INVALID. Redirected to login.")
        else:
            print("Cookie is HEALTHY. Still logged in.")
            try:
                print("Page title:", page.title())
            except:
                pass
        browser.close()

test_cookie()
