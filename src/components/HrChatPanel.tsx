import { useEffect, useState, useCallback } from "react";
import { auth } from "../firebase";
import { listThreads, type ChatThreadMeta, type ChatContext } from "../lib/chat";
import ChatThread, { CanaryBird } from "./ChatThread";

// ── theme (HR panel dark · Canary yellow accent) ──────────────────────────────
const BG     = "#0D0D0D";
const SURF2  = "#161616";
const BORDER = "rgba(255,215,0,0.16)";
const TEXT   = "#EEF0FF";
const SUB    = "#8090C0";
const DIM    = "#4A5A8A";
const CANARY = "#FFD700";
const RED    = "#F87171";

function initials(n: string) {
  return (n || "?").split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();
}
function fmtWhen(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export interface ChatTarget {
  empId: string;
  empName: string;
  context?: ChatContext;
  refId?: string | null;
}

/**
 * HR Messages tab: left = all employee threads (with unread badges + previews),
 * right = the selected conversation. HR is already signed in (the panel is login-
 * locked), so ensureAuth just confirms the current session.
 *
 * `target` lets other modules (Regularization/Leave/Issue cards) deep-link into a
 * specific employee's thread with a context tag; clearing it via onClearTarget
 * returns to normal browsing.
 */
export default function HrChatPanel({
  employees, target, onClearTarget,
}: {
  employees: any[];
  target?: ChatTarget | null;
  onClearTarget?: () => void;
}) {
  const [threads, setThreads]   = useState<ChatThreadMeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<ChatTarget | null>(null);

  const empById = useCallback(() => {
    const map: Record<string, any> = {};
    for (const e of employees) map[e.emp_id] = e;
    return map;
  }, [employees])();

  const load = useCallback(async () => {
    setLoading(true);
    try { setThreads(await listThreads()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // a deep-link target from a module card → open that thread immediately
  useEffect(() => {
    if (target) setSelected(target);
  }, [target]);

  const ensureAuth = useCallback(async () => !!auth.currentUser, []);

  // build the visible thread list: every employee, ordered by most-recent message,
  // employees with no thread yet appear too (so HR can start one).
  const threadByEmp: Record<string, ChatThreadMeta> = {};
  for (const t of threads) threadByEmp[t.emp_id] = t;
  const rows = employees
    .map((e: any) => ({
      emp: e,
      meta: threadByEmp[e.emp_id] || null,
    }))
    .sort((a, b) => (b.meta?.lastMessageAt || 0) - (a.meta?.lastMessageAt || 0));

  function selectEmp(emp: any) {
    setSelected({ empId: emp.emp_id, empName: emp.emp_name || emp.name || emp.emp_id });
    onClearTarget?.();
  }

  const selEmpMeta = selected ? (empById[selected.empId] || null) : null;

  return (
    <div style={{ display: "flex", gap: 14, height: "calc(100vh - 220px)", minHeight: 440 }}>
      {/* ── left: thread list ── */}
      <div style={{
        width: 320, flexShrink: 0, background: SURF2, border: `1px solid ${BORDER}`,
        borderRadius: 13, display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ color: TEXT, fontSize: 14, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <CanaryBird size={20} /> Conversations
          </span>
          <button onClick={load} disabled={loading} title="Refresh" style={{
            background: "transparent", border: `1px solid ${CANARY}44`, borderRadius: 8,
            color: CANARY, fontSize: 10.5, fontWeight: 700, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit",
          }}>{loading ? "…" : "↻"}</button>
        </div>

        <div className="hrchat-scroll" style={{ flex: 1, overflowY: "auto" }}>
          <style>{`
            .hrchat-scroll { scrollbar-width: thin; scrollbar-color: rgba(99,102,241,0.35) transparent; }
            .hrchat-scroll::-webkit-scrollbar { width: 6px; }
            .hrchat-scroll::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 6px; }
          `}</style>

          {loading ? (
            <div style={{ padding: "26px 0", textAlign: "center", color: SUB, fontSize: 12 }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "26px 14px", textAlign: "center", color: SUB, fontSize: 12 }}>No employees.</div>
          ) : rows.map(({ emp, meta }) => {
            const active = selected?.empId === emp.emp_id;
            const unread = meta?.unreadForHr || 0;
            return (
              <button key={emp.emp_id} onClick={() => selectEmp(emp)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 13px",
                background: active ? "rgba(255,215,0,0.09)" : "transparent",
                border: "none", borderBottom: "1px solid rgba(99,102,241,0.07)",
                borderLeft: active ? `3px solid ${CANARY}` : "3px solid transparent",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
              }}>
                <span style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: BG,
                  border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, color: SUB,
                }}>
                  {emp.profile_image
                    ? <img src={emp.profile_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : initials(emp.name || emp.emp_name || emp.emp_id)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: TEXT, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      {emp.name || emp.emp_name || emp.emp_id}
                    </span>
                    {meta?.lastMessageAt ? <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{fmtWhen(meta.lastMessageAt)}</span> : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: SUB, fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      {meta?.lastMessage
                        ? `${meta.lastSender === "hr" ? "You: " : ""}${meta.lastMessage}`
                        : "No messages yet"}
                    </span>
                    {unread > 0 && (
                      <span style={{
                        flexShrink: 0, background: RED, color: "#fff", fontSize: 9, fontWeight: 800,
                        borderRadius: 20, minWidth: 16, height: 16, padding: "0 5px",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}>{unread}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── right: selected thread ── */}
      <div style={{ flex: 1, minWidth: 0, background: SURF2, border: `1px solid ${BORDER}`, borderRadius: 13, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!selected ? (
          <div style={{ margin: "auto", textAlign: "center", color: SUB, fontSize: 13, padding: 24 }}>
            <div style={{ marginBottom: 12 }}><CanaryBird size={56} /></div>
            Select an employee to view the conversation.
          </div>
        ) : (
          <>
            {/* thread header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <span style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: BG,
                border: `1.5px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: SUB,
              }}>
                {selEmpMeta?.profile_image
                  ? <img src={selEmpMeta.profile_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initials(selected.empName)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: TEXT, fontSize: 13.5, fontWeight: 800 }}>{selected.empName}</div>
                <div style={{ color: DIM, fontSize: 9.5, fontFamily: "'JetBrains Mono',monospace" }}>{selected.empId}</div>
              </div>
            </div>

            {/* the conversation */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <ChatThread
                key={selected.empId + (selected.refId || "")}
                empId={selected.empId}
                empName={selected.empName}
                role="hr"
                ensureAuth={ensureAuth}
                seedContext={selected.context ?? null}
                seedRefId={selected.refId ?? null}
                onActivity={load}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
