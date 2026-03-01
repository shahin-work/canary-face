import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Session { session: number; check_in: string; check_out?: string; }
interface AttendanceDay { date: string; sessions: Session[]; }
interface Employee { emp_id: string; name: string; department: string; type: string; created_at: string; profile_image?: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const toMins = (t: string) => { const [h,m] = t.split(":").map(Number); return h*60+m; };
const fmtTime = (t: string) => t.slice(0,5);
const getInitials = (name: string) => name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();

function calcHours(sessions: Session[], forDate?: string): number {
  let mins = 0;
  const now = new Date(), todayStr = toDateStr(now);
  const nowMins = now.getHours()*60 + now.getMinutes();
  for (const s of sessions) {
    if (!s.check_in) continue;
    if (s.check_out) mins += toMins(s.check_out) - toMins(s.check_in);
    else if (!forDate || forDate === todayStr) mins += Math.max(0, nowMins - toMins(s.check_in));
  }
  return Math.round((mins/60)*100)/100;
}

function calcSessionHours(s: Session, forDate: string): number {
  const now = new Date(), todayStr = toDateStr(now);
  const nowMins = now.getHours()*60 + now.getMinutes();
  if (!s.check_in) return 0;
  if (s.check_out) return Math.round(((toMins(s.check_out) - toMins(s.check_in))/60)*100)/100;
  if (forDate === todayStr) return Math.round((Math.max(0, nowMins - toMins(s.check_in))/60)*100)/100;
  return 0;
}

// ─── Holidays ────────────────────────────────────────────────────────────────
const HOLIDAYS = new Set([
  // 2025
  "2025-01-14","2025-01-26","2025-03-31","2025-04-14","2025-04-18",
  "2025-05-01","2025-08-15","2025-08-27","2025-09-29","2025-10-02",
  "2025-10-21","2025-11-05","2025-12-25",
  // 2026
  "2026-01-26","2026-02-26","2026-03-20","2026-04-03","2026-04-05",
  "2026-04-14","2026-04-15","2026-05-01","2026-05-27","2026-08-15",
  "2026-08-25","2026-08-26","2026-09-21","2026-10-02","2026-10-20",
  "2026-11-08","2026-12-25",
]);

function isHoliday(dateStr: string): boolean {
  return HOLIDAYS.has(dateStr);
}

// 2nd and 4th Saturdays are off; all Sundays are off
function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr), dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) {
    const weekNum = Math.ceil(d.getDate() / 7);
    return weekNum === 2 || weekNum === 4;
  }
  return false;
}

function isNonWorking(dateStr: string): boolean {
  return isWeekend(dateStr) || isHoliday(dateStr);
}

function getNonWorkingLabel(dateStr: string): string {
  if (isHoliday(dateStr)) return "Holiday";
  const dow = new Date(dateStr).getDay();
  return dow === 0 ? "Sunday" : "Weekend";
}

function getMonthDates(year: number, month: number): string[] {
  const dates: string[] = [], d = new Date(year, month, 1);
  while (d.getMonth() === month) { dates.push(toDateStr(d)); d.setDate(d.getDate()+1); }
  return dates;
}

// ─── Timeline constants ───────────────────────────────────────────────────────
// Show from 9:00 to 21:00 (9am - 9pm)
const DAY_START = 540;   // 09:00
const DAY_END   = 1260;  // 21:00
const DAY_SPAN  = DAY_END - DAY_START;

const timeToPercent = (t: string) =>
  Math.max(0, Math.min(100, ((toMins(t) - DAY_START) / DAY_SPAN) * 100));

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:     "#06080F",
  surf:   "#0A0D1E",
  surf2:  "#0E1228",
  surf3:  "#121632",

  border: "rgba(99,102,241,0.15)",
  bord2:  "rgba(99,102,241,0.07)",
  text:   "#DDE3FF",
  sub:    "#68789A",
  dim:    "#2E3860",
  yellow: "#FFD700",
  green:  "#22C55E",
  green2: "#16A34A",
  red:    "#ff3434",
  indigo: "#6366F1",
  blue:   "#60A5FA",
  purple: "#A78BFA",
  orange: "#F97316",
  teal:   "#34D399",
  amber:  "#FBBF24",
  mint:   "#6EE7B7",
  rose:   "#F87171",
};

