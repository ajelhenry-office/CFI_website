import sys
import json
import requests

from config import ZOMATO_BASE, COOKIES_FILE, load_cookies_data

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

def build_api_payload(store_id: str, timings: dict) -> dict:
    # Build Zomato API format timings array
    zomato_timings = []
    
    for day in DAYS:
        # timings dict uses capitalized days (e.g. "Monday")
        cap_day = day.capitalize()
        config = timings.get(cap_day)
        
        if not config:
            # If a day is missing from the payload, default to keeping it active
            zomato_timings.append({
                "day": day,
                "active": True,
                "isEdited": False,
                "slots": []
            })
            continue
            
        is_open = config.get('open', True)
        slots = config.get('slots', [])
        
        # Format slots for Zomato API
        zomato_slots = []
        for slot in slots:
            # Zomato API expects {"start": "10:00", "end": "23:45"} format (24hr)
            zomato_slots.append({
                "start": slot["start"],
                "end": slot["end"]
            })
            
        zomato_timings.append({
            "day": day,
            "active": is_open,
            "isEdited": True, # Required by Zomato to register the change
            "slots": zomato_slots
        })
        
    return {
        "res_id": store_id,
        "data": [{
            "action": "update",
            "service_type": "delivery",
            "timings": zomato_timings
        }]
    }

def process_timings(store_id, timings):
    cookies = load_cookies_data()
    if not cookies:
        print("SESSION_EXPIRED: No cookies found.")
        sys.exit(1)
        
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"})
    
    for c in cookies:
        session.cookies.set(c["name"], str(c["value"]), domain=c["domain"], path=c.get("path", "/"))
        
    print(f"Successfully verified session. Executing advanced timing update for store {store_id}...")
    
    # 1. Fetch fresh CSRF Token
    csrf_url = f"{ZOMATO_BASE}/webroutes/auth/csrf"
    try:
        resp = session.get(csrf_url, headers={"Accept": "application/json"}, timeout=15)
        resp.raise_for_status()
        csrf_token = resp.json().get("csrf", "")
        if not csrf_token:
            print("FAILED: Empty CSRF token response.")
            sys.exit(1)
    except Exception as e:
        print(f"FAILED: Could not fetch CSRF token. The session might be expired. Error: {e}")
        sys.exit(1)
        
    # 2. Build API Payload
    payload = build_api_payload(store_id, timings)
    update_url = f"{ZOMATO_BASE}/merchant-api/restaurant/update-timings"
    
    headers = {
        "Content-Type": "application/json",
        "x-zomato-csrft": csrf_token,
        "x-client-id": "zomato_web_merchant",
        "x-zomato-app-version": "2",
        "Accept": "application/json",
        "Referer": f"{ZOMATO_BASE}/partners/onlineordering/outletInfo/outletTimings?resId={store_id}",
    }
    
    # 3. Post to API
    try:
        resp = session.post(update_url, json=payload, headers=headers, timeout=20)
        
        if resp.status_code == 401 or "login" in resp.url:
            print("SESSION_EXPIRED: 401 Unauthorized or redirected to login.")
            sys.exit(1)
            
        try:
            body = resp.json()
        except Exception:
            print(f"FAILED: Non-JSON response from server: {resp.text[:300]}")
            sys.exit(1)
            
        # Zomato returns empty data list when successful
        success = (body.get("data") == [] or body.get("data") is None) and body.get("message", "") == ""
        
        if success:
            print(f"Update applied for {store_id}.")
        else:
            print(f"FAILED: Zomato API rejected the update: {json.dumps(body)}")
            sys.exit(1)
            
    except Exception as e:
        print(f"FAILED: Exception during API call: {e}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Missing payload argument")
        sys.exit(1)
        
    try:
        payload_data = json.loads(sys.argv[1])
        s_id = payload_data.get("store_id")
        t_data = payload_data.get("timings")
        process_timings(s_id, t_data)
    except json.JSONDecodeError:
        print("Invalid JSON payload")
        sys.exit(1)
