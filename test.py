import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("canary-face-firebase.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Data for CDIN005
emp_id = "CDIN005"
emp_name = "Fathima Fida K"
doc_date = "2026-03-06"

def push_fida_saturday():
    print(f"🚀 Pushing Saturday attendance for {emp_id}...")
    
    db.collection(emp_id).document(doc_date).set({
        "employee_name": emp_name,
        "sessions": [
            {"check_in": "09:05", "check_out": "18:05"}
        ]
    })
    
    print(f"✅ {emp_id} ({emp_name}) synced for {doc_date}.")

if __name__ == "__main__":
    push_fida_saturday()