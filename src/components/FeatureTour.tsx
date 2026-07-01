import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// FeatureTour — a reusable, image-based walkthrough modal.
//
// It's fully driven by the `slides` prop (image + optional caption), so the same
// component powers BOTH tours:
//   • the employee "tools" tour on the dashboard  (src/assets/tour/tools)
//   • the HR-panel tour inside /hr                 (src/assets/tour/hrside)
//
// Visibility is controlled by the parent via `open` (App.tsx drives it from the
// SHOW_*_TOUR flags). It re-opens on every load while the flag is true; the user
// can Skip/Finish for the session. Back / Next navigation, dots, Esc + arrow keys.
// ─────────────────────────────────────────────────────────────────────────────

const BG     = "#060D2E";
const SURF2  = "#0F1848";
const BORDER = "rgba(99,102,241,0.2)";
const TEXT   = "#EEF0FF";
const SUB    = "#8090C0";

export interface TourSlide {
  image: string;        // resolved image URL
  title?: string;       // short caption title
  body?: string;        // optional one-line description
}

export default function FeatureTour({
  open, onClose, slides, accent = "#FFD700",
}: {
  open: boolean;
  onClose: () => void;
  slides: TourSlide[];
  accent?: string;      // brand accent for buttons/dots
}) {
  const [i, setI] = useState(0);

  useEffect(() => { if (open) setI(0); }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI(n => Math.min(n + 1, slides.length - 1));
      else if (e.key === "ArrowLeft")  setI(n => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, slides.length]);

  if (!open || slides.length === 0) return null;

  const s = slides[i];
  const isFirst = i === 0;
  const isLast  = i === slides.length - 1;

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
          width: "min(680px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column",
          background: `linear-gradient(160deg, ${SURF2} 0%, ${BG} 100%)`,
          border: `1px solid ${BORDER}`, borderRadius: 20,
          boxShadow: "0 28px 80px rgba(0,0,0,0.75)",
          padding: "16px 16px 14px", position: "relative", overflow: "hidden",
          animation: "ft-pop 0.24s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* close */}
        <button onClick={onClose} className="ft-close" style={{
          position: "absolute", top: 12, right: 12, zIndex: 2,
          width: 30, height: 30, borderRadius: 9, border: `1px solid ${BORDER}`,
          background: "rgba(6,13,46,0.6)", color: SUB, cursor: "pointer", fontSize: 17, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.14s",
        }}>×</button>

        {/* image + caption (keyed so it re-animates on change) */}
        <div key={i} className="ft-slide-key" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{
            position: "relative", borderRadius: 14, overflow: "hidden",
            border: `1px solid ${BORDER}`, background: "#03081f",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img
              src={s.image}
              alt={s.title || `Step ${i + 1}`}
              style={{ width: "100%", maxHeight: "58vh", objectFit: "contain", display: "block" }}
            />
            {/* step counter chip */}
            <span style={{
              position: "absolute", top: 10, left: 10,
              background: "rgba(6,13,46,0.72)", border: `1px solid ${accent}55`,
              color: accent, fontSize: 11, fontWeight: 800, borderRadius: 20, padding: "3px 10px",
            }}>{i + 1} / {slides.length}</span>
          </div>

          {(s.title || s.body) && (
            <div style={{ textAlign: "center", padding: "14px 8px 2px" }}>
              {s.title && <h2 style={{ color: TEXT, fontSize: 16, fontWeight: 800, margin: "0 0 5px" }}>{s.title}</h2>}
              {s.body && <p style={{ color: SUB, fontSize: 12.5, lineHeight: 1.55, margin: "0 auto", maxWidth: 440 }}>{s.body}</p>}
            </div>
          )}
        </div>

        {/* dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 7, margin: "16px 0 14px" }}>
          {slides.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`} style={{
              width: idx === i ? 22 : 7, height: 7, borderRadius: 4, border: "none",
              background: idx === i ? accent : "rgba(99,102,241,0.3)",
              cursor: "pointer", transition: "width 0.2s, background 0.2s", padding: 0,
            }} />
          ))}
        </div>

        {/* nav — Back / Next (Finish on last). Left button is Skip on the first slide. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => { if (isFirst) onClose(); else setI(n => Math.max(n - 1, 0)); }}
            className="ft-back"
            style={{
              flex: 1, padding: "11px", borderRadius: 11, border: `1px solid ${BORDER}`,
              background: "transparent", color: SUB,
              fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
              cursor: "pointer", transition: "all 0.14s",
            }}
          >
            {isFirst ? "Skip" : "Back"}
          </button>
          <button
            onClick={() => { if (isLast) onClose(); else setI(n => Math.min(n + 1, slides.length - 1)); }}
            className="ft-next"
            style={{
              flex: 2, padding: "11px", borderRadius: 11, border: "none",
              background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              color: "#06122e", fontSize: 13, fontWeight: 800, letterSpacing: 0.3,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.14s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            {isLast ? "Finish" : "Next"}
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
