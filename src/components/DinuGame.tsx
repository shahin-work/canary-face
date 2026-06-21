import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { FaFrog } from "react-icons/fa6";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

// Frog runner (Chrome-dino style). High scores are shared via Firestore:
//   settings/dinogame  →  { scores: { [emp_id]: { name, score } }, hi: <number> }
// localStorage is kept only as an offline fallback.
const HISCORE_KEY  = "maheighistscore";     // single overall high score (fallback)
const SCORES_KEY   = "cf_dino_scores";      // { [emp_id]: { name, score } } (fallback)
const DINO_DOC     = ["settings", "dinogame"] as const;

interface Player { name: string; emp_id: string; }
interface ScoreEntry { name: string; score: number; }

function loadScores(): Record<string, ScoreEntry> {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch { return {}; }
}
function saveScores(s: Record<string, ScoreEntry>) {
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export default function DinuGame({
  onClose, fullPage = false, players = [], myId = null,
}: {
  onClose: () => void;
  fullPage?: boolean;
  players?: Player[];
  myId?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frogRef   = useRef<HTMLDivElement>(null);   // the frog element overlaid on the canvas

  const [running, setRunning] = useState(true);
  const [over, setOver]       = useState(false);
  const [score, setScore]     = useState(0);

  // who is playing — defaults to "me", but anyone can pick themselves before/after a run
  const myName = useMemo(() => players.find(p => p.emp_id === myId)?.name || "", [players, myId]);
  const [playerId, setPlayerId]     = useState<string>(myId || (players[0]?.emp_id ?? ""));
  const [pickerOpen, setPickerOpen] = useState(false);
  const playerName = players.find(p => p.emp_id === playerId)?.name || myName || "Player";

  const [scores, setScores] = useState<Record<string, ScoreEntry>>(() => loadScores());
  const [hi, setHi] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(HISCORE_KEY) || "0", 10);
    return Number.isFinite(v) ? v : 0;
  });

  // top 5 by score
  const leaderboard = useMemo(() => {
    return Object.values(scores)
      .filter(e => e && e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [scores]);
  const myBest = (playerId && scores[playerId]?.score) || 0;

  // mutable game state
  const g = useRef({
    y: 0, vy: 0, onGround: true,
    obstacles: [] as { x: number; w: number; h: number }[],
    speed: 6, dist: 0, spawn: 0, scoreF: 0, dead: false, paused: false,
  });
  const runningRef   = useRef(true);
  const overRef      = useRef(false);
  const lastScoreRef = useRef(0);
  const playerIdRef  = useRef(playerId);
  useEffect(() => { runningRef.current = running; g.current.paused = !running; }, [running]);
  useEffect(() => { overRef.current = over; }, [over]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  // load the shared leaderboard from Firestore on open (merge over the local fallback)
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, DINO_DOC[0], DINO_DOC[1]));
        if (!snap.exists()) return;
        const data = snap.data() as any;
        const remote: Record<string, ScoreEntry> = (data?.scores && typeof data.scores === "object") ? data.scores : {};
        setScores(prev => {
          const out = { ...prev };
          for (const [id, e] of Object.entries(remote)) {
            const entry = e as ScoreEntry;
            if (entry && typeof entry.score === "number" && (!out[id] || entry.score > out[id].score)) out[id] = entry;
          }
          saveScores(out);
          return out;
        });
        if (typeof data?.hi === "number") setHi(prev => Math.max(prev, data.hi));
      } catch (_) { /* offline → use local fallback */ }
    })();
  }, []);

  const jump = useCallback(() => {
    if (overRef.current || !runningRef.current) return;
    const st = g.current;
    if (st.onGround) { st.vy = -13.5; st.onGround = false; }
  }, []);

  const restart = useCallback(() => {
    g.current = { y: 0, vy: 0, onGround: true, obstacles: [], speed: 6, dist: 0, spawn: 0, scoreF: 0, dead: false, paused: false };
    lastScoreRef.current = 0;
    setScore(0); setOver(false); setRunning(true);
  }, []);

  // record a finished run for the active player → local state + localStorage + Firestore
  const recordScore = useCallback((finalScore: number) => {
    setHi(prev => {
      if (finalScore > prev) { localStorage.setItem(HISCORE_KEY, String(finalScore)); return finalScore; }
      return prev;
    });
    const pid = playerIdRef.current;
    if (!pid) return;

    setScores(prev => {
      const cur = prev[pid]?.score || 0;
      if (finalScore <= cur) return prev;
      const name = players.find(p => p.emp_id === pid)?.name || prev[pid]?.name || "Player";
      const next = { ...prev, [pid]: { name, score: finalScore } };
      saveScores(next);
      return next;
    });

    // persist to the shared leaderboard (read-merge-write so we never lower someone else's best)
    (async () => {
      try {
        const ref = doc(db, DINO_DOC[0], DINO_DOC[1]);
        const snap = await getDoc(ref);
        const data = snap.exists() ? (snap.data() as any) : {};
        const remote: Record<string, ScoreEntry> = (data?.scores && typeof data.scores === "object") ? data.scores : {};
        const name = players.find(p => p.emp_id === pid)?.name || remote[pid]?.name || "Player";
        const prevBest = remote[pid]?.score || 0;
        const hiRemote = typeof data?.hi === "number" ? data.hi : 0;
        if (finalScore <= prevBest && finalScore <= hiRemote) return; // nothing new to write
        const merged = { ...remote };
        if (finalScore > prevBest) merged[pid] = { name, score: finalScore };
        await setDoc(ref, { scores: merged, hi: Math.max(hiRemote, finalScore) }, { merge: true });
        // reflect any newer remote entries locally too
        setScores(prev => {
          const out = { ...prev };
          for (const [id, e] of Object.entries(merged)) {
            if (!out[id] || (e as ScoreEntry).score > out[id].score) out[id] = e as ScoreEntry;
          }
          saveScores(out);
          return out;
        });
        setHi(prev => Math.max(prev, hiRemote, finalScore));
      } catch (_) { /* offline → localStorage already holds it */ }
    })();
  }, [players]);

  // keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (overRef.current) restart(); else jump();
      } else if (e.code === "KeyP") {
        setRunning(r => !r);
      } else if (e.code === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, restart, onClose]);

  // main loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    const BASE = H - 40;
    const DINO_X = 70, DINO_W = 46, DINO_H = 46;
    const GRAV = 0.7;
    let raf = 0;

    function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    const loop = () => {
      const st = g.current;

      if (!st.paused && !st.dead) {
        st.vy += GRAV;
        st.y += st.vy;
        if (st.y >= 0) { st.y = 0; st.vy = 0; st.onGround = true; }

        st.dist += st.speed;
        st.speed = 6 + Math.min(8, st.dist / 1800);

        st.spawn -= st.speed;
        if (st.spawn <= 0) {
          const h = 26 + Math.floor(Math.random() * 26);
          const w = 14 + Math.floor(Math.random() * 16);
          st.obstacles.push({ x: W + 10, w, h });
          st.spawn = 280 + Math.random() * 260;
        }
        st.obstacles.forEach(o => { o.x -= st.speed; });
        st.obstacles = st.obstacles.filter(o => o.x + o.w > -20);

        st.scoreF += st.speed * 0.02;
        const sc = Math.floor(st.scoreF);
        if (sc !== lastScoreRef.current) { lastScoreRef.current = sc; setScore(sc); }

        const dinoBot = BASE + st.y;
        for (const o of st.obstacles) {
          const oTop = BASE - o.h;
          const hit = DINO_X + 8 < o.x + o.w && DINO_X + DINO_W - 8 > o.x && dinoBot - 4 > oTop;
          if (hit) {
            st.dead = true;
            setOver(true);
            recordScore(Math.floor(st.scoreF));
            break;
          }
        }
      }

      // ── draw ──
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0D0D0D"; ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "#1E36C2"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, BASE); ctx.lineTo(W, BASE); ctx.stroke();

      ctx.strokeStyle = "rgba(30,54,194,0.45)"; ctx.lineWidth = 2;
      const dashOff = (g.current.dist % 40);
      for (let x = -dashOff; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, BASE + 8); ctx.lineTo(x + 16, BASE + 8); ctx.stroke();
      }

      // obstacles (lily-pad style nubs)
      ctx.fillStyle = "#F87171";
      for (const o of g.current.obstacles) {
        roundRect(ctx, o.x, BASE - o.h, o.w, o.h, 4);
        ctx.fill();
      }

      // position the frog element over the canvas (scaled to the rendered canvas size)
      const frogEl = frogRef.current;
      if (frogEl) {
        const rect = canvas.getBoundingClientRect();
        const sx = rect.width / W, sy = rect.height / H;
        const px = DINO_X * sx;
        const py = (BASE - DINO_H + g.current.y) * sy;
        frogEl.style.transform = `translate(${px}px, ${py}px)`;
        frogEl.style.width  = `${DINO_W * sx}px`;
        frogEl.style.height = `${DINO_H * sy}px`;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [recordScore]);

  // ── shells ──
  const shell: React.CSSProperties = fullPage
    ? { position: "fixed", inset: 0, zIndex: 5000, background: "#0D0D0D", display: "flex", flexDirection: "column" }
    : { position: "fixed", inset: 0, zIndex: 5000, background: "rgba(2,4,12,0.92)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };

  const card: React.CSSProperties = fullPage
    ? { flex: 1, display: "flex", flexDirection: "column", width: "100%", maxWidth: 1100, margin: "0 auto", padding: "0 16px" }
    : { width: "min(940px,100%)", background: "#0D0D0D", border: "1px solid rgba(30,54,194,0.4)", borderRadius: 16, boxShadow: "0 30px 90px rgba(0,0,0,0.8)", overflow: "hidden" };

  return (
    <div onClick={fullPage ? undefined : onClose} style={{ ...shell, fontFamily: "'Sora',sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, justifyContent: fullPage ? "center" : undefined }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid rgba(30,54,194,0.3)" }}>
          <FaFrog size={20} color="#4ADE80" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 15 }}>Frog Runner</div>
            <div style={{ color: "#7A7A7A", fontSize: 10 }}>Space / Tap to jump · P to pause · Esc to close</div>
          </div>

          {/* player selector — anyone can play */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setPickerOpen(o => !o)} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 8,
              border: "1px solid rgba(30,54,194,0.5)", background: "#121212", color: "#FFFFFF",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", maxWidth: 200,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE80" }} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playerName}</span>
              <span style={{ color: "#7A7A7A", fontSize: 9 }}>▾</span>
            </button>
            {pickerOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 10, width: 240, maxHeight: 300, overflowY: "auto",
                background: "#121212", border: "1px solid rgba(30,54,194,0.4)", borderRadius: 10, boxShadow: "0 16px 44px rgba(0,0,0,0.7)", padding: 6,
              }}>
                {players.length === 0 && <div style={{ color: "#7A7A7A", fontSize: 12, padding: 8 }}>No employees loaded.</div>}
                {players.map(p => (
                  <button key={p.emp_id} onClick={() => { setPlayerId(p.emp_id); setPickerOpen(false); }} style={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    padding: "7px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: p.emp_id === playerId ? "rgba(30,54,194,0.25)" : "transparent",
                    color: p.emp_id === playerId ? "#FFFFFF" : "#C8C8C8", fontSize: 12, fontWeight: 600,
                  }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    {scores[p.emp_id]?.score ? <span style={{ color: "#4ADE80", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>{scores[p.emp_id].score}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* full-word score readouts */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#7A7A7A", fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase" }}>High Score</div>
              <div style={{ color: "#FFD700", fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{hi}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#7A7A7A", fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase" }}>Score</div>
              <div style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{score}</div>
            </div>
          </div>

          <button onClick={() => setRunning(r => !r)} disabled={over} style={{
            padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(30,54,194,0.5)",
            background: "#1E36C2", color: "#FFFFFF", fontSize: 12, fontWeight: 700,
            cursor: over ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: over ? 0.5 : 1, flexShrink: 0,
          }}>{running ? "Pause" : "Resume"}</button>
          {/* Back → reloads the main dashboard (also clears fun mode) */}
          <button onClick={() => window.location.reload()} title="Back to dashboard" style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8,
            border: "1px solid rgba(30,54,194,0.3)", background: "#121212", color: "#C8C8C8",
            cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", flexShrink: 0,
          }}>← Back</button>
        </div>

        {/* body: leaderboard + canvas */}
        <div style={{ display: "flex", gap: 14, padding: "14px 16px", alignItems: "stretch", flexWrap: "wrap" }}>
          {/* leaderboard */}
          <div style={{
            width: 220, flexShrink: 0, background: "#121212", border: "1px solid rgba(30,54,194,0.25)",
            borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>🏆 Leaderboard</div>
            {leaderboard.length === 0 ? (
              <div style={{ color: "#7A7A7A", fontSize: 11 }}>No scores yet — be the first!</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {leaderboard.map((e, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800,
                      background: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : "#CD7F32",
                      color: "#1a1400",
                    }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, color: "#FFFFFF", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                    <span style={{ color: "#4ADE80", fontSize: 12, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{e.score}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid rgba(30,54,194,0.25)" }}>
              <div style={{ color: "#7A7A7A", fontSize: 9, letterSpacing: 0.4, textTransform: "uppercase" }}>My Highest Score</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 2 }}>
                <span style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{playerName}</span>
                <span style={{ color: "#FFD700", fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{myBest}</span>
              </div>
            </div>
          </div>

          {/* canvas + frog overlay */}
          <div style={{ flex: 1, minWidth: 320, position: "relative" }}
            onPointerDown={() => { if (over) restart(); else jump(); }}>
            <canvas ref={canvasRef} width={900} height={300} style={{ display: "block", width: "100%", height: "auto", borderRadius: 10, touchAction: "none", cursor: "pointer" }} />

            {/* the frog (HTML overlay driven by the loop) */}
            <div ref={frogRef} style={{
              position: "absolute", top: 0, left: 0, display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none", willChange: "transform",
            }}>
              <FaFrog color="#4ADE80" style={{ width: "100%", height: "100%", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }} />
            </div>

            {/* pause overlay */}
            {!running && !over && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(13,13,13,0.55)", borderRadius: 10 }}>
                <span style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>⏸ PAUSED</span>
              </div>
            )}

            {/* game over overlay */}
            {over && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(13,13,13,0.72)", borderRadius: 10 }}>
                <span style={{ color: "#F87171", fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>GAME OVER</span>
                <span style={{ color: "#C8C8C8", fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                  {playerName} · Score {score} · Best {Math.max(myBest, score)}{score >= hi && score > 0 ? "  🏆 New record!" : ""}
                </span>
                <button onClick={restart} style={{
                  padding: "10px 22px", borderRadius: 10, border: "none", background: "#1E36C2",
                  color: "#FFFFFF", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                }}>Play again ↺</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
