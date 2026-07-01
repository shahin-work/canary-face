import { useEffect, useRef, useState, useCallback } from "react";
import { loadMessages, sendMessage, markThreadRead, chatErrorMessage, type ChatMessage, type ChatRole, type ChatContext } from "../lib/chat";
import logo from "../assets/react.png";

// ── Canary theme (brand = yellow bird) ────────────────────────────────────────
const BG     = "#060D2E";
const SURF   = "#0B1340";
const SURF2  = "#0F1848";
const BORDER = "rgba(255,215,0,0.16)";
const TEXT   = "#EEF0FF";
const SUB    = "#8B97C9";
const DIM    = "#54618F";
const CANARY = "#FFD700";   // canary yellow — brand accent
const CANARY2= "#FFC400";
const INK    = "#1A1606";   // dark text on yellow bubbles

const CONTEXT_LABEL: Record<NonNullable<ChatContext>, string> = {
  regularization: "Regularization",
  leave: "Leave request",
  issue: "Reported issue",
};

// quick-reply chips shown in the empty state (employee side) — taps pre-fill +
// pre-tag the first message with the right module context.
const QUICK_CHIPS: { label: string; text: string; context: ChatContext }[] = [
  { label: "🕒 Attendance", text: "I have a question about my attendance — ", context: "regularization" },
  { label: "🌴 Leave",      text: "I have a question about my leave — ",      context: "leave" },
  { label: "💬 Something else", text: "",                                      context: null },
];

// ── brand logo (react.png) — used as the chat avatar/mascot everywhere ─────────
export function CanaryBird({ size = 26 }: { size?: number }) {
  return <img src={logo} alt="" style={{ width: size, height: size, objectFit: "contain" }} />;
}

function fmtTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString())  return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Shared chat thread UI for both HR and the employee — Canary branded.
 * (See SupportChat / HrChatPanel for how each side mounts it.)
 */
