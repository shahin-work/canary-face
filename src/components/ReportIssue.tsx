import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { useJITAuth } from "../hooks/useJITAuth";

// ─── theme ────────────────────────────────────────────────────────────────────
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

const MAX_ATTACH_BYTES = 3 * 1024 * 1024; // 3 MB
const ID_KEY   = "cf_my_emp_id";
const NAME_KEY = "cf_my_emp_name";

// ─── issue categories + routing ──────────────────────────────────────────────
// Attendance-device issues go to Shahin; everything else goes to HR (Vandana).
 

export const CATEGORIES = [
  // ── HR & Attendance Issues (Most Common) ──
  { value: "regularization",        label: "Attendance Regularization",  solver: "HR — Vandana", solverNote: "Handled by HR" },
  { value: "record_sync",           label: "Zoho Sync / Record Error",   solver: "HR — Vandana", solverNote: "Handled by HR" },
  { value: "leave_wfh",             label: "Leave or WFH Discrepancy",   solver: "HR — Vandana", solverNote: "Handled by HR" },

  // ── Technical & Device Issues ──
  { value: "app_issue",             label: "Canary Face App Issue",      solver: "Shahin",       solverNote: "Handled by Shahin" },
  { value: "face_recognition",      label: "Face Recognition",           solver: "Shahin",       solverNote: "Handled by Shahin" },
  { value: "dashboard_bug",         label: "Web Dashboard Bug",          solver: "Shahin",       solverNote: "Handled by Shahin" },

  // ── Workplace & Facilities ──
  { value: "workplace",             label: "Workplace & Facilities",     solver: "HR — Vandana", solverNote: "Handled by HR" },

  // ── Compliance & Policy Violations ──
  { value: "missed_scan_violation", label: "Failure to Scan In/Out",     solver: "HR — Vandana", solverNote: "Handled by HR" },
  { value: "unreported_absence",    label: "Unreported Absence / WFH",   solver: "HR — Vandana", solverNote: "Handled by HR" },
  { value: "unauthorized_break",    label: "Excessive / Unlogged Break", solver: "HR — Vandana", solverNote: "Handled by HR" },
  { value: "policy_violation",      label: "General Policy Violation",   solver: "HR — Vandana", solverNote: "Handled by HR" },
  { value: "device_misuse",         label: "Device Tampering / Misuse",  solver: "Shahin",       solverNote: "Handled by Shahin" },

  // ── Catch-all (Always Last) ──
  { value: "other",                 label: "Other / General",            solver: "HR — Vandana", solverNote: "Handled by HR" },
] as const;
 
type CategoryValue = (typeof CATEGORIES)[number]["value"];

type IssueStatus = "open" | "resolved" | "cancelled";
const STATUS_META: Record<IssueStatus, { label: string; color: string }> = {
  open:      { label: "Open",      color: YELLOW },
  resolved:  { label: "Resolved",  color: GREEN  },
  cancelled: { label: "Cancelled", color: DIM    },
};

interface IssueReport {
  id: string;
  category: CategoryValue;
  solver: string;
  description: string;
  attachment?: string | null;
  status: IssueStatus;
  created_at: number;
  resolver_note?: string;
  // verified identity from the Google token (never client-typed) — audit trail
  submittedByEmail?: string;
  submittedByUid?: string;
}

