import { useState, useEffect, useCallback, useMemo } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import * as XLSX from "xlsx-js-style";

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
const SURF    = "#0B1340";
const SURF2   = "#0F1848";
const SURF3   = "#121B52";
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
function fmtDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function getDaysInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from), end = new Date(to);
  while (cur <= end) { dates.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}
function initials(name: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

const HOLIDAYS = new Set([
  "2026-02-15","2026-03-20","2026-04-03","2026-04-05","2026-04-15",
  "2026-05-01","2026-05-27","2026-08-15","2026-08-25","2026-08-26",
  "2026-09-21","2026-10-02","2026-10-20","2026-11-08","2026-12-25",
]);
function isHoliday(d: string) { return HOLIDAYS.has(d); }
function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr), dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) return Math.ceil(d.getDate() / 7) % 2 === 0;
  return false;
}
function calcHours(sessions: any[]): number {
  let mins = 0;
  const toM = (t: string) => { const [h,m,s] = t.split(":").map(Number); return h*60+m+(s||0)/60; };
  for (const s of sessions) {
    if (!s.check_in || !s.check_out) continue;
    mins += Math.max(0, toM(s.check_out) - toM(s.check_in));
  }
  return Math.round((mins/60)*100)/100;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [items, setItems] = useState<{id:number;msg:string;type:string}[]>([]);
  const add = useCallback((msg: string, type = "ok") => {
    const id = Date.now() + Math.random();
    setItems(p => [...p, { id, msg, type }]);
    setTimeout(() => setItems(p => p.filter(x => x.id !== id)), 3800);
  }, []);
  const remove = useCallback((id: number) => setItems(p => p.filter(x => x.id !== id)), []);
  return { items, add, remove };
}

