import logo from "../assets/react.png";
import ChatThread from "./ChatThread";

// ── Canary theme ──────────────────────────────────────────────────────────────
const BG     = "#060D2E";
const SURF   = "#0B1340";
const SURF2  = "#0F1848";
const BORDER = "rgba(255,215,0,0.18)";
const TEXT   = "#EEF0FF";
const SUB    = "#8B97C9";
const CANARY = "#FFD700";

/**
 * Employee "Chat with HR" PANEL (controlled by the parent).
 *
 * This is just the slide-up panel — the trigger lives in the MyAttendance name
 * pill (so there's a single bottom-right element, no overlapping FABs). The parent
 * supplies the verified identity + an ensureAuth() gate (the panel only ever opens
 * for a signed-in employee). Render nothing when `open` is false.
 */
export default function SupportChat({
  open, onClose, empId, empName, userEmail, ensureAuth, onActivity,
}: {
  open: boolean;
  onClose: () => void;
  empId: string;
  empName: string;
  userEmail?: string | null;
  ensureAuth: () => Promise<boolean>;
  onActivity?: () => void;
}) {
  if (!open || !empId) return null;

  return (
    <>
      <style>{`
        @keyframes canary-pop { from{opacity:0; transform:translateY(14px) scale(0.96)} to{opacity:1; transform:none} }
      `}</style>
      <div style={{
        position: "fixed", right: 18, bottom: 18, zIndex: 9001,
        width: "min(384px, calc(100vw - 32px))", height: "min(580px, calc(100vh - 80px))",
        background: BG, border: `1px solid ${BORDER}`, borderRadius: 20, overflow: "hidden",
        boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px ${CANARY}12`,
        display: "flex", flexDirection: "column", fontFamily: "'Sora',sans-serif",
        animation: "canary-pop 0.22s ease both",
      }}>
        {/* header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 11, padding: "13px 14px",
          borderBottom: `1px solid ${BORDER}`,
          background: `linear-gradient(135deg, ${SURF2}, ${SURF})`, flexShrink: 0,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12, background: `${CANARY}14`, border: `1px solid ${CANARY}44`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden",
          }}>
            <img src={logo} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: TEXT, fontSize: 13.5, fontWeight: 800, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 6 }}>
              Chat with HR
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ADE80", boxShadow: "0 0 7px #4ADE80" }} />
            </div>
            <div style={{ color: SUB, fontSize: 9.5 }}>
              {userEmail ? `Signed in as ${userEmail}` : "Support · usually replies within a day"}
            </div>
          </div>
          <button onClick={onClose} title="Close" style={{
            width: 30, height: 30, borderRadius: 9, border: `1px solid ${BORDER}`, background: SURF,
            color: SUB, cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0,
          }}>×</button>
        </div>

        {/* thread */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatThread
            empId={empId}
            empName={empName || empId}
            role="employee"
            ensureAuth={ensureAuth}
            onActivity={onActivity}
          />
        </div>
      </div>
    </>
  );
}
