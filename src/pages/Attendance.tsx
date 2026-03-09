import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import EmployeeCard from "../components/EmployeeCard";
import type { EmployeeCardData, DayStatus, Session } from "../components/EmployeeCard";
import logo from "../assets/react.png";

// ─── constants ───────────────────────────────────────────────────────────────

const DATA_START = "2026-03-02";

const HOLIDAYS_2026 = new Set([
  "2026-02-15",
  "2026-03-20",
  "2026-04-03",
  "2026-04-05",
  "2026-04-15",
  "2026-05-01",
  "2026-05-27",
  "2026-08-15",
  "2026-08-25",
  "2026-08-26",
  "2026-09-21",
  "2026-10-02",
  "2026-10-20",
  "2026-11-08",
  "2026-12-25",
]);

function isHoliday(dateStr: string): boolean {
  return HOLIDAYS_2026.has(dateStr);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  const dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) return Math.ceil(d.getDate() / 7) % 2 === 0;
  return false;
}

// in prod
// function isFuture(dateStr: string): boolean {
//   return dateStr > toDateStr(new Date());
// } 
 
function isFuture(_dateStr: string): boolean {
  return false; // always allow in development
}


function calcHours(sessions: Session[], forDate?: string): number {
  let mins = 0;
  const toMins = (t: string) => {
    const [h, m, s] = t.split(":").map(Number);
    return h * 60 + m + (s || 0) / 60;
  };
  const now = new Date();
  const todayStr = toDateStr(now);
  const nowMins  = Math.min(now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60, 21 * 60);

  const WORK_START = 9 * 60;   // 09:00
  const WORK_END   = 21 * 60;  // 21:00

  for (const s of sessions) {
    if (!s.check_in) continue;
    const inMins  = Math.max(toMins(s.check_in),  WORK_START); // clamp early check-in
    if (s.check_out) {
      const outMins = Math.min(toMins(s.check_out), WORK_END); // clamp late check-out
      mins += Math.max(0, outMins - inMins);
    } else {
      if (!forDate || forDate === todayStr) {
        mins += Math.max(0, nowMins - inMins);
      }
    }
  }
  return Math.round((mins / 60) * 10) / 10;
}


function getWeekDates(offset: number): string[] {
  const now    = new Date();
  const dow    = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toDateStr(d);
  });
}

function getMonthDates(offset: number): string[] {
  const now   = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const dates: string[] = [];
  const cur   = new Date(first);
  while (cur.getMonth() === first.getMonth()) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function weekLabel(offset: number, dates: string[]) {
  const fmt = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (offset === 0)  return `This Week · ${fmt(dates[0])} – ${fmt(dates[6])}`;
  if (offset === -1) return `Last Week · ${fmt(dates[0])} – ${fmt(dates[6])}`;
  return `${fmt(dates[0])} – ${fmt(dates[6])}`;
}

function monthLabel(offset: number) {
  const now  = new Date();
  const d    = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const name = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  if (offset === 0)  return `This Month · ${name}`;
  if (offset === -1) return `Last Month · ${name}`;
  return name;
}

function sortEmployees<T extends { emp_id: string }>(emps: T[]): T[] {
  const order = ["CDAI", "CDIN", "CDCN"];
  return [...emps].sort((a, b) => {
    const ga = order.findIndex(g => a.emp_id.startsWith(g));
    const gb = order.findIndex(g => b.emp_id.startsWith(g));
    if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
    return (parseInt(a.emp_id.replace(/\D/g, ""), 10) || 0) -
           (parseInt(b.emp_id.replace(/\D/g, ""), 10) || 0);
  });
}

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

// ─── colours ─────────────────────────────────────────────────────────────────
const BG     = "#060D2E";
const SURF   = "#0B1340";
const BORDER = "rgba(99,102,241,0.2)";
const TEXT   = "#EEF0FF";
const SUB    = "#8090C0";
const DIM    = "#4A5A8A";
const YELLOW = "#FFD700";

// ─── Toast ───────────────────────────────────────────────────────────────────
const TOAST_DURATION = 3200;

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [alive, setAlive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => { setAlive(false); setTimeout(onDone, 350); }, TOAST_DURATION);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", top: 18, right: 18, zIndex: 9999,
      minWidth: 260, maxWidth: 320,
      background: "linear-gradient(135deg,#111C4A 0%,#0A1235 100%)",
      border: "1px solid rgba(99,102,241,0.4)",
      borderRadius: 13, padding: "12px 16px 10px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      opacity: alive ? 1 : 0,
      transform: alive ? "translateX(0)" : "translateX(24px)",
      transition: "opacity 0.35s ease, transform 0.35s ease",
      pointerEvents: "none",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke={YELLOW} strokeWidth="2"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={YELLOW} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <p style={{ color: "#B8C8E8", fontSize: 11, margin: 0, lineHeight: 1.5 }}>{message}</p>
      </div>
      <div style={{ marginTop: 10, height: 2.5, borderRadius: 2, background: "rgba(99,102,241,0.2)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 2,
          background: `linear-gradient(90deg,${YELLOW},#FFA500)`,
          animation: `toast-bar ${TOAST_DURATION}ms linear forwards`,
        }} />
      </div>
    </div>
  );
}