function ToastContainer({ items, remove }: any) {
  return (
    <div style={{ position:"fixed", top:16, right:16, zIndex:99999, display:"flex", flexDirection:"column", gap:8 }}>
      {items.map((t: any) => (
        <div key={t.id} onClick={() => remove(t.id)} style={{
          background: t.type==="error" ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.12)",
          border: `1px solid ${t.type==="error" ? "rgba(248,113,113,0.5)" : "rgba(74,222,128,0.4)"}`,
          borderRadius:12, padding:"11px 15px", cursor:"pointer", minWidth:260, maxWidth:360,
          display:"flex", alignItems:"center", gap:10, backdropFilter:"blur(8px)",
          boxShadow:"0 8px 24px rgba(0,0,0,0.5)",
        }}>
          <span style={{fontSize:16}}>{t.type==="error" ? "❌" : "✅"}</span>
          <span style={{color:TEXT, fontSize:12.5, lineHeight:1.45, fontFamily:"'Sora',sans-serif"}}>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function Label({ children }: any) {
  return <label style={{display:"block",color:SUB,fontSize:10,fontWeight:700,letterSpacing:0.8,marginBottom:6,textTransform:"uppercase",fontFamily:"'Sora',sans-serif"}}>{children}</label>;
}

function TimeSelect({ label, hour, minute, onHour, onMinute, color }: {
  label: string; hour: number; minute: number;
  onHour:(h:number)=>void; onMinute:(m:number)=>void; color: string;
}) {
  const selStyle: React.CSSProperties = {
    flex:1, background:SURF2, border:`1px solid ${color}33`, borderRadius:8,
    color:TEXT, fontSize:14, fontWeight:700, padding:"8px 10px", outline:"none",
    cursor:"pointer", fontFamily:"'JetBrains Mono',monospace", appearance:"none" as any, textAlign:"center",
  };
  return (
    <div style={{ background: color===GREEN?"rgba(74,222,128,0.05)":"rgba(248,113,113,0.05)", border:`1px solid ${color}22`, borderRadius:11, padding:"12px 13px" }}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:color,boxShadow:`0 0 5px ${color}`}}/>
        <span style={{color,fontWeight:700,fontSize:11,letterSpacing:0.5}}>{label}</span>
        <span style={{marginLeft:"auto",color,fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:16}}>
          {String(hour).padStart(2,"0")}:{String(minute).padStart(2,"0")}
        </span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <select value={hour} onChange={e=>onHour(Number(e.target.value))} style={selStyle}>
          {Array.from({length:24},(_,i)=>(
            <option key={i} value={i}>{String(i).padStart(2,"0")} hr</option>
          ))}
        </select>
        <span style={{color:DIM,fontWeight:800,fontSize:18,flexShrink:0}}>:</span>
        <select value={minute} onChange={e=>onMinute(Number(e.target.value))} style={selStyle}>
          {[0,5,10,15,20,25,30,35,40,45,50,55].map(m=>(
            <option key={m} value={m}>{String(m).padStart(2,"0")} min</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Confirm Modal (used before applying regularize / remote, esp. bulk) ─────────
function ConfirmModal({
  accent, icon, heading, sub, rows, employees, note, confirmLabel, busy, onConfirm, onClose,
}: {
  accent: string; icon: string; heading: string; sub: string;
  rows: { label: string; value: string }[];
  employees: any[]; note: string;
  confirmLabel: string; busy: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  const TYPE_COLORS: Record<string,string> = { permanent:YELLOW, consultant:BLUE, intern:"#C084FC", guest:TEAL };
  return (
    <div onClick={busy ? undefined : onClose} style={{
      position:"fixed",inset:0,zIndex:10001,background:"rgba(2,6,23,0.78)",
      backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",
      padding:20,fontFamily:"'Sora',sans-serif",
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"min(460px,100%)", maxHeight:"88vh", overflowY:"auto",
        background:`linear-gradient(160deg,${SURF2},${BG})`,
        border:`1px solid ${accent}44`,borderRadius:18,
        boxShadow:`0 32px 80px rgba(0,0,0,0.7)`,
      }}>
        <div style={{padding:"18px 22px 14px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:12}}>
          <div style={{
            width:40,height:40,borderRadius:11,flexShrink:0,
            background:`${accent}14`,border:`1px solid ${accent}44`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
          }}>{icon}</div>
          <div style={{flex:1,minWidth:0}}>
            <h2 style={{color:TEXT,fontWeight:800,fontSize:15,margin:0,lineHeight:1.2}}>{heading}</h2>
            <p style={{color:SUB,fontSize:10.5,margin:"3px 0 0"}}>{sub}</p>
          </div>
        </div>

        <div style={{padding:"16px 22px 20px"}}>
          {/* summary rows */}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
            {rows.map(r => (
              <div key={r.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <span style={{color:SUB,fontSize:11.5}}>{r.label}</span>
                <span style={{color:TEXT,fontSize:12,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",textAlign:"right"}}>{r.value}</span>
              </div>
            ))}
          </div>

          {/* employee chips */}
          <Label>Employees ({employees.length})</Label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:120,overflowY:"auto",marginBottom:note?14:18}}>
            {employees.map(emp => {
              const c = TYPE_COLORS[emp.type] || YELLOW;
              return (
                <span key={emp.emp_id} style={{
                  display:"flex",alignItems:"center",gap:6,background:"rgba(99,102,241,0.08)",
                  border:`1px solid ${BORDER}`,borderRadius:20,padding:"3px 10px 3px 4px",
                }}>
                  <span style={{
                    width:20,height:20,borderRadius:"50%",flexShrink:0,overflow:"hidden",background:BG,
                    border:`1.5px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:8,fontWeight:700,color:c,
                  }}>
                    {emp.profile_image ? <img src={emp.profile_image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(emp.name)}
                  </span>
                  <span style={{color:TEXT,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{emp.name}</span>
                </span>
              );
            })}
          </div>

          {note && (
            <div style={{
              background:"rgba(255,215,0,0.05)",border:`1px solid ${YELLOW}22`,borderRadius:9,
              padding:"8px 11px",marginBottom:18,
            }}>
              <span style={{color:DIM,fontSize:9,fontWeight:700,letterSpacing:0.6}}>REASON / NOTE</span>
              <div style={{color:TEXT,fontSize:11.5,marginTop:3}}>{note}</div>
            </div>
          )}

          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} disabled={busy} style={{
              flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,
              background:SURF,color:SUB,fontSize:12.5,fontWeight:600,
              cursor:busy?"not-allowed":"pointer",fontFamily:"'Sora',sans-serif",
            }}>Cancel</button>
            <button onClick={onConfirm} disabled={busy} style={{
              flex:2,padding:"10px",borderRadius:10,border:"none",
              background: busy ? `${accent}55` : accent,
              color:"#0B1020",fontSize:12.5,fontWeight:800,
              cursor:busy?"not-allowed":"pointer",fontFamily:"'Sora',sans-serif",
              display:"flex",alignItems:"center",justifyContent:"center",gap:7,
            }}>{busy ? "Applying…" : confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Export Modal ──────────────────────────────────────────────────────────────
type ExportRange = "today" | "thisweek" | "thismonth" | "custom";

function ExportModal({ onClose, onExport }: { onClose:()=>void; onExport:(from:string,to:string)=>void }) {
  const now = new Date();
  const todayStr = toDateStr(now);

  const getWeekRange = () => {
    const dow = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (dow===0?6:dow-1));
    const sun = new Date(mon); sun.setDate(mon.getDate()+6);
    return { from: toDateStr(mon), to: toDateStr(sun) };
  };
  const getMonthRange = () => {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth()+1, 0);
    return { from: toDateStr(first), to: toDateStr(last) };
  };

  const [selected, setSelected] = useState<ExportRange>("thisweek");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo,   setCustomTo]   = useState(todayStr);

  const getRange = () => {
    if (selected==="today")     return { from:todayStr, to:todayStr };
    if (selected==="thisweek")  return getWeekRange();
    if (selected==="thismonth") return getMonthRange();
    return { from:customFrom, to:customTo };
  };

  const { from, to } = getRange();
  const days = getDaysInRange(from, to).length;

  const options: { id:ExportRange; label:string; sub:string; icon:string }[] = [
    { id:"today",     label:"Today",      sub: todayStr,                                icon:"📅" },
    { id:"thisweek",  label:"This Week",  sub:`${getWeekRange().from} → ${getWeekRange().to}`, icon:"🗓" },
    { id:"thismonth", label:"This Month", sub: now.toLocaleDateString("en-IN",{month:"long",year:"numeric"}), icon:"📆" },
    { id:"custom",    label:"Custom Range", sub:"Pick any date range",                  icon:"✏️" },
  ];

  return (
    <div onClick={onClose} style={{
      position:"fixed",inset:0,zIndex:10000,background:"rgba(2,6,23,0.75)",
      backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",
      padding:20,fontFamily:"'Sora',sans-serif",
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:"min(480px,100%)", background:`linear-gradient(160deg,${SURF2},${BG})`,
        border:`1px solid ${BORDER}`,borderRadius:20,
        boxShadow:"0 32px 80px rgba(0,0,0,0.7)",overflow:"hidden",
      }}>
        {/* Modal header */}
        <div style={{
          padding:"18px 22px 16px",
          borderBottom:`1px solid ${BORDER}`,
          display:"flex",alignItems:"center",gap:12,
        }}>
          <div style={{
            width:40,height:40,borderRadius:11,flexShrink:0,
            background:"rgba(74,222,128,0.08)",border:`1px solid ${GREEN}33`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
          }}>📊</div>
          <div>
            <h2 style={{color:TEXT,fontWeight:800,fontSize:15,margin:0,lineHeight:1.2}}>Export Attendance Report</h2>
            <p style={{color:SUB,fontSize:10.5,margin:"3px 0 0"}}>Downloads as a formatted Excel file</p>
          </div>
          <button onClick={onClose} style={{
            marginLeft:"auto",width:30,height:30,borderRadius:8,
            border:`1px solid ${BORDER}`,background:SURF,color:SUB,
            cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",
          }}>×</button>
        </div>

        <div style={{padding:"18px 22px 22px"}}>
          {/* Range options */}
          <div style={{marginBottom:16}}>
            <Label>Select Period</Label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {options.map(opt => (
                <button key={opt.id} onClick={()=>setSelected(opt.id)} style={{
                  background: selected===opt.id ? "rgba(74,222,128,0.1)" : "rgba(99,102,241,0.05)",
                  border: `1px solid ${selected===opt.id ? GREEN+"55" : BORDER}`,
                  borderRadius:11,padding:"11px 13px",cursor:"pointer",textAlign:"left",
                  transition:"all 0.15s",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                    <span style={{fontSize:14}}>{opt.icon}</span>
                    <span style={{color:selected===opt.id?GREEN:TEXT,fontWeight:700,fontSize:12,fontFamily:"'Sora',sans-serif"}}>
                      {opt.label}
                    </span>
                    {selected===opt.id && (
                      <span style={{marginLeft:"auto",color:GREEN,fontSize:14}}>✓</span>
                    )}
                  </div>
                  <div style={{color:DIM,fontSize:9.5,fontFamily:"'JetBrains Mono',monospace",paddingLeft:21}}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom range inputs */}
          {selected==="custom" && (
            <div style={{
              background:"rgba(99,102,241,0.04)",border:`1px solid ${BORDER}`,
              borderRadius:11,padding:"13px",marginBottom:16,
            }}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:GREEN}}/>
                    <span style={{color:GREEN,fontSize:9,fontWeight:700,letterSpacing:0.6}}>FROM</span>
                  </div>
                  <input type="date" value={customFrom}
                    onChange={e=>{setCustomFrom(e.target.value);if(e.target.value>customTo)setCustomTo(e.target.value);}}
                    style={{width:"100%",background:SURF2,border:`1px solid ${GREEN}33`,borderRadius:7,color:TEXT,fontSize:12,padding:"7px 9px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                </div>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:RED}}/>
                    <span style={{color:RED,fontSize:9,fontWeight:700,letterSpacing:0.6}}>TO</span>
                  </div>
                  <input type="date" value={customTo} min={customFrom}
                    onChange={e=>setCustomTo(e.target.value)}
                    style={{width:"100%",background:SURF2,border:`1px solid ${RED}33`,borderRadius:7,color:TEXT,fontSize:12,padding:"7px 9px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                </div>
              </div>
            </div>
          )}

          {/* Summary pill */}
          <div style={{
            background:"rgba(255,215,0,0.05)",border:`1px solid ${YELLOW}22`,
            borderRadius:10,padding:"10px 13px",marginBottom:18,
            display:"flex",alignItems:"center",gap:10,
          }}>
            <span style={{fontSize:14}}>📋</span>
            <div>
              <div style={{color:YELLOW,fontWeight:700,fontSize:12}}>
                {from === to ? fmtDateLabel(from) : `${fmtDateLabel(from)} – ${fmtDateLabel(to)}`}
              </div>
              <div style={{color:SUB,fontSize:10,marginTop:1}}>{days} day{days!==1?"s":""} · All employees</div>
            </div>
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={{
              flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,
              background:SURF,color:SUB,fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"'Sora',sans-serif",
            }}>Cancel</button>
            <button onClick={()=>onExport(from,to)} style={{
              flex:2,padding:"10px",borderRadius:10,border:"none",
              background:`linear-gradient(135deg,${GREEN},#22c55e)`,
              color:"#022c0a",fontSize:12.5,fontWeight:800,cursor:"pointer",fontFamily:"'Sora',sans-serif",
              display:"flex",alignItems:"center",justifyContent:"center",gap:7,
            }}>
              <span>⬇</span> Download Excel
            </button>
          </div>
        </div>
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
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Sora',sans-serif",padding:16}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
      `}</style>
      <div style={{
        background:"linear-gradient(155deg,#0D1545 0%,#070F30 100%)",
        border:`1px solid ${BORDER}`,borderRadius:20,padding:"38px 32px",
        width:300,maxWidth:"100%",textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",
        animation: shake ? "shake 0.6s ease" : "none",
      }}>
        <div style={{
          width:52,height:52,borderRadius:15,margin:"0 auto 18px",
          background:"rgba(236,72,153,0.1)",border:`1px solid ${MAGENTA}33`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,
        }}>🏠</div>
        <h2 style={{color:TEXT,fontWeight:800,fontSize:17,margin:"0 0 4px"}}>HR Panel</h2>
        <p style={{color:SUB,fontSize:11,margin:"0 0 22px"}}>Enter 4-digit passcode</p>
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
        <input autoFocus inputMode="numeric" value={code}
          onChange={e => handleInput(e.target.value)}
          style={{position:"absolute",opacity:0,width:1,height:1,pointerEvents:"none"}} />
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
          {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i) => (
            <button key={i}
              onClick={() => {
                if (k==="⌫") { handleInput(code.slice(0,-1)); return; }
                if (k==="") return;
                handleInput(code + String(k));
              }}
              style={{
                padding:"11px 0",borderRadius:8,
                background: k==="" ? "transparent" : "rgba(99,102,241,0.1)",
                border: k==="" ? "none" : `1px solid ${BORDER}`,
                color:TEXT,fontSize:16,fontWeight:700,
                cursor: k==="" ? "default" : "pointer",
                fontFamily:"'JetBrains Mono',monospace",transition:"background 0.12s",
              }}
              onMouseEnter={e=>{ if(k!=="") (e.currentTarget as HTMLButtonElement).style.background=`rgba(236,72,153,0.12)`; }}
              onMouseLeave={e=>{ if(k!=="") (e.currentTarget as HTMLButtonElement).style.background="rgba(99,102,241,0.1)"; }}
            >{k}</button>
          ))}
        </div>
        {shake && <p style={{color:RED,fontSize:11,marginTop:12,marginBottom:0}}>Incorrect passcode</p>}
        <p style={{color:DIM,fontSize:10,marginTop:14,marginBottom:0}}>Session lasts {SESS_MIN} minutes</p>
      </div>
    </div>
  );
}

export default function HrPanel() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <HrLogin onLogin={() => setAuthed(true)} />;
  return <HrMain onLogout={() => { clearAuth(); setAuthed(false); }} />;
}

// ── HR Main ───────────────────────────────────────────────────────────────────
type TabId = "remote" | "regularize";

function HrMain({ onLogout }: { onLogout: () => void }) {
  const [employees, setEmployees]     = useState<any[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [empSearch, setEmpSearch]     = useState("");
  const [showEmpDrop, setShowEmpDrop] = useState(false);
  const [showExport, setShowExport]   = useState(false);
  const [exporting, setExporting]     = useState(false);
  const [activeTab, setActiveTab]     = useState<TabId>("regularize");

  // multi-select (supports bulk for both tabs)
  const [selEmps, setSelEmps] = useState<any[]>([]);

  const now = new Date();
  const [fromDate, setFromDate] = useState(toDateStr(now));
  const [toDate,   setToDate]   = useState(toDateStr(now));
  const [fromHour, setFromHour] = useState(9);
  const [fromMin,  setFromMin]  = useState(0);
  const [toHour,   setToHour]   = useState(18);
  const [toMin,    setToMin]    = useState(0);
  const [note, setNote]         = useState("");
  const [saving, setSaving]     = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { items, add, remove } = useToast();

  const isRemote   = activeTab === "remote";
  const accent     = isRemote ? MAGENTA : BLUE;
  const accentDark = isRemote ? "#be185d" : "#2563eb";
  const tabIcon    = isRemote ? "🏠" : "🏢";

  useEffect(() => {
    (async () => {
      setLoadingEmps(true);
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs.map(d => d.data());
        const order = ["CDAI","CDIN","CDCN"];
        list.sort((a:any,b:any) => {
          const ga = order.findIndex(g=>a.emp_id.startsWith(g));
          const gb = order.findIndex(g=>b.emp_id.startsWith(g));
          if(ga!==gb) return (ga<0?99:ga)-(gb<0?99:gb);
          return (parseInt(a.emp_id.replace(/\D/g,""))||0)-(parseInt(b.emp_id.replace(/\D/g,""))||0);
        });
        setEmployees(list);
      } catch (_) {}
      finally { setLoadingEmps(false); }
    })();
  }, []);

  const filteredEmps = useMemo(() => employees.filter(e =>
    !empSearch || [e.name, e.emp_id, e.department]
      .some((v: string) => v?.toLowerCase().includes(empSearch.toLowerCase()))
  ), [employees, empSearch]);

  // ── selection helpers ──
  const isSelected = useCallback((id: string) => selEmps.some(e => e.emp_id === id), [selEmps]);
  const toggleEmp = (emp: any) =>
    setSelEmps(prev => prev.some(e => e.emp_id === emp.emp_id)
      ? prev.filter(e => e.emp_id !== emp.emp_id)
      : [...prev, emp]);
  const removeEmp = (id: string) => setSelEmps(prev => prev.filter(e => e.emp_id !== id));
  const selectAllFiltered = () => {
    setSelEmps(prev => {
      const map = new Map(prev.map(e => [e.emp_id, e]));
      filteredEmps.forEach(e => map.set(e.emp_id, e));
      return Array.from(map.values());
    });
  };
  const clearAll = () => setSelEmps([]);

  function dateRange(from: string, to: string): string[] {
    const dates: string[] = [];
    const cur = new Date(from), end = new Date(to);
    while (cur <= end) { dates.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1); }
    return dates;
  }

  const fromMins = fromHour*60+fromMin;
  const toMins_  = toHour*60+toMin;
  const duration = toMins_ > fromMins ? toMins_ - fromMins : 0;
  const dHr      = Math.floor(duration/60);
  const dMin     = duration%60;
  const rangeDays = fromDate && toDate && toDate >= fromDate ? dateRange(fromDate, toDate).length : 0;
  const totalRecords = selEmps.length * rangeDays;

  const fromStr = `${String(fromHour).padStart(2,"0")}:${String(fromMin).padStart(2,"0")}`;
  const toStr   = `${String(toHour).padStart(2,"0")}:${String(toMin).padStart(2,"0")}`;

  // ── validate then open confirmation ──
  function requestSubmit() {
    if (selEmps.length === 0) { add("Select at least one employee", "error"); return; }
    if (!fromDate || !toDate)  { add("Please pick dates", "error"); return; }
    if (toDate < fromDate)     { add("'To' date must be same or after 'From' date", "error"); return; }
    if (duration === 0)        { add("Check-out must be after check-in", "error"); return; }
    setConfirmOpen(true);
  }

  // ── write to firestore ──
  async function doSave() {
    setSaving(true);
    const dates = dateRange(fromDate, toDate);
    let ok = 0, fail = 0;

    await Promise.all(selEmps.map(async (emp) => {
      for (const date of dates) {
        try {
          const dateRef = doc(db, emp.emp_id, date);
          const snap    = await getDoc(dateRef);
          const existing = snap.exists() ? snap.data() : null;
          const prev: any[] = existing?.sessions || [];
          await setDoc(dateRef, {
            employee_name: existing?.employee_name || emp.name,
            sessions: [...prev, {
              session: prev.length + 1,
              check_in: fromStr,
              check_out: toStr,
              wfh: isRemote,                          // office regularization => false
              ...(isRemote ? {} : { regularized: true }),
              source: "hr",
              ...(note.trim() ? { note: note.trim() } : {}),
            }],
          });
          ok++;
        } catch (_) { fail++; }
      }
    }));

    setSaving(false);
    setConfirmOpen(false);

    const who   = selEmps.length === 1 ? selEmps[0].name : `${selEmps.length} employees`;
    const when  = dates.length === 1 ? dates[0] : `${dates.length} days`;
    const verb  = isRemote ? "Remote logged" : "Attendance regularized";

    if (fail === 0) {
      add(`${verb} · ${who} · ${when} ✓`);
      setNote(""); setSelEmps([]); setEmpSearch("");
    } else {
      add(`Saved ${ok}, failed ${fail}. Please retry the failed ones.`, ok > fail ? "ok" : "error");
    }
  }

  // ── Excel Export ─────────────────────────────────────────────────────────────
  async function handleExport(from: string, to: string) {
    setShowExport(false);
    setExporting(true);
    add("Generating report, please wait…");
    try {
      const dates = getDaysInRange(from, to);

      const empData: any[] = await Promise.all(
        employees.map(async (emp) => {
          const days: Record<string, any> = {};
          await Promise.all(dates.map(async (date) => {
            try {
              const snap = await getDoc(doc(db, emp.emp_id, date));
              if (snap.exists()) { days[date] = snap.data(); }
            } catch (_) {}
          }));
          return { emp, days };
        })
      );

      const wb = XLSX.utils.book_new();
      const ws_data: any[][] = [];

      const styleAbsent    = { fill: { fgColor: { rgb: "7F1D1D" } }, font: { color: { rgb: "FCA5A5" }, bold: true }, alignment: { horizontal: "center" } };
      const stylePresent8  = { fill: { fgColor: { rgb: "14532D" } }, font: { color: { rgb: "86EFAC" }, bold: true }, alignment: { horizontal: "center" } };
      const stylePresent9  = { fill: { fgColor: { rgb: "22C55E" } }, font: { color: { rgb: "052E16" }, bold: true }, alignment: { horizontal: "center" } };
      const styleRemote    = { fill: { fgColor: { rgb: "831843" } }, font: { color: { rgb: "F9A8D4" }, bold: true }, alignment: { horizontal: "center" } };
      const styleHoliday   = { fill: { fgColor: { rgb: "1E1354" } }, font: { color: { rgb: "A5B4FC" }, bold: true }, alignment: { horizontal: "center" } };
      const styleWeekend   = { fill: { fgColor: { rgb: "1E1B4B" } }, font: { color: { rgb: "6366F1" }, bold: true }, alignment: { horizontal: "center" } };
      const styleDefault   = { fill: { patternType: "solid", fgColor: { rgb: "F0FDF4" } }, font: { color: { rgb: "052E16" } } };
      const cellStyles: Record<string, any> = {};

      const title = from===to
        ? `Attendance Report – ${fmtDateLabel(from)}`
        : `Attendance Report – ${fmtDateLabel(from)} to ${fmtDateLabel(to)}`;
      ws_data.push([title]);
      ws_data.push([]);

      const headers = ["Emp ID", "Employee Name", ...dates.map(d => fmtDateLabel(d)), "Total Hours"];
      ws_data.push(headers);
      const headerRowIndex = ws_data.length - 1;
      const styleHeader = { fill: { fgColor: { rgb: "0F1848" } }, font: { color: { rgb: "EEF0FF" }, bold: true }, alignment: { horizontal: "center" } };

      for (const { emp, days } of empData) {
        const row: any[] = [emp.emp_id, emp.name];
        let totalHrs = 0;
        const rowIndex = ws_data.length;
        for (let di = 0; di < dates.length; di++) {
          const date = dates[di];
          const colIndex = 2 + di;
          const cellAddr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });

          const todayD = toDateStr(new Date());
          if (date > todayD) { row.push(""); continue; }
          if (isHoliday(date)) {
            row.push("H");
            cellStyles[cellAddr] = styleHoliday;
          } else if (isWeekend(date)) {
            row.push("WE");
            cellStyles[cellAddr] = styleWeekend;
          } else {
            const dayData = days[date];
            if (dayData && dayData.sessions?.length > 0) {
              const sessions = dayData.sessions;
              const isWfh = sessions.every((s: any) => s.wfh === true);
              const hrs = calcHours(sessions);
              totalHrs += hrs;
              const hrsStr = hrs > 0 ? `(${hrs.toFixed(1)})` : "";
              if (isWfh) {
                row.push(`R${hrsStr}`);
                cellStyles[cellAddr] = styleRemote;
              } else {
                row.push(`P${hrsStr}`);
                cellStyles[cellAddr] = hrs >= 8 ? stylePresent9 : stylePresent8;
              }
            } else {
              row.push("A");
              cellStyles[cellAddr] = styleAbsent;
            }
          }
        }
        row.push(Math.round(totalHrs*100)/100);
        ws_data.push(row);
      }

      ws_data.push([]);
      ws_data.push(["Legend:", "P = Present", "R = Remote/WFH", "A = Absent", "H = Holiday", "WE = Weekend", "(x.x) = Hours worked"]);

      const ws = XLSX.utils.aoa_to_sheet(ws_data);

      const colWidths = [
        { wch: 12 }, { wch: 22 },
        ...dates.map(() => ({ wch: 10 })),
        { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 12 },
      ];
      ws["!cols"] = colWidths;

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (ws[addr] && !ws[addr].s) ws[addr].s = styleDefault;
          else if (ws[addr] && ws[addr].s && !ws[addr].s.fill) ws[addr].s = { ...ws[addr].s, fill: styleDefault.fill };
        }
      }

      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c });
        if (ws[addr]) ws[addr].s = styleHeader;
      }

      for (const [addr, style] of Object.entries(cellStyles)) {
        if (ws[addr]) ws[addr].s = style;
      }

      const totalCols = headers.length;
      ws["!merges"] = [{ s:{r:0,c:0}, e:{r:0,c:totalCols-1} }];

      XLSX.utils.book_append_sheet(wb, ws, "Attendance");

      const safeTo   = to.replace(/-/g,"");
      const safeFrom = from.replace(/-/g,"");
      const fileName = from===to
        ? `attendance_${safeFrom}.xlsx`
        : `attendance_${safeFrom}_${safeTo}.xlsx`;

      XLSX.writeFile(wb, fileName, { cellStyles: true });
      add(`Report downloaded: ${fileName} ✓`);
    } catch (e: any) {
      add("Export failed: " + e.message, "error");
    } finally {
      setExporting(false);
    }
  }

  const TYPE_COLORS: Record<string,string> = {
    permanent:YELLOW, consultant:BLUE, intern:"#C084FC", guest:TEAL,
  };

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: "regularize", label: "Regularize Office", icon: "🏢" },
    { id: "remote",     label: "Log Remote Work",   icon: "🏠" },
  ];

  const submitLabel = isRemote
    ? (totalRecords > 1 ? `Log Remote · ${totalRecords} records` : "Log Remote Work")
    : (totalRecords > 1 ? `Regularize · ${totalRecords} records` : "Regularize Attendance");

  return (
    <div style={{minHeight:"100vh",background:BG,fontFamily:"'Sora',sans-serif",color:TEXT}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.3);border-radius:3px;}
        option{background:#0B1340;color:#EEF0FF;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.7);}
        .emp-row:hover{background:rgba(99,102,241,0.12)!important;}
        select:focus{outline:none;}
        .tab-btn{transition:all 0.15s;}
        .save-btn:hover:not(:disabled){opacity:0.9;}
        .export-btn:hover{opacity:0.88;}
        @media (max-width: 720px) {
          .hr-header   { padding: 0 12px !important; }
          .hr-page     { padding: 16px 12px !important; }
          .hr-form-body{ grid-template-columns: 1fr !important; padding: 18px 16px 20px !important; }
          .hr-tabs     { padding: 0 12px !important; }
        }
      `}</style>

      <ToastContainer items={items} remove={remove} />
      {showExport && <ExportModal onClose={()=>setShowExport(false)} onExport={handleExport} />}

      {confirmOpen && (
        <ConfirmModal
          accent={accent}
          icon={tabIcon}
          heading={isRemote ? "Confirm Remote Work" : "Confirm Regularization"}
          sub={isRemote ? "Logged as work-from-home sessions" : "Marked as in-office attendance"}
          rows={[
            { label: "Date range", value: fromDate === toDate ? fromDate : `${fromDate} → ${toDate}` },
            { label: "Days", value: `${rangeDays}` },
            { label: "Hours / day", value: `${fromStr} – ${toStr}  (${dHr}h ${String(dMin).padStart(2,"0")}m)` },
            { label: "Total records", value: `${totalRecords}` },
          ]}
          employees={selEmps}
          note={note.trim()}
          confirmLabel={isRemote ? "Log Remote" : "Regularize"}
          busy={saving}
          onConfirm={doSave}
          onClose={()=>{ if(!saving) setConfirmOpen(false); }}
        />
      )}

      {/* ── Header ── */}
      <header className="hr-header" style={{
        background:"linear-gradient(180deg,rgba(10,18,64,0.98),rgba(6,13,46,0.95))",
        borderBottom:`1px solid ${BORDER}`,padding:"0 24px",
        display:"flex",alignItems:"center",gap:12,minHeight:58,
        position:"sticky",top:0,zIndex:40,backdropFilter:"blur(12px)",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{
            width:34,height:34,borderRadius:10,
            background:"rgba(96,165,250,0.1)",border:`1px solid ${BLUE}33`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
          }}>🛠</div>
          <div>
            <div style={{color:TEXT,fontWeight:800,fontSize:14,lineHeight:1}}>HR Panel</div>
            <div style={{color:BLUE,fontSize:9.5,marginTop:2,fontWeight:600,letterSpacing:0.3}}>Attendance Tools</div>
          </div>
        </div>

        <div style={{flex:1}}/>

        <button
          onClick={()=>setShowExport(true)}
          disabled={exporting}
          className="export-btn"
          style={{
            display:"flex",alignItems:"center",gap:7,
            background:"rgba(74,222,128,0.08)",border:`1px solid ${GREEN}44`,
            borderRadius:10,padding:"7px 14px",cursor:"pointer",transition:"all 0.15s",
            color:GREEN,fontSize:12,fontWeight:700,fontFamily:"'Sora',sans-serif",whiteSpace:"nowrap",
          }}>
          <span style={{fontSize:13}}>⬇</span>
          {exporting ? "Generating…" : "Export Excel"}
        </button>

        <div style={{width:1,height:22,background:BORDER}}/>

        <button onClick={onLogout} style={{
          background:"rgba(248,113,113,0.08)",border:`1px solid ${RED}33`,
          borderRadius:8,color:RED,fontSize:10.5,fontWeight:600,padding:"5px 12px",
          cursor:"pointer",fontFamily:"'Sora',sans-serif",
        }}>Logout</button>
      </header>

      {/* ── Page ── */}
      <div className="hr-page" style={{maxWidth:960,margin:"0 auto",padding:"24px 20px"}}>

        {/* ── Main card ── */}
        <div style={{
          background:`linear-gradient(155deg,${SURF2},${BG})`,
          border:`1px solid ${BORDER}`,borderRadius:16,
          boxShadow:"0 12px 40px rgba(0,0,0,0.4)",overflow:"hidden",
        }}>
          {/* Tabs */}
          <div className="hr-tabs" style={{
            display:"flex",borderBottom:`1px solid ${BORDER}`,
            background:"rgba(6,13,46,0.6)",padding:"0 20px",
          }}>
            {TABS.map(tab => {
              const on = activeTab === tab.id;
              const tabAccent = tab.id === "remote" ? MAGENTA : BLUE;
              return (
                <button key={tab.id}
                  className="tab-btn"
                  onClick={()=>setActiveTab(tab.id)}
                  style={{
                    display:"flex",alignItems:"center",gap:7,
                    padding:"14px 16px",border:"none",cursor:"pointer",
                    background:"transparent",fontFamily:"'Sora',sans-serif",
                    fontSize:12.5,fontWeight:700,
                    color: on ? tabAccent : SUB,
                    borderBottom: on ? `2px solid ${tabAccent}` : "2px solid transparent",
                    transition:"all 0.15s",marginBottom:-1,
                  }}>
                  <span>{tab.icon}</span>{tab.label}
                </button>
              );
            })}
          </div>

          {/* Context strip explaining the active mode */}
          <div style={{
            padding:"10px 22px",borderBottom:`1px solid ${BORDER}`,
            background:`${accent}0A`,display:"flex",alignItems:"center",gap:9,
          }}>
            <span style={{fontSize:14}}>{isRemote ? "🏠" : "🏢"}</span>
            <span style={{color:SUB,fontSize:11.5,lineHeight:1.5}}>
              {isRemote
                ? "Logs the selected people as working from home for the chosen dates."
                : "Marks the selected people as present in office — use when face-scan was missed (network drop, off-site meeting, etc.). Counts as a normal in-office day."}
            </span>
          </div>

          {/* Form body */}
          <div className="hr-form-body" style={{padding:"22px 22px 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,alignItems:"start"}}>

            {/* ── LEFT ── */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:3,height:18,borderRadius:2,background:accent}}/>
                <span style={{color:TEXT,fontWeight:700,fontSize:13}}>Employees & Date Range</span>
              </div>

              {/* Employee multi-select */}
              <div style={{position:"relative"}}>
                <Label>Employees * (select one or many)</Label>
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:13,pointerEvents:"none"}}>🔍</span>
                  <input
                    value={empSearch}
                    onChange={e=>{setEmpSearch(e.target.value);setShowEmpDrop(true);}}
                    onFocus={()=>setShowEmpDrop(true)}
                    onBlur={()=>setTimeout(()=>setShowEmpDrop(false),180)}
                    placeholder={loadingEmps?"Loading employees…":"Search name or ID, then tap to add…"}
                    style={{
                      width:"100%",background:SURF3,
                      border:`1px solid ${selEmps.length?accent+"66":BORDER}`,
                      borderRadius:9,color:TEXT,fontSize:12.5,padding:"9px 32px 9px 32px",
                      outline:"none",fontFamily:"'Sora',sans-serif",
                    }}
                  />
                  {empSearch && (
                    <button onClick={()=>setEmpSearch("")}
                      style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",color:DIM,fontSize:16,cursor:"pointer",lineHeight:1}}>×</button>
                  )}
                </div>

                {/* Selection toolbar */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                  <span style={{
                    color: selEmps.length ? accent : DIM, fontSize:10.5, fontWeight:700,
                    background: selEmps.length ? `${accent}14` : "transparent",
                    border:`1px solid ${selEmps.length ? accent+"33" : BORDER}`,
                    borderRadius:20, padding:"2px 9px",
                  }}>{selEmps.length} selected</span>
                  <div style={{flex:1}}/>
                  <button onClick={selectAllFiltered} style={{
                    background:"rgba(99,102,241,0.1)",border:`1px solid ${BORDER}`,borderRadius:7,
                    color:SUB,fontSize:10,fontWeight:700,padding:"4px 9px",cursor:"pointer",fontFamily:"inherit",
                  }}>Select all{empSearch?` (${filteredEmps.length})`:""}</button>
                  {selEmps.length>0 && (
                    <button onClick={clearAll} style={{
                      background:"rgba(248,113,113,0.08)",border:`1px solid ${RED}33`,borderRadius:7,
                      color:RED,fontSize:10,fontWeight:700,padding:"4px 9px",cursor:"pointer",fontFamily:"inherit",
                    }}>Clear</button>
                  )}
                </div>

                {/* Selected chips */}
                {selEmps.length > 0 && (
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:9,maxHeight:120,overflowY:"auto"}}>
                    {selEmps.map(emp => {
                      const c = TYPE_COLORS[emp.type] || YELLOW;
                      return (
                        <span key={emp.emp_id} style={{
                          display:"flex",alignItems:"center",gap:6,background:`${accent}10`,
                          border:`1px solid ${accent}33`,borderRadius:20,padding:"3px 6px 3px 4px",
                        }}>
                          <span style={{
                            width:20,height:20,borderRadius:"50%",flexShrink:0,overflow:"hidden",background:BG,
                            border:`1.5px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:8,fontWeight:700,color:c,
                          }}>
                            {emp.profile_image ? <img src={emp.profile_image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(emp.name)}
                          </span>
                          <span style={{color:TEXT,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{emp.name}</span>
                          <button onClick={()=>removeEmp(emp.emp_id)} style={{
                            background:"none",border:"none",color:accent,fontSize:14,cursor:"pointer",
                            lineHeight:1,padding:"0 2px",
                          }}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Dropdown */}
                {showEmpDrop && filteredEmps.length > 0 && (
                  <div onMouseDown={e=>e.preventDefault()} style={{
                    position:"absolute",top:"calc(100% + 5px)",left:0,right:0,zIndex:100,
                    background:SURF2,border:`1px solid ${BORDER}`,borderRadius:10,
                    marginTop:3,maxHeight:240,overflowY:"auto",
                    boxShadow:"0 14px 40px rgba(0,0,0,0.65)",
                  }}>
                    {filteredEmps.map(emp => {
                      const on = isSelected(emp.emp_id);
                      const c = TYPE_COLORS[emp.type] || YELLOW;
                      return (
                        <div key={emp.emp_id} className="emp-row"
                          onClick={()=>toggleEmp(emp)}
                          style={{display:"flex",alignItems:"center",gap:9,padding:"8px 12px",cursor:"pointer",
                            background: on ? `${accent}12` : "transparent",
                            borderBottom:`1px solid rgba(99,102,241,0.07)`,transition:"background 0.1s"}}>
                          {/* checkbox */}
                          <div style={{
                            width:16,height:16,borderRadius:5,flexShrink:0,
                            border:`1.5px solid ${on?accent:BORDER}`,background:on?accent:"transparent",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            color:"#0B1020",fontSize:11,fontWeight:900,
                          }}>{on?"✓":""}</div>
                          <div style={{
                            width:24,height:24,borderRadius:"50%",flexShrink:0,overflow:"hidden",
                            background:BG,border:`1.5px solid ${c}44`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                          }}>
                            {emp.profile_image
                              ? <img src={emp.profile_image} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                              : <span style={{color:c,fontWeight:700,fontSize:9}}>{initials(emp.name)}</span>
                            }
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{color:TEXT,fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{emp.name}</div>
                            <div style={{color:DIM,fontSize:9,fontFamily:"'JetBrains Mono',monospace"}}>{emp.emp_id} · {emp.department}</div>
                          </div>
                          <span style={{
                            fontSize:8.5,color:c,flexShrink:0,
                            background:`${c}14`,border:`1px solid ${c}22`,
                            borderRadius:20,padding:"1px 6px",textTransform:"capitalize",
                          }}>{emp.type}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Date range */}
              <div>
                <Label>Date Range *</Label>
                <div style={{background:"rgba(99,102,241,0.04)",border:`1px solid ${BORDER}`,borderRadius:11,padding:"13px"}}>
                  <div style={{marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:GREEN,boxShadow:`0 0 4px ${GREEN}`}}/>
                      <span style={{color:GREEN,fontSize:9,fontWeight:700,letterSpacing:0.6}}>FROM</span>
                    </div>
                    <div style={{display:"flex",gap:7}}>
                      <input type="date" value={fromDate}
                        onChange={e=>{setFromDate(e.target.value);if(e.target.value>toDate)setToDate(e.target.value);}}
                        style={{flex:1,background:SURF2,border:`1px solid ${GREEN}33`,borderRadius:8,color:TEXT,fontSize:12,padding:"7px 9px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                      <button onClick={()=>{const t=toDateStr(new Date());setFromDate(t);if(t>toDate)setToDate(t);}}
                        style={{background:"rgba(74,222,128,0.1)",border:`1px solid ${GREEN}44`,borderRadius:7,color:GREEN,fontSize:9,fontWeight:700,padding:"7px 10px",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>Today</button>
                    </div>
                  </div>
                  <div style={{textAlign:"center",color:DIM,fontSize:12,margin:"2px 0"}}>↕</div>
                  <div style={{marginTop:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:RED,boxShadow:`0 0 4px ${RED}`}}/>
                      <span style={{color:RED,fontSize:9,fontWeight:700,letterSpacing:0.6}}>TO</span>
                    </div>
                    <div style={{display:"flex",gap:7}}>
                      <input type="date" value={toDate} min={fromDate}
                        onChange={e=>setToDate(e.target.value)}
                        style={{flex:1,background:SURF2,border:`1px solid ${RED}33`,borderRadius:8,color:TEXT,fontSize:12,padding:"7px 9px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                      <button onClick={()=>setToDate(toDateStr(new Date()))}
                        style={{background:"rgba(248,113,113,0.1)",border:`1px solid ${RED}44`,borderRadius:7,color:RED,fontSize:9,fontWeight:700,padding:"7px 10px",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>Today</button>
                    </div>
                  </div>

                  {fromDate && toDate && toDate >= fromDate && (
                    <div style={{
                      marginTop:10,display:"flex",alignItems:"center",gap:7,
                      background:`${accent}0F`,border:`1px solid ${accent}33`,
                      borderRadius:8,padding:"6px 10px",
                    }}>
                      <span style={{color:accent,fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {fromDate}{fromDate!==toDate?` → ${toDate}`:""}
                      </span>
                      <span style={{
                        background:`${accent}1F`,border:`1px solid ${accent}33`,
                        borderRadius:20,padding:"1px 8px",color:accent,fontSize:10,fontWeight:700,flexShrink:0,
                      }}>{rangeDays} {rangeDays===1?"day":"days"}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── RIGHT ── */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:3,height:18,borderRadius:2,background:BLUE}}/>
                <span style={{color:TEXT,fontWeight:700,fontSize:13}}>Work Hours</span>
              </div>

              <TimeSelect label="CHECK IN"  hour={fromHour} minute={fromMin} onHour={setFromHour} onMinute={setFromMin} color={GREEN}/>
              <TimeSelect label="CHECK OUT" hour={toHour}   minute={toMin}   onHour={setToHour}   onMinute={setToMin}   color={RED}/>

              {/* Duration */}
              <div style={{
                background: duration>0?"rgba(96,165,250,0.07)":"rgba(58,74,122,0.08)",
                border:`1px solid ${duration>0?BLUE+"44":BORDER}`,
                borderRadius:11,padding:"11px 14px",
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{fontSize:16}}>⏱</span>
                {duration>0 ? (
                  <div>
                    <div style={{color:BLUE,fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:15}}>
                      {dHr}h {String(dMin).padStart(2,"0")}m per day
                    </div>
                    {(rangeDays>1 || selEmps.length>1) && (
                      <div style={{color:SUB,fontSize:10,marginTop:2}}>
                        {selEmps.length>1 ? `${selEmps.length} employees · ` : ""}
                        {rangeDays>1 ? `${rangeDays} days · ` : ""}
                        {totalRecords} record{totalRecords!==1?"s":""}
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{color:DIM,fontSize:12}}>Set a valid time range</span>
                )}
              </div>

              {/* Reason / Note */}
              <div>
                <Label>Reason / Note (optional)</Label>
                <input type="text" value={note} onChange={e=>setNote(e.target.value)}
                  placeholder="e.g. Network drop, off-site meeting, scanner issue…"
                  maxLength={80}
                  style={{
                    width:"100%",background:SURF3,border:`1px solid ${BORDER}`,
                    borderRadius:9,color:TEXT,fontSize:12.5,padding:"9px 11px",
                    outline:"none",fontFamily:"'Sora',sans-serif",caretColor:accent,
                  }}
                />
              </div>

              {/* Submit */}
              <button
                onClick={requestSubmit}
                disabled={selEmps.length===0 || saving || duration===0}
                className="save-btn"
                style={{
                  width:"100%",padding:"12px",borderRadius:11,border:"none",
                  background: (selEmps.length===0||saving||duration===0)
                    ? `${accent}26`
                    : `linear-gradient(135deg,${accent},${accentDark})`,
                  color: (selEmps.length===0||saving||duration===0) ? `${accent}99` : "#fff",
                  fontSize:13,fontWeight:800,letterSpacing:0.3,
                  cursor: (selEmps.length===0||saving||duration===0) ? "not-allowed" : "pointer",
                  fontFamily:"'Sora',sans-serif",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  transition:"all 0.15s",
                }}>
                <span style={{fontSize:15}}>{tabIcon}</span>
                {saving ? "Saving…" : submitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}