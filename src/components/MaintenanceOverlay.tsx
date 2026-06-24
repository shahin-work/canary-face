// import { useEffect, useMemo, useState } from "react";
import { useEffect, useState } from "react";
import frbsProof from "../assets/frbs.png";
import DecryptedText from "./DecryptedText";
import ASCIIText from "./ASCIIText";

/**
 * Shown when Firebase throws "resource-exhausted" — i.e. we've burned through the
 * day's free read quota. It's a maintenance screen, but make it fun: nothing is
 * actually broken. Writes still work, today's data is saving fine, and it becomes
 * visible tomorrow once the read quota resets.
 *
 * It is a HARD MODAL — no close button, no Esc, no click-outside, scroll locked.
 * The only escape hatch is the game (onPlay), which returns here when closed.
 *
 * Everything scales with the viewport width → looks right from phone to ultrawide.
 */

// rotating dev-humor headlines (the big yellow line)
const QUIPS = [
  "Our Firebase took one look at today's traffic, said “nah fam”, and clocked out. 🐤",
  "Plot twist: the database is fine. The dashboard is just emotionally unavailable today.",
  "We hit the free-tier read limit. Firebase is currently lying down with a cold towel. 🧊",
  "64,000 reads. 108 writes. We read like it's a competitive sport. 🏅",
  "Today's data is safe and cozy in the DB. It just refuses to come out until tomorrow.",
  "Status: scaling. ETA: tomorrow morning. Vibes: immaculate. ✨",
  "Are you guys F5-ing this on purpose to flex the read counter? 👀 Respect, honestly.",
  "Error 429: Too Many Of You Being Curious. We're flattered. 🥹",
  "The canary is fine. It's just on a smoke break it definitely earned. 🚬🐤",
  "We didn't crash. We 'gracefully entered a brief contemplative state'. Big difference.",
];

// the fake 'agents working on it' terminal feed — funnier, longer
// const TERMINAL = [
//   // "$ canary scale --reason \"free tier said enough\" --vibes immaculate",
//   // "→ booting 3 agents… 🤖🤖🤖  (one of them is very caffeinated ☕)",
//   // "→ agent#1: today's check-ins are saving in the background ✓",
//   // "→ agent#2: writes flowing smoothly (108 and counting) ✓",
//   // "→ agent#3: gently arguing with the read counter… ⏳",
//   // "→ agent#3: read counter said \"50K or nothing\" 😤",
//   // "→ negotiating more quota with the billing gods 🙏💸",
//   // "→ ETA: tomorrow, fresh quota, dashboard wide awake ☀️",
//   // "→ note to team: maybe stop refreshing 64,000 times 😅",
//   // "$ all systems: ✅ data safe   ⏳ display catching up   🐤 morale: high",
// ];

// little 'did you know' facts that rotate at the bottom
const FACTS = [
  "Fun fact: refreshing harder does NOT summon more quota. We checked. Twice.",
  "Fun fact: your check-in today is 100% saved. It's just shy until tomorrow.",
  "Fun fact: 64K reads in one day is technically a flex. We're not mad. Mostly.",
  "Fun fact: the canary is union now and demands quota breaks. 🐤📋",
  "Fun fact: nobody lost any data. The only casualty was our free tier's dignity.",
];

const Y = "#FFD43B", BG0 = "#05080F", BG1 = "#0A1226", SUB = "#A8B8E8", DIM = "#5A6BA0";

// clamp helper for fully fluid sizing based on viewport width
const clampPx = (min: number, vw: number, pref: number, max: number) =>
  Math.max(min, Math.min(max, min + (max - min) * Math.min(1, Math.max(0, (vw - 360) / (pref - 360)))));

