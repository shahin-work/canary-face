import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collection, getDocs, doc, getDoc, query, where, documentId } from "firebase/firestore";
import { db } from "../firebase";
import EmployeeCard from "../components/EmployeeCard";
import type { EmployeeCardData, DayStatus, Session } from "../components/EmployeeCard";
import logo from "../assets/react.png";
import logo2 from "../assets/react1.png";
import AddMeeting from "../components/AddMeeting";
import Regularization from "../components/Regularization";
import LeaveRequest from "../components/LeaveRequest";
import ReportIssue from "../components/ReportIssue";
import CanaryGame from "../components/CanaryGame";
import MaintenanceOverlay from "../components/MaintenanceOverlay";
import BorderGlow from "../components/BorderGlow";
import CardGravity from "../components/CardGravity";
import { useNavigate, useLocation } from "react-router-dom";
import { DATA_START, isHiddenDate } from "../App";
import { applyAttendanceBonus } from "../data/attendanceBonus";
import { calcHours } from "../lib/hours";
// ─── constants ───────────────────────────────────────────────────────────────


// Marquee toggles (never shown on phone). If both false → nothing shows; one false → only the other.
const SHOW_MARQUE_FROM_DB = true; // HR notices fetched from the DB (/hr), shown in yellow
const SHOW_MARQUE_FROM_COMPUTING = true; // "Computing" marquee, shown in blue
const MARQUEE_SPEED       = 0.9;  // px per frame (higher = faster)
const MARQUEE_GAP         = 20;   // px gap between the two copies of the marquee track (higher = more space)


const HOLIDAYS_2026 = new Set([
  "2026-02-15", "2026-03-20", "2026-04-03", "2026-04-05", "2026-04-15",
  "2026-05-01", "2026-05-27", "2026-08-15", "2026-08-25", "2026-08-26",
  "2026-09-21", "2026-10-02", "2026-10-20", "2026-11-08", "2026-12-25",
]);

function isHoliday(dateStr: string): boolean {
  return HOLIDAYS_2026.has(dateStr);
}


// ─── helpers ─────────────────────────────────────────────────────────────────
// True when Firestore says we've burned through the day's free read quota.
// (firebase throws { code: "resource-exhausted" } once the daily limit is hit)
function isQuotaError(e: any): boolean {
  const code = e?.code || "";
  const msg  = String(e?.message || e || "").toLowerCase();
  return code === "resource-exhausted"
    || msg.includes("resource-exhausted")
    || msg.includes("quota")
    || msg.includes("exceeded");
}

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

// calcHours is centralised in ../lib/hours (imported above) — single source of truth.

