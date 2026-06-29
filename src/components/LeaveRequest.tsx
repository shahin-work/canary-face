import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  collection, getDocs, doc, getDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useJITAuth } from "../hooks/useJITAuth";

// ─── theme (matches Regularization / MyAttendance) ────────────────────────────
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
const TEAL   = "#34D399";

// ─── range (matches the dashboard) ────────────────────────────────────────────
const RANGE_MIN = "2026-03-02";
const RANGE_MAX = "2026-12-31";

const MAX_ATTACH_BYTES = 3 * 1024 * 1024; // 3 MB

// ─── storage keys (shared with MyAttendance / Regularization) ─────────────────
const ID_KEY   = "cf_my_emp_id";
const NAME_KEY = "cf_my_emp_name";

// ─── leave model (must match HR's leaveSlot in HrPanel.tsx) ────────────────────
type LeaveKind    = "full" | "half" | "quarter";
type LeaveHalf    = "first" | "second";
type LeaveQuarter = "q1" | "q2" | "q3" | "q4";

// returns the { check_in, check_out } slot (HH:MM:SS) + a label for a selection.
// Work day: 09:00–18:00 with a 13:00–14:00 lunch (8h) — identical to HrPanel.
function leaveSlot(kind: LeaveKind, half: LeaveHalf, quarter: LeaveQuarter): { check_in: string; check_out: string; label: string } {
  if (kind === "full") return { check_in: "09:00:00", check_out: "18:00:00", label: "Full Day · 09:00–18:00" };
  if (kind === "half") {
    return half === "first"
      ? { check_in: "09:00:00", check_out: "13:00:00", label: "Half Day (1st) · 09:00–13:00" }
      : { check_in: "14:00:00", check_out: "18:00:00", label: "Half Day (2nd) · 14:00–18:00" };
  }
  const Q: Record<LeaveQuarter, { check_in: string; check_out: string; label: string }> = {
    q1: { check_in: "09:00:00", check_out: "11:00:00", label: "Quarter 1 · 09:00–11:00" },
    q2: { check_in: "11:00:00", check_out: "13:00:00", label: "Quarter 2 · 11:00–13:00" },
    q3: { check_in: "14:00:00", check_out: "16:00:00", label: "Quarter 3 · 14:00–16:00" },
    q4: { check_in: "16:00:00", check_out: "18:00:00", label: "Quarter 4 · 16:00–18:00" },
  };
  return Q[quarter];
}

// ─── leave categories (each allows only certain durations) ────────────────────
type LeaveCategory =
  | "casual" | "sick" | "compensatory" | "paternity" | "lwp" | "unpaid";

const LEAVE_CATEGORIES: {
  value: LeaveCategory;
  label: string;
  kinds: LeaveKind[];   // durations allowed for this category
}[] = [
  { value: "casual",       label: "Casual Leave",        kinds: ["full", "half"] },
  { value: "sick",         label: "Sick Leave",          kinds: ["full", "half", "quarter"] },
  { value: "compensatory", label: "Compensatory Leave",  kinds: ["full", "half"] },
  { value: "paternity",    label: "Paternity Leave",     kinds: ["full", "half"] },
  { value: "lwp",          label: "Leave Without Pay",   kinds: ["full", "half"] },
  { value: "unpaid",       label: "Unpaid Leave",        kinds: ["full", "half"] },
];

const categoryLabel = (c: string) =>
  LEAVE_CATEGORIES.find(x => x.value === c)?.label ?? c;
const categoryKinds = (c: LeaveCategory): LeaveKind[] =>
  LEAVE_CATEGORIES.find(x => x.value === c)?.kinds ?? ["full", "half"];

const KIND_LABEL: Record<LeaveKind, string> = {
  full: "Full day", half: "Half day", quarter: "Quarter day",
};

// ─── status model ─────────────────────────────────────────────────────────────
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type StatusTab   = "all" | LeaveStatus;

const STATUS_META: Record<LeaveStatus, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: YELLOW },
  approved:  { label: "Approved",  color: GREEN  },
  rejected:  { label: "Rejected",  color: RED    },
  cancelled: { label: "Cancelled", color: DIM    },
};

