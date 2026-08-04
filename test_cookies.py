from playwright.sync_api import sync_playwright
import json
import traceback
import sys

def _pw_cookies_to_playwright(cookies):
    out = []
    for c in cookies:
        if "domain" not in c or "name" not in c or "value" not in c:
            continue
        
        entry = {
            "name": c["name"],
            "value": str(c["value"])
        }
        
        # Handle __Host- prefix which strictly forbids domain attributes
        if c["name"].startswith("__Host-"):
            domain = c["domain"].lstrip('.') # e.g. api.zomato.com
            entry["url"] = f"https://{domain}/"
            entry["secure"] = True
        elif c["name"].startswith("__Secure-"):
            entry["domain"] = c["domain"]
            entry["path"] = c.get("path", "/")
            entry["secure"] = True
        else:
            entry["domain"] = c["domain"]
            entry["path"] = c.get("path", "/")
            
        if c.get("expires") is not None:
            try:
                entry["expires"] = float(c["expires"])
            except:
                pass
        if c.get("sameSite") in ["Strict", "Lax", "None"]:
            entry["sameSite"] = c["sameSite"]
        out.append(entry)
    return out

with open('/Users/ajelhenry/CFI_website/public/zomato_store_time/cookies.json', 'r') as f:
    cookies = json.load(f)

pw_cookies = _pw_cookies_to_playwright(cookies)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    for c in pw_cookies:
        try:
            context.add_cookies([c])
        except Exception as e:
            print(f"FAILED COOKIE: {c}")
            print(e)
            sys.exit(1)
    print("ALL COOKIES ADDED SUCCESSFULLY")
    browser.close()
