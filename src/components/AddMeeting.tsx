import { useState, useEffect, useMemo, useRef } from "react";
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useJITAuth } from "../hooks/useJITAuth";

// ─── theme ───────────────────────────────────────────────────────────────────
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

// ─── range (matches your dashboard) ────────────────────────────────────────────
const RANGE_MIN = "2026-03-02";
const RANGE_MAX = "2026-12-31";

interface Emp {
  emp_id: string;
  name: string;
  department: string;
  type: string;
  email?: string;          // company email (optional)
  profile_image?: string;
}

interface AddMeetingProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

const toMins = (t: string) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const addMins = (t: string, mins: number) => {
  const total = toMins(t) + mins;
  const h = Math.floor(total / 60), m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const initials = (n: string) => n.split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const clampDate = (d: string) => (d < RANGE_MIN ? RANGE_MIN : d > RANGE_MAX ? RANGE_MAX : d);

export default function AddMeeting({ open, onClose, onSaved }: AddMeetingProps) {
  // JIT Google auth — login required to log a meeting (UI gate; the attendance day
  // collection stays open so face-scan check-ins / AdminPanel keep working).
  const { user, signingIn, executeProtectedAction } = useJITAuth();

  const [emps, setEmps]         = useState<Emp[]>([]);
  const [loadingEmps, setLoad]  = useState(false);
  const [selected, setSelected] = useState<Emp | null>(null);
  const [pickerOpen, setPicker] = useState(false);
  const [search, setSearch]     = useState("");

  const [date,  setDate]  = useState(clampDate(todayStr()));
  const [start, setStart] = useState("");
  const [end,   setEnd]   = useState("");
  const [title, setTitle] = useState("");

  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const pickerRef = useRef<HTMLDivElement>(null);

  // load employees when opened
  useEffect(() => {
    if (!open) return;
    setLoad(true);
    getDocs(collection(db, "employees"))
      .then(snap => {
        const list = snap.docs.map(d => d.data() as Emp);
        const order = ["CDAI", "CDIN", "CDCN"];
        list.sort((a, b) => {
          const ga = order.findIndex(g => a.emp_id.startsWith(g));
          const gb = order.findIndex(g => b.emp_id.startsWith(g));
          if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
          return a.name.localeCompare(b.name);
        });
        setEmps(list);
      })
      .catch(() => setErr("Could not load employees."))
      .finally(() => setLoad(false));
  }, [open]);

  // reset on open/close
  useEffect(() => {
    if (open) {
      setSelected(null); setSearch(""); setPicker(false);
      setDate(clampDate(todayStr())); setStart(""); setEnd("");
      setTitle(""); setErr(""); setSaving(false);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // close picker on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPicker(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // auto-suggest a 30-min end when start is chosen
  useEffect(() => {
    if (start && !end) setEnd(addMins(start, 30));
  }, [start]); // eslint-disable-line

  const durMins = start && end ? toMins(end) - toMins(start) : 0;
  const durValid = durMins > 0 && durMins <= 60;
const canSave = !!selected && !!date && !!start && !!end && durValid && title.trim().length > 0 && !saving;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return emps;
    return emps.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.emp_id.toLowerCase().includes(q) ||
      (e.department || "").toLowerCase().includes(q) ||
      (e.email || "").toLowerCase().includes(q)
    );
  }, [emps, search]);

  async function handleSave() {
    if (!selected) return;
    if (!title.trim()) { setErr("Please enter the purpose."); return; }
    if (!durValid) { setErr("Meeting must be between 1 and 60 minutes."); return; }
    setErr("");

    // JIT auth gate: opens the Google popup if not signed in, then saves. The
    // meeting session is stamped with the verified email for the audit trail.
    const result = await executeProtectedAction(async (authUser) => {
      setSaving(true);
      try {
        const ref = doc(db, selected.emp_id, date);
        const snap = await getDoc(ref);
        const existing: any[] = snap.exists() ? ((snap.data().sessions as any[]) || []) : [];
        const newSession = {
          session: existing.length + 1,
          check_in: `${start}:00`,
          check_out: `${end}:00`,
          meeting: true,
          ...(title.trim() ? { meeting_purpose: title.trim() } : {}),
          // verified who logged this meeting
          logged_by_email: authUser.email ?? "",
        };
        await setDoc(ref, {
          sessions: [...existing, newSession],
          lastWriterEmail: authUser.email ?? "",
          updatedAt: serverTimestamp(),
        }, { merge: true });
        onSaved?.(`Meeting added for ${selected.name} on ${date} (${start}–${end}).`);
        onClose();
      } catch (e) {
        console.error(e);
        setErr("Could not save the meeting. Please try again.");
      } finally {
        setSaving(false);
      }
    });
    if (!result.ok) setErr(result.message);
  }

  if (!open) return null;

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: 10,
    border: `1px solid ${BORDER}`, background: SURF, color: TEXT,
    fontSize: 12.5, outline: "none", fontFamily: "'Sora',sans-serif", caretColor: YELLOW,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 9.5, fontWeight: 700, color: SUB, letterSpacing: 0.6,
    textTransform: "uppercase", display: "block", marginBottom: 6,
  };

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
        style={{
          width: "min(440px,100%)", maxHeight: "90vh", overflowY: "auto",
          background: `linear-gradient(160deg,${SURF2} 0%,${BG} 100%)`,
          border: `1px solid ${BORDER}`, borderRadius: 18,
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)", padding: 22,
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "rgba(255,215,0,0.08)", border: `1px solid ${YELLOW}33`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="16" rx="2" stroke={YELLOW} strokeWidth="1.8"/>
                <path d="M16 3v4M8 3v4M3 10h18M12 13v4M10 15h4" stroke={YELLOW} strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0, lineHeight: 1.2 }}>Add Meeting</h2>
              <p style={{ fontSize: 10, color: SUB, margin: "2px 0 0" }}>Logs off-floor meeting time as worked hours</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`,
            background: SURF, color: SUB, cursor: "pointer", fontSize: 16, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* employee picker */}
        <div ref={pickerRef} style={{ position: "relative", marginBottom: 14 }}>
          <label style={labelStyle}>Employee</label>
          <button
            onClick={() => setPicker(o => !o)}
            style={{ ...fieldStyle, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left", minHeight: 46 }}
          >
            {selected ? (
              <>
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0, overflow: "hidden",
                  background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {selected.profile_image
                    ? <img src={selected.profile_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 10, fontWeight: 700, color: SUB }}>{initials(selected.name)}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {selected.name}
                  </div>
                  {/* email if present, else nothing */}
                  {selected.email
                    ? <div style={{ fontSize: 10, color: SUB, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.email}</div>
                    : null}
                </div>
                <span style={{ fontSize: 9.5, color: DIM, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{selected.emp_id}</span>
              </>
            ) : (
              <span style={{ color: SUB }}>{loadingEmps ? "Loading employees…" : "Select an employee"}</span>
            )}
          </button>

          {pickerOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
              background: `linear-gradient(145deg,${SURF2},${BG})`, border: `1px solid ${BORDER}`,
              borderRadius: 12, boxShadow: "0 14px 40px rgba(0,0,0,0.6)", overflow: "hidden",
            }}>
              <div style={{ padding: 8, borderBottom: `1px solid ${BORDER}` }}>
                <input
                  autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, ID, email…"
                  style={{ ...fieldStyle, padding: "7px 10px", fontSize: 12 }}
                />
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <p style={{ color: SUB, fontSize: 12, textAlign: "center", padding: "18px 0", margin: 0 }}>No employees found</p>
                ) : filtered.map(e => (
                  <button key={e.emp_id}
                    onClick={() => { setSelected(e); setPicker(false); setSearch(""); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                      borderBottom: "1px solid rgba(99,102,241,0.08)",
                    }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(99,102,241,0.1)")}
                    onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0, overflow: "hidden",
                      background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {e.profile_image
                        ? <img src={e.profile_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ fontSize: 10, fontWeight: 700, color: SUB }}>{initials(e.name)}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                      {/* show email under name if it exists, else just the name */}
                      {e.email
                        ? <div style={{ fontSize: 9.5, color: SUB, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.email}</div>
                        : null}
                    </div>
                    <span style={{ fontSize: 9, color: DIM, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{e.emp_id}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* date */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} min={RANGE_MIN} max={RANGE_MAX}
            onChange={e => setDate(clampDate(e.target.value))}
            style={{ ...fieldStyle, colorScheme: "dark" }} />
        </div>

        {/* time */}
        <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start</label>
            <input type="time" value={start} onChange={e => setStart(e.target.value)}
              style={{ ...fieldStyle, colorScheme: "dark" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End</label>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)}
              style={{ ...fieldStyle, colorScheme: "dark" }} />
          </div>
        </div>

        {/* duration hint */}
        <div style={{ minHeight: 18, marginBottom: 12 }}>
          {start && end && (
            <span style={{
              fontSize: 10.5, fontWeight: 600,
              color: durValid ? "#4ADE80" : RED,
            }}>
              {durMins <= 0
                ? "End time must be after start time."
                : durMins > 60
                  ? `Too long (${durMins} min) — meetings are capped at 60 minutes.`
                  : `Duration: ${durMins} min`}
            </span>
          )}
          {!start && <span style={{ fontSize: 10.5, color: DIM }}>Max meeting length is 1 hour.</span>}
        </div>

        {/* purpose — required */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Purpose</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Client review, vendor discussion…"
            maxLength={80} style={fieldStyle} />
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
            : <span>You'll sign in with Google when you save — for a verified record.</span>}
        </div>

        {/* actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onClose} disabled={saving || signingIn}
            style={{
              flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${BORDER}`,
              background: SURF, color: SUB, fontSize: 12.5, fontWeight: 600,
              cursor: (saving || signingIn) ? "not-allowed" : "pointer", opacity: (saving || signingIn) ? 0.6 : 1,
            }}>Cancel</button>
          <button onClick={handleSave} disabled={!canSave || signingIn}
            style={{
              flex: 2, padding: "10px", borderRadius: 10, border: "none",
              background: (canSave && !signingIn) ? YELLOW : "rgba(255,215,0,0.25)",
              color: (canSave && !signingIn) ? BG : "rgba(6,13,46,0.6)",
              fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3,
              cursor: (canSave && !signingIn) ? "pointer" : "not-allowed",
            }}>
            {signingIn ? "Signing in…" : saving ? "Saving…" : user ? "Add Meeting" : "Sign in & Add"}
          </button>
        </div>
      </div>
    </div>
  );
}