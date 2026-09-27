import os
import json
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

USER_DATA_DIR = Path(__file__).parent / ".browser_profile_python"
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_FILE = DATA_DIR / "workouts.json"

TP_API_BASE = "https://api.trainingpeaks.com/v1"

def scrape_enduroco():
    """
    Launch Playwright browser with persistent profile for Google Auth.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Please install playwright: pip install playwright && playwright install chromium")
        return []

    print(f"Launching Playwright with persistent profile at: {USER_DATA_DIR}")
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            headless=False,
            args=["--start-maximized", "--disable-blink-features=AutomationControlled"]
        )
        page = context.new_page()

        intercepted_workouts = []

        def handle_response(response):
            try:
                if any(k in response.url for k in ["workout", "activities", "calendar"]):
                    if "application/json" in response.headers.get("content-type", ""):
                        data = response.json()
                        if isinstance(data, (dict, list)):
                            intercepted_workouts.append(data)
            except Exception:
                pass

        page.on("response", handle_response)

        print("Navigating to Enduroco Dashboard...")
        page.goto("https://www.enduroco.in/dashboard", wait_until="networkidle", timeout=60000)

        if "login" in page.url or "signup" in page.url:
            print("\n" + "="*55)
            print("Please complete Google Sign-In in the opened browser.")
            print("Your credentials/session are preserved for future runs.")
            print("="*55 + "\n")
            page.wait_for_url(lambda u: "login" not in u and "signup" not in u, timeout=180000)
            time.sleep(3)

        print("Navigating to Calendar...")
        page.goto("https://www.enduroco.in/calendar", wait_until="networkidle", timeout=60000)
        time.sleep(4)

        results = {
            "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "interceptedWorkouts": intercepted_workouts
        }

        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

        print(f"Saved scraped data to {CACHE_FILE}")
        context.close()
        return intercepted_workouts


def push_to_trainingpeaks(workouts):
    token = os.getenv("TRAININGPEAKS_ACCESS_TOKEN")
    if not token:
        print("\n[!] TRAININGPEAKS_ACCESS_TOKEN not found in .env.")
        print("To push automatically, add your TrainingPeaks access token.")
        print("Once pushed to TrainingPeaks, workouts automatically sync to your COROS watch calendar.")
        return

    import requests
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    for w in workouts:
        payload = {
            "workoutDate": w.get("date"),
            "workoutType": w.get("workoutType", "Bike"),
            "title": w.get("title", "Enduroco Workout"),
            "description": w.get("description", ""),
            "plannedDuration": w.get("durationMinutes", 60) / 60.0
        }
        res = requests.post(f"{TP_API_BASE}/workouts/planned", json=payload, headers=headers)
        if res.status_code in [200, 201]:
            print(f"[OK] Pushed to TrainingPeaks: {payload['title']} ({payload['workoutDate']})")
        else:
            print(f"[ERROR] Failed to push {payload['title']}: {res.text}")

if __name__ == "__main__":
    print("=== Enduroco -> TrainingPeaks Python Automation ===")
    scraped = scrape_enduroco()
    # Format workouts and push
    demo_workouts = [{
        "title": "Enduroco Planned Ride",
        "date": time.strftime("%Y-%m-%d"),
        "workoutType": "Bike",
        "description": "Adaptive Endurance Ride",
        "durationMinutes": 60
    }]
    push_to_trainingpeaks(demo_workouts)
