import { useEffect, useState, useCallback, useRef } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

// ─────────────────────────────────────────────────────────────────────────────
// Just-In-Time (JIT) Google auth.
//
// The app stays public/anonymous — we never force a login on load. Auth is only
// triggered the moment a user performs a protected action (submitting a Report
// Issue). `executeProtectedAction` runs the callback immediately if already
// signed in, otherwise opens the Google popup, waits for success, then runs it.
//
// The verified identity (auth.currentUser.email) comes from a signed Firebase
// token — it cannot be forged by editing localStorage/cookies, which is the whole
// point for a tech-savvy user base.
// ─────────────────────────────────────────────────────────────────────────────

type ProtectedResult = { ok: true } | { ok: false; reason: "cancelled" | "error"; message: string };

export function useJITAuth() {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [loading, setLoading] = useState(true); // resolving the initial auth state
  const [signingIn, setSigningIn] = useState(false); // popup in flight
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!mounted.current) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      mounted.current = false;
      unsub();
    };
  }, []);

  /**
   * Run `actionCallback` only once a verified Google user exists.
   * - already signed in  → runs immediately (unless forceReauth)
   * - not signed in      → opens Google popup, then runs on success
   * - forceReauth: true  → signs out first so the account chooser ALWAYS appears
   *                        (used by "change email" to let the user pick a different
   *                        Google account). The callback receives the NEW user.
   * Returns a result so the caller can show a message if the user cancels/fails.
   * The callback is awaited, so callers can `await executeProtectedAction(...)`.
   */
  const executeProtectedAction = useCallback(
    async (
      actionCallback: (u: User) => void | Promise<void>,
      opts?: { forceReauth?: boolean }
    ): Promise<ProtectedResult> => {
      // 1. Already authenticated and not forcing a re-auth → go straight through.
      if (auth.currentUser && !opts?.forceReauth) {
        await actionCallback(auth.currentUser);
        return { ok: true };
      }

      // forceReauth → drop the current session so the popup shows the chooser.
      if (opts?.forceReauth && auth.currentUser) {
        try { await signOut(auth); } catch { /* ignore */ }
      }

      // 2/3. No user → trigger the popup, await it, then proceed.
      setSigningIn(true);
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        await actionCallback(cred.user);
        return { ok: true };
      } catch (e: any) {
        // 4. Graceful handling — most commonly the user closed the popup.
        const code = e?.code || "";
        if (
          code === "auth/popup-closed-by-user" ||
          code === "auth/cancelled-popup-request" ||
          code === "auth/user-cancelled"
        ) {
          return { ok: false, reason: "cancelled", message: "Sign-in was cancelled." };
        }
        if (code === "auth/popup-blocked") {
          return {
            ok: false,
            reason: "error",
            message: "Popup was blocked by the browser. Please allow popups and try again.",
          };
        }
        console.error("[useJITAuth] sign-in failed:", e);
        return { ok: false, reason: "error", message: "Could not sign in with Google. Please try again." };
      } finally {
        if (mounted.current) setSigningIn(false);
      }
    },
    []
  );

  return { user, loading, signingIn, executeProtectedAction };
}