interface LeaveReq {
  id: string;
  date: string;
  day: string;
  category: LeaveCategory;
  kind: LeaveKind;
  half?: LeaveHalf;       // only when kind === "half"
  quarter?: LeaveQuarter; // only when kind === "quarter"
  check_in: string;       // "HH:MM:SS"
  check_out: string;      // "HH:MM:SS"
  reason: string;         // optional
  attachment?: string | null; // base64 data URL
  status: LeaveStatus;
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

const fmtBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const initials = (n: string) => (n || "?").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();
const avatarSrc = (img?: string) => (!img ? undefined : img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`);

// short, human label of a leave selection (for list rows)
function kindLabel(r: Pick<LeaveReq, "kind" | "half" | "quarter">): string {
  if (r.kind === "full") return "Full day";
  if (r.kind === "half") return r.half === "second" ? "Half day · 2nd" : "Half day · 1st";
  const qn = { q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" }[r.quarter || "q1"];
  return `Quarter · ${qn}`;
}

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
function StatusPill({ status }: { status: LeaveStatus }) {
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

// ─── Segmented control (leave type / half / quarter) ──────────────────────────
function Segmented<T extends string>({
  value, options, onChange, accent = TEAL,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{
              flex: "1 1 auto", minWidth: 64, padding: "8px 10px", borderRadius: 9, cursor: "pointer",
              fontSize: 11.5, fontWeight: 700, fontFamily: "'Sora',sans-serif",
              border: `1px solid ${on ? accent : BORDER}`,
              background: on ? `${accent}1f` : SURF,
              color: on ? accent : SUB, transition: "all 0.12s",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Themed calendar date picker (blue) — same as Regularization ──────────────
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
            {WEEKDAYS.map(w => (
              <span key={w} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: SUB, padding: "2px 0" }}>{w}</span>
            ))}
          </div>

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
function RequestRow({ req, onCancel, busy }: { req: LeaveReq; onCancel: (r: LeaveReq) => void; busy: boolean }) {
  const [showImg, setShowImg] = useState(false);
  const slot = leaveSlot(req.kind, req.half || "first", req.quarter || "q1");
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
          fontSize: 9.5, fontWeight: 700, color: YELLOW, background: `${YELLOW}15`,
          border: `1px solid ${YELLOW}33`, borderRadius: 20, padding: "2px 8px",
        }}>{categoryLabel(req.category)}</span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: TEAL, background: `${TEAL}15`,
          border: `1px solid ${TEAL}33`, borderRadius: 20, padding: "2px 8px",
        }}>🌴 {kindLabel(req)}</span>
        <span style={{ marginLeft: "auto" }}><StatusPill status={req.status} /></span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ color: SUB, fontFamily: "'JetBrains Mono',monospace" }}>{slot.check_in.slice(0, 5)}–{slot.check_out.slice(0, 5)}</span>
        {req.created_at ? (
          <span style={{ color: DIM, marginLeft: "auto", fontSize: 9.5 }}>{fmtCreated(req.created_at)}</span>
        ) : null}
      </div>

      {req.reason ? (
        <p style={{ color: SUB, fontSize: 11.5, margin: "0 0 6px", lineHeight: 1.5 }}>{req.reason}</p>
      ) : (
        <p style={{ color: DIM, fontSize: 11, margin: "0 0 6px", fontStyle: "italic" }}>No reason provided.</p>
      )}

      {(req.reviewer_note || req.reviewed_by) && (req.status === "approved" || req.status === "rejected") && (
        <p style={{
          color: req.status === "rejected" ? RED : GREEN, fontSize: 10.5, margin: "0 0 6px",
          background: "rgba(99,102,241,0.06)", borderRadius: 8, padding: "5px 8px",
        }}>
          <span style={{ fontWeight: 700 }}>{req.status === "rejected" ? "Rejected" : "Approved"}{req.reviewed_by ? ` by ${req.reviewed_by}` : ""}:</span>
          {" "}{req.reviewer_note || (req.status === "approved" ? "Added to your attendance as leave." : "—")}
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
      <div className="lv-scroll" style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 12 }}>
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

interface LeaveRequestProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

export default function LeaveRequest({ open, onClose, onSaved }: LeaveRequestProps) {
  // JIT Google auth — login required to submit (and to cancel) a leave request.
  const { user, signingIn, executeProtectedAction } = useJITAuth();

  // identity (mutable so we can switch profile in-place)
  const [empId, setEmpId]     = useState<string | null>(() => localStorage.getItem(ID_KEY));
  const [empName, setEmpName] = useState<string | null>(() => localStorage.getItem(NAME_KEY));
  const [me, setMe]           = useState<EmployeeLite | null>(null);

  const [tab, setTab]   = useState<StatusTab>("all");
  const [mode, setMode] = useState<"list" | "form" | "picker">("list");

  const [employees, setEmployees]     = useState<EmployeeLite[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [loading, setLoading]   = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);

  // form fields
  const [date, setDate]         = useState(clampDate(todayStr()));
  const [category, setCategory] = useState<LeaveCategory>("casual");
  const [kind, setKind]         = useState<LeaveKind>("full");
  const [half, setHalf]         = useState<LeaveHalf>("first");
  const [quarter, setQuarter]   = useState<LeaveQuarter>("q1");
  const [reason, setReason]     = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attachName, setAttachName] = useState<string>("");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  // ── load this user's requests from leaveRequests/{emp_id} ──
  const loadRequests = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "leaveRequests", id));
      const list: LeaveReq[] = snap.exists() ? ((snap.data().requests as LeaveReq[]) || []) : [];
      list.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.created_at || 0) - (a.created_at || 0);
      });
      setRequests(list);
    } catch (e) {
      console.error(e);
      setErr("Could not load your leave requests.");
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
    setDate(clampDate(todayStr())); setCategory("casual"); setKind("full"); setHalf("first"); setQuarter("q1");
    setReason(""); setAttachment(null); setAttachName(""); setErr("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // allowed durations for the picked category; if the current kind isn't allowed
  // (e.g. was "quarter" then switched to a category without it), snap to the first.
  const allowedKinds = categoryKinds(category);
  function pickCategory(c: LeaveCategory) {
    setCategory(c);
    const kinds = categoryKinds(c);
    if (!kinds.includes(kind)) setKind(kinds[0]);
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

  const slot = leaveSlot(kind, half, quarter);
  const canSave = !!empId && !!date && !saving;

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
    if (!date)  { setErr("Please pick a date."); return; }
    setErr("");

    // JIT auth gate: opens the Google popup if not signed in, then submits with the
    // verified email read from the token (never a form field).
    const result = await executeProtectedAction(async (authUser) => {
      setSaving(true);
      try {
        const newReq: LeaveReq = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          date,
          day: dayName(date),
          category,
          kind,
          ...(kind === "half" ? { half } : {}),
          ...(kind === "quarter" ? { quarter } : {}),
          check_in: slot.check_in,
          check_out: slot.check_out,
          reason: reason.trim(),
          attachment: attachment ?? null,
          status: "pending",
          created_at: Date.now(),
          submittedByEmail: authUser.email ?? "",
          submittedByUid: authUser.uid,
        };
        // doc id = emp_id; requests live in an array on that doc
        await setDoc(
          doc(db, "leaveRequests", empId),
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
        onSaved?.(`Leave request submitted for ${new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`);
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

  async function handleCancel(req: LeaveReq) {
    if (!empId) return;
    setBusyId(req.id);
    // Cancel is also a write → must be authenticated and carry the verified email.
    const result = await executeProtectedAction(async (authUser) => {
      try {
        const updated = requests.map(r => r.id === req.id ? { ...r, status: "cancelled" as LeaveStatus } : r);
        await setDoc(
          doc(db, "leaveRequests", empId),
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
        className="lv-scroll"
        style={{
          width: "min(520px,100%)", maxHeight: "90vh", overflowY: "auto",
          background: `linear-gradient(160deg,${SURF2} 0%,${BG} 100%)`,
          border: `1px solid ${BORDER}`, borderRadius: 18,
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)", padding: 22,
        }}
      >
        <style>{`
          .lv-scroll { scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.35) transparent; }
          .lv-scroll::-webkit-scrollbar { width: 5px; }
          .lv-scroll::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 4px; }
        `}</style>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: `${TEAL}14`, border: `1px solid ${TEAL}33`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>🌴</div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.2 }}>
                Request Leave
              </h2>
              <p style={{ fontSize: 10, color: SUB, margin: "2px 0 0" }}>
                Apply for full, half day — HR will review it
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`,
            background: SURF, color: SUB, cursor: "pointer", fontSize: 16, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>×</button>
        </div>

