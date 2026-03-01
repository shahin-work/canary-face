import firebase_admin
from firebase_admin import credentials, firestore

# -----------------------------
# INIT FIREBASE
# -----------------------------
cred = credentials.Certificate("canary-face-firebase.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

OUTPUT_FILE = "attendance_full_dump.txt"


def write_line(file, text):
    file.write(text + "\n")


with open(OUTPUT_FILE, "w", encoding="utf-8") as file:

    write_line(file, "🔥 FULL ATTENDANCE COLLECTION STRUCTURE 🔥\n")

    # Get all employee IDs from employees collection
    employees = db.collection("employees").stream()

    for emp in employees:
        emp_id = emp.id
        write_line(file, f"📄 Employee Attendance Doc: {emp_id}")

        attendance_doc_ref = db.collection("attendance").document(emp_id)

        # Try to read document fields (may be empty)
        doc_snapshot = attendance_doc_ref.get()

        if doc_snapshot.exists and doc_snapshot.to_dict():
            for key, value in doc_snapshot.to_dict().items():
                write_line(file, f"    🔹 {key}: {value}")
        else:
            write_line(file, "    ⚠ No fields (empty attendance document)")

        # Now check subcollections (dates)
        subcollections = attendance_doc_ref.collections()

        for subcol in subcollections:
            write_line(file, f"    📁 Subcollection: {subcol.id}")

            date_docs = subcol.stream()

            for date_doc in date_docs:
                write_line(file, f"        📄 Date Doc: {date_doc.id}")

                data = date_doc.to_dict()
                if data:
                    for key, value in data.items():
                        write_line(file, f"            🔹 {key}: {value}")
                else:
                    write_line(file, "            ⚠ No fields")

        write_line(file, "-" * 60)

    write_line(file, "\n✅ ATTENDANCE EXPORT COMPLETE")

print("✅ Attendance collection exported to attendance_full_dump.txt")