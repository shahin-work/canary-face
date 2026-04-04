import { useState, useEffect, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";

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

const HR_PASS  = "2024";
const SESS_KEY = "hr_remote_ts";
const SESS_MIN = 60;

function isAuthed() {
  const ts = localStorage.getItem(SESS_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts) < SESS_MIN * 60 * 1000;
}
function setAuth()   { localStorage.setItem(SESS_KEY, Date.now().toString()); }
function clearAuth() { localStorage.removeItem(SESS_KEY); }

// ── Colours ───────────────────────────────────────────────────────────────────
const BG      = "#060D2E";
const SURF2   = "#0F1848";
const BORDER  = "rgba(99,102,241,0.22)";
const TEXT    = "#EEF0FF";
const SUB     = "#8090C0";
const DIM     = "#3A4A7A";
const YELLOW  = "#FFD700";
const RED     = "#F87171";
const GREEN   = "#4ADE80";
const BLUE    = "#60A5FA";
const TEAL    = "#84fcfa";
const MAGENTA = "#EC4899";

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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

function Label({ children }: any) {
  return <label style={{display:"block",color:SUB,fontSize:10,fontWeight:700,letterSpacing:0.8,marginBottom:5,textTransform:"uppercase"}}>{children}</label>;
}

function Btn({ children, onClick, color=YELLOW, loading=false, full=false, outline=false }: any) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      background: outline ? "transparent" : color,
      color: outline ? color : BG,
      border:`1px solid ${color}`,
      borderRadius:9, padding:"9px 18px",
      fontSize:13, fontWeight:700, cursor: loading ? "wait" : "pointer",
      opacity: loading ? 0.6 : 1, transition:"all 0.15s", fontFamily:"inherit",
      display:"inline-flex", alignItems:"center", gap:6, flexShrink:0,
      width: full ? "100%" : undefined, justifyContent: full ? "center" : undefined,
    }}>
      {loading ? "⏳" : children}
    </button>
  );
}