export default function MaintenanceOverlay(_props: { onPlay?: () => void }) {
  // ── live viewport width → drives all responsive sizing ──
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  const isPhone = vw < 640;

  // fluid sizes (scale smoothly between a small phone and a wide desktop)
  const S = {
    maxW:       Math.min(vw - 28, 1040),
    asciiH:     clampPx(150, vw, 1100, 320),     // ASCII title height — much bigger now
    asciiFont:  Math.round(clampPx(6, vw, 1100, 11)),
    asciiText:  Math.round(clampPx(150, vw, 1100, 260)),
    logo:       Math.round(clampPx(58, vw, 900, 92)),
    h1:         clampPx(20, vw, 900, 34),
    quip:       clampPx(13.5, vw, 900, 20),
    body:       clampPx(12.5, vw, 900, 15.5),
    term:       clampPx(11, vw, 900, 14),
    cta:        clampPx(13, vw, 900, 15.5),
    pad:        clampPx(16, vw, 900, 36),
    gap:        clampPx(12, vw, 900, 20),
  };

  // cycle the quip + fact for a bit of life
  const [qi, setQi] = useState(0);
  const [fi, setFi] = useState(0);
  useEffect(() => {
    const a = setInterval(() => setQi(i => (i + 1) % QUIPS.length), 4600);
    const b = setInterval(() => setFi(i => (i + 1) % FACTS.length), 5200);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);

  // ── HARD MODAL: lock scroll + swallow Esc while mounted ──
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const stopEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", stopEsc, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", stopEsc, true);
    };
  }, []);

  // const terminal = useMemo(() => TERMINAL, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onContextMenu={e => e.preventDefault()}
      style={{
        position: "fixed", inset: 0, zIndex: 100000,
        background: `radial-gradient(1200px 600px at 50% -10%, ${BG1}, ${BG0})`,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        overflowY: "auto", fontFamily: "'Sora',sans-serif",
      }}>
      <div style={{
        width: "100%", maxWidth: S.maxW, minHeight: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", gap: S.gap, textAlign: "center", padding: `${S.pad}px 16px ${S.pad + 16}px`,
        margin: "0 auto",
      }}>
        {/* ── big hacker ASCII title ── */}
        <div style={{ position: "relative", width: "100%", height: S.asciiH, marginTop: 2 }}>
          <ASCIIText
            text={isPhone ? "maintenance" : "maintenance_"}
            asciiFontSize={S.asciiFont}
            enableWaves
            textFontSize={S.asciiText}
            planeBaseHeight={8}
          />
        </div>

        {/* clickable logo → game */}
        {/* <button
          onClick={onPlay}
          title="Bored? Click me to play Canary Runner 🐤"
          style={{
            border: "none", background: "transparent", cursor: onPlay ? "pointer" : "default",
            padding: 0, lineHeight: 0, animation: "mo-bob 2.6s ease-in-out infinite",
          }}>
          <img src={logo} alt="Canary" style={{ width: S.logo, height: S.logo, filter: `drop-shadow(0 8px 22px ${Y}55)` }} />
        </button> */}

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: S.h1 * 0.85 }}>🛠️</span>
          <h1 style={{ margin: 0, color: "#fff", fontSize: S.h1, fontWeight: 800, letterSpacing: 0.4, fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace" }}>
            <DecryptedText
              text="we'll be right back (probably tomorrow)"
              animateOn="view"
              sequential
              speed={26}
              revealDirection="center"
              className="mo-on"
              encryptedClassName="mo-off"
              parentClassName="mo-mono"
            />
          </h1>
        </div>

        <p style={{ margin: 0, color: Y, fontSize: S.quip, fontWeight: 700, minHeight: S.quip * 3, maxWidth: 820, fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace", lineHeight: 1.45 }}>
          <DecryptedText
            key={qi}
            text={QUIPS[qi]}
            animateOn="view"
            speed={34}
            maxIterations={14}
            className="mo-on-y"
            encryptedClassName="mo-off"
            parentClassName="mo-mono"
          />
        </p>

        <p style={{ margin: "0 auto", color: SUB, fontSize: S.body, fontWeight: 500, maxWidth: 760, lineHeight: 1.65 }}>
          <b style={{ color: "#fff" }}>Relax — nothing is lost. 🧘</b> Every single check-in today is being
          recorded safely in the background. We just maxed out today's Firebase <i>read</i> limit, so the
          dashboard is taking a tiny power nap. <b style={{ color: Y }}>Today's data will be fully visible tomorrow</b> the
          moment the quota resets. Meanwhile we're scaling everything up — the agents are on it. 🚀
        </p>

        {/* stat chips — playful, responsive wrap */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 760 }}>
          {[
            { k: "reads today", v: "64,000", c: "#56B3FF"},
            { k: "writes today", v: "108", c: "#34E08A"},
            { k: "data lost", v: "0", c: Y },
            { k: "dashboard ETA", v: "tomorrow", c: "#FF8FB1" },
          ].map((s, i) => (
            <div key={i} style={{
              minWidth: 132, flex: "1 1 132px", maxWidth: 200, padding: "10px 12px", borderRadius: 12,
              background: "rgba(8,12,30,0.6)", border: `1px solid ${s.c}33`, textAlign: "left",
            }}>
              <div style={{ color: DIM, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase" }}>{s.k}</div>
              <div style={{ color: s.c, fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.2 }}>{s.v}</div>
              {/* <div style={{ color: DIM, fontSize: 10, marginTop: 1 }}>{s.note}</div> */}
            </div>
          ))}
        </div>

        {/* proof of the read limit, with a caption */}
        <div style={{
          width: "100%", maxWidth: 820, borderRadius: 14, overflow: "hidden",
          border: `1px solid ${Y}33`, background: "rgba(8,12,30,0.6)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
            borderBottom: `1px solid rgba(110,140,255,0.18)`, fontSize: 11.5, color: DIM,
            fontFamily: "'JetBrains Mono',monospace",
          }}>
            <span style={{ width: 9, height: 9, borderRadius: 9, background: "#FF5F57" }} />
            <span style={{ width: 9, height: 9, borderRadius: 9, background: "#FEBC2E" }} />
            <span style={{ width: 9, height: 9, borderRadius: 9, background: "#28C840" }} />
            <span style={{ marginLeft: 8 }}>exhibit&nbsp;A &nbsp;—&nbsp; the_evidence.png</span>
          </div>
          <img src={frbsProof} alt="Firebase read limit reached — proof" style={{ display: "block", width: "100%" }} />
          <div style={{ padding: "10px 14px", color: DIM, fontSize: 12, fontStyle: "italic" }}>
            64K reads sailing past the 50K free-tier line like it owed them money. Writes? A modest 108. We see you. 🫠
          </div>
        </div>

        {/* fake 'agents working on it' terminal */}
        <div style={{
          width: "100%", maxWidth: 820, textAlign: "left", borderRadius: 12,
          background: "#070B18", border: `1px solid rgba(110,140,255,0.18)`,
          padding: "14px 16px", fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace",
          fontSize: S.term, lineHeight: 1.9, color: "#9FE8B6", overflowX: "auto",
        }}>
          {/* {terminal.map((l, i) => (
            <div key={i} style={{
              color: l.startsWith("$") ? Y : l.includes("⏳") || l.includes("😤") ? "#FFB300" : "#9FE8B6",
              whiteSpace: "pre-wrap",
            }}>
              {l}
            </div>
          ))} */}
          <div style={{ color: DIM }}>
            <span className="mo-blink">▌</span>
          </div>
        </div>

        {/* {onPlay && (
          <button onClick={onPlay} style={{
            marginTop: 4, display: "inline-flex", alignItems: "center", gap: 9,
            padding: "12px 24px", borderRadius: 26, cursor: "pointer", fontFamily: "inherit",
            border: `1px solid ${Y}88`, background: `linear-gradient(135deg, ${Y}26, ${Y}10)`,
            color: Y, fontSize: S.cta, fontWeight: 800, letterSpacing: 0.3,
          }}>
            🐤 Bored while we scale? Make the Canary lose its energy → Play Canary Runner
          </button>
        )} */}

        <div style={{ color: DIM, fontSize: 11.5, marginTop: 2, minHeight: 18, maxWidth: 640, transition: "opacity .3s" }}>
          {FACTS[fi]}
        </div>
      </div>

      <style>{`
        @keyframes mo-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes mo-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        .mo-blink { animation: mo-blink 1s steps(1) infinite; }
        .mo-mono { font-family: 'JetBrains Mono','IBM Plex Mono',monospace; }
        .mo-on   { color: #fff; }
        .mo-on-y { color: ${Y}; }
        .mo-off  { color: ${Y}; opacity: 0.5; }
      `}</style>
    </div>
  );
}