// ─── Filter Dropdown ──────────────────────────────────────────────────────────
type FilterChip = "all" | "present" | "absent" | "in" | "overtime";

const FILTER_LABELS: Record<FilterChip, string> = {
  all:      "All",
  present:  "Present Today",
  absent:   "Absent Today",
  in:       "Currently In",
  overtime: "Overtime",
};

function FilterDropdown({
  active, setActive, counts,
}: {
  active: FilterChip;
  setActive: (f: FilterChip) => void;
  counts: Record<FilterChip, number>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const chips: FilterChip[] = ["all", "present", "absent", "in", "overtime"];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {/* trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "7px 12px", borderRadius: 10,
          border: `1px solid ${active !== "all" ? YELLOW + "66" : BORDER}`,
          background: active !== "all" ? "rgba(255,215,0,0.07)" : SURF,
          cursor: "pointer", fontSize: 11.5, fontWeight: 600,
          color: active !== "all" ? YELLOW : SUB,
          transition: "all 0.15s", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = YELLOW + "88"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = active !== "all" ? YELLOW + "66" : BORDER; }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M7 12h10M11 18h2" stroke={active !== "all" ? YELLOW : SUB} strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
        {active === "all" ? "Filter" : FILTER_LABELS[active]}
        {active !== "all" && (
          <span style={{
            background: "rgba(255,215,0,0.15)", color: YELLOW,
            borderRadius: 8, padding: "0px 5px", fontSize: 9.5, fontWeight: 700,
          }}>
            {counts[active]}
          </span>
        )}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", marginLeft: 1 }}>
          <path d="M6 9l6 6 6-6" stroke={active !== "all" ? YELLOW : SUB} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "linear-gradient(145deg,#0F1848 0%,#080F35 100%)",
          border: `1px solid ${BORDER}`, borderRadius: 12,
          boxShadow: "0 12px 36px rgba(0,0,0,0.65)",
          overflow: "hidden", zIndex: 500, minWidth: 190,
        }}>
          {chips.map((id, i) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => { setActive(id); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 10, padding: "8px 14px",
                  background: isActive ? "rgba(255,215,0,0.09)" : "transparent",
                  border: "none", cursor: "pointer",
                  borderBottom: i < chips.length - 1 ? "1px solid rgba(99,102,241,0.1)" : "none",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.1)"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={{ color: isActive ? YELLOW : TEXT, fontSize: 11.5, fontWeight: isActive ? 700 : 500 }}>
                  {FILTER_LABELS[id]}
                </span>
                <span style={{
                  background: isActive ? "rgba(255,215,0,0.18)" : "rgba(99,102,241,0.18)",
                  color: isActive ? YELLOW : SUB,
                  borderRadius: 8, padding: "1px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {counts[id]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────
export default function Attendance() {
  const navigate = useNavigate();
  const clock    = useClock();

  type ViewMode = "week" | "month";
  const [viewMode,     setViewMode]    = useState<ViewMode>("week");
 
 
 
 
 
 
 
 
 
 
  // const [weekOffset,   setWeekOffset]  = useState(0);

const monday = (d: Date) => {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  return x;
};
const initialWeekOffset = Math.round(
  (monday(new Date(DATA_START)).getTime() - monday(new Date()).getTime()) / (7 * 86400000)
);
const [weekOffset, setWeekOffset] = useState(initialWeekOffset);



  const [monthOffset,  setMonthOffset] = useState(0);
  const [search,       setSearch]      = useState("");
  const [cards,        setCards]       = useState<EmployeeCardData[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState("");
  const [currentlyIn,  setCurrentlyIn] = useState(0);
  const [toast,        setToast]       = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterChip>("all");

  const displayDates = useMemo(
    () => viewMode === "week" ? getWeekDates(weekOffset) : getMonthDates(monthOffset),
    [viewMode, weekOffset, monthOffset]
  );

  const today = toDateStr(new Date());

  function isPeriodBeforeStart(dates: string[]): boolean {
    // Block if the period's last date is before DATA_START (whole period is pre-March)
    return dates[dates.length - 1] < DATA_START;
  }

  async function fetchAll(datesToFetch?: string[]) {
    setLoading(true);
    setError("");
    try {
      const empSnap   = await getDocs(collection(db, "employees"));
      const raw       = empSnap.docs.map(d => d.data() as {
        emp_id: string; name: string; department: string; type: string;
        created_at: string; profile_image?: string;
      });
      const employees = sortEmployees(raw);
      const dates     = datesToFetch ?? displayDates;

      const result: EmployeeCardData[] = await Promise.all(
        employees.map(async (emp) => {
          const weekDays: DayStatus[] = await Promise.all(
            dates.map(async (date) => {
              if (date < DATA_START) return { date, status: "future" as const };
              if (isHoliday(date))   return { date, status: "holiday" as const };
              if (isWeekend(date))   return { date, status: "weekend" as const };
              if (isFuture(date))    return { date, status: "future"  as const };
              try {
                const snap = await getDoc(doc(db, emp.emp_id, date));
                if (snap.exists()) {
                  const d = snap.data() as { employee_name: string; sessions: Session[] };
                  return { date, status: "present" as const, sessions: d.sessions, totalHours: calcHours(d.sessions, date) };
                }
              } catch (_) {}
              return { date, status: "absent" as const };
            })
          );

          const presentDays  = weekDays.filter(d => d.status === "present").length;
          const workingDays  = weekDays.filter(d =>
            d.status !== "weekend" && d.status !== "future" && d.status !== "holiday"
          ).length;
          const totalHours   = weekDays.reduce((a, d) => a + (d.totalHours || 0), 0);
          const attendancePercent = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;

          const todayDay = weekDays.find(d => d.date === today);
          let todayStatus: "present" | "checked-in" | "absent" = "absent";
          let isCurrentlyIn = false;
          if (todayDay?.status === "present" && todayDay.sessions?.length) {
            const last = todayDay.sessions[todayDay.sessions.length - 1];
            if (!last.check_out) { todayStatus = "checked-in"; isCurrentlyIn = true; }
            else todayStatus = "present";
          }

          const overtimeHours = weekDays.reduce((sum, d) => {
          if (d.status === "present" && (d.totalHours ?? 0) > 9) {
            return sum + ((d.totalHours ?? 0) - 9);
          }
          return sum;
        }, 0);

        const roundedOT = Math.round(overtimeHours * 10) / 10;

          return {
            emp_id: emp.emp_id,
            name: emp.name,
            department: emp.department,
            type: emp.type,
            profile_image: emp.profile_image,
            weekDays,
            presentDays,
            totalHours: Math.round(totalHours * 10) / 10,
            attendancePercent,
            todayStatus,
            overtimeHours: roundedOT,
            currentlyIn: isCurrentlyIn,
          };
        })
      );

      setCurrentlyIn(result.filter(c => c.currentlyIn).length);
      setCards(result);
    } catch (e) {
      setError("Failed to load attendance data.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const dates = viewMode === "week" ? getWeekDates(weekOffset) : getMonthDates(monthOffset);
    fetchAll(dates);
  }, [viewMode, weekOffset, monthOffset]);


  // ── Live tick: recalculate hours every 60s for open sessions ──
  useEffect(() => {
    const id = setInterval(() => {
      setCards(prev => prev.map(card => {
        const todayDay = card.weekDays.find(d => d.date === today);
        if (!todayDay || todayDay.status !== "present") return card;
        
        const hasOpenSession = todayDay.sessions?.some(s => !s.check_out);
        if (!hasOpenSession) return card;

        // Recalculate totalHours for today
        const updatedWeekDays = card.weekDays.map(d => {
          if (d.date !== today || !d.sessions) return d;
          return { ...d, totalHours: calcHours(d.sessions, d.date) };
        });

        const totalHours = Math.round(
          updatedWeekDays.reduce((a, d) => a + (d.totalHours || 0), 0) * 10
        ) / 10;

        const overtimeHours = Math.round(
          updatedWeekDays.reduce((sum, d) => {
            if (d.status === "present" && (d.totalHours ?? 0) > 9)
              return sum + ((d.totalHours ?? 0) - 9);
            return sum;
          }, 0) * 10
        ) / 10;

        return { ...card, weekDays: updatedWeekDays, totalHours, overtimeHours };
      }));
    }, 60_000); // every 60 seconds

    return () => clearInterval(id);
  }, [today]);


  const filtered = useMemo(() => {
    let base = cards;
    if (activeFilter === "present")  base = base.filter(c => c.todayStatus !== "absent");
    if (activeFilter === "absent")   base = base.filter(c => c.todayStatus === "absent");
    if (activeFilter === "in")       base = base.filter(c => c.currentlyIn);
    if (activeFilter === "overtime") base = base.filter(c => c.overtimeHours > 0);
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.emp_id.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q)
    );
  }, [cards, search, activeFilter]);

  const filterCounts: Record<FilterChip, number> = useMemo(() => ({
    all:      cards.length,
    present:  cards.filter(c => c.todayStatus !== "absent").length,
    absent:   cards.filter(c => c.todayStatus === "absent").length,
    in:       cards.filter(c => c.currentlyIn).length,
    overtime: cards.filter(c => c.overtimeHours > 0).length,
  }), [cards]);

  // ── Navigation caps ──────────────────────────────────────────────────────
  const now = new Date();

  // Week cap: the Monday of the week that contains Dec 31 2026
  const currentMonday = (() => {
    const d = new Date(now);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const dec31Monday = (() => {
    const d = new Date(2026, 11, 31); // Dec 31 2026
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const maxWeekOffset  = Math.max(0, Math.round((dec31Monday.getTime() - currentMonday.getTime()) / (7 * 86400000)));
  const maxMonthOffset = (2026 - now.getFullYear()) * 12 + (11 - now.getMonth()); // Dec 2026

  const canGoNext = viewMode === "week"
    ? weekOffset < maxWeekOffset
    : monthOffset < maxMonthOffset;

  function goBack() {
    const nextOffset = viewMode === "week" ? weekOffset - 1 : monthOffset - 1;
    const nextDates  = viewMode === "week" ? getWeekDates(nextOffset) : getMonthDates(nextOffset);
    if (isPeriodBeforeStart(nextDates)) {
      setToast("Attendance data is available from 1 March 2026 onwards. No earlier records exist.");
      return;
    }
    viewMode === "week" ? setWeekOffset(o => o - 1) : setMonthOffset(o => o - 1);
  }

  function goFwd() {
    if (canGoNext) viewMode === "week" ? setWeekOffset(o => o + 1) : setMonthOffset(o => o + 1);
  }

  const periodLabel = viewMode === "week"
    ? weekLabel(weekOffset, displayDates)
    : monthLabel(monthOffset);

  const timeStr = clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const dateStr = clock.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Sora', sans-serif", color: TEXT }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700;800&display=swap');
        *, *::before, *::after { font-family: 'Sora', sans-serif; box-sizing: border-box; }
        input::placeholder { color: #3A4A7A; }
        .page-bg {
          background:
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,52,180,0.22) 0%, transparent 70%),
            radial-gradient(ellipse 60% 40% at 100% 80%, rgba(30,20,120,0.18) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 0% 80%, rgba(79,55,200,0.12) 0%, transparent 60%),
            #060D2E;
        }
        .att-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 13px; }
        @media (max-width: 1200px) { .att-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 820px)  { .att-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 520px)  { .att-grid { grid-template-columns: 1fr; } }
        @keyframes spin-tail { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        .spin {
          width:16px; height:16px; border-radius:50%; border:2.5px solid transparent;
          border-top-color:#FFD700; border-right-color:rgba(255,215,0,0.4);
          border-bottom-color:rgba(255,215,0,0.1); animation:spin-tail 0.65s linear infinite;
        }
        .ri { transition:transform 0.35s ease; }
        .rbtn:hover .ri { transform:rotate(180deg); }
        .nbtn { transition:background 0.15s,color 0.15s; }
        .nbtn:hover:not(:disabled) { background:${YELLOW} !important; color:${BG} !important; }
        .mbtn { transition:all 0.15s; }
        .adm-wrap { position:relative; }
        .adm-tip {
          display:none; position:absolute; top:calc(100% + 8px); right:0;
          background:#111C4A; border:1px solid rgba(99,102,241,0.35);
          border-radius:10px; padding:9px 13px; width:240px;
          font-size:11px; line-height:1.55; color:#B0C0E0; z-index:200;
          box-shadow:0 8px 24px rgba(0,0,0,0.5); pointer-events:none; white-space:normal;
        }
        .adm-wrap:hover .adm-tip { display:block; }
        @keyframes toast-bar { from{width:100%} to{width:0%} }
        @keyframes sk { 0%,100%{opacity:.35} 50%{opacity:.6} }
      `}</style>

      {toast && <Toast message={toast} onDone={dismissToast} />}

      {/* ══ HEADER ══ */}
      <header style={{
        background: "linear-gradient(180deg,rgba(10,18,64,0.98) 0%,rgba(6,13,46,0.95) 100%)",
        borderBottom: `1px solid ${BORDER}`,
        position: "sticky", top: 0, zIndex: 40, backdropFilter: "blur(12px)",
      }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", gap: 10 }}>

          {/* logo */}
          {/* <a href="https://www.canarysuite.in/tool/39eI96JB8MFWX8RKQiTK" */}
          <a href="https://www.canarysuite.in/tool/canary-face"
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
            <img
              src={logo}
              alt="Canary Face"
              style={{ width: 33, height: 33, borderRadius: 8, objectFit: "contain", background: SURF }}
            />
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: TEXT, lineHeight: 1, margin: 0 }}>Canary Face</p>
              <p style={{ fontSize: 10, color: SUB, marginTop: 2 }}>Attendance · Software Team</p>
            </div>
          </a>

          <div style={{ flex: 1 }} />

          {/* right group */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>

            {/* stats pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: SURF, border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: "5px 13px", fontSize: 12, flexShrink: 0,
            }}>
              <span style={{ color: TEXT, fontWeight: 700 }}>{cards.length}</span>
              <span style={{ color: SUB }}>employees</span>
              <div style={{ width: 1, height: 13, background: "rgba(99,102,241,0.25)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", boxShadow: "0 0 6px #4ADE80" }} />
                <span style={{ color: "#4ADE80", fontWeight: 700 }}>{currentlyIn}</span>
                <span style={{ color: SUB }}>in office</span>
              </div>
            </div>

            {/* admin badge */}
            <div className="adm-wrap" style={{ flexShrink: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(255,215,0,0.07)", border: `1px solid ${YELLOW}44`,
                borderRadius: 10, padding: "5px 12px", cursor: "default",
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" stroke={YELLOW} strokeWidth="2"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={YELLOW} strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span style={{ color: YELLOW, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5 }}>ADMIN</span>
              </div>
              <div className="adm-tip">Available on the office device only.</div>
            </div>

            {/* live clock */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
              <span style={{ color: TEXT, fontWeight: 700, fontSize: 10, marginTop: 4, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 0.8, lineHeight: 1 }}>
                {timeStr}
              </span>
              <span style={{ color: DIM, fontSize: 9, marginTop: 2, whiteSpace: "nowrap" }}>{dateStr}</span>
            </div>

            {/* divider */}
            <div style={{ width: 1, height: 22, background: BORDER, flexShrink: 0 }} />

            {/* refresh */}
            <button
              onClick={() => {
                const dates = viewMode === "week" ? getWeekDates(weekOffset) : getMonthDates(monthOffset);
                fetchAll(dates);
              }}
              disabled={loading} title="Refresh" className="rbtn"
              style={{
                width: 33, height: 33, borderRadius: 9, border: `1px solid ${BORDER}`,
                background: SURF, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, transition: "transform 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
              {loading
                ? <div className="spin" />
                : <svg className="ri" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M4 4v5h.582m0 0a8.001 8.001 0 0115.356 2m.062-7L20 9h-5M20 20v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m-.062 7L4 15h5"
                      stroke={YELLOW} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
              }
            </button>
          </div>
        </div>
      </header>

      {/* ══ MAIN ══ */}
      <div className="page-bg" style={{ minHeight: "calc(100vh - 57px)" }}>

        {/* ── TOOLBAR ── */}
        <div style={{
          maxWidth: 1300, margin: "0 auto", padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
        }}>

          {/* left: toggle + navigator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Week / Month toggle */}
            <div style={{ display: "flex", background: SURF, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 3, gap: 2 }}>
              {(["week", "month"] as const).map(m => (
                <button key={m} className="mbtn"
                  onClick={() => { setViewMode(m); setWeekOffset(0); setMonthOffset(0); }}
                  style={{
                    padding: "5px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                    fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase",
                    background: viewMode === m ? YELLOW : "transparent",
                    color:      viewMode === m ? BG     : SUB,
                  }}>
                  {m}
                </button>
              ))}
            </div>

            {/* Period navigator */}
            <div style={{
              display: "flex", alignItems: "center", gap: 3,
              background: SURF, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "4px 8px",
            }}>
              <button className="nbtn" onClick={goBack}
                style={{
                  width: 26, height: 26, borderRadius: 6, border: "none",
                  background: "transparent", color: YELLOW, fontSize: 17, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800,
                }}>‹</button>
              <span style={{ color: TEXT, fontSize: 12, fontWeight: 500, minWidth: 210, textAlign: "center", padding: "0 4px" }}>
                {periodLabel}
              </span>
              <button className="nbtn" onClick={goFwd} disabled={!canGoNext}
                style={{
                  width: 26, height: 26, borderRadius: 6, border: "none",
                  background: "transparent", color: YELLOW, fontSize: 17,
                  cursor: canGoNext ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800,
                  opacity: canGoNext ? 1 : 0.2,
                }}>›</button>
            </div>
          </div>

          {/* right: search + filter dropdown side by side */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Search */}
            <div style={{ position: "relative", width: "min(220px,100%)" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke={DIM} strokeWidth="2.2" />
                <path d="M21 21l-4.35-4.35" stroke={DIM} strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <input type="text" placeholder="Search name, ID, dept..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                  borderRadius: 10, border: `1px solid ${BORDER}`, background: SURF,
                  color: TEXT, fontSize: 12, outline: "none", caretColor: YELLOW,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = YELLOW)}
                onBlur={e => (e.currentTarget.style.borderColor = BORDER)} />
            </div>

            {/* Filter dropdown */}
            <FilterDropdown active={activeFilter} setActive={setActiveFilter} counts={filterCounts} />
          </div>
        </div>

        {/* ── LEGEND ── */}
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 30px 14px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { c: "#25ba5c",               l: "Present" },
            { c: "rgba(239,68,68,0.5)",   l: "Absent"  },
            { c: "rgba(99,102,241,0.13)", l: "Weekend" },
            { c: "rgba(251,191,36,0.25)", l: "Holiday" },
          ].map(({ c, l }) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 18, height: 7, borderRadius: 2.5, background: c }} />
              <span style={{ color: SUB, fontSize: 10.5 }}>{l}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 18, height: 7, borderRadius: 2.5, background: "#1e1451", outline: "1px solid #FFD700", outlineOffset: 1 }} />
            <span style={{ color: SUB, fontSize: 10.5 }}>Today</span>
          </div>
        </div>

        {/* ── GRID ── */}
        <main style={{ maxWidth: 1300, margin: "0 auto", padding: "0 24px 48px" }}>
          {error && (
            <div style={{
              borderRadius: 10, padding: "10px 16px", marginBottom: 14, fontSize: 12.5,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5",
            }}>⚠ {error}</div>
          )}

          {loading ? (
            <div className="att-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{
                  borderRadius: 14, height: viewMode === "month" ? 260 : 148,
                  background: SURF, animation: "sk 1.4s ease-in-out infinite",
                }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🔍</div>
              <p style={{ fontWeight: 600, color: SUB }}>No employees found</p>
            </div>
          ) : (
            <div className="att-grid">
              {filtered.map(d => (
                <EmployeeCard key={d.emp_id} data={d} viewMode={viewMode}
                onClick={() => navigate(`/${d.emp_id}`)} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}



 