        {/* identity bar */}
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
                const color = t === "all" ? TEAL : STATUS_META[t].color;
                const label = t === "all" ? "All" : STATUS_META[t].label;
                return (
                  <button key={t}
                    onClick={() => setTab(t)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", borderRadius: 9, cursor: "pointer",
                      border: `1px solid ${active ? color + "66" : BORDER}`,
                      background: active ? `${color}14` : SURF,
                      color: active ? color : SUB, fontSize: 11, fontWeight: 600, transition: "all 0.12s",
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
                background: empId ? TEAL : `${TEAL}40`,
                color: empId ? BG : "rgba(6,13,46,0.6)",
                fontSize: 12.5, fontWeight: 700, cursor: empId ? "pointer" : "not-allowed",
                marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke={empId ? BG : "rgba(6,13,46,0.6)"} strokeWidth="2.4" strokeLinecap="round"/>
              </svg>
              Request Leave
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
                <div style={{ fontSize: 30, marginBottom: 8 }}>🌴</div>
                No {tab === "all" ? "" : STATUS_META[tab as LeaveStatus].label.toLowerCase() + " "}leave requests yet.
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

            {/* leave category */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Leave category</label>
              <select value={category} onChange={e => pickCategory(e.target.value as LeaveCategory)}
                style={{ ...fieldStyle, colorScheme: "dark", cursor: "pointer" }}>
                {LEAVE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* leave duration (only the kinds this category allows) */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Duration</label>
              <Segmented<LeaveKind>
                value={kind}
                onChange={setKind}
                options={allowedKinds.map(k => ({ value: k, label: KIND_LABEL[k] }))}
              />
            </div>

            {/* half-day sub-choice */}
            {kind === "half" && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Which half</label>
                <Segmented<LeaveHalf>
                  value={half}
                  onChange={setHalf}
                  accent={BLUE}
                  options={[
                    { value: "first",  label: "1st · 09:00–13:00" },
                    { value: "second", label: "2nd · 14:00–18:00" },
                  ]}
                />
              </div>
            )}

            {/* quarter-day sub-choice */}
            {kind === "quarter" && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Which quarter</label>
                <Segmented<LeaveQuarter>
                  value={quarter}
                  onChange={setQuarter}
                  accent={BLUE}
                  options={[
                    { value: "q1", label: "Q1 · 09–11" },
                    { value: "q2", label: "Q2 · 11–13" },
                    { value: "q3", label: "Q3 · 14–16" },
                    { value: "q4", label: "Q4 · 16–18" },
                  ]}
                />
              </div>
            )}

            {/* selected slot summary */}
            <div style={{
              marginBottom: 14, padding: "9px 12px", borderRadius: 10,
              background: `${TEAL}10`, border: `1px solid ${TEAL}33`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>🕒</span>
              <span style={{ color: TEAL, fontSize: 11.5, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
                {slot.label}
              </span>
            </div>

            {/* reason — optional */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Reason <span style={{ color: DIM, fontWeight: 500 }}>(optional)</span></label>
              <textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="e.g. Sick leave, personal, casual leave…"
                maxLength={300} rows={3}
                style={{ ...fieldStyle, resize: "vertical", minHeight: 64, lineHeight: 1.5 }} />
              <span style={{ fontSize: 9.5, color: DIM, display: "block", marginTop: 4, textAlign: "right" }}>
                {reason.length}/300
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
                  background: (canSave && !signingIn) ? TEAL : `${TEAL}40`,
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
