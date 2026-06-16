# import firebase_admin
# from firebase_admin import credentials, firestore

# if not firebase_admin._apps:
#     cred = credentials.Certificate("canary-face-firebase.json")
#     firebase_admin.initialize_app(cred)

# db = firestore.client()

# # Data for CDIN005
# emp_id = "CDIN005"
# emp_name = "Fathima Fida K"
# doc_date = "2026-03-06"

# def push_fida_saturday():
#     print(f"🚀 Pushing Saturday attendance for {emp_id}...")
     
#     db.collection(emp_id).document(doc_date).set({
#         "employee_name": emp_name,
#         "sessions": [
#             {"check_in": "09:05", "check_out": "18:05"}
#         ]
#     })
    
#     print(f"✅ {emp_id} ({emp_name}) synced for {doc_date}.")

# if __name__ == "__main__":
#     push_fida_saturday()



import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta

# ── init ──────────────────────────────────────────────────────────────────────
if not firebase_admin._apps:
    cred = credentials.Certificate("canary-face-firebase.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

# ── what to write ─────────────────────────────────────────────────────────────
EMP_ID     = "CDAI014"          # the employee's collection name
START_DATE = "2026-06-16"       # from
END_DATE   = "2026-12-30"       # to (this week's Sunday) — change if needed
CHECK_IN   = "17:50:00"
CHECK_OUT  = "18:00:00"
SESSION_NO = 100                # hard-coded, same for every day

# True  → skip Sundays, 2nd & 4th Saturdays, and holidays (1st/3rd/5th Sat WORK)
# False → fill literally every day in the range
SKIP_NON_WORKING = True

HOLIDAYS = {
    "2026-02-15", "2026-03-20", "2026-04-03", "2026-04-05", "2026-04-15",
    "2026-05-01", "2026-05-27", "2026-08-15", "2026-08-25", "2026-08-26",
    "2026-09-21", "2026-10-02", "2026-10-20", "2026-11-08", "2026-12-25",
}

def is_non_working(d):                        # d = date object
    iso = d.isoformat()
    if iso in HOLIDAYS:
        return True
    dow = d.weekday()                         # Mon=0 … Sun=6
    if dow == 6:                              # Sunday → always off
        return True
    if dow == 5:                              # Saturday
        week_of_month = (d.day - 1) // 7 + 1  # 1st, 2nd, 3rd…
        return week_of_month % 2 == 0         # off only on 2nd & 4th
    return False

# ── get the employee's name (stored on each day doc) ──────────────────────────
emp_doc = db.collection("employees").document(EMP_ID).get()
if emp_doc.exists:
    employee_name = emp_doc.to_dict().get("name", EMP_ID)
else:
    q = db.collection("employees").where("emp_id", "==", EMP_ID).limit(1).get()
    employee_name = q[0].to_dict().get("name", EMP_ID) if q else EMP_ID

print(f"Employee: {EMP_ID}  ({employee_name})")

# ── loop over the date range ──────────────────────────────────────────────────
start = datetime.strptime(START_DATE, "%Y-%m-%d").date()
end   = datetime.strptime(END_DATE,   "%Y-%m-%d").date()

added, skipped = 0, 0
d = start
while d <= end:
    date_str = d.isoformat()

    if SKIP_NON_WORKING and is_non_working(d):
        print(f"  {date_str}  · skipped (weekend/holiday)")
        skipped += 1
        d += timedelta(days=1)
        continue

    ref  = db.collection(EMP_ID).document(date_str)
    snap = ref.get()
    sessions = snap.to_dict().get("sessions", []) if snap.exists else []

    # idempotent: don't add the same 17:50 session twice
    if any(s.get("check_in") == CHECK_IN for s in sessions):
        print(f"  {date_str}  · already has this session, skipped")
        skipped += 1
        d += timedelta(days=1)
        continue

    sessions.append({
        "check_in":  CHECK_IN,
        "check_out": CHECK_OUT,
        "session":   SESSION_NO,
    })

    ref.set({
        "employee_name": employee_name,
        "sessions": sessions,
    }, merge=True)                            # merge keeps any other fields intact

    print(f"  {date_str}  · session added ✓")
    added += 1
    d += timedelta(days=1)

print(f"\nDone. Added: {added}, skipped: {skipped}")
