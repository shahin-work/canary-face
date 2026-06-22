import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LuBird, LuBug, LuServerCrash, LuUnplug, LuFileX,
  LuBadgeCheck, LuRocket, LuStar, LuShieldCheck,
} from "react-icons/lu";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Canary Runner — a premium, branded endless runner for the Canary Digital dashboard.
 * A yellow canary dodges software-themed hazards (bugs, crashes, unplugged APIs, corrupted
 * files) and collects positive achievements (clean code, deploys, perf, security).
 *
 * Shared high scores (kept compatible with the previous game doc):
 *   settings/dinogame  →  { scores: { [emp_id]: { name, score } }, hi: <number> }
 */
const HISCORE_KEY = "maheighistscore";
const SCORES_KEY  = "cf_dino_scores";
const GAME_DOC    = ["settings", "dinogame"] as const;

interface Player { name: string; emp_id: string; }
interface ScoreEntry { name: string; score: number; }

function loadScores(): Record<string, ScoreEntry> {
  try { const o = JSON.parse(localStorage.getItem(SCORES_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}
function saveScores(s: Record<string, ScoreEntry>) { try { localStorage.setItem(SCORES_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

// ── dark palette (only) ─────────────────────────────────────────────────────────
const T = {
  sky0: "#05080F", sky1: "#0A1226", sky2: "#0E1838",
  city: "rgba(46,68,150,0.62)", cityMid: "rgba(34,52,120,0.55)", cityFar: "rgba(26,40,96,0.5)",
  ground: "#2A48E0", groundDash: "rgba(130,160,255,0.4)",
  grid: "rgba(70,110,235,0.12)", node: "rgba(120,175,255,0.6)",
  text: "#FFFFFF", sub: "#A8B8E8", dim: "#5A6BA0",
  panel: "rgba(10,16,40,0.78)", panelBord: "rgba(110,140,255,0.4)",
};
const CANARY = "#FFD43B";
const CANARY_DK = "#E0A800";
const DANGER = "#F8595B";
const GOOD = "#34E08A";

// ── obstacles / collectibles (react-icons rasterised to canvas images) ──────────
const OBSTACLE_DEFS = [
  { Icon: LuBug,         color: "#FF5A5A" },
  { Icon: LuServerCrash, color: "#FF7A3C" },
  { Icon: LuUnplug,      color: "#FF4D8D" },
  { Icon: LuFileX,       color: "#FF5A5A" },
];
const COLLECT_DEFS = [
  { Icon: LuBadgeCheck,  color: "#34E08A", reward: 25, label: "Clean Code" },
  { Icon: LuRocket,      color: "#56B3FF", reward: 30, label: "Deploy" },
  { Icon: LuStar,        color: "#FFD43B", reward: 25, label: "Feature" },
  { Icon: LuShieldCheck, color: "#7CE08A", reward: 35, label: "Security" },
];

// render a react-icon into a loaded <img> (drawn on canvas), once
function iconToImage(Icon: React.ComponentType<any>, color: string, px = 64): HTMLImageElement {
  const svg = renderToStaticMarkup(<Icon color={color} size={px} strokeWidth={2.4} />);
  const img = new Image();
  img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  return img;
}

// ── tiny WebAudio blips ─────────────────────────────────────────────────────────
function makeAudio() {
  let ctx: AudioContext | null = null;
  const ensure = () => { if (!ctx) { try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { ctx = null; } } return ctx; };
  const blip = (f: number, d: number, type: OscillatorType = "sine", gain = 0.05) => {
    const c = ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = gain;
    o.connect(g); g.connect(c.destination);
    const t = c.currentTime; o.start(t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.stop(t + d);
  };
  return {
    jump:    () => blip(620, 0.12, "sine", 0.05),
    flap:    () => blip(760, 0.1, "sine", 0.05),
    collect: () => { blip(880, 0.08, "triangle", 0.06); setTimeout(() => blip(1240, 0.1, "triangle", 0.05), 60); },
    over:    () => { blip(300, 0.18, "sawtooth", 0.06); setTimeout(() => blip(160, 0.28, "sawtooth", 0.05), 120); },
  };
}

export default function CanaryGame({
  onClose, fullPage = false, players = [], myId = null,
}: {
  onClose: () => void;
  fullPage?: boolean;
  players?: Player[];
  myId?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const birdRef   = useRef<HTMLDivElement>(null);
  const audioRef  = useRef(makeAudio());
  const obsImgs   = useRef<{ img: HTMLImageElement; color: string }[]>([]);
  const colImgs   = useRef<{ img: HTMLImageElement; color: string; reward: number; label: string }[]>([]);

  const [phase, setPhase] = useState<"start" | "playing" | "paused" | "over">("start");
  const [score, setScore] = useState(0);
  const [muted, setMuted] = useState(false);
  const [achievement, setAchievement] = useState<string | null>(null);

  // player
  const myName = useMemo(() => players.find(p => p.emp_id === myId)?.name || "", [players, myId]);
  const [playerId, setPlayerId]     = useState<string>(myId || (players[0]?.emp_id ?? ""));
  const [pickerOpen, setPickerOpen] = useState(false);
  const playerName = players.find(p => p.emp_id === playerId)?.name || myName || "Player";

  const [scores, setScores] = useState<Record<string, ScoreEntry>>(() => loadScores());
  const [hi, setHi] = useState<number>(() => { const v = parseInt(localStorage.getItem(HISCORE_KEY) || "0", 10); return Number.isFinite(v) ? v : 0; });

  const leaderboard = useMemo(() => Object.values(scores).filter(e => e && e.score > 0).sort((a, b) => b.score - a.score).slice(0, 5), [scores]);
  const myBest = (playerId && scores[playerId]?.score) || 0;

  // build the icon images once
  useEffect(() => {
    obsImgs.current = OBSTACLE_DEFS.map(d => ({ img: iconToImage(d.Icon, d.color), color: d.color }));
    colImgs.current = COLLECT_DEFS.map(d => ({ img: iconToImage(d.Icon, d.color), color: d.color, reward: d.reward, label: d.label }));
  }, []);

  // ── mutable game state ──
  const g = useRef({
    y: 0, vy: 0, onGround: true, jumps: 0,
    obstacles: [] as { x: number; w: number; h: number; idx: number }[],
    collects:  [] as { x: number; y: number; got: boolean; idx: number; bob: number }[],
    particles: [] as { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string }[],
    nodes:     [] as { x: number; y: number; r: number; tw: number; vx: number }[],
    links:     [] as { a: number; b: number }[],
    cityFar:   [] as { x: number; w: number; h: number }[],
    cityMid:   [] as { x: number; w: number; h: number }[],
    cityNear:  [] as { x: number; w: number; h: number }[],
    streams:   [] as { x: number; y: number; len: number; sp: number; a: number }[],
    code:      [] as { x: number; y: number; ch: string; sp: number; a: number; size: number }[],
    clouds:    [] as { x: number; y: number; s: number; sp: number }[],
    speed: 6, dist: 0, spawn: 160, cSpawn: 300, scoreF: 0, shake: 0,
    dead: false, paused: false,
  });
  const phaseRef = useRef(phase), mutedRef = useRef(muted), lastScoreRef = useRef(0), playerIdRef = useRef(playerId), milestoneRef = useRef(0);
  useEffect(() => { phaseRef.current = phase; g.current.paused = phase === "paused"; }, [phase]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  const sfx = (k: "jump" | "flap" | "collect" | "over") => { if (!mutedRef.current) audioRef.current[k](); };

  // difficulty derived from score — simple at first, harder after 100/200/300…
  const tuning = (sc: number) => {
    const lvl = Math.min(6, Math.floor(sc / 100));            // 0..6
    return {
      speed: 6 + lvl * 0.9,                                   // base speed grows per level
      gap:   Math.max(150, 360 - lvl * 34),                   // obstacle gap shrinks
      varies: 60 + lvl * 18,                                  // gap randomness
    };
  };

  const seedScenery = useCallback((W: number, H: number) => {
    const st = g.current;
    st.cityFar = []; st.cityMid = []; st.cityNear = []; st.nodes = []; st.links = []; st.streams = []; st.code = []; st.clouds = [];
    for (let x = 0; x < W + 300; x += 56 + Math.random() * 40) st.cityFar.push({ x, w: 34 + Math.random() * 28, h: 50 + Math.random() * 90 });
    for (let x = 0; x < W + 300; x += 74 + Math.random() * 46) st.cityMid.push({ x, w: 46 + Math.random() * 32, h: 80 + Math.random() * 140 });
    for (let x = 0; x < W + 300; x += 96 + Math.random() * 60) st.cityNear.push({ x, w: 56 + Math.random() * 44, h: 110 + Math.random() * 200 });
    for (let i = 0; i < 40; i++) st.nodes.push({ x: Math.random() * W, y: Math.random() * (H * 0.6), r: 1 + Math.random() * 2.4, tw: Math.random() * Math.PI * 2, vx: 0.15 + Math.random() * 0.5 });
    for (let i = 0; i < 20; i++) { const a = (Math.random() * st.nodes.length) | 0, b = (Math.random() * st.nodes.length) | 0; if (a !== b) st.links.push({ a, b }); }
    for (let i = 0; i < 22; i++) st.streams.push({ x: Math.random() * W, y: Math.random() * (H * 0.62), len: 40 + Math.random() * 90, sp: 1.5 + Math.random() * 3, a: 0.25 + Math.random() * 0.4 });
    const GL = "01{}<>/;=()$#".split("");
    for (let i = 0; i < 46; i++) st.code.push({ x: Math.random() * W, y: Math.random() * H, ch: GL[(Math.random() * GL.length) | 0], sp: 0.4 + Math.random() * 1.3, a: 0.12 + Math.random() * 0.3, size: 10 + Math.random() * 9 });
    for (let i = 0; i < 8; i++) st.clouds.push({ x: Math.random() * W, y: 14 + Math.random() * (H * 0.34), s: 50 + Math.random() * 90, sp: 0.2 + Math.random() * 0.5 });
  }, []);

  const reset = useCallback(() => {
    const c = g.current;
    g.current = {
      ...c, y: 0, vy: 0, onGround: true, jumps: 0,
      obstacles: [], collects: [], particles: [],
      speed: 6, dist: 0, spawn: 200, cSpawn: 300, scoreF: 0, shake: 0,
      dead: false, paused: false,
    };
    lastScoreRef.current = 0; milestoneRef.current = 0;
    setScore(0);
  }, []);

  // jump — single from ground; a second quick press grants extra lift (double jump → fly higher)
  const jump = useCallback(() => {
    const st = g.current;
    if (phaseRef.current !== "playing" || st.dead) return;
    if (st.onGround) {
      st.vy = -13.4; st.onGround = false; st.jumps = 1; sfx("jump");
      for (let i = 0; i < 9; i++) st.particles.push({ x: 0, y: 0, vx: -1 - Math.random() * 3, vy: 1 + Math.random() * 3, life: 0, max: 24 + Math.random() * 18, col: Math.random() < 0.7 ? "255,212,59" : "255,255,255" });
    } else if (st.jumps < 2) {
      // mid-air second flap → go higher
      st.vy = -11.5; st.jumps = 2; sfx("flap");
      for (let i = 0; i < 7; i++) st.particles.push({ x: 0, y: 0, vx: -1 - Math.random() * 2.5, vy: 0.5 + Math.random() * 2, life: 0, max: 22 + Math.random() * 14, col: "255,212,59" });
    }
  }, []);

  const recordScore = useCallback((finalScore: number) => {
    setHi(prev => { if (finalScore > prev) { localStorage.setItem(HISCORE_KEY, String(finalScore)); return finalScore; } return prev; });
    const pid = playerIdRef.current; if (!pid) return;
    setScores(prev => {
      const cur = prev[pid]?.score || 0; if (finalScore <= cur) return prev;
      const name = players.find(p => p.emp_id === pid)?.name || prev[pid]?.name || "Player";
      const next = { ...prev, [pid]: { name, score: finalScore } }; saveScores(next); return next;
    });
    (async () => {
      try {
        const ref = doc(db, GAME_DOC[0], GAME_DOC[1]);
        const snap = await getDoc(ref);
        const data = snap.exists() ? (snap.data() as any) : {};
        const remote: Record<string, ScoreEntry> = (data?.scores && typeof data.scores === "object") ? data.scores : {};
        const name = players.find(p => p.emp_id === pid)?.name || remote[pid]?.name || "Player";
        const prevBest = remote[pid]?.score || 0;
        const hiRemote = typeof data?.hi === "number" ? data.hi : 0;
        if (finalScore <= prevBest && finalScore <= hiRemote) return;
        const merged = { ...remote };
        if (finalScore > prevBest) merged[pid] = { name, score: finalScore };
        await setDoc(ref, { scores: merged, hi: Math.max(hiRemote, finalScore) }, { merge: true });
        setScores(prev => { const out = { ...prev }; for (const [id, e] of Object.entries(merged)) if (!out[id] || (e as ScoreEntry).score > out[id].score) out[id] = e as ScoreEntry; saveScores(out); return out; });
        setHi(prev => Math.max(prev, hiRemote, finalScore));
      } catch { /* offline */ }
    })();
  }, [players]);

  const start = useCallback(() => { reset(); setPhase("playing"); }, [reset]);
  const die = useCallback(() => { g.current.dead = true; g.current.shake = 16; sfx("over"); recordScore(Math.floor(g.current.scoreF)); setPhase("over"); }, [recordScore]);

  const popAchievement = (msg: string) => { setAchievement(msg); window.setTimeout(() => setAchievement(a => (a === msg ? null : a)), 1700); };

  // load shared leaderboard
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, GAME_DOC[0], GAME_DOC[1]));
        if (!snap.exists()) return;
        const data = snap.data() as any;
        const remote: Record<string, ScoreEntry> = (data?.scores && typeof data.scores === "object") ? data.scores : {};
        setScores(prev => { const out = { ...prev }; for (const [id, e] of Object.entries(remote)) { const en = e as ScoreEntry; if (en && typeof en.score === "number" && (!out[id] || en.score > out[id].score)) out[id] = en; } saveScores(out); return out; });
        if (typeof data?.hi === "number") setHi(prev => Math.max(prev, data.hi));
      } catch { /* offline */ }
    })();
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (phaseRef.current === "start" || phaseRef.current === "over") start(); else jump();
      } else if (e.code === "KeyP") { setPhase(p => (p === "playing" ? "paused" : p === "paused" ? "playing" : p)); }
      else if (e.code === "KeyM") { setMuted(m => !m); }
      else if (e.code === "Escape") { onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, start, onClose]);

  // ── main loop ──
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    // size the canvas to its container (full-screen feel), handle DPR for crisp 60fps
    let W = 0, H = 0, BASE = 0;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(360, r.width); H = Math.max(240, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      BASE = H - 54;
      seedScenery(W, H);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const BIRD_X = 86, BIRD_W = 48, BIRD_H = 40, GRAV = 0.72;
    let raf = 0;

    const rrect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath(); ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };

    const loop = () => {
      const st = g.current;
      const playing = phaseRef.current === "playing" && !st.dead;

      if (playing) {
        st.vy += GRAV; st.y += st.vy;
        if (st.y >= 0) { st.y = 0; st.vy = 0; st.onGround = true; st.jumps = 0; }

        const tune = tuning(Math.floor(st.scoreF));
        st.dist += st.speed;
        st.speed += (tune.speed - st.speed) * 0.02;            // ease toward target speed

        // obstacles
        st.spawn -= st.speed;
        if (st.spawn <= 0) {
          const h = 30 + Math.floor(Math.random() * 26);
          st.obstacles.push({ x: W + 30, w: 34, h, idx: (Math.random() * OBSTACLE_DEFS.length) | 0 });
          st.spawn = tune.gap + Math.random() * tune.varies;
        }
        st.obstacles.forEach(o => { o.x -= st.speed; });
        st.obstacles = st.obstacles.filter(o => o.x + o.w > -40);

        // collectibles
        st.cSpawn -= st.speed;
        if (st.cSpawn <= 0) {
          st.collects.push({ x: W + 60, y: 46 + Math.random() * 120, got: false, idx: (Math.random() * COLLECT_DEFS.length) | 0, bob: Math.random() * Math.PI * 2 });
          st.cSpawn = 420 + Math.random() * 460;
        }
        st.collects.forEach(c => { c.x -= st.speed; c.bob += 0.08; });
        st.collects = st.collects.filter(c => c.x > -40 && !c.got);

        // score + milestones
        st.scoreF += st.speed * 0.02;
        const sc = Math.floor(st.scoreF);
        if (sc !== lastScoreRef.current) { lastScoreRef.current = sc; setScore(sc); }
        if (sc >= milestoneRef.current + 100) { milestoneRef.current = Math.floor(sc / 100) * 100; popAchievement(`🔥 ${milestoneRef.current} — faster!`); }

        // collisions
        const birdTop = BASE - BIRD_H + st.y, birdBot = BASE + st.y;
        for (const o of st.obstacles) {
          const oTop = BASE - o.h;
          if (BIRD_X + 10 < o.x + o.w && BIRD_X + BIRD_W - 10 > o.x && birdBot - 6 > oTop && birdTop < BASE) { die(); break; }
        }
        for (const c of st.collects) {
          if (c.got) continue;
          const cy = BASE - BIRD_H - c.y + Math.sin(c.bob) * 4, by = BASE - BIRD_H + st.y;
          if (Math.abs(c.x - (BIRD_X + BIRD_W / 2)) < 30 && Math.abs(cy - by) < 34) {
            const def = COLLECT_DEFS[c.idx]; c.got = true; st.scoreF += def.reward; sfx("collect");
            popAchievement(`${def.label} +${def.reward}`);
            for (let i = 0; i < 9; i++) st.particles.push({ x: c.x - BIRD_X, y: cy - by, vx: 1 + Math.random() * 2, vy: -1 + Math.random() * -2, life: 0, max: 22 + Math.random() * 14, col: "52,224,138" });
          }
        }
      }

      // scenery always drifts (alive on every screen); faster while playing
      const flow = playing ? st.speed : 2.4;
      st.cityFar.forEach(b => { b.x -= flow * 0.10; if (b.x + b.w < -4) { b.x = W + Math.random() * 70; b.h = 50 + Math.random() * 90; } });
      st.cityMid.forEach(b => { b.x -= flow * 0.26; if (b.x + b.w < -4) { b.x = W + Math.random() * 80; b.h = 80 + Math.random() * 140; } });
      st.cityNear.forEach(b => { b.x -= flow * 0.5;  if (b.x + b.w < -4) { b.x = W + Math.random() * 90; b.h = 110 + Math.random() * 200; } });
      st.streams.forEach(s => { s.x -= s.sp + flow * 0.55; if (s.x + s.len < 0) { s.x = W + Math.random() * 90; s.y = Math.random() * (H * 0.62); } });
      st.code.forEach(p => { p.x -= p.sp + flow * 0.22; p.y -= 0.25; if (p.x < -10) { p.x = W + Math.random() * 40; p.y = Math.random() * H; } if (p.y < -10) p.y = H + 10; });
      st.clouds.forEach(c => { c.x -= c.sp + flow * 0.07; if (c.x + c.s < -10) { c.x = W + Math.random() * 90; c.y = 14 + Math.random() * (H * 0.34); } });
      st.nodes.forEach(n => { n.tw += 0.05; n.x -= n.vx + flow * 0.06; if (n.x < -4) n.x = W + Math.random() * 30; });
      st.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life++; });
      st.particles = st.particles.filter(p => p.life < p.max);
      if (st.shake > 0) st.shake *= 0.86;

      // ── draw ──
      const shX = st.shake > 0.4 ? (Math.random() - 0.5) * st.shake : 0;
      const shY = st.shake > 0.4 ? (Math.random() - 0.5) * st.shake : 0;
      ctx.save(); ctx.translate(shX, shY);

      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, T.sky0); sky.addColorStop(0.6, T.sky1); sky.addColorStop(1, T.sky2);
      ctx.fillStyle = sky; ctx.fillRect(-30, -30, W + 60, H + 60);

      // cloud-infra blobs
      for (const c of st.clouds) {
        const grd = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.s);
        grd.addColorStop(0, "rgba(70,105,210,0.16)"); grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(c.x, c.y, c.s, 0, Math.PI * 2); ctx.fill();
      }
      // floating code
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const p of st.code) { ctx.font = `${p.size}px 'JetBrains Mono', monospace`; ctx.fillStyle = `rgba(130,170,255,${p.a})`; ctx.fillText(p.ch, p.x, p.y); }
      // node mesh
      ctx.lineWidth = 1;
      for (const lk of st.links) { const a = st.nodes[lk.a], b = st.nodes[lk.b]; if (!a || !b) continue; const dx = a.x - b.x, dy = a.y - b.y; if (dx * dx + dy * dy > 210 * 210) continue; ctx.strokeStyle = "rgba(110,150,255,0.10)"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (const n of st.nodes) { const a = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(n.tw)); ctx.fillStyle = T.node.replace(/[\d.]+\)$/, `${a})`); ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); }
      // data streams
      ctx.lineWidth = 2;
      for (const s of st.streams) { const grd = ctx.createLinearGradient(s.x, 0, s.x + s.len, 0); grd.addColorStop(0, "rgba(96,165,250,0)"); grd.addColorStop(0.5, `rgba(120,180,255,${s.a})`); grd.addColorStop(1, "rgba(96,165,250,0)"); ctx.strokeStyle = grd; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.len, s.y); ctx.stroke(); }

      // 3 city layers (3D depth)
      ctx.fillStyle = T.cityFar; for (const b of st.cityFar) ctx.fillRect(b.x, BASE - b.h, b.w, b.h);
      ctx.fillStyle = T.cityMid; for (const b of st.cityMid) ctx.fillRect(b.x, BASE - b.h, b.w, b.h);
      for (const b of st.cityNear) {
        ctx.fillStyle = T.city; ctx.fillRect(b.x, BASE - b.h, b.w, b.h);
        ctx.fillStyle = "rgba(160,200,255,0.28)";
        for (let wy = BASE - b.h + 10; wy < BASE - 8; wy += 13) for (let wx = b.x + 7; wx < b.x + b.w - 7; wx += 13) if ((wx + wy) % 3 === 0) ctx.fillRect(wx, wy, 4, 6);
      }

      // perspective grid floor (3D feel)
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
      for (let x = -((st.dist * 0.6) % 54); x < W + 80; x += 54) { ctx.beginPath(); ctx.moveTo(x, BASE); ctx.lineTo(x - 120, H); ctx.stroke(); }
      for (let i = 1; i <= 5; i++) { const yy = BASE + (H - BASE) * (i / 5) * (i / 5); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }

      // ground
      ctx.strokeStyle = T.ground; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, BASE); ctx.lineTo(W, BASE); ctx.stroke();
      ctx.strokeStyle = T.groundDash; ctx.lineWidth = 2;
      const dashOff = (st.dist % 46);
      for (let x = -dashOff; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, BASE + 10); ctx.lineTo(x + 20, BASE + 10); ctx.stroke(); }

      // collectibles — icon image + glow + tiny label below
      for (const c of st.collects) {
        if (c.got) continue;
        const cy = BASE - BIRD_H - c.y + Math.sin(c.bob) * 4;
        const def = COLLECT_DEFS[c.idx], im = colImgs.current[c.idx]?.img;
        ctx.save();
        ctx.shadowColor = def.color; ctx.shadowBlur = 18;
        if (im && im.complete) ctx.drawImage(im, c.x - 16, cy - 16, 32, 32);
        ctx.restore();
      }

      // obstacles — bright high-opacity plate + glowing border + icon image (no text on object)
      for (const o of st.obstacles) {
        const oy = BASE - o.h, def = OBSTACLE_DEFS[o.idx], im = obsImgs.current[o.idx]?.img;
        // solid danger plate
        ctx.fillStyle = "rgba(248,89,91,0.30)";
        rrect(o.x - 5, oy - 8, o.w + 10, o.h + 8, 8); ctx.fill();
        ctx.shadowColor = def.color; ctx.shadowBlur = 16;
        ctx.strokeStyle = def.color; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.shadowBlur = 0;
        const s = Math.min(o.h, 34);
        if (im && im.complete) ctx.drawImage(im, o.x + o.w / 2 - s / 2, BASE - s - 2, s, s);
      }

      // particles
      for (const p of st.particles) { const a = 1 - p.life / p.max; ctx.fillStyle = `rgba(${p.col},${a})`; ctx.beginPath(); ctx.arc(BIRD_X + p.x, BASE + st.y - 6 + p.y, 2.6, 0, Math.PI * 2); ctx.fill(); }

      // bird overlay (HTML icon)
      const birdEl = birdRef.current;
      if (birdEl) {
        birdEl.style.transform = `translate(${BIRD_X}px, ${BASE - BIRD_H + st.y}px) rotate(${Math.max(-20, Math.min(22, st.vy * 2.2))}deg)`;
        birdEl.style.width = `${BIRD_W}px`; birdEl.style.height = `${BIRD_H}px`;
      }

      ctx.restore();
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [seedScenery, die]);

  // ── layout ──
  const overlay = (lines: { t: string; size: number; color: string; weight?: number; mt?: number }[]) => (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", padding: 16, pointerEvents: "none" }}>
      {lines.map((l, i) => <div key={i} style={{ color: l.color, fontSize: l.size, fontWeight: l.weight ?? 800, marginTop: l.mt ?? 0, letterSpacing: l.size > 26 ? 0.5 : 0.2, textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>{l.t}</div>)}
    </div>
  );
  const iconBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.panelBord}`, background: T.panel, color: T.text, cursor: "pointer", fontSize: 15, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: T.sky0, display: "flex", flexDirection: "column", fontFamily: "'Sora',sans-serif" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${T.panelBord}`, flexShrink: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${CANARY}22`, border: `1px solid ${CANARY}66`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <LuBird size={20} color={CANARY} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: T.text, fontWeight: 800, fontSize: 15 }}>Canary Runner</div>
          <div style={{ color: T.dim, fontSize: 10 }}>Space to jump · double-tap to fly higher · P pause · M mute · Esc close</div>
        </div>

        {/* player picker */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setPickerOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.panelBord}`, background: T.panel, color: T.text, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", maxWidth: 200 }}>
            <LuBird size={13} color={CANARY} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playerName}</span>
            <span style={{ color: T.dim, fontSize: 9 }}>▾</span>
          </button>
          {pickerOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 10, width: 250, maxHeight: 320, overflowY: "auto", background: T.sky1, border: `1px solid ${T.panelBord}`, borderRadius: 10, boxShadow: "0 16px 44px rgba(0,0,0,0.6)", padding: 6 }}>
              {players.length === 0 && <div style={{ color: T.dim, fontSize: 12, padding: 8 }}>No employees loaded.</div>}
              {players.map(p => (
                <button key={p.emp_id} onClick={() => { setPlayerId(p.emp_id); setPickerOpen(false); }} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", background: p.emp_id === playerId ? `${CANARY}1f` : "transparent", color: p.emp_id === playerId ? T.text : T.sub, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                  {scores[p.emp_id]?.score ? <span style={{ color: CANARY, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>{scores[p.emp_id].score}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* scores */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: T.dim, fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase" }}>Best Score</div>
            <div style={{ color: CANARY, fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{hi}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: T.dim, fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase" }}>Score</div>
            <div style={{ color: T.text, fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{score}</div>
          </div>
        </div>

        <button onClick={() => setPhase(p => (p === "playing" ? "paused" : p === "paused" ? "playing" : p))} disabled={phase === "start" || phase === "over"} title="Pause (P)" style={{ ...iconBtn, opacity: (phase === "start" || phase === "over") ? 0.4 : 1 }}>{phase === "paused" ? "▶" : "⏸"}</button>
        <button onClick={() => setMuted(m => !m)} title="Mute (M)" style={iconBtn}>{muted ? "🔇" : "🔊"}</button>
        {fullPage
          ? <button onClick={() => window.location.reload()} title="Back to dashboard" style={{ ...iconBtn, width: "auto", padding: "0 13px", fontSize: 12, fontWeight: 700 }}>← Back</button>
          : <button onClick={onClose} title="Close (Esc)" style={iconBtn}>×</button>}
      </div>

      {/* play area — fills the rest of the screen */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* leaderboard rail */}
        <div style={{ width: 248, flexShrink: 0, borderRight: `1px solid ${T.panelBord}`, background: "rgba(8,12,30,0.6)", padding: "16px 16px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 800 }}>🏆 Top Runners</div>
          {leaderboard.length === 0 ? (
            <div style={{ color: T.dim, fontSize: 11 }}>No scores yet — be the first!</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {leaderboard.map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 21, height: 21, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: i === 0 ? CANARY : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : T.panelBord, color: i < 3 ? "#1a1400" : T.text }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, color: T.text, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                  <span style={{ color: CANARY, fontSize: 12.5, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{e.score}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${T.panelBord}` }}>
            <div style={{ color: T.dim, fontSize: 9, letterSpacing: 0.4, textTransform: "uppercase" }}>My Best</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 3 }}>
              <span style={{ color: T.text, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>{playerName}</span>
              <span style={{ color: CANARY, fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{myBest}</span>
            </div>
          </div>
        </div>

        {/* canvas fills remaining space */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}
          onPointerDown={() => { if (phase === "start" || phase === "over") start(); else jump(); }}>
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: "pointer" }} />

          <div ref={birdRef} style={{ position: "absolute", top: 0, left: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", willChange: "transform", color: CANARY, filter: `drop-shadow(0 3px 8px ${CANARY_DK}cc)` }}>
            <LuBird style={{ width: "100%", height: "100%" }} strokeWidth={2.2} />
          </div>

          {achievement && (
            <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: GOOD, color: "#06210F", fontSize: 13, fontWeight: 800, padding: "7px 16px", borderRadius: 22, boxShadow: "0 6px 20px rgba(0,0,0,0.5)", animation: "cg-pop 0.25s ease", pointerEvents: "none" }}>{achievement}</div>
          )}

          {phase === "start" && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,20,0.5)" }}>
              {overlay([
                { t: "Canary Runner", size: 46, color: CANARY },
                { t: "Dodge bugs, crashes & failed deploys · grab the wins", size: 15, color: T.sub, weight: 600, mt: 4 },
                { t: "Press SPACE to Start", size: 17, color: T.text, mt: 16 },
              ])}
            </div>
          )}
          {phase === "paused" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(5,8,20,0.6)" }}>
              <span style={{ color: T.text, fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>⏸ PAUSED</span>
            </div>
          )}
          {phase === "over" && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,20,0.66)" }}>
              {overlay([
                { t: "Game Over", size: 40, color: DANGER },
                { t: `${playerName} · Score ${score}`, size: 16, color: T.text, weight: 700, mt: 8 },
                { t: `Best ${Math.max(myBest, score)}${score >= hi && score > 0 ? "  🏆 New record!" : ""}`, size: 13, color: T.sub, weight: 600, mt: 2 },
                { t: "Press SPACE to Play Again", size: 16, color: CANARY, mt: 16 },
              ])}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes cg-pop { from { opacity: 0; transform: translateX(-50%) translateY(-6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
}
