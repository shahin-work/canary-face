import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import logo from "../assets/react.png";
import logo2 from "../assets/react1.png";

// ─── storage keys ───────────────────────────────────────────────────────────
const ID_KEY   = "cf_my_emp_id";
const NAME_KEY = "cf_my_emp_name";
const AUTO_KEY = "cf_my_autoshow"; // "0" = don't auto-open summary on load

// ─── colours (matches Canary Face) ─────────────────────────────────────────
const BG     = "#060D2E";
const SURF2  = "#0F1848";
const BORDER = "rgba(99,102,241,0.2)";
const TEXT   = "#EEF0FF";
const SUB    = "#8090C0";
const DIM    = "#4A5A8A";
const YELLOW = "#FFD700";
const GREEN  = "#4ADE80";
const RED    = "#F87171";
const PINK   = "#EC4899";
const BLUE   = "#60A5FA";
const PURPLE = "#C084FC";
const TEAL   = "#84fcfa";
const REG    = "#15803D"; // regularized (HR-marked office) — dark green

const TYPE_COLORS: Record<string, string> = {
  permanent: YELLOW, consultant: BLUE, intern: PURPLE, guest: TEAL,
};

// ─── holidays (2026) ────────────────────────────────────────────────────────
const HOLIDAYS_2026 = new Set([
  "2026-02-15", "2026-03-20", "2026-04-03", "2026-04-05", "2026-04-15",
  "2026-05-01", "2026-05-27", "2026-08-15", "2026-08-25", "2026-08-26",
  "2026-09-21", "2026-10-02", "2026-10-20", "2026-11-08", "2026-12-25",
]);

// ─── helpers ────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isHoliday(dateStr: string) { return HOLIDAYS_2026.has(dateStr); }

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  const dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) return Math.ceil(d.getDate() / 7) % 2 === 0;
  return false;
}

