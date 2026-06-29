import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  collection, getDocs, doc, getDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useJITAuth } from "../hooks/useJITAuth";

// ─── theme (matches AddMeeting / MyAttendance) ────────────────────────────────
const BG     = "#060D2E";
const SURF   = "#0B1340";
const SURF2  = "#0F1848";
const BORDER = "rgba(99,102,241,0.2)";
const TEXT   = "#EEF0FF";
const SUB    = "#8090C0";
const DIM    = "#4A5A8A";
const YELLOW = "#FFD700";
const GREEN  = "#4ADE80";
const RED    = "#F87171";
const BLUE   = "#60A5FA";

// ─── range (matches the dashboard) ────────────────────────────────────────────
const RANGE_MIN = "2026-03-02";
const RANGE_MAX = "2026-12-31";

const MAX_ATTACH_BYTES = 3 * 1024 * 1024; // 3 MB

// ─── storage keys (shared with MyAttendance) ──────────────────────────────────
const ID_KEY   = "cf_my_emp_id";
const NAME_KEY = "cf_my_emp_name";

// ─── status model ─────────────────────────────────────────────────────────────
type RegStatus = "pending" | "approved" | "rejected" | "cancelled";
type StatusTab = "all" | RegStatus;

const STATUS_META: Record<RegStatus, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: YELLOW },
  approved:  { label: "Approved",  color: GREEN  },
  rejected:  { label: "Rejected",  color: RED    },
  cancelled: { label: "Cancelled", color: DIM    },
};

// reason dropdown — only these two
const REASONS = [
  { value: "forgot_checkin",  label: "Forgot to check-in"  },
  { value: "forgot_checkout", label: "Forgot to check-out" },
] as const;
type ReasonValue = (typeof REASONS)[number]["value"];

interface RegRequest {
  id: string;
  date: string;
  day: string;
  reason: ReasonValue;
  check_in: string;   // "HH:MM"
  check_out: string;  // "HH:MM"
  description: string;
  attachment?: string | null; // base64 data URL
  status: RegStatus;
  created_at: number;          // epoch ms
  reviewed_by?: string;
  reviewer_note?: string;
  submittedByEmail?: string;   // verified Google email (audit)
  submittedByUid?: string;
}

