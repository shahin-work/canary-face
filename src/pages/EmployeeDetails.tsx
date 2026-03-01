import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

interface Session {
  session: number;
  check_in: string;
  check_out?: string;
}

interface AttendanceDay {
  date: string;
  sessions: Session[];
}

interface Employee {
  emp_id: string;
  name: string;
  department: string;
  type: string;
  created_at: string;
}

function toMins(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function calcHours(sessions: Session[]) {
  let mins = 0;
  for (const s of sessions) {
    if (s.check_in && s.check_out) mins += toMins(s.check_out) - toMins(s.check_in);
  }
  return Math.round((mins / 60) * 10) / 10;
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isWeekend(dateStr: string) {
  const d = new Date(dateStr);
  const dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) return Math.ceil(d.getDate() / 7) % 2 === 0;
  return false;
}

const TYPE_COLOR: Record<string, string> = {
  permanent: "#ffd700",
  consultant: "#60a5fa",
  intern: "#a78bfa",
};

export default function EmployeeDetails() {
  const { empSlug } = useParams();
  const navigate = useNavigate();
  const empId = empSlug?.split("-")[0] ?? "";

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = toDateStr(new Date());

  useEffect(() => {
    if (!empId) return;
    (async () => {
      setLoading(true);
      try {
        const empSnap = await getDoc(doc(db, "employees", empId));
        if (!empSnap.exists()) { setError("Employee not found."); return; }
        setEmployee(empSnap.data() as Employee);

        const datesSnap = await getDocs(collection(db, "attendance", empId, "dates"));
        const days: AttendanceDay[] = datesSnap.docs.map((d) => ({
          date: d.id,
          ...d.data(),
        } as AttendanceDay));
        days.sort((a, b) => b.date.localeCompare(a.date));
        setAttendance(days);
      } catch (e) {
        setError("Failed to load employee data.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [empId]);

  // Stats
  const totalDaysPresent = attendance.length;
  const totalHours = attendance.reduce((a, d) => a + calcHours(d.sessions), 0);
  const avgHours = totalDaysPresent > 0 ? Math.round((totalHours / totalDaysPresent) * 10) / 10 : 0;

  // Today
  const todayAtt = attendance.find((d) => d.date === today);
  const todayHours = todayAtt ? calcHours(todayAtt.sessions) : 0;
  const isCurrentlyIn = todayAtt
    ? !todayAtt.sessions[todayAtt.sessions.length - 1]?.check_out
    : false;

  // Last 30 days calendar
  const last30: string[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return toDateStr(d);
  });
  const presentSet = new Set(attendance.map((a) => a.date));

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#020227", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="animate-spin w-8 h-8 rounded-full" style={{ border: "2px solid #1a1a5e", borderTop: "2px solid #ffd700" }} />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div style={{ minHeight: "100vh", background: "#020227", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <p style={{ color: "#ef4444" }}>{error || "Employee not found"}</p>
        <button onClick={() => navigate("/")} style={{ color: "#ffd700", fontSize: 14 }}>← Back</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#020227", fontFamily: "'Sora', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');`}</style>

      {/* Header */}
      <header style={{ background: "#030330", borderBottom: "1px solid #1a1a5e", padding: "16px 24px" }}>
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm transition-colors hover:opacity-80"
            style={{ color: "#ffd700" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <span style={{ color: "#1a1a5e" }}>|</span>
          <span style={{ color: "#475569", fontSize: 13 }}>Employee Details</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">

        {/* Profile card */}
        <div className="rounded-2xl p-6" style={{
          background: "linear-gradient(135deg, #07073d 0%, #020227 100%)",
          border: "1px solid #1a1a5e",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%",
            background: "radial-gradient(circle, #ffd70012 0%, transparent 70%)", pointerEvents: "none",
          }} />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl"
                style={{ background: "#1a1a5e", color: "#ffd700", border: "2px solid #ffd70030" }}>
                {employee.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <h2 className="font-bold text-xl" style={{ color: "#f1f5f9" }}>{employee.name}</h2>
                <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>{employee.department}</p>
                <p className="text-xs mt-1 font-mono" style={{ color: TYPE_COLOR[employee.type] || "#ffd700", letterSpacing: 1 }}>
                  {employee.emp_id}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-2">
              <span className="text-xs font-semibold px-3 py-1 rounded-full capitalize"
                style={{ background: "#1a1a5e", color: TYPE_COLOR[employee.type] || "#ffd700", border: "1px solid #ffd70020" }}>
                {employee.type}
              </span>
              {/* Today status */}
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full"
                  style={{
                    background: isCurrentlyIn ? "#eab308" : todayAtt ? "#22c55e" : "#ef4444",
                    boxShadow: `0 0 6px ${isCurrentlyIn ? "#eab308" : todayAtt ? "#22c55e" : "#ef4444"}`,
                  }} />
                <span className="text-sm" style={{ color: "#94a3b8" }}>
                  {isCurrentlyIn ? "Currently In Office" : todayAtt ? "Checked Out Today" : "Not In Today"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Days Present", value: totalDaysPresent, unit: "days" },
            { label: "Total Hours", value: Math.round(totalHours * 10) / 10, unit: "hrs" },
            { label: "Avg / Day", value: avgHours, unit: "hrs" },
            { label: "Today Hours", value: todayHours, unit: "hrs" },
          ].map(({ label, value, unit }) => (
            <div key={label} className="rounded-xl p-4 flex flex-col gap-1"
              style={{ background: "#05053a", border: "1px solid #1a1a5e" }}>
              <p className="text-xs" style={{ color: "#475569" }}>{label}</p>
              <p className="text-2xl font-bold" style={{ color: "#ffd700" }}>
                {value}<span className="text-xs ml-1" style={{ color: "#64748b" }}>{unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Last 30 days heatmap */}
        <div className="rounded-2xl p-5" style={{ background: "#05053a", border: "1px solid #1a1a5e" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "#94a3b8" }}>Last 30 Days</h3>
          <div className="flex flex-wrap gap-1.5">
            {last30.map((date) => {
              const weekend = isWeekend(date);
              const present = presentSet.has(date);
              const future = date > today;
              const isToday = date === today;
              const bg = future ? "#0a0a2a" : weekend ? "#1a1a5e" : present ? "#16a34a" : "#2d0a0a";
              return (
                <div
                  key={date}
                  title={date}
                  className="rounded"
                  style={{
                    width: 24, height: 24,
                    background: bg,
                    opacity: future ? 0.3 : 1,
                    border: isToday ? "2px solid #ffd700" : "2px solid transparent",
                    flexShrink: 0,
                  }}
                />
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 flex-wrap">
            {[["#16a34a","Present"],["#2d0a0a","Absent"],["#1a1a5e","Weekend"]].map(([c,l])=>(
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: c }} />
                <span className="text-xs" style={{ color: "#475569" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance log */}
        <div className="rounded-2xl p-5" style={{ background: "#05053a", border: "1px solid #1a1a5e" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "#94a3b8" }}>Attendance Log</h3>
          {attendance.length === 0 ? (
            <p className="text-sm" style={{ color: "#334155" }}>No attendance records found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {attendance.slice(0, 30).map((day) => {
                const hours = calcHours(day.sessions);
                const isToday = day.date === today;
                const ot = hours > 8.5 ? Math.round((hours - 8.5) * 10) / 10 : 0;
                return (
                  <div
                    key={day.date}
                    className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    style={{
                      background: "#020227",
                      border: `1px solid ${isToday ? "#ffd70040" : "#1a1a5e"}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e", flexShrink: 0 }} />
                      <span className="text-sm font-medium" style={{ color: isToday ? "#ffd700" : "#e2e8f0" }}>
                        {new Date(day.date).toLocaleDateString("en-IN", {
                          weekday: "short", day: "numeric", month: "short", year: "numeric",
                        })}
                        {isToday && <span className="ml-2 text-xs" style={{ color: "#ffd700" }}>Today</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {day.sessions.map((s) => (
                        <span key={s.session} className="text-xs px-2 py-0.5 rounded-lg font-mono"
                          style={{ background: "#1a1a5e", color: "#94a3b8" }}>
                          {s.check_in} – {s.check_out ?? "..."}
                        </span>
                      ))}
                      <span className="text-xs font-semibold" style={{ color: "#ffd700" }}>
                        {hours}h
                      </span>
                      {ot > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: "#1e3a8a", color: "#93c5fd" }}>
                          +{ot}h OT
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}