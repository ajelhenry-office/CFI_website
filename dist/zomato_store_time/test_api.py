import requests
import json
from config import COOKIES_FILE, ZOMATO_BASE

session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36"})

# Load cookies
for c in json.loads(COOKIES_FILE.read_text()):
    session.cookies.set(c["name"], c["value"], domain=c["domain"], path=c["path"])

CSRF_URL = f"{ZOMATO_BASE}/webroutes/auth/csrf"
print("Fetching CSRF from", CSRF_URL)
resp = session.get(CSRF_URL, headers={"Accept": "application/json"}, timeout=15)
if resp.status_code == 200:
    csrf = resp.json().get("csrf")
    print("Got CSRF:", csrf)
else:
    print("Failed to get CSRF:", resp.status_code, resp.text)