interface EmployeeLite {
  emp_id: string; name: string; department?: string; type?: string; profile_image?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const clampDate = (d: string) => (d < RANGE_MIN ? RANGE_MIN : d > RANGE_MAX ? RANGE_MAX : d);
const dayName = (dateStr: string) =>
  dateStr ? new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" }) : "";

const toMins = (t: string) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmtDuration = (mins: number) => {
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};
const reasonLabel = (v: string) => REASONS.find(r => r.value === v)?.label ?? v;
const fmtBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const initials = (n: string) => (n || "?").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();
const avatarSrc = (img?: string) => (!img ? undefined : img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`);

function fmtCreated(ms: number): string {
  try {
    if (!ms) return "";
    const d = new Date(ms);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " +
           d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
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

// ─── styles ─────────────────────────────────────────────────────────────────
const fieldStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 10,
  border: `1px solid ${BORDER}`, background: SURF, color: TEXT,
  fontSize: 12.5, outline: "none", fontFamily: "'Sora',sans-serif", caretColor: YELLOW,
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, color: SUB, letterSpacing: 0.6,
  textTransform: "uppercase", display: "block", marginBottom: 6,
};

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: RegStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, color: m.color,
      background: `${m.color}18`, border: `1px solid ${m.color}40`,
      borderRadius: 20, padding: "2px 9px", letterSpacing: 0.3, flexShrink: 0,
      whiteSpace: "nowrap",
    }}>{m.label}</span>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ emp, size = 30 }: { emp: EmployeeLite | null; size?: number }) {
  const src = avatarSrc(emp?.profile_image);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
      background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {src
        ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.34, fontWeight: 700, color: SUB }}>{initials(emp?.name || "")}</span>}
    </div>
  );
}

// ─── Themed time dropdown (click hour + minute) ───────────────────────────────
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function to12h(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

function TimeDropdown({
  value, onChange, accent = YELLOW,
}: {
  value: string;
  onChange: (v: string) => void;
  accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [curH, curM] = value ? value.split(":") : ["", ""];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const pick = (h: string, m: string) => onChange(`${h}:${m}`);

  const colStyle: React.CSSProperties = {
    flex: 1, maxHeight: 168, overflowY: "auto", padding: 4,
  };
  const cellStyle = (on: boolean): React.CSSProperties => ({
    padding: "6px 0", textAlign: "center", borderRadius: 7, cursor: "pointer",
    fontSize: 12.5, fontWeight: on ? 800 : 500, fontFamily: "'JetBrains Mono',monospace",
    color: on ? BG : TEXT, background: on ? accent : "transparent",
    transition: "background 0.1s",
  });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...fieldStyle, cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 8,
          borderColor: open ? accent : (value ? accent + "66" : BORDER),
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="9" stroke={value ? accent : SUB} strokeWidth="1.8" />
          <path d="M12 7v5l3 2" stroke={value ? accent : SUB} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", color: value ? TEXT : SUB }}>
          {value || "--:--"}
        </span>
        {value && <span style={{ fontSize: 10, color: SUB }}>{to12h(value)}</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke={value ? accent : SUB} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 60,
          background: `linear-gradient(145deg,${SURF2},${BG})`, border: `1px solid ${BORDER}`,
          borderRadius: 12, boxShadow: "0 14px 40px rgba(0,0,0,0.6)", overflow: "hidden",
        }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ flex: 1, textAlign: "center", padding: "6px 0", fontSize: 9, fontWeight: 700, color: SUB, letterSpacing: 0.6, textTransform: "uppercase" }}>Hour</span>
            <span style={{ width: 1, background: BORDER }} />
            <span style={{ flex: 1, textAlign: "center", padding: "6px 0", fontSize: 9, fontWeight: 700, color: SUB, letterSpacing: 0.6, textTransform: "uppercase" }}>Minute</span>
          </div>
          <div style={{ display: "flex" }}>
            <div className="reg-scroll" style={colStyle}>
              {HOURS_24.map(h => (
                <div key={h} style={cellStyle(h === curH)}
                  onClick={() => pick(h, curM || "00")}
                  onMouseEnter={e => { if (h !== curH) (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.12)"; }}
                  onMouseLeave={e => { if (h !== curH) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  {h}
                </div>
              ))}
            </div>
            <div style={{ width: 1, background: BORDER }} />
            <div className="reg-scroll" style={colStyle}>
              {MINUTES_60.map(m => (
                <div key={m} style={cellStyle(m === curM)}
                  onClick={() => pick(curH || "00", m)}
                  onMouseEnter={e => { if (m !== curM) (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.12)"; }}
                  onMouseLeave={e => { if (m !== curM) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  {m}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Themed calendar date picker (blue) ───────────────────────────────────────
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function parseYMD(s: string): Date { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

function DatePicker({
  value, min, max, onChange, accent = BLUE,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (v: string) => void;
  accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const base = value ? parseYMD(value) : new Date();
  const [viewY, setViewY] = useState(base.getFullYear());
  const [viewM, setViewM] = useState(base.getMonth());

  useEffect(() => {
    if (!open) return;
    const v = value ? parseYMD(value) : new Date();
    setViewY(v.getFullYear()); setViewM(v.getMonth());
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstDow = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const minD = parseYMD(min), maxD = parseYMD(max);

  const canPrev = new Date(viewY, viewM, 1) > new Date(minD.getFullYear(), minD.getMonth(), 1);
  const canNext = new Date(viewY, viewM, 1) < new Date(maxD.getFullYear(), maxD.getMonth(), 1);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prettyVal = value
    ? parseYMD(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "Select date";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...fieldStyle, cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 8,
          borderColor: open ? accent : (value ? accent + "66" : BORDER),
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <rect x="3" y="5" width="18" height="16" rx="2" stroke={value ? accent : SUB} strokeWidth="1.8" />
          <path d="M16 3v4M8 3v4M3 10h18" stroke={value ? accent : SUB} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span style={{ flex: 1, color: value ? TEXT : SUB }}>{prettyVal}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke={value ? accent : SUB} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
          width: 268, background: `linear-gradient(145deg,${SURF2},${BG})`, border: `1px solid ${BORDER}`,
          borderRadius: 12, boxShadow: "0 14px 40px rgba(0,0,0,0.6)", padding: 12,
        }}>
          {/* month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button type="button" disabled={!canPrev}
              onClick={() => { let m = viewM - 1, y = viewY; if (m < 0) { m = 11; y -= 1; } setViewM(m); setViewY(y); }}
              style={{
                width: 28, height: 28, borderRadius: 8, border: `1px solid ${BORDER}`,
                background: "transparent", color: canPrev ? accent : DIM, fontSize: 15, fontWeight: 800,
                cursor: canPrev ? "pointer" : "not-allowed", opacity: canPrev ? 1 : 0.4,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>‹</button>
            <span style={{ color: TEXT, fontSize: 12.5, fontWeight: 700 }}>{MONTHS[viewM]} {viewY}</span>
            <button type="button" disabled={!canNext}
              onClick={() => { let m = viewM + 1, y = viewY; if (m > 11) { m = 0; y += 1; } setViewM(m); setViewY(y); }}
              style={{
                width: 28, height: 28, borderRadius: 8, border: `1px solid ${BORDER}`,
                background: "transparent", color: canNext ? accent : DIM, fontSize: 15, fontWeight: 800,
                cursor: canNext ? "pointer" : "not-allowed", opacity: canNext ? 1 : 0.4,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>›</button>
          </div>

          {/* weekday header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
            {WEEKDAYS.map(w => (
              <span key={w} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: SUB, padding: "2px 0" }}>{w}</span>
            ))}
          </div>

          {/* days */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />;
              const cur = new Date(viewY, viewM, d);
              const cs = ymd(cur);
              const disabled = cur < minD || cur > maxD;
              const selected = cs === value;
              const isToday = cs === ymd(new Date());
              return (
                <button key={i} type="button" disabled={disabled}
                  onClick={() => { onChange(cs); setOpen(false); }}
                  style={{
                    height: 30, borderRadius: 8, border: isToday && !selected ? `1px solid ${accent}66` : "1px solid transparent",
                    background: selected ? accent : "transparent",
                    color: disabled ? DIM : selected ? BG : TEXT,
                    fontSize: 11.5, fontWeight: selected ? 800 : 500,
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.3 : 1,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!disabled && !selected) (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.15)"; }}
                  onMouseLeave={e => { if (!disabled && !selected) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Request row (list item) ───────────────────────────────────────────────────
function RequestRow({ req, onCancel, busy }: { req: RegRequest; onCancel: (r: RegRequest) => void; busy: boolean }) {
  const [showImg, setShowImg] = useState(false);
  const mins = toMins(req.check_out) - toMins(req.check_in);
  return (
    <div style={{
      background: "rgba(99,102,241,0.05)", border: `1px solid ${BORDER}`,
      borderRadius: 12, padding: "10px 12px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 12.5 }}>
          {new Date(req.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: BLUE, background: `${BLUE}15`,
          border: `1px solid ${BLUE}33`, borderRadius: 20, padding: "2px 8px",
        }}>{reasonLabel(req.reason)}</span>
        <span style={{ marginLeft: "auto" }}><StatusPill status={req.status} /></span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ color: GREEN, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{req.check_in}</span>
        <span style={{ color: DIM }}>→</span>
        <span style={{ color: RED, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{req.check_out}</span>
        <span style={{ color: SUB }}>·</span>
        <span style={{ color: SUB }}>{fmtDuration(mins)}</span>
        {req.created_at ? (
          <span style={{ color: DIM, marginLeft: "auto", fontSize: 9.5 }}>{fmtCreated(req.created_at)}</span>
        ) : null}
      </div>

      <p style={{ color: SUB, fontSize: 11.5, margin: "0 0 6px", lineHeight: 1.5 }}>{req.description}</p>

      {(req.reviewer_note || req.reviewed_by) && (req.status === "approved" || req.status === "rejected") && (
        <p style={{
          color: req.status === "rejected" ? RED : GREEN, fontSize: 10.5, margin: "0 0 6px",
          background: "rgba(99,102,241,0.06)", borderRadius: 8, padding: "5px 8px",
        }}>
          <span style={{ fontWeight: 700 }}>{req.status === "rejected" ? "Rejected" : "Approved"}{req.reviewed_by ? ` by ${req.reviewed_by}` : ""}:</span>
          {" "}{req.reviewer_note || (req.status === "approved" ? "Added to your attendance." : "—")}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {req.attachment && (
          <button
            onClick={() => setShowImg(s => !s)}
            style={{
              fontSize: 10, fontWeight: 600, color: BLUE, background: "transparent",
              border: `1px solid ${BLUE}33`, borderRadius: 8, padding: "3px 9px", cursor: "pointer",
            }}>
            {showImg ? "Hide attachment" : "View attachment"}
          </button>
        )}
        {req.status === "pending" && (
          <button
            onClick={() => onCancel(req)} disabled={busy}
            style={{
              fontSize: 10, fontWeight: 600, color: RED, background: "transparent",
              border: `1px solid ${RED}33`, borderRadius: 8, padding: "3px 9px",
              cursor: busy ? "not-allowed" : "pointer", marginLeft: "auto",
            }}>
            Cancel request
          </button>
        )}
      </div>

      {showImg && req.attachment && (
        <img src={req.attachment} alt="attachment"
          style={{ marginTop: 8, width: "100%", borderRadius: 8, border: `1px solid ${BORDER}` }} />
      )}
    </div>
  );
}

// ─── Employee picker (choose / switch profile) ─────────────────────────────────
function EmployeePicker({
  employees, loading, onSelect, onClose,
}: {
  employees: EmployeeLite[];
  loading: boolean;
  onSelect: (e: EmployeeLite) => void;
  onClose: () => void;
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
    <div style={{ marginTop: 4 }}>
      <input
        autoFocus value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search your name, ID or department…"
        style={{ ...fieldStyle, marginBottom: 8 }}
      />
      <div className="reg-scroll" style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 12 }}>
        {loading ? (
          <div style={{ padding: "26px 0", textAlign: "center", color: SUB, fontSize: 12 }}>Loading employees…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "26px 0", textAlign: "center", color: SUB, fontSize: 12 }}>No employees match "{search}"</div>
        ) : filtered.map(e => (
          <button key={e.emp_id} onClick={() => onSelect(e)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
              background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
              borderBottom: "1px solid rgba(99,102,241,0.08)",
            }}
            onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(99,102,241,0.1)")}
            onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
            <Avatar emp={e} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
              <div style={{ fontSize: 9.5, color: DIM, fontFamily: "'JetBrains Mono',monospace" }}>{e.emp_id}{e.department ? ` · ${e.department}` : ""}</div>
            </div>
          </button>
        ))}
      </div>
      <button onClick={onClose} style={{
        width: "100%", marginTop: 10, padding: "9px", borderRadius: 10, border: `1px solid ${BORDER}`,
        background: SURF, color: SUB, fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}>Cancel</button>
    </div>
  );
}

interface RegularizationProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

export default function Regularization({ open, onClose, onSaved }: RegularizationProps) {
  // JIT Google auth — login required to submit (and to cancel) a regularization.
  const { user, signingIn, executeProtectedAction } = useJITAuth();

  // identity (mutable so we can switch profile in-place)
  const [empId, setEmpId]     = useState<string | null>(() => localStorage.getItem(ID_KEY));
  const [empName, setEmpName] = useState<string | null>(() => localStorage.getItem(NAME_KEY));
  const [me, setMe]           = useState<EmployeeLite | null>(null);

  const [tab, setTab]   = useState<StatusTab>("all");
  const [mode, setMode] = useState<"list" | "form" | "picker">("list");

  const [employees, setEmployees]     = useState<EmployeeLite[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [requests, setRequests] = useState<RegRequest[]>([]);
  const [loading, setLoading]   = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);

  // form fields
  const [date, setDate]               = useState(clampDate(todayStr()));
  const [reason, setReason]           = useState<ReasonValue | "">("");
  const [checkIn, setCheckIn]         = useState("");
  const [checkOut, setCheckOut]       = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment]   = useState<string | null>(null);
  const [attachName, setAttachName]   = useState<string>("");
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  // ── load this user's requests from regularizations/{emp_id} ──
  const loadRequests = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "regularizations", id));
      const list: RegRequest[] = snap.exists() ? ((snap.data().requests as RegRequest[]) || []) : [];
      list.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.created_at || 0) - (a.created_at || 0);
      });
      setRequests(list);
    } catch (e) {
      console.error(e);
      setErr("Could not load your requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── load employee list (for picker + to resolve avatar/name) ──
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

  // on open: load requests if we have an identity, else open the picker
  useEffect(() => {
    if (!open) return;
    setErr(""); resetForm(); setTab("all");
    loadEmployees();
    if (empId) { setMode("list"); loadRequests(empId); }
    else { setMode("picker"); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // resolve "me" (for avatar) from the employee list
  useEffect(() => {
    if (!empId) { setMe(null); return; }
    const found = employees.find(e => e.emp_id === empId);
    if (found) setMe(found);
    else setMe({ emp_id: empId, name: empName || empId });
  }, [empId, empName, employees]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  function resetForm() {
    setDate(clampDate(todayStr())); setReason(""); setCheckIn(""); setCheckOut("");
    setDescription(""); setAttachment(null); setAttachName(""); setErr("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function chooseProfile(emp: EmployeeLite) {
    localStorage.setItem(ID_KEY, emp.emp_id);
    localStorage.setItem(NAME_KEY, emp.name);
    setEmpId(emp.emp_id);
    setEmpName(emp.name);
    setMe(emp);
    setMode("list");
    loadRequests(emp.emp_id);
  }

  const durMins = checkIn && checkOut ? toMins(checkOut) - toMins(checkIn) : 0;
  const durValid = durMins > 0;

  const canSave =
    !!empId && !!date && !!reason && !!checkIn && !!checkOut &&
    durValid && description.trim().length > 0 && !saving;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Attachment must be an image."); e.target.value = ""; return;
    }
    if (file.size > MAX_ATTACH_BYTES) {
      setErr(`Image is ${fmtBytes(file.size)} — max allowed is 3 MB.`); e.target.value = ""; return;
    }
    const reader = new FileReader();
    reader.onload = () => { setAttachment(reader.result as string); setAttachName(file.name); };
    reader.onerror = () => setErr("Could not read the image. Please try another file.");
    reader.readAsDataURL(file);
  }

  function clearAttachment() {
    setAttachment(null); setAttachName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    if (!empId) { setErr("Please select your profile first."); return; }
    if (!reason) { setErr("Please select a reason."); return; }
    if (!durValid) { setErr("Check-out time must be after check-in time."); return; }
    if (!description.trim()) { setErr("Description is required."); return; }
    setErr("");

    const result = await executeProtectedAction(async (authUser) => {
      setSaving(true);
      try {
        const newReq: RegRequest = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          date,
          day: dayName(date),
          reason: reason as ReasonValue,
          check_in: checkIn,
          check_out: checkOut,
          description: description.trim(),
          attachment: attachment ?? null,
          status: "pending",
          created_at: Date.now(),
          submittedByEmail: authUser.email ?? "",
          submittedByUid: authUser.uid,
        };
        // doc id = emp_id; requests live in an array on that doc
        await setDoc(
          doc(db, "regularizations", empId),
          {
            emp_id: empId,
            emp_name: empName || empId,
            lastWriterEmail: authUser.email ?? "",   // doc-level — the field rules check
            lastWriterUid: authUser.uid,
            updatedAt: serverTimestamp(),
            requests: [...requests, newReq],
          },
          { merge: true }
        );
        onSaved?.(`Regularization request submitted for ${new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`);
        resetForm();
        setMode("list");
        setTab("pending");
        await loadRequests(empId);
      } catch (e) {
        console.error(e);
        setErr("Could not submit your request. Please try again.");
      } finally {
        setSaving(false);
      }
    });
    if (!result.ok) setErr(result.message);
  }

  async function handleCancel(req: RegRequest) {
    if (!empId) return;
    setBusyId(req.id);
    const result = await executeProtectedAction(async (authUser) => {
      try {
        const updated = requests.map(r => r.id === req.id ? { ...r, status: "cancelled" as RegStatus } : r);
        await setDoc(
          doc(db, "regularizations", empId),
          { lastWriterEmail: authUser.email ?? "", lastWriterUid: authUser.uid, updatedAt: serverTimestamp(), requests: updated },
          { merge: true }
        );
        setRequests(updated);
      } catch (e) {
        console.error(e);
        setErr("Could not cancel the request.");
      }
    });
    if (!result.ok) setErr(result.message);
    setBusyId(null);
  }

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = { all: requests.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const r of requests) c[r.status] += 1;
    return c;
  }, [requests]);

  const visible = useMemo(
    () => tab === "all" ? requests : requests.filter(r => r.status === tab),
    [requests, tab]
  );

  if (!open) return null;

  const TABS: StatusTab[] = ["all", "pending", "approved", "rejected", "cancelled"];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(2,6,23,0.7)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "'Sora',sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="reg-scroll"
        style={{
          width: "min(520px,100%)", maxHeight: "90vh", overflowY: "auto",
          background: `linear-gradient(160deg,${SURF2} 0%,${BG} 100%)`,
          border: `1px solid ${BORDER}`, borderRadius: 18,
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)", padding: 22,
        }}
      >
        <style>{`
          .reg-scroll { scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.35) transparent; }
          .reg-scroll::-webkit-scrollbar { width: 5px; }
          .reg-scroll::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 4px; }
          .reg-tab { transition: all 0.12s; }
        `}</style>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "rgba(255,215,0,0.08)", border: `1px solid ${YELLOW}33`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M9 11l3 3L22 4" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.2 }}>
                Attendance Regularization
              </h2>
              <p style={{ fontSize: 10, color: SUB, margin: "2px 0 0" }}>
                Request a missed check-in / check-out correction
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`,
            background: SURF, color: SUB, cursor: "pointer", fontSize: 16, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>×</button>
        </div>

