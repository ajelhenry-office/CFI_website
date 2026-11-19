"""
One-time manual Zomato partner login for the Timing tab (the account in
ZOMATO_TIMING_EMAIL — 2-step verification is on, so a human has to do it).

  public/zomato_store_time/venv/bin/python server/timing/zomato_login.py

Same flow as public/zomato_store_time/login_export.py: log in with Google in the
browser that opens, wait for the partner dashboard, press Enter. Saves the
session cookies plus the dashboard's API calls (to find the outlet-list call)
into server/timing/sessions/ — gitignored, it holds a live session — then
imports the cookies into timing_platform_sessions (importZomatoSession.js).
Re-run this whenever the daily check alerts that the Zomato session expired.
"""

import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ZOMATO_BASE = "https://www.zomato.com"
OUT_DIR = Path(__file__).parent / "sessions"
ENV_FILE = Path(__file__).parents[2] / ".env"


def expected_email() -> str:
    if not ENV_FILE.exists():
        return ""
    for line in ENV_FILE.read_text().splitlines():
        if line.strip().startswith("ZOMATO_TIMING_EMAIL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'").lower()
    return ""


def main():
    OUT_DIR.mkdir(exist_ok=True)
    calls = []

    def on_response(resp):
        req = resp.request
        if req.resource_type not in ("xhr", "fetch") or "zomato.com" not in req.url:
            return
        try:
            body = resp.text()[:3000]
        except Exception:
            body = None
        calls.append({"method": req.method, "url": req.url, "status": resp.status,
                      "request_body": req.post_data, "response_body": body})

    print("Opening browser for Zomato Google login…")
    with sync_playwright() as p:
        browser = p.firefox.launch(headless=False)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.on("response", on_response)
        page.goto(f"{ZOMATO_BASE}/partners/login")

        expected = expected_email()
        print("\n" + "=" * 60)
        print(f"1. Log in with Google as {expected or 'the ZOMATO_TIMING_EMAIL account'} + 2-step code")
        print("2. Wait for the Zomato partner dashboard to fully load")
        print("3. Open the outlet switcher once so the outlet list loads")
        print("4. Press Enter here")
        print("=" * 60 + "\n")

        # Don't save until Zomato itself confirms the right account is logged in —
        # pressing Enter early (or picking another Google account) keeps the window open.
        while True:
            input()
            user = page.evaluate("""() => fetch('/restaurant-onboard-diy/check-auth', {credentials: 'include'})
                                          .then(r => r.json()).catch(() => ({}))""")
            if not user.get("loggedIn"):
                print("Not logged in yet — finish the Google login in the browser, then press Enter again.")
                continue
            email = (user.get("userEmail") or "").lower()
            if expected and email != expected:
                print(f"Logged in as {email}, but expected {expected}.")
                print("Log out in the browser, log in with the right Google account, then press Enter again.")
                continue
            print(f"Logged in as {email}.")
            break

        cookies = [
            {"name": c["name"], "value": c["value"], "domain": c["domain"], "path": c["path"],
             "expires": c.get("expires", -1)}
            for c in ctx.cookies()
        ]
        browser.close()

    (OUT_DIR / "zomato_cookies.json").write_text(json.dumps(cookies, indent=2))
    (OUT_DIR / "zomato_login_calls.json").write_text(json.dumps(calls, indent=2))
    print(f"\nSaved {len(cookies)} cookies and {len(calls)} API calls → {OUT_DIR}")

    # Push the session into the database so the server (not just this Mac) uses it.
    print("Importing session into the database…")
    subprocess.run(["node", str(Path(__file__).parent / "importZomatoSession.js")], check=False)


if __name__ == "__main__":
    main()
