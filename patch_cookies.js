import fs from 'fs';

let content = fs.readFileSync('public/zomato_store_time/zomato_playwright.py', 'utf8');

const oldFunc = `def _pw_cookies_to_playwright(cookies: list[dict]) -> list[dict]:
    out = []
    for c in cookies:
        if "domain" not in c or "name" not in c or "value" not in c:
            continue
        entry = {
            "name": c["name"],
            "value": c["value"],
            "domain": c["domain"],
            "path": c.get("path", "/"),
        }
        if c.get("expires") is not None:
            try:
                # Playwright expects a unix timestamp as float/int
                entry["expires"] = float(c["expires"])
            except:
                pass
        if c.get("sameSite") in ["Strict", "Lax", "None"]:
            entry["sameSite"] = c["sameSite"]
        out.append(entry)
    return out`;

const newFunc = `def _pw_cookies_to_playwright(cookies: list[dict]) -> list[dict]:
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
                # Playwright expects a unix timestamp as float/int
                entry["expires"] = float(c["expires"])
            except:
                pass
        if c.get("sameSite") in ["Strict", "Lax", "None"]:
            entry["sameSite"] = c["sameSite"]
        out.append(entry)
    return out`;

content = content.replace(oldFunc, newFunc);
fs.writeFileSync('public/zomato_store_time/zomato_playwright.py', content);
console.log("Patched zomato_playwright.py successfully.");