function AnimatedLogo() {
  const [showSparkle, setShowSparkle] = useState(false);
  const [dropping, setDropping] = useState(false);   // per-minute fall/replace cycle (3s)

  useEffect(() => {
    const id = setInterval(() => {
      setShowSparkle(true);
      setTimeout(() => setShowSparkle(false), 300);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // At the :00 second of every minute, the old logo falls out and a fresh one drops in.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const now = new Date();
      const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      timer = setTimeout(() => {
        setDropping(true);
        setTimeout(() => setDropping(false), 3000); // animation length
        scheduleNext();
      }, msToNextMinute);
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ position: "relative", width: 33, height: 33, flexShrink: 0, overflow: "hidden", borderRadius: 8 }}>
      {/* outgoing logo — falls down and fades when a new minute ticks */}
      <img
        src={logo}
        alt="Canary Face"
        className={dropping ? "cf-logo-fall-out" : ""}
        style={{ width: 33, height: 33, borderRadius: 8, objectFit: "contain", background: SURF, position: "absolute", top: 0, left: 0 }}
      />
      {/* incoming logo — drops in from the top during the cycle */}
      <img
        src={logo}
        alt=""
        aria-hidden
        className={dropping ? "cf-logo-drop-in" : ""}
        style={{
          width: 33, height: 33, borderRadius: 8, objectFit: "contain", background: SURF,
          position: "absolute", top: 0, left: 0,
          opacity: dropping ? 1 : 0,
        }}
      />
      {/* sparkle overlay (unchanged) */}
      <img
        src={logo2}
        alt=""
        style={{
          width: 33, height: 33, borderRadius: 8, objectFit: "contain", background: SURF,
          position: "absolute", top: 0, left: 0, zIndex: 2,
          opacity: showSparkle ? 1 : 0,
          transition: showSparkle ? "opacity 0.05s ease" : "opacity 0.2s ease",
        }}
      />
    </div>
  );
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

// "just now" → "10 sec before" → … → "1 min before" → "5 min before" → "Xh ago"
// Re-renders every 10s so the label stays fresh.
function useRelativeUpdated(ts: number | null): string {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force(n => n + 1), 10000);
    return () => clearInterval(id);
  }, []);
  if (!ts) return "—";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${Math.floor(secs / 10) * 10} sec before`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min before`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h before`;
}

// ─── colours ─────────────────────────────────────────────────────────────────
const BG     = "#060D2E";
const SURF   = "#0B1340";
const BORDER = "rgba(99,102,241,0.2)";
const TEXT   = "#EEF0FF";
const SUB    = "#8090C0";
const DIM    = "#4A5A8A";
const YELLOW = "#FFD700";
const GREEN  = "#4ADE80";   // refresh button accent

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
  all: "All", present: "Present Today", absent: "Absent Today",
  in: "Currently In", overtime: "Overtime",
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

// ─── People list (used in the hover tooltips) ─────────────────────────────────
function PeopleList({ people, empty, showSince }: {
  people: { emp_id: string; name: string; profile_image?: string; checkIn?: string }[];
  empty: string;
  showSince?: boolean;
}) {
  if (people.length === 0)
    return <p style={{ color: SUB, fontSize: 11, margin: 0, padding: "4px 2px" }}>{empty}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {people.map(p => (
        <div key={p.emp_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 4px" }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0, overflow: "hidden",
            background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {p.profile_image
              ? <img src={p.profile_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 8.5, fontWeight: 700, color: SUB }}>
                  {p.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>}
          </div>
          <span style={{ color: TEXT, fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap" }}>{p.name}</span>
          {showSince && p.checkIn && (
            <span style={{ marginLeft: "auto", color: SUB, fontSize: 9.5, fontFamily: "'JetBrains Mono',monospace", paddingLeft: 8 }}>
              {p.checkIn.slice(0, 5)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Hover popover (in office / wfh / out) — opens on hover, lingers after leaving ──
function HoverPopover({
  accent, label, count, dot, title, people, showSince, empty,
}: {
  accent: string;
  label: string;
  count: number;
  dot: React.ReactNode;
  title: string;
  people: { emp_id: string; name: string; profile_image?: string; checkIn?: string }[];
  showSince?: boolean;
  empty: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const hideSoon = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 2500); // linger ~2.5s after leaving
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 5, cursor: "default" }}
      onMouseEnter={show}
      onMouseLeave={hideSoon}
    >
      {dot}
      <span style={{ color: accent, fontWeight: 700 }}>{count}</span>
      <span style={{ color: SUB }}>{label}</span>

      <div
        className="cf-pop"
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        style={{
          position: "absolute", top: "calc(100% + 10px)", left: "50%",
          minWidth: 210, maxWidth: 270, maxHeight: 300, overflowY: "auto",
          background: "linear-gradient(150deg,#101A4E 0%,#0A1238 60%,#070E2C 100%)",
          border: `1px solid ${accent}40`, borderRadius: 14, padding: 11, zIndex: 600,
          boxShadow: `0 16px 44px rgba(0,0,0,0.65), 0 0 0 1px ${accent}18, inset 0 1px 0 rgba(255,255,255,0.04)`,
          opacity: open ? 1 : 0,
          transform: open ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-6px)",
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.18s ease, transform 0.18s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 9px", paddingLeft: 2 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, boxShadow: `0 0 6px ${accent}` }} />
          <p style={{ fontSize: 9, fontWeight: 800, color: accent, letterSpacing: 0.7, textTransform: "uppercase", margin: 0 }}>{title}</p>
          <span style={{
            marginLeft: "auto", fontSize: 9, fontWeight: 800, color: accent,
            background: `${accent}1c`, border: `1px solid ${accent}3a`, borderRadius: 20, padding: "1px 7px",
          }}>{people.length}</span>
        </div>
        <PeopleList people={people} empty={empty} showSince={showSince} />
      </div>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────
export default function Attendance() {
  const navigate = useNavigate();
  const clock    = useClock();

    const location = useLocation();

    // track viewport width so isPhone re-evaluates on resize (not just refresh)
    const [viewportW, setViewportW] = useState(() => window.innerWidth);
    useEffect(() => {
      const onResize = () => setViewportW(window.innerWidth);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    const isPhone = useMemo(() => {
      const smallScreen = viewportW < 820;                                      // phone-sized screen
      const onPhoneRoute = location.pathname.startsWith("/phone");
      return onPhoneRoute || smallScreen;
    }, [location.pathname, viewportW]);

  
  type ViewMode = "week" | "month";
  const [viewMode,     setViewMode]    = useState<ViewMode>("week");
  const [weekOffset,   setWeekOffset]  = useState(0);   // 0 = current week (today)
  const [monthOffset,  setMonthOffset] = useState(0);
  const [search,       setSearch]      = useState("");
  const [cards,        setCards]       = useState<EmployeeCardData[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [refreshing,   setRefreshing]  = useState(false);
  const [lastUpdated,  setLastUpdated] = useState<number | null>(null);
  const [gameOpen,     setGameOpen]    = useState(false);
  const [gameFull,     setGameFull]    = useState(false);   // logo-launched game fills the page
  const updatedLabel = useRelativeUpdated(lastUpdated);
  const [error,        setError]       = useState("");
  const [quotaHit,     setQuotaHit]    = useState(false);   // Firebase daily read limit reached → fun maintenance overlay
  // Dev/preview override: add ?maint=1 to the URL to force the maintenance modal (so it can be seen without burning the quota).
  const forceMaint = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("maint");
  const showMaintenance = quotaHit || forceMaint;
  // The <MaintenanceOverlay> render below is currently commented out (WIP); keep
  // these referenced so the import + variable don't trip the unused-symbol check.
  void showMaintenance; void MaintenanceOverlay;
  const [, setCurrentlyIn] = useState<number>(0);
  const [toast,        setToast]       = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterChip>("all");
  const [isLive,       setIsLive]      = useState(false);
  const [inOffice, setInOffice] = useState<{ emp_id: string; name: string; profile_image?: string; checkIn?: string }[]>([]);
  const [meetingOpen,  setMeetingOpen] = useState(false);
  const [regOpen,      setRegOpen]     = useState(false);
  const [leaveOpen,    setLeaveOpen]   = useState(false);
  const [notices,      setNotices]     = useState<string[]>([]);
  const [issueOpen,    setIssueOpen]   = useState(false);
  const [gravityOn,    setGravityOn]   = useState(false);   // fun-only gravity toggle
  const didAutoScroll = useRef(false);
  const marqueeBoxRef   = useRef<HTMLDivElement>(null);
  const marqueeTrackRef = useRef<HTMLDivElement>(null);
  const gridRef         = useRef<HTMLDivElement>(null);

  // Logo click: 1st time on the main page → enable fun (gravity) mode.
  // Once already in fun mode → clicking the logo opens the full-page game.
  const onLogoClick = useCallback(() => {
    if (location.pathname !== "/") return;
    if (!gravityOn) { setGravityOn(true); return; }
    setGameFull(true);
    setGameOpen(true);
  }, [location.pathname, gravityOn]);


  const displayDates = useMemo(
    () => viewMode === "week" ? getWeekDates(weekOffset) : getMonthDates(monthOffset),
    [viewMode, weekOffset, monthOffset]
  );

  const today = toDateStr(new Date());
  const myId = typeof window !== "undefined" ? localStorage.getItem("cf_my_emp_id") : null;
  function isPeriodBeforeStart(dates: string[]): boolean {
    return dates[dates.length - 1] < DATA_START;
  }

  async function fetchNotices() {
    try {
      const snap = await getDoc(doc(db, "settings", "notices"));
      const list = snap.exists() ? (snap.data().texts as any[]) : [];
      // Supports both the legacy string[] format and the new {text,enabled}[] format.
      // Only notices that are enabled (or legacy plain strings) are shown.
      const out = Array.isArray(list)
        ? list
            .map(item => (typeof item === "string" ? { text: item, enabled: true } : item))
            .filter(item => item && item.enabled !== false && item.text && String(item.text).trim())
            .map(item => String(item.text))
        : [];
      setNotices(out);
    } catch (_) {
      setNotices([]);
    }
  }

async function fetchTodayInOffice() {
  try {
    const empSnap = await getDocs(collection(db, "employees"));
    const employees = empSnap.docs.map(d => d.data() as {
      emp_id: string; name: string; profile_image?: string;
    });
    const todayKey = toDateStr(new Date());

    const rows = await Promise.all(
      employees.map(async (emp) => {
        try {
          const snap = await getDoc(doc(db, emp.emp_id, todayKey));
          if (snap.exists()) {
            const data = snap.data() as { sessions?: Session[] };
            if (!data.sessions?.length) return null;
            const last = data.sessions[data.sessions.length - 1];
            if (last.check_out) return null; // checked out → not currently in
            return {
              emp_id: emp.emp_id,
              name: emp.name,
              profile_image: emp.profile_image,
              checkIn: last.check_in, // the open session's check-in
            };
          }
        } catch (_) {}
        return null;
      })
    );

    const inList = rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      // earliest check-in first → person in office longest is on top
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

    setInOffice(inList);
    setCurrentlyIn(inList.length);
  } catch (e) {
    if (isQuotaError(e)) setQuotaHit(true);
    console.error(e);
  }
}

  async function fetchAll(datesToFetch?: string[], silent = false) {
    // silent = keep current cards visible, just show the "Refreshing…" indicator
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const empSnap = await getDocs(collection(db, "employees"));
      const raw = empSnap.docs.map(d => d.data() as {
        emp_id: string; name: string; department: string; type: string;
        created_at: string; profile_image?: string;
      });
      const employees = sortEmployees(raw);
      const dates     = datesToFetch ?? displayDates;

      // Firebase read optimisation: only fetch the docs INSIDE the visible date window
      // (this week / this month), not the whole attendance history. Doc IDs are
      // "YYYY-MM-DD" (lexicographically sortable), so a documentId() range query returns
      // just the days on screen → on week view ≈7 reads/employee, month view ≈31, instead
      // of every day ever recorded. Switching week/month or prev/next re-fetches only that
      // new window.
      const rangeStart = dates[0];
      const rangeEnd   = dates[dates.length - 1];

      const result: EmployeeCardData[] = await Promise.all(
        employees.map(async (emp) => {
          // ONE ranged query per employee for ONLY the visible dates → minimal reads.
          let byDate: Record<string, any> = {};
          try {
            const snap = await getDocs(query(
              collection(db, emp.emp_id),
              where(documentId(), ">=", rangeStart),
              where(documentId(), "<=", rangeEnd),
            ));
            snap.docs.forEach(dDoc => { byDate[dDoc.id] = dDoc.data(); });
          } catch (_) {}

          const weekDays: DayStatus[] = dates.map((date) => {
            if (date < DATA_START) return { date, status: "future" as const };
            // Hidden dates → render blank (no data, not counted), regardless of DB.
            if (isHiddenDate(date)) return { date, status: "future" as const };
            if (isHoliday(date))   return { date, status: "holiday" as const };
            if (isWeekend(date))   return { date, status: "weekend" as const };
            if (date > today)      return { date, status: "future"  as const };

            const d = byDate[date] as { sessions: Session[]; extra_time?: string | null } | undefined;
            // ATTENDANCE BONUS: inject the 10-min session for the special employee (see attendanceBonus.ts)
            const daySessions = applyAttendanceBonus(emp.emp_id, date, d?.sessions);
            if (daySessions.length > 0) {
              const workSessions  = daySessions.filter((s: any) => !s.leave);
              const leaveSessions = daySessions.filter((s: any) => s.leave);

              // Any leave on the day → status "leave" (NOT present). Worked hours stay separate.
              if (leaveSessions.length > 0) {
                const kind: "full" | "half" | "quarter" =
                  leaveSessions.some((s: any) => s.leave_kind === "full")    ? "full"
                  : leaveSessions.some((s: any) => s.leave_kind === "half")  ? "half"
                  : "quarter";
                // leave slots as 0..1 fractions of the 09:00–18:00 (540 min) day, for the red/green split
                const toMin = (t: string) => { const [h, m] = (t || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
                const leaveSlots = leaveSessions.map((s: any) => ({
                  start: Math.max(0, Math.min(1, (toMin(s.check_in) - 540) / 540)),
                  end:   Math.max(0, Math.min(1, (toMin(s.check_out) - 540) / 540)),
                }));
                return {
                  date, status: "leave" as const, sessions: daySessions,
                  totalHours: 0,                                   // leave days don't add to the total
                  workedHours: calcHours(workSessions, date),      // worked portion (kept separate)
                  leaveKind: kind, leaveSlots,
                };
              }

              const isWfh = workSessions.length > 0 && workSessions.every((s: any) => s.wfh === true);
              return {
                date,
                status: "present" as const,
                sessions: daySessions,
                totalHours: calcHours(workSessions, date),
                extraTime: d?.extra_time ?? null,
                wfh: isWfh,
              };
            }

            // today, no check-in → ABSENT (red) for the whole day (not "awaiting").
            if (date === today) return { date, status: "absent" as const };
            // past working day with no attendance → treat as leave (was "absent")
            if (date < today)   return { date, status: "leave" as const };
            return { date, status: "future" as const };
          });

          const presentDays = weekDays.filter(d => d.status === "present").length;
          const workingDays = weekDays.filter(d =>
            d.status !== "weekend" && d.status !== "future" && d.status !== "holiday"
          ).length;
          const totalHours = weekDays.reduce((a, d) => a + (d.totalHours || 0), 0);
          const attendancePercent = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0;

          const todayDay  = weekDays.find(d => d.date === today);
          const extraTime = todayDay?.extraTime ?? null;
          // No check-in today → "absent" (red). Becomes checked-in/present once they scan in.
          let todayStatus: "present" | "checked-in" | "absent" | "awaiting" = "absent";
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
            extraTime,
            currentlyIn: isCurrentlyIn,
          };
        })
      );

      setCards(result);
      setLastUpdated(Date.now());
    } catch (e) {
      if (isQuotaError(e)) setQuotaHit(true);
      else if (!silent) setError("Failed to load attendance data.");
      console.error(e);
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }

  // ── Lightweight auto-refresh: re-read ONLY today's column for each employee and
  //    merge it into the existing cards. Past days never change, so on an interval
  //    we don't re-read the whole week/month — this reads ~N docs (today only)
  //    instead of ~N×7, keeping us well under the Firebase daily read quota.
  async function refreshTodayColumn() {
    try {
      const empSnap = await getDocs(collection(db, "employees")); // 1 query
      const empById: Record<string, any> = {};
      empSnap.docs.forEach(d => { const x = d.data() as any; empById[x.emp_id] = x; });

      // one today-doc read per employee (documentId == today)
      const todays = await Promise.all(
        Object.keys(empById).map(async (empId) => {
          try {
            const snap = await getDoc(doc(db, empId, today));
            return { empId, data: snap.exists() ? snap.data() : null };
          } catch { return { empId, data: null }; }
        })
      );
      const todayByEmp: Record<string, any> = {};
      todays.forEach(t => { todayByEmp[t.empId] = t.data; });

      // merge today's fresh data into each existing card without touching past days
      setCards(prev => prev.map(card => {
        if (!card.weekDays.some(d => d.date === today)) return card; // today not in view
        const d = todayByEmp[card.emp_id] as { sessions: Session[]; extra_time?: string | null } | undefined;
        const daySessions = applyAttendanceBonus(card.emp_id, today, d?.sessions);

        let newToday: DayStatus;
        if (daySessions.length > 0) {
          const workSessions  = daySessions.filter((s: any) => !s.leave);
          const leaveSessions = daySessions.filter((s: any) => s.leave);
          if (leaveSessions.length > 0) {
            const kind: "full" | "half" | "quarter" =
              leaveSessions.some((s: any) => s.leave_kind === "full") ? "full"
              : leaveSessions.some((s: any) => s.leave_kind === "quarter") ? "quarter" : "half";
            newToday = { date: today, status: "leave", sessions: daySessions, leaveKind: kind,
              workedHours: calcHours(workSessions, today), totalHours: calcHours(workSessions, today) };
          } else {
            const isWfh = workSessions.length > 0 && workSessions.every((s: any) => s.wfh === true);
            newToday = { date: today, status: "present", sessions: daySessions,
              totalHours: calcHours(workSessions, today), wfh: isWfh, extraTime: d?.extra_time ?? null };
          }
        } else {
          newToday = { date: today, status: "absent" };
        }

        const weekDays = card.weekDays.map(dd => dd.date === today ? newToday : dd);
        const presentDays = weekDays.filter(dd => dd.status === "present").length;
        const totalHours = Math.round(weekDays.reduce((a, dd) => a + (dd.totalHours || 0), 0) * 10) / 10;
        const last = newToday.sessions?.[newToday.sessions.length - 1];
        const currentlyIn = newToday.status === "present" && !!last && !last.check_out;
        return { ...card, weekDays, presentDays, totalHours,
          extraTime: newToday.extraTime ?? null, currentlyIn,
          todayStatus: newToday.status === "present" ? (currentlyIn ? "checked-in" : "present") : "absent" };
      }));
      setLastUpdated(Date.now());
    } catch (e) {
      if (isQuotaError(e)) setQuotaHit(true);
      console.error("[refreshTodayColumn]", e);
    }
  }

  useEffect(() => {
    const dates = viewMode === "week" ? getWeekDates(weekOffset) : getMonthDates(monthOffset);
    fetchAll(dates);
  }, [viewMode, weekOffset, monthOffset]);

  // ── Auto-refresh today's column every 10 min — ONLY when the tab is VISIBLE and
  //    the user is not idle (no interaction for 5 min). Background tabs and walked-
  //    away sessions make zero Firebase reads.
  useEffect(() => {
    if (isPhone) return;
    const REFRESH_MS = 10 * 60 * 1000;
    const IDLE_MS    = 5 * 60 * 1000;
    let lastActive = Date.now();
    const markActive = () => { lastActive = Date.now(); };
    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    const id = setInterval(() => {
      const visible = document.visibilityState === "visible";
      const active  = Date.now() - lastActive < IDLE_MS;
      if (visible && active && !gameOpen && !quotaHit) refreshTodayColumn();
    }, REFRESH_MS);

    return () => {
      clearInterval(id);
      events.forEach(e => window.removeEventListener(e, markActive));
    };
  }, [isPhone, today, gameOpen, quotaHit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTodayInOffice();
    fetchNotices();
    getDoc(doc(db, "settings", "app")).then(snap => {
      if (snap.exists()) setIsLive(snap.data().live ?? false);
    }).catch(() => {});
  }, []);

  // ── Fun mode lock: while gravity is on, block ALL navigation/clicks app-wide.
  //     (Matter drag uses mousedown/move/up, which we leave alone.) Disable = refresh.
  //     Suspended while the game is open so the game can receive Space/clicks.
  useEffect(() => {
    if (!gravityOn || gameOpen) return;
    const block = (e: Event) => {
      // let the logo through so it can open the game while in fun mode
      const t = e.target as HTMLElement | null;
      if (t && t.closest?.("[data-logo-toggle]")) return;
      e.preventDefault(); e.stopPropagation();
    };
    // capture phase so it fires before any React/anchor handler
    document.addEventListener("click", block, true);
    document.addEventListener("auxclick", block, true);
    document.addEventListener("submit", block, true);
    // block Enter/Space activating focused links/buttons
    const keyBlock = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("keydown", keyBlock, true);
    return () => {
      document.removeEventListener("click", block, true);
      document.removeEventListener("auxclick", block, true);
      document.removeEventListener("submit", block, true);
      document.removeEventListener("keydown", keyBlock, true);
    };
  }, [gravityOn, gameOpen]);

  // ── Auto-refresh DISABLED ──
  // Data is only fetched from the DB on initial load, a manual page refresh, or by
  // clicking the Refresh button. No per-minute polling and no fetch-on-tab-focus, so
  // we never pull new DB data in the background (keeps Firebase reads down).

  // ── Live tick: recalc hours every 60s for open sessions ── (paused during the game)
  useEffect(() => {
    if (gameOpen) return;
    const id = setInterval(() => {
      setCards(prev => prev.map(card => {
        const todayDay = card.weekDays.find(d => d.date === today);
        if (!todayDay || todayDay.status !== "present") return card;
        const hasOpenSession = todayDay.sessions?.some(s => !s.check_out);
        if (!hasOpenSession) return card;

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
    }, 60_000);
    return () => clearInterval(id);
  }, [today, gameOpen]);

  const filtered = useMemo(() => {
    let base = cards;
    if (activeFilter === "present")  base = base.filter(c => c.todayStatus === "present" || c.todayStatus === "checked-in");
    if (activeFilter === "absent")   base = base.filter(c => c.todayStatus === "absent" || c.todayStatus === "awaiting");
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
    present:  cards.filter(c => c.todayStatus === "present" || c.todayStatus === "checked-in").length,
    absent:   cards.filter(c => c.todayStatus === "absent" || c.todayStatus === "awaiting").length,
    in:       cards.filter(c => c.currentlyIn).length,
    overtime: cards.filter(c => c.overtimeHours > 0).length,
  }), [cards]);

  const wfhPeople = useMemo(
    () => cards
      .filter(c => c.weekDays.find(d => d.date === today)?.wfh)
      .map(c => ({ emp_id: c.emp_id, name: c.name, profile_image: c.profile_image })),
    [cards, today]
  );

  // ── Marquee: HR notices (DB → yellow) + computed last-working-day issue lines (blue) ──
  // kind: "db" = HR notices from DB (yellow) · "auto" = computed system issues (blue)
  const marqueeItems = useMemo(() => {
    const items: { text: string; kind: "db" | "auto" }[] = [];

    // DB notices (only when that toggle is on)
    if (SHOW_MARQUE_FROM_DB) {
      notices.filter(Boolean).forEach(t => items.push({ text: t, kind: "db" }));
    }

    // computed system lines (only when that toggle is on)
    if (SHOW_MARQUE_FROM_COMPUTING) {
      // find the latest present working day < today that the loaded data covers
      const pastDates = Array.from(
        new Set(
          cards.flatMap(c => c.weekDays
            .filter(d => d.date < today && (d.status === "present" || d.status === "leave"))
            .map(d => d.date))
        )
      ).sort();
      const lastWorkingDay = pastDates[pastDates.length - 1];

      if (lastWorkingDay) {
        const noCheckout: string[] = [];
        const under8: string[] = [];
        for (const c of cards) {
          const day = c.weekDays.find(d => d.date === lastWorkingDay);
          if (!day || day.status !== "present") continue;
          const last = day.sessions?.[day.sessions.length - 1];
          if (last && !last.check_out) noCheckout.push(c.name);
          else if ((day.totalHours ?? 0) > 0 && (day.totalHours ?? 0) < 8) under8.push(c.name);
        }
        const dLabel = new Date(lastWorkingDay).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        noCheckout.forEach(n => items.push({ text: `${n}, please remember to check out — no check-out recorded on ${dLabel}.`, kind: "auto" }));
        under8.forEach(n => items.push({ text: `${n}, your hours on ${dLabel} were under 8 — please ensure full hours.`, kind: "auto" }));
      }
    }
    return items.filter(it => it.text);
  }, [notices, cards, today]);

  const outEmployees = useMemo(
    () =>
      cards
        .filter(
          c =>
            !inOffice.some(p => p.emp_id === c.emp_id) &&
            !wfhPeople.some(p => p.emp_id === c.emp_id)
        )
        .map(c => ({
          emp_id: c.emp_id,
          name: c.name,
          profile_image: c.profile_image,
        })),
    [cards, inOffice, wfhPeople]
  );

  // ── Navigation caps ──
  const now = new Date();
  const currentMonday = (() => {
    const d = new Date(now); const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); d.setHours(0, 0, 0, 0); return d;
  })();
  const dec31Monday = (() => {
    const d = new Date(2026, 11, 31); const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); d.setHours(0, 0, 0, 0); return d;
  })();
  const maxWeekOffset  = Math.max(0, Math.round((dec31Monday.getTime() - currentMonday.getTime()) / (7 * 86400000)));
  const maxMonthOffset = (2026 - now.getFullYear()) * 12 + (11 - now.getMonth());

  const canGoNext = viewMode === "week" ? weekOffset < maxWeekOffset : monthOffset < maxMonthOffset;

  function goBack() {
      const nextOffset = viewMode === "week" ? weekOffset - 1 : monthOffset - 1;
      const nextDates  = viewMode === "week" ? getWeekDates(nextOffset) : getMonthDates(nextOffset);
      if (isPeriodBeforeStart(nextDates)) {
        setToast(`Records available from ${new Date(DATA_START).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} only. Previous data requires admin access.`);
      return;
    }
    viewMode === "week" ? setWeekOffset(o => o - 1) : setMonthOffset(o => o - 1);
    }
  function goFwd() {
    if (canGoNext) viewMode === "week" ? setWeekOffset(o => o + 1) : setMonthOffset(o => o + 1);
  }

  const periodLabel = viewMode === "week" ? weekLabel(weekOffset, displayDates) : monthLabel(monthOffset);
  const timeStr = clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const dateStr = clock.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const dismissToast = useCallback(() => setToast(null), []);

  // ── center the stored "me" card once the grid is ready (web + phone) ──
  useEffect(() => {
    if (didAutoScroll.current || loading) return;
    const myId = localStorage.getItem("cf_my_emp_id");
    if (!myId || !filtered.some(c => c.emp_id === myId)) return;

    const t = setTimeout(() => {
      const el = document.getElementById(`empcard-${myId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      didAutoScroll.current = true;
    }, 350); // small delay so the cards have painted
    return () => clearTimeout(t);
  }, [loading, filtered]);

  // ── marquee animation: scroll left at MARQUEE_SPEED px/frame, seamless loop ──
  useEffect(() => {
    if (isPhone || marqueeItems.length === 0) return;
    const track = marqueeTrackRef.current;
    const box   = marqueeBoxRef.current;
    if (!track || !box) return;

    let offset = 0;
    let raf = 0;
    let paused = false;
    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };
    box.addEventListener("mouseenter", onEnter);
    box.addEventListener("mouseleave", onLeave);

    const step = () => {
      const half = track.scrollWidth / 2; // track holds two identical copies
      if (!paused && half > 0) {
        offset += MARQUEE_SPEED;
        if (offset >= half) offset -= half; // wrap seamlessly
        track.style.transform = `translateX(${-offset}px)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener("mouseenter", onEnter);
      box.removeEventListener("mouseleave", onLeave);
    };
  }, [isPhone, marqueeItems]);

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Sora', sans-serif", color: TEXT }}>
      <style>{`
        @keyframes livePulse {
          0%   { box-shadow: 0 0 0px #4ADE80; opacity: 0.7; transform: scale(1); }
          50%  { box-shadow: 0 0 10px #4ADE80, 0 0 18px #4ADE80; opacity: 1; transform: scale(1.15); }
          100% { box-shadow: 0 0 0px #4ADE80; opacity: 0.7; transform: scale(1); }
        }
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
        /* Card grid: AT MOST 4 per row. Each card has a min width (~285px) and the
           columns share the row equally (1fr), so on wider screens all cards grow
           UNIFORMLY (no phantom empty tracks, no half-empty rows). The column count
           steps 4 → 3 → 2 → 1 only when the min width can no longer fit. */
        .att-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; align-items: stretch; }
        /* make every card fill its grid cell so all cards in a row are the same height */
        .att-grid > div { display: flex; height: 100%; }
        .att-grid > div > .border-glow-card { width: 100%; height: 100%; }
        .att-grid > div > .border-glow-card > .border-glow-inner { height: 100%; }
        .att-grid > div > .border-glow-card > .border-glow-inner > * { height: 100%; }

        /* "YOU" card — same outer size as every other card; the gold border + glow
           are overlay elements rendered AFTER the card so they sit on top on all 4 sides. */
        /* YOU card content sits 1px inset (via padding) so the gold border shows fully inside the cell,
           while the wrapper keeps the exact same outer size as every other card */
        .empcard-mine { position: relative; border-radius: 14px; padding: 1px; box-sizing: border-box; }
        /* rotating gold border ring — overlay above the card, drawn inward (no extra size) */
        .empcard-mine-ring {
          content: "";
          position: absolute; inset: 1px;     /* matches the 1px card margin */
          border-radius: 14px;
          padding: 3px;                       /* ring thickness, drawn inward */
          background:
            conic-gradient(from var(--mine-a, 0deg),
              #7a5c00 0deg, #FFD700 50deg, #FFFDE7 90deg, #FFD700 130deg,
              #9c7400 200deg, #FFD700 250deg, #FFF3B0 290deg, #FFD700 320deg, #7a5c00 360deg);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                  mask-composite: exclude;
          animation: empcard-mine-spin 3.4s linear infinite;
          pointer-events: none;
          z-index: 30;
        }
        /* inner gold edge + soft drifting "smoke" glow — overlay just inside the ring */
        .empcard-mine-glow {
          position: absolute; inset: 4px;     /* 1px margin + 3px ring */
          border-radius: 12px;
          pointer-events: none;
          z-index: 29;
          background:
            radial-gradient(120% 55% at 50% 0%,   rgba(255,215,0,0.20), transparent 60%),
            radial-gradient(120% 55% at 50% 100%, rgba(255,200,0,0.16), transparent 60%);
          box-shadow:
            inset 0 0 0 1px rgba(255,215,0,0.45),
            inset 0 0 16px rgba(255,215,0,0.28),
            inset 0 1px 0 rgba(255,247,200,0.30);
          animation: empcard-mine-smoke 4.5s ease-in-out infinite;
        }
        @property --mine-a { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
        @keyframes empcard-mine-spin  { to { --mine-a: 360deg; } }
        @keyframes empcard-mine-smoke {
          0%,100% { opacity: 0.75; }
          50%     { opacity: 1; }
        }
        .empcard-you {
          position: absolute; top: -9px; left: 12px; z-index: 40;
          background: linear-gradient(135deg, #FFE970, #FFD700 55%, #F0B400);
          color: ${BG};
          font-size: 9px; font-weight: 900; letter-spacing: 0.8px;
          padding: 2px 10px; border-radius: 20px;
          box-shadow: 0 3px 12px rgba(255,215,0,0.55), inset 0 1px 0 rgba(255,255,255,0.5);
          font-family: 'Sora', sans-serif;
        }

        @media (max-width: 760px) {
                  .att-headrow    { flex-wrap: wrap !important; gap: 6px !important; padding: 6px 10px !important; }
                  .att-rightgroup { width: 100% !important; flex-wrap: wrap !important; justify-content: flex-start !important; gap: 6px !important; }
                  .att-stats      { flex-wrap: wrap !important; row-gap: 4px !important; }
                  .att-clock      { margin-left: auto !important; }
                  /* tighten the toolbar + legend so the cards start higher (less dead space up top) */
                  .att-toolbar    { padding: 8px 10px !important; gap: 8px !important; }
                  .att-legend     { padding: 0 10px 8px !important; padding-left: 10px !important; row-gap: 6px !important; }
                }
                @media (max-width: 480px) {
                  .att-clock { display: none !important; }
                  .att-headrow { padding: 5px 8px !important; }
                  .att-toolbar { padding: 6px 8px !important; }
                  .att-legend  { padding: 0 8px 6px !important; }
                }


        /* step down the column count only when ~285px min no longer fits a row */
        @media (max-width: 1190px) { .att-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 900px)  { .att-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 600px)  { .att-grid { grid-template-columns: 1fr; } }
        @keyframes spin-tail { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        .spin {
          width:16px; height:16px; border-radius:50%; border:2.5px solid transparent;
          border-top-color:${GREEN}; border-right-color:rgba(74,222,128,0.4);
          border-bottom-color:rgba(74,222,128,0.1); animation:spin-tail 0.65s linear infinite;
        }
        .ri { transition:transform 0.35s ease; }
        .rbtn:hover .ri { transform:rotate(180deg); }
        /* periodic ~10s glow/border highlight pulse on the refresh button */
        @keyframes rbtn-pulse {
          0%, 86%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); border-color:${GREEN}44; }
          90%  { box-shadow: 0 0 0 3px rgba(74,222,128,0.25), 0 0 14px rgba(74,222,128,0.5); border-color:${GREEN}; }
          96%  { box-shadow: 0 0 0 2px rgba(74,222,128,0.12), 0 0 8px rgba(74,222,128,0.25); border-color:${GREEN}AA; }
        }
        .rbtn-glow { animation: rbtn-pulse 2s ease-in-out infinite; }
        .rbtn-glow:hover { animation: none; }
        .nbtn { transition:background 0.15s,color 0.15s; }
        .nbtn:hover:not(:disabled) { background:${YELLOW} !important; color:${BG} !important; }
        .mbtn { transition:all 0.15s; }
        .adm-wrap { position:relative; }
        .adm-tip {
          display:none; position:absolute; top:calc(100% + 8px); right:0;
          background:#111C4A; border:1px solid rgba(99,102,241,0.35);
          border-radius:10px; padding:9px 13px; width:240px;
          font-size:11px; line-height:1.55; color:#B0C0E0; z-index:400;
          box-shadow:0 8px 24px rgba(0,0,0,0.5); pointer-events:none; white-space:normal;
        }
        .adm-wrap:hover .adm-tip { display:block; }
        .io-wrap, .wfh-wrap { position: relative; }
        .io-tip {
          display: none; position: absolute; top: calc(100% + 10px); left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(145deg,#0F1848,#080F35);
          border: 1px solid rgba(99,102,241,0.3); border-radius: 12px;
          padding: 10px; min-width: 200px; max-width: 260px;
          max-height: 280px; overflow-y: auto; z-index: 300;
          box-shadow: 0 12px 36px rgba(0,0,0,0.6);
        }
        .io-wrap:hover .io-tip, .wfh-wrap:hover .io-tip { display: block; }
        /* blue-themed scrollbar for the in-office / out / wfh popovers */
        .cf-pop { scrollbar-width: thin; scrollbar-color: rgba(96,165,250,0.55) transparent; }
        .cf-pop::-webkit-scrollbar { width: 6px; }
        .cf-pop::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
        .cf-pop::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #60A5FA, #6366F1);
          border-radius: 6px; border: 1px solid rgba(11,19,64,0.6);
        }
        .cf-pop::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #93C5FD, #818CF8); }
        .meetbtn:hover { background: rgba(79,142,247,0.14) !important; }
        @keyframes toast-bar { from{width:100%} to{width:0%} }
        /* marquee track is driven by JS (MARQUEE_SPEED), pause-on-hover handled in JS */
        @keyframes sk { 0%,100%{opacity:.35} 50%{opacity:.6} }
        /* per-minute logo replace: old falls out, new drops in from top (3s total) */
        @keyframes cf-logo-fall-out {
          0%   { transform: translateY(0);     opacity: 1; }
          40%  { transform: translateY(140%);  opacity: 0; }
          100% { transform: translateY(140%);  opacity: 0; }
        }
        @keyframes cf-logo-drop-in {
          0%   { transform: translateY(-140%);  opacity: 0; }
          40%  { transform: translateY(-140%);  opacity: 0; }
          62%  { transform: translateY(12%);    opacity: 1; }
          78%  { transform: translateY(-6%);    opacity: 1; }
          100% { transform: translateY(0);      opacity: 1; }
        }
        .cf-logo-fall-out { animation: cf-logo-fall-out 3s cubic-bezier(0.5,0,0.75,0) forwards; }
        .cf-logo-drop-in  { animation: cf-logo-drop-in 3s cubic-bezier(0.34,1.4,0.64,1) forwards; }
      `}</style>

      {toast && <Toast message={toast} onDone={dismissToast} />}
{/* 
      {showMaintenance && !gameOpen && (
        <MaintenanceOverlay onPlay={() => { setGameFull(true); setGameOpen(true); }} />
      )} */}

      {gameOpen && (
        <CanaryGame
          fullPage={gameFull}
          players={cards.map(c => ({ name: c.name, emp_id: c.emp_id }))}
          myId={myId}
          onClose={() => { setGameOpen(false); setGameFull(false); }}
        />
      )}

      {/* fun mode hint — everything is locked until the page is refreshed (hidden while the game is open) */}
      {gravityOn && !gameOpen && (
        <div style={{
          position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 99999, display: "flex", alignItems: "center", gap: 9,
          background: "linear-gradient(135deg,#111C4A,#0A1235)",
          border: `1px solid ${YELLOW}66`, borderRadius: 22,
          padding: "8px 16px", boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
          pointerEvents: "none",
        }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span style={{ color: YELLOW, fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
            Refresh the page to return to the dashboard
          </span>
        </div>
      )}

      <AddMeeting
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        onSaved={(msg) => {
          setToast(msg);
          fetchTodayInOffice();
          fetchAll(viewMode === "week" ? getWeekDates(weekOffset) : getMonthDates(monthOffset));
        }}
      />

      <Regularization
        open={regOpen}
        onClose={() => setRegOpen(false)}
        onSaved={(msg) => setToast(msg)}
      />

      <LeaveRequest
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onSaved={(msg) => setToast(msg)}
      />

      <ReportIssue
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onSaved={(msg) => setToast(msg)}
      />

      {/* ══ STICKY TOP BAR (header + toolbar + legend) — only the cards scroll ══ */}
      {/* z-index must stay ABOVE the cards' "YOU" badge (z-index 40) so scrolling
          cards + their badges pass cleanly behind this bar instead of bleeding through. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 60,
        background: BG, paddingTop: "env(safe-area-inset-top)",
      }}>

      {/* ══ HEADER ══ */}
      {/* position+z-index raise the header above the toolbar below it so the hover
          tooltips (.adm-tip) that overflow downward paint ON TOP of the toolbar/search. */}
      <header style={{
        position: "relative", zIndex: 5,
        background: "linear-gradient(180deg,rgba(10,18,64,0.98) 0%,rgba(6,13,46,0.95) 100%)",
        borderBottom: `1px solid ${BORDER}`,
        backdropFilter: "blur(12px)",
      }}>
      <div className="att-headrow" style={{ maxWidth: 1500, margin: "0 auto", padding: "10px max(8px, env(safe-area-inset-right)) 10px max(8px, env(safe-area-inset-left))", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {/* logo image → ENABLE fun gravity (main page only); once in fun mode, click opens the game */}
            <div
              data-logo-toggle
              onClick={onLogoClick}
               style={{ cursor: location.pathname === "/" ? "pointer" : "default", lineHeight: 0 }}
            >
              <AnimatedLogo />
            </div>
            {/* name → link; tagline followed inline by the live "Updated …" stamp */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <a href="https://canarysuite.in/cv" style={{ textDecoration: "none" }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: TEXT, lineHeight: 1, margin: 0 }}>Canary Face</p>
              </a>
              <p style={{ display: "flex", alignItems: "center", fontSize: 10, color: SUB, marginTop: 2, marginBottom: 0, whiteSpace: "nowrap" }}>
                AI-Powered Attendance Platform
                <span style={{ color: DIM, margin: "0 5px" }}>—</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  color: DIM, fontSize: 8.5, fontWeight: 600, letterSpacing: 0.2,
                  fontFamily: "'JetBrains Mono',monospace",
                }}>
                  <span style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: refreshing ? YELLOW : "#4ADE80",
                    boxShadow: `0 0 4px ${refreshing ? YELLOW : "#4ADE80"}`,
                  }} />
                  Updated {updatedLabel}
                </span>
              </p>
            </div>
          </div>

          <div style={{ flex: 1 }} />


          {/* right group */}
          <div className="att-rightgroup" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>

            {/* stats badge with hover tooltips */}
            <div className="att-stats" style={{
              display: "flex", alignItems: "center", gap: 8,
              background: SURF, border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: "5px 13px", fontSize: 12, flexShrink: 0,
            }}>
              <span style={{ color: TEXT, fontWeight: 700 }}>{cards.length}</span>
              <span style={{ color: SUB }}>employees</span>

              <div style={{ width: 1, height: 13, background: "rgba(99,102,241,0.25)" }} />

              {/* in office — hover for names */}
              <HoverPopover
                accent="#4ADE80"
                label="in office"
                count={inOffice.length}
                dot={<div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80", animation: "livePulse 1.4s ease-in-out infinite" }} />}
                title="Currently in office"
                people={inOffice}
                showSince
                empty="No one is in office right now."
              />

              {wfhPeople.length > 0 && (
                <>
                  <div style={{ width: 1, height: 13, background: "rgba(99,102,241,0.25)" }} />
                  <HoverPopover
                    accent="#EC4899"
                    label="wfh"
                    count={wfhPeople.length}
                    dot={<div style={{ width: 6, height: 6, borderRadius: "50%", background: "#EC4899", boxShadow: "0 0 6px #EC4899" }} />}
                    title="Working from home"
                    people={wfhPeople}
                    empty="No one is working from home."
                  />
                </>
              )}

              <div style={{ width: 1, height: 13, background: "rgba(99,102,241,0.25)" }} />

              <HoverPopover
                accent="#EF4444"
                label="out"
                count={outEmployees.length}
                dot={<div style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", boxShadow: "0 0 6px #EF4444" }} />}
                title="Out of Office"
                people={outEmployees}
                empty="Everyone is currently working."
              />
            </div>
 
 
            {/* Regularization — available everywhere (employee self-service) */}
            <div className="adm-wrap" style={{ flexShrink: 0 }}>
              <button
                onClick={() => setRegOpen(true)}
                className="meetbtn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  background: "rgba(255,215,0,0.07)",
                  border: `1px solid ${YELLOW}44`,
                  borderRadius: 10,
                  padding: "6px 12px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M9 11l3 3L22 4" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {!isPhone && (
                  <span style={{ color: YELLOW, fontSize: 11, fontWeight: 600 }}>Regularization</span>
                )}
              </button>
              <div className="adm-tip">Request an attendance correction for a missed scan, remote workday, or system discrepancy.</div>
            </div>

            {/* Request Leave — available everywhere (employee self-service) */}
            <div className="adm-wrap" style={{ flexShrink: 0 }}>
              <button
                onClick={() => setLeaveOpen(true)}
                className="meetbtn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  background: "rgba(255,215,0,0.07)",
                  border: `1px solid ${YELLOW}44`,
                  borderRadius: 10,
                  padding: "6px 12px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3c0 5-4 7-4 11a4 4 0 008 0c0-4-4-6-4-11z" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 21v-7" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                {!isPhone && (
                  <span style={{ color: YELLOW, fontSize: 11, fontWeight: 600 }}>Request Leave</span>
                )}
              </button>
              <div className="adm-tip">Apply for a full, half day leave. HR will review and approve it.</div>
            </div>

            {/* Add meeting — desktop / office device only */}
            {!isPhone && (
              <div className="adm-wrap" style={{ flexShrink: 0 }}>
                <button
                  onClick={() => setMeetingOpen(true)}
                  className="meetbtn"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                    background: "rgba(255,215,0,0.07)",
                    border: `1px solid ${YELLOW}44`,
                    borderRadius: 10,
                    padding: "6px 12px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="16" rx="2" stroke={YELLOW} strokeWidth="1.8" />
                    <path
                      d="M16 3v4M8 3v4M3 10h18M12 13v4M10 15h4"
                      stroke={YELLOW}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  {!isPhone && (
                  <span style={{ color: YELLOW, fontSize: 11, fontWeight: 600 }}>Log Meeting</span>
                )}
                </button>

                <div className="adm-tip">
                  Log a scheduled meeting. Your attendance will remain active for the duration without needing to scan.
                </div>
              </div>
            )}
 
             {/* Report issue — opens the Report Issue modal (Google login required on submit) */}
            <div className="adm-wrap" style={{ flexShrink: 0 }}>
              <button
                onClick={() => setIssueOpen(true)}
                className="meetbtn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  background: "rgba(255,215,0,0.07)",
                  border: `1px solid ${YELLOW}44`,
                  borderRadius: 10,
                  padding: "6px 12px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4m0 4h.01M10.3 3.86l-8.4 14.55A1.5 1.5 0 003.2 21h17.6a1.5 1.5 0 001.3-2.59L13.7 3.86a1.5 1.5 0 00-2.6 0z" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {!isPhone && (
                  <span style={{ color: YELLOW, fontSize: 11, fontWeight: 600 }}>Report Issue</span>
                )}
              </button>
              <div className="adm-tip">Report an issue regarding attendance records, app, web dashboard bugs, workplace facilities, or personnel matters.</div>
            </div>

            {/* guide / help — desktop only */}
            {!isPhone && (
              <div className="adm-wrap" style={{ flexShrink: 0 }}>
                <button
                  onClick={() => navigate(isPhone ? "/phone/guide" : "/guide")}
                  className="meetbtn"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                    background: "rgba(255,215,0,0.07)",
                    border: `1px solid ${YELLOW}44`,
                    borderRadius: 10,
                    padding: "6px 12px",
                    cursor: "pointer",
                    color: YELLOW,
                    fontSize: 11,
                    fontWeight: 600,
                    transition: "all 0.15s",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                    <path
                      d="M12 17v.01M12 14c0-2 2-2 2-4a2 2 0 10-4 0"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span style={{ color: YELLOW, fontSize: 11, fontWeight: 600 }}>Guide</span>
                </button>

                <div className="adm-tip">
                  Read the employee guide to understand attendance rules, break allowances, and how the Canary Face system works.
                </div>
              </div>
            )}

            {/* live clock */}
            {/* live clock — click to open HR */}
            <div className="att-clock" onClick={() => navigate(isPhone ? "/phone/hr" : "/hr")} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, cursor: "default" }}>          
                  <span style={{ color: YELLOW, fontWeight: 700, fontSize: 10, marginTop: 4, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 0.8, lineHeight: 1 }}>
                {timeStr}
              </span>
              <span style={{ color: YELLOW, fontSize: 9, marginTop: 2, whiteSpace: "nowrap" }}>{dateStr}</span>
            </div>

            <div style={{ width: 1, height: 22, background: BORDER, flexShrink: 0 }} />

          </div>
        </div>
      </header>

      {/* ── TOOLBAR ── */}
        <div className="att-toolbar" style={{
        maxWidth: 1500, margin: "0 auto", padding: "12px 8px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
          background: BG,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "min(220px,100%)" }}>
              {/* tiny last-updated stamp, attached just above the search box */}
             
              <div style={{ position: "relative", width: "100%" }}>
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
            </div>
            <FilterDropdown active={activeFilter} setActive={setActiveFilter} counts={filterCounts} />

            {/* refresh — sits right after the filter; green theme + ~10s glow pulse */}
            <button
              onClick={() => {
                const dates = viewMode === "week" ? getWeekDates(weekOffset) : getMonthDates(monthOffset);
                fetchAll(dates, true);   // silent: keep data, show refreshing indicator
                fetchTodayInOffice();
                fetchNotices();
              }}
              disabled={loading || refreshing} title="Refresh" className="rbtn rbtn-glow"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(74,222,128,0.07)",
                border: `1px solid ${GREEN}44`,
                borderRadius: 10, padding: "7px 12px",
                cursor: "pointer", color: GREEN,
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.08)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
              {(loading || refreshing)
                ? <div className="spin" />
                : <svg className="ri" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M4 4v5h.582m0 0a8.001 8.001 0 0115.356 2m.062-7L20 9h-5M20 20v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m-.062 7L4 15h5"
                      stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
              }
              {!isPhone && (
                <span style={{ color: GREEN, fontSize: 11, fontWeight: 600 }}>Refresh</span>
              )}
            </button>
          </div>
        </div>

        {/* ── LEGEND ── */}
        <div className="att-legend" style={{ maxWidth: 1500, margin: "0 auto", padding: "0 10px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", paddingLeft: 20 }}>

          {[
            { c: "#25ba5c",                l: "Present" },
            { c: "rgba(236,72,153,0.45)",  l: "Remote" },
            { c: "rgba(239,68,68,0.5)",    l: "Leave" },
            { c: "rgba(99,102,241,0.16)",  l: "Yet to check in" },
            { c: "rgba(99,102,241,0.13)",  l: "Weekend" },
            { c: "rgba(32, 21, 184, 0.5)", l: "Holiday" },
          ].map(({ c, l }) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 18, height: 7, borderRadius: 2.5, background: c }} />
              <span style={{ color: SUB, fontSize: 10.5 }}>{l}</span>
            </div>
          ))}
          {!isPhone && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 18, height: 7, borderRadius: 2.5, background: "#1e1451", outline: "1px solid #FFD700", outlineOffset: 1 }} />
            <span style={{ color: SUB, fontSize: 10.5 }}>Today</span>
          </div>
          )}

          {/* ── Scrolling notices marquee (center → right) ── */}
          {(SHOW_MARQUE_FROM_DB || SHOW_MARQUE_FROM_COMPUTING) && !isPhone && marqueeItems.length > 0 && (
            <div className="att-marquee" ref={marqueeBoxRef} style={{
              flex: 1, minWidth: 180, marginLeft: "auto", overflow: "hidden",
              position: "relative", height: 18, display: "flex", alignItems: "center",
              maskImage: "linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%)",
            }}>
              <div className="att-marquee-track" ref={marqueeTrackRef} style={{ display: "inline-flex", whiteSpace: "nowrap", willChange: "transform" }}>
                {[0, 1].map(dup => (
                  // trailing gap (paddingRight) on each copy → the last item has
                  // space after it before the loop wraps, so it's never clipped.
                  <span key={dup} style={{ display: "inline-flex", alignItems: "center", paddingRight: MARQUEE_GAP }} aria-hidden={dup === 1}>
                    {marqueeItems.map((it, i) => {
                      const prev = marqueeItems[i - 1];
                      // bigger gap when switching between the DB group and the computed group
                      const groupGap = prev && prev.kind !== it.kind ? 46 : 0;
                      return (
                        <span key={`${dup}-${i}`} style={{ display: "inline-flex", alignItems: "center", paddingLeft: groupGap }}>
                          <span style={{
                            color: it.kind === "db" ? YELLOW : "#60A5FA",
                            fontSize: 11, fontWeight: it.kind === "db" ? 700 : 600,
                          }}>{it.text}</span>
                          <span style={{
                            color: it.kind === "db" ? "rgba(255,215,0,0.55)" : "rgba(96,165,250,0.6)",
                            fontSize: 11, fontWeight: 800, padding: "0 16px",
                          }}>•</span>
                        </span>
                      );
                    })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* ══ END STICKY TOP BAR — content below scrolls ══ */}

      {/* ══ MAIN (scrolls) ══ */}
      <div className="page-bg" style={{ minHeight: "calc(100vh - 57px)" }}>
        {/* ── GRID ── (top padding keeps the cards' "YOU" badge (top:-9px) fully visible
            when a row scrolls up under the sticky bar) */}
                  <main style={{ maxWidth: 1500, margin: "0 auto", padding: "14px 8px 48px" }}>
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
            <div className="att-grid" ref={gridRef}>
              {filtered.map(d => {
                const mine = d.emp_id === myId;
                return (
                  <div
                    key={d.emp_id}
                    id={`empcard-${d.emp_id}`}
                    className={mine ? "empcard-mine" : undefined}
                    style={{ position: "relative" }}
                  >
                    {mine && <span className="empcard-you">YOU</span>}
                    <BorderGlow
                      backgroundColor="transparent"
                      borderRadius={14}
                      glowRadius={18}
                      edgeSensitivity={22}
                      glowColor="224 80 65"
                      colors={["#6366F1", "#60A5FA", "#22D3EE"]}
                      style={{ boxShadow: "none" }}
                    >
                      <EmployeeCard data={d} viewMode={viewMode}
                        onClick={() => navigate(`/${d.emp_id}`)} isLive={isLive} />
                    </BorderGlow>
                    {mine && (
                      <>
                        <span className="empcard-mine-ring" />
                        <span className="empcard-mine-glow" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* fun-only: drop the cards with gravity when the logo is clicked — main page (/) + week view only */}
          <CardGravity active={gravityOn && location.pathname === "/" && viewMode === "week" && !loading && filtered.length > 0} gridRef={gridRef} gravity={1} />
        </main>
      </div>
    </div>
  );
}