export default function ChatThread({
  empId, empName, role, ensureAuth, seedContext = null, seedRefId = null, onActivity,
}: {
  empId: string;
  empName: string;
  role: ChatRole;
  ensureAuth: () => Promise<boolean>;
  seedContext?: ChatContext;
  seedRefId?: string | null;
  onActivity?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState("");
  const [sending, setSending]   = useState(false);
  const [err, setErr]           = useState("");
  const [pendingContext, setPendingContext] = useState<ChatContext>(seedContext);
  const [seedUsed, setSeedUsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadMessages(empId);
      setMessages(list);
      scrollToBottom();
    } catch (e) {
      console.error(e); setErr("Could not load the conversation.");
    } finally {
      setLoading(false);
    }
  }, [empId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    markThreadRead(empId, role).catch(() => {});
  }, [empId, role, messages.length]);

  // core send — used by the composer and by retry
  async function doSend(body: string, ctx: ChatContext, ref: string | null) {
    const ok = await ensureAuth();
    if (!ok) { setErr("Please sign in to send a message."); return; }
    setSending(true); setErr("");
    try {
      const msg = await sendMessage({ empId, empName, role, text: body, context: ctx, refId: ref });
      setMessages(prev => [...prev, msg]);
      setText(""); setPendingContext(null);
      if (ctx) setSeedUsed(true);
      scrollToBottom();
      onActivity?.();
    } catch (e: any) {
      console.error(e);
      setErr(chatErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  function handleSend() {
    const body = text.trim();
    if (!body || sending) return;
    const useSeed = !seedUsed;
    doSend(body, useSeed ? (pendingContext ?? seedContext) : null, useSeed ? seedRefId : null);
  }

  function pickChip(c: typeof QUICK_CHIPS[number]) {
    setPendingContext(c.context);
    setText(c.text);
    setErr("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // group messages with a date separator when the day changes
  let lastDay = "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: BG }}>
      {/* seed-context banner (what this chat is about) */}
      {(pendingContext || (seedContext && !seedUsed)) && (
        <div style={{
          margin: "10px 12px 0", padding: "7px 11px", borderRadius: 10,
          background: `${CANARY}14`, border: `1px solid ${CANARY}3a`,
          color: CANARY, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 7,
        }}>
          <span>📌</span> About: {CONTEXT_LABEL[(pendingContext || seedContext)!]}
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} className="chat-scroll" style={{
        flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 12px",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <style>{`
          .chat-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,215,0,0.3) transparent; }
          .chat-scroll::-webkit-scrollbar { width: 6px; }
          .chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,215,0,0.3); border-radius: 6px; }
          @keyframes msg-in { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform:none; } }
          .msg-row { animation: msg-in 0.18s ease both; }
        `}</style>

        {loading ? (
          <div style={{ margin: "auto", color: SUB, fontSize: 12 }}>Loading conversation…</div>
        ) : messages.length === 0 ? (
          // ── friendly empty state: canary greeting + quick chips ──
          <div style={{ margin: "auto", textAlign: "center", padding: "8px 18px", maxWidth: 300 }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", margin: "0 auto 14px",
              background: `radial-gradient(circle at 50% 38%, ${CANARY}33, transparent 70%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <CanaryBird size={52} />
            </div>
            <div style={{ color: TEXT, fontSize: 14, fontWeight: 800, marginBottom: 5 }}>
              {role === "hr" ? `Start a chat with ${empName}` : "Hi 👋 I'm Canary"}
            </div>
            <div style={{ color: SUB, fontSize: 12, lineHeight: 1.55, marginBottom: 16 }}>
              {role === "hr"
                ? "Send a message — they'll be notified and can reply from their dashboard."
                : "Tell HR what you need and they'll reply right here. Pick a topic to start:"}
            </div>
            {role === "employee" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {QUICK_CHIPS.map(c => (
                  <button key={c.label} onClick={() => pickChip(c)} style={{
                    background: `${CANARY}12`, border: `1px solid ${CANARY}40`, borderRadius: 20,
                    color: CANARY, fontSize: 11.5, fontWeight: 700, padding: "7px 13px", cursor: "pointer",
                    fontFamily: "'Sora',sans-serif",
                  }}>{c.label}</button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map(m => {
            const mine = m.sender === role;
            const dl = dayLabel(m.at);
            const showDay = dl !== lastDay;
            lastDay = dl;
            return (
              <div key={m.id}>
                {showDay && (
                  <div style={{ textAlign: "center", margin: "10px 0 8px" }}>
                    <span style={{ background: SURF2, color: DIM, fontSize: 9.5, fontWeight: 700, borderRadius: 12, padding: "3px 11px" }}>{dl}</span>
                  </div>
                )}
                <div className="msg-row" style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 6 }}>
                  <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", gap: 3, alignItems: mine ? "flex-end" : "flex-start" }}>
                    {m.context && (
                      <span style={{ fontSize: 8.5, fontWeight: 800, color: CANARY, background: `${CANARY}18`, border: `1px solid ${CANARY}35`, borderRadius: 12, padding: "1px 7px" }}>
                        📌 {CONTEXT_LABEL[m.context]}
                      </span>
                    )}
                    <div style={{
                      background: mine ? `linear-gradient(145deg, ${CANARY}, ${CANARY2})` : SURF2,
                      color: mine ? INK : TEXT,
                      border: mine ? "none" : `1px solid rgba(255,215,0,0.12)`,
                      borderRadius: 14, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.5,
                      whiteSpace: "pre-wrap", wordBreak: "break-word", fontWeight: mine ? 600 : 400,
                      borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
                      boxShadow: mine ? `0 4px 14px ${CANARY}22` : "none",
                    }}>
                      {m.text}
                    </div>
                    <span style={{ fontSize: 8.5, color: DIM, padding: "0 3px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {m.sender === "hr" ? "HR" : (mine ? "You" : (m.senderName || "Employee"))} · {fmtTime(m.at)}
                      {mine && <span style={{ color: CANARY, fontWeight: 700 }}>✓</span>}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* error */}
      {err && (
        <div style={{ margin: "0 12px 8px", padding: "8px 11px", borderRadius: 9, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#FCA5A5", fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠</span><span style={{ flex: 1 }}>{err}</span>
          <button onClick={handleSend} style={{ background: "transparent", border: "none", color: CANARY, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Retry</button>
        </div>
      )}

      {/* composer */}
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: `1px solid ${BORDER}`, background: SURF, flexShrink: 0, alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={role === "hr" ? `Message ${empName}…` : "Type your message…"}
          rows={1}
          maxLength={1000}
          style={{
            flex: 1, resize: "none", maxHeight: 96, minHeight: 40,
            background: BG, border: `1px solid ${BORDER}`, borderRadius: 22,
            color: TEXT, fontSize: 12.5, padding: "10px 14px", outline: "none",
            fontFamily: "'Sora',sans-serif", caretColor: CANARY, lineHeight: 1.4,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          title="Send"
          style={{
            flexShrink: 0, width: 42, height: 42, borderRadius: "50%", border: "none",
            background: (text.trim() && !sending) ? `linear-gradient(145deg, ${CANARY}, ${CANARY2})` : "rgba(255,215,0,0.2)",
            color: INK, cursor: (text.trim() && !sending) ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: (text.trim() && !sending) ? `0 4px 14px ${CANARY}44` : "none",
          }}
        >
          {sending ? (
            <span style={{ fontSize: 14 }}>…</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 11l18-8-8 18-2-7-8-3z" fill={INK} />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