const TYPE_COLOR: Record<string,string> = {
  permanent: C.yellow, consultant: C.blue, intern: C.purple,
};

const neu = (inset = false) => inset
  ? "inset 4px 4px 10px rgba(0,0,0,0.6), inset -2px -2px 6px rgba(99,102,241,0.04)"
  : "8px 8px 20px rgba(0,0,0,0.6), -3px -3px 8px rgba(99,102,241,0.03)";

const SIDEBAR_W = 220;
const HEADER_H  = 60;
const RULER_H   = 28;

// ─── InsightCard ─────────────────────────────────────────────────────────────
function InsightCard({ label, value, unit, sub, color, icon }: {
  label: string; value: string|number; unit?: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: C.surf3, borderRadius: 12, padding: "11px 13px",
      border: `1px solid ${C.border}`, boxShadow: neu(),
      display: "flex", flexDirection: "column", gap: 6,
      position: "relative", overflow: "hidden", flexShrink: 0,
    }}>
      <div style={{
        position:"absolute", top:-14, right:-14, width:50, height:50, borderRadius:"50%",
        background:`radial-gradient(circle, ${color}20 0%, transparent 70%)`, pointerEvents:"none",
      }}/>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:8.5, fontWeight:700, color:C.sub, letterSpacing:0.8, textTransform:"uppercase" }}>
          {label}
        </span>
        <div style={{
          width:22, height:22, borderRadius:6,
          background:`${color}14`, border:`1px solid ${color}24`,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        }}>{icon}</div>
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
        <span style={{ fontSize:19, fontWeight:800, color, fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize:9.5, color:C.sub }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize:8.5, color:C.dim, marginTop:-2 }}>{sub}</div>}
    </div>
  );
}