function getWeekDates(): string[] {
  const now    = new Date();
  const dow    = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toDateStr(d);
  });
}
// ─── Flickering logo loader (data fetch) ─────────────────────────────────────
function LogoLoader({ label = "Loading your attendance…" }: { label?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "52px 0" }}>
      <div style={{ position: "relative", width: 54, height: 54 }}>
        <img src={logo} alt="Canary Face" style={{ width: 54, height: 54, borderRadius: 12, objectFit: "contain", position: "absolute", inset: 0 }} />
        <img src={logo2} alt="" className="ma-logo-flicker" style={{ width: 54, height: 54, borderRadius: 12, objectFit: "contain", position: "absolute", inset: 0 }} />
      </div>
      <span style={{ color: SUB, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
    </div>
  );
}
function calcHours(sessions: any[], forDate?: string): number {
  let mins = 0;
  const toMins = (t: string) => {
    const [h, m, s] = t.split(":").map(Number);
    return h * 60 + m + (s || 0) / 60;
  };
  const now = new Date();
  const todayStr = toDateStr(now);
  const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  for (const s of sessions || []) {
    if (!s.check_in) continue;
    const inMins = toMins(s.check_in);
    if (s.check_out) {
      mins += Math.max(0, toMins(s.check_out) - inMins);
    } else if (!forDate || forDate === todayStr) {
      mins += Math.max(0, nowMins - inMins);
    }
  }
  return Math.round((mins / 60) * 100) / 100;
}
// ─── Standalone loader (shown before the modal, during the DB fetch) ─────────
function LoaderOverlay() {
  return (
    <Backdrop>
      <LogoLoader />
    </Backdrop>
  );
}
function fmtHours(h: number): string {
  const totalMins = Math.round(h * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  if (hh === 0 && mm === 0) return "0m";
  if (hh === 0) return `${mm}m`;
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${mm}m`;
}

function fmtHoursShort(h: number): string {
  const totalMins = Math.round(h * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${hh}.${String(mm).padStart(2, "0")}`;
}

function getInitials(name: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function presentColor(h: number): string {
  if (h < 4)  return "#19601D";
  if (h < 6)  return "#228529";
  if (h < 8)  return "#2dac35";
  return "#3ce748";
}

function dayLetter(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
}

function avatarSrc(img?: string) {
  if (!img) return undefined;
  return img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
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

// ─── types ────────────────────────────────────────────────────────────────
interface EmployeeLite {
  emp_id: string; name: string; department: string; type: string; profile_image?: string;
}
interface DayInfo {
  date: string;
  status: "present" | "absent" | "weekend" | "holiday" | "future";
  hours: number;
  sessions?: any[];
  wfh?: boolean;
  reg?: boolean;
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ emp, size = 40 }: { emp: EmployeeLite | null; size?: number }) {
  const color = TYPE_COLORS[emp?.type || ""] || YELLOW;
  const src = avatarSrc(emp?.profile_image);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
      background: "#080F2E", border: `2px solid ${color}55`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 12px ${color}20`,
    }}>
      {src
        ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ color, fontWeight: 700, fontSize: size * 0.34 }}>{getInitials(emp?.name || "")}</span>}
    </div>
  );
}

// ─── Backdrop ────────────────────────────────────────────────────────────────
function Backdrop({ onClose, children, tint }: { onClose?: () => void; children: React.ReactNode; tint?: "in" | "out" | null }) {
  const bg =
    tint === "in"  ? "linear-gradient(160deg, rgba(74,222,128,0.14) 0%, rgba(2,10,8,0.82) 55%)" :
    tint === "out" ? "linear-gradient(160deg, rgba(248,113,113,0.14) 0%, rgba(15,2,2,0.82) 55%)" :
    "rgba(2,6,23,0.72)";
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}
      className="ma-scroll ma-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: bg, backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflowY: "auto", padding: "32px 16px",
        animation: "ma-fade 0.18s ease", transition: "background 0.4s ease",
      }}
    >
      {children}
    </div>
  );
}

// ─── Avatar with rotating ring (live refresh indicator) ──────────────────────
function AvatarRing({ emp, size = 40, color, spinning }: { emp: EmployeeLite | null; size?: number; color: string; spinning: boolean }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: "absolute", inset: -4, borderRadius: "50%",
        border: `2px dashed ${color}`,
        animation: "ma-spin 0.9s linear infinite",
        opacity: spinning ? 0.85 : 0,
        transition: "opacity 0.25s ease",
      }} />
      <Avatar emp={emp} size={size} />
    </div>
  );
}

// ─── Employee Picker Modal ───────────────────────────────────────────────────
function EmployeePicker({
  employees, loading, onSelect, onClose, dismissible,
}: {
  employees: EmployeeLite[];
  loading: boolean;
  onSelect: (e: EmployeeLite) => void;
  onClose: () => void;
  dismissible: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = sortEmployees(employees);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.emp_id.toLowerCase().includes(q) ||
      (e.department || "").toLowerCase().includes(q)
    );
  }, [employees, search]);

  return (
    <Backdrop onClose={dismissible ? onClose : undefined}>
      <div className="ma-card ma-picker-card" style={{ width: "min(560px, 92vw)", maxHeight: "82vh" }}>
        {/* header */}
        <div style={{ padding: "20px 22px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: "rgba(255,215,0,0.08)", border: `1px solid ${YELLOW}33`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}>🔍</div>
                <div style={{ flex: 1 }}>
                <h2 style={{ color: TEXT, fontSize: 15, fontWeight: 800, margin: 0 }}>Find your profile</h2>
                <p style={{ color: SUB, fontSize: 11, margin: "2px 0 0" }}>
                    Select your name to view your attendance summary
                </p>    
            </div>
            {dismissible && (
              <button onClick={onClose} style={{
                background: "none", border: "none", color: DIM, fontSize: 20,
                cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0,
              }}>×</button>
            )}
          </div>

          {/* search */}
          <div style={{ position: "relative", marginTop: 12 }}>
            <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}
              width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke={DIM} strokeWidth="2.2" />
              <path d="M21 21l-4.35-4.35" stroke={DIM} strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search your name, ID, or department..."
              style={{
                width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
                borderRadius: 10, border: `1px solid ${BORDER}`, background: SURF2,
                color: TEXT, fontSize: 12.5, outline: "none", caretColor: YELLOW,
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* list */}
        <div className="ma-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 52, borderRadius: 10, background: SURF2, animation: "ma-sk 1.4s ease-in-out infinite" }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: SUB, fontSize: 12.5 }}>
              No employees match "{search}"
            </div>
          ) : (
            filtered.map(emp => {
              const color = TYPE_COLORS[emp.type] || YELLOW;
              return (
                <button
                  key={emp.emp_id}
                  onClick={() => onSelect(emp)}
                  className="ma-row"
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 11,
                    padding: "9px 10px", borderRadius: 11, border: "1px solid transparent",
                    background: "transparent", cursor: "pointer", textAlign: "left",
                    marginBottom: 2, fontFamily: "inherit",
                  }}
                >
                  <Avatar emp={emp} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: TEXT, fontWeight: 600, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {emp.name}
                    </div>
                    <div style={{ color: DIM, fontSize: 10, fontFamily: "'JetBrains Mono',monospace", marginTop: 1 }}>
                      {emp.emp_id} <span style={{ color: SUB }}>· {emp.department}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color, background: `${color}18`,
                    border: `1px solid ${color}33`, borderRadius: 20, padding: "2px 8px",
                    textTransform: "capitalize", flexShrink: 0,
                  }}>{emp.type || "—"}</span>
                </button>
              );
            })
          )}
        </div>

        <div style={{ padding: "10px 22px 16px", borderTop: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={onClose} style={{
                width: "100%", padding: "9px", borderRadius: 10, border: `1px solid ${BORDER}`,
                background: SURF2, color: TEXT, fontSize: 15, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
            }}>Skip for now</button>
            <p style={{ color: DIM, fontSize: 10, margin: 0, textAlign: "center", lineHeight: 1.5 }}>
                Your choice is saved on this device only.
            </p>
        </div>
      </div>
    </Backdrop>
  );
}

// ─── Week tile (mirrors EmployeeCard's WeekBar) ──────────────────────────────
function WeekTile({ day, today, selected, onClick }: { day: DayInfo; today: string; selected: boolean; onClick: () => void }) {
  const isToday = day.date === today;
  const isClickable = day.status !== "future";
  const h = day.hours;

  let bg = "rgba(120,140,200,0.08)";
  let label: React.ReactNode = null;
  let textColor = "#001a00";

  if (day.status === "present") {
    bg = day.reg ? "rgba(21,128,61,0.92)" : day.wfh ? "rgba(166,38,128,0.74)" : presentColor(h);
    textColor = day.reg ? "#eafff0" : day.wfh ? "#fff" : (h < 5 ? "rgba(150,255,150,0.85)" : "#001a00");
    label = h > 0 ? fmtHoursShort(h) : <span style={{ fontSize: 8, fontWeight: 800 }}>IN</span>;
  } else if (day.status === "absent") {
    bg = "rgba(239,68,68,0.5)";
  } else if (day.status === "holiday") {
    bg = "rgba(32,21,184,0.5)";
    label = <span style={{ color: "rgba(251,191,36,0.7)", fontSize: 9 }}>★</span>;
  } else if (day.status === "weekend") {
    bg = "rgba(65,66,134,0.18)";
  } else if (day.status === "future") {
    bg = "rgba(120,140,200,0.06)";
  }

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        opacity: day.status === "future" ? 0.35 : 1,
        cursor: isClickable ? "pointer" : "default",
      }}
    >
      <span style={{ color: isToday ? YELLOW : selected ? "#A5B4FC" : "#7080B8", fontSize: 8.5, fontWeight: 700, letterSpacing: 0.3 }}>
        {dayLetter(day.date)}
      </span>
      <div style={{
        width: "100%", height: 38, borderRadius: 6, background: bg,
        outline: isToday ? `1.9px solid ${YELLOW}` : selected ? `1.9px solid #818CF8` : "none",
        outlineOffset: isToday || selected ? 1 : 0,
        boxShadow: selected && !isToday ? "0 0 10px rgba(99,102,241,0.45)" : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "outline 0.12s, box-shadow 0.12s",
      }}>
        {label && (
          <span style={{ color: textColor, fontSize: 12, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", letterSpacing: -0.3 }}>
            {label}
          </span>
        )}
      </div>
      <span style={{ color: selected ? "#A5B4FC" : DIM, fontSize: 8.5, fontFamily: "'JetBrains Mono',monospace", fontWeight: selected ? 700 : 400 }}>
        {new Date(day.date).getDate()}
      </span>
    </div>
  );
}

// ─── Today session timeline (mirrors EmployeeDetails timeline) ──────────────
const T_START = 540;  // 09:00
const T_END   = 1260; // 21:00
const T_SPAN  = T_END - T_START;

function fmtTimeShort(t?: string) {
  return t ? t.slice(0, 5) : "";
}

function timeToPct(t: string) {
  const [h, m] = t.split(":").map(Number);
  const mins = h * 60 + m;
  return Math.max(0, Math.min(100, ((mins - T_START) / T_SPAN) * 100));
}

function TodaySessionTimeline({ sessions }: { sessions: any[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nowPct = timeToPct(nowStr);

  return (
    <div>
      {/* timeline track */}
      <div style={{ position: "relative", height: 44, marginTop: 2 }}>
        {/* base line */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)",
          height: 3, borderRadius: 2, background: "rgba(99,102,241,0.10)",
        }} />

        {/* hour ticks */}
        {[9, 12, 15, 18, 21].map(h => {
          const pct = ((h * 60 - T_START) / T_SPAN) * 100;
          return (
            <div key={h} style={{ position: "absolute", left: `${pct}%`, top: "50%", transform: "translate(-50%,-50%)" }}>
              <div style={{ width: 1, height: 12, background: "rgba(99,102,241,0.14)" }} />
              <span style={{
                position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
                fontSize: 8, color: DIM, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap",
              }}>{h}:00</span>
            </div>
          );
        })}

        {/* gap bars between sessions */}
        {sessions.map((s, i) => {
          const next = sessions[i + 1];
          if (!s.check_out || !next?.check_in) return null;
          const gapStart = timeToPct(s.check_out);
          const gapEnd   = timeToPct(next.check_in);
          const gapW = Math.max(gapEnd - gapStart, 0);
          if (gapW <= 0) return null;
          return (
            <div key={`gap-${i}`} style={{
              position: "absolute", left: `${gapStart}%`, width: `${gapW}%`,
              top: "50%", transform: "translateY(-50%)",
              height: 3, borderRadius: 2, background: RED,
            }} />
          );
        })}

        {/* sessions */}
        {sessions.map((s, i) => {
          const inPct  = timeToPct(s.check_in);
          const outPct = s.check_out ? timeToPct(s.check_out) : nowPct;
          const width  = Math.max(outPct - inPct, 0.8);
          const active = !s.check_out;
          const isHovered = hovered === i;
          const color = s.meeting ? "#22D3EE" : s.regularized ? REG : s.wfh ? PINK : GREEN;

          return (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ position: "absolute", inset: 0, cursor: "pointer" }}
            >
              {/* session bar */}
              <div style={{
                position: "absolute", left: `${inPct}%`, width: `${width}%`,
                top: "50%", transform: "translateY(-50%)",
                height: isHovered ? 6 : 4, borderRadius: 4,
                background: active
                  ? `linear-gradient(90deg,${color}AA,${color},${color}EE)`
                  : `linear-gradient(90deg,${color}AA,${color})`,
                boxShadow: isHovered ? `0 0 10px ${color}77` : `0 0 4px ${color}44`,
                transition: "height 0.12s, box-shadow 0.12s",
              }} />

              {/* check-in dot */}
              <div style={{
                position: "absolute", left: `calc(${inPct}% - 5px)`, top: "50%", transform: "translateY(-50%)",
                width: 10, height: 10, borderRadius: "50%",
                background: color, border: `2px solid ${BG}`,
                boxShadow: isHovered ? `0 0 10px ${color}AA` : `0 0 6px ${color}88`,
                transition: "box-shadow 0.12s",
              }} />

              {/* check-in label on hover */}
              {isHovered && (
                <span style={{
                  position: "absolute", left: `${inPct}%`, top: "calc(50% - 19px)", transform: "translateX(-50%)",
                  fontSize: 10, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace",
                  whiteSpace: "nowrap", textShadow: `0 0 8px ${color}88`, zIndex: 5,
                }}>{fmtTimeShort(s.check_in)}</span>
              )}

              {/* check-out dot + label, or live pulse */}
              {s.check_out ? (
                <>
                  <div style={{
                    position: "absolute", left: `calc(${outPct}% - 5px)`, top: "50%", transform: "translateY(-50%)",
                    width: 10, height: 10, borderRadius: "50%",
                    background: RED, border: `2px solid ${BG}`,
                    boxShadow: isHovered ? `0 0 10px ${RED}AA` : `0 0 6px ${RED}88`,
                    transition: "box-shadow 0.12s",
                  }} />
                  {isHovered && (
                    <span style={{
                      position: "absolute", left: `${outPct}%`, top: "calc(50% + 11px)", transform: "translateX(-50%)",
                      fontSize: 10, fontWeight: 800, color: RED, fontFamily: "'JetBrains Mono',monospace",
                      whiteSpace: "nowrap", textShadow: `0 0 8px ${RED}88`, zIndex: 5,
                    }}>{fmtTimeShort(s.check_out)}</span>
                  )}
                </>
              ) : (
                <>
                  <div style={{
                    position: "absolute", left: `calc(${nowPct}% - 7px)`, top: "50%", transform: "translateY(-50%)",
                    width: 14, height: 14, borderRadius: "50%",
                    background: YELLOW, boxShadow: `0 0 12px ${YELLOW}`,
                    animation: "ma-pulse 1.2s ease-in-out infinite", zIndex: 4,
                  }} />
                  {isHovered && (
                    <span style={{
                      position: "absolute", left: `${nowPct}%`, top: "calc(50% + 11px)", transform: "translateX(-50%)",
                      fontSize: 10, fontWeight: 800, color: YELLOW, fontFamily: "'JetBrains Mono',monospace",
                      whiteSpace: "nowrap", zIndex: 5,
                    }}>ongoing</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* session chips — hover syncs with the timeline above */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))", gap: 6, marginTop: 10 }}>
        {sessions.map((s, i) => {
          const isHovered = hovered === i;
          const color = s.meeting ? "#22D3EE" : s.regularized ? REG : s.wfh ? PINK : GREEN;
          return (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: isHovered ? `${color}14` : "rgba(99,102,241,0.05)",
                border: `1px solid ${isHovered ? color + "44" : BORDER}`,
                borderRadius: 8, padding: "4px 8px", fontSize: 10,
                cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap",
              }}
            >
              <span style={{ color: DIM, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5 }}>#{i + 1}</span>
              <span style={{ color: GREEN, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{fmtTimeShort(s.check_in)}</span>
              <span style={{ color: DIM }}>→</span>
              {s.check_out
                ? <span style={{ color: RED, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{fmtTimeShort(s.check_out)}</span>
                : <span style={{ color: YELLOW, fontWeight: 700 }}>now</span>}
              {s.regularized && <span style={{ color: REG, fontSize: 8.5, fontWeight: 700 }}>REG</span>}
              {s.wfh && <span style={{ color: PINK, fontSize: 8.5, fontWeight: 700 }}>WFH</span>}
              {s.meeting && <span style={{ color: "#22D3EE", fontSize: 8.5, fontWeight: 700 }}>MTG</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Summary Modal ────────────────────────────────────────────────────────────
function SummaryModal({
  me, today, week, loading, refreshing, onClose, onSwitch,
}: {
  me: EmployeeLite | null;
  today: DayInfo | null;
  week: DayInfo[];
  loading: boolean;
  refreshing: boolean;
  onClose: () => void;
  onSwitch: () => void;
  navigate: (path: string) => void;
}) {
  const todayStr = toDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isToday = selectedDate === todayStr;
  const selectedDay = week.find(d => d.date === selectedDate) || (isToday ? today : null);

  const isCurrentlyIn = isToday && !!(selectedDay?.sessions?.length && !selectedDay.sessions[selectedDay.sessions.length - 1]?.check_out);
  const hours = selectedDay?.hours ?? 0;
  const target = 8;
  const dayColor =
    selectedDay?.status === "weekend" || selectedDay?.status === "holiday" ? DIM :
    isCurrentlyIn ? GREEN :
    hours >= target ? GREEN :
    hours > 0 ? YELLOW : (selectedDay?.status === "absent" ? RED : DIM);

  // live check-in/out accent — only meaningful for today's "present" status
  const liveAccent = isToday && selectedDay?.status === "present" ? (isCurrentlyIn ? GREEN : RED) : null;

  const weekTotal = week.reduce((s, d) => s + (d.hours || 0), 0);
  const workingDaysSoFar = week.filter(d =>
    d.date <= todayStr && d.status !== "weekend" && d.status !== "holiday"
  ).length;
  const weekTarget = workingDaysSoFar * target;
  const weekColor = weekTotal >= weekTarget && weekTarget > 0 ? GREEN : weekTotal > 0 ? YELLOW : DIM;

  const fmtRange = () => {
    const f = new Date(week[0]?.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const t = new Date(week[6]?.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return `${f} – ${t}`;
  };

  const dayLabel = isToday
    ? `Today · ${new Date(selectedDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`
    : new Date(selectedDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

  return (
    <Backdrop onClose={onClose} tint={liveAccent === GREEN ? "in" : liveAccent === RED ? "out" : null}>
<div className="ma-card ma-card-summary" style={{ width: "min(880px, 95vw)" }}>        {/* header */}
        <div style={{ padding: "14px 22px 12px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 12 }}>
          <AvatarRing emp={me} size={40} color={liveAccent || "rgba(99,102,241,0.4)"} spinning={refreshing} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ color: TEXT, fontSize: 17, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Hey, {me?.name || "there"}
            </h2>
            <p style={{ color: SUB, fontSize: 10.5, margin: "2px 0 0", fontFamily: "'JetBrains Mono',monospace" }}>
              {me?.emp_id} · {me?.department}
            </p>
          </div>
          <button
  onClick={onClose}
  style={{
    width: 42,
    height: 42,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(10,10,10,0.55)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "50%",
    color: "#ff4d4f",
    fontSize: 32,
    cursor: "pointer",
    lineHeight: 1,
    flexShrink: 0,
    padding: 0,
  }}
>
  ×
</button>
        </div>

        <div style={{ padding: "12px 22px 14px" }}>
          {loading ? (
            <LogoLoader />
          ) : (
            <div className="ma-grid">
              {/* TODAY */}
              <div style={{
                background: liveAccent
                  ? `linear-gradient(155deg, ${liveAccent}22 0%, #0D1545 45%, #070F30 100%)`
                  : "linear-gradient(155deg,#0D1545 0%,#070F30 100%)",
                border: `1px solid ${liveAccent ? liveAccent + "40" : BORDER}`,
                borderRadius: 14, padding: "12px 14px",
                boxShadow: liveAccent
                  ? `0 10px 32px ${liveAccent}26, inset 0 1px 0 rgba(255,255,255,0.05)`
                  : "inset 0 1px 0 rgba(255,255,255,0.02)",
                display: "flex", flexDirection: "column",
                transition: "background 0.3s, border-color 0.3s, box-shadow 0.3s",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2, gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: SUB, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                    {dayLabel}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}> 
                    {selectedDay?.status === "absent" && (
                      <span style={{ color: RED, fontSize: 9.5, fontWeight: 700, background: "rgba(248,113,113,0.08)", border: `1px solid ${RED}33`, borderRadius: 20, padding: "3px 9px" }}>
                        {isToday ? "Not Checked In" : "Absent"}
                      </span>
                    )}
                    {(selectedDay?.status === "weekend" || selectedDay?.status === "holiday") && (
                      <span style={{ color: PURPLE, fontSize: 9.5, fontWeight: 700, background: "rgba(192,132,252,0.08)", border: `1px solid ${PURPLE}33`, borderRadius: 20, padding: "3px 9px", textTransform: "capitalize" }}>
                        {selectedDay.status}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span className="ma-today-hours" style={{ color: dayColor, fontSize: 28, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1, textShadow: hours > 0 ? `0 0 18px ${dayColor}33` : "none" }}>
                      {fmtHours(hours)}
                    </span>
                    <span style={{ color: SUB, fontSize: 11.5 }}>{isToday ? "worked today" : "hours worked"}</span>
                  </div>

                  {/* 3D / neumorphic live status chip */}
                  {selectedDay?.status === "present" && (() => {
                    const accent = isCurrentlyIn ? GREEN : RED;
                    return (
                      <div className="ma-status-chip" style={{
                        display: "flex", alignItems: "center", gap: 11, flexShrink: 0,
                        marginTop: -8,
                        background: accent,
                        border: `1px solid ${accent}`,
                        borderRadius: 44, padding: "18px 39px 18px 18px",
                        boxShadow: `0 6px 16px ${accent}40, inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -3px 6px rgba(0,0,0,0.18)`,
                      }}>
                        <div className="ma-status-dot" style={{
                          width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                          background: `radial-gradient(circle at 32% 28%, #ffffff 0%, #ffffff 55%, ${accent}33 100%)`,
                          boxShadow: `inset 0 -2px 4px rgba(0,0,0,0.18), inset 0 1.5px 3px rgba(255,255,255,0.6)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                            {isCurrentlyIn
                              ? <path d="M5 12h12M13 7l5 5-5 5" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                              : <path d="M20 6L9 17l-5-5" stroke={RED} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />}
                          </svg>
                        </div>
                        <span className="ma-status-text" style={{ color: "#0B1020", fontWeight: 800, fontSize: 15, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                          {isCurrentlyIn ? "IN OFFICE" : "OUT OF OFFICE"}
                        </span>
                      </div>
                    );
                  })()}
                </div> 

                {/* sessions timeline */}
                {selectedDay?.sessions && selectedDay.sessions.length > 0 && (
                  <TodaySessionTimeline sessions={selectedDay.sessions} />
                )}
              </div>

              {/* THIS WEEK */}
              <div style={{
                background: "linear-gradient(155deg,#0D1545 0%,#070F30 100%)",
                border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 14px",
                display: "flex", flexDirection: "column",
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                  <span style={{ color: SUB, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                    This Week · {fmtRange()}
                  </span>
                  <span style={{ color: weekColor, fontSize: 22, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1, textShadow: weekTotal > 0 ? `0 0 18px ${weekColor}33` : "none" }}>
                    {fmtHours(weekTotal)}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  {week.map(d => (
                    <WeekTile
                      key={d.date}
                      day={d}
                      today={todayStr}
                      selected={d.date === selectedDate}
                      onClick={() => setSelectedDate(d.date)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: "10px 22px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 8 }}>
          
          <button onClick={onSwitch} style={{
            background: "none", border: "none", color: TEXT, fontSize: 12,
            cursor: "pointer", fontFamily: "inherit", padding: 0,
            textDecoration: "underline", textAlign: "center", width: "100%",
          }}>Not you? Switch profile</button>
        </div>
      </div>
    </Backdrop>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function MyAttendance() {
  const navigate = useNavigate();

  const [empId, setEmpId] = useState<string | null>(() => localStorage.getItem(ID_KEY));
  const [me, setMe]       = useState<EmployeeLite | null>(null);

  const [pickerOpen, setPickerOpen]   = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [employees, setEmployees]     = useState<EmployeeLite[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [today, setToday] = useState<DayInfo | null>(null);
  const [week, setWeek]   = useState<DayInfo[]>([]);
  const [, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryReady, setSummaryReady] = useState(false);

  // decide what to show on first mount
  useEffect(() => {
    if (!empId) {
      setPickerOpen(true);
    } else {
      const auto = localStorage.getItem(AUTO_KEY);
      if (auto !== "0") openSummary();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // load employee list when picker is needed
  const loadEmployees = useCallback(async () => {
    setLoadingEmps(true);
    try {
      const snap = await getDocs(collection(db, "employees"));
      setEmployees(snap.docs.map(d => d.data() as EmployeeLite));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEmps(false);
    }
  }, []);

  useEffect(() => {
    if (pickerOpen && employees.length === 0 && !loadingEmps) loadEmployees();
  }, [pickerOpen, employees.length, loadingEmps, loadEmployees]);

  // load this user's today + week data
  const loadMyData = useCallback(async (id: string, knownEmp?: EmployeeLite | null, silent = false) => {
    if (!silent) { setLoadingData(true); setSummaryReady(false); }
    try {
      let empInfo = knownEmp || null;
      if (!empInfo) {
        const empSnap = await getDoc(doc(db, "employees", id));
        if (empSnap.exists()) empInfo = empSnap.data() as EmployeeLite;
        else empInfo = { emp_id: id, name: localStorage.getItem(NAME_KEY) || id, department: "", type: "" };
      }
      setMe(empInfo);

      const dates = getWeekDates();
      const todayStr = toDateStr(new Date());

      const weekData: DayInfo[] = await Promise.all(
        dates.map(async (date) => {
          if (isHoliday(date)) return { date, status: "holiday", hours: 0 };
          if (isWeekend(date)) return { date, status: "weekend", hours: 0 };
          if (date > todayStr)  return { date, status: "future", hours: 0 };

          try {
            const snap = await getDoc(doc(db, id, date));
            if (snap.exists()) {
              const d = snap.data() as { sessions?: any[] };
              if (d.sessions?.length) {
                const isWfh = d.sessions.every((s: any) => s.wfh === true);
                const isReg = d.sessions.every((s: any) => s.regularized === true);
                return { date, status: "present", hours: calcHours(d.sessions, date), sessions: d.sessions, wfh: isWfh, reg: isReg };
              }
            }
          } catch (_) {}
          return { date, status: "absent", hours: 0 };
        })
      );

      setWeek(weekData);
      setToday(weekData.find(d => d.date === todayStr) || null);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) { setLoadingData(false); setSummaryReady(true); }
    }
  }, []);

  // keep a ref to 'me' so the refresh interval doesn't refetch the employee doc every time
  const meRef = useRef<EmployeeLite | null>(null);
  useEffect(() => { meRef.current = me; }, [me]);

  useEffect(() => {
    if (empId && summaryOpen) loadMyData(empId, me);
  }, [empId, summaryOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── live refresh: re-pull from Firestore every 5s while the modal is open ──
  useEffect(() => {
    if (!empId || !summaryOpen) return;
    const id = setInterval(() => {
      setRefreshing(true);
      loadMyData(empId, meRef.current, true).finally(() => {
        setTimeout(() => setRefreshing(false), 1000);
      });
    }, 4000);
    return () => clearInterval(id);
  }, [empId, summaryOpen, loadMyData]);

  function openSummary() {
    setSummaryReady(false);   // show the flicker loader first
    setSummaryOpen(true);
  }

  function selectEmployee(emp: EmployeeLite) {
    localStorage.setItem(ID_KEY, emp.emp_id);
    localStorage.setItem(NAME_KEY, emp.name);
    setEmpId(emp.emp_id);
    setMe(emp);
    setPickerOpen(false);
    openSummary();
  }

  function switchProfile() {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
    setEmpId(null);
    setMe(null);
    setToday(null);
    setWeek([]);
    setSummaryOpen(false);
    setSummaryReady(false);
    setPickerOpen(true);
  }

  const storedName = me?.name || localStorage.getItem(NAME_KEY) || "";

  return (
    <>
      <style>{`
        @keyframes ma-fade { from{opacity:0} to{opacity:1} }
        @keyframes ma-scale { from{opacity:0;transform:translateY(8px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes ma-sk { 0%,100%{opacity:.35} 50%{opacity:.6} }
        @keyframes ma-pulse { 0%,100%{opacity:0.7;transform:translateY(-50%) scale(1)} 50%{opacity:1;transform:translateY(-50%) scale(1.3)} }
        @keyframes ma-spin { to { transform: rotate(360deg); } }
        @keyframes ma-flicker {
          0%, 28%, 52%, 100% { opacity: 0; }
          10%, 40% { opacity: 1; }
          18% { opacity: 0; }
          46% { opacity: 0.85; }
        }
        .ma-logo-flicker { animation: ma-flicker 1.4s ease-in-out infinite; }
        .ma-card {
          background: linear-gradient(160deg,${SURF2},${BG});
          border: 1px solid ${BORDER}; border-radius: 18px;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 28px 80px rgba(0,0,0,0.7);
          font-family: 'Sora', sans-serif; color: ${TEXT};
          animation: ma-scale 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }

        @media (max-width: 600px) {
          .ma-backdrop   { padding: 14px 6px !important; }
          .ma-card-summary { width: 96vw !important; }
          .ma-picker-card  { width: 95vw !important; max-height: 90vh !important; }
          .ma-status-chip {
            padding: 11px 16px 11px 11px !important;
            border-radius: 34px !important; gap: 8px !important; margin-top: 0 !important;
          }
          .ma-status-dot  { width: 30px !important; height: 30px !important; }
          .ma-status-text { font-size: 12px !important; }
          .ma-today-hours { font-size: 23px !important; }
        }


        .ma-row:hover { background: rgba(99,102,241,0.08) !important; border-color: ${BORDER} !important; }
        .ma-fab:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(0,0,0,0.5); }
        .ma-scroll { scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.35) transparent; }
        .ma-scroll::-webkit-scrollbar { width: 5px; }
        .ma-scroll::-webkit-scrollbar-track { background: transparent; }
        .ma-scroll::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 4px; }
        .ma-scroll::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.55); }
        .ma-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
      `}</style>

      {pickerOpen && (
        <EmployeePicker
          employees={employees}
          loading={loadingEmps}
          onSelect={selectEmployee}
          onClose={() => setPickerOpen(false)}
          dismissible={!!empId}
        />
      )}

      {summaryOpen && !summaryReady && <LoaderOverlay />}

      {summaryOpen && summaryReady && (
        <SummaryModal
          me={me}
          today={today}
          week={week}
          loading={false}
          refreshing={refreshing}
          onClose={() => setSummaryOpen(false)}
          onSwitch={switchProfile}
          navigate={navigate}
        />
      )}

      {/* floating reopen pill */}
      {empId && !summaryOpen && !pickerOpen && (
        <button
          onClick={openSummary}
          className="ma-fab"
          title="My attendance"
          style={{
            position: "fixed", bottom: 18, right: 18, zIndex: 999,
            display: "flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg,#111C4A,#0A1235)",
            border: `1px solid ${BORDER}`, borderRadius: 50,
            padding: "9px 16px 9px 9px", cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            transition: "transform 0.15s, box-shadow 0.15s",
            fontFamily: "'Sora',sans-serif",
          }}
        >
          <Avatar emp={me} size={26} />
          <span style={{ color: TEXT, fontSize: 11.5, fontWeight: 700 }}>
            {storedName.split(" ")[0] || "Me"}
          </span>
        </button>
      )}
    </>
  );
}