"""
One-time local capture of a partner portal's store-timing API (Swiggy / Ownly).

  python capture_partner_api.py swiggy https://partner.swiggy.com/login
  python capture_partner_api.py ownly  <ownly partner login url>

Log in, then change ONE store's timing in the portal and save it. Every
non-GET request the portal sends is recorded, so we can see which endpoint
updates timings and what payload it expects — same idea as Zomato's
merchant-api/restaurant/update-timings call in update_advanced_timings.py.

Writes captures/<platform>_requests.json and captures/<platform>_cookies.json
(captures/ is gitignored — it holds a live session).
"""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT_DIR = Path(__file__).parent / "captures"
SKIP_HOSTS = ("google-analytics", "googletagmanager", "doubleclick", "sentry", "clarity.ms",
              "facebook", "hotjar", "mixpanel", "segment", "newrelic", "nr-data")


def main():
    if len(sys.argv) < 3:
        print("Usage: python capture_partner_api.py <platform> <login_url>")
        sys.exit(1)
    platform, login_url = sys.argv[1].lower(), sys.argv[2]
    OUT_DIR.mkdir(exist_ok=True)
    captured = []

    def on_response(resp):
        req = resp.request
        if req.method == "GET" or any(h in req.url for h in SKIP_HOSTS):
            return
        if req.resource_type not in ("xhr", "fetch"):
            return
        try:
            body = resp.text()[:4000]
        except Exception:
            body = None
        captured.append({
            "method": req.method,
            "url": req.url,
            "request_headers": req.headers,
            "request_body": req.post_data,
            "status": resp.status,
            "response_body": body,
        })
        print(f"  captured {req.method} {resp.status} {req.url[:120]}")

    print(f"Opening browser for {platform} partner login…")
    with sync_playwright() as p:
        browser = p.firefox.launch(headless=False)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.on("response", on_response)
        page.goto(login_url)

        print("\n" + "=" * 60)
        print("1. Log in to the partner portal")
        print("2. Open ONE store's timings, change a slot, and SAVE it")
        print("3. (Optional) revert it and save again")
        print("4. Press Enter here")
        print("=" * 60 + "\n")
        input()

        cookies = [
            {"name": c["name"], "value": c["value"], "domain": c["domain"], "path": c["path"]}
            for c in ctx.cookies()
        ]
        browser.close()

    req_file = OUT_DIR / f"{platform}_requests.json"
    cookie_file = OUT_DIR / f"{platform}_cookies.json"
    req_file.write_text(json.dumps(captured, indent=2))
    cookie_file.write_text(json.dumps(cookies, indent=2))
    print(f"\nSaved {len(captured)} requests → {req_file}")
    print(f"Saved cookies → {cookie_file}")


if __name__ == "__main__":
    main()