// ─── TimelineRow ──────────────────────────────────────────────────────────────
function TimelineRow({ day, attendanceMap, today, hoveredDay, onHover }: {
  day: string;
  attendanceMap: Map<string,AttendanceDay>;
  today: string;
  hoveredDay: string | null;
  onHover: (day: string | null) => void;
}) {
  const d       = new Date(day);
  const dayName = d.toLocaleDateString("en-IN", { weekday:"short" });
  const dayNum  = d.getDate();
  const isToday  = day === today;
  const isFutureDay = day > today;
  const holiday  = isHoliday(day);
  const weekend  = isNonWorking(day); // includes holidays + weekends
  const att      = attendanceMap.get(day);
  const hasSess  = !!(att && att.sessions.length > 0);
  const hours    = hasSess ? calcHours(att!.sessions, day) : 0;
  const isHovered = hoveredDay === day;

  const state: "present"|"weekend"|"holiday"|"absent"|"future" =
    isFutureDay ? "future" : hasSess ? "present" : holiday ? "holiday" : weekend ? "weekend" : "absent";

  const nowObj  = new Date();
  const nowStr  = `${String(nowObj.getHours()).padStart(2,"0")}:${String(nowObj.getMinutes()).padStart(2,"0")}`;
  const nowPct  = timeToPercent(nowStr);

  const hoursColor =
    state !== "present" ? C.dim :
    hours >= 8.5 ? C.green : hours >= 4 ? C.yellow : C.red;

  return (
    <div
      className="trow"
      onMouseEnter={() => onHover(day)}
      onMouseLeave={() => onHover(null)}
      style={{
        display:"grid", gridTemplateColumns:"60px 1fr 68px",
        alignItems:"center", gap:0, padding:"0 20px",
        background: isHovered
          ? isToday
            ? "linear-gradient(90deg,rgba(255,215,0,0.08) 0%,rgba(99,102,241,0.06) 60%)"
            : "rgba(99,102,241,0.06)"
          : isToday
            ? "linear-gradient(90deg,rgba(255,215,0,0.04) 0%,transparent 60%)"
            : holiday
            ? "linear-gradient(90deg,rgba(168,85,247,0.03) 0%,transparent 60%)"
            : "transparent",
        borderLeft: isToday ? `2.5px solid ${C.yellow}` : holiday ? `2.5px solid rgba(168,85,247,0.4)` : "2.5px solid transparent",
        borderBottom: `1px solid ${C.bord2}`,
        minHeight: 58,
        transition:"background 0.12s",
        position:"relative",
      }}
    >
      {/* ── Day label ── */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", paddingRight:12 }}>
        <span style={{
          fontSize:9, fontWeight:700, letterSpacing:0.9,
          color: isHovered ? C.text : isToday ? C.yellow : C.sub, textTransform:"uppercase",
          transition:"color 0.12s",
        }}>{dayName}</span>
        <div style={{
          width:26, height:26, borderRadius:"50%", marginTop:3,
          background: isToday ? C.yellow : isHovered ? "rgba(99,102,241,0.18)" : "transparent",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow: isToday ? `0 0 14px ${C.yellow}55` : isHovered ? "0 0 10px rgba(99,102,241,0.3)" : "none",
          transition:"all 0.12s",
        }}>
          <span style={{
            fontSize:12, fontWeight:800, lineHeight:1,
            color: isToday ? C.bg : isHovered ? C.text : (isFutureDay || state==="weekend" || state==="holiday") ? C.dim : C.text,
            transition:"color 0.12s",
          }}>{dayNum}</span>
        </div>
      </div>

      {/* ── Timeline track ── */}
      <div style={{ position:"relative", height:44, display:"flex", alignItems:"center" }}>

        {/* Base track */}
        <div style={{
          position:"absolute", left:0, right:0,
          top:"50%", transform:"translateY(-50%)",
          height:3, borderRadius:2,
          background:
            isFutureDay  ? "rgba(99,102,241,0.04)" :
            holiday   ? "rgba(168,85,247,0.08)" :
            weekend   ? "rgba(99,102,241,0.08)" :
            !hasSess  ? "rgba(239,68,68,0.08)" :
            "rgba(99,102,241,0.10)",
        }}/>

        {/* Non-working label */}
        {(weekend || isFutureDay || !hasSess) && (
          <span style={{
            position:"absolute", left:"50%", transform:"translateX(-50%)",
            fontSize:9, fontWeight:700, letterSpacing:1, textTransform:"uppercase",
            color:
              holiday      ? "rgba(168,85,247,0.5)" :
              weekend      ? "rgba(99,102,241,0.3)" :
              isFutureDay  ? "rgba(99,102,241,0.12)" :
              "rgba(239,68,68,0.28)",
            userSelect:"none",
          }}>
            {isFutureDay ? "" : (weekend ? getNonWorkingLabel(day) : "Absent")}
          </span>
        )}

        {/* Hour ticks */}
        {[9,10,11,12,13,14,15,16,17,18,19,20,21].map(h => {
          const pct = ((h*60 - DAY_START) / DAY_SPAN) * 100;
          if (pct < 0 || pct > 100) return null;
          return (
            <div key={h} style={{
              position:"absolute", left:`${pct}%`,
              top:"50%", transform:"translateY(-50%)",
              width:1, height:10, background:"rgba(99,102,241,0.11)",
              pointerEvents:"none",
            }}/>
          );
        })}

        {/* Sessions */}
        {att?.sessions.map((s, i) => {
          const inPct  = timeToPercent(s.check_in);
          const outPct = s.check_out
            ? timeToPercent(s.check_out)
            : isToday ? nowPct : inPct + 1.5;
          const width  = Math.max(outPct - inPct, 0.8);
          const active = !s.check_out && isToday;

          // Gap bar to next session
          const nextSess = att.sessions[i + 1];
          const gapStart = s.check_out ? timeToPercent(s.check_out) : null;
          const gapEnd   = nextSess ? timeToPercent(nextSess.check_in) : null;
          const gapW     = gapStart !== null && gapEnd !== null ? Math.max(gapEnd - gapStart, 0) : 0;

          // Session hours label for hovered state
          const sessHours = calcSessionHours(s, day);
          const sessHoursStr = sessHours > 0 ? `${sessHours}h` : "";
          const midPct = (inPct + (s.check_out ? timeToPercent(s.check_out) : (isToday ? nowPct : inPct + 1.5))) / 2;

          return (
            <div key={i} style={{ position:"absolute", inset:0, pointerEvents:"none" }}>

              {/* Green session bar */}
              <div style={{
                position:"absolute",
                left:`${inPct}%`, width:`${width}%`,
                top:"50%", transform:"translateY(-50%)",
                height: isHovered ? 5 : 3, borderRadius:4,
                background: active
                  ? `linear-gradient(90deg,${C.green2},${C.green},#86EFAC)`
                  : `linear-gradient(90deg,${C.green2},${C.green})`,
                boxShadow: active ? `0 0 10px ${C.green}66` : isHovered ? `0 0 8px ${C.green}55` : `0 0 4px ${C.green2}44`,
                zIndex:1,
                transition:"height 0.12s, box-shadow 0.12s",
              }}/>

              {/* Session duration label — shown inside/above the green bar on hover */}
              {isHovered && sessHoursStr && width > 3 && (
                <span style={{
                  position:"absolute",
                  left:`${midPct}%`,
                  top:"50%",
                  transform:"translate(-50%, -130%)",
                  fontSize:8, fontWeight:800,
                  color: C.green,
                  fontFamily:"'JetBrains Mono',monospace",
                  letterSpacing:0.3,
                  whiteSpace:"nowrap",
                  zIndex:10,
                  pointerEvents:"none",
                  background:`${C.bg}CC`,
                  padding:"1px 4px",
                  borderRadius:4,
                  border:`1px solid ${C.green}22`,
                  textShadow:`0 0 8px ${C.green}88`,
                }}>{sessHoursStr}</span>
              )}

              {/* Gap bar (between checkout → next checkin) */}
              {gapW > 0 && gapStart !== null && (
                <div style={{
                  position:"absolute",
                  left:`${gapStart}%`, width:`${gapW}%`,
                  top:"50%", transform:"translateY(-50%)",
                  height: isHovered ? 4 : 3, borderRadius:2,
                  background:`linear-gradient(10deg,${C.red},${C.red})`,
                  opacity:0.35,
                  zIndex:1,
                  transition:"height 0.12s",
                }}/>
              )}

              {/* Check-in dot */}
              <div style={{
                position:"absolute",
                left:`calc(${inPct}% - 5px)`,
                top:"50%", transform:"translateY(-50%)",
                width:10, height:10, borderRadius:"50%",
                background:C.green, border:`2px solid ${C.bg}`,
                boxShadow: isHovered ? `0 0 10px ${C.green}BB` : `0 0 7px ${C.green}99`,
                zIndex:3,
                transition:"box-shadow 0.12s",
              }}/>

              {/* Check-in time label — shown on hover, above the dot */}
              {isHovered && (
                <span style={{
                  position:"absolute",
                  left:`${inPct}%`,
                  top:"calc(50% - 18px)",
                  transform:"translateX(-50%)",
                  fontSize:9, fontWeight:800, color:C.green,
                  fontFamily:"'JetBrains Mono',monospace",
                  letterSpacing:0.3,
                  whiteSpace:"nowrap",
                  zIndex:10,
                  pointerEvents:"none",
                  textShadow:`0 0 8px ${C.green}88`,
                }}>{fmtTime(s.check_in)}</span>
              )}

              {/* Check-out dot */}
              {s.check_out && (
                <div style={{
                  position:"absolute",
                  left:`calc(${outPct}% - 5px)`,
                  top:"50%", transform:"translateY(-50%)",
                  width:10, height:10, borderRadius:"50%",
                  background:C.red, border:`2px solid ${C.bg}`,
                  boxShadow: isHovered ? `0 0 10px ${C.red}BB` : `0 0 7px ${C.red}99`,
                  zIndex:3,
                  transition:"box-shadow 0.12s",
                }}/>
              )}

              {/* Check-out time label — shown on hover, below the dot */}
              {isHovered && s.check_out && (
                <span style={{
                  position:"absolute",
                  left:`${outPct}%`,
                  top:"calc(50% + 10px)",
                  transform:"translateX(-50%)",
                  fontSize:9, fontWeight:800, color:C.red,
                  fontFamily:"'JetBrains Mono',monospace",
                  letterSpacing:0.3,
                  whiteSpace:"nowrap",
                  zIndex:10,
                  pointerEvents:"none",
                  textShadow:`0 0 8px ${C.red}88`,
                }}>{fmtTime(s.check_out)}</span>
              )}

              {/* Active: live time label below pulse dot */}
              {isHovered && active && (
                <span style={{
                  position:"absolute",
                  left:`${nowPct}%`,
                  top:"calc(50% + 10px)",
                  transform:"translateX(-50%)",
                  fontSize:9, fontWeight:800, color:C.yellow,
                  fontFamily:"'JetBrains Mono',monospace",
                  letterSpacing:0.3,
                  whiteSpace:"nowrap",
                  zIndex:10,
                  pointerEvents:"none",
                  textShadow:`0 0 8px ${C.yellow}88`,
                }}>live</span>
              )}

              {/* Live pulse dot */}
              {active && (
                <div style={{
                  position:"absolute",
                  left:`calc(${nowPct}% - 7px)`,
                  top:"50%", transform:"translateY(-50%)",
                  width:14, height:14, borderRadius:"50%",
                  background:C.yellow, boxShadow:`0 0 12px ${C.yellow}`,
                  zIndex:5, animation:"pulse-live 1.2s ease-in-out infinite",
                }}/>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Hours ── */}
      <div style={{
        textAlign:"right", paddingLeft:12,
        transition:"all 0.12s",
      }}>
        {hasSess ? (
          <>
            <div style={{
              fontSize: isHovered ? 16 : 14, fontWeight:800,
              color: isHovered ? (hoursColor === C.dim ? C.sub : hoursColor) : hoursColor,
              fontFamily:"'JetBrains Mono',monospace", lineHeight:1,
              transition:"all 0.12s",
              textShadow: isHovered ? `0 0 12px ${hoursColor}66` : "none",
            }}>{hours}h</div>
            <div style={{ fontSize:8, color: isHovered ? C.sub : C.dim, marginTop:2, letterSpacing:0.5, transition:"color 0.12s" }}>worked</div>
          </>
        ) : (
          <div style={{ fontSize:11, color: isHovered ? C.sub : C.dim, transition:"color 0.12s" }}>—</div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EmployeeDetails() {
  const { empSlug } = useParams();
  const navigate    = useNavigate();
  const empId       = empSlug?.split("-")[0] ?? "";

  const [employee,    setEmployee]    = useState<Employee | null>(null);
  const [attendance,  setAttendance]  = useState<AttendanceDay[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [hoveredDay,  setHoveredDay]  = useState<string | null>(null);

  // Allowed range: March 2026 (offset 0) → December 2026 (offset 9)
  const RANGE_YEAR  = 2026;
  const RANGE_START_MONTH = 2;  // March (0-indexed)
  const RANGE_END_MONTH   = 11; // December
  const TOTAL_MONTHS = RANGE_END_MONTH - RANGE_START_MONTH; // 9

  const now   = new Date();
  const today = toDateStr(now);

  const defaultOffset = (() => {
    if (now.getFullYear() < RANGE_YEAR) return 0;
    if (now.getFullYear() > RANGE_YEAR) return TOTAL_MONTHS;
    const off = now.getMonth() - RANGE_START_MONTH;
    return Math.max(0, Math.min(TOTAL_MONTHS, off));
  })();

  const [monthOffset, setMonthOffset] = useState(defaultOffset);

  const atStart  = monthOffset <= 0;
  const atEnd    = monthOffset >= TOTAL_MONTHS;

  const viewDate   = new Date(RANGE_YEAR, RANGE_START_MONTH + monthOffset, 1);
  const viewYear   = viewDate.getFullYear();
  const viewMonth  = viewDate.getMonth();
  const monthDates = useMemo(() => getMonthDates(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = viewDate.toLocaleDateString("en-IN", { month:"long", year:"numeric" });

  useEffect(() => {
    if (!empId) return;
    (async () => {
      setLoading(true);
      try {
        const empSnap = await getDoc(doc(db, "employees", empId));
        if (!empSnap.exists()) { setError("Employee not found."); return; }
        setEmployee(empSnap.data() as Employee);
        const snap = await getDocs(collection(db, "attendance", empId, "dates"));
        const days = snap.docs.map(d => ({ date: d.id, ...d.data() } as AttendanceDay));
        days.sort((a,b) => b.date.localeCompare(a.date));
        setAttendance(days);
      } catch(e) { setError("Failed to load."); console.error(e); }
      finally { setLoading(false); }
    })();
  }, [empId]);

  const attendanceMap = useMemo(() => {
    const m = new Map<string,AttendanceDay>();
    attendance.forEach(a => m.set(a.date, a));
    return m;
  }, [attendance]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const workDays   = attendance.filter(a => !isNonWorking(a.date));
  const totalDays  = workDays.length;
  const totalHours = workDays.reduce((s,d) => s + calcHours(d.sessions, d.date), 0);
  const avgHours   = totalDays > 0 ? Math.round((totalHours/totalDays)*100)/100 : 0;

  const todayAtt      = attendanceMap.get(today);
  const todayHours    = todayAtt ? calcHours(todayAtt.sessions, today) : 0;
  const isCurrentlyIn = todayAtt ? !todayAtt.sessions[todayAtt.sessions.length-1]?.check_out : false;
  const typeColor     = TYPE_COLOR[employee?.type ?? ""] ?? C.yellow;

  if (loading) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:36,height:36,borderRadius:"50%",border:`2px solid ${C.dim}`,borderTopColor:C.yellow,animation:"spin 0.7s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (error||!employee) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"'Sora',sans-serif"}}>
      <p style={{color:C.red}}>{error||"Not found"}</p>
      <button onClick={()=>navigate("/")} style={{color:C.yellow,background:"none",border:"none",cursor:"pointer",fontSize:13}}>← Back</button>
    </div>
  );

  const INSIGHTS = [
    { label:"Total Present",    value:totalDays,                          unit:"days", sub:"all time",                           color:C.green,  icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={C.green} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { label:"Total Hours",      value:Math.round(totalHours*100)/100,       unit:"hrs",  sub:"all sessions",                       color:C.yellow, icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={C.yellow} strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke={C.yellow} strokeWidth="1.8" strokeLinecap="round"/></svg> },
    { label:"Avg / Day",        value:avgHours,                           unit:"hrs",  sub:`over ${totalDays} days`,             color:C.blue,   icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M3 12h18M3 6h18M3 18h18" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round"/></svg> },
  ];

  // Hour labels for ruler: 9 to 21, no AM/PM
  const rulerHours = [9,10,11,12,13,14,15,16,17,18,19,20,21];

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Sora',sans-serif",color:C.text,display:"flex"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.25);border-radius:3px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse-live{
          0%,100%{box-shadow:0 0 8px ${C.yellow};transform:translateY(-50%) scale(1)}
          50%{box-shadow:0 0 22px ${C.yellow};transform:translateY(-50%) scale(1.4)}
        }
        @keyframes fadeSlide{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        .trow:hover{background:rgba(99,102,241,0.05)!important}
        .nbtn{transition:background 0.15s,color 0.15s;}
        .nbtn:hover:not(:disabled){background:rgba(255,215,0,0.14)!important;color:${C.yellow}!important}
        .backbtn:hover{opacity:0.7}
      `}</style>

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside style={{
        width:SIDEBAR_W, flexShrink:0,
        background:C.surf, borderRight:`1px solid ${C.border}`,
        display:"flex", flexDirection:"column",
        position:"sticky", top:0, height:"100vh", overflowY:"auto",
      }}>
        <div style={{padding:"16px 16px 0"}}>
          <button className="backbtn" onClick={()=>navigate("/")} style={{
            display:"flex",alignItems:"center",gap:6,
            background:"none",border:"none",cursor:"pointer",
            color:C.yellow,fontSize:11,fontWeight:700,fontFamily:"'Sora',sans-serif",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>
        </div>

        {/* Profile */}
        <div style={{padding:"16px 16px 14px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{
            width:54,height:54,borderRadius:16,marginBottom:12,
            background:`linear-gradient(135deg,${typeColor}20,${typeColor}08)`,
            border:`2px solid ${typeColor}38`,
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:`0 0 24px ${typeColor}18,${neu()}`,
          }}>
            {employee.profile_image
              ? <img src={employee.profile_image} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:14}} alt=""/>
              : <span style={{fontSize:20,fontWeight:800,color:typeColor}}>{getInitials(employee.name)}</span>
            }
          </div>
          <h2 style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.3,marginBottom:3}}>{employee.name}</h2>
          <p style={{fontSize:9.5,fontWeight:600,color:typeColor,fontFamily:"'JetBrains Mono',monospace",marginBottom:12}}>{employee.emp_id} ({employee.department})</p>

          {/* Status pill */}
          <div style={{
            padding:"8px 10px",borderRadius:10,
            background:isCurrentlyIn?"rgba(250,204,21,0.05)":todayAtt?"rgba(34,197,94,0.05)":"rgba(239,68,68,0.05)",
            border:`1px solid ${isCurrentlyIn?"#FACC1528":todayAtt?`${C.green}28`:`${C.red}28`}`,
            display:"flex",alignItems:"center",gap:7,
            boxShadow:neu(true),
          }}>
            <div style={{
              width:6,height:6,borderRadius:"50%",flexShrink:0,
              background:isCurrentlyIn?"#FACC15":todayAtt?C.green:C.red,
              boxShadow:`0 0 6px ${isCurrentlyIn?"#FACC15":todayAtt?C.green:C.red}`,
            }}/>
            <div>
              <div style={{fontSize:9.5,fontWeight:700,color:isCurrentlyIn?"#FACC15":todayAtt?C.green:C.red}}>
                {isCurrentlyIn?"Currently In":todayAtt?"Checked Out":"Not In Today"}
              </div>
              {isCurrentlyIn&&<div style={{fontSize:8,color:C.dim,marginTop:1}}>{todayHours}h elapsed</div>}
            </div>
          </div>
        </div>

        {/* Insights */}
        <div style={{padding:"12px 12px 20px",display:"flex",flexDirection:"column",gap:8,flex:1,overflowY:"auto"}}>
          <p style={{fontSize:7.5,fontWeight:700,color:C.dim,letterSpacing:1.2,textTransform:"uppercase",marginBottom:3,paddingLeft:1}}>
            Insights
          </p>
          {INSIGHTS.map(ins => <InsightCard key={ins.label} {...ins}/>)}
        </div>
      </aside>

      {/* ══ MAIN ═════════════════════════════════════════════════════════════ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:"100vh",overflow:"hidden",paddingTop:HEADER_H+RULER_H}}>

        {/* Fixed header */}
        <div style={{
          position:"fixed",top:0,left:SIDEBAR_W,right:0,zIndex:100,
          background:`linear-gradient(180deg,${C.surf}FA 0%,${C.bg}F0 100%)`,
          borderBottom:`1px solid ${C.border}`,
          backdropFilter:"blur(16px)",
          padding:"0 24px",height:HEADER_H,
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
        }}>
          <div>
            <h1 style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.2}}>Attendance Timeline</h1>
          </div>

          {/* Legend */}
          <div style={{display:"flex",alignItems:"center",gap:12,fontSize:9,color:C.sub}}>
            {[{c:C.green,l:"Check-in"},{c:C.red,l:"Check-out"},{c:C.yellow,l:"Live"}].map(({c,l})=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:c,boxShadow:`0 0 4px ${c}`}}/>
                <span>{l}</span>
              </div>
            ))}
          </div>

          {/* Month nav */}
          <div style={{
            display:"flex",alignItems:"center",gap:3,
            background:C.surf2,border:`1px solid ${C.border}`,
            borderRadius:11,padding:"3px 4px",boxShadow:neu(),
          }}>
            <button className="nbtn" onClick={()=>setMonthOffset(o=>o-1)} disabled={atStart} style={{
              width:26,height:26,borderRadius:7,border:"none",
              background:"transparent",color:C.yellow,fontSize:16,fontWeight:800,
              cursor:atStart?"not-allowed":"pointer",
              opacity:atStart?0.2:1,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'Sora',sans-serif",
            }}>‹</button>
            <span style={{fontSize:11,fontWeight:600,color:C.text,minWidth:140,textAlign:"center",padding:"0 3px",whiteSpace:"nowrap"}}>
              {monthLabel}
            </span>
            <button className="nbtn" onClick={()=>setMonthOffset(o=>o+1)}
              disabled={atEnd}
              style={{
                width:26,height:26,borderRadius:7,border:"none",
                background:"transparent",color:C.yellow,fontSize:16,fontWeight:800,
                cursor:atEnd?"not-allowed":"pointer",
                opacity:atEnd?0.2:1,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'Sora',sans-serif",
              }}>›</button>
          </div>
        </div>

        {/* Fixed time ruler — 9 to 21, no AM/PM */}
        <div style={{
          position:"fixed",top:HEADER_H,left:SIDEBAR_W,right:0,zIndex:99,
          display:"grid",gridTemplateColumns:"60px 1fr 68px",
          gap:0,padding:"5px 20px",
          borderBottom:`1px solid ${C.bord2}`,
          background:C.surf,height:RULER_H,
          alignItems:"center",
        }}>
          <div/>
          <div style={{position:"relative",height:16}}>
            {rulerHours.map(h => {
              const pct = ((h*60 - DAY_START) / DAY_SPAN) * 100;
              if (pct < 0 || pct > 100) return null;

              // Display as 12-hour without AM/PM
              const label = h <= 12 ? `${h}` : `${h - 12}`;
              return (
                <span key={h} style={{
                  position:"absolute", left:`${pct}%`,
                  transform:"translateX(-50%)",
                  fontSize:7.5,
                  color: C.sub,
                  fontFamily:"'JetBrains Mono',monospace",
                  fontWeight: h === 12 ? 800 : 600,
                  lineHeight:1,
                }}>{label}</span>
              );
            })}
          </div>
          <div style={{textAlign:"right",fontSize:7,color:C.dim,letterSpacing:0.6,textTransform:"uppercase"}}>
            Hrs
          </div>
        </div>

        {/* Scrollable rows */}
        <div style={{flex:1,overflowY:"auto"}}>
          <div style={{animation:"fadeSlide 0.25s ease"}}>
            {monthDates.map(date=>(
              <TimelineRow
                key={date}
                day={date}
                attendanceMap={attendanceMap}
                today={today}
                hoveredDay={hoveredDay}
                onHover={setHoveredDay}
              />
            ))}
          </div>
          <div style={{height:48}}/>
        </div>
      </div>
    </div>
  );
}