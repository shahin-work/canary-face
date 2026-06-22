import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import * as XLSX from "xlsx-js-style";
import emailjs from "@emailjs/browser";
import logo from "../assets/react.png";

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
const NAME_KEY = "hr_user_name";   // HR person's display name (per device)

function isAuthed() {
  const ts = localStorage.getItem(SESS_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts) < SESS_MIN * 20 * 1000;
}
function setAuth()   { localStorage.setItem(SESS_KEY, Date.now().toString()); }
function clearAuth() { localStorage.removeItem(SESS_KEY); }
function getHrName(): string { return (localStorage.getItem(NAME_KEY) || "").trim(); }
function saveHrName(n: string) { localStorage.setItem(NAME_KEY, n.trim()); }

// ── Colours ───────────────────────────────────────────────────────────────────
const BG      = "#0D0D0D";
const SURF    = "#121212";
const SURF2   = "#121212";
const SURF3   = "#1A1A1A";
const BORDER  = "rgba(30,54,194,0.30)";
const TEXT    = "#FFFFFF";
const SUB     = "#C8C8C8";
const DIM     = "#7A7A7A";
const YELLOW  = "#1E36C2";   // unified to brand blue (decorative accent)
const RED     = "#F87171";
const GREEN   = "#4ADE80";
const BLUE    = "#1E36C2";
const TEAL    = "#1E36C2";   // unified to brand blue
const MAGENTA = "#1E36C2";   // unified to brand blue
// Shared max content width so every HR tab fills the screen consistently.
const HR_MAX_W = 1640;
// Marquee motion — kept identical to the employee Attendance page so the preview matches exactly.
const NOTICE_MARQUEE_SPEED = 0.9; // px per frame (higher = faster)
const NOTICE_MARQUEE_GAP   = 20;  // px gap between the two copies of the track

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
function getWeekByOffset(offset: number): string[] {
  const n = new Date();
  const dow = n.getDay();
  const mon = new Date(n); mon.setDate(n.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  const arr: string[] = [];
  for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); arr.push(toDateStr(d)); }
  return arr;
}
function initials(name: string) {
  return (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}
function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr), dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) return Math.ceil(d.getDate() / 7) % 2 === 0;
  return false;
}
const HOLIDAYS = new Set([
  "2026-02-15","2026-03-20","2026-04-03","2026-04-05","2026-04-15",
  "2026-05-01","2026-05-27","2026-08-15","2026-08-25","2026-08-26",
  "2026-09-21","2026-10-02","2026-10-20","2026-11-08","2026-12-25",
]);
function isHoliday(d: string) { return HOLIDAYS.has(d); }

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
    <div style={{ background: `${color}0D`, border:`1px solid ${color}22`, borderRadius:11, padding:"12px 13px" }}>
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

