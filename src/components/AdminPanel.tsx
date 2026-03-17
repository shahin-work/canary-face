import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};


const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

const ADMIN_PASS   = "555";
const SESSION_MINS = 30;
const SESS_KEY     = "cf_admin_ts";

const BG     = "#060D2E";
const SURF2  = "#0F1848";
const BORDER = "rgba(99,102,241,0.22)";
const TEXT   = "#EEF0FF";
const SUB    = "#8090C0";
const DIM    = "#3A4A7A";
const YELLOW = "#FFD700";
const RED    = "#F87171";
const GREEN  = "#4ADE80";
const BLUE   = "#60A5FA";
const PURPLE = "#C084FC";
const TEAL   = "#84fcfa";




function isAuthed() {
  const ts = localStorage.getItem(SESS_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts) < SESSION_MINS * 10 * 1000;
}

// function isAuthed() {
//   return true; // temp: password disabled
// }





function setAuth()  { localStorage.setItem(SESS_KEY, Date.now().toString()); }
function clearAuth(){ localStorage.removeItem(SESS_KEY); }

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function toTimeStr(d: Date) {
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:00`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [items, setItems] = useState<{id:number;msg:string;type:string}[]>([]);
  const add = useCallback((msg: string, type = "ok") => {
    const id = Date.now();
    setItems(p => [...p, { id, msg, type }]);
    setTimeout(() => setItems(p => p.filter(x => x.id !== id)), 3500);
  }, []);
  const remove = useCallback((id: number) => setItems(p => p.filter(x => x.id !== id)), []);
  return { items, add, remove };
}

function ToastContainer({ items, remove }: any) {
  return (
    <div style={{ position:"fixed", top:16, right:16, zIndex:9999, display:"flex", flexDirection:"column", gap:8 }}>
      {items.map((t: any) => (
        <div key={t.id} onClick={() => remove(t.id)} style={{
          background: t.type==="error" ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.12)",
          border: `1px solid ${t.type==="error" ? "rgba(248,113,113,0.5)" : "rgba(74,222,128,0.4)"}`,
          borderRadius:10, padding:"10px 14px", cursor:"pointer", minWidth:240, maxWidth:340,
          display:"flex", alignItems:"center", gap:8, backdropFilter:"blur(8px)",
        }}>
          <span style={{fontSize:15}}>{t.type==="error" ? "❌" : "✅"}</span>
          <span style={{color:TEXT, fontSize:12, lineHeight:1.4}}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: any) {
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:"linear-gradient(155deg,#0D1545 0%,#070F30 100%)",
        border:`1px solid ${BORDER}`, borderRadius:18,
        width:"100%", maxWidth: wide ? 720 : 520,
        maxHeight:"90vh", display:"flex", flexDirection:"column",
        boxShadow:"0 24px 80px rgba(0,0,0,0.75)",
      }}>
        <div style={{
          padding:"14px 20px", borderBottom:`1px solid ${BORDER}`,
          display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0,
        }}>
          <span style={{color:TEXT, fontWeight:700, fontSize:14}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:SUB,fontSize:22,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>×</button>
        </div>
        <div style={{flex:1, overflowY:"auto", padding:20}}>{children}</div>
      </div>
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Btn({ children, onClick, color=YELLOW, loading=false, small=false, outline=false, danger=false }: any) {
  const c = danger ? RED : color;
  return (
    <button onClick={onClick} disabled={loading} style={{
      background: outline ? "transparent" : c,
      color: outline ? c : BG,
      border:`1px solid ${c}`,
      borderRadius:8, padding: small ? "5px 11px" : "8px 16px",
      fontSize: small ? 11 : 12, fontWeight:700, cursor: loading ? "wait" : "pointer",
      opacity: loading ? 0.6 : 1, transition:"all 0.15s", fontFamily:"inherit",
      display:"inline-flex", alignItems:"center", gap:5, flexShrink:0,
    }}>
      {loading ? "⏳" : children}
    </button>
  );
}

function Label({ children }: any) {
  return <label style={{display:"block",color:SUB,fontSize:10,fontWeight:700,letterSpacing:0.8,marginBottom:5,textTransform:"uppercase"}}>{children}</label>;
}

function InputField({ label, value, onChange, placeholder, disabled, mono }: any) {
  return (
    <div style={{marginBottom:12}}>
      {label && <Label>{label}</Label>}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        disabled={disabled}
        style={{
          width:"100%", background: disabled ? "rgba(20,20,50,0.5)" : "rgba(99,102,241,0.07)",
          border:`1px solid ${BORDER}`, borderRadius:8, color: disabled ? DIM : TEXT,
          fontSize:12, padding:"8px 10px", outline:"none", boxSizing:"border-box",
          fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit",
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
    </div>
  );
}

// ── Time Picker ───────────────────────────────────────────────────────────────
function TimePicker({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) {
  // value format: HH:MM:00
  const parts = (value || "").split(":");
  const hh = parts[0] || "09";
  const mm = parts[1] || "00";

  function setH(v: string) { onChange(`${v}:${mm}:00`); }
  function setM(v: string) { onChange(`${hh}:${v}:00`); }

  const hours   = Array.from({length:24}, (_,i) => String(i).padStart(2,"0"));
  const minutes = Array.from({length:60}, (_,i) => String(i).padStart(2,"0"));

  return (
    <div style={{marginBottom:12}}>
      <Label>{label}</Label>
      <div style={{display:"flex", alignItems:"center", gap:6}}>
        {/* Hour */}
        <div style={{flex:1}}>
          <select value={hh} onChange={e => setH(e.target.value)} style={selectStyle}>
            {hours.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <span style={{color:SUB,fontWeight:700,fontSize:16}}>:</span>
        {/* Minute */}
        <div style={{flex:1}}>
          <select value={mm} onChange={e => setM(e.target.value)} style={selectStyle}>
            {minutes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <span style={{color:DIM,fontSize:11,flexShrink:0}}>:00</span> 
      </div>
      {value && (
        <div style={{marginTop:5, display:"flex", alignItems:"center", gap:6}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:GREEN,flexShrink:0}}/>
          <span style={{color:GREEN, fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700}}>{value}</span>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width:"100%", background:SURF2, border:`1px solid ${BORDER}`,
  borderRadius:8, color:TEXT, fontSize:13, padding:"7px 10px",
  outline:"none", fontFamily:"'JetBrains Mono',monospace", fontWeight:700,
  cursor:"pointer",
};

// ── Date Picker ───────────────────────────────────────────────────────────────
function DatePickerField({ label, value, onChange }: { label:string; value:string; onChange:(v:string)=>void }) {
  return (
    <div style={{marginBottom:12}}>
      <Label>{label}</Label>
      <div style={{display:"flex", gap:8, alignItems:"center"}}>
        <input type="date" value={value} onChange={e => onChange(e.target.value)}
          style={{
            flex:1, background:SURF2, border:`1px solid ${BORDER}`,
            borderRadius:8, color:TEXT, fontSize:12, padding:"7px 10px",
            outline:"none", fontFamily:"inherit", colorScheme:"dark",
          }}
        />
        <button onClick={() => onChange(toDateStr(new Date()))} style={{
          background:"rgba(255,215,0,0.1)", border:`1px solid ${YELLOW}44`,
          borderRadius:7, color:YELLOW, fontSize:10, fontWeight:700,
          padding:"7px 10px", cursor:"pointer", fontFamily:"inherit", flexShrink:0,
        }}>Today</button>
      </div>
      {value && (
        <div style={{marginTop:5}}>
          <span style={{color:YELLOW, fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700}}>{value}</span>
        </div>
      )}
    </div>
  );
}

// ── Session Card (inside date) ────────────────────────────────────────────────
function SessionCard({ s, idx, total, onChange, onDelete }: any) {
  const isOpen = !s.check_out;
  return (
    <div style={{
      background: isOpen ? "rgba(255,215,0,0.05)" : "rgba(99,102,241,0.06)",
      border:`1px solid ${isOpen ? YELLOW+"33" : BORDER}`,
      borderRadius:12, padding:"14px 14px 10px", marginBottom:10,
    }}>
      {/* header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{
            background: isOpen ? "rgba(255,215,0,0.15)" : "rgba(99,102,241,0.15)",
            border:`1px solid ${isOpen ? YELLOW+"44" : BORDER}`,
            borderRadius:20, padding:"2px 10px",
            color: isOpen ? YELLOW : SUB, fontSize:10, fontWeight:700,
          }}>
            SESSION {idx + 1}
          </div>
          {isOpen && (
            <span style={{
              background:"rgba(255,215,0,0.1)", border:`1px solid ${YELLOW}44`,
              borderRadius:20, padding:"1px 8px",
              color:YELLOW, fontSize:9, fontWeight:700,
            }}>⏳ OPEN</span>
          )}
        </div>
        {total > 1 && (
          <button onClick={onDelete} style={{
            background:"rgba(248,113,113,0.08)", border:`1px solid ${RED}33`,
            borderRadius:7, color:RED, fontSize:10, fontWeight:700,
            padding:"4px 9px", cursor:"pointer", fontFamily:"inherit",
          }}>✕ Remove</button>
        )}
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
        <TimePicker label="Check In" value={s.check_in || ""} onChange={v => onChange({...s, check_in: v})} />
        <div>
          <TimePicker label="Check Out" value={s.check_out || ""} onChange={v => onChange({...s, check_out: v || null})} />
          {!s.check_out && (
            <p style={{color:DIM,fontSize:10,marginTop:-6}}>Leave empty = still checked in</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit Date Modal ─────────────────────────────────────────────────────
function DateModal({ empId, initial, onSave, onClose, toast }: any) {
  const isEdit = !!initial;
  const [dateVal, setDateVal] = useState(initial?.id || toDateStr(new Date()));
  const [empName, setEmpName] = useState(initial?.employee_name || "");
  const [sessions, setSessions] = useState<any[]>(
    initial?.sessions?.length
      ? initial.sessions.map((s: any) => ({...s}))
      : [{ session: 1, check_in: toTimeStr(new Date()), check_out: null }]
  );
  const [saving, setSaving] = useState(false);

  function addSession() {
    setSessions(p => [...p, { session: p.length + 1, check_in: toTimeStr(new Date()), check_out: null }]);
  }

  function updateSession(i: number, val: any) {
    setSessions(p => p.map((s, idx) => idx === i ? val : s));
  }

  function deleteSession(i: number) {
    setSessions(p => p.filter((_, idx) => idx !== i).map((s, idx) => ({...s, session: idx + 1})));
  }

  async function save() {
    if (!dateVal) { toast("Date is required", "error"); return; }
    const hasBadSession = sessions.some(s => !s.check_in);
    if (hasBadSession) { toast("All sessions must have a check-in time", "error"); return; }
    setSaving(true);
    try {
      const cleanSessions = sessions.map((s, i) => ({
        session: i + 1,
        check_in: s.check_in,
        ...(s.check_out ? { check_out: s.check_out } : {}),
      }));
      await setDoc(doc(db, empId, dateVal), {
        employee_name: empName,
        sessions: cleanSessions,
      });
      toast(isEdit ? "Attendance updated ✓" : "Attendance record added ✓");
      onSave();
    } catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <>
      {/* Date — only show picker when adding */}
      {isEdit ? (
        <div style={{
          background:"rgba(255,215,0,0.07)", border:`1px solid ${YELLOW}33`,
          borderRadius:10, padding:"10px 14px", marginBottom:16,
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{fontSize:16}}>📅</span>
          <div>
            <div style={{color:DIM,fontSize:9,fontWeight:700,letterSpacing:0.8}}>DATE</div>
            <div style={{color:YELLOW,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:14}}>{dateVal}</div>
          </div>
        </div>
      ) : (
        <DatePickerField label="Date *" value={dateVal} onChange={setDateVal} />
      )}

      <InputField label="Employee Name (optional)" value={empName} onChange={setEmpName} placeholder="e.g. Arunraj R" />

      {/* Sessions */}
      <div style={{marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <Label>Sessions ({sessions.length})</Label>
          <button onClick={addSession} style={{
            background:"rgba(74,222,128,0.1)", border:`1px solid ${GREEN}44`,
            borderRadius:8, color:GREEN, fontSize:11, fontWeight:700,
            padding:"5px 12px", cursor:"pointer", fontFamily:"inherit",
            display:"flex", alignItems:"center", gap:5,
          }}>
            + Add Session
          </button>
        </div>

        {sessions.map((s, i) => (
          <SessionCard key={i} s={s} idx={i} total={sessions.length}
            onChange={(v: any) => updateSession(i, v)}
            onDelete={() => deleteSession(i)}
          />
        ))}
      </div>

      {/* Summary */}
      <div style={{
        background:"rgba(99,102,241,0.06)", border:`1px solid ${BORDER}`,
        borderRadius:10, padding:"10px 14px", marginBottom:16,
      }}>
        <div style={{color:SUB,fontSize:10,fontWeight:700,letterSpacing:0.8,marginBottom:6}}>SUMMARY</div>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <div><span style={{color:DIM,fontSize:11}}>Total sessions: </span><span style={{color:TEXT,fontWeight:700,fontSize:11}}>{sessions.length}</span></div>
          <div><span style={{color:DIM,fontSize:11}}>Open: </span><span style={{color:YELLOW,fontWeight:700,fontSize:11}}>{sessions.filter(s=>!s.check_out).length}</span></div>
          <div><span style={{color:DIM,fontSize:11}}>Closed: </span><span style={{color:GREEN,fontWeight:700,fontSize:11}}>{sessions.filter(s=>s.check_out).length}</span></div>
        </div>
      </div>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <Btn outline color={SUB} onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} loading={saving}>{isEdit ? "💾 Update Record" : "✅ Add Record"}</Btn>
      </div>
    </>
  );
}

// ── Quick Check-in Modal ──────────────────────────────────────────────────────
function QuickCheckinModal({ empId, existingDate, onSave, onClose, toast }: any) {
  // existingDate: { id, employee_name, sessions } | null
  const [dateVal, setDateVal] = useState(existingDate?.id || toDateStr(new Date()));
  const [checkIn, setCheckIn] = useState(toTimeStr(new Date()));
  const [saving, setSaving]   = useState(false);

  async function save() {
    if (!checkIn) { toast("Check-in time required", "error"); return; }
    setSaving(true);
    try {
      const existing = existingDate;
      const newSession = {
        session: existing ? existing.sessions.length + 1 : 1,
        check_in: checkIn,
      };
      const sessions = existing ? [...existing.sessions, newSession] : [newSession];
      await setDoc(doc(db, empId, dateVal), {
        employee_name: existing?.employee_name || "",
        sessions,
      });
      toast("Check-in recorded ✓");
      onSave();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div style={{
        background:"rgba(74,222,128,0.07)", border:`1px solid ${GREEN}33`,
        borderRadius:12, padding:"12px 16px", marginBottom:18,
        display:"flex", alignItems:"center", gap:10,
      }}>
        <span style={{fontSize:22}}>🟢</span>
        <div>
          <div style={{color:GREEN,fontWeight:700,fontSize:13}}>Quick Check-In</div>
          <div style={{color:SUB,fontSize:11}}>Records a new open session (no check-out)</div>
        </div>
      </div>

      {!existingDate ? (
        <DatePickerField label="Date *" value={dateVal} onChange={setDateVal} />
      ) : (
        <div style={{
          background:"rgba(255,215,0,0.07)", border:`1px solid ${YELLOW}33`,
          borderRadius:10, padding:"8px 14px", marginBottom:16,
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span>📅</span>
          <span style={{color:YELLOW,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{dateVal}</span>
          <span style={{color:DIM,fontSize:11,marginLeft:4}}>· Session {(existingDate.sessions?.length||0)+1}</span>
        </div>
      )}

      <TimePicker label="Check-In Time *" value={checkIn} onChange={setCheckIn} />

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn outline color={SUB} onClick={onClose}>Cancel</Btn>
        <Btn color={GREEN} onClick={save} loading={saving}>✅ Check In</Btn>
      </div>
    </>
  );
}

// ── Quick Check-out Modal ─────────────────────────────────────────────────────
function QuickCheckoutModal({ empId, dateDoc, openSessionIdx, onSave, onClose, toast }: any) {
  const [checkOut, setCheckOut] = useState(toTimeStr(new Date()));
  const [saving, setSaving]     = useState(false);
  const openSession             = dateDoc.sessions[openSessionIdx];

  async function save() {
    if (!checkOut) { toast("Check-out time required", "error"); return; }
    setSaving(true);
    try {
      const sessions = dateDoc.sessions.map((s: any, i: number) =>
        i === openSessionIdx ? { ...s, check_out: checkOut } : s
      );
      await updateDoc(doc(db, empId, dateDoc.id), { sessions });
      toast("Check-out recorded ✓");
      onSave();
    } catch (e: any) { toast("Failed: " + e.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div style={{
        background:"rgba(248,113,113,0.07)", border:`1px solid ${RED}33`,
        borderRadius:12, padding:"12px 16px", marginBottom:18,
        display:"flex", alignItems:"center", gap:10,
      }}>
        <span style={{fontSize:22}}>🔴</span>
        <div>
          <div style={{color:RED,fontWeight:700,fontSize:13}}>Quick Check-Out</div>
          <div style={{color:SUB,fontSize:11}}>Closes the open session for {dateDoc.id}</div>
        </div>
      </div>

      <div style={{
        background:"rgba(99,102,241,0.06)", border:`1px solid ${BORDER}`,
        borderRadius:10, padding:"10px 14px", marginBottom:16,
      }}>
        <div style={{color:DIM,fontSize:10,marginBottom:4}}>OPEN SESSION</div>
        <div style={{display:"flex",gap:16}}>
          <div><span style={{color:DIM,fontSize:11}}>Session: </span><span style={{color:TEXT,fontWeight:700}}>#{openSession.session}</span></div>
          <div><span style={{color:DIM,fontSize:11}}>Checked in: </span><span style={{color:GREEN,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{openSession.check_in}</span></div>
        </div>
      </div>

      <TimePicker label="Check-Out Time *" value={checkOut} onChange={setCheckOut} />

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <Btn outline color={SUB} onClick={onClose}>Cancel</Btn>
        <Btn color={RED} onClick={save} loading={saving}>🔴 Check Out</Btn>
      </div>
    </>
  );
}

// ── Employee Form ─────────────────────────────────────────────────────────────
function EmployeeForm({ initial, onSave, onClose, toast }: any) {
  const isEdit = !!initial?.emp_id;
  const [form, setForm] = useState({
    emp_id:        initial?.emp_id        || "",
    name:          initial?.name          || "",
    department:    initial?.department    || "",
    type:          initial?.type          || "permanent",
    created_at:    initial?.created_at    || new Date().toISOString(),
    profile_image: initial?.profile_image || "",
  });
  const [saving, setSaving] = useState(false);
  const f = (k: string) => (v: string) => setForm(p => ({...p, [k]: v}));

  async function save() {
    if (!form.emp_id || !form.name) { toast("emp_id and name required", "error"); return; }
    setSaving(true);
    try {
      await setDoc(doc(db, "employees", form.emp_id), form);
      if (!isEdit) {
        await setDoc(doc(db, form.emp_id, "_init"), { created_at: new Date().toISOString() });
      }
      toast(isEdit ? "Employee updated ✓" : "Employee added ✓");

      onSave(form);
    } catch (e: any) { toast("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  }

  const TYPE_COLORS: Record<string,string> = { permanent:YELLOW, consultant:BLUE, intern: PURPLE, guest:TEAL};

  return (
    <>
      <div style={{marginBottom:12}}>
        <Label>EMP ID {!isEdit && "*"}</Label>
        <input disabled={isEdit} value={form.emp_id} onChange={e => f("emp_id")(e.target.value)}
          style={{
            width:"100%", background: isEdit ? "rgba(20,20,50,0.5)" : "rgba(99,102,241,0.07)",
            border:`1px solid ${isEdit ? DIM : BORDER}`, borderRadius:8,
            color: isEdit ? DIM : TEXT, fontSize:12, padding:"8px 10px",
            outline:"none", boxSizing:"border-box", fontFamily:"'JetBrains Mono',monospace",
            cursor: isEdit ? "not-allowed" : "text",
          }} />
        {isEdit && <p style={{color:DIM,fontSize:10,marginTop:3}}>Employee ID cannot be changed</p>}
      </div>

      <InputField label="Name *" value={form.name} onChange={f("name")} />
      <InputField label="Department" value={form.department} onChange={f("department")} />

      <div style={{marginBottom:12}}>
        <Label>Type</Label>
        <div style={{display:"flex",gap:8}}>
          {["permanent","consultant","intern","guest"].map(t => (
            <button key={t} onClick={() => f("type")(t)} style={{
              flex:1, padding:"7px 0", borderRadius:8, border:`1px solid ${form.type===t ? TYPE_COLORS[t]+"88" : BORDER}`,
              background: form.type===t ? TYPE_COLORS[t]+"18" : "transparent",
              color: form.type===t ? TYPE_COLORS[t] : SUB,
              fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
              textTransform:"capitalize",
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{marginBottom:12}}>
        <Label>Profile Image</Label>
        {form.profile_image && (
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <img src={form.profile_image.startsWith("data:") ? form.profile_image : `data:image/jpeg;base64,${form.profile_image}`}
              style={{width:48,height:48,borderRadius:"50%",objectFit:"cover",border:`2px solid ${YELLOW}55`}}
              onError={e => {(e.currentTarget as HTMLImageElement).style.display="none";}} />
            <button onClick={() => setForm(p => ({...p, profile_image:""}))}
              style={{background:"none",border:"none",color:RED,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
              ✕ Remove
            </button>
          </div>
        )}
        <input type="file" accept="image/*"
          onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onloadend = () => setForm(p => ({...p, profile_image: reader.result as string}));
            reader.readAsDataURL(file);
          }}
          style={{
            width:"100%", background:"rgba(99,102,241,0.07)", border:`1px solid ${BORDER}`,
            borderRadius:8, color:SUB, fontSize:11, padding:"7px 10px", cursor:"pointer", boxSizing:"border-box",
          }} />
      </div>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
        <Btn outline color={SUB} onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} loading={saving}>{isEdit ? "💾 Update" : "✅ Add Employee"}</Btn>
      </div>
    </>
  );
}

// ── Employees Tab ─────────────────────────────────────────────────────────────
function EmployeesTab({ toast }: any) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState<any>(null);
  const [expanded, setExpanded]   = useState<string|null>(null);

  const TYPE_COLORS: Record<string,string> = { permanent:YELLOW, consultant:BLUE, intern:PURPLE, guest:TEAL};

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "employees"));
      setEmployees(snap.docs.map(d => d.data()));
    } catch (e: any) { toast("Load failed: " + e.message, "error"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function del(empId: string) {
    if (!confirm(`Delete employee ${empId}?`)) return;
    try {
      await deleteDoc(doc(db, "employees", empId));
      toast("Employee deleted");
      setEmployees(p => p.filter(e => e.emp_id !== empId));
    } catch (e: any) { toast("Delete failed", "error"); }
  }

  const filtered = employees.filter(e =>
    !search || [e.name, e.emp_id, e.department].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{flex:1,minWidth:180,position:"relative"}}>
          <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}} width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke={DIM} strokeWidth="2.2"/>
            <path d="M21 21l-4.35-4.35" stroke={DIM} strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          <input placeholder="Search name, ID, dept…" value={search} onChange={e => setSearch(e.target.value)}
            style={{width:"100%",paddingLeft:30,background:SURF2,border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:12,padding:"7px 10px 7px 30px",outline:"none"}} />
        </div>
        <Btn onClick={() => setModal({type:"add"})}>+ Add Employee</Btn>
        <Btn outline color={SUB} onClick={load} loading={loading}>↻</Btn>
      </div>

      <div style={{color:SUB,fontSize:11,marginBottom:10}}>{filtered.length} employees</div>

      {loading ? (
        <div style={{color:DIM,padding:20}}>Loading…</div>
      ) : filtered.map(emp => {
        const isOpen = expanded === emp.emp_id;
        const tc = TYPE_COLORS[emp.type] || YELLOW;
        return (
          <div key={emp.emp_id} style={{
            background:SURF2, border:`1px solid ${isOpen ? tc+"44" : BORDER}`,
            borderRadius:12, marginBottom:6, overflow:"hidden", transition:"border 0.15s",
          }}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer"}}
              onClick={() => setExpanded(isOpen ? null : emp.emp_id)}>
              <div style={{
                width:36,height:36,borderRadius:"50%",flexShrink:0,overflow:"hidden",
                background:BG,border:`1.5px solid ${tc}55`,
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                {emp.profile_image
                  ? <img src={emp.profile_image} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                  : <span style={{color:tc,fontWeight:700,fontSize:12}}>
                      {(emp.name||"?").split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()}
                    </span>
                }
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:TEXT,fontWeight:600,fontSize:13}}>{emp.name}</div>
                <div style={{color:DIM,fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>
                  {emp.emp_id} · <span style={{color:SUB}}>{emp.department}</span>
                </div>
              </div>
              <span style={{fontSize:9,fontWeight:700,color:tc,background:tc+"18",border:`1px solid ${tc}44`,borderRadius:20,padding:"2px 8px",textTransform:"capitalize"}}>{emp.type||"—"}</span>
              <span style={{color:DIM,fontSize:13,marginLeft:4}}>{isOpen?"▲":"▼"}</span>
            </div>
            {isOpen && (
              <div style={{padding:"0 14px 14px",borderTop:`1px solid ${BORDER}`}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 12px",margin:"10px 0"}}>
                  {Object.entries(emp).filter(([k])=>k!=="profile_image").map(([k,v])=>(
                    <div key={k} style={{fontSize:11}}>
                      <span style={{color:DIM}}>{k}: </span>
                      <span style={{color:TEXT}}>{String(v)}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <Btn small onClick={() => setModal({type:"edit",data:emp})}>✏️ Edit</Btn>
                  <Btn small outline danger onClick={() => del(emp.emp_id)}>🗑 Delete</Btn>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {modal?.type==="add" && (
        <Modal title="Add Employee" onClose={() => setModal(null)}>
          <EmployeeForm onSave={(e:any) => { setEmployees(p=>[...p,e]); setModal(null); }} onClose={() => setModal(null)} toast={toast} />
        </Modal>
      )}
      {modal?.type==="edit" && (
        <Modal title={`Edit · ${modal.data.emp_id}`} onClose={() => setModal(null)}>
          <EmployeeForm initial={modal.data}
            onSave={(e:any) => { setEmployees(p=>p.map((x:any)=>x.emp_id===e.emp_id?e:x)); setModal(null); }}
            onClose={() => setModal(null)} toast={toast} />
        </Modal>
      )}
    </div>
  );
}

// ── Attendance Tab ────────────────────────────────────────────────────────────
function AttendanceTab({ toast }: any) {
  const [empIds, setEmpIds]     = useState<string[]>([]);
  const [selEmp, setSelEmp]     = useState("");
  const [dates, setDates]       = useState<any[]>([]);
  const [loadingEmps, setLE]    = useState(true);
  const [loadingDates, setLD]   = useState(false);
  const [expanded, setExpanded] = useState<string|null>(null);
  const [modal, setModal]       = useState<any>(null);



  // ← ADD HERE
  const [dbLive, setDbLive]       = useState<boolean | null>(null);
  const [togglingDb, setTogglingDb] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "settings"));
        const settingsDoc = snap.docs.find(d => d.id === "app");
        if (settingsDoc) setDbLive(settingsDoc.data().live ?? false);
      } catch (_) {}
    })();
  }, []);

    async function toggleDbLive() {
    setTogglingDb(true);
    try {
      const newVal = !dbLive;
      await setDoc(doc(db, "settings", "app"), { live: newVal }, { merge: true });
      setDbLive(newVal);
      toast(`System set to ${newVal ? "LIVE 🟢" : "OFFLINE 🔴"}`);
    } catch (e: any) { toast("Toggle failed: " + e.message, "error"); }
    finally { setTogglingDb(false); }
  }

  async function loadEmps() {
    setLE(true);
    try {
      const snap = await getDocs(collection(db, "employees"));
      setEmpIds(snap.docs.map(d => d.id).sort());
    } catch (e: any) { toast("Load failed", "error"); }
    finally { setLE(false); }
  }

  useEffect(() => { loadEmps(); }, []);

  async function loadDates(empId: string) {
    setLD(true); setDates([]);
    try {
      const snap = await getDocs(collection(db, empId));
      const docs = snap.docs.map(d => ({id:d.id, ...d.data()}));
      docs.sort((a:any,b:any) => b.id.localeCompare(a.id));
      setDates(docs);
    } catch (e: any) { toast("Load dates failed", "error"); }
    finally { setLD(false); }
  }

  function selectEmp(id: string) {
    setSelEmp(id); setDates([]); setExpanded(null); setModal(null);
    if (id) loadDates(id);
  }

  async function deleteDate(dateId: string) {
    if (!confirm(`Delete ${selEmp}/${dateId}?`)) return;
    try {
      await deleteDoc(doc(db, selEmp, dateId));
      toast("Record deleted");
      setDates(p => p.filter((d:any) => d.id !== dateId));
    } catch (e: any) { toast("Delete failed", "error"); }
  }

  const todayDoc = dates.find((d:any) => d.id === toDateStr(new Date()));
  const openSession = todayDoc?.sessions?.findIndex((s:any) => !s.check_out);

  return (
    <div style={{display:"flex",gap:14,height:"calc(100vh - 180px)",minHeight:500}}>
      {/* ── Left: employee list ── */}
      <div style={{
        width:130,flexShrink:0,background:SURF2,border:`1px solid ${BORDER}`,
        borderRadius:12,overflowY:"auto",padding:8,
      }}>
        <div style={{color:SUB,fontSize:10,fontWeight:700,letterSpacing:0.8,padding:"4px 6px 8px"}}>
          EMPLOYEES ({empIds.length})
        </div>
        {loadingEmps
          ? <p style={{color:DIM,fontSize:11,padding:"0 6px"}}>Loading…</p>
          : empIds.map(id => (
            <div key={id} onClick={() => selectEmp(id)} style={{
              padding:"7px 8px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:600,
              background: selEmp===id ? "rgba(255,215,0,0.1)" : "transparent",
              color: selEmp===id ? YELLOW : TEXT,
              border:`1px solid ${selEmp===id ? YELLOW+"44" : "transparent"}`,
              marginBottom:3,transition:"all 0.12s",fontFamily:"'JetBrains Mono',monospace",
            }}>{id}</div>
          ))
        }
      </div>

      {/* ── Right: dates panel ── */}
      <div style={{flex:1,overflowY:"auto"}}>
        {!selEmp ? (
          <div style={{
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            height:"100%",gap:12,
          }}>
            <div style={{fontSize:40,opacity:0.3}}>👈</div>
            <p style={{color:DIM,fontSize:13}}>Select an employee to view attendance</p>
          </div>
        ) : (
          <>
            {/* ── Action bar ── */}
            <div style={{
              display:"flex",alignItems:"center",gap:8,marginBottom:14,
              flexWrap:"wrap",padding:"12px 14px",
              background:SURF2, border:`1px solid ${BORDER}`,
              borderRadius:12,
            }}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:YELLOW,fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:15}}>{selEmp}</div>
                <div style={{color:DIM,fontSize:10,marginTop:2}}>{dates.length} date records</div>
              </div>

              {/* Quick check-in */}
              <Btn small color={GREEN}
                onClick={() => setModal({type:"checkin"})}>
                🟢 Check In
              </Btn>

              {/* Quick check-out — only if open session today */}
              {todayDoc && openSession !== undefined && openSession >= 0 && (
                <Btn small color={RED}
                  onClick={() => setModal({type:"checkout"})}>
                  🔴 Check Out
                </Btn>
              )}

              {/* Add full date record */}
              <Btn small onClick={() => setModal({type:"add"})}>
                + Add Date
              </Btn>

              <Btn small outline color={SUB} onClick={() => loadDates(selEmp)} loading={loadingDates}>↻</Btn>
           
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: dbLive ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)",
                border: `1px solid ${dbLive ? GREEN + "44" : RED + "44"}`,
                borderRadius: 9, padding: "5px 10px",
              }}>
                <span style={{ color: SUB, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 }}>SYSTEM</span>
                <div onClick={!togglingDb ? toggleDbLive : undefined} style={{
                  width: 36, height: 20, borderRadius: 20, cursor: togglingDb ? "wait" : "pointer",
                  background: dbLive ? GREEN : RED,
                  position: "relative", transition: "background 0.2s",
                  opacity: dbLive === null ? 0.4 : 1, flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute", top: 3, left: dbLive ? 18 : 3,
                    width: 14, height: 14, borderRadius: "50%",
                    background: "#fff", transition: "left 0.2s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  }} />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: dbLive ? GREEN : RED,
                  fontFamily: "'JetBrains Mono',monospace",
                }}>
                  {dbLive === null ? "…" : dbLive ? "LIVE" : "OFF"}
                </span>
              </div>
           
           
           
           
            </div>

            {/* ── Today's status card ── */}
            {todayDoc && (
              <div style={{
                background: openSession !== undefined && openSession >= 0
                  ? "rgba(255,215,0,0.06)" : "rgba(74,222,128,0.06)",
                border:`1px solid ${openSession !== undefined && openSession >= 0 ? YELLOW+"33" : GREEN+"33"}`,
                borderRadius:12, padding:"12px 16px", marginBottom:12,
                display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",
              }}>
                <span style={{fontSize:20}}>{openSession !== undefined && openSession >= 0 ? "⏳" : "✅"}</span>
                <div style={{flex:1}}>
                  <div style={{color:TEXT,fontWeight:700,fontSize:12}}>Today · {todayDoc.id}</div>
                  <div style={{color:SUB,fontSize:11}}>{todayDoc.sessions?.length || 0} sessions · {openSession !== undefined && openSession >= 0 ? "Currently checked in" : "All sessions closed"}</div>
                </div>
                {todayDoc.sessions?.map((s:any,i:number) => (
                  <div key={i} style={{
                    background:"rgba(99,102,241,0.1)",border:`1px solid ${BORDER}`,
                    borderRadius:8,padding:"4px 10px",fontSize:10,
                  }}>
                    <span style={{color:GREEN,fontFamily:"'JetBrains Mono',monospace"}}>IN {s.check_in}</span>
                    {s.check_out
                      ? <span style={{color:RED,fontFamily:"'JetBrains Mono',monospace"}}> → OUT {s.check_out}</span>
                      : <span style={{color:YELLOW}}> → ⏳</span>
                    }
                  </div>
                ))}
              </div>
            )}

            {/* ── Date records ── */}
            {loadingDates ? (
              <p style={{color:DIM}}>Loading…</p>
            ) : dates.length === 0 ? (
              <div style={{textAlign:"center",padding:"40px 0"}}>
                <p style={{color:DIM,fontSize:12,marginBottom:14}}>No attendance records yet</p>
                <Btn onClick={() => setModal({type:"add"})}>+ Add First Record</Btn>
              </div>
            ) : (
              dates.map((d:any) => {
                const isExpanded = expanded === d.id;
                const hasOpen = d.sessions?.some((s:any) => !s.check_out);
                const isToday = d.id === toDateStr(new Date());
                return (
                  <div key={d.id} style={{
                    background:SURF2, border:`1px solid ${isExpanded ? YELLOW+"44" : BORDER}`,
                    borderRadius:12,marginBottom:6,overflow:"hidden",transition:"border 0.15s",
                  }}>
                    {/* Row */}
                    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer"}}
                      onClick={() => setExpanded(isExpanded ? null : d.id)}>
                      <div style={{
                        width:8,height:8,borderRadius:"50%",flexShrink:0,
                        background: hasOpen ? YELLOW : isToday ? GREEN : SUB,
                        boxShadow: hasOpen ? `0 0 6px ${YELLOW}` : "none",
                      }}/>
                      <span style={{color:TEXT,fontWeight:700,fontSize:12,fontFamily:"'JetBrains Mono',monospace",flex:1}}>
                        {d.id}
                        {isToday && <span style={{color:YELLOW,fontSize:9,marginLeft:8,fontFamily:"inherit"}}>TODAY</span>}
                      </span>
                      <span style={{color:SUB,fontSize:10}}>{d.sessions?.length||0} sessions</span>
                      {hasOpen && (
                        <span style={{fontSize:9,color:YELLOW,background:"rgba(255,215,0,0.1)",border:`1px solid ${YELLOW}44`,borderRadius:20,padding:"1px 7px"}}>⏳ OPEN</span>
                      )}
                      <span style={{color:DIM,fontSize:13}}>{isExpanded?"▲":"▼"}</span>
                    </div>

                    {/* Expanded */}
                    {isExpanded && (
                      <div style={{padding:"0 14px 14px",borderTop:`1px solid ${BORDER}`}}>
                        {/* Sessions display */}
                        <div style={{margin:"12px 0",display:"flex",flexDirection:"column",gap:6}}>
                          {(d.sessions||[]).map((s:any, i:number) => (
                            <div key={i} style={{
                              background: !s.check_out ? "rgba(255,215,0,0.06)" : "rgba(99,102,241,0.06)",
                              border:`1px solid ${!s.check_out ? YELLOW+"22" : BORDER}`,
                              borderRadius:8,padding:"8px 12px",
                              display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",
                            }}>
                              <span style={{color:DIM,fontSize:10,fontWeight:700}}>#{s.session}</span>
                              <span style={{
                                color:GREEN,fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,
                              }}>↑ {s.check_in||"—"}</span>
                              {s.check_out
                                ? <span style={{color:RED,fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700}}>↓ {s.check_out}</span>
                                : <span style={{color:YELLOW,fontSize:11}}>⏳ still in</span>
                              }
                            </div>
                          ))}
                        </div>

                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          <Btn small onClick={() => setModal({type:"edit",data:d})}>✏️ Full Edit</Btn>
                          <Btn small outline color={RED} danger onClick={() => deleteDate(d.id)}>🗑 Delete</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {modal?.type === "add" && (
        <Modal title={`Add Date · ${selEmp}`} onClose={() => setModal(null)} wide>
          <DateModal empId={selEmp} onSave={() => { setModal(null); loadDates(selEmp); }} onClose={() => setModal(null)} toast={toast} />
        </Modal>
      )}
      {modal?.type === "edit" && (
        <Modal title={`Edit · ${selEmp} / ${modal.data.id}`} onClose={() => setModal(null)} wide>
          <DateModal empId={selEmp} initial={modal.data} onSave={() => { setModal(null); loadDates(selEmp); }} onClose={() => setModal(null)} toast={toast} />
        </Modal>
      )}
      {modal?.type === "checkin" && (
        <Modal title={`Check In · ${selEmp}`} onClose={() => setModal(null)}>
          <QuickCheckinModal empId={selEmp} existingDate={todayDoc || null}
            onSave={() => { setModal(null); loadDates(selEmp); }} onClose={() => setModal(null)} toast={toast} />
        </Modal>
      )}
      {modal?.type === "checkout" && todayDoc && openSession !== undefined && openSession >= 0 && (
        <Modal title={`Check Out · ${selEmp}`} onClose={() => setModal(null)}>
          <QuickCheckoutModal empId={selEmp} dateDoc={todayDoc} openSessionIdx={openSession}
            onSave={() => { setModal(null); loadDates(selEmp); }} onClose={() => setModal(null)} toast={toast} />
        </Modal>
      )}
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }: any) {
  const [digits, setDigits] = useState(["","",""]);
  const [err, setErr]       = useState(false);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  function handleKey(i: number, val: string) {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits]; next[i] = val;
    setDigits(next);
    if (val && i < 2) refs[i+1].current?.focus();
    if (i === 2 && val) {
      const code = next.join("");
      if (code === ADMIN_PASS) { setAuth(); onLogin(); }
      else { setErr(true); setDigits(["","",""]); refs[0].current?.focus(); setTimeout(() => setErr(false), 1500); }
    }
  }

  function handleBk(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs[i-1].current?.focus();
  }

  useEffect(() => { refs[0].current?.focus(); }, []);

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Sora',sans-serif"}}>
      <div style={{
        background:"linear-gradient(155deg,#0D1545 0%,#070F30 100%)",
        border:`1px solid ${BORDER}`,borderRadius:20,padding:"40px 36px",
        width:320,textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",
      }}>
        <div style={{width:52,height:52,borderRadius:14,margin:"0 auto 20px",
          background:"rgba(255,215,0,0.08)",border:`1px solid ${YELLOW}33`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🔐</div>
        <h2 style={{color:TEXT,fontWeight:800,fontSize:18,margin:"0 0 6px"}}>Admin Access</h2>
        <p style={{color:SUB,fontSize:12,margin:"0 0 24px"}}>Enter 3-digit passcode</p>
        <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:20}}>
          {digits.map((d,i) => (
            <input key={i} ref={refs[i]} maxLength={1} inputMode="numeric"
              value={d} onChange={e => handleKey(i,e.target.value)} onKeyDown={e => handleBk(i,e)}
              style={{
                width:52,height:58,textAlign:"center",fontSize:22,fontWeight:700,
                background: err ? "rgba(248,113,113,0.1)" : "rgba(99,102,241,0.08)",
                border:`2px solid ${err ? RED : (d ? YELLOW : BORDER)}`,
                borderRadius:10,color:TEXT,outline:"none",fontFamily:"'JetBrains Mono',monospace",transition:"all 0.15s",
              }} />
          ))}
        </div>
        {err && <p style={{color:RED,fontSize:11,margin:0}}>Incorrect code</p>}
        <p style={{color:DIM,fontSize:10,marginTop:16}}>Session lasts {SESSION_MINS} minutes</p>
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [authed, setAuthed] = useState(isAuthed());
  const [tab, setTab]       = useState("attendance");
  const { items, add, remove } = useToast();

  if (!authed) return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap'); *,*::before,*::after{box-sizing:border-box;font-family:'Sora',sans-serif;}`}</style>
      <Login onLogin={() => setAuthed(true)} />
    </>
  );

  const tabs = [
    { id:"attendance", label:"📋 Attendance", desc:"Check in / out, manage sessions" },
    { id:"employees",  label:"👥 Employees",  desc:"Add, edit, remove staff" },
  ];

  return (
    <div style={{minHeight:"100vh",background:BG,fontFamily:"'Sora',sans-serif",color:TEXT}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.3);border-radius:3px;}
        option{background:#0B1340;color:#EEF0FF;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.7);}
      `}</style>

      <ToastContainer items={items} remove={remove} />

      <header style={{
        background:"linear-gradient(180deg,rgba(10,18,64,0.98),rgba(6,13,46,0.95))",
        borderBottom:`1px solid ${BORDER}`,padding:"10px 24px",
        display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:40,
        backdropFilter:"blur(12px)",
      }}>
        <div style={{fontSize:17,fontWeight:800,color:YELLOW,letterSpacing:-0.5}}>⚙️ Canary Admin</div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"6px 14px",borderRadius:8,border:"none",cursor:"pointer",
              fontSize:12,fontWeight:600,
              background: tab===t.id ? YELLOW : "transparent",
              color: tab===t.id ? BG : SUB,
              transition:"all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{width:1,height:20,background:BORDER}}/>
        <button onClick={() => { clearAuth(); setAuthed(false); }} style={{
          background:"rgba(248,113,113,0.1)",border:`1px solid ${RED}44`,
          borderRadius:8,color:RED,fontSize:11,fontWeight:600,padding:"5px 12px",
          cursor:"pointer",fontFamily:"inherit",
        }}>Logout</button>
      </header>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 24px"}}>
        {tab==="employees"  && <EmployeesTab  toast={add} />}
        {tab==="attendance" && <AttendanceTab toast={add} />}
      </div>
    </div>
  );
}