interface EmployeeLite {
  emp_id: string; name: string; department?: string; type?: string; profile_image?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const initials = (n: string) => (n || "?").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();
const avatarSrc = (img?: string) => (!img ? undefined : img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`);
const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;

function fmtCreated(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " +
         d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
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

function StatusPill({ status }: { status: IssueStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, color: m.color,
      background: `${m.color}18`, border: `1px solid ${m.color}40`,
      borderRadius: 20, padding: "2px 9px", flexShrink: 0, whiteSpace: "nowrap",
    }}>{m.label}</span>
  );
}

function ReportRow({ r, index = 0 }: { r: IssueReport; index?: number }) {
  const [showImg, setShowImg] = useState(false);
  return (
    <div className="rep-row-anim" style={{
      background: "rgba(99,102,241,0.05)", border: `1px solid ${BORDER}`,
      borderRadius: 12, padding: "11px 13px", marginBottom: 9,
      animationDelay: `${Math.min(index, 8) * 0.035}s`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: BLUE, background: `${BLUE}15`,
          border: `1px solid ${BLUE}33`, borderRadius: 20, padding: "2px 8px",
        }}>{catLabel(r.category)}</span>
        <span style={{ marginLeft: "auto" }}><StatusPill status={r.status} /></span>
      </div>
      <p style={{ color: SUB, fontSize: 11.5, margin: "0 0 6px", lineHeight: 1.5 }}>{r.description}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: DIM, flexWrap: "wrap" }}>
        <span>To: <b style={{ color: SUB }}>{r.solver}</b></span>
        {r.created_at ? <span style={{ marginLeft: "auto" }}>{fmtCreated(r.created_at)}</span> : null}
      </div>
      {r.resolver_note && (
        <p style={{ color: GREEN, fontSize: 10.5, margin: "6px 0 0", background: "rgba(99,102,241,0.06)", borderRadius: 8, padding: "5px 8px" }}>
          <span style={{ fontWeight: 700 }}>Update:</span> {r.resolver_note}
        </p>
      )}
      {r.attachment && (
        <>
          <button onClick={() => setShowImg(s => !s)} style={{
            marginTop: 8, fontSize: 10, fontWeight: 600, color: BLUE, background: "transparent",
            border: `1px solid ${BLUE}33`, borderRadius: 8, padding: "3px 9px", cursor: "pointer",
          }}>{showImg ? "Hide attachment" : "View attachment"}</button>
          {showImg && <img src={r.attachment} alt="" style={{ marginTop: 8, width: "100%", borderRadius: 8, border: `1px solid ${BORDER}` }} />}
        </>
      )}
    </div>
  );
}

function EmployeePicker({
  employees, loading, onSelect, onClose,
}: {
  employees: EmployeeLite[]; loading: boolean;
  onSelect: (e: EmployeeLite) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const list = sortEmployees(employees);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(e =>
      e.name.toLowerCase().includes(q) || e.emp_id.toLowerCase().includes(q) || (e.department || "").toLowerCase().includes(q));
  }, [employees, search]);

  return (
    <div style={{ marginTop: 4 }}>
      <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search your name, ID or department…" style={{ ...fieldStyle, marginBottom: 8 }} />
      <div className="rep-scroll" style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 12 }}>
        {loading ? (
          <div style={{ padding: "26px 0", textAlign: "center", color: SUB, fontSize: 12 }}>Loading employees…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "26px 0", textAlign: "center", color: SUB, fontSize: 12 }}>No employees match "{search}"</div>
        ) : filtered.map(e => (
          <button key={e.emp_id} onClick={() => onSelect(e)} style={{
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

interface ReportIssueProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

export default function ReportIssue({ open, onClose, onSaved }: ReportIssueProps) {
  // JIT Google auth — only triggered when the user actually submits a report.
  const { user, signingIn, executeProtectedAction } = useJITAuth();

  const [empId, setEmpId]     = useState<string | null>(() => localStorage.getItem(ID_KEY));
  const [empName, setEmpName] = useState<string | null>(() => localStorage.getItem(NAME_KEY));
  const [me, setMe]           = useState<EmployeeLite | null>(null);

  const [mode, setMode] = useState<"list" | "form" | "picker">("list");
  const [employees, setEmployees]     = useState<EmployeeLite[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);

  const [reports, setReports] = useState<IssueReport[]>([]);
  const [loading, setLoading] = useState(false);

  const [category, setCategory]       = useState<CategoryValue | "">("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment]   = useState<string | null>(null);
  const [attachName, setAttachName]   = useState("");
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const loadReports = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "issues", id));
      const list: IssueReport[] = snap.exists() ? ((snap.data().reports as IssueReport[]) || []) : [];
      list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      setReports(list);
    } catch (e) {
      console.error(e); setErr("Could not load your reports.");
    } finally { setLoading(false); }
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoadingEmps(true);
    try {
      const snap = await getDocs(collection(db, "employees"));
      setEmployees(snap.docs.map(d => d.data() as EmployeeLite));
    } catch (e) { console.error(e); }
    finally { setLoadingEmps(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    setErr(""); resetForm();
    loadEmployees();
    if (empId) { setMode("list"); loadReports(empId); }
    else { setMode("picker"); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!empId) { setMe(null); return; }
    const found = employees.find(e => e.emp_id === empId);
    setMe(found || { emp_id: empId, name: empName || empId });
  }, [empId, empName, employees]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  function resetForm() {
    setCategory(""); setDescription(""); setAttachment(null); setAttachName(""); setErr("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function chooseProfile(emp: EmployeeLite) {
    localStorage.setItem(ID_KEY, emp.emp_id);
    localStorage.setItem(NAME_KEY, emp.name);
    setEmpId(emp.emp_id); setEmpName(emp.name); setMe(emp);
    setMode("list"); loadReports(emp.emp_id);
  }

  const selectedCat = CATEGORIES.find(c => c.value === category) || null;
  const canSave = !!empId && !!category && description.trim().length > 0 && !saving;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Attachment must be an image."); e.target.value = ""; return; }
    if (file.size > MAX_ATTACH_BYTES) { setErr(`Image is ${fmtBytes(file.size)} — max allowed is 3 MB.`); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { setAttachment(reader.result as string); setAttachName(file.name); };
    reader.onerror = () => setErr("Could not read the image. Please try another file.");
    reader.readAsDataURL(file);
  }
  function clearAttachment() { setAttachment(null); setAttachName(""); if (fileRef.current) fileRef.current.value = ""; }

  async function handleSubmit() {
    if (!empId) { setErr("Please select your profile first."); return; }
    if (!category || !selectedCat) { setErr("Please select an issue type."); return; }
    if (!description.trim()) { setErr("Description is required."); return; }
    setErr("");

    // JIT auth gate: if not signed in, this opens the Google popup and only runs
    // the inner callback after a successful login. If already signed in, it runs
    // immediately. The verified identity is read from the token (auth user),
    // NOT from any client-typed field.
    const result = await executeProtectedAction(async (authUser) => {
      setSaving(true);
      try {
        const newReport: IssueReport = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          category: category as CategoryValue,
          solver: selectedCat.solver,
          description: description.trim(),
          attachment: attachment ?? null,
          status: "open",
          created_at: Date.now(),
          // tamper-proof: taken straight from the signed Google token
          submittedByEmail: authUser.email ?? "",
          submittedByUid: authUser.uid,
        };
        // arrayUnion APPENDS atomically server-side — never sends the whole array,
        // so a client can't wipe/shrink it. With merge:true this same call both
        // creates the doc (first report) and appends to it (later reports). The
        // security rule still verifies lastWriterEmail == token email and that the
        // reports array only grows.
        await setDoc(doc(db, "issues", empId), {
          emp_id: empId,
          emp_name: empName || empId,
          // doc-level verified writer + server time — the fields the rules enforce
          lastWriterEmail: authUser.email ?? "",
          lastWriterUid: authUser.uid,
          updatedAt: serverTimestamp(),
          reports: arrayUnion(newReport),
        }, { merge: true });

        // Best-effort: link this Google email to the chosen employee record so HR
        // can see who logged in. Never blocks the submit if it fails.
        try {
          await setDoc(
            doc(db, "employees", empId),
            { google_email: authUser.email ?? "", google_uid: authUser.uid },
            { merge: true }
          );
        } catch (linkErr) {
          console.warn("[ReportIssue] could not link google email to employee:", linkErr);
        }

        onSaved?.(`Issue reported to ${selectedCat.solver}.`);
        resetForm(); setMode("list");
        await loadReports(empId);
      } catch (e) {
        console.error(e); setErr("Could not submit your report. Please try again.");
      } finally {
        setSaving(false);
      }
    });

    // Login was cancelled or failed → surface a friendly message, keep the form open.
    if (!result.ok) setErr(result.message);
  }

  if (!open) return null;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(2,6,23,0.7)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: "'Sora',sans-serif",
    }}>
      <div onClick={e => e.stopPropagation()} className="rep-modal" style={{
        width: "min(520px,100%)", maxHeight: "90vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: `linear-gradient(160deg,${SURF2} 0%,${BG} 100%)`,
        border: `1px solid ${BORDER}`, borderRadius: 18,
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
      }}>
        <style>{`
          .rep-scroll { scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.35) transparent; }
          .rep-scroll::-webkit-scrollbar { width: 6px; }
          .rep-scroll::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
          .rep-scroll::-webkit-scrollbar-thumb { background: linear-gradient(180deg,#60A5FA,#6366F1); border-radius: 6px; border: 1px solid rgba(11,19,64,0.6); }
          .rep-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg,#93C5FD,#818CF8); }
          @keyframes rep-row-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          .rep-row-anim { animation: rep-row-in 0.22s ease both; }
          .rep-close:hover { background: rgba(248,113,113,0.12) !important; border-color: rgba(248,113,113,0.4) !important; color: #F87171 !important; }
        `}</style>

        {/* ── pinned header (does not scroll) ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "rgba(248,113,113,0.08)", border: `1px solid ${RED}33`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4m0 4h.01M10.3 3.86l-8.4 14.55A1.5 1.5 0 003.2 21h17.6a1.5 1.5 0 001.3-2.59L13.7 3.86a1.5 1.5 0 00-2.6 0z" stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.2 }}>Report an Issue</h2>
              <p style={{ fontSize: 10, color: SUB, margin: "2px 0 0" }}>Raise a problem — it routes to the right person.</p>
            </div>
          </div>
          <button onClick={onClose} className="rep-close" style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`,
            background: SURF, color: SUB, cursor: "pointer", fontSize: 16, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            transition: "all 0.14s",
          }}>×</button>
        </div>

        {/* ── scrollable body (identity bar + list/form/picker all scroll here) ── */}
        <div className="rep-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>

        {/* identity bar */}
        {empId && mode !== "picker" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
            background: "rgba(99,102,241,0.06)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "8px 10px",
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
            <EmployeePicker employees={employees} loading={loadingEmps}
              onSelect={chooseProfile} onClose={() => { if (empId) setMode("list"); else onClose(); }} />
          </>
        ) : mode === "list" ? (
          <>
            <button onClick={() => { resetForm(); setMode("form"); }} disabled={!empId} style={{
              width: "100%", padding: "10px", borderRadius: 10, border: "none",
              background: empId ? RED : "rgba(248,113,113,0.25)", color: empId ? "#1a0606" : "rgba(255,255,255,0.5)",
              fontSize: 12.5, fontWeight: 700, cursor: empId ? "pointer" : "not-allowed",
              marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke={empId ? "#1a0606" : "rgba(255,255,255,0.5)"} strokeWidth="2.4" strokeLinecap="round"/>
              </svg>
              Report New Issue
            </button>

            {/* list header with count */}
            {!loading && reports.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 2px 10px" }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: SUB, letterSpacing: 0.8, textTransform: "uppercase" }}>
                  Your reports
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: BLUE,
                  background: `${BLUE}18`, border: `1px solid ${BLUE}33`,
                  borderRadius: 20, padding: "1px 8px",
                }}>{reports.length}</span>
                <div style={{ flex: 1, height: 1, background: "rgba(99,102,241,0.12)" }} />
              </div>
            )}

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ height: 80, borderRadius: 12, background: SURF, opacity: 0.5 }} />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0 36px", color: SUB }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", margin: "0 auto 12px",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
                  background: "rgba(99,102,241,0.08)", border: `1px solid ${BORDER}`,
                }}>🛟</div>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, margin: "0 0 3px" }}>No issues reported yet</p>
                <p style={{ fontSize: 11, color: SUB, margin: 0 }}>Tap “Report New Issue” above to raise one.</p>
              </div>
            ) : reports.map((r, i) => <ReportRow key={r.id} r={r} index={i} />)}

            {err && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", borderRadius: 10, padding: "8px 12px", fontSize: 11.5, marginTop: 12 }}>⚠ {err}</div>
            )}
          </>
        ) : (
          <>
            {/* category — mandatory buttons (own scroll region so the list of types
                doesn't push the rest of the form down) */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Issue type <span style={{ color: RED }}>*</span></label>
              <div className="rep-scroll" style={{
                display: "flex", flexDirection: "column", gap: 7,
                maxHeight: 196, overflowY: "auto",
                padding: 2, paddingRight: 6,
                border: `1px solid ${BORDER}`, borderRadius: 12,
                background: "rgba(99,102,241,0.03)",
              }}>
                {CATEGORIES.map(c => {
                  const on = category === c.value;
                  return (
                    <button key={c.value} onClick={() => setCategory(c.value)} style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 10,
                      border: `1px solid ${on ? RED + "66" : BORDER}`, background: on ? `${RED}12` : SURF,
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${on ? RED : BORDER}`, background: on ? RED : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{on && <span style={{ width: 6, height: 6, borderRadius: "50%", background: BG }} />}</span>
                      <span style={{ flex: 1, color: on ? "#fecaca" : TEXT, fontSize: 12.5, fontWeight: on ? 700 : 500 }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 9, color: DIM, display: "block", marginTop: 5, paddingLeft: 2 }}>
                Scroll to see all {CATEGORIES.length} types · pick the closest match.
              </span>
            </div>

            {/* solver preview */}
            {selectedCat && (
              <div style={{
                display: "flex", alignItems: "center", gap: 9, marginBottom: 14,
                background: "rgba(99,102,241,0.06)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 11px",
              }}>
                <span style={{ fontSize: 15 }}>🧑‍💼</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: SUB, letterSpacing: 0.6, textTransform: "uppercase" }}>Will be seen & solved by</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>{selectedCat.solver}</div>
                </div>
              </div>
            )}

            {/* description — mandatory */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description <span style={{ color: RED }}>*</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Describe the issue clearly…" maxLength={400} rows={4}
                style={{ ...fieldStyle, resize: "vertical", minHeight: 80, lineHeight: 1.5 }} />
              <span style={{ fontSize: 9.5, color: DIM, display: "block", marginTop: 4, textAlign: "right" }}>{description.length}/400</span>
            </div>

            {/* attachment — optional */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Attachment <span style={{ color: DIM, fontWeight: 500 }}>(optional · image · max 3 MB)</span></label>
              {attachment ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8, background: SURF }}>
                  <img src={attachment} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachName || "image"}</span>
                  <button onClick={clearAttachment} style={{ fontSize: 10, fontWeight: 600, color: RED, background: "transparent", border: `1px solid ${RED}33`, borderRadius: 8, padding: "4px 9px", cursor: "pointer", flexShrink: 0 }}>Remove</button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", color: SUB, borderStyle: "dashed" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke={SUB} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Upload image
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
            </div>

            {err && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5", borderRadius: 10, padding: "8px 12px", fontSize: 11.5, marginBottom: 12 }}>⚠ {err}</div>
            )}

            {/* verified identity / login hint */}
            <div style={{
              display: "flex", alignItems: "center", gap: 7, marginBottom: 10,
              fontSize: 10.5, color: SUB,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M12 11a4 4 0 100-8 4 4 0 000 8z" stroke={user ? GREEN : DIM} strokeWidth="1.8"/>
                <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" stroke={user ? GREEN : DIM} strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              {user ? (
                <span>Signed in as <span style={{ color: GREEN, fontWeight: 700 }}>{user.email}</span></span>
              ) : (
                <span>You'll sign in with Google when you submit — for a verified, tamper-proof record.</span>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={() => { setMode("list"); setErr(""); }} disabled={saving || signingIn} style={{
                flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${BORDER}`,
                background: SURF, color: SUB, fontSize: 12.5, fontWeight: 600,
                cursor: (saving || signingIn) ? "not-allowed" : "pointer", opacity: (saving || signingIn) ? 0.6 : 1,
              }}>Back</button>
              <button onClick={handleSubmit} disabled={!canSave || signingIn} style={{
                flex: 2, padding: "10px", borderRadius: 10, border: "none",
                background: (canSave && !signingIn) ? RED : "rgba(248,113,113,0.25)",
                color: (canSave && !signingIn) ? "#1a0606" : "rgba(255,255,255,0.5)",
                fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3,
                cursor: (canSave && !signingIn) ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
                {signingIn
                  ? "Signing in…"
                  : saving
                  ? "Submitting…"
                  : user
                  ? "Submit Report"
                  : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M21.8 12.2c0-.7-.06-1.4-.18-2.05H12v3.9h5.5a4.7 4.7 0 01-2.04 3.08v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.49z" fill="#1a0606"/>
                        <path d="M12 22c2.76 0 5.07-.92 6.76-2.48l-3.3-2.56c-.92.62-2.1.98-3.46.98-2.66 0-4.92-1.8-5.73-4.22H2.86v2.64A10 10 0 0012 22z" fill="#1a0606"/>
                      </svg>
                      Sign in &amp; Submit
                    </>
                  )}
              </button>
            </div>
          </>
        )}
        </div>{/* ── end scrollable body ── */}
      </div>
    </div>
  );
}
