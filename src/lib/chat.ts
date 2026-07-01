// ───────────────────────────────────────────────────────────────────────────
//  HR ↔ Employee CHAT — shared Firestore helpers (single source of truth).
//
//  Data model (subcollection — no 1MB doc limit):
//    chats/{empId}                       ← metadata doc (last message, unread counts)
//    chats/{empId}/messages/{msgId}      ← one doc per message (append-only)
//
//  Security (see firestore.rules): both sides must be signed-in + email-verified
//  Google users. Each message stamps senderEmail = the verified token email, so
//  authorship is unforgeable. Messages are immutable (no edit/delete).
// ───────────────────────────────────────────────────────────────────────────
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  query, orderBy, serverTimestamp, increment,
} from "firebase/firestore";
import { db, auth } from "../firebase";

export type ChatRole    = "hr" | "employee";
export type ChatContext = "regularization" | "leave" | "issue" | null;

export interface ChatMessage {
  id: string;
  text: string;
  sender: ChatRole;
  senderEmail: string;
  senderName: string;
  at: number;                  // epoch ms (client time, for ordering/display)
  context?: ChatContext;       // which module opened the chat, if any
  refId?: string | null;       // the specific request id this message is about
}

export interface ChatThreadMeta {
  emp_id: string;
  emp_name: string;
  lastMessage: string;
  lastMessageAt: number;
  lastSender: ChatRole | "";
  unreadForHr: number;
  unreadForEmployee: number;
}

const newId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ── load a thread's messages (oldest → newest) ──────────────────────────────
export async function loadMessages(empId: string): Promise<ChatMessage[]> {
  const q = query(collection(db, "chats", empId, "messages"), orderBy("at", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as ChatMessage);
}

// ── send a message (called by HR or employee) ───────────────────────────────
// The caller MUST be signed in (auth.currentUser). senderEmail is read from the
// token so the security rule passes and authorship can't be forged.
export async function sendMessage(opts: {
  empId: string;
  empName: string;
  role: ChatRole;
  text: string;
  context?: ChatContext;
  refId?: string | null;
}): Promise<ChatMessage> {
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");

  const text = opts.text.trim();
  if (!text) throw new Error("empty");

  const msg: ChatMessage = {
    id: newId(),
    text,
    sender: opts.role,
    senderEmail: user.email ?? "",
    senderName: user.displayName || (user.email?.split("@")[0] ?? "User"),
    at: Date.now(),
    context: opts.context ?? null,
    refId: opts.refId ?? null,
  };

  try {
    // 1) append the message (append-only subcollection)
    await addDoc(collection(db, "chats", opts.empId, "messages"), msg);

    // 2) update the thread metadata + bump the OTHER side's unread counter
    await setDoc(
      doc(db, "chats", opts.empId),
      {
        emp_id: opts.empId,
        emp_name: opts.empName,
        lastMessage: text,
        lastMessageAt: msg.at,
        lastSender: opts.role,
        updatedAt: serverTimestamp(),
        // a message from HR is unread for the employee, and vice-versa
        ...(opts.role === "hr"
          ? { unreadForEmployee: increment(1) }
          : { unreadForHr: increment(1) }),
      },
      { merge: true }
    );
  } catch (e: any) {
    // classify so the UI can show something useful (see chatErrorMessage)
    const code = e?.code || "";
    if (code === "permission-denied") throw new Error("permission-denied");
    if (code === "unavailable" || code === "failed-precondition") throw new Error("offline");
    throw new Error("send-failed");
  }

  return msg;
}

// human-friendly message for a thrown chat error code
export function chatErrorMessage(err: any): string {
  const m = err?.message || "";
  if (m === "not-signed-in")     return "Please sign in to send a message.";
  if (m === "empty")             return "Type a message first.";
  if (m === "permission-denied") return "Chat isn't enabled yet — the security rules may not be published. Ask the admin.";
  if (m === "offline")           return "You appear to be offline. Check your connection and try again.";
  return "Couldn't send. Tap a message to retry.";
}

// ── mark a thread read for one side (clears that side's unread counter) ─────
export async function markThreadRead(empId: string, role: ChatRole): Promise<void> {
  if (!auth.currentUser) return; // must be signed in to satisfy the rule
  try {
    await setDoc(
      doc(db, "chats", empId),
      role === "hr" ? { unreadForHr: 0 } : { unreadForEmployee: 0 },
      { merge: true }
    );
  } catch (e) {
    console.warn("[chat] markThreadRead failed:", e);
  }
}

// ── HR side: list every thread (for the messages panel) ─────────────────────
export async function listThreads(): Promise<ChatThreadMeta[]> {
  const snap = await getDocs(collection(db, "chats"));
  const out = snap.docs.map(d => {
    const x = d.data() as Partial<ChatThreadMeta>;
    return {
      emp_id: x.emp_id || d.id,
      emp_name: x.emp_name || d.id,
      lastMessage: x.lastMessage || "",
      lastMessageAt: x.lastMessageAt || 0,
      lastSender: (x.lastSender as ChatRole) || "",
      unreadForHr: x.unreadForHr || 0,
      unreadForEmployee: x.unreadForEmployee || 0,
    } as ChatThreadMeta;
  });
  out.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  return out;
}

// ── total unread for HR across all threads (for the tab badge) ──────────────
export async function totalUnreadForHr(): Promise<number> {
  const threads = await listThreads();
  return threads.reduce((n, t) => n + (t.unreadForHr || 0), 0);
}

// ── one thread's meta (employee side: is there an unread HR reply?) ─────────
export async function getThreadMeta(empId: string): Promise<ChatThreadMeta | null> {
  const snap = await getDoc(doc(db, "chats", empId));
  if (!snap.exists()) return null;
  const x = snap.data() as Partial<ChatThreadMeta>;
  return {
    emp_id: x.emp_id || empId,
    emp_name: x.emp_name || empId,
    lastMessage: x.lastMessage || "",
    lastMessageAt: x.lastMessageAt || 0,
    lastSender: (x.lastSender as ChatRole) || "",
    unreadForHr: x.unreadForHr || 0,
    unreadForEmployee: x.unreadForEmployee || 0,
  };
}