// ── Reusable dashboard pieces ───────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, loading, people, alignRight }: {
  icon: string; label: string; value: React.ReactNode; sub?: string; color: string;
  loading?: boolean; people?: any[]; alignRight?: boolean;
}) {
  const [hover, setHover]   = useState(false);
  const [pinned, setPinned] = useState(false);   // clicked-open state
  const hasList = !loading && !!people && people.length > 0;
  const open = hasList && (hover || pinned);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position:"relative",
        background:SURF2, border:`1px solid ${open ? color+"66" : BORDER}`, borderRadius:14,
        padding:"17px 18px", display:"flex", flexDirection:"column", gap:12, minWidth:0,
        boxShadow:"0 1px 2px rgba(0,0,0,0.18)", transition:"border 0.15s",
      }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <span style={{color:SUB,fontSize:10.5,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
        <span style={{
          width:30,height:30,borderRadius:9,flexShrink:0,
          background:`${color}18`,border:`1px solid ${color}40`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
        }}>{icon}</span>
      </div>

      <div style={{display:"flex",alignItems:"baseline",gap:8}}>
        <span style={{color:TEXT,fontSize:30,fontWeight:800,lineHeight:1,fontFamily:"'Sora',sans-serif"}}>
          {loading ? "—" : value}
        </span>
        {sub && !loading && <span style={{color,fontSize:11,fontWeight:700}}>{sub}</span>}

        {/* down-arrow toggle — only when there's a list */}
        {hasList && (
          <button
            onClick={() => setPinned(p => !p)}
            title="Show who"
            style={{
              marginLeft:"auto", width:26, height:26, borderRadius:8, flexShrink:0,
              background:`${color}14`, border:`1px solid ${color}33`, color,
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:13, lineHeight:1,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition:"transform 0.18s, background 0.15s",
            }}>▾</button>
        )}
      </div>

      {/* dropdown / popover with the actual people */}
      {open && (
        <div style={{
          position:"absolute", top:"100%", zIndex:60,
          ...(alignRight ? { right:0 } : { left:0 }),
          paddingTop:8,   // transparent bridge so the gap doesn't break the hover
        }}>
          <div style={{
            minWidth:210, maxWidth:300, maxHeight:280, overflowY:"auto",
            background:SURF2, border:`1px solid ${color}55`, borderRadius:12,
            boxShadow:"0 16px 44px rgba(0,0,0,0.6)", padding:8,
          }}>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between", gap:8,
              padding:"4px 6px 8px", borderBottom:`1px solid ${BORDER}`, marginBottom:6,
            }}>
              <span style={{color:SUB,fontSize:9.5,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase"}}>
                {label} · {people!.length}
              </span>
              {pinned && (
                <button onClick={() => setPinned(false)} style={{
                  background:"none", border:"none", color:DIM, fontSize:15, cursor:"pointer", lineHeight:1,
                }}>×</button>
              )}
            </div>
            {people!.map((emp:any) => (
              <div key={emp.emp_id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 6px",borderRadius:8}}>
                <span style={{
                  width:24,height:24,borderRadius:"50%",flexShrink:0,overflow:"hidden",background:BG,
                  border:`1.5px solid ${color}55`,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:8,fontWeight:700,color,
                }}>
                  {emp.profile_image
                    ? <img src={emp.profile_image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : initials(emp.name)}
                </span>
                <div style={{minWidth:0}}>
                  <div style={{color:TEXT,fontSize:11.5,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{emp.name}</div>
                  <div style={{color:DIM,fontSize:8.5,fontFamily:"'JetBrains Mono',monospace"}}>{emp.emp_id}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ icon, title, right, children, bodyStyle }: {
  icon?: string; title: string; right?: React.ReactNode; children: React.ReactNode; bodyStyle?: React.CSSProperties;
}) {
  return (
    <div style={{
      background:SURF2, border:`1px solid ${BORDER}`, borderRadius:14, overflow:"hidden",
      display:"flex", flexDirection:"column",
    }}>
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"13px 16px",borderBottom:`1px solid ${BORDER}`}}>
        {icon && <span style={{fontSize:15}}>{icon}</span>}
        <span style={{color:TEXT,fontWeight:700,fontSize:13}}>{title}</span>
        {right && <span style={{marginLeft:"auto"}}>{right}</span>}
      </div>
      <div style={{padding:"14px 16px", ...(bodyStyle||{})}}>{children}</div>
    </div>
  );
}

function Pill({ children, color = SUB }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      background:`${color}14`, border:`1px solid ${color}33`, color,
      borderRadius:20, padding:"3px 10px", fontSize:10, fontWeight:700,
      fontFamily:"'Sora',sans-serif", whiteSpace:"nowrap",
    }}>{children}</span>
  );
}

const HEAT: Record<string,{bg:string;fg:string}> = {
  P8: { bg:"#1E36C2",               fg:"#FFFFFF" },    // ≥8h → blue, shows "P"
  P:  { bg:"#FFFFFF",               fg:"#1E36C2" },    // <8h → white bg, blue text, shows "P(x.x)"
  R:  { bg:"rgba(236,72,153,0.78)", fg:"#2A0716" },
  A:  { bg:"#4A1010",               fg:"#F3C2C2" },    // absent → dark brown-red, shows "L"
  L:  { bg:"#4A1010",               fg:"#F3C2C2" },    // HR-added leave → same dark brown-red
  H:  { bg:"rgba(255,215,0,0.16)",  fg:"#FFD700" },
  W:  { bg:"rgba(30,54,194,0.45)",  fg:"#DDE3FF" },    // weekend → blue
  "": { bg:"rgba(30,54,194,0.04)",  fg:"#7A7A7A" },
};

function WeeklyHeatmap({ days, rows, loading }: {
  days: { date:string; dow:string; label:string; isToday:boolean }[];
  rows: { emp:any; cells:string[] }[];
  loading: boolean;
}) {
  if (loading) return <div style={{padding:"34px 0",textAlign:"center",color:SUB,fontSize:12}}>Loading the week…</div>;
  if (!rows.length) return <div style={{padding:"34px 0",textAlign:"center",color:SUB,fontSize:12}}>No employees found.</div>;
  const cols = `158px repeat(${days.length}, minmax(30px, 200px))`;

  // Per-day completion status across everyone:
  //   "cross" → at least one person was present but under 8h (incomplete)
  //   "tick"  → everyone with a working day is complete (P8 / R / A) and nobody is incomplete
  //   null    → weekend / holiday / no working data → no marker
  const dayStatus = (i: number): "tick" | "cross" | null => {
    let hasWork = false, anyIncomplete = false;
    for (const r of rows) {
      const c = r.cells[i] || "";
      if (c === "H" || c === "W" || c === "") continue;
      hasWork = true;
      if (c.startsWith("P(")) anyIncomplete = true;   // present but < 8h
    }
    if (!hasWork) return null;
    return anyIncomplete ? "cross" : "tick";
  };

  return (
    <div style={{overflowX:"auto"}}>
      <div style={{minWidth: 158 + days.length*42}}>
        {/* day header */}
        <div style={{display:"grid",gridTemplateColumns:cols,gap:4,marginBottom:6}}>
          <div/>
          {days.map((d, i) => {
            const ds = dayStatus(i);
            return (
            <div key={d.date} style={{textAlign:"center"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                <span style={{color:d.isToday?BLUE:SUB,fontSize:9.5,fontWeight:700}}>{d.dow}</span>
                {ds === "tick" && (
                  <span title="Everyone complete (8h+) or absent" style={{
                    width:12,height:12,borderRadius:"50%",background:GREEN,
                    display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                  }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#06210F" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                )}
                {ds === "cross" && (
                  <span title="Someone present but under 8h" style={{
                    width:11,height:11,borderRadius:"50%",background:RED,
                    display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                  }}>
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#330808" strokeWidth="3.5" strokeLinecap="round"/></svg>
                  </span>
                )}
              </div>
              <div style={{color:DIM,fontSize:9.1,fontFamily:"'JetBrains Mono',monospace"}}>{d.label}</div>
            </div>
          );})}
        </div>
        {/* rows */}
        <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:300,overflowY:"auto",paddingRight:2}}>
          {rows.map(r => (
            <div key={r.emp.emp_id} style={{display:"grid",gridTemplateColumns:cols,gap:4,alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0,paddingRight:4}}>
                <span style={{
                  width:22,height:22,borderRadius:"50%",flexShrink:0,background:BG,border:`1px solid ${BORDER}`,
                  display:"flex",alignItems:"center",justifyContent:"center",color:SUB,fontSize:11,fontWeight:700,
                }}>{initials(r.emp.name)}</span>
                <span style={{color:TEXT,fontSize:11,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.emp.name}</span>
              </div>
              {r.cells.map((st,i) => {
                const isUnder8 = st.startsWith("P(");          // under-8 cell (white bg)
                const key = st === "P8" ? "P8" : isUnder8 ? "P" : st;
                const h = HEAT[key] || HEAT[""];
                // both "A" (no-show) and "L" (HR leave) display as "L"
                const display = st === "P8" ? "P" : st === "A" ? "L" : (st || "·");
                const tip = st === "L" ? "On leave (HR)" : st === "A" ? "Leave / absent" : display;
                return <div key={i} title={`${r.emp.name} · ${days[i].label}: ${tip}`} style={{
                  height:24,borderRadius:6,background:h.bg,color:h.fg,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize: isUnder8 ? 11 : 9.5, fontWeight:800,
                }}>{display}</div>;
              })}
            </div>
          ))}
        </div>
        {/* legend */}
        <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:13,paddingTop:11,borderTop:`1px solid ${BORDER}`}}>
          {([["Office (8h+)",HEAT.P8.bg],["Office (<8h)",HEAT.P.bg],["Remote",HEAT.R.bg],["Leave",HEAT.A.bg],["Holiday","rgba(255,215,0,0.45)"],["Weekend",HEAT.W.bg]] as const).map(([lab,col]) => (
            <span key={lab} style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:13,height:13,borderRadius:4,background:col,display:"inline-block"}}/>
              <span style={{color:SUB,fontSize:10}}>{lab}</span>
            </span>
          ))}
        </div>
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
  const TYPE_COLORS: Record<string,string> = { permanent:YELLOW, consultant:BLUE, intern:BLUE, guest:TEAL };
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
                  display:"flex",alignItems:"center",gap:6,background:"rgba(30,54,194,0.08)",
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
              background:"rgba(30,54,194,0.05)",border:`1px solid ${YELLOW}22`,borderRadius:9,
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

function ExportModal({ onClose, onExport }: { onClose:()=>void; onExport:(from:string,to:string,theme:string)=>void }) {
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
  const [theme, setTheme] = useState<"filled"|"minimal">("filled");
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
            background:"rgba(30,54,194,0.08)",border:`1px solid ${BLUE}33`,
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
                  background: selected===opt.id ? "rgba(30,54,194,0.1)" : "rgba(30,54,194,0.05)",
                  border: `1px solid ${selected===opt.id ? BLUE+"55" : BORDER}`,
                  borderRadius:11,padding:"11px 13px",cursor:"pointer",textAlign:"left",
                  transition:"all 0.15s",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                    <span style={{fontSize:14}}>{opt.icon}</span>
                    <span style={{color:selected===opt.id?BLUE:TEXT,fontWeight:700,fontSize:12,fontFamily:"'Sora',sans-serif"}}>
                      {opt.label}
                    </span>
                    {selected===opt.id && (
                      <span style={{marginLeft:"auto",color:BLUE,fontSize:14}}>✓</span>
                    )}
                  </div>
                  <div style={{color:DIM,fontSize:9.5,fontFamily:"'JetBrains Mono',monospace",paddingLeft:21}}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Excel style picker */}
          <div style={{marginBottom:16}}>
            <Label>Excel Style</Label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {([
                { id:"minimal", label:"Clean" },
                { id:"filled",  label:"Highlighted" },
              ] as const).map(opt => (
                <button key={opt.id} onClick={()=>setTheme(opt.id)} style={{
                  background: theme===opt.id ? "rgba(30,54,194,0.1)" : "rgba(30,54,194,0.05)",
                  border: `1px solid ${theme===opt.id ? BLUE+"55" : BORDER}`,
                  borderRadius:11,padding:"11px 13px",cursor:"pointer",textAlign:"left",transition:"all 0.15s",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                    <span style={{color:theme===opt.id?BLUE:TEXT,fontWeight:700,fontSize:12,fontFamily:"'Sora',sans-serif"}}>{opt.label}</span>
                    {theme===opt.id && <span style={{marginLeft:"auto",color:BLUE,fontSize:14}}>✓</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom range inputs */}
          {selected==="custom" && (
            <div style={{
              background:"rgba(30,54,194,0.04)",border:`1px solid ${BORDER}`,
              borderRadius:11,padding:"13px",marginBottom:16,
            }}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:BLUE}}/>
                    <span style={{color:BLUE,fontSize:9,fontWeight:700,letterSpacing:0.6}}>FROM</span>
                  </div>
                  <input type="date" value={customFrom}
                    onChange={e=>{setCustomFrom(e.target.value);if(e.target.value>customTo)setCustomTo(e.target.value);}}
                    style={{width:"100%",background:SURF2,border:`1px solid ${BLUE}33`,borderRadius:7,color:TEXT,fontSize:12,padding:"7px 9px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                </div>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:BLUE}}/>
                    <span style={{color:BLUE,fontSize:9,fontWeight:700,letterSpacing:0.6}}>TO</span>
                  </div>
                  <input type="date" value={customTo} min={customFrom}
                    onChange={e=>setCustomTo(e.target.value)}
                    style={{width:"100%",background:SURF2,border:`1px solid ${BLUE}33`,borderRadius:7,color:TEXT,fontSize:12,padding:"7px 9px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                </div>
              </div>
            </div>
          )}

          {/* Summary pill */}
          <div style={{
            background:"rgba(30,54,194,0.05)",border:`1px solid ${YELLOW}22`,
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
            <button onClick={()=>onExport(from,to,theme)} style={{
              flex:2,padding:"10px",borderRadius:10,border:"none",
              background:"#1E36C2",
              color:"#FFFFFF",fontSize:12.5,fontWeight:800,cursor:"pointer",fontFamily:"'Sora',sans-serif",
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
        background:"linear-gradient(155deg,#161616 0%,#0D0D0D 100%)",
        border:`1px solid ${BORDER}`,borderRadius:20,padding:"38px 32px",
        width:300,maxWidth:"100%",textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",
        animation: shake ? "shake 0.6s ease" : "none",
      }}>
        <div style={{
          width:52,height:52,borderRadius:15,margin:"0 auto 18px",
          background:"rgba(96,165,250,0.1)",border:`1px solid ${BLUE}33`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,
        }}>🔐</div>
        <h2 style={{color:TEXT,fontWeight:800,fontSize:17,margin:"0 0 4px"}}>CanaryFace — HR Panel</h2>
        <p style={{color:SUB,fontSize:11,margin:"0 0 22px"}}>Enter 4-digit passcode</p>
        <div style={{display:"flex",gap:9,justifyContent:"center",marginBottom:18}}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:42,height:48,borderRadius:9,
              background: shake ? "rgba(248,113,113,0.1)" : "rgba(30,54,194,0.08)",
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
                background: k==="" ? "transparent" : "rgba(30,54,194,0.1)",
                border: k==="" ? "none" : `1px solid ${BORDER}`,
                color:TEXT,fontSize:16,fontWeight:700,
                cursor: k==="" ? "default" : "pointer",
                fontFamily:"'JetBrains Mono',monospace",transition:"background 0.12s",
              }}
              onMouseEnter={e=>{ if(k!=="") (e.currentTarget as HTMLButtonElement).style.background=`rgba(30,54,194,0.12)`; }}
              onMouseLeave={e=>{ if(k!=="") (e.currentTarget as HTMLButtonElement).style.background="rgba(30,54,194,0.1)"; }}
            >{k}</button>
          ))}
        </div>
        {shake && <p style={{color:RED,fontSize:11,marginTop:12,marginBottom:0}}>Incorrect passcode</p>}
        <p style={{color:DIM,fontSize:10,marginTop:14,marginBottom:0}}>Session lasts {SESS_MIN} minutes</p>
      </div>
    </div>
  );
}

// ── Name capture (asked once, then remembered on this device) ───────────────────
function NameCapture({ initial = "", onSave, onBack }: {
  initial?: string; onSave: (n: string) => void; onBack?: () => void;
}) {
  const [name, setName] = useState(initial);
  const valid = name.trim().length >= 2;
  const submit = () => { if (valid) onSave(name.trim()); };

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Sora',sans-serif",padding:16}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
      `}</style>
      <div style={{
        background:"linear-gradient(155deg,#161616 0%,#0D0D0D 100%)",
        border:`1px solid ${BORDER}`,borderRadius:20,padding:"36px 32px",
        width:350,maxWidth:"100%",textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",
      }}>
        <div style={{
          width:56,height:56,borderRadius:16,margin:"0 auto 18px",
          background:"rgba(96,165,250,0.1)",border:`1px solid ${BLUE}33`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,
        }}>👋</div>
        <h2 style={{color:TEXT,fontWeight:800,fontSize:18,margin:"0 0 5px"}}>Welcome to HR Panel</h2>
        <p style={{color:SUB,fontSize:11.5,margin:"0 0 22px",lineHeight:1.55}}>
          Tell us your name to personalise your workspace. We'll remember it on this device.
        </p>
        <div style={{textAlign:"left",marginBottom:16}}>
          <Label>Your Name</Label>
          <input autoFocus value={name}
            onChange={e=>setName(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
            placeholder="e.g. Vandana"
            maxLength={40}
            style={{
              width:"100%",background:SURF3,
              border:`1px solid ${name.trim()?BLUE+"66":BORDER}`,
              borderRadius:10,color:TEXT,fontSize:13.5,padding:"11px 13px",
              outline:"none",fontFamily:"'Sora',sans-serif",
            }}/>
        </div>
        <button onClick={submit} disabled={!valid} style={{
          width:"100%",padding:"12px",borderRadius:11,border:"none",
          background: valid ? `linear-gradient(135deg,${BLUE},#2563eb)` : `${BLUE}26`,
          color: valid ? "#fff" : `${BLUE}99`,
          fontSize:13.5,fontWeight:800,letterSpacing:0.3,
          cursor: valid ? "pointer" : "not-allowed",fontFamily:"'Sora',sans-serif",
        }}>Continue →</button>
        {onBack && (
          <button onClick={onBack} style={{
            marginTop:12,background:"none",border:"none",color:DIM,fontSize:11,
            cursor:"pointer",fontFamily:"'Sora',sans-serif",
          }}>← Back</button>
        )}
        <p style={{color:DIM,fontSize:10,marginTop:16,marginBottom:0}}>Stored only on this browser</p>
      </div>
    </div>
  );
}

export default function HrPanel() {
  const [authed, setAuthed]       = useState(isAuthed());
  const [hrName, setHrNameState]  = useState(getHrName());
  const [editingName, setEditing] = useState(false);

  if (!authed) return <HrLogin onLogin={() => setAuthed(true)} />;

  // ask for the name only the first time (or when the user chooses to change it)
  if (!hrName || editingName)
    return <NameCapture
      initial={hrName}
      onBack={hrName ? () => setEditing(false) : undefined}
      onSave={(n) => { saveHrName(n); setHrNameState(n); setEditing(false); }}
    />;

  return <HrMain
    hrName={hrName}
    onChangeName={() => setEditing(true)}
    onLogout={() => { clearAuth(); setAuthed(false); }}
  />;
}

// ── Regularization Requests (employee-submitted, HR approves/rejects) ──────────
type RegStatus = "pending" | "approved" | "rejected" | "cancelled";

interface RegRequest {
  id: string;
  date: string;
  day: string;
  reason: string;
  check_in: string;   // "HH:MM"
  check_out: string;  // "HH:MM"
  description: string;
  attachment?: string | null;
  status: RegStatus;
  created_at: number;
  reviewed_by?: string;
  reviewer_note?: string;
}
interface RegDoc {
  emp_id: string;
  emp_name: string;
  requests: RegRequest[];
}
// flattened row for the HR list
interface RegRow extends RegRequest {
  emp_id: string;
  emp_name: string;
}

const REG_STATUS_META: Record<RegStatus, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: YELLOW },
  approved:  { label: "Approved",  color: GREEN  },
  rejected:  { label: "Rejected",  color: RED    },
  cancelled: { label: "Cancelled", color: DIM    },
};
const REG_REASON_LABEL: Record<string, string> = {
  forgot_checkin:  "Forgot to check-in",
  forgot_checkout: "Forgot to check-out",
};
const regReasonLabel = (r: string) => REG_REASON_LABEL[r] || r;

function regFmtCreated(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " +
         d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function regToMins(t: string) { if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function regFmtDuration(mins: number) {
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function RegRequestCard({
  row, empMeta, busy, onApprove, onReject, onViewImg,
}: {
  row: RegRow;
  empMeta?: any;
  busy: boolean;
  onApprove: (r: RegRow) => void;
  onReject: (r: RegRow) => void;
  onViewImg: (img: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const mins = regToMins(row.check_out) - regToMins(row.check_in);
  const m = REG_STATUS_META[row.status];

  const resolved = row.status === "approved" || row.status === "rejected";

  // compact, right-aligned action button
  const actBtn = (color: string, solid: boolean): React.CSSProperties => ({
    padding: "7px 14px", borderRadius: 8, fontSize: 11.5, fontWeight: 800,
    border: solid ? "none" : `1px solid ${color}55`,
    background: solid ? color : `${color}14`,
    color: solid ? "#06130a" : color,
    cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit",
    whiteSpace: "nowrap", lineHeight: 1, transition: "opacity 0.12s",
  });

  return (
    <div style={{
      background: SURF2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 16,
    }}>
      {/* ── identity (left) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: 210, flexShrink: 0, minWidth: 0 }}>
        <span style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: BG,
          border: `1.5px solid ${YELLOW}55`, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: YELLOW,
        }}>
          {empMeta?.profile_image
            ? <img src={empMeta.profile_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials(row.emp_name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: TEXT, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {row.emp_name}
          </div>
          <div style={{ color: DIM, fontSize: 9.5, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {row.emp_id}{empMeta?.department ? ` · ${empMeta.department}` : ""}
          </div>
        </div>
      </div>

      {/* ── details (middle, grows) ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: BLUE, background: `${BLUE}15`,
            border: `1px solid ${BLUE}33`, borderRadius: 20, padding: "2px 8px",
          }}>{regReasonLabel(row.reason)}</span>
          <span style={{ color: GREEN, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 17 }}>{row.check_in}</span>
          <span style={{ color: DIM }}>→</span>
          <span style={{ color: RED, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 17 }}>{row.check_out}</span>
          <span style={{ color: SUB, fontSize: 22 }}>· {regFmtDuration(mins)}</span>
          {row.created_at ? <span style={{ color: DIM, fontSize: 12 }}>· {regFmtCreated(row.created_at)}</span> : null}
          {row.attachment && (
            <button onClick={() => onViewImg(row.attachment!)} title="View attachment" style={{
              display: "inline-flex", alignItems: "center", gap: 5, background: "transparent",
              border: `1px solid ${BLUE}33`, borderRadius: 7, padding: "2px 8px", cursor: "pointer",
            }}>
              <span style={{ fontSize: 11 }}>📎</span>
              <span style={{ color: BLUE, fontSize: 10, fontWeight: 600 }}>Attachment</span>
            </button>
          )}
        </div>
        {row.description ? (
          <p style={{ color: SUB, fontSize: 11.5, margin: 0, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.description}>
            {row.description}
          </p>
        ) : null}
        {resolved && (
          <div style={{ fontSize: 10.5, color: row.status === "rejected" ? RED : GREEN }}>
            <span style={{ fontWeight: 700 }}>
              {row.status === "rejected" ? "Rejected" : "Approved"}{row.reviewed_by ? ` by ${row.reviewed_by}` : ""}
            </span>
            {row.reviewer_note ? ` — ${row.reviewer_note}` : ""}
          </div>
        )}
      </div>

      {/* ── status + actions (right) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, justifyContent: "flex-end" }}>
        {resolved && (
          <span style={{
            fontSize: 9.5, fontWeight: 700, color: m.color, background: `${m.color}18`,
            border: `1px solid ${m.color}40`, borderRadius: 20, padding: "3px 10px",
          }}>{m.label}</span>
        )}

        {row.status === "pending" && (
          rejecting ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <input autoFocus value={note} onChange={e => setNote(e.target.value)} maxLength={120}
                placeholder="Reason (optional)…"
                onKeyDown={e => { if (e.key === "Enter") onReject({ ...row, reviewer_note: note.trim() }); if (e.key === "Escape") setRejecting(false); }}
                style={{
                  width: 200, background: SURF3, border: `1px solid ${RED}33`, borderRadius: 8,
                  color: TEXT, fontSize: 11.5, padding: "7px 10px", outline: "none", fontFamily: "'Sora',sans-serif",
                }} />
              <button onClick={() => setRejecting(false)} disabled={busy} style={actBtn(SUB, false)}>Back</button>
              <button onClick={() => onReject({ ...row, reviewer_note: note.trim() })} disabled={busy} style={actBtn(RED, true)}>
                {busy ? "…" : "Confirm"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 7}}>
              <button onClick={() => setRejecting(true)} disabled={busy} style={actBtn(RED, false)}>Reject</button>
              <button onClick={() => onApprove(row)} disabled={busy} title="Approve & add to attendance" style={actBtn(GREEN, true)}>
                {busy ? "Approving…" : "Approve"}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function RegularizationRequests({
  hrName, employees, onToast, onResolved,
}: {
  hrName: string;
  employees: any[];
  onToast: (msg: string, type?: string) => void;
  onResolved?: () => void;
}) {
  const [docs, setDocs]       = useState<RegDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"pending" | "approved" | "rejected" | "cancelled" | "all">("pending");
  const [busyId, setBusyId]   = useState<string | null>(null);
  const [imgView, setImgView] = useState<string | null>(null);

  const empById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const e of employees) map[e.emp_id] = e;
    return map;
  }, [employees]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "regularizations"));
      setDocs(snap.docs.map(d => {
        const data = d.data() as Partial<RegDoc>;
        return {
          emp_id: data.emp_id || d.id,
          emp_name: data.emp_name || d.id,
          requests: Array.isArray(data.requests) ? data.requests : [],
        };
      }));
    } catch (e) {
      console.error(e);
      onToast("Could not load regularization requests.", "error");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  const rows: RegRow[] = useMemo(() => {
    const out: RegRow[] = [];
    for (const d of docs) {
      for (const r of d.requests) {
        out.push({ ...r, emp_id: d.emp_id, emp_name: d.emp_name });
      }
    }
    out.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    return out;
  }, [docs]);

  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 } as Record<string, number>;
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(
    () => tab === "all" ? rows : rows.filter(r => r.status === tab),
    [rows, tab]
  );

  // group the visible rows by their request date (most recent date first),
  // so a date label is shown once above all cards that share that date.
  const groupedByDate = useMemo(() => {
    const map = new Map<string, RegRow[]>();
    for (const r of visible) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visible]);

  // persist a status change back to regularizations/{emp_id}
  async function patchRequest(empId: string, reqId: string, patch: Partial<RegRequest>) {
    const target = docs.find(d => d.emp_id === empId);
    const updated = (target?.requests || []).map(r => r.id === reqId ? { ...r, ...patch } : r);
    await setDoc(doc(db, "regularizations", empId), { requests: updated }, { merge: true });
    setDocs(prev => prev.map(d => d.emp_id === empId ? { ...d, requests: updated } : d));
  }

  async function handleApprove(row: RegRow) {
    setBusyId(row.id);
    try {
      // 1) write the attendance session into the employee's daily doc: <emp_id>/<date>
      const ref = doc(db, row.emp_id, row.date);
      const snap = await getDoc(ref);
      const existing: any[] = snap.exists() ? ((snap.data().sessions as any[]) || []) : [];
      const newSession = {
        session: existing.length + 1,
        check_in: `${row.check_in}:00`,
        check_out: `${row.check_out}:00`,
        regularized: true,
        source: "regularization",
        ...(hrName ? { approved_by: hrName } : {}),
        ...(row.description ? { note: row.description } : {}),
      };
      await setDoc(ref, { sessions: [...existing, newSession] }, { merge: true });

      // 2) mark the request approved
      await patchRequest(row.emp_id, row.id, {
        status: "approved",
        reviewed_by: hrName || "HR",
        reviewer_note: "Added to attendance.",
      });
      onToast(`Approved · ${row.emp_name} · ${row.date} ✓`);
      onResolved?.();
    } catch (e) {
      console.error(e);
      onToast("Could not approve the request.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(row: RegRow) {
    setBusyId(row.id);
    try {
      await patchRequest(row.emp_id, row.id, {
        status: "rejected",
        reviewed_by: hrName || "HR",
        reviewer_note: row.reviewer_note || "",
      });
      onToast(`Rejected · ${row.emp_name} · ${row.date}`);
      onResolved?.();
    } catch (e) {
      console.error(e);
      onToast("Could not reject the request.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const TABS: ("pending" | "approved" | "rejected" | "cancelled" | "all")[] =
    ["pending", "approved", "rejected", "cancelled", "all"];

  return (
    <div style={{ maxWidth: HR_MAX_W, margin: "0 auto", width: "100%" }}>
      {/* image lightbox */}
      {imgView && (
        <div onClick={() => setImgView(null)} style={{
          position: "fixed", inset: 0, zIndex: 99998, background: "rgba(2,6,23,0.85)",
          backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <img src={imgView} alt="attachment" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 12, border: `1px solid ${BORDER}` }} />
        </div>
      )}

      {/* heading */}
      <div style={{
        display: "flex", alignItems: "center", gap: 11,
        paddingBottom: 14, marginBottom: 16, borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: `${YELLOW}18`, border: `1px solid ${YELLOW}40`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>📥</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: TEXT, fontWeight: 800, fontSize: 16, margin: 0, lineHeight: 1.15 }}>
            Regularization Requests
          </h2>
          <p style={{ color: SUB, fontSize: 11, margin: "3px 0 0" }}>
            Employee-submitted corrections. Approving adds the session to their attendance.
          </p>
        </div>
        <button onClick={load} disabled={loading} title="Refresh" style={{
          background: "rgba(30,54,194,0.07)", border: `1px solid ${YELLOW}44`, borderRadius: 9,
          color: YELLOW, fontSize: 11, fontWeight: 700, padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
        }}>{loading ? "Loading…" : "↻ Refresh"}</button>
      </div>

      {/* status tabs */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map(t => {
          const active = tab === t;
          const color = t === "all" ? BLUE : REG_STATUS_META[t].color;
          const label = t === "all" ? "All" : REG_STATUS_META[t].label;
          return (
            <button key={t} className="tab-btn" onClick={() => setTab(t)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9,
              border: `1px solid ${active ? color + "66" : BORDER}`,
              background: active ? `${color}14` : "transparent",
              color: active ? color : SUB, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {label}
              <span style={{
                background: active ? `${color}22` : "rgba(30,54,194,0.15)",
                color: active ? color : SUB, borderRadius: 8, padding: "0 6px", fontSize: 9.5, fontWeight: 700,
              }}>{counts[t]}</span>
            </button>
          );
        })}
      </div>

      {/* list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 150, borderRadius: 13, background: SURF2, opacity: 0.5 }} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: SUB, fontSize: 13 }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📭</div>
          No {tab === "all" ? "" : REG_STATUS_META[tab].label.toLowerCase() + " "}requests.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groupedByDate.map(([date, dayRows]) => {
            const d = new Date(date + "T00:00:00");
            const dateLabel = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
            return (
              <div key={date} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* date header — shown once for all cards on this date */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    color: YELLOW, fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
                    background: `${YELLOW}12`, border: `1px solid ${YELLOW}33`,
                    borderRadius: 8, padding: "5px 11px",
                  }}>
                    <span style={{ fontSize: 12 }}>📅</span>{dateLabel}
                  </span>
                  <span style={{ color: DIM, fontSize: 10.5, fontWeight: 600 }}>
                    {dayRows.length} request{dayRows.length !== 1 ? "s" : ""}
                  </span>
                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {dayRows.map(row => (
                    <RegRequestCard
                      key={`${row.emp_id}_${row.id}`}
                      row={row}
                      empMeta={empById[row.emp_id]}
                      busy={busyId === row.id}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onViewImg={setImgView}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Send Mail (HR → employees, filtered by hours worked) ───────────────────────
interface MailContact { name: string; email: string; }
type MailFilter = "all" | "under8" | "under4";
type MailTplKey = "general" | "under8" | "under4";

interface MailTemplate { subject: string; body: string; }
interface MailSettings {
  emailjs: { serviceId: string; templateId: string; publicKey: string };
  recipients: MailContact[];
  cc: MailContact[];
  templates: Record<MailTplKey, MailTemplate>;
}
interface MailLog {
  id: string;
  sent_at: number;
  sent_by: string;
  filter: MailFilter;
  template: MailTplKey;
  subject: string;
  body: string;
  to: MailContact[];
  cc: MailContact[];
  ok: number;
  failed: number;
}

// default seed (used to create settings/mail the first time)
const DEFAULT_RECIPIENTS: MailContact[] = [
  { name: "Muhammad Shahin C S", email: "shahin@canarydigital.ai" },
  { name: "Fayiz C J", email: "fayiz@canarydigital.ai" },
  { name: "Mohammed Ameen M", email: "ameen@canarydigital.ai" },
  { name: "Sruthymol K S", email: "sruthy@canarydigital.ai" },
  { name: "Lin Ann Jose", email: "lin@canarydigital.ai" },
  { name: "Abhijith A", email: "abhijith@canarydigital.ai" },
  { name: "Arunraj R", email: "arunraj@canarydigital.ai" },
  { name: "Muhammad Rizwan", email: "rizwan@canarydigital.ai" },
  { name: "BASIM B", email: "basim@canarydigital.ai" },
  { name: "Ahil S", email: "ahil@canarydigital.ai" },
  { name: "Sruthymol K S", email: "shruthy@canarydigital.ai" },
  { name: "Chithira E P", email: "chithira@canarydigital.ai" },
  { name: "Aiswaryalakshmi2013", email: "aiswaryalakshmi2013@gmail.com" },
  { name: "Gramikasiju2002", email: "gramikasiju2002@gmail.com" },
  { name: "Fathimafida2411", email: "fathimafida2411@gmail.com" },
  { name: "Anushabaiju172", email: "anushabaiju172@gmail.com" },
  { name: "Nandanaraveendran32", email: "nandanaraveendran32@gmail.com" },
  { name: "rashaeshaal", email: "rashaeshaal@gmail.com" },
  { name: "Amaleshkumar68", email: "amaleshkumar68@gmail.com" },
  { name: "Stamilazhagan95", email: "s.tamilazhagan95@gmail.com" },
];
const DEFAULT_CC: MailContact[] = [
  { name: "Asha Gopinathan", email: "asha@canarydigital.ai" },
];
const DEFAULT_TEMPLATES: Record<MailTplKey, MailTemplate> = {
  general: {
    subject: "Attendance Reminder — Canary",
    body:
`Dear Team,

This is a gentle reminder regarding your attendance and work hours.
Please ensure you check in and check out correctly each working day.

Period: {date_range}

Regards,
HR — Canary Digital`,
  },
  under8: {
    subject: "Work Hours Below 8 Hours — Action Needed",
    body:
`Dear Team,

Our records show that your logged work hours are below the expected 8 hours per day for the period {date_range}.
Kindly ensure you complete your full working hours going forward. If any check-in/check-out was missed, please raise a regularization request.

Regards,
HR — Canary Digital`,
  },
  under4: {
    subject: "Work Hours Below 4 Hours — Immediate Attention",
    body:
`Dear Team,

Our records show that your logged work hours are below 4 hours for the period {date_range}.
This is significantly short of the expected hours. Please reach out to HR to clarify and complete a regularization request if your attendance was not captured correctly.

Regards,
HR — Canary Digital`,
  },
};

const FILTER_TO_TPL: Record<MailFilter, MailTplKey> = { all: "general", under8: "under8", under4: "under4" };
const MAIL_FILTER_LABEL: Record<MailFilter, string> = {
  all: "All employees", under8: "Under 8 hours worked", under4: "Under 4 hours worked",
};
const MAIL_TPL_LABEL: Record<MailTplKey, string> = {
  general: "General reminder", under8: "Under 8 hours", under4: "Under 4 hours",
};

const MAIL_RANGE_MIN = "2026-06-01";

function mailFmtSent(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " · " +
         d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function SendMail({
  hrName, employees, onToast,
}: {
  hrName: string;
  employees: any[];
  onToast: (msg: string, type?: string) => void;
}) {
  const [settings, setSettings]   = useState<MailSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<"compose" | "history">("compose");

  const [filter, setFilter]       = useState<MailFilter>("all");
  const [tplKey, setTplKey]       = useState<MailTplKey>("general");
  const [fromDate, setFromDate]   = useState(MAIL_RANGE_MIN);
  const [toDate, setToDate]       = useState(toDateStr(new Date()));

  const [subject, setSubject]     = useState("");
  const [body, setBody]           = useState("");

  const [to, setTo]               = useState<MailContact[]>([]);
  const [cc, setCc]               = useState<MailContact[]>([]);
  const [addToVal, setAddToVal]   = useState("");
  const [addCcVal, setAddCcVal]   = useState("");

  const [computing, setComputing] = useState(false);
  const [hoursByEmp, setHoursByEmp] = useState<Record<string, number>>({});

  const [sending, setSending]     = useState(false);
  const [logs, setLogs]           = useState<MailLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const dateRangeLabel = fromDate === toDate
    ? new Date(fromDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : `${new Date(fromDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(toDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  // ── load / seed settings ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ref = doc(db, "settings", "mail");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data() as Partial<MailSettings>;
          const merged: MailSettings = {
            emailjs: { serviceId: "", templateId: "", publicKey: "", ...(d.emailjs || {}) },
            recipients: d.recipients?.length ? d.recipients : DEFAULT_RECIPIENTS,
            cc: d.cc?.length ? d.cc : DEFAULT_CC,
            templates: { ...DEFAULT_TEMPLATES, ...(d.templates || {}) },
          };
          setSettings(merged);
        } else {
          const seed: MailSettings = {
            emailjs: { serviceId: "", templateId: "", publicKey: "" },
            recipients: DEFAULT_RECIPIENTS,
            cc: DEFAULT_CC,
            templates: DEFAULT_TEMPLATES,
          };
          await setDoc(ref, seed, { merge: true });
          setSettings(seed);
        }
      } catch (e) {
        console.error(e);
        onToast("Could not load mail settings.", "error");
        // fall back to defaults so the UI still works
        setSettings({ emailjs: { serviceId: "", templateId: "", publicKey: "" }, recipients: DEFAULT_RECIPIENTS, cc: DEFAULT_CC, templates: DEFAULT_TEMPLATES });
      } finally {
        setLoading(false);
      }
    })();
  }, [onToast]);

  // initialise cc + subject/body from settings once loaded
  useEffect(() => {
    if (!settings) return;
    setCc(settings.cc);
  }, [settings]);

  // when template key changes (or settings load) → fill subject/body from template
  useEffect(() => {
    if (!settings) return;
    const t = settings.templates[tplKey];
    setSubject(t.subject);
    setBody(t.body.replace(/\{date_range\}/g, dateRangeLabel));
  }, [tplKey, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep {date_range} fresh in body when range changes (re-applies the template)
  useEffect(() => {
    if (!settings) return;
    const t = settings.templates[tplKey];
    setBody(t.body.replace(/\{date_range\}/g, dateRangeLabel));
  }, [fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // filter → auto-pick the matching template
  function onFilterChange(f: MailFilter) {
    setFilter(f);
    setTplKey(FILTER_TO_TPL[f]);
  }

  // resolve an employee's email: prefer employee record, else match by name in the recipient pool
  const emailForEmp = useCallback((emp: any): MailContact | null => {
    if (emp.email) return { name: emp.name, email: emp.email };
    const pool = settings?.recipients || DEFAULT_RECIPIENTS;
    const hit = pool.find(r => r.name.trim().toLowerCase() === (emp.name || "").trim().toLowerCase());
    if (hit) return { name: emp.name, email: hit.email };
    return null;
  }, [settings]);

  // ── compute hours per employee for the range, then build the TO list ──
  const buildRecipients = useCallback(async () => {
    setComputing(true);
    try {
      const dates = getDaysInRange(fromDate, toDate).filter(d => !isWeekend(d) && !isHoliday(d) && d <= toDateStr(new Date()));
      const hours: Record<string, number> = {};
      await Promise.all(employees.map(async (emp) => {
        let total = 0;
        await Promise.all(dates.map(async (date) => {
          try {
            const snap = await getDoc(doc(db, emp.emp_id, date));
            if (snap.exists()) total += calcHours((snap.data().sessions as any[]) || []);
          } catch (_) {}
        }));
        hours[emp.emp_id] = Math.round(total * 10) / 10;
      }));
      setHoursByEmp(hours);

      // average per worked day for fair thresholding (avoids penalising short ranges)
      const dayCount = Math.max(1, dates.length);
      const matched = employees.filter(emp => {
        const avg = (hours[emp.emp_id] || 0) / dayCount;
        if (filter === "all") return true;
        if (filter === "under8") return avg < 8;
        if (filter === "under4") return avg < 4;
        return true;
      });

      const contacts: MailContact[] = [];
      const missing: string[] = [];
      for (const emp of matched) {
        const c = emailForEmp(emp);
        if (c) contacts.push(c);
        else missing.push(emp.name);
      }
      // de-dupe by email
      const seen = new Set<string>();
      const unique = contacts.filter(c => {
        const k = c.email.toLowerCase();
        if (seen.has(k)) return false; seen.add(k); return true;
      });
      setTo(unique);
      if (missing.length) onToast(`${missing.length} matched employee(s) have no email on file: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`, "error");
    } catch (e) {
      console.error(e);
      onToast("Could not compute work hours.", "error");
    } finally {
      setComputing(false);
    }
  }, [employees, fromDate, toDate, filter, emailForEmp, onToast]);

  // rebuild recipients whenever filter / range / employees change
  useEffect(() => {
    if (employees.length === 0) return;
    buildRecipients();
  }, [employees, fromDate, toDate, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function isEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
  function addContact(kind: "to" | "cc", raw: string) {
    const v = raw.trim();
    if (!isEmail(v)) { onToast("Enter a valid email address.", "error"); return; }
    const c: MailContact = { name: v.split("@")[0], email: v };
    if (kind === "to") {
      if (to.some(x => x.email.toLowerCase() === v.toLowerCase())) return;
      setTo(p => [...p, c]); setAddToVal("");
    } else {
      if (cc.some(x => x.email.toLowerCase() === v.toLowerCase())) return;
      setCc(p => [...p, c]); setAddCcVal("");
    }
  }
  const removeTo = (email: string) => setTo(p => p.filter(c => c.email !== email));
  const removeCc = (email: string) => setCc(p => p.filter(c => c.email !== email));

  // ── load sent-mail history ──
  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const snap = await getDocs(collection(db, "mail_logs"));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<MailLog, "id">) }));
      list.sort((a, b) => (b.sent_at || 0) - (a.sent_at || 0));
      setLogs(list);
    } catch (e) {
      console.error(e);
      onToast("Could not load mail history.", "error");
    } finally {
      setLoadingLogs(false);
    }
  }, [onToast]);

  useEffect(() => { if (view === "history") loadLogs(); }, [view, loadLogs]);

  // ── send via EmailJS ──
  async function handleSend() {
    if (!settings) return;
    const { serviceId, templateId, publicKey } = settings.emailjs;
    if (!serviceId || !templateId || !publicKey) {
      onToast("EmailJS keys are not configured. Add them in settings/mail (serviceId, templateId, publicKey).", "error");
      return;
    }
    if (to.length === 0) { onToast("No recipients to send to.", "error"); return; }
    if (!subject.trim() || !body.trim()) { onToast("Subject and body are required.", "error"); return; }

    setSending(true);
    let ok = 0, failed = 0;
    const ccList = cc.map(c => c.email).join(",");
    try {
      for (const r of to) {
        try {
          await emailjs.send(serviceId, templateId, {
            to_email: r.email,
            to_name: r.name,
            cc_email: ccList,
            subject,
            message: body,
            from_name: hrName || "HR — Canary Digital",
            date_range: dateRangeLabel,
          }, { publicKey });
          ok += 1;
        } catch (err) {
          console.error("send failed for", r.email, err);
          failed += 1;
        }
      }

      // log it
      const log: Omit<MailLog, "id"> = {
        sent_at: Date.now(), sent_by: hrName || "HR", filter, template: tplKey,
        subject, body, to, cc, ok, failed,
      };
      try {
        await setDoc(doc(collection(db, "mail_logs")), log);
      } catch (e) { console.error("log save failed", e); }

      if (failed === 0) onToast(`Sent to ${ok} recipient${ok !== 1 ? "s" : ""} ✓`);
      else onToast(`Sent ${ok}, failed ${failed}. Check EmailJS config.`, failed > ok ? "error" : "ok");
    } finally {
      setSending(false);
    }
  }

  // total hours worked, keyed by email (for the recipient chips)
  const hoursByEmail = useMemo(() => {
    const map: Record<string, number> = {};
    for (const emp of employees) {
      const c = emailForEmp(emp);
      if (c && hoursByEmp[emp.emp_id] != null) map[c.email.toLowerCase()] = hoursByEmp[emp.emp_id];
    }
    return map;
  }, [employees, hoursByEmp, emailForEmp]);

  const inputStyle: React.CSSProperties = {
    width: "100%", background: SURF3, border: `1px solid ${BORDER}`, borderRadius: 9,
    color: TEXT, fontSize: 12.5, padding: "9px 11px", outline: "none", fontFamily: "'Sora',sans-serif",
  };
  const chip = (c: MailContact, onX: () => void, accent: string) => (
    <span key={c.email} style={{
      display: "inline-flex", alignItems: "center", gap: 6, background: `${accent}12`,
      border: `1px solid ${accent}33`, borderRadius: 20, padding: "3px 6px 3px 9px", maxWidth: "100%",
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ color: TEXT, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap" }}>{c.name}</span>
        <span style={{ color: SUB, fontSize: 9, marginLeft: 5, fontFamily: "'JetBrains Mono',monospace" }}>{c.email}</span>
      </span>
      <button onClick={onX} style={{ background: "none", border: "none", color: accent, fontSize: 13, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
    </span>
  );

  if (loading) {
    return <div style={{ padding: "48px 0", textAlign: "center", color: SUB, fontSize: 13 }}>Loading mail settings…</div>;
  }

  return (
    <div style={{ maxWidth: HR_MAX_W, margin: "0 auto", width: "100%" }}>
      {/* heading + view toggle */}
      <div style={{
        display: "flex", alignItems: "center", gap: 11,
        paddingBottom: 14, marginBottom: 16, borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: `${TEAL}18`, border: `1px solid ${TEAL}40`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>✉️</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: TEXT, fontWeight: 800, fontSize: 16, margin: 0, lineHeight: 1.15 }}>Send Email</h2>
          <p style={{ color: SUB, fontSize: 11, margin: "3px 0 0" }}>
            Email employees based on hours worked. Content adapts to the filter.
          </p>
        </div>
        <div style={{ display: "flex", gap: 2, background: SURF, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 3 }}>
          {(["compose", "history"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "6px 13px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 700, textTransform: "capitalize", fontFamily: "inherit",
              background: view === v ? TEAL : "transparent", color: view === v ? BG : SUB,
            }}>{v === "history" ? "Sent History" : "Compose"}</button>
          ))}
        </div>
      </div>

      {view === "history" ? (
        loadingLogs ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: SUB, fontSize: 12.5 }}>Loading history…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: SUB, fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>No mails sent yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {logs.map(l => (
              <div key={l.id} style={{ background: SURF2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>{l.subject}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: TEAL, background: `${TEAL}15`, border: `1px solid ${TEAL}33`, borderRadius: 20, padding: "2px 8px" }}>
                    {MAIL_FILTER_LABEL[l.filter]}
                  </span>
                  <span style={{ marginLeft: "auto", color: DIM, fontSize: 9.5 }}>{mailFmtSent(l.sent_at)}</span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: SUB, marginBottom: 6, flexWrap: "wrap" }}>
                  <span>By <b style={{ color: TEXT }}>{l.sent_by}</b></span>
                  <span style={{ color: GREEN }}>✓ {l.ok} sent</span>
                  {l.failed > 0 && <span style={{ color: RED }}>✗ {l.failed} failed</span>}
                  <span>· {l.to.length} recipients</span>
                </div>
                <details>
                  <summary style={{ cursor: "pointer", color: TEAL, fontSize: 10.5, fontWeight: 600 }}>View recipients & body</summary>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                      {l.to.map(c => (
                        <span key={c.email} style={{ fontSize: 9, color: SUB, background: "rgba(30,54,194,0.08)", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "2px 7px", fontFamily: "'JetBrains Mono',monospace" }}>{c.email}</span>
                      ))}
                    </div>
                    <pre style={{ whiteSpace: "pre-wrap", color: SUB, fontSize: 11, lineHeight: 1.5, margin: 0, fontFamily: "'Sora',sans-serif" }}>{l.body}</pre>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="hr-form-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
          {/* ── LEFT: filter, range, recipients ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* filter */}
            <div>
              <Label>Filter employees by *</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(["all", "under8", "under4"] as MailFilter[]).map(f => {
                  const on = filter === f;
                  return (
                    <button key={f} onClick={() => onFilterChange(f)} style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 10,
                      border: `1px solid ${on ? TEAL + "66" : BORDER}`, background: on ? `${TEAL}12` : SURF3,
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${on ? TEAL : BORDER}`, background: on ? TEAL : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{on && <span style={{ width: 6, height: 6, borderRadius: "50%", background: BG }} />}</span>
                      <span style={{ color: on ? TEAL : TEXT, fontSize: 12.5, fontWeight: on ? 700 : 500 }}>{MAIL_FILTER_LABEL[f]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* date range */}
            <div>
              <Label>Date Range *</Label>
              <div style={{ background: "rgba(30,54,194,0.04)", border: `1px solid ${BORDER}`, borderRadius: 11, padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN }} />
                    <span style={{ color: GREEN, fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>FROM</span>
                  </div>
                  <input type="date" value={fromDate} min={MAIL_RANGE_MIN} max={toDate}
                    onChange={e => setFromDate(e.target.value)}
                    style={{ ...inputStyle, border: `1px solid ${GREEN}33`, colorScheme: "dark" }} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: RED }} />
                    <span style={{ color: RED, fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>TO</span>
                  </div>
                  <input type="date" value={toDate} min={fromDate} max={toDateStr(new Date())}
                    onChange={e => setToDate(e.target.value)}
                    style={{ ...inputStyle, border: `1px solid ${RED}33`, colorScheme: "dark" }} />
                </div>
                <span style={{ color: TEAL, fontSize: 10.5, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{dateRangeLabel}</span>
              </div>
            </div>

            {/* recipients (TO) */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <Label>Recipients (TO){computing ? " · computing…" : ` · ${to.length}`}</Label>
                <button onClick={buildRecipients} disabled={computing} style={{
                  background: "rgba(132,252,250,0.08)", border: `1px solid ${TEAL}44`, borderRadius: 7,
                  color: TEAL, fontSize: 9.5, fontWeight: 700, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit",
                }}>↻ Rebuild</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, maxHeight: 170, overflowY: "auto" }}>
                {to.length === 0 ? <span style={{ color: DIM, fontSize: 11 }}>No matching recipients.</span>
                  : to.map(c => {
                    const h = hoursByEmail[c.email.toLowerCase()];
                    return (
                      <span key={c.email} style={{
                        display: "inline-flex", alignItems: "center", gap: 6, background: `${TEAL}12`,
                        border: `1px solid ${TEAL}33`, borderRadius: 20, padding: "3px 6px 3px 9px", maxWidth: "100%",
                      }}>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ color: TEXT, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap" }}>{c.name}</span>
                          <span style={{ color: SUB, fontSize: 9, marginLeft: 5, fontFamily: "'JetBrains Mono',monospace" }}>{c.email}</span>
                        </span>
                        {h != null && (
                          <span style={{
                            fontSize: 8.5, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace",
                            color: SUB, background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "1px 5px", flexShrink: 0,
                          }} title="Total hours worked in selected range">{h}h</span>
                        )}
                        <button onClick={() => removeTo(c.email)} style={{ background: "none", border: "none", color: TEAL, fontSize: 13, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
                      </span>
                    );
                  })}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={addToVal} onChange={e => setAddToVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addContact("to", addToVal); }}
                  placeholder="Add an email…" style={inputStyle} />
                <button onClick={() => addContact("to", addToVal)} style={{
                  background: TEAL, border: "none", borderRadius: 9, color: BG, fontSize: 12, fontWeight: 800,
                  padding: "0 14px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                }}>Add</button>
              </div>
            </div>

            {/* CC */}
            <div>
              <Label>CC · {cc.length}</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {cc.length === 0 ? <span style={{ color: DIM, fontSize: 11 }}>No CC.</span>
                  : cc.map(c => chip(c, () => removeCc(c.email), BLUE))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={addCcVal} onChange={e => setAddCcVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addContact("cc", addCcVal); }}
                  placeholder="Add a CC email…" style={inputStyle} />
                <button onClick={() => addContact("cc", addCcVal)} style={{
                  background: BLUE, border: "none", borderRadius: 9, color: BG, fontSize: 12, fontWeight: 800,
                  padding: "0 14px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                }}>Add</button>
              </div>
            </div>
          </div>

          {/* ── RIGHT: template + content + send ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* template selector */}
            <div>
              <Label>Template (auto-selected by filter — switchable)</Label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["general", "under8", "under4"] as MailTplKey[]).map(k => {
                  const on = tplKey === k;
                  return (
                    <button key={k} onClick={() => setTplKey(k)} style={{
                      padding: "6px 11px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                      border: `1px solid ${on ? TEAL + "66" : BORDER}`, background: on ? `${TEAL}14` : SURF3,
                      color: on ? TEAL : SUB, fontSize: 11, fontWeight: 700,
                    }}>{MAIL_TPL_LABEL[k]}</button>
                  );
                })}
              </div>
            </div>

            {/* subject */}
            <div>
              <Label>Subject *</Label>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
            </div>

            {/* body */}
            <div>
              <Label>Message * <span style={{ color: DIM, fontWeight: 500 }}>· {"{date_range}"} is filled automatically</span></Label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={11}
                style={{ ...inputStyle, resize: "vertical", minHeight: 200, lineHeight: 1.5, fontFamily: "'Sora',sans-serif" }} />
            </div>

            {/* config hint */}
            {settings && (!settings.emailjs.serviceId || !settings.emailjs.templateId || !settings.emailjs.publicKey) && (
              <div style={{ background: "rgba(30,54,194,0.06)", border: `1px solid ${YELLOW}33`, color: "#BCC6F5", borderRadius: 10, padding: "8px 12px", fontSize: 11 }}>
                ⚠ EmailJS not configured. Add <b>serviceId</b>, <b>templateId</b> and <b>publicKey</b> to the Firebase <code>settings/mail</code> document to enable sending.
              </div>
            )}

            {/* send */}
            <button onClick={handleSend} disabled={sending || to.length === 0} style={{
              width: "100%", padding: "12px", borderRadius: 11, border: "none",
              background: (sending || to.length === 0) ? `${TEAL}33` : `linear-gradient(135deg,${TEAL},#22b8b5)`,
              color: (sending || to.length === 0) ? `${TEAL}99` : BG, fontSize: 13, fontWeight: 800,
              cursor: (sending || to.length === 0) ? "not-allowed" : "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <span style={{ fontSize: 15 }}>✉️</span>
              {sending ? "Sending…" : `Send to ${to.length} recipient${to.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notices Manager (marquee texts shown on the employee Attendance page) ──────
interface Notice { text: string; enabled: boolean; }

// Normalises the stored value (legacy string[] OR new {text,enabled}[]) → Notice[]
function normalizeNotices(list: any[]): Notice[] {
  if (!Array.isArray(list)) return [];
  return list.map(item =>
    typeof item === "string"
      ? { text: item, enabled: true }
      : { text: String(item?.text ?? ""), enabled: item?.enabled !== false }
  );
}

function NoticesManager({ onToast }: { onToast: (msg: string, type?: string) => void }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft]   = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);   // which row is being edited
  const [editVal, setEditVal] = useState("");                     // working copy while editing

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "settings", "notices"));
      const list = snap.exists() ? (snap.data().texts as any[]) : [];
      setNotices(normalizeNotices(list));
    } catch (e) {
      console.error(e); onToast("Could not load notices.", "error");
    } finally { setLoading(false); }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function persist(next: Notice[]) {
    setSaving(true);
    try {
      // store the full objects so the enabled flag survives
      await setDoc(doc(db, "settings", "notices"), { texts: next }, { merge: true });
      setNotices(next);
    } catch (e) {
      console.error(e); onToast("Could not save notices.", "error");
    } finally { setSaving(false); }
  }

  function addText() {
    const v = draft.trim();
    if (!v) return;
    persist([...notices, { text: v, enabled: true }]); setDraft("");
    onToast("Notice added ✓");
  }
  function removeText(i: number) {
    if (editIdx === i) setEditIdx(null);
    persist(notices.filter((_, idx) => idx !== i));
    onToast("Notice removed");
  }
  function startEdit(i: number) {
    setEditIdx(i);
    setEditVal(notices[i].text);
  }
  function cancelEdit() {
    setEditIdx(null);
    setEditVal("");
  }
  function saveEdit() {
    if (editIdx === null) return;
    const v = editVal.trim();
    if (!v) { onToast("Notice can't be empty.", "error"); return; }
    persist(notices.map((n, idx) => idx === editIdx ? { ...n, text: v } : n));
    setEditIdx(null); setEditVal("");
    onToast("Notice updated ✓");
  }
  function toggleEnabled(i: number) {
    const next = notices.map((n, idx) => idx === i ? { ...n, enabled: !n.enabled } : n);
    persist(next);
    onToast(next[i].enabled ? "Notice is now visible on dashboard ✓" : "Notice hidden from dashboard");
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= notices.length) return;
    if (editIdx !== null) cancelEdit();   // avoid editing the wrong row after a reorder
    const next = [...notices];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: SURF3, border: `1px solid ${BORDER}`, borderRadius: 10,
    color: TEXT, fontSize: 13.5, padding: "13px 15px", outline: "none", fontFamily: "'Sora',sans-serif",
  };
  // small square icon-button used for the row actions
  const iconBtn = (color: string, borderCol: string, bg = "transparent", disabled = false): React.CSSProperties => ({
    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
    border: `1px solid ${borderCol}`, background: bg, color,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, fontWeight: 800, lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer", transition: "background 0.12s, border 0.12s",
  });

  const enabledNotices = notices.filter(n => n.enabled && n.text.trim());
  const shownCount = enabledNotices.length;
  // duplicated track so the preview marquee scrolls seamlessly, just like the dashboard
  const previewItems = enabledNotices.length ? [...enabledNotices, ...enabledNotices] : [];

  // Live preview marquee — same rAF scroll as the employee Attendance page (NOTICE_MARQUEE_SPEED px/frame).
  const previewBoxRef   = useRef<HTMLDivElement>(null);
  const previewTrackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enabledNotices.length === 0) return;
    const track = previewTrackRef.current;
    const box   = previewBoxRef.current;
    if (!track || !box) return;

    let offset = 0, raf = 0, paused = false;
    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };
    box.addEventListener("mouseenter", onEnter);
    box.addEventListener("mouseleave", onLeave);

    const step = () => {
      const half = track.scrollWidth / 2;            // track holds two identical copies
      if (!paused && half > 0) {
        offset += NOTICE_MARQUEE_SPEED;
        if (offset >= half) offset -= half;          // seamless wrap
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
  }, [previewItems.length]);

  return (
    <div style={{ maxWidth: HR_MAX_W, margin: "0 auto", width: "100%" }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        paddingBottom: 18, marginBottom: 22, borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          background: `${YELLOW}18`, border: `1px solid ${YELLOW}40`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21,
        }}>📢</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ color: TEXT, fontWeight: 800, fontSize: 18, margin: 0, lineHeight: 1.15 }}>Notices / Marquee</h2>
 
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <Pill color={GREEN}>{shownCount} shown</Pill>
          <Pill color={SUB}>{notices.length} total</Pill>
          <button onClick={load} disabled={loading || saving} style={{
            background: "rgba(30,54,194,0.07)", border: `1px solid ${YELLOW}44`, borderRadius: 10,
            color: YELLOW, fontSize: 12, fontWeight: 700, padding: "9px 15px", cursor: "pointer", fontFamily: "inherit",
          }}>{loading ? "Loading…" : "↻ Refresh"}</button>
        </div>
      </div>

      {/* ── Live dashboard preview — same speed/gap as the employee Attendance marquee ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
          <Label>Dashboard preview</Label>
          <span style={{ color: DIM, fontSize: 10.5, marginBottom: 6 }}>— exactly how employees see it · hover to pause</span>
        </div>
        <div ref={previewBoxRef} style={{
          background: `linear-gradient(180deg, ${SURF} 0%, ${BG} 100%)`,
          border: `1px solid ${BORDER}`, borderRadius: 12, padding: "0 18px",
          height: 48, display: "flex", alignItems: "center", overflow: "hidden", position: "relative",
        }}>
          {/* "live" tag on the left */}
          <span style={{
            flexShrink: 0, marginRight: 16, display: "flex", alignItems: "center", gap: 6,
            color: YELLOW, fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", zIndex: 2,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: YELLOW, boxShadow: `0 0 6px ${YELLOW}` }} />
            Marquee
          </span>
          <div style={{
            flex: 1, overflow: "hidden", position: "relative", height: "100%", display: "flex", alignItems: "center",
            maskImage: "linear-gradient(90deg, transparent 0, #000 5%, #000 92%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 5%, #000 92%, transparent 100%)",
          }}>
            {enabledNotices.length === 0 ? (
              <span style={{ color: DIM, fontSize: 12.5, fontStyle: "italic" }}>
                No notices are enabled — toggle one on to see it scroll here.
              </span>
            ) : (
              <div ref={previewTrackRef} style={{ display: "inline-flex", whiteSpace: "nowrap", willChange: "transform" }}>
                {[0, 1].map(dup => (
                  <span key={dup} style={{ display: "inline-flex", alignItems: "center", paddingLeft: NOTICE_MARQUEE_GAP }} aria-hidden={dup === 1}>
                    {enabledNotices.map((n, i) => (
                      <span key={`${dup}-${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
                        {/* literal yellow — must match the real employee marquee, which is unaffected by the HR theme */}
                        <span style={{ color: "#FFD700", fontSize: 11, fontWeight: 700 }}>{n.text}</span>
                        <span style={{ color: "rgba(255,215,0,0.55)", fontSize: 11, fontWeight: 800, padding: "0 16px" }}>•</span>
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* add */}
      <div style={{
        background: SURF2, border: `1px solid ${BORDER}`, borderRadius: 14,
        padding: 16, marginBottom: 24,
      }}>
        <Label>Add a new notice</Label>
        <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addText(); }}
            placeholder="e.g. 'Any day left with incomplete scan data and no regularization request defaults to an absence.'"
            maxLength={200} style={inputStyle} />
          <button onClick={addText} disabled={saving || !draft.trim()} style={{
            background: draft.trim() ? YELLOW : "rgba(30,54,194,0.25)", border: "none", borderRadius: 10,
            color: draft.trim() ? BG : "rgba(6,13,46,0.6)", fontSize: 13.5, fontWeight: 800,
            padding: "0 26px", cursor: draft.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 7,
          }}><span style={{ fontSize: 16 }}>+</span> Add Notice</button>
        </div>
      </div>

      {/* list */}
      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: SUB, fontSize: 13 }}>Loading…</div>
      ) : notices.length === 0 ? (
        <div style={{
          padding: "52px 0", textAlign: "center", color: SUB, fontSize: 13.5,
          background: SURF2, border: `1px dashed ${BORDER}`, borderRadius: 14,
        }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>📭</div>No notices yet. Add one above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* column header for alignment */}
          <div style={{
            display: "grid", gridTemplateColumns: "30px 96px 1fr auto", alignItems: "center", gap: 14,
            padding: "0 16px 2px", color: DIM, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase",
          }}>
            <span style={{ textAlign: "center" }}>#</span>
            <span>Visibility</span>
            <span>Notice text</span>
            <span style={{ textAlign: "right", paddingRight: 2 }}>Actions</span>
          </div>

          {notices.map((n, i) => {
            const editing = editIdx === i;
            return (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "30px 96px 1fr auto", alignItems: "center", gap: 14,
                background: SURF2,
                border: `1px solid ${editing ? YELLOW + "66" : n.enabled ? BORDER : "rgba(30,54,194,0.10)"}`,
                borderRadius: 12, padding: "12px 16px",
                opacity: !editing && !n.enabled ? 0.6 : 1,
                transition: "opacity 0.15s, border 0.15s, background 0.15s",
              }}>
                {/* index */}
                <span style={{ color: DIM, fontSize: 12, fontWeight: 700, textAlign: "center" }}>{i + 1}</span>

                {/* show/hide toggle + state label */}
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <button onClick={() => toggleEnabled(i)} disabled={saving || editing}
                    title={n.enabled ? "Showing on dashboard — click to hide" : "Hidden — click to show on dashboard"}
                    style={{
                      width: 42, height: 24, borderRadius: 13, flexShrink: 0, position: "relative",
                      cursor: (saving || editing) ? "not-allowed" : "pointer",
                      background: n.enabled ? GREEN : "rgba(30,54,194,0.20)",
                      border: `1px solid ${n.enabled ? GREEN : BORDER}`, padding: 0,
                      transition: "background 0.18s, border 0.18s",
                    }}>
                    <span style={{
                      position: "absolute", top: 2, left: n.enabled ? 20 : 2,
                      width: 18, height: 18, borderRadius: "50%", background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.4)", transition: "left 0.18s",
                    }} />
                  </button>
                </div>

                {/* text — read-only label, or an input while editing */}
                {editing ? (
                  <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    maxLength={200}
                    style={{ ...inputStyle, border: `1px solid ${YELLOW}66`, padding: "10px 13px", fontSize: 13.5 }} />
                ) : (
                  <span style={{
                    color: n.enabled ? TEXT : SUB, fontSize: 13.5, lineHeight: 1.5,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }} title={n.text}>{n.text}</span>
                )}

                {/* actions */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0, justifyContent: "flex-end" }}>
                  {editing ? (
                    <>
                      <button onClick={cancelEdit} disabled={saving} title="Cancel"
                        style={iconBtn(SUB, BORDER, SURF, saving)}>✕</button>
                      <button onClick={saveEdit} disabled={saving || !editVal.trim()} title="Save"
                        style={{
                          ...iconBtn(BG, "transparent", editVal.trim() ? GREEN : "rgba(30,54,194,0.3)", saving || !editVal.trim()),
                          width: "auto", padding: "0 14px", fontSize: 12.5,
                        }}>Save</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => move(i, -1)} disabled={i === 0 || saving} title="Move up"
                        style={iconBtn(i === 0 ? DIM : BLUE, BORDER, "transparent", i === 0 || saving)}>↑</button>
                      <button onClick={() => move(i, 1)} disabled={i === notices.length - 1 || saving} title="Move down"
                        style={iconBtn(i === notices.length - 1 ? DIM : BLUE, BORDER, "transparent", i === notices.length - 1 || saving)}>↓</button>
                      <button onClick={() => startEdit(i)} disabled={saving} title="Edit"
                        style={iconBtn(BLUE, `${BLUE}44`, "rgba(96,165,250,0.08)", saving)}>✎</button>
                      <button onClick={() => removeText(i)} disabled={saving} title="Remove"
                        style={iconBtn(RED, `${RED}33`, "rgba(248,113,113,0.08)", saving)}>×</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Add Leave (HR marks employees on leave: full / half / quarter day) ──────────
// Work day model: 09:00–18:00 with a 13:00–14:00 lunch (8h).
type LeaveKind = "full" | "half" | "quarter";
type LeaveHalf = "first" | "second";
type LeaveQuarter = "q1" | "q2" | "q3" | "q4";

// returns the { check_in, check_out } slot (HH:MM:SS) covered by a leave selection
function leaveSlot(kind: LeaveKind, half: LeaveHalf, quarter: LeaveQuarter): { check_in: string; check_out: string; label: string } {
  if (kind === "full") return { check_in: "09:00:00", check_out: "18:00:00", label: "Full Day · 09:00–18:00" };
  if (kind === "half") {
    return half === "first"
      ? { check_in: "09:00:00", check_out: "13:00:00", label: "Half Day (1st) · 09:00–13:00" }
      : { check_in: "14:00:00", check_out: "18:00:00", label: "Half Day (2nd) · 14:00–18:00" };
  }
  // quarter
  const Q: Record<LeaveQuarter, { check_in: string; check_out: string; label: string }> = {
    q1: { check_in: "09:00:00", check_out: "11:00:00", label: "Quarter 1 · 09:00–11:00" },
    q2: { check_in: "11:00:00", check_out: "13:00:00", label: "Quarter 2 · 11:00–13:00" },
    q3: { check_in: "14:00:00", check_out: "16:00:00", label: "Quarter 3 · 14:00–16:00" },
    q4: { check_in: "16:00:00", check_out: "18:00:00", label: "Quarter 4 · 16:00–18:00" },
  };
  return Q[quarter];
}

function LeaveManager({
  employees, onToast, onViewHistory,
}: {
  employees: any[];
  onToast: (msg: string, type?: string) => void;
  onViewHistory: () => void;
}) {
  const ACCENT = "#1E36C2";
  const BOX = "#121212", BOX2 = "#1A1A1A", BORD = "rgba(30,54,194,0.30)";

  const today = toDateStr(new Date());
  const [selEmps, setSelEmps]     = useState<any[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [showDrop, setShowDrop]   = useState(false);
  const [fromDate, setFromDate]   = useState(today);
  const [toDate,   setToDate]     = useState(today);
  const [kind, setKind]           = useState<LeaveKind>("full");
  const [half, setHalf]           = useState<LeaveHalf>("first");
  const [quarter, setQuarter]     = useState<LeaveQuarter>("q1");
  const [reason, setReason]       = useState("");
  const [saving, setSaving]       = useState(false);

  const filtered = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    const sel = new Set(selEmps.map(e => e.emp_id));
    return employees.filter(e =>
      !sel.has(e.emp_id) &&
      (!q || e.name?.toLowerCase().includes(q) || e.emp_id?.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [employees, empSearch, selEmps]);

  const isSel = (id: string) => selEmps.some(e => e.emp_id === id);
  const toggleEmp = (e: any) => setSelEmps(prev => isSel(e.emp_id) ? prev.filter(x => x.emp_id !== e.emp_id) : [...prev, e]);
  const removeEmp = (id: string) => setSelEmps(prev => prev.filter(x => x.emp_id !== id));
  const selectAll = () => setSelEmps(prev => {
    const have = new Set(prev.map(e => e.emp_id));
    return [...prev, ...filtered.filter(e => !have.has(e.emp_id))];
  });

  const dates = useMemo(() => (fromDate && toDate && toDate >= fromDate) ? getDaysInRange(fromDate, toDate) : [], [fromDate, toDate]);
  const slot = leaveSlot(kind, half, quarter);
  const totalRecords = selEmps.length * dates.length;
  const canSave = selEmps.length > 0 && dates.length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    let ok = 0, fail = 0;
    await Promise.all(selEmps.map(async (emp) => {
      for (const date of dates) {
        try {
          const ref  = doc(db, emp.emp_id, date);
          const snap = await getDoc(ref);
          const existing = snap.exists() ? snap.data() : null;
          const prev: any[] = existing?.sessions || [];
          await setDoc(ref, {
            employee_name: existing?.employee_name || emp.name,
            sessions: [...prev, {
              session: prev.length + 1,
              check_in: slot.check_in,
              check_out: slot.check_out,
              leave: true,
              leave_kind: kind,
              ...(kind === "half" ? { leave_half: half } : {}),
              ...(kind === "quarter" ? { leave_quarter: quarter } : {}),
              source: "hr",
              ...(reason.trim() ? { note: reason.trim() } : {}),
            }],
          }, { merge: true });
          ok++;
        } catch (_) { fail++; }
      }
    }));
    setSaving(false);
    if (fail === 0) {
      const who  = selEmps.length === 1 ? selEmps[0].name : `${selEmps.length} employees`;
      const when = dates.length === 1 ? dates[0] : `${dates.length} days`;
      onToast(`Leave added · ${who} · ${when} ✓`);
      setSelEmps([]); setEmpSearch(""); setReason("");
    } else {
      onToast(`Saved ${ok}, failed ${fail}. Please retry.`, ok > fail ? "ok" : "error");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: BOX, border: `1px solid ${BORD}`, borderRadius: 9,
    color: "#FFFFFF", fontSize: 12.5, padding: "9px 11px", outline: "none", fontFamily: "'Sora',sans-serif",
  };
  const optBtn = (active: boolean): React.CSSProperties => ({
    padding: "9px 14px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
    fontSize: 12.5, fontWeight: 700, flex: 1, textAlign: "center",
    border: `1px solid ${active ? ACCENT : BORD}`,
    background: active ? ACCENT : "transparent",
    color: active ? "#FFFFFF" : "#C8C8C8",
    transition: "all 0.12s",
  });

  return (
    <div className="reg-tab" style={{
      margin: "-26px -28px -64px", background: "#0D0D0D",
      padding: "30px 28px 64px", minHeight: "calc(100vh - 121px)",
    }}>
      <div style={{ maxWidth: HR_MAX_W, margin: "0 auto", width: "100%" }}>
        {/* heading */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, marginBottom: 18, borderBottom: `1px solid ${BORD}` }}>
          <span style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: "rgba(30,54,194,0.14)", border: `1px solid ${ACCENT}55`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>🌴</span>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 17, margin: 0 }}>Add Leave</h2>
            <p style={{ color: "#C8C8C8", fontSize: 11.5, margin: "4px 0 0" }}>
              Mark employees on leave — full day, half day, or quarter day. Work day is 09:00–18:00 (lunch 13:00–14:00).
            </p>
          </div>
          <button onClick={onViewHistory} style={{
            display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
            background: "rgba(30,54,194,0.12)", border: `1px solid ${ACCENT}55`, borderRadius: 10,
            color: "#FFFFFF", fontSize: 12, fontWeight: 700, padding: "9px 14px", cursor: "pointer", fontFamily: "'Sora',sans-serif",
          }}>🗂 View Leave</button>
        </div>

        <div className="hr-form-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
          {/* ── LEFT: employees + dates ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 18, borderRadius: 2, background: ACCENT }} />
              <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13 }}>Employees & Date Range</span>
            </div>

            {/* employee multi-select */}
            <div style={{ position: "relative" }}>
              <Label>Employees * (select one or many)</Label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, pointerEvents: "none" }}>🔍</span>
                <input value={empSearch}
                  onChange={e => { setEmpSearch(e.target.value); setShowDrop(true); }}
                  onFocus={() => setShowDrop(true)}
                  onBlur={() => setTimeout(() => setShowDrop(false), 180)}
                  placeholder="Search name or ID, then tap to add…"
                  style={{ ...inputStyle, paddingLeft: 32, paddingRight: 32 }} />
                {empSearch && (
                  <button onClick={() => setEmpSearch("")} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#7A7A7A", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{
                  color: selEmps.length ? ACCENT : "#7A7A7A", fontSize: 10.5, fontWeight: 700,
                  background: selEmps.length ? "rgba(30,54,194,0.12)" : "transparent",
                  border: `1px solid ${selEmps.length ? "rgba(30,54,194,0.4)" : BORD}`, borderRadius: 20, padding: "2px 9px",
                }}>{selEmps.length} selected</span>
                <div style={{ flex: 1 }} />
                <button onClick={selectAll} style={{ background: "rgba(30,54,194,0.08)", border: `1px solid ${BORD}`, borderRadius: 7, color: "#FFFFFF", fontSize: 10, fontWeight: 700, padding: "4px 9px", cursor: "pointer", fontFamily: "inherit" }}>Select all{empSearch ? ` (${filtered.length})` : ""}</button>
                {selEmps.length > 0 && (
                  <button onClick={() => setSelEmps([])} style={{ background: "rgba(248,113,113,0.08)", border: `1px solid ${RED}44`, borderRadius: 7, color: RED, fontSize: 10, fontWeight: 700, padding: "4px 9px", cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
                )}
              </div>

              {selEmps.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9, maxHeight: 120, overflowY: "auto" }}>
                  {selEmps.map(emp => (
                    <span key={emp.emp_id} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(30,54,194,0.10)", border: `1px solid rgba(30,54,194,0.33)`, borderRadius: 20, padding: "3px 6px 3px 4px" }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: BOX, border: `1.5px solid ${ACCENT}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#FFFFFF" }}>
                        {emp.profile_image ? <img src={emp.profile_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(emp.name)}
                      </span>
                      <span style={{ color: "#FFFFFF", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{emp.name}</span>
                      <button onClick={() => removeEmp(emp.emp_id)} style={{ background: "none", border: "none", color: "#FFFFFF", fontSize: 14, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
                    </span>
                  ))}
                </div>
              )}

              {showDrop && filtered.length > 0 && (
                <div onMouseDown={e => e.preventDefault()} style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 100, background: BOX, border: `1px solid ${BORD}`, borderRadius: 10, maxHeight: 240, overflowY: "auto", boxShadow: "0 14px 40px rgba(0,0,0,0.65)" }}>
                  {filtered.map(emp => (
                    <div key={emp.emp_id} className="emp-row" onClick={() => toggleEmp(emp)} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", cursor: "pointer", borderBottom: `1px solid rgba(30,54,194,0.10)` }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: BOX2, border: `1.5px solid rgba(30,54,194,0.35)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {emp.profile_image ? <img src={emp.profile_image} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 9 }}>{initials(emp.name)}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.name}</div>
                        <div style={{ color: "#7A7A7A", fontSize: 9, fontFamily: "'JetBrains Mono',monospace" }}>{emp.emp_id} · {emp.department}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* date range */}
            <div>
              <Label>Date Range *</Label>
              <div style={{ background: BOX, border: `1px solid ${BORD}`, borderRadius: 11, padding: 13, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span style={{ color: "#FFFFFF", fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>FROM</span>
                  <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); if (e.target.value > toDate) setToDate(e.target.value); }}
                    style={{ width: "100%", marginTop: 5, background: BOX2, border: `1px solid rgba(30,54,194,0.33)`, borderRadius: 8, color: "#FFFFFF", fontSize: 12, padding: "7px 9px", outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
                </div>
                <div>
                  <span style={{ color: "#FFFFFF", fontSize: 9, fontWeight: 700, letterSpacing: 0.6 }}>TO</span>
                  <input type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)}
                    style={{ width: "100%", marginTop: 5, background: BOX2, border: `1px solid rgba(30,54,194,0.33)`, borderRadius: 8, color: "#FFFFFF", fontSize: 12, padding: "7px 9px", outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
                </div>
                {dates.length > 0 && (
                  <div style={{ gridColumn: "1 / -1", color: ACCENT, fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
                    {dates.length} day{dates.length !== 1 ? "s" : ""} selected
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: leave type ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 3, height: 18, borderRadius: 2, background: ACCENT }} />
              <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13 }}>Leave Type</span>
            </div>

            <div>
              <Label>Duration</Label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setKind("full")} style={optBtn(kind === "full")}>Full Day</button>
                <button onClick={() => setKind("half")} style={optBtn(kind === "half")}>Half Day</button>
                <button onClick={() => setKind("quarter")} style={optBtn(kind === "quarter")}>Quarter Day</button>
              </div>
            </div>

            {/* half sub-buttons */}
            {kind === "half" && (
              <div>
                <Label>Which Half</Label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setHalf("first")}  style={optBtn(half === "first")}>First Half<br/><span style={{ fontSize: 9, opacity: 0.8 }}>09:00–13:00</span></button>
                  <button onClick={() => setHalf("second")} style={optBtn(half === "second")}>Second Half<br/><span style={{ fontSize: 9, opacity: 0.8 }}>14:00–18:00</span></button>
                </div>
              </div>
            )}

            {/* quarter sub-buttons */}
            {kind === "quarter" && (
              <div>
                <Label>Which Quarter</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={() => setQuarter("q1")} style={optBtn(quarter === "q1")}>Q1<br/><span style={{ fontSize: 9, opacity: 0.8 }}>09:00–11:00</span></button>
                  <button onClick={() => setQuarter("q2")} style={optBtn(quarter === "q2")}>Q2<br/><span style={{ fontSize: 9, opacity: 0.8 }}>11:00–13:00</span></button>
                  <button onClick={() => setQuarter("q3")} style={optBtn(quarter === "q3")}>Q3<br/><span style={{ fontSize: 9, opacity: 0.8 }}>14:00–16:00</span></button>
                  <button onClick={() => setQuarter("q4")} style={optBtn(quarter === "q4")}>Q4<br/><span style={{ fontSize: 9, opacity: 0.8 }}>16:00–18:00</span></button>
                </div>
              </div>
            )}

            {/* selected slot summary */}
            <div style={{ background: BOX, border: `1px solid ${ACCENT}44`, borderRadius: 11, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>🗓</span>
              <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>{slot.label}</span>
            </div>

            <div>
              <Label>Reason / Note (optional)</Label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} maxLength={80}
                placeholder="e.g. Sick leave, personal, casual leave…" style={inputStyle} />
            </div>

            <button onClick={save} disabled={!canSave} style={{
              width: "100%", padding: 12, borderRadius: 11, border: "none",
              background: canSave ? ACCENT : "rgba(30,54,194,0.30)",
              color: canSave ? "#FFFFFF" : "rgba(255,255,255,0.5)",
              fontSize: 13, fontWeight: 800, cursor: canSave ? "pointer" : "not-allowed",
              fontFamily: "'Sora',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              🌴 {saving ? "Saving…" : (totalRecords > 1 ? `Add Leave · ${totalRecords} records` : "Add Leave")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HR-added records history (Regularize / Remote) — view & remove what HR added ──
interface HrAddedRow {
  emp_id: string;
  emp_name: string;
  date: string;
  index: number;          // index of this session within the day's sessions array
  check_in: string;
  check_out: string;
  note?: string;
}

const HISTORY_STEP = 7;   // window grows by this many days each "Show more"

function fmtSessTime(t?: string) { return t ? t.slice(0, 5) : "—"; }

function HrAddedHistory({
  mode, employees, onToast, onClose,
}: {
  mode: "office" | "remote" | "leave";
  accent: string;
  employees: any[];
  onToast: (msg: string, type?: string) => void;
  onClose: () => void;
}) {
  // blue accent on near-black (Regularize / Remote history)
  const G_TXT   = "#FFFFFF";                  // white text
  const G       = "#1E36C2";                  // blue accent
  const G_BOX   = "#121212";
  const G_BOX2  = "#1A1A1A";
  const G_BORD  = "rgba(30,54,194,0.30)";
  const G_SUB   = "#C8C8C8";
  const G_DIM   = "#7A7A7A";
  const [rows, setRows]       = useState<HrAddedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [daysBack, setDaysBack] = useState(HISTORY_STEP);   // current window size (grows on "Show more")
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [empFilter, setEmpFilter] = useState<string>("all");

  // is this session an HR-added one matching the current mode?
  const matchesMode = useCallback((s: any) => {
    if (s?.source !== "hr") return false;
    if (s?.removed === true) return false;            // already soft-removed
    if (mode === "leave")  return s.leave === true;
    if (mode === "remote") return s.wfh === true && !s.leave;
    return s.regularized === true && !s.leave;        // office
  }, [mode]);

  // scan the last `days` dates (today inclusive) across all employees
  const load = useCallback(async (days: number) => {
    try {
      const dates: string[] = [];
      const cur = new Date();
      for (let i = 0; i < days; i++) {
        dates.push(toDateStr(cur));
        cur.setDate(cur.getDate() - 1);
      }

      const out: HrAddedRow[] = [];
      await Promise.all(employees.map(async (emp) => {
        await Promise.all(dates.map(async (date) => {
          try {
            const snap = await getDoc(doc(db, emp.emp_id, date));
            if (!snap.exists()) return;
            const data = snap.data() as { sessions?: any[]; employee_name?: string };
            (data.sessions || []).forEach((s, idx) => {
              if (!matchesMode(s)) return;
              out.push({
                emp_id: emp.emp_id,
                emp_name: data.employee_name || emp.name,
                date,
                index: idx,
                check_in: s.check_in,
                check_out: s.check_out,
                note: s.note,
              });
            });
          } catch (_) { /* skip this doc */ }
        }));
      }));

      out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.emp_name.localeCompare(b.emp_name)));
      setRows(out);
    } catch (e) {
      console.error(e);
      onToast("Could not load added records.", "error");
    }
  }, [employees, matchesMode, onToast]);

  // initial load (and on refresh) for the current window
  const reload = useCallback(async () => {
    setLoading(true);
    await load(daysBack);
    setLoading(false);
  }, [load, daysBack]);

  // "Show more" — widen the window by another step and re-scan
  const showMore = useCallback(async () => {
    const next = daysBack + HISTORY_STEP;
    setLoadingMore(true);
    setDaysBack(next);
    await load(next);
    setLoadingMore(false);
  }, [daysBack, load]);

  useEffect(() => { reload(); }, [reload]);

  // soft-remove: pull the session out of `sessions`, push it into `removed_sessions`
  // (keeps an audit trail, and every consumer that reads `sessions` is automatically correct)
  async function removeRow(row: HrAddedRow) {
    const key = `${row.emp_id}_${row.date}_${row.index}`;
    setBusyKey(key);
    try {
      const ref  = doc(db, row.emp_id, row.date);
      const snap = await getDoc(ref);
      if (!snap.exists()) { onToast("Record no longer exists.", "error"); await load(daysBack); return; }
      const data = snap.data() as { sessions?: any[]; removed_sessions?: any[]; employee_name?: string };
      const sessions = Array.isArray(data.sessions) ? [...data.sessions] : [];

      // locate the exact session (prefer index, fall back to a content match)
      let target = sessions[row.index];
      let removeAt = row.index;
      const looksRight = target && target.source === "hr" && target.check_in === row.check_in && target.check_out === row.check_out;
      if (!looksRight) {
        removeAt = sessions.findIndex(s => s.source === "hr" && s.check_in === row.check_in && s.check_out === row.check_out && s.removed !== true);
        target = removeAt >= 0 ? sessions[removeAt] : undefined;
      }
      if (!target || removeAt < 0) { onToast("Record already removed.", "error"); await load(daysBack); return; }

      sessions.splice(removeAt, 1);
      // re-number remaining sessions so `session` stays 1-based & contiguous
      sessions.forEach((s, i) => { s.session = i + 1; });

      const audit = Array.isArray(data.removed_sessions) ? [...data.removed_sessions] : [];
      audit.push({ ...target, removed: true, removed_at: Date.now() });

      await setDoc(ref, { sessions, removed_sessions: audit }, { merge: true });

      setRows(prev => prev.filter(r => !(r.emp_id === row.emp_id && r.date === row.date && r.index === row.index)));
      onToast(`Removed ${mode === "leave" ? "leave" : mode === "remote" ? "remote log" : "regularization"} · ${row.emp_name} · ${fmtDateLabel(row.date)} ✓`);
    } catch (e) {
      console.error(e);
      onToast("Could not remove the record.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  const empOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map(r => r.emp_id)));
    return ids.map(id => ({ id, name: rows.find(r => r.emp_id === id)?.emp_name || id }));
  }, [rows]);

  const visible = useMemo(
    () => empFilter === "all" ? rows : rows.filter(r => r.emp_id === empFilter),
    [rows, empFilter]
  );

  // group by date for a clean, scannable list
  const grouped = useMemo(() => {
    const map = new Map<string, HrAddedRow[]>();
    for (const r of visible) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)!.push(r);
    }
    return Array.from(map.entries());
  }, [visible]);

  const empById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const e of employees) m[e.emp_id] = e;
    return m;
  }, [employees]);

  const title = mode === "leave" ? "Leave" : mode === "remote" ? "Logged Remote Work" : "Regularized Attendance";

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 10002, background: "rgba(2,6,23,0.8)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, fontFamily: "'Sora',sans-serif",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(760px,100%)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: "#0D0D0D", border: `1px solid ${G}66`,
        borderRadius: 18, boxShadow: "0 32px 80px rgba(0,0,0,0.7)", overflow: "hidden",
      }}>
        {/* header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${G_BORD}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: "rgba(30,54,194,0.14)", border: `1px solid ${G}44`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🗂</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ color: G_TXT, fontWeight: 800, fontSize: 15, margin: 0 }}>{title} — added by HR</h2>
            <p style={{ color: G_SUB, fontSize: 10.5, margin: "3px 0 0" }}>
              Last {daysBack} days · {rows.length} record{rows.length !== 1 ? "s" : ""} · removing keeps an audit trail
            </p>
          </div>
          <button onClick={reload} disabled={loading} title="Refresh" style={{
            background: "#1E36C2", border: `1px solid #1E36C2`, borderRadius: 9,
            color: "#FFFFFF", fontSize: 11, fontWeight: 700, padding: "7px 11px", cursor: "pointer", fontFamily: "inherit",
          }}>{loading ? "…" : "↻"}</button>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${G_BORD}`, background: G_BOX2,
            color: G_TXT, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* employee filter */}
        {empOptions.length > 1 && (
          <div style={{ padding: "10px 20px", borderBottom: `1px solid ${G_BORD}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: G_DIM, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Filter</span>
            <button onClick={() => setEmpFilter("all")} style={{
              padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${empFilter === "all" ? G + "88" : G_BORD}`,
              background: empFilter === "all" ? "#1E36C2" : "transparent", color: empFilter === "all" ? "#FFFFFF" : G_SUB,
            }}>All</button>
            {empOptions.map(o => (
              <button key={o.id} onClick={() => setEmpFilter(o.id)} style={{
                padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${empFilter === o.id ? G + "88" : G_BORD}`,
                background: empFilter === o.id ? "#1E36C2" : "transparent", color: empFilter === o.id ? "#FFFFFF" : G_SUB,
              }}>{o.name}</button>
            ))}
          </div>
        )}

        {/* list */}
        <div className="hr-scroll" style={{ overflowY: "auto", padding: "14px 20px 18px" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 54, borderRadius: 11, background: G_BOX, opacity: 0.5 }} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: G_SUB, fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🗒️</div>
              Nothing added by HR in the last {daysBack} days.
              <div style={{ marginTop: 16 }}>
                <button onClick={showMore} disabled={loadingMore} style={{
                  padding: "8px 16px", borderRadius: 9, border: `1px solid ${G}`, background: "#1E36C2",
                  color: "#FFFFFF", fontSize: 12, fontWeight: 700, cursor: loadingMore ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}>{loadingMore ? "Loading…" : `Look back ${HISTORY_STEP} more days`}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {grouped.map(([date, dayRows]) => (
                <div key={date} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{
                      color: "#FFFFFF", fontSize: 11.5, fontWeight: 800,
                      background: "rgba(30,54,194,0.22)", border: `1px solid ${G}55`, borderRadius: 8, padding: "4px 10px",
                    }}>{new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                    <div style={{ flex: 1, height: 1, background: G_BORD }} />
                  </div>

                  {dayRows.map(row => {
                    const emp = empById[row.emp_id];
                    const key = `${row.emp_id}_${row.date}_${row.index}`;
                    const removing = busyKey === key;
                    return (
                      <div key={key} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        background: G_BOX, border: `1px solid ${G_BORD}`, borderRadius: 11, padding: "10px 12px",
                      }}>
                        <span style={{
                          width: 32, height: 32, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: G_BOX2,
                          border: `1.5px solid ${G}55`, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: G_TXT,
                        }}>
                          {emp?.profile_image
                            ? <img src={emp.profile_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : initials(row.emp_name)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: G_TXT, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {row.emp_name}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 1 }}>
                            <span style={{ color: G_DIM, fontSize: 9.5, fontFamily: "'JetBrains Mono',monospace" }}>{row.emp_id}</span>
                            <span style={{ color: G_TXT, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 10.5 }}>{fmtSessTime(row.check_in)}</span>
                            <span style={{ color: G_DIM, fontSize: 10 }}>→</span>
                            <span style={{ color: G_TXT, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 10.5 }}>{fmtSessTime(row.check_out)}</span>
                            {row.note ? <span style={{ color: G_SUB, fontSize: 10 }}>· {row.note}</span> : null}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: "#FFFFFF", background: "#1E36C2",
                          border: `1px solid #1E36C2`, borderRadius: 20, padding: "2px 8px", flexShrink: 0,
                        }}>{mode === "leave" ? "LEAVE" : mode === "remote" ? "REMOTE" : "OFFICE"}</span>
                        <button onClick={() => removeRow(row)} disabled={removing} title="Remove this record" style={{
                          flexShrink: 0, padding: "7px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 800,
                          border: `1px solid #1E36C2`, background: "#1E36C2", color: "#FFFFFF",
                          cursor: removing ? "not-allowed" : "pointer", fontFamily: "inherit",
                        }}>{removing ? "Removing…" : "Remove"}</button>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Show more — widen the window by another week, repeatedly */}
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
                <button onClick={showMore} disabled={loadingMore} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 18px", borderRadius: 10, border: `1px solid ${G}`,
                  background: "rgba(30,54,194,0.14)", color: G_TXT, fontSize: 12, fontWeight: 700,
                  cursor: loadingMore ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}>
                  {loadingMore
                    ? "Loading…"
                    : <><span style={{ fontSize: 13 }}>↓</span> Show {HISTORY_STEP} more days (last {daysBack + HISTORY_STEP})</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── HR Main ───────────────────────────────────────────────────────────────────
type NavId = "dashboard" | "requests" | "notices" | "mail" | "regularize" | "remote" | "leave";

function HrMain({ hrName, onLogout, onChangeName }: { hrName: string; onLogout: () => void; onChangeName: () => void }) {
  const [employees, setEmployees]     = useState<any[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [empSearch, setEmpSearch]     = useState("");
  const [showEmpDrop, setShowEmpDrop] = useState(false);
  const [showExport, setShowExport]   = useState(false);
  const [exporting, setExporting]     = useState(false);
  const [nav, setNav]                 = useState<NavId>("dashboard");
  const [pendingReq, setPendingReq]   = useState(0);   // pending regularization requests → blinking badge
  const [weekOffset, setWeekOffset]   = useState(0);   // 0 = current week

  // today's data → KPI cards (always today, independent of week navigation)
  const [todayData, setTodayData]       = useState<Record<string, any>>({});
  const [loadingToday, setLoadingToday] = useState(true);
  // selected-week data → heatmap + not-checked-out list
  const [weekData, setWeekData]         = useState<Record<string, Record<string, any>>>({});
  const [loadingWeek, setLoadingWeek]   = useState(true);

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
  const [historyOpen, setHistoryOpen] = useState(false);   // "view HR-added records" modal

  // Regularize / Remote tab — strict gold-on-dark theme (no blue / red / green)
  const RT_TXT  = "#FFFFFF";                  // pure white text
  const RT_ACC  = "#1E36C2";                  // blue — buttons / highlights / accents
  const RT_BOX  = "#121212";                  // inner container/box background
  const RT_BOX2 = "#1A1A1A";                  // slightly lifted (inputs)
  const RT_BORDER = "rgba(30,54,194,0.30)";
  const RT_SUB  = "#C8C8C8";
  const RT_DIM  = "#7A7A7A";

  const { items, add, remove } = useToast();

  const isRemote   = nav === "remote";
  const accent     = isRemote ? MAGENTA : BLUE;
  const tabIcon    = isRemote ? "🏠" : "🏢";

  const today = toDateStr(new Date());
  const week  = useMemo(() => getWeekByOffset(weekOffset), [weekOffset]);

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

  // count pending regularization requests → drives the blinking nav badge (poll every 30s)
  const refreshPending = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "regularizations"));
      let n = 0;
      snap.docs.forEach(d => {
        const reqs = (d.data().requests as any[]) || [];
        n += reqs.filter(r => r?.status === "pending").length;
      });
      setPendingReq(n);
    } catch (_) {}
  }, []);
  useEffect(() => {
    refreshPending();
    const id = setInterval(refreshPending, 30000);
    return () => clearInterval(id);
  }, [refreshPending]);

  // fetch TODAY's attendance for the KPI cards (independent of week navigation)
  useEffect(() => {
    if (employees.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoadingToday(true);
      const map: Record<string, any> = {};
      await Promise.all(employees.map(async (emp) => {
        try {
          const snap = await getDoc(doc(db, emp.emp_id, today));
          if (snap.exists()) map[emp.emp_id] = snap.data();
        } catch (_) {}
      }));
      if (!cancelled) { setTodayData(map); setLoadingToday(false); }
    })();
    return () => { cancelled = true; };
  }, [employees, today]);

  // fetch the SELECTED week's attendance for the heatmap + not-checked-out list
  useEffect(() => {
    if (employees.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoadingWeek(true);
      const map: Record<string, Record<string, any>> = {};
      await Promise.all(employees.map(async (emp) => {
        map[emp.emp_id] = {};
        await Promise.all(week.map(async (date) => {
          if (date > today) return;
          try {
            const snap = await getDoc(doc(db, emp.emp_id, date));
            if (snap.exists()) map[emp.emp_id][date] = snap.data();
          } catch (_) {}
        }));
      }));
      if (!cancelled) { setWeekData(map); setLoadingWeek(false); }
    })();
    return () => { cancelled = true; };
  }, [employees, week, today]);

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

  // header / greeting meta
  // const _hour      = new Date().getHours();
  // const greeting   = _hour < 12 ? "Good morning" : _hour < 17 ? "Good afternoon" : "Good evening";
  // const firstName  = (hrName || "there").split(" ")[0];
  const todayLabel = new Date().toLocaleDateString("en-IN",{ weekday:"long", day:"2-digit", month:"long", year:"numeric" });

  // ── dashboard derivations ──
const dayStatus = useCallback((empId: string, date: string): string => {
    if (isHoliday(date)) return "H";
    if (isWeekend(date)) return "W";
    if (date > today) return "";
    const dd = weekData[empId]?.[date];
    if (dd && dd.sessions?.length > 0) {
      const work  = dd.sessions.filter((s:any) => !s.leave);
      const leave = dd.sessions.filter((s:any) => s.leave);

      if (leave.length > 0) {
        // Heatmap rule: count worked + leave hours together.
        // If the combined total reaches a full day → show "P" (blue) like a present day; else "L".
        const combined = calcHours(work) + calcHours(leave);
        if (combined >= 8) return "P8";
        return "L";
      }

      const wfh = work.length > 0 && work.every((s:any) => s.wfh === true);
      if (wfh) return "R";
      const hrs = calcHours(work);
      if (hrs >= 8) return "P8";                       // full day → light green, just "P"
      return `P(${(Math.round(hrs*10)/10).toFixed(1)})`; // under 8 → dark green, "P(7.6)"
    }
    return "A";
  }, [weekData, today]);

const stats = useMemo(() => {
  const workday = !isWeekend(today) && !isHoliday(today);
  let present = 0, remote = 0, absent = 0;
  const presentList: any[] = [], remoteList: any[] = [], absentList: any[] = [];
  employees.forEach(emp => {
    const dd = todayData[emp.emp_id];
    if (dd && dd.sessions?.length > 0) {
      const wfh = dd.sessions.every((s:any) => s.wfh === true);
      if (wfh) { remote++;  remoteList.push(emp); }
      else     { present++; presentList.push(emp); }
    } else if (workday) {
      absent++; absentList.push(emp);
    }
  });
  const total = employees.length;
  const rate  = total ? Math.round(((present + remote) / total) * 100) : 0;
  return { present, remote, absent, total, rate, workday, presentList, remoteList, absentList };
}, [employees, todayData, today]);

  // only days up to today (hide future days in the heatmap)
  const visibleDays = useMemo(() => week.filter(d => d <= today), [week, today]);

  const heatDays = useMemo(() => visibleDays.map(d => ({
    date: d,
    dow: new Date(d).toLocaleDateString("en-IN", { weekday:"short" }),
    label: new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short" }),
    isToday: d === today,
  })), [visibleDays, today]);

  const heatRows = useMemo(() => employees.map(emp => ({
    emp, cells: visibleDays.map(d => dayStatus(emp.emp_id, d)),
  })), [employees, visibleDays, dayStatus]);

  // group "no check-out" people under each working day of the week
  const missingByDay = useMemo(() => {
    return week
      .filter(d => d <= today && !isWeekend(d) && !isHoliday(d))   // working days only, up to today
      .map(date => {
        const people: { emp:any; check_in:string }[] = [];
        employees.forEach(emp => {
          const dd = weekData[emp.emp_id]?.[date];
          const ss = dd?.sessions;
          if (!ss || ss.length === 0) return;
          const last = ss[ss.length - 1];                          // only the last session of the day
          if (last.check_in && (!last.check_out || last.check_out === "")) {
            people.push({ emp, check_in: last.check_in });
          }
        });
        return { date, people };
      });
  }, [employees, weekData, week, today]);

  const missingTotal = useMemo(
    () => missingByDay.reduce((n, d) => n + d.people.length, 0),
    [missingByDay]
  );

  const weekRange = `${fmtDateLabel(week[0])} – ${fmtDateLabel(week[6])}`;
  const weekLabel = weekOffset === 0 ? "This Week"
    : weekOffset === -1 ? "Last Week"
    : weekOffset === 1 ? "Next Week"
    : weekRange;

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
  async function handleExport(from: string, to: string, theme: string = "filled") {
    setShowExport(false);
    setExporting(true);
    add("Generating report, please wait…");
    try {
      const todayStr = toDateStr(new Date());
      const dates = getDaysInRange(from, to).filter(d => d <= todayStr);  // never export future days

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

      // ── Borders visible on every table cell ──
      const BORDER_COLOR = "000000"; // black thin gridlines
      const borderAll = {
        top:    { style: "thin", color: { rgb: BORDER_COLOR } },
        bottom: { style: "thin", color: { rgb: BORDER_COLOR } },
        left:   { style: "thin", color: { rgb: BORDER_COLOR } },
        right:  { style: "thin", color: { rgb: BORDER_COLOR } },
      };

      // ── Two selectable looks. "filled" = coloured backgrounds (default),
      //    "minimal" = white cells with coloured text. ──
      const useFill = theme !== "minimal";

      const FILL: Record<string,{bg:string;text:string}> = {
        absent:   { bg: "ff6969", text: "000000" },
        present7: { bg: "ffa8a8", text: "000000" },
        present8: { bg: "89FFCA", text: "000000" },
        weekend:  { bg: "CAFFDA", text: "000000" },
        remote:   { bg: "ffc6dd", text: "000000" },
        holiday:  { bg: "CAFFDA", text: "000000" },
        default:  { bg: "CAFFDA", text: "000000" },
      };
      const TXT: Record<string,string> = {
        absent:   "ff0000",
        present7: "ff0000",
        present8: "000000",
        weekend:  "000000",
        remote:   "000000",
        holiday:  "000000",
        default:  "000000",
      };

      const mkStyle = (key: string, center = true) => {
        const s: any = { border: borderAll };
        if (center) s.alignment = { horizontal: "center" };
        if (useFill) {
          s.fill = { patternType: "solid", fgColor: { rgb: FILL[key].bg } };
          s.font = { color: { rgb: FILL[key].text } };
        } else {
          s.font = { color: { rgb: TXT[key] } };
        }
        return s;
      };

      const styleAbsent   = mkStyle("absent");
      const stylePresent7 = mkStyle("present7");
      const stylePresent8 = mkStyle("present8");
      const styleWeekend  = mkStyle("weekend");
      const styleRemote   = mkStyle("remote");
      const styleHoliday  = mkStyle("holiday");
      const styleDefault  = mkStyle("default", false);
      const cellStyles: Record<string, any> = {};

      const title = from===to
        ? `Attendance Report – ${fmtDateLabel(from)}`
        : `Attendance Report – ${fmtDateLabel(from)} to ${fmtDateLabel(to)}`;
      ws_data.push([title]);                 // row 1 (merged + centered below)

      const headers = ["Emp ID", "Employee Name", ...dates.map(d => fmtDateLabel(d)), "Total Hours"];
      ws_data.push(headers);                 // row 2 → table starts here
      const headerRowIndex = ws_data.length - 1; // = 1
      const styleHeader = { fill: { fgColor: { rgb: "0F1848" } }, font: { color: { rgb: "EEF0FF" }, bold: true }, alignment: { horizontal: "center" }, border: borderAll };
      const styleTitle  = { font: { bold: true, sz: 13, color: { rgb: "0F1848" } }, alignment: { horizontal: "center", vertical: "center" } };

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
            row.push("W");
            cellStyles[cellAddr] = styleWeekend;
          } else {
            const dayData = days[date];
            const allSessions: any[] = dayData?.sessions || [];
            const workSessions = allSessions.filter((s: any) => !s.leave);
            const leaveSessions = allSessions.filter((s: any) => s.leave);
            if (workSessions.length > 0) {
              const isWfh = workSessions.every((s: any) => s.wfh === true);
              const hrs = calcHours(workSessions);
              totalHrs += hrs;
              const hr1 = Math.round(hrs * 10) / 10;   // value as shown (1 decimal)
              const isFull = hr1 >= 8;                  // 8.0 and above → no ()
              if (isWfh) {
                row.push(isFull ? "R" : `R(${hr1.toFixed(1)})`);
                cellStyles[cellAddr] = styleRemote;
              } else {
                row.push(isFull ? "P" : `P(${hr1.toFixed(1)})`);
                cellStyles[cellAddr] = isFull ? stylePresent8 : stylePresent7;
              }
            } else if (leaveSessions.length > 0) {
              // HR-added leave (full/half/quarter) → "L"
              row.push("L");
              cellStyles[cellAddr] = styleAbsent;
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
      const legendText = "Legend:   P = Present (≥8h)   ·   P(x.x) = Present below 8h   ·   R = Remote   ·   L = Leave   ·   A = Absent   ·   H = Holiday   ·   W = Weekend";
      ws_data.push([legendText]);
      const legendRowIndex = ws_data.length - 1;

      const ws = XLSX.utils.aoa_to_sheet(ws_data);

      const colWidths = [
        { wch: 12 }, { wch: 22 },
        ...dates.map(() => ({ wch: 10 })),
        { wch: 12 },
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

      const titleAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
      if (ws[titleAddr]) ws[titleAddr].s = styleTitle;

      const legendAddr = XLSX.utils.encode_cell({ r: legendRowIndex, c: 0 });
      if (ws[legendAddr]) ws[legendAddr].s = { font: { italic: true, sz: 10, color: { rgb: "555555" } }, alignment: { horizontal: "left" } };

      const totalCols = headers.length;
      ws["!merges"] = [
        { s:{r:0,             c:0}, e:{r:0,             c:totalCols-1} },
        { s:{r:legendRowIndex,c:0}, e:{r:legendRowIndex,c:totalCols-1} },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Attendance");

      const safeTo   = to.replace(/-/g,"");
      const safeFrom = from.replace(/-/g,"");
      const fileName = from===to
        ? `Attendance Report ${safeFrom}.xlsx`
        : `Attendance Report ${safeFrom}_${safeTo}.xlsx`;

      XLSX.writeFile(wb, fileName, { cellStyles: true });
      add(`Report downloaded: ${fileName} ✓`);
    } catch (e: any) {
      add("Export failed: " + e.message, "error");
    } finally {
      setExporting(false);
    }
  }

  const TYPE_COLORS: Record<string,string> = {
    permanent:YELLOW, consultant:BLUE, intern:BLUE, guest:TEAL,
  };

  const NAV: { id: NavId; label: string; icon: string; color: string }[] = [
    { id: "dashboard",  label: "Dashboard",             icon: "📊", color: GREEN   },
    { id: "requests",   label: "Regularization Requests", icon: "📥", color: YELLOW },
    { id: "regularize", label: "Regularize Attendance", icon: "🏢", color: BLUE    },
    { id: "remote",     label: "Log Remote Work",       icon: "🏠", color: MAGENTA },
    { id: "leave",      label: "Add Leave",             icon: "🌴", color: RED     },
    { id: "notices",    label: "Notices",               icon: "📢", color: YELLOW  },
    { id: "mail",       label: "Send Email",             icon: "✉️", color: TEAL    },
  ];

  const submitLabel = isRemote
    ? (totalRecords > 1 ? `Log Remote · ${totalRecords} records` : "Log Remote Work")
    : (totalRecords > 1 ? `Regularize · ${totalRecords} records` : "Regularize Attendance");

  const wkBtn = (dis: boolean): React.CSSProperties => ({
    width:26,height:26,borderRadius:7,flexShrink:0,
    border:`2px solid ${YELLOW}`,background:"rgba(96,165,250,0.08)",
    color: dis ? YELLOW : BLUE, fontSize:16,fontWeight:800,lineHeight:1,
    cursor: dis ? "not-allowed" : "pointer", opacity: dis ? 0.5 : 1,
    display:"flex",alignItems:"center",justifyContent:"center",
    fontFamily:"'Sora',sans-serif",
  });

  return (
    <div style={{minHeight:"100vh",background:BG,fontFamily:"'Sora',sans-serif",color:TEXT}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;}
        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(30,54,194,0.3);border-radius:3px;}
        option{background:#121212;color:#FFFFFF;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.7);}
        .emp-row:hover{background:rgba(30,54,194,0.12)!important;}
        select:focus{outline:none;}
        .tab-btn{transition:all 0.15s;border-radius:9px 9px 0 0;}
        .tab-btn:hover:not(:disabled){background:rgba(30,54,194,0.08)!important;color:#FFFFFF!important;}
        .req-badge{ animation: reqblink 1.1s ease-in-out infinite; }
        @keyframes reqblink {
          0%,100% { box-shadow:0 0 0 0 rgba(30,54,194,0.7); opacity:1; transform:scale(1); }
          50%     { box-shadow:0 0 0 6px rgba(30,54,194,0); opacity:0.78; transform:scale(1.12); }
        }
        .save-btn:hover:not(:disabled){opacity:0.9;}
        .export-btn:hover{opacity:0.88;}
        .wk-nav:hover:not(:disabled){background:rgba(96,165,250,0.18) !important;}
        .hr-kpis     { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .hr-analytics{ display:flex; flex-direction:column; gap:16px; }
        @media (max-width: 760px) {
          .hr-header   { padding: 0 14px !important; }
          .hr-nav      { padding: 0 14px !important; }
          .hr-page     { padding: 20px 14px 48px !important; }
          .hr-kpis     { grid-template-columns:1fr 1fr !important; gap:12px !important; }
          .hr-form-body{ grid-template-columns: 1fr !important; gap:18px !important; }
          .hr-datepill { display:none !important; }
        }
        @media (max-width: 600px) {
          .hr-usertext { display:none !important; }
          .hr-greet h1 { font-size:20px !important; }
        }
        @media (max-width: 420px) {
          .hr-kpis     { grid-template-columns:1fr !important; }
        }
        /* Regularize / Remote tab — blue accent on near-black: white labels & inputs */
        .reg-tab label { color: #FFFFFF !important; }
        .reg-tab input::placeholder { color: rgba(255,255,255,0.4) !important; }
        .reg-tab input[type=date], .reg-tab input[type=text] { color: #FFFFFF !important; }
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

      {historyOpen && (
        <HrAddedHistory
          mode={nav === "leave" ? "leave" : nav === "remote" ? "remote" : "office"}
          accent={accent}
          employees={employees}
          onToast={add}
          onClose={()=>setHistoryOpen(false)}
        />
      )}

      {/* ── Top bar ── */}
      <header className="hr-header" style={{
        background:"rgba(8,15,46,0.85)",
        borderBottom:`1px solid ${BORDER}`,padding:"0 24px",
        display:"flex",alignItems:"center",gap:12,minHeight:60,
        position:"sticky",top:0,zIndex:40,backdropFilter:"blur(14px)",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{
            width:34,height:34,borderRadius:10,
            background:"rgba(96,165,250,0.1)",border:`1px solid ${BLUE}33`,
            display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",
          }}>
            <img src={logo} alt="Canary Face" style={{width:22,height:22,objectFit:"contain"}}/>
          </div>
          <div>
            <div style={{color:TEXT,fontWeight:800,fontSize:14,lineHeight:1}}>CanaryFace — HR Panel</div>
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
            background:"#1E36C2",border:`1px solid #1E36C2`,
            borderRadius:10,padding:"8px 14px",cursor:"pointer",transition:"all 0.15s",
            color:"#FFFFFF",fontSize:13,fontWeight:700,fontFamily:"'Sora',sans-serif",whiteSpace:"nowrap",
            boxShadow:`0 4px 14px rgba(30,54,194,0.4)`,
          }}>
          <span style={{fontSize:13,color:"#FFFFFF"}}>⬇</span>
          {exporting ? "Generating…" : "Export Report"}
        </button>

        <div className="hr-datepill" style={{
          display:"flex",alignItems:"center",gap:7,
          background:"rgba(30,54,194,0.06)",border:`1px solid ${BORDER}`,
          borderRadius:10,padding:"8px 13px",
        }}>
          <span style={{fontSize:13}}>📅</span>
          <span style={{color:SUB,fontSize:11,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>{todayLabel}</span>
        </div>

        <div style={{width:1,height:26,background:BORDER}}/>

        {/* HR user chip — click to change name */}
        <button onClick={onChangeName} title="Change your name" className="hr-userchip" style={{
          display:"flex",alignItems:"center",gap:9,
          background:"rgba(30,54,194,0.08)",border:`1px solid ${BORDER}`,
          borderRadius:12,padding:"5px 12px 5px 6px",cursor:"pointer",fontFamily:"'Sora',sans-serif",
        }}>
          <span style={{
            width:30,height:30,borderRadius:"50%",flexShrink:0,
            background:`linear-gradient(135deg,${BLUE},${MAGENTA})`,
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#fff",fontWeight:800,fontSize:11,letterSpacing:0.3,
          }}>{initials(hrName)}</span>
          <span className="hr-usertext" style={{textAlign:"left",lineHeight:1.15}}>
            <span style={{display:"block",color:TEXT,fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>{hrName}</span>
            <span style={{display:"block",color:BLUE,fontSize:9,fontWeight:600,marginTop:1,letterSpacing:0.2}}>HR Administrator</span>
          </span>
        </button>

        <button onClick={onLogout} title="Log out" style={{
          background:"rgba(248,113,113,0.08)",border:`1px solid ${RED}33`,
          borderRadius:9,color:RED,fontSize:10.5,fontWeight:700,padding:"8px 12px",
          cursor:"pointer",fontFamily:"'Sora',sans-serif",whiteSpace:"nowrap",
        }}>Logout</button>
      </header>

      {/* ── Top navbar ── */}
      <nav className="hr-nav" style={{
        position:"sticky",top:60,zIndex:39,
        background:"rgba(8,15,46,0.9)",borderBottom:`1px solid ${BORDER}`,
        backdropFilter:"blur(12px)",padding:"0 28px",
      }}>
        <div style={{maxWidth:HR_MAX_W,margin:"0 auto",display:"flex",gap:4,flexWrap:"wrap"}}>
          {NAV.map(n => {
            const on = nav === n.id;
            return (
              <button key={n.id}
                className="tab-btn"
                onClick={()=>{ if (n.id !== "mail") setNav(n.id); }}
                style={{
                  display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap",
                  padding:"14px 16px",border:"none",background:"transparent",
                  cursor: n.id === "mail" ? "default" : "pointer",
                  fontFamily:"'Sora',sans-serif",fontSize:13,fontWeight:700,
                  color: on ? n.color : SUB,
                  borderBottom: on ? `2px solid ${n.color}` : "2px solid transparent",
                  marginBottom:-1,transition:"all 0.15s",position:"relative",
                }}>
                <span style={{fontSize:15}}>{n.icon}</span>{n.label}
                {n.id === "requests" && pendingReq > 0 && (
                  <span className="req-badge" style={{
                    background:"#FFFFFF",color:"#1E36C2",fontSize:10,fontWeight:800,
                    borderRadius:20,minWidth:18,height:18,padding:"0 5px",
                    display:"inline-flex",alignItems:"center",justifyContent:"center",
                    lineHeight:1,
                  }}>{pendingReq}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Page ── */}
      <div className="hr-page" style={{maxWidth:HR_MAX_W,margin:"0 auto",padding:"26px 28px 64px"}}>

        {/* ===== DASHBOARD ===== */}
        {nav === "dashboard" && (<> 

        {/* KPI cards */}
        <div className="hr-kpis" style={{marginBottom:16}}>
          <StatCard icon="👥" label="Total KSUM Employees" color={BLUE}    loading={loadingToday} value={stats.total}   people={employees} />
          <StatCard icon="🏢" label="Present Today"        color={GREEN}   loading={loadingToday} value={stats.present} sub={stats.total ? `${stats.rate}% on duty` : undefined} people={stats.presentList} />
          <StatCard icon="🏠" label="Remote Today"         color={MAGENTA} loading={loadingToday} value={stats.remote}  people={stats.remoteList} />
          <StatCard icon="🚫" label="Absent Today"         color={RED}     loading={loadingToday} value={stats.absent}  sub={stats.workday ? undefined : "Off day"} people={stats.absentList} alignRight />
        </div>

        {/* Global week switcher — controls every week-based panel on the dashboard */}
        <div style={{
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
          background:"rgba(30,54,194,0.05)",border:`1px solid ${BORDER}`,borderRadius:12,
          padding:"8px 12px",marginBottom:16,
        }}>
          <span style={{color:TEXT,fontSize:11.5,fontWeight:700,letterSpacing:0.3}}>
            Showing data for
          </span>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <button onClick={()=>setWeekOffset(o=>o-1)} title="Previous week" className="wk-nav" style={wkBtn(false)}>‹</button>
            <span style={{minWidth:170,textAlign:"center",color:YELLOW,fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
              {weekLabel}
              <span style={{color:YELLOW,fontWeight:500,fontFamily:"'JetBrains Mono',monospace"}}> · {weekRange}</span>
            </span>
            <button onClick={()=>setWeekOffset(o=>Math.min(0,o+1))} disabled={weekOffset>=0} title="Next week" className="wk-nav" style={wkBtn(weekOffset>=0)}>›</button>
          </div>
        </div>

 
          <Panel
            icon="⏰"
            title="Forgot to Check Out"
            right={<Pill color={missingTotal ? RED : GREEN}>{missingTotal} {missingTotal===1?"person":"people"}</Pill>}
          >
            {loadingWeek ? (
              <div style={{padding:"18px 0",textAlign:"center",color:SUB,fontSize:12}}>Checking this week…</div>
            ) : missingTotal === 0 ? (
              <div style={{padding:"16px 0",textAlign:"center",color:SUB,fontSize:12}}>
                ✅ Everyone checked out properly this week.
              </div>
            ) : (
              <div style={{
                display:"grid",
                gridTemplateColumns:`repeat(${missingByDay.length}, minmax(140px, 200px))`,
                gap:9, overflowX:"auto", justifyContent:"start",
              }}>
                {missingByDay.map(({ date, people }) => {
                  const dow  = new Date(date).toLocaleDateString("en-IN",{weekday:"short"});
                  const dlab = new Date(date).toLocaleDateString("en-IN",{day:"2-digit",month:"short"});
                  const isTodayCol = date === today;
                  return (
                    <div key={date} style={{
                      background:"rgba(30,54,194,0.04)",
                      border:`1px solid ${isTodayCol ? BLUE+"55" : BORDER}`,
                      borderRadius:10, overflow:"hidden", minWidth:0,
                    }}>
                      {/* column header = day + date */}
                      <div style={{
                        padding:"5px 9px", borderBottom:`1px solid ${BORDER}`,
                        display:"flex", alignItems:"center", justifyContent:"space-between", gap:6,
                        background: isTodayCol ? "rgba(96,165,250,0.08)" : "transparent",
                      }}>
                        <div style={{display:"flex",alignItems:"baseline",gap:5}}>
                          <span style={{color:isTodayCol?BLUE:TEXT,fontSize:10.5,fontWeight:700}}>{dow}</span>
                          <span style={{color:DIM,fontSize:8.5,fontFamily:"'JetBrains Mono',monospace"}}>{dlab}</span>
                        </div>
                        <span style={{
                          color: people.length ? RED : GREEN,
                          background: people.length ? `${RED}14` : `${GREEN}14`,
                          border:`1px solid ${(people.length?RED:GREEN)}33`,
                          borderRadius:20, padding:"0px 6px", fontSize:9, fontWeight:800, flexShrink:0,
                        }}>{people.length}</span>
                      </div>

                      {/* people in that day */}
                      <div style={{padding:"6px", display:"flex", flexDirection:"column", gap:4}}>
                        {people.length === 0 ? (
                          <div style={{color:DIM,fontSize:10,textAlign:"center",padding:"6px 0"}}>—</div>
                        ) : people.map((m,i) => {
                          const c = TYPE_COLORS[m.emp.type] || YELLOW;
                          return (
                            <div key={i} style={{
                              display:"flex",alignItems:"center",gap:7,
                              background:"rgba(248,113,113,0.05)",border:`1px solid ${RED}26`,
                              borderRadius:8, padding:"4px 7px",
                            }}>
                              <span style={{
                                width:20,height:20,borderRadius:"50%",flexShrink:0,overflow:"hidden",background:BG,
                                border:`1.5px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center",
                                fontSize:7.5,fontWeight:700,color:c,
                              }}>
                                {m.emp.profile_image ? <img src={m.emp.profile_image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(m.emp.name)}
                              </span>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{color:TEXT,fontSize:10.5,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.emp.name}</div>
                                <div style={{color:GREEN,fontSize:8.5,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>in {m.check_in.slice(0,5)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <div style={{height:10}}/> {/* spacer 
          </div>

        {/* Analytics: weekly heatmap (full width) + not-checked-out (full width) */}
        <div className="hr-analytics">
          <Panel
            icon="🗓"
            title="Weekly Attendance"
          >
            <WeeklyHeatmap days={heatDays} rows={heatRows} loading={loadingWeek} />
          </Panel>

        </div>
        </>)}

        {/* ===== REGULARIZE / REMOTE ===== */}
        {(nav === "regularize" || nav === "remote") && (
        <div className="reg-tab" style={{
          margin:"-26px -28px -64px",
          background:"#0D0D0D",
          padding:"30px 28px 64px",minHeight:"calc(100vh - 121px)",
        }}>
          <div style={{maxWidth:HR_MAX_W,margin:"0 auto",width:"100%"}}>
          {/* Section heading */}
          <div className="hr-toolbar" style={{
            display:"flex",alignItems:"center",gap:11,
            paddingBottom:14,marginBottom:18,borderBottom:`1px solid rgba(30,54,194,0.22)`,
          }}>
            <span style={{
              width:38,height:38,borderRadius:11,flexShrink:0,
              background:"rgba(30,54,194,0.14)",border:`1px solid rgba(30,54,194,0.4)`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
            }}>{tabIcon}</span>
            <div style={{flex:1}}>
              <h2 style={{color:"#FFFFFF",fontWeight:800,fontSize:16,margin:0,lineHeight:1.15}}>
                {isRemote ? "Log Remote Work" : "Regularize Attendance"}
              </h2>
              <p style={{color:"#E8E8E8",fontSize:11,margin:"3px 0 0"}}>
                {isRemote ? "Mark selected people as working from home." : "Mark selected people as present in office."}
              </p>
            </div>
            <button onClick={()=>setHistoryOpen(true)} style={{
              display:"flex",alignItems:"center",gap:7,flexShrink:0,
              background:"#1E36C2",border:`1px solid #1E36C2`,borderRadius:10,
              color:"#FFFFFF",fontSize:12,fontWeight:700,padding:"9px 14px",cursor:"pointer",fontFamily:"'Sora',sans-serif",
            }}>
              <span style={{fontSize:13}}>🗂</span>
              {isRemote ? "View Logged Remote" : "View Regularized"}
            </button>
          </div>

          {/* Inline mode note (no box) */}
          <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:18}}>
            <span style={{fontSize:14,lineHeight:1.4}}>{isRemote ? "🏠" : "🏢"}</span>
            <span style={{color:"#CFCFCF",fontSize:11.5,lineHeight:1.55}}>
              {isRemote
                ? "Logs the selected people as working from home for the chosen dates."
                : "Marks the selected people as present in office — use when face-scan was missed (network drop, off-site meeting, etc.). Counts as a normal in-office day."}
            </span>
          </div>

          {/* Form body — flows directly on the page, no surrounding card */}
          <div className="hr-form-body" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,alignItems:"start"}}>

            {/* ── LEFT ── */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:3,height:18,borderRadius:2,background:"#1E36C2"}}/>
                <span style={{color:"#FFFFFF",fontWeight:700,fontSize:13}}>Employees & Date Range</span>
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
                      width:"100%",background:RT_BOX,
                      border:`1px solid ${selEmps.length?RT_ACC+"88":RT_BORDER}`,
                      borderRadius:9,color:RT_TXT,fontSize:12.5,padding:"9px 32px 9px 32px",
                      outline:"none",fontFamily:"'Sora',sans-serif",
                    }}
                  />
                  {empSearch && (
                    <button onClick={()=>setEmpSearch("")}
                      style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",color:RT_DIM,fontSize:16,cursor:"pointer",lineHeight:1}}>×</button>
                  )}
                </div>

                {/* Selection toolbar */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                  <span style={{
                    color: selEmps.length ? RT_ACC : RT_DIM, fontSize:10.5, fontWeight:700,
                    background: selEmps.length ? "rgba(30,54,194,0.12)" : "transparent",
                    border:`1px solid ${selEmps.length ? "rgba(30,54,194,0.4)" : RT_BORDER}`,
                    borderRadius:20, padding:"2px 9px",
                  }}>{selEmps.length} selected</span>
                  <div style={{flex:1}}/>
                  <button onClick={selectAllFiltered} style={{
                    background:"rgba(30,54,194,0.08)",border:`1px solid ${RT_BORDER}`,borderRadius:7,
                    color:RT_TXT,fontSize:10,fontWeight:700,padding:"4px 9px",cursor:"pointer",fontFamily:"inherit",
                  }}>Select all{empSearch?` (${filteredEmps.length})`:""}</button>
                  {selEmps.length>0 && (
                    <button onClick={clearAll} style={{
                      background:"rgba(30,54,194,0.08)",border:`1px solid rgba(30,54,194,0.4)`,borderRadius:7,
                      color:RT_TXT,fontSize:10,fontWeight:700,padding:"4px 9px",cursor:"pointer",fontFamily:"inherit",
                    }}>Clear</button>
                  )}
                </div>

                {/* Selected chips */}
                {selEmps.length > 0 && (
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:9,maxHeight:120,overflowY:"auto"}}>
                    {selEmps.map(emp => {
                      return (
                        <span key={emp.emp_id} style={{
                          display:"flex",alignItems:"center",gap:6,background:"rgba(30,54,194,0.10)",
                          border:`1px solid rgba(30,54,194,0.33)`,borderRadius:20,padding:"3px 6px 3px 4px",
                        }}>
                          <span style={{
                            width:20,height:20,borderRadius:"50%",flexShrink:0,overflow:"hidden",background:RT_BOX,
                            border:`1.5px solid rgba(30,54,194,0.45)`,display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:8,fontWeight:700,color:RT_TXT,
                          }}>
                            {emp.profile_image ? <img src={emp.profile_image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(emp.name)}
                          </span>
                          <span style={{color:RT_TXT,fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{emp.name}</span>
                          <button onClick={()=>removeEmp(emp.emp_id)} style={{
                            background:"none",border:"none",color:RT_TXT,fontSize:14,cursor:"pointer",
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
                    background:RT_BOX,border:`1px solid ${RT_BORDER}`,borderRadius:10,
                    marginTop:3,maxHeight:240,overflowY:"auto",
                    boxShadow:"0 14px 40px rgba(0,0,0,0.65)",
                  }}>
                    {filteredEmps.map(emp => {
                      const on = isSelected(emp.emp_id);
                      return (
                        <div key={emp.emp_id} className="emp-row"
                          onClick={()=>toggleEmp(emp)}
                          style={{display:"flex",alignItems:"center",gap:9,padding:"8px 12px",cursor:"pointer",
                            background: on ? "rgba(30,54,194,0.12)" : "transparent",
                            borderBottom:`1px solid rgba(30,54,194,0.10)`,transition:"background 0.1s"}}>
                          {/* checkbox */}
                          <div style={{
                            width:16,height:10,borderRadius:5,flexShrink:0,
                            border:`1.5px solid ${on?RT_ACC:RT_BORDER}`,background:on?RT_ACC:"transparent",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            color:"#0B1020",fontSize:11,fontWeight:900,
                          }}>{on?"✓":""}</div>
                          <div style={{
                            width:24,height:24,borderRadius:"50%",flexShrink:0,overflow:"hidden",
                            background:RT_BOX,border:`1.5px solid rgba(30,54,194,0.35)`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                          }}>
                            {emp.profile_image
                              ? <img src={emp.profile_image} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                              : <span style={{color:RT_TXT,fontWeight:700,fontSize:9}}>{initials(emp.name)}</span>
                            }
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{color:RT_TXT,fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{emp.name}</div>
                            <div style={{color:RT_DIM,fontSize:9,fontFamily:"'JetBrains Mono',monospace"}}>{emp.emp_id} · {emp.department}</div>
                          </div>
                          <span style={{
                            fontSize:8.5,color:RT_TXT,flexShrink:0,
                            background:"rgba(30,54,194,0.12)",border:`1px solid rgba(30,54,194,0.25)`,
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
                <div style={{background:RT_BOX,border:`1px solid ${RT_BORDER}`,borderRadius:11,padding:"13px"}}>
                  <div style={{marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:RT_ACC,boxShadow:`0 0 4px ${RT_ACC}`}}/>
                      <span style={{color:RT_TXT,fontSize:9,fontWeight:700,letterSpacing:0.6}}>FROM</span>
                    </div>
                    <div style={{display:"flex",gap:7}}>
                      <input type="date" value={fromDate}
                        onChange={e=>{setFromDate(e.target.value);if(e.target.value>toDate)setToDate(e.target.value);}}
                        style={{flex:1,background:RT_BOX2,border:`1px solid rgba(30,54,194,0.33)`,borderRadius:8,color:RT_TXT,fontSize:12,padding:"7px 9px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                      <button onClick={()=>{const t=toDateStr(new Date());setFromDate(t);if(t>toDate)setToDate(t);}}
                        style={{background:"rgba(30,54,194,0.12)",border:`1px solid rgba(30,54,194,0.44)`,borderRadius:7,color:RT_TXT,fontSize:9,fontWeight:700,padding:"7px 10px",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>Today</button>
                    </div>
                  </div>
                  <div style={{textAlign:"center",color:RT_DIM,fontSize:12,margin:"2px 0"}}>↕</div>
                  <div style={{marginTop:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:RT_ACC,boxShadow:`0 0 4px ${RT_ACC}`}}/>
                      <span style={{color:RT_TXT,fontSize:9,fontWeight:700,letterSpacing:0.6}}>TO</span>
                    </div>
                    <div style={{display:"flex",gap:7}}>
                      <input type="date" value={toDate} min={fromDate}
                        onChange={e=>setToDate(e.target.value)}
                        style={{flex:1,background:RT_BOX2,border:`1px solid rgba(30,54,194,0.33)`,borderRadius:8,color:RT_TXT,fontSize:12,padding:"7px 9px",outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                      <button onClick={()=>setToDate(toDateStr(new Date()))}
                        style={{background:"rgba(30,54,194,0.12)",border:`1px solid rgba(30,54,194,0.44)`,borderRadius:7,color:RT_TXT,fontSize:9,fontWeight:700,padding:"7px 10px",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>Today</button>
                    </div>
                  </div>

                  {fromDate && toDate && toDate >= fromDate && (
                    <div style={{
                      marginTop:10,display:"flex",alignItems:"center",gap:7,
                      background:"rgba(30,54,194,0.10)",border:`1px solid rgba(30,54,194,0.33)`,
                      borderRadius:8,padding:"6px 10px",
                    }}>
                      <span style={{color:RT_TXT,fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {fromDate}{fromDate!==toDate?` → ${toDate}`:""}
                      </span>
                      <span style={{
                        background:"rgba(30,54,194,0.18)",border:`1px solid rgba(30,54,194,0.33)`,
                        borderRadius:20,padding:"1px 8px",color:RT_TXT,fontSize:10,fontWeight:700,flexShrink:0,
                      }}>{rangeDays} {rangeDays===1?"day":"days"}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── RIGHT ── */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:3,height:18,borderRadius:2,background:"#1E36C2"}}/>
                <span style={{color:"#FFFFFF",fontWeight:700,fontSize:13}}>Work Hours</span>
              </div>

              <TimeSelect label="CHECK IN"  hour={fromHour} minute={fromMin} onHour={setFromHour} onMinute={setFromMin} color={RT_ACC}/>
              <TimeSelect label="CHECK OUT" hour={toHour}   minute={toMin}   onHour={setToHour}   onMinute={setToMin}   color={RT_ACC}/>

              {/* Duration */}
              <div style={{
                background: RT_BOX,
                border:`1px solid ${duration>0?"rgba(30,54,194,0.44)":RT_BORDER}`,
                borderRadius:11,padding:"11px 14px",
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{fontSize:16}}>⏱</span>
                {duration>0 ? (
                  <div>
                    <div style={{color:RT_TXT,fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:15}}>
                      {dHr}h {String(dMin).padStart(2,"0")}m per day
                    </div>
                    {(rangeDays>1 || selEmps.length>1) && (
                      <div style={{color:RT_SUB,fontSize:10,marginTop:2}}>
                        {selEmps.length>1 ? `${selEmps.length} employees · ` : ""}
                        {rangeDays>1 ? `${rangeDays} days · ` : ""}
                        {totalRecords} record{totalRecords!==1?"s":""}
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{color:RT_DIM,fontSize:12}}>Set a valid time range</span>
                )}
              </div>

              {/* Reason / Note */}
              <div>
                <Label>Reason / Note (optional)</Label>
                <input type="text" value={note} onChange={e=>setNote(e.target.value)}
                  placeholder="e.g. Network drop, off-site meeting, scanner issue…"
                  maxLength={80}
                  style={{
                    width:"100%",background:RT_BOX,border:`1px solid ${RT_BORDER}`,
                    borderRadius:9,color:RT_TXT,fontSize:12.5,padding:"9px 11px",
                    outline:"none",fontFamily:"'Sora',sans-serif",caretColor:RT_ACC,
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
                    ? "rgba(30,54,194,0.30)"
                    : "#1E36C2",
                  color: (selEmps.length===0||saving||duration===0) ? "rgba(255,255,255,0.55)" : "#FFFFFF",
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
        )}

        {/* ===== ADD LEAVE ===== */}
        {nav === "leave" && (
          <LeaveManager employees={employees} onToast={add} onViewHistory={()=>setHistoryOpen(true)} />
        )}

        {/* ===== REGULARIZATION REQUESTS ===== */}
        {nav === "requests" && (
          <RegularizationRequests hrName={hrName} employees={employees} onToast={add} onResolved={refreshPending} />
        )}

        {/* ===== NOTICES ===== */}
        {nav === "notices" && (
          <NoticesManager onToast={add} />
        )}

        {/* ===== SEND MAIL ===== */}
        {nav === "mail" && (
          <SendMail hrName={hrName} employees={employees} onToast={add} />
        )}
      </div>
    </div>
  );
}