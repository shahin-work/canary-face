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
  return Math.round((mins/60)*10)/10;
}

function isWeekend(dateStr: string) {
  const d = new Date(dateStr), dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) return Math.ceil(d.getDate()/7) % 2 === 0;
  return false;
}

function getMonthDates(year: number, month: number): string[] {
  const dates: string[] = [], d = new Date(year, month, 1);
  while (d.getMonth() === month) { dates.push(toDateStr(d)); d.setDate(d.getDate()+1); }
  return dates;
}

// ─── Timeline constants ───────────────────────────────────────────────────────
const DAY_START = 480;   // 08:00
const DAY_END   = 1320;  // 22:00
const DAY_SPAN  = DAY_END - DAY_START;
const timeToPercent = (t: string) =>
  Math.max(0, Math.min(100, ((toMins(t) - DAY_START) / DAY_SPAN) * 100));

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:      "#06080F",
  surf:    "#0A0D1E",
  surf2:   "#0E1228",
  surf3:   "#121632",
  border:  "rgba(99,102,241,0.15)",
  border2: "rgba(99,102,241,0.07)",
  text:    "#DDE3FF",
  sub:     "#68789A",
  dim:     "#2E3860",
  yellow:  "#FFD700",
  green:   "#22C55E",
  green2:  "#16A34A",
  red:     "#EF4444",
  indigo:  "#6366F1",
  blue:    "#60A5FA",
  purple:  "#A78BFA",
  orange:  "#F97316",
  teal:    "#34D399",
  amber:   "#FBBF24",
  mint:    "#6EE7B7",
  rose:    "#F87171",
};

const TYPE_COLOR: Record<string,string> = {
  permanent: C.yellow, consultant: C.blue, intern: C.purple,
};

const neu = (inset = false) => inset
  ? "inset 4px 4px 10px rgba(0,0,0,0.6), inset -2px -2px 6px rgba(99,102,241,0.04)"
  : "8px 8px 20px rgba(0,0,0,0.6), -3px -3px 8px rgba(99,102,241,0.03)";

// ─── Sub-components ───────────────────────────────────────────────────────────

