import os
import hashlib
import requests
from dotenv import load_dotenv

load_dotenv()

ENDUROCO_BASE_URL = "https://www.enduroco.in"
COROS_BASE_URL = "https://teamapi.coros.com"
TP_BASE_URL = "https://api.trainingpeaks.com/v1"

class EndurocoSync:
    def __init__(self, token=None):
        self.token = token or os.getenv("ENDUROCO_AUTH_TOKEN")
        self.session = requests.Session()
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def get_planned_workouts(self, days=7):
        """Fetch scheduled workouts from Enduroco"""
        if not self.token:
            print("No Enduroco token provided. Returning demo workout structure.")
            return [{
                "title": "Enduroco Interval Ride",
                "sportType": 2,
                "workoutType": "Bike",
                "date": "2026-09-28",
                "description": "Sweetspot 3x10min intervals",
                "durationMinutes": 60
            }]
        res = self.session.get(f"{ENDUROCO_BASE_URL}/api/athlete/workouts/calendar", params={"days": days})
        res.raise_for_status()
        return res.json()


class CorosSync:
    def __init__(self, email=None, password=None):
        self.email = email or os.getenv("COROS_EMAIL")
        self.password = password or os.getenv("COROS_PASSWORD")
        self.access_token = None
        self.session = requests.Session()

    def login(self):
        """Login to COROS Training Hub API"""
        if not self.email or not self.password:
            raise ValueError("COROS_EMAIL and COROS_PASSWORD must be configured.")

        pwd_md5 = hashlib.md5(self.password.encode('utf-8')).hexdigest()
        payload = {
            "account": self.email,
            "pwd": pwd_md5,
            "accountType": 2
        }
        res = self.session.post(f"{COROS_BASE_URL}/account/login", json=payload)
        data = res.json()
        if data.get("result") == "0000":
            self.access_token = data.get("data", {}).get("accessToken")
            self.session.headers.update({"accessToken": self.access_token})
            print("Logged into COROS Training Hub successfully.")
            return True
        else:
            raise RuntimeError(f"COROS Login failed: {data.get('message', data)}")

    def push_workout(self, workout):
        """Push workout to COROS Calendar"""
        if not self.access_token:
            self.login()

        payload = {
            "name": workout.get("title", "Enduroco Workout"),
            "sportType": workout.get("sportType", 1),
            "date": workout.get("date"),
            "description": workout.get("description", "")
        }
        res = self.session.post(f"{COROS_BASE_URL}/training/workout/create", json=payload)
        print(f"Pushed workout '{payload['name']}' to COROS calendar on {payload['date']}.")
        return res.json()


class TrainingPeaksSync:
    def __init__(self, token=None):
        self.token = token or os.getenv("TRAININGPEAKS_ACCESS_TOKEN")
        self.session = requests.Session()
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def push_workout(self, workout):
        """Push workout to TrainingPeaks calendar"""
        if not self.token:
            raise ValueError("TRAININGPEAKS_ACCESS_TOKEN must be configured.")
        payload = {
            "workoutDate": workout.get("date"),
            "workoutType": workout.get("workoutType", "Bike"),
            "title": workout.get("title", "Enduroco Workout"),
            "description": workout.get("description", ""),
            "plannedDuration": workout.get("durationMinutes", 60) / 60.0
        }
        res = self.session.post(f"{TP_BASE_URL}/workouts/planned", json=payload)
        res.raise_for_status()
        print(f"Pushed workout '{payload['title']}' to TrainingPeaks on {payload['workoutDate']}.")
        return res.json()


def run_sync():
    print("--- Enduroco to COROS / TrainingPeaks Sync ---")
    enduroco = EndurocoSync()
    workouts = enduroco.get_planned_workouts()

    # Try COROS first
    coros_success = False
    try:
        coros = CorosSync()
        for w in workouts:
            coros.push_workout(w)
        coros_success = True
    except Exception as e:
        print(f"COROS direct sync note: {e}")

    # Fallback to TrainingPeaks if COROS direct failed
    if not coros_success:
        print("\nAttempting TrainingPeaks fallback sync...")
        try:
            tp = TrainingPeaksSync()
            for w in workouts:
                tp.push_workout(w)
            print("Successfully synced to TrainingPeaks (COROS will sync automatically via connected account).")
        except Exception as e:
            print(f"TrainingPeaks fallback note: {e}")

if __name__ == "__main__":
    run_sync()
