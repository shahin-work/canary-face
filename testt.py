import json
import os
import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT_KEY = "canary-face-firebase.json"

DATE = "2026-06-24"
JSON_FILE = os.path.expanduser("~/Downloads/attendance-24-06-26.json")


def init_db():
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def main():
    with open(JSON_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Loaded {len(data)} employees from {JSON_FILE}")
    print(f"Target date document: {DATE}")
    confirm = input('Type PUSH to write to Firestore: ').strip()
    if confirm != "PUSH":
        print("Cancelled. Nothing was written.")
        return

    db = init_db()
    written = 0
    for emp_id, record in data.items():
        doc = {
            "employee_name": record.get("employee_name", ""),
            "sessions": record.get("sessions", []) or [],
            "breaks": record.get("breaks", {}) or {},
        }
        db.collection(emp_id).document(DATE).set(doc)
        written += 1
        print(f"  wrote {emp_id}/{DATE}")

    print(f"Done. Wrote {written} documents.")


if __name__ == "__main__":
    main()