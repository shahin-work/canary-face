# import json
# import os
# import firebase_admin
# from firebase_admin import credentials, firestore

# SERVICE_ACCOUNT_KEY = "canary-face-firebase.json"

# DATE = "2026-06-23"
# JSON_FILE = os.path.expanduser("~/Downloads/attendance-23-06-26.json")


# def init_db():
#     cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
#     firebase_admin.initialize_app(cred)
#     return firestore.client()


# def main():
#     with open(JSON_FILE, "r", encoding="utf-8") as f:
#         data = json.load(f)

#     print(f"Loaded {len(data)} employees from {JSON_FILE}")
#     print(f"Target date document: {DATE}")
#     confirm = input('Type PUSH to write to Firestore: ').strip()
#     if confirm != "PUSH":
#         print("Cancelled. Nothing was written.")
#         return

#     db = init_db()
#     written = 0
#     for emp_id, record in data.items():
#         doc = {
#             "employee_name": record.get("employee_name", ""),
#             "sessions": record.get("sessions", []) or [],
#             "breaks": record.get("breaks", {}) or {},
#         }
#         db.collection(emp_id).document(DATE).set(doc)
#         written += 1
#         print(f"  wrote {emp_id}/{DATE}")

#     print(f"Done. Wrote {written} documents.")


# if __name__ == "__main__":
#     main()

import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT_KEY = "canary-face-firebase.json"

EMPLOYEE_ID = "CDAI014"
DATE = "2026-06-25"

# ---- dummy data ----
DUMMY_DOC = {
    "employee_name": "Lin Ann Jose",
    "sessions": [
        {"session": 1, "check_in": "09:00:00", "check_out": "12:30:00"},
        {"session": 2, "check_in": "13:30:00", "check_out": "16:00:00"},
        {"session": 3, "check_in": "16:30:00", "check_out": "18:00:00"},
    ],
    "breaks": {
        "first_half": {"used_seconds": 300},
        "second_half": {"used_seconds": 300},
    },
}
# --------------------


def init_db():
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def main():
    db = init_db()
    ref = db.collection(EMPLOYEE_ID).document(DATE)

    if ref.get().exists:
        print(f"{EMPLOYEE_ID}/{DATE} already exists. (set() would overwrite it.)")

    print(f"Will create {EMPLOYEE_ID}/{DATE} with:")
    print(f"  name    : {DUMMY_DOC['employee_name']}")
    print(f"  sessions: {len(DUMMY_DOC['sessions'])}")
    confirm = input('Type CREATE to write: ').strip()
    if confirm != "CREATE":
        print("Cancelled. Nothing was written.")
        return

    ref.set(DUMMY_DOC)
    print(f"Done. Created {EMPLOYEE_ID}/{DATE}.")


if __name__ == "__main__":
    main()