        {/* identity bar (shows the auto-filled employee + switch) */}
        {empId && mode !== "picker" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
            background: "rgba(99,102,241,0.06)", border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: "8px 10px",
          }}>
            <Avatar emp={me} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {me?.name || empName || empId}
              </div>
              <div style={{ fontSize: 9.5, color: DIM, fontFamily: "'JetBrains Mono',monospace" }}>
                {empId}{me?.department ? ` · ${me.department}` : ""}
              </div>
            </div>
            <button onClick={() => setMode("picker")} style={{
              fontSize: 10, fontWeight: 700, color: BLUE, background: "transparent",
              border: `1px solid ${BLUE}33`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", flexShrink: 0,
            }}>Switch</button>
          </div>
        )}

        {mode === "picker" ? (
          <>
            <p style={{ color: SUB, fontSize: 11.5, margin: "0 0 6px" }}>
              {empId ? "Switch to a different profile:" : "Select your profile to continue:"}
            </p>
            <EmployeePicker
              employees={employees}
              loading={loadingEmps}
              onSelect={chooseProfile}
              onClose={() => { if (empId) setMode("list"); else onClose(); }}
            />
          </>
        ) : mode === "list" ? (
          <>
            {/* status tabs */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {TABS.map(t => {
                const active = tab === t;
                const color = t === "all" ? YELLOW : STATUS_META[t].color;
                const label = t === "all" ? "All" : STATUS_META[t].label;
                return (
                  <button key={t} className="reg-tab"
                    onClick={() => setTab(t)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", borderRadius: 9, cursor: "pointer",
                      border: `1px solid ${active ? color + "66" : BORDER}`,
                      background: active ? `${color}14` : SURF,
                      color: active ? color : SUB, fontSize: 11, fontWeight: 600,
                    }}>
                    {label}
                    <span style={{
                      background: active ? `${color}22` : "rgba(99,102,241,0.15)",
                      color: active ? color : SUB, borderRadius: 8, padding: "0 6px",
                      fontSize: 9.5, fontWeight: 700,
                    }}>{counts[t]}</span>
                  </button>
                );
              })}
            </div>

            {/* new request button */}
            <button
              onClick={() => { resetForm(); setMode("form"); }}
              disabled={!empId}
              style={{
                width: "100%", padding: "10px", borderRadius: 10, border: "none",
                background: empId ? YELLOW : "rgba(255,215,0,0.25)",
                color: empId ? BG : "rgba(6,13,46,0.6)",
                fontSize: 12.5, fontWeight: 700, cursor: empId ? "pointer" : "not-allowed",
                marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke={empId ? BG : "rgba(6,13,46,0.6)"} strokeWidth="2.4" strokeLinecap="round"/>
              </svg>
              Request Regularization
            </button>

            {/* list */}
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ height: 92, borderRadius: 12, background: SURF, opacity: 0.5 }} />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: SUB, fontSize: 12 }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>🗂️</div>
                No {tab === "all" ? "" : STATUS_META[tab as RegStatus].label.toLowerCase() + " "}requests yet.
              </div>
            ) : (
              visible.map(r => (
                <RequestRow key={r.id} req={r} onCancel={handleCancel} busy={busyId === r.id} />
              ))
            )}

            {err && (
              <div style={{
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                color: "#FCA5A5", borderRadius: 10, padding: "8px 12px", fontSize: 11.5, marginTop: 12,
              }}>⚠ {err}</div>
            )}
          </>
        ) : (
          <>
            {/* date */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Date</label>
              <DatePicker value={date} min={RANGE_MIN} max={RANGE_MAX}
                onChange={v => setDate(clampDate(v))} accent={BLUE} />
              {date && (
                <span style={{ fontSize: 10.5, color: BLUE, fontWeight: 600, display: "block", marginTop: 5 }}>
                  {dayName(date)}
                </span>
              )}
            </div>

            {/* reason */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Reason</label>
              <select value={reason} onChange={e => setReason(e.target.value as ReasonValue)}
                style={{ ...fieldStyle, colorScheme: "dark", cursor: "pointer" }}>
                <option value="" disabled>Select a reason…</option>
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            {/* times */}
            <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={labelStyle}>Check-in</label>
                <TimeDropdown value={checkIn} onChange={setCheckIn} accent={GREEN} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={labelStyle}>Check-out</label>
                <TimeDropdown value={checkOut} onChange={setCheckOut} accent={RED} />
              </div>
            </div>

            {/* total hours hint */}
            <div style={{ minHeight: 18, marginBottom: 12 }}>
              {checkIn && checkOut ? (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: durValid ? GREEN : RED }}>
                  {durValid ? `Total: ${fmtDuration(durMins)}` : "Check-out must be after check-in."}
                </span>
              ) : (
                <span style={{ fontSize: 10.5, color: DIM }}>Pick both times to see total hours.</span>
              )}
            </div>

            {/* description — mandatory */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description <span style={{ color: RED }}>*</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Explain why you need this correction…"
                maxLength={300} rows={3}
                style={{ ...fieldStyle, resize: "vertical", minHeight: 64, lineHeight: 1.5 }} />
              <span style={{ fontSize: 9.5, color: DIM, display: "block", marginTop: 4, textAlign: "right" }}>
                {description.length}/300
              </span>
            </div>

            {/* attachment — optional, <=3MB */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Attachment <span style={{ color: DIM, fontWeight: 500 }}>(optional · image · max 3 MB)</span></label>
              {attachment ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, background: SURF,
                }}>
                  <img src={attachment} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {attachName || "image"}
                  </span>
                  <button onClick={clearAttachment} style={{
                    fontSize: 10, fontWeight: 600, color: RED, background: "transparent",
                    border: `1px solid ${RED}33`, borderRadius: 8, padding: "4px 9px", cursor: "pointer", flexShrink: 0,
                  }}>Remove</button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} style={{
                  ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  cursor: "pointer", color: SUB, borderStyle: "dashed",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke={SUB} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Upload image
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
            </div>

            {err && (
              <div style={{
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                color: "#FCA5A5", borderRadius: 10, padding: "8px 12px", fontSize: 11.5, marginBottom: 12,
              }}>⚠ {err}</div>
            )}

            {/* verified identity / login hint */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, fontSize: 10.5, color: SUB }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M12 11a4 4 0 100-8 4 4 0 000 8z" stroke={user ? GREEN : DIM} strokeWidth="1.8"/>
                <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" stroke={user ? GREEN : DIM} strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              {user
                ? <span>Signed in as <span style={{ color: GREEN, fontWeight: 700 }}>{user.email}</span></span>
                : <span>You'll sign in with Google when you submit — for a verified record.</span>}
            </div>

            {/* actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={() => { setMode("list"); setErr(""); }} disabled={saving || signingIn}
                style={{
                  flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${BORDER}`,
                  background: SURF, color: SUB, fontSize: 12.5, fontWeight: 600,
                  cursor: (saving || signingIn) ? "not-allowed" : "pointer", opacity: (saving || signingIn) ? 0.6 : 1,
                }}>Back</button>
              <button onClick={handleSubmit} disabled={!canSave || signingIn}
                style={{
                  flex: 2, padding: "10px", borderRadius: 10, border: "none",
                  background: (canSave && !signingIn) ? YELLOW : "rgba(255,215,0,0.25)",
                  color: (canSave && !signingIn) ? BG : "rgba(6,13,46,0.6)",
                  fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3,
                  cursor: (canSave && !signingIn) ? "pointer" : "not-allowed",
                }}>
                {signingIn ? "Signing in…" : saving ? "Submitting…" : user ? "Submit Request" : "Sign in & Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
