import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// FeatureTour — a 4–5 slide intro that explains the main features.
//
// Behaviour (controlled by the parent via the `open` prop, which App.tsx drives
// from the SHOW_TOURS flag): it opens EVERY time the app loads/refreshes when the
// flag is true — there is no "don't show again" memory. The user can close it for
// the current session (X or "Finish"); it returns on the next reload.
//
// No Skip button by request — only Back / Next (and Finish on the last slide).
// ─────────────────────────────────────────────────────────────────────────────

const BG     = "#060D2E";
const SURF2  = "#0F1848";
const BORDER = "rgba(99,102,241,0.2)";
const TEXT   = "#EEF0FF";
const SUB    = "#8090C0";
const YELLOW = "#FFD700";
const GREEN  = "#4ADE80";
const BLUE   = "#60A5FA";
const TEAL   = "#34D399";
const PINK   = "#EC4899";

interface Slide {
  icon: React.ReactNode;
  accent: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    accent: BLUE,
    title: "Welcome to Canary Face",
    body: "Your AI-powered attendance platform. See who's in office, working from home, or out — all in real time. The dashboard is open to everyone, no login needed to look around.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    accent: TEAL,
    title: "Request Leave",
    body: "Apply for full, half, or quarter-day leave in a few taps. Track its status — pending, approved, or rejected — and HR reviews it from their panel.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M12 3c0 5-4 7-4 11a4 4 0 008 0c0-4-4-6-4-11z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 21v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    accent: YELLOW,
    title: "Regularize & Log Meetings",
    body: "Missed a scan or worked remotely? Raise a regularization for HR to fix it. Heading into a meeting? Log it so your attendance stays active without scanning.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    accent: PINK,
    title: "Report an Issue",
    body: "Something wrong — a record error, an app bug, or a workplace matter? Report it and it routes automatically to the right person (HR or tech).",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M12 9v4m0 4h.01M10.3 3.86l-8.4 14.55A1.5 1.5 0 003.2 21h17.6a1.5 1.5 0 001.3-2.59L13.7 3.86a1.5 1.5 0 00-2.6 0z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    accent: GREEN,
    title: "Sign in with Google",
    body: "To submit leave / regularization / issues, or to open your personal attendance summary, you'll sign in with Google once. It links to your profile and keeps every action verified and tamper-proof.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M21.8 12.2c0-.7-.06-1.4-.18-2.05H12v3.9h5.5a4.7 4.7 0 01-2.04 3.08v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.49z" fill="currentColor"/>
        <path d="M12 22c2.76 0 5.07-.92 6.76-2.48l-3.3-2.56c-.92.62-2.1.98-3.46.98-2.66 0-4.92-1.8-5.73-4.22H2.86v2.64A10 10 0 0012 22z" fill="currentColor"/>
      </svg>
    ),
  },
];

export default function FeatureTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);

  // reset to the first slide whenever the tour (re)opens
  useEffect(() => { if (open) setI(0); }, [open]);

  // Esc / arrow keys
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI(n => Math.min(n + 1, SLIDES.length - 1));
      else if (e.key === "ArrowLeft")  setI(n => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const s = SLIDES[i];
  const isLast = i === SLIDES.length - 1;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 12000,
        background: "rgba(2,6,23,0.74)", backdropFilter: "blur(7px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 18, fontFamily: "'Sora',sans-serif",
        animation: "ft-fade 0.2s ease",
      }}
    >
      <style>{`
        @keyframes ft-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ft-pop  { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes ft-slide-in { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
        .ft-slide-key { animation: ft-slide-in 0.26s ease; }
        .ft-next:hover { filter: brightness(1.07); transform: translateY(-1px); }
        .ft-back:hover { background: rgba(99,102,241,0.12) !important; }
        .ft-close:hover { color: #F87171 !important; border-color: rgba(248,113,113,0.4) !important; }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          background: `linear-gradient(160deg, ${SURF2} 0%, ${BG} 100%)`,
          border: `1px solid ${BORDER}`, borderRadius: 20,
          boxShadow: "0 28px 80px rgba(0,0,0,0.75)",
          padding: "22px 22px 18px", position: "relative",
          animation: "ft-pop 0.24s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* close */}
        <button onClick={onClose} className="ft-close" style={{
          position: "absolute", top: 14, right: 14,
          width: 28, height: 28, borderRadius: 8, border: `1px solid ${BORDER}`,
          background: "transparent", color: SUB, cursor: "pointer", fontSize: 16, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.14s",
        }}>×</button>

        {/* slide content (keyed so it re-animates on change) */}
        <div key={i} className="ft-slide-key" style={{ textAlign: "center", padding: "10px 4px 2px" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `${s.accent}14`, border: `1px solid ${s.accent}33`, color: s.accent,
            boxShadow: `0 0 28px ${s.accent}1f`,
          }}>
            {s.icon}
          </div>
          <h2 style={{ color: TEXT, fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>{s.title}</h2>
          <p style={{ color: SUB, fontSize: 12.5, lineHeight: 1.6, margin: "0 auto", maxWidth: 340 }}>{s.body}</p>
        </div>

        {/* dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 7, margin: "20px 0 16px" }}>
          {SLIDES.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`} style={{
              width: idx === i ? 22 : 7, height: 7, borderRadius: 4, border: "none",
              background: idx === i ? s.accent : "rgba(99,102,241,0.3)",
              cursor: "pointer", transition: "width 0.2s, background 0.2s", padding: 0,
            }} />
          ))}
        </div>

        {/* nav — Skip / Next (Get Started on last). Skip closes the whole tour. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onClose}
            className="ft-back"
            style={{
              flex: 1, padding: "11px", borderRadius: 11, border: `1px solid ${BORDER}`,
              background: "transparent", color: SUB,
              fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
              cursor: "pointer", transition: "all 0.14s",
            }}
          >
            Skip
          </button>
          <button
            onClick={() => { if (isLast) onClose(); else setI(n => Math.min(n + 1, SLIDES.length - 1)); }}
            className="ft-next"
            style={{
              flex: 2, padding: "11px", borderRadius: 11, border: "none",
              background: `linear-gradient(135deg, ${s.accent}, ${s.accent}cc)`,
              color: "#06122e", fontSize: 13, fontWeight: 800, letterSpacing: 0.3,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.14s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            {isLast ? "Get Started" : "Next"}
            {!isLast && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#06122e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