// ── Simple Time Select ────────────────────────────────────────────────────────
function TimeSelect({ label, hour, minute, onHour, onMinute, color }: {
  label: string; hour: number; minute: number;
  onHour: (h: number) => void; onMinute: (m: number) => void; color: string;
}) {
  const selStyle: React.CSSProperties = {
    flex: 1, background: SURF2,
    border: `1px solid ${color}44`, borderRadius: 8,
    color: TEXT, fontSize: 14, fontWeight: 700,
    padding: "8px 10px", outline: "none", cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    appearance: "none" as any,
    textAlign: "center",
  };
  return (
    <div style={{
      background: color === GREEN ? "rgba(74,222,128,0.05)" : "rgba(248,113,113,0.05)",
      border: `1px solid ${color}33`, borderRadius: 11, padding: "12px 13px",
    }}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:color,boxShadow:`0 0 5px ${color}`}}/>
        <span style={{color,fontWeight:700,fontSize:11,letterSpacing:0.5}}>{label}</span>
        <span style={{
          marginLeft:"auto", color, fontFamily:"'JetBrains Mono',monospace",
          fontWeight:800, fontSize:16,
        }}>
          {String(hour).padStart(2,"0")}:{String(minute).padStart(2,"0")}
        </span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <select value={hour} onChange={e => onHour(Number(e.target.value))} style={selStyle}>
          {Array.from({length:24},(_,i)=>(
            <option key={i} value={i}>{String(i).padStart(2,"0")} hr</option>
          ))}
        </select>
        <span style={{color:DIM,fontWeight:800,fontSize:18,flexShrink:0}}>:</span>
        <select value={minute} onChange={e => onMinute(Number(e.target.value))} style={selStyle}>
          {[0,5,10,15,20,25,30,35,40,45,50,55].map(m=>(
            <option key={m} value={m}>{String(m).padStart(2,"0")} min</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── HR Login ──────────────────────────────────────────────────────────────────
function HrLogin({ onLogin }: { onLogin: () => void }) {
  const [code, setCode]   = useState("");
  const [shake, setShake] = useState(false);

  function handleInput(val: string) {
    if (!/^\d*$/.test(val) || val.length > 4) return;
    setCode(val);
    if (val.length === 4) {
      if (val === HR_PASS) { setAuth(); onLogin(); }
      else {
        setShake(true);
        setTimeout(() => { setShake(false); setCode(""); }, 700);
      }
    }
  }

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Sora',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
      `}</style>

      <div style={{
        background:"linear-gradient(155deg,#0D1545 0%,#070F30 100%)",
        border:`1px solid ${BORDER}`,borderRadius:20,padding:"38px 32px",
        width:300,textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",
        animation: shake ? "shake 0.6s ease" : "none",
      }}>
        <div style={{
          width:50,height:50,borderRadius:14,margin:"0 auto 18px",
          background:"rgba(236,72,153,0.1)",border:`1px solid ${MAGENTA}33`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:21,
        }}>🏠</div>
        <h2 style={{color:TEXT,fontWeight:800,fontSize:17,margin:"0 0 4px"}}>HR Remote</h2>
        <p style={{color:SUB,fontSize:11,margin:"0 0 22px"}}>Enter 4-digit passcode</p>

        {/* PIN dots */}
        <div style={{display:"flex",gap:9,justifyContent:"center",marginBottom:18}}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:42,height:48,borderRadius:9,
              background: shake ? "rgba(248,113,113,0.1)" : "rgba(99,102,241,0.08)",
              border:`2px solid ${shake ? RED : (code.length > i ? MAGENTA : BORDER)}`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:20,fontWeight:800,color:MAGENTA,
              fontFamily:"'JetBrains Mono',monospace",
              transition:"border 0.15s, background 0.15s",
            }}>
              {code.length > i ? "●" : ""}
            </div>
          ))}
        </div>

        {/* Hidden input for keyboard */}
        <input autoFocus inputMode="numeric" value={code}
          onChange={e => handleInput(e.target.value)}
          style={{position:"absolute",opacity:0,width:1,height:1,pointerEvents:"none"}} />

        {/* Numpad */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i) => (
            <button key={i}
              onClick={() => {
                if (k === "⌫") { handleInput(code.slice(0,-1)); return; }
                if (k === "") return;
                handleInput(code + String(k));
              }}
              style={{
                padding:"11px 0",borderRadius:8,
                background: k === "" ? "transparent" : "rgba(99,102,241,0.1)",
                border: k === "" ? "none" : `1px solid ${BORDER}`,
                color:TEXT,fontSize:16,fontWeight:700,
                cursor: k === "" ? "default" : "pointer",
                fontFamily:"'JetBrains Mono',monospace",
                transition:"background 0.12s",
              }}
              onMouseEnter={e => { if (k !== "") (e.currentTarget as HTMLButtonElement).style.background = `rgba(236,72,153,0.12)`; }}
              onMouseLeave={e => { if (k !== "") (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.1)"; }}
            >{k}</button>
          ))}
        </div>

        {shake && <p style={{color:RED,fontSize:11,marginTop:12,marginBottom:0}}>Incorrect passcode</p>}
        <p style={{color:DIM,fontSize:10,marginTop:14,marginBottom:0}}>Session lasts {SESS_MIN} minutes</p>
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function HrPanel() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <HrLogin onLogin={() => setAuthed(true)} />;
  return <HrMain onLogout={() => { clearAuth(); setAuthed(false); }} />;
}

// ── HR Main ───────────────────────────────────────────────────────────────────
function HrMain({ onLogout }: { onLogout: () => void }) {
  const [employees, setEmployees]     = useState<any[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [selEmp, setSelEmp]           = useState<any>(null);
  const [empSearch, setEmpSearch]     = useState("");
  const [showEmpDrop, setShowEmpDrop] = useState(false);

  const now = new Date();
  const [fromDate, setFromDate] = useState(toDateStr(now));
  const [toDate,   setToDate]   = useState(toDateStr(now));
  const [fromHour, setFromHour] = useState(9);
  const [fromMin,  setFromMin]  = useState(0);
  const [toHour,   setToHour]   = useState(18);
  const [toMin,    setToMin]    = useState(0);
  const [note, setNote]         = useState("");
  const [saving, setSaving]     = useState(false);

  const { items, add, remove } = useToast();

  useEffect(() => {
    (async () => {
      setLoadingEmps(true);
      try {
        const snap = await getDocs(collection(db, "employees"));
        setEmployees(snap.docs.map(d => d.data()));
      } catch (_) {}
      finally { setLoadingEmps(false); }
    })();
  }, []);

  const filteredEmps = employees.filter(e =>
    !empSearch || [e.name, e.emp_id, e.department]
      .some((v: string) => v?.toLowerCase().includes(empSearch.toLowerCase()))
  );

  function dateRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const cur = new Date(from), end = new Date(to);
    while (cur <= end) { dates.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1); }
    return dates;
  }

  async function save() {
    if (!selEmp)              { add("Please select an employee", "error"); return; }
    if (!fromDate || !toDate) { add("Please pick dates", "error"); return; }
    if (toDate < fromDate)    { add("'To date' must be same or after 'From date'", "error"); return; }
    const fromStr = `${String(fromHour).padStart(2,"0")}:${String(fromMin).padStart(2,"0")}`;
    const toStr   = `${String(toHour).padStart(2,"0")}:${String(toMin).padStart(2,"0")}`;
    if (toHour * 60 + toMin <= fromHour * 60 + fromMin) {
      add("Check-out time must be after check-in time", "error"); return;
    }
    setSaving(true);
    const dates = dateRange(fromDate, toDate);
    try {
      for (const date of dates) {
        const dateRef  = doc(db, selEmp.emp_id, date);
        const snap     = await getDoc(dateRef);
        const existing = snap.exists() ? snap.data() : null;
        const prev: any[] = existing?.sessions || [];
        await setDoc(dateRef, {
          employee_name: existing?.employee_name || selEmp.name,
          sessions: [...prev, {
            session: prev.length + 1, check_in: fromStr, check_out: toStr, wfh: true,
            ...(note.trim() ? { note: note.trim() } : {}),
          }],
        });
      }
      const label = dates.length === 1 ? dates[0] : `${dates.length} days (${fromDate} → ${toDate})`;
      add(`Remote logged for ${selEmp.emp_id} · ${label} ✓`);
      setNote("");
    } catch (e: any) { add("Save failed: " + e.message, "error"); }
    finally { setSaving(false); }
  }

  const fromMins  = fromHour * 60 + fromMin;
  const toMins    = toHour   * 60 + toMin;
  const duration  = toMins > fromMins ? toMins - fromMins : 0;
  const dHr       = Math.floor(duration / 60);
  const dMin      = duration % 60;
  const rangeDays = fromDate && toDate && toDate >= fromDate
    ? dateRange(fromDate, toDate).length : 0;

  const TYPE_COLORS: Record<string,string> = {
    permanent: YELLOW, consultant: BLUE, intern: "#C084FC", guest: TEAL,
  };

  return (
    <div style={{minHeight:"100vh",background:BG,fontFamily:"'Sora',sans-serif",color:TEXT}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.3);border-radius:3px;}
        option{background:#0B1340;color:#EEF0FF;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.7);}
        .emp-drop-item:hover{background:rgba(99,102,241,0.14)!important;}
        select:focus{outline:none;}
      `}</style>

      <ToastContainer items={items} remove={remove} />

      {/* ── Header ── */}
      <header style={{
        background:"linear-gradient(180deg,rgba(10,18,64,0.98),rgba(6,13,46,0.95))",
        borderBottom:`1px solid ${BORDER}`,padding:"8px 22px",
        display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:40,backdropFilter:"blur(12px)",
      }}>
        <div style={{fontSize:15,fontWeight:800,color:MAGENTA,letterSpacing:-0.3}}>🏠 HR Panel – Remote Attendance</div>
        <div style={{flex:1}}/>
        <button onClick={onLogout} style={{
          background:"rgba(248,113,113,0.1)",border:`1px solid ${RED}44`,
          borderRadius:7,color:RED,fontSize:10,fontWeight:600,padding:"4px 10px",
          cursor:"pointer",fontFamily:"inherit",
        }}>Logout</button>
      </header>

      {/* ── Two columns ── */}
      <div style={{
        maxWidth:900,margin:"0 auto",padding:"18px 18px",
        display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start",
      }}>

        {/* ══ LEFT: Employee + Date Range + Note ══ */}
        <div style={{
          background:"linear-gradient(155deg,#0D1545 0%,#070F30 100%)",
          border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",
          boxShadow:"0 10px 36px rgba(0,0,0,0.45)",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <span style={{fontSize:14}}>👤</span>
            <span style={{color:TEXT,fontWeight:700,fontSize:13}}>Employee & Dates</span>
          </div>

          {/* Employee Search */}
          <div style={{marginBottom:13,position:"relative"}}>
            <Label>Employee *</Label>
            <div style={{position:"relative"}}>
              <input
                value={empSearch}
                onChange={e => { setEmpSearch(e.target.value); setShowEmpDrop(true); if (!e.target.value) setSelEmp(null); }}
                onFocus={() => setShowEmpDrop(true)}
                onBlur={() => setTimeout(() => setShowEmpDrop(false), 180)}
                placeholder={loadingEmps ? "Loading…" : "Search name or ID…"}
                style={{
                  width:"100%",background:"rgba(99,102,241,0.07)",
                  border:`1px solid ${selEmp ? MAGENTA+"66" : BORDER}`,
                  borderRadius:8,color:TEXT,fontSize:12,padding:"8px 30px 8px 10px",
                  outline:"none",fontFamily:"inherit",
                }}
              />
              {selEmp && (
                <button onClick={() => { setSelEmp(null); setEmpSearch(""); }}
                  style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                  background:"none",border:"none",color:DIM,fontSize:15,cursor:"pointer",lineHeight:1}}>×</button>
              )}
            </div>

            {/* Selected badge */}
            {selEmp && (
              <div style={{
                marginTop:6,display:"flex",alignItems:"center",gap:8,
                background:"rgba(236,72,153,0.06)",border:`1px solid ${MAGENTA}33`,
                borderRadius:8,padding:"6px 10px",
              }}>
                <div style={{
                  width:26,height:26,borderRadius:"50%",flexShrink:0,overflow:"hidden",
                  background:BG,border:`1.5px solid ${TYPE_COLORS[selEmp.type]||YELLOW}55`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                }}>
                  {selEmp.profile_image
                    ? <img src={selEmp.profile_image} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                    : <span style={{color:TYPE_COLORS[selEmp.type]||YELLOW,fontWeight:700,fontSize:9}}>
                        {(selEmp.name||"?").split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()}
                      </span>
                  }
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:MAGENTA,fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selEmp.name}</div>
                  <div style={{color:DIM,fontSize:9,fontFamily:"'JetBrains Mono',monospace"}}>{selEmp.emp_id} · {selEmp.department}</div>
                </div>
                <span style={{
                  fontSize:9,fontWeight:700,flexShrink:0,
                  color:TYPE_COLORS[selEmp.type]||YELLOW,
                  background:(TYPE_COLORS[selEmp.type]||YELLOW)+"18",
                  border:`1px solid ${(TYPE_COLORS[selEmp.type]||YELLOW)}33`,
                  borderRadius:20,padding:"1px 7px",textTransform:"capitalize",
                }}>{selEmp.type||"—"}</span>
              </div>
            )}

            {/* Dropdown */}
            {showEmpDrop && !selEmp && filteredEmps.length > 0 && (
              <div style={{
                position:"absolute",top:"100%",left:0,right:0,zIndex:100,
                background:"#0B1340",border:`1px solid ${BORDER}`,borderRadius:8,
                marginTop:3,maxHeight:170,overflowY:"auto",
                boxShadow:"0 12px 32px rgba(0,0,0,0.6)",
              }}>
                {filteredEmps.map(emp => (
                  <div key={emp.emp_id} className="emp-drop-item"
                    onMouseDown={() => { setSelEmp(emp); setEmpSearch(emp.name); setShowEmpDrop(false); }}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",cursor:"pointer",transition:"background 0.1s"}}>
                    <div style={{
                      width:22,height:22,borderRadius:"50%",flexShrink:0,overflow:"hidden",
                      background:BG,border:`1.5px solid ${TYPE_COLORS[emp.type]||YELLOW}44`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                    }}>
                      {emp.profile_image
                        ? <img src={emp.profile_image} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                        : <span style={{color:TYPE_COLORS[emp.type]||YELLOW,fontWeight:700,fontSize:8}}>
                            {(emp.name||"?").split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()}
                          </span>
                      }
                    </div>
                    <div>
                      <div style={{color:TEXT,fontSize:11,fontWeight:600}}>{emp.name}</div>
                      <div style={{color:DIM,fontSize:9,fontFamily:"'JetBrains Mono',monospace"}}>{emp.emp_id}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Date Range */}
          <div style={{marginBottom:13}}>
            <Label>Date Range *</Label>
            <div style={{background:"rgba(99,102,241,0.04)",border:`1px solid ${BORDER}`,borderRadius:10,padding:"11px"}}>

              {/* FROM */}
              <div style={{marginBottom:7}}>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:GREEN,boxShadow:`0 0 4px ${GREEN}`}}/>
                  <span style={{color:GREEN,fontSize:9,fontWeight:700,letterSpacing:0.6}}>FROM</span>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <input type="date" value={fromDate}
                    onChange={e => { setFromDate(e.target.value); if (e.target.value > toDate) setToDate(e.target.value); }}
                    style={{flex:1,background:SURF2,border:`1px solid ${GREEN}33`,borderRadius:7,color:TEXT,fontSize:12,padding:"6px 8px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}} />
                  <button onClick={() => { const t = toDateStr(new Date()); setFromDate(t); if(t>toDate) setToDate(t); }}
                    style={{background:"rgba(74,222,128,0.1)",border:`1px solid ${GREEN}44`,borderRadius:6,color:GREEN,fontSize:9,fontWeight:700,padding:"6px 8px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Today</button>
                </div>
              </div>

              <div style={{textAlign:"center",color:DIM,fontSize:12,margin:"1px 0"}}>↓</div>

              {/* TO */}
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:RED,boxShadow:`0 0 4px ${RED}`}}/>
                  <span style={{color:RED,fontSize:9,fontWeight:700,letterSpacing:0.6}}>TO</span>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <input type="date" value={toDate} min={fromDate}
                    onChange={e => setToDate(e.target.value)}
                    style={{flex:1,background:SURF2,border:`1px solid ${RED}33`,borderRadius:7,color:TEXT,fontSize:12,padding:"6px 8px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}} />
                  <button onClick={() => setToDate(toDateStr(new Date()))}
                    style={{background:"rgba(248,113,113,0.1)",border:`1px solid ${RED}44`,borderRadius:6,color:RED,fontSize:9,fontWeight:700,padding:"6px 8px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Today</button>
                </div>
              </div>

              {/* Range pill */}
              {fromDate && toDate && toDate >= fromDate && (
                <div style={{
                  marginTop:8,display:"flex",alignItems:"center",gap:6,
                  background:"rgba(236,72,153,0.06)",border:`1px solid ${MAGENTA}33`,
                  borderRadius:7,padding:"5px 9px",
                }}>
                  <span style={{color:MAGENTA,fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {fromDate}{fromDate !== toDate ? ` → ${toDate}` : ""}
                  </span>
                  <span style={{
                    background:"rgba(236,72,153,0.12)",border:`1px solid ${MAGENTA}33`,
                    borderRadius:20,padding:"1px 7px",color:MAGENTA,fontSize:10,fontWeight:700,flexShrink:0,
                  }}>{rangeDays} {rangeDays === 1 ? "day" : "days"}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Time + Submit ══ */}
        <div style={{
          background:"linear-gradient(155deg,#0D1545 0%,#070F30 100%)",
          border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",
          boxShadow:"0 10px 36px rgba(0,0,0,0.45)",
        }}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <span style={{fontSize:14}}>⏰</span>
            <span style={{color:TEXT,fontWeight:700,fontSize:13}}>Work Hours</span>
          </div>

          {/* Check In */}
          <div style={{marginBottom:8}}>
            <TimeSelect label="CHECK IN" hour={fromHour} minute={fromMin} onHour={setFromHour} onMinute={setFromMin} color={GREEN} />
          </div>

          <div style={{textAlign:"center",color:DIM,fontSize:15,margin:"3px 0"}}>↕</div>

          {/* Check Out */}
          <div style={{marginBottom:14}}>
            <TimeSelect label="CHECK OUT" hour={toHour} minute={toMin} onHour={setToHour} onMinute={setToMin} color={RED} />
          </div>

          {/* Duration */}
          <div style={{
            background: duration > 0 ? "rgba(96,165,250,0.07)" : "rgba(58,74,122,0.10)",
            border:`1px solid ${duration > 0 ? BLUE+"44" : BORDER}`,
            borderRadius:10,padding:"10px 13px",
            display:"flex",alignItems:"center",gap:9,
            marginBottom:16,
          }}>
            <span style={{fontSize:15}}>⏱</span>
            {duration > 0 ? (
              <div>
                <div style={{color:BLUE,fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:14}}>
                  {dHr}h {String(dMin).padStart(2,"0")}m per day
                </div>
                {rangeDays > 1 && (
                  <div style={{color:SUB,fontSize:10,marginTop:2}}>
                    ×{rangeDays} days = {Math.round((dHr * 60 + dMin) * rangeDays / 60 * 10) / 10}h total
                  </div>
                )}
              </div>
            ) : (
              <span style={{color:DIM,fontSize:12}}>Set a valid time range</span>
            )}
          </div>

          {/* Submit */}
          <Btn onClick={save} loading={saving} color={MAGENTA} full>
            🏠 {rangeDays > 1 ? `Log Remote for ${rangeDays} days` : "Log Remote Work"}
          </Btn>
        </div>

      </div>
    </div>
  );
}