function InsightCard({ label, value, unit, sub, color, icon }: {
  label: string; value: string|number; unit?: string; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div style={{
      background: C.surf3, borderRadius: 14, padding: "13px 14px",
      border: `1px solid ${C.border}`, boxShadow: neu(),
      display: "flex", flexDirection: "column", gap: 7,
      position: "relative", overflow: "hidden", flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: -16, right: -16, width: 56, height: 56, borderRadius: "50%",
        background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`, pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.sub, letterSpacing: 0.9, textTransform: "uppercase" }}>
          {label}
        </span>
        <div style={{
          width: 24, height: 24, borderRadius: 7,
          background: `${color}16`, border: `1px solid ${color}28`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{icon}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: C.sub }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 9, color: C.dim, marginTop: -2 }}>{sub}</div>}
    </div>
  );
}

function TimelineRow({ day, attendanceMap, today }: {
  day: string; attendanceMap: Map<string,AttendanceDay>; today: string;
}) {
  const d = new Date(day);
  const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
  const dayNum  = d.getDate();
  const isToday  = day === today;
  const isFuture = day > today;
  const weekend  = isWeekend(day);
  const att      = attendanceMap.get(day);
  const hours    = att ? calcHours(att.sessions, day) : 0;
  const state    = isFuture ? "future" : weekend ? "weekend" : att ? "present" : "absent";

  // now position for active session
  const nowObj   = new Date();
  const nowStr   = `${String(nowObj.getHours()).padStart(2,"0")}:${String(nowObj.getMinutes()).padStart(2,"0")}`;
  const nowPct   = timeToPercent(nowStr);

  const trackColor =
    isFuture  ? "rgba(99,102,241,0.04)" :
    weekend   ? "rgba(99,102,241,0.08)" :
    state==="absent" ? "rgba(239,68,68,0.08)" :
    "rgba(99,102,241,0.10)";

  const hoursColor =
    state !== "present" ? C.dim :
    hours >= 8.5 ? C.green :
    hours >= 4   ? C.yellow : C.red;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "60px 1fr 68px",
      alignItems: "center", gap: 0,
      padding: "0 20px",
      background: isToday
        ? "linear-gradient(90deg, rgba(255,215,0,0.04) 0%, transparent 60%)"
        : "transparent",
      borderLeft: isToday ? `2.5px solid ${C.yellow}` : "2.5px solid transparent",
      borderBottom: `1px solid ${C.border2}`,
      minHeight: 58,
      transition: "background 0.15s",
    }}
    className="trow"
    >
      {/* Day label */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingRight: 12 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.9,
          color: isToday ? C.yellow : C.sub, textTransform: "uppercase",
        }}>{dayName}</span>
        <div style={{
          width: 26, height: 26, borderRadius: "50%", marginTop: 3,
          background: isToday ? C.yellow : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: isToday ? `0 0 14px ${C.yellow}55` : "none",
          transition: "all 0.2s",
        }}>
          <span style={{
            fontSize: 12, fontWeight: 800, lineHeight: 1,
            color: isToday ? C.bg : isFuture ? C.dim : state === "weekend" ? C.dim : C.text,
          }}>{dayNum}</span>
        </div>
      </div>

      {/* Timeline track */}
      <div style={{ position: "relative", height: 44, display: "flex", alignItems: "center" }}>
        {/* Base track line */}
        <div style={{
          position: "absolute", left: 0, right: 0,
          top: "50%", transform: "translateY(-50%)",
          height: 3, borderRadius: 2, background: trackColor,
        }} />

        {/* Center label for non-working days */}
        {(weekend || isFuture || state === "absent") && (
          <span style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
            color: weekend ? "rgba(99,102,241,0.3)"
                 : isFuture ? "rgba(99,102,241,0.15)"
                 : "rgba(239,68,68,0.3)",
          }}>
            {weekend ? "Weekend" : isFuture ? "" : "Absent"}
          </span>
        )}

        {/* Hour tick marks */}
        {[8,10,12,14,16,18,20,22].map(h => {
          const pct = ((h*60 - DAY_START) / DAY_SPAN) * 100;
          if (pct < 0 || pct > 100) return null;
          return (
            <div key={h} style={{
              position: "absolute", left: `${pct}%`,
              top: "50%", transform: "translateY(-50%)",
              width: 1, height: 10, background: "rgba(99,102,241,0.12)",
              pointerEvents: "none",
            }} />
          );
        })}

        {/* Session bars */}
        {att?.sessions.map((s, i) => {
          const inPct  = timeToPercent(s.check_in);
          const outPct = s.check_out
            ? timeToPercent(s.check_out)
            : isToday ? nowPct : inPct + 1.5;
          const width  = Math.max(outPct - inPct, 0.8);
          const active = !s.check_out && isToday;

          return (
            <div key={i} style={{position:"absolute",inset:0,pointerEvents:"none"}}>
              {/* Green session bar */}
              <div style={{
                position: "absolute",
                left: `${inPct}%`, width: `${width}%`,
                top: "50%", transform: "translateY(-50%)",
                height: 7, borderRadius: 4,
                background: active
                  ? `linear-gradient(90deg, ${C.green2}, ${C.green}, #86EFAC)`
                  : `linear-gradient(90deg, ${C.green2}, ${C.green})`,
                boxShadow: active ? `0 0 10px ${C.green}66` : `0 0 4px ${C.green2}44`,
                zIndex: 1,
              }} />

              {/* Check-in dot (green, small) */}
              <div style={{
                position: "absolute",
                left: `calc(${inPct}% - 5px)`,
                top: "50%", transform: "translateY(-50%)",
                width: 11, height: 11, borderRadius: "50%",
                background: C.green, border: `2px solid ${C.bg}`,
                boxShadow: `0 0 7px ${C.green}99`,
                zIndex: 3,
              }} />

              {/* Check-in time label */}
              <span style={{
                position: "absolute",
                left: `${inPct}%`,
                top: 2,
                fontSize: 8, fontWeight: 700,
                color: C.green, fontFamily: "'JetBrains Mono',monospace",
                whiteSpace: "nowrap",
                zIndex: 4,
              }}>{fmtTime(s.check_in)}</span>

              {/* Check-out dot (red, small) */}
              {s.check_out && (
                <>
                  <div style={{
                    position: "absolute",
                    left: `calc(${outPct}% - 5px)`,
                    top: "50%", transform: "translateY(-50%)",
                    width: 11, height: 11, borderRadius: "50%",
                    background: C.red, border: `2px solid ${C.bg}`,
                    boxShadow: `0 0 7px ${C.red}99`,
                    zIndex: 3,
                  }} />
                  <span style={{
                    position: "absolute",
                    left: `${outPct}%`,
                    bottom: 2,
                    fontSize: 8, fontWeight: 700,
                    color: C.red, fontFamily: "'JetBrains Mono',monospace",
                    whiteSpace: "nowrap", transform: "translateX(-100%)",
                    zIndex: 4,
                  }}>{fmtTime(s.check_out)}</span>
                </>
              )}

              {/* Live pulse for active session */}
              {active && (
                <div style={{
                  position: "absolute",
                  left: `calc(${nowPct}% - 7px)`,
                  top: "50%", transform: "translateY(-50%)",
                  width: 14, height: 14, borderRadius: "50%",
                  background: C.yellow, boxShadow: `0 0 12px ${C.yellow}`,
                  zIndex: 5, animation: "pulse-live 1.2s ease-in-out infinite",
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Hours */}
      <div style={{ textAlign: "right", paddingLeft: 12 }}>
        {state === "present" ? (
          <div>
            <div style={{
              fontSize: 14, fontWeight: 800, color: hoursColor,
              fontFamily: "'JetBrains Mono',monospace", lineHeight: 1,
            }}>{hours}h</div>
            <div style={{ fontSize: 8, color: C.dim, marginTop: 2, letterSpacing: 0.5 }}>worked</div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.dim }}>—</div>
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

  const [employee,   setEmployee]   = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [monthOffset, setMonthOffset] = useState(0);

  const now       = new Date();
  const today     = toDateStr(now);
  const viewYear  = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const monthDates = useMemo(() => getMonthDates(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString("en-IN", { month: "long", year: "numeric" });

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
      } catch (e) { setError("Failed to load."); console.error(e); }
      finally { setLoading(false); }
    })();
  }, [empId]);

  const attendanceMap = useMemo(() => {
    const m = new Map<string, AttendanceDay>();
    attendance.forEach(a => m.set(a.date, a));
    return m;
  }, [attendance]);

  // ── All-time stats ──────────────────────────────────────────────────────────
  const workDays   = attendance.filter(a => !isWeekend(a.date));
  const totalDays  = workDays.length;
  const totalHours = workDays.reduce((s,d) => s + calcHours(d.sessions, d.date), 0);
  const avgHours   = totalDays > 0 ? Math.round((totalHours/totalDays)*10)/10 : 0;
  const totalSess  = workDays.reduce((s,d) => s + d.sessions.length, 0);
  const avgSess    = totalDays > 0 ? Math.round((totalSess/totalDays)*10)/10 : 0;
  const otDays     = workDays.filter(d => calcHours(d.sessions,d.date) > 8.5).length;
  const otHours    = workDays.reduce((s,d) => {
    const h = calcHours(d.sessions,d.date); return h > 8.5 ? s + Math.round((h-8.5)*10)/10 : s;
  }, 0);
  const bestDay    = workDays.reduce<{date:string;h:number}|null>((best,d) => {
    const h = calcHours(d.sessions,d.date);
    return h > (best?.h ?? 0) ? {date:d.date,h} : best;
  }, null);
  const allCkIn  = workDays.flatMap(d => d.sessions.map(s=>s.check_in));
  const allCkOut = workDays.flatMap(d => d.sessions.map(s=>s.check_out).filter(Boolean)) as string[];
  const earliest = allCkIn.length  > 0 ? allCkIn.reduce((a,b) => a<b?a:b) : "—";
  const latestOut= allCkOut.length > 0 ? allCkOut.reduce((a,b) => a>b?a:b) : "—";

  // ── This month stats ────────────────────────────────────────────────────────
  const mDates   = getMonthDates(now.getFullYear(), now.getMonth());
  const mWorking = mDates.filter(d => !isWeekend(d) && d <= today).length;
  const mPresent = mDates.filter(d => !isWeekend(d) && d <= today && attendanceMap.has(d));
  const mPct     = mWorking > 0 ? Math.round((mPresent.length/mWorking)*100) : 0;
  const mHours   = mPresent.reduce((s,d) => s + calcHours(attendanceMap.get(d)!.sessions, d), 0);

  // ── Today ───────────────────────────────────────────────────────────────────
  const todayAtt     = attendanceMap.get(today);
  const todayHours   = todayAtt ? calcHours(todayAtt.sessions, today) : 0;
  const isCurrentlyIn= todayAtt ? !todayAtt.sessions[todayAtt.sessions.length-1]?.check_out : false;
  const typeColor    = TYPE_COLOR[employee?.type ?? ""] ?? C.yellow;

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:36,height:36,borderRadius:"50%",border:`2px solid ${C.dim}`,borderTopColor:C.yellow,animation:"spin 0.7s linear infinite" }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (error||!employee) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, fontFamily:"'Sora',sans-serif" }}>
      <p style={{color:C.red}}>{error||"Not found"}</p>
      <button onClick={()=>navigate("/")} style={{color:C.yellow,background:"none",border:"none",cursor:"pointer",fontSize:13}}>← Back</button>
    </div>
  );

  const INSIGHTS = [
    { label:"Total Present",   value:totalDays,                                    unit:"days",  sub:"all time",                                                  color:C.green,  icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={C.green}  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { label:"Total Hours",     value:Math.round(totalHours*10)/10,                 unit:"hrs",   sub:"all sessions",                                              color:C.yellow, icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={C.yellow} strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke={C.yellow} strokeWidth="1.8" strokeLinecap="round"/></svg> },
    { label:"Avg / Day",       value:avgHours,                                     unit:"hrs",   sub:`over ${totalDays} days`,                                    color:C.blue,   icon:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M3 12h18M3 6h18M3 18h18" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round"/></svg> },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Sora',sans-serif", color:C.text, display:"flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.25);border-radius:3px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse-live{
          0%,100%{box-shadow:0 0 8px ${C.yellow};transform:translateY(-50%) scale(1)}
          50%{box-shadow:0 0 20px ${C.yellow};transform:translateY(-50%) scale(1.35)}
        }
        @keyframes fadeSlide{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .trow:hover{background:rgba(99,102,241,0.04)!important}
        .nbtn{transition:background 0.15s,color 0.15s;}
        .nbtn:hover:not(:disabled){background:rgba(255,215,0,0.15)!important;color:${C.yellow}!important}
        .backbtn:hover{opacity:0.75}
      `}</style>

      {/* ════════════════════════════ LEFT SIDEBAR ════════════════════════════ */}
      <aside style={{
        width: 215, flexShrink: 0,
        background: C.surf,
        borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh",
        overflowY: "auto",
      }}>
        {/* Back */}
        <div style={{ padding: "18px 18px 0" }}>
          <button className="backbtn"
            onClick={() => navigate("/")}
            style={{
              display:"flex", alignItems:"center", gap:6,
              background:"none", border:"none", cursor:"pointer",
              color:C.yellow, fontSize:11, fontWeight:700, fontFamily:"'Sora',sans-serif",
              letterSpacing:0.3,
            }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Dashboard
          </button>
        </div>

        {/* Profile section */}
        <div style={{ padding:"20px 18px 18px", borderBottom:`1px solid ${C.border}` }}>
          {/* Avatar */}
          <div style={{
            width:50, height:50, borderRadius:18, marginBottom:14,
            background:`linear-gradient(135deg, ${typeColor}20, ${typeColor}08)`,
            border:`2px solid ${typeColor}40`,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:`0 0 28px ${typeColor}1A, ${neu()}`,
          }}>
            {employee.profile_image
              ? <img src={employee.profile_image} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:16}} alt="" />
              : <span style={{fontSize:22,fontWeight:800,color:typeColor}}>{getInitials(employee.name)}</span>
            }
          </div>

          <h2 style={{fontSize:15,fontWeight:700,color:C.text,lineHeight:1.35,marginBottom:3}}>{employee.name}</h2>

          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:12}}>
            <span style={{fontSize:9,fontWeight:700,color:typeColor,fontFamily:"'JetBrains Mono',monospace",letterSpacing:0.5}}>
              {employee.emp_id} ({employee.department})
            </span> 
          </div>

          {/* Today status pill */}
          <div style={{
            padding:"9px 11px", borderRadius:11,
            background: isCurrentlyIn ? "rgba(250,204,21,0.06)" : todayAtt ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
            border:`1px solid ${isCurrentlyIn ? "#FACC1530" : todayAtt ? `${C.green}30` : `${C.red}30`}`,
            display:"flex", alignItems:"center", gap:8,
            boxShadow: neu(true),
          }}>
            <div style={{
              width:7, height:7, borderRadius:"50%", flexShrink:0,
              background: isCurrentlyIn ? "#FACC15" : todayAtt ? C.green : C.red,
              boxShadow:`0 0 7px ${isCurrentlyIn ? "#FACC15" : todayAtt ? C.green : C.red}`,
              animation: isCurrentlyIn ? "pulse-live 1.4s ease-in-out infinite" : "none",
            }}/>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:isCurrentlyIn?"#FACC15":todayAtt?C.green:C.red}}>
                {isCurrentlyIn?"Currently In Office":todayAtt?"Checked Out Today":"Not In Today"}
              </div>
              {isCurrentlyIn && <div style={{fontSize:8,color:C.dim,marginTop:2}}>{todayHours}h elapsed today</div>}
            </div>
          </div>
        </div>

        {/* ─── 10 Insight cards ─── */}
        <div style={{padding:"10px 14px 4px",display:"flex",flexDirection:"column",gap:9,flex:1,overflowY:"auto"}}>
          <p style={{fontSize:8,fontWeight:700,color:C.dim,letterSpacing:1.3,textTransform:"uppercase",marginBottom:5,paddingLeft:2}}>
            Insights
          </p>
          {INSIGHTS.map(ins => (
            <InsightCard key={ins.label} {...ins} />
          ))}
        </div>
      </aside>

      {/* ════════════════════════════ RIGHT MAIN ════════════════════════════ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:"100vh",overflow:"hidden"}}>

        {/* Sticky header */}
        <div style={{
          position:"sticky",top:0,zIndex:30,
          background:`linear-gradient(180deg,${C.surf}F8 0%,${C.bg}F2 100%)`,
          borderBottom:`1px solid ${C.border}`,
          backdropFilter:"blur(14px)",
          padding:"12px 24px",
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
        }}>
          <div>
            <h1 style={{fontSize:15,fontWeight:700,color:C.text,lineHeight:1.2}}>Attendance Timeline</h1>
            <p style={{fontSize:10,color:C.sub,marginTop:2}}>
              Check-in · Check-out · Sessions
            </p>
          </div>

          {/* Legend */}
          <div style={{display:"flex",alignItems:"center",gap:14,fontSize:9,color:C.sub}}>
            {[
              {c:C.green, l:"Check-in"},
              {c:C.red,   l:"Check-out"},
              {c:C.yellow,l:"Live"},
            ].map(({c,l}) => (
              <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:c,boxShadow:`0 0 5px ${c}`}}/>
                <span>{l}</span>
              </div>
            ))}
          </div>

          {/* Month navigator */}
          <div style={{
            display:"flex",alignItems:"center",gap:3,
            background:C.surf2, border:`1px solid ${C.border}`,
            borderRadius:12, padding:"3px 5px",
            boxShadow:neu(),
          }}>
            <button className="nbtn"
              onClick={()=>setMonthOffset(o=>o-1)}
              style={{
                width:28,height:28,borderRadius:8,border:"none",
                background:"transparent",color:C.yellow,fontSize:17,fontWeight:800,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'Sora',sans-serif",
              }}>‹</button>
            <span style={{
              fontSize:11,fontWeight:600,color:C.text,
              minWidth:148,textAlign:"center",padding:"0 4px",whiteSpace:"nowrap",
            }}>
              {monthOffset===0 ? `This Month · ${monthLabel}` :
               monthOffset===-1 ? `Last Month · ${monthLabel}` : monthLabel}
            </span>
            <button className="nbtn"
              onClick={()=>setMonthOffset(o=>o+1)}
              disabled={monthOffset>=0}
              style={{
                width:28,height:28,borderRadius:8,border:"none",
                background:"transparent",color:C.yellow,fontSize:17,fontWeight:800,
                cursor:monthOffset>=0?"not-allowed":"pointer",
                opacity:monthOffset>=0?0.2:1,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:"'Sora',sans-serif",
              }}>›</button>
          </div>
        </div>

        {/* Time axis ruler */}
        <div style={{
          display:"grid",gridTemplateColumns:"60px 1fr 68px",
          gap:0,padding:"5px 20px",
          borderBottom:`1px solid ${C.border2}`,
          background:C.surf,
          position:"sticky",top:55,zIndex:20,
        }}>
          <div/>
          <div style={{position:"relative",height:16}}>
            {[8,9,10,11,12,13,14,15,16,17,18,19,20,21,22].map(h => {
              const pct = ((h*60 - DAY_START) / DAY_SPAN) * 100;
              if (pct < 0 || pct > 100) return null;
              const major = h % 2 === 0;
              return (
                <span key={h} style={{
                  position:"absolute", left:`${pct}%`,
                  transform:"translateX(-50%)",
                  fontSize: major ? 8 : 7,
                  color: major ? C.dim : "rgba(46,56,96,0.6)",
                  fontFamily:"'JetBrains Mono',monospace",
                  lineHeight:1,
                }}>
                  {major ? (h<12?`${h}AM`:h===12?"12PM":`${h-12}PM`) : "·"}
                </span>
              );
            })}
          </div>
          <div style={{textAlign:"right",fontSize:7,color:C.dim,letterSpacing:0.6,textTransform:"uppercase",lineHeight:"16px"}}>
            Hrs
          </div>
        </div>

        {/* Scrollable timeline */}
        <div style={{flex:1,overflowY:"auto"}}>
          <div style={{animation:"fadeSlide 0.25s ease"}}>
            {monthDates.map(date => (
              <TimelineRow
                key={date}
                day={date}
                attendanceMap={attendanceMap}
                today={today}
              />
            ))}
          </div>
          <div style={{height:48}}/>
        </div>
      </div>
    </div>
  );
}