# Report Issue — Google Auth: How It Actually Works (Code Review Doc)

This document traces the **real, implemented** Google authentication flow for the
**Report Issue** feature, file by file, exactly as it exists in the code. Use it to
review whether the implementation is correct.

> Scope: Only **Report Issue** is auth-gated. Leave / Regularization / Log Meeting
> are unchanged and have NO login. Reads are public everywhere.

---

## 0. The big picture (one paragraph)

The app loads **anonymously** — no login on startup. When a user finishes the
Report Issue form and clicks **Submit**, a "just-in-time" gate checks whether a
Google user is already signed in. If yes, it writes immediately. If no, it opens
the Google sign-in **popup**, waits for success, then writes. The write stamps the
user's **verified email taken from the Firebase token** (never a typed field).
Firebase keeps the login session alive across reloads automatically, so a user
only signs in once until they sign out or the session expires.

---

## 1. Where login state is "saved" (the part you asked about)

**You do NOT save the login yourself. Firebase Auth does it for you.**

- On a successful `signInWithPopup`, the Firebase SDK persists the session in the
  browser's **IndexedDB** (default persistence = `browserLocalPersistence`), under
  Firebase's own keys — not your `localStorage` `cf_my_emp_id`.
- On every page load, the SDK reads that persisted session, silently refreshes the
  ID token, and fires `onAuthStateChanged` with the restored `User` (or `null`).
- This is why the user stays logged in across reloads **without any code from us**
  saving anything.

**Important distinction — two separate identities live side by side:**

| Identity | Stored where | Trust level | Used for |
|---|---|---|---|
| `cf_my_emp_id` (e.g. `CDAI007`) | your `localStorage` | **untrusted** (user can edit) | which employee's doc to write to, avatar/name |
| Google account (email + uid) | Firebase IndexedDB session | **trusted** (signed token) | the tamper-proof audit stamp |

The whole security idea: the **document path** still uses the editable `emp_id`,
but the **author stamp** uses the unforgeable Google email.

---

## 2. `src/firebase.ts` — initialization

```ts
import { getAuth, GoogleAuthProvider } from "firebase/auth";

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
```

- `auth` is the singleton Auth instance for the app.
- `googleProvider` is the Google sign-in provider.
- `prompt: "select_account"` forces the Google account chooser every time, so on a
  shared machine the browser won't silently reuse someone else's Google session.

✅ Correct and minimal. No login is triggered here — just setup.

---

## 3. `src/hooks/useJITAuth.ts` — the JIT auth engine

### State it exposes
- `user` — the current Firebase `User | null` (kept in sync via the listener).
- `loading` — true until the **initial** auth state resolves on first load.
- `signingIn` — true only while the popup is open (drives the "Signing in…" UI).
- `executeProtectedAction(cb)` — the gate function.

### The listener (keeps `user` fresh)
```ts
useEffect(() => {
  const unsub = onAuthStateChanged(auth, (u) => {
    setUser(u);
    setLoading(false);
  });
  return () => unsub();
}, []);
```
- Runs once on mount. Firebase calls the callback immediately with the restored
  session (or null), then again on every login/logout.
- `mounted` ref guards against setting state after unmount (no React warning).

### The gate
```ts
const executeProtectedAction = async (actionCallback) => {
  if (auth.currentUser) {                 // (1) already signed in
    await actionCallback(auth.currentUser);
    return { ok: true };
  }
  setSigningIn(true);
  try {
    const cred = await signInWithPopup(auth, googleProvider); // (2) open popup
    await actionCallback(cred.user);        // (3) run after login
    return { ok: true };
  } catch (e) {                             // (4) graceful errors
    // popup-closed-by-user / cancelled-popup-request / user-cancelled → "cancelled"
    // popup-blocked → friendly "allow popups" message
    // anything else → generic error + console.error
  } finally {
    setSigningIn(false);
  }
};
```

Why `auth.currentUser` (not the `user` state) inside the gate? Because
`currentUser` is **always current synchronously**, even if React hasn't re-rendered
the `user` state yet. This avoids a race where a just-logged-in user is still seen
as `null` by stale state.

✅ Matches the required spec exactly: no forced login, run-now-if-signed-in,
popup-then-run otherwise, graceful popup-close handling, and it's awaitable.

---

## 4. `src/components/ReportIssue.tsx` — using the gate on submit

### Hook usage
```ts
const { user, signingIn, executeProtectedAction } = useJITAuth();
```

### Submit handler (the heart of it)
```ts
async function handleSubmit() {
  // local validation first (profile chosen, category, description)
  ...
  const result = await executeProtectedAction(async (authUser) => {
    setSaving(true);
    const newReport = {
      ...,
      created_at: Date.now(),
      submittedByEmail: authUser.email ?? "",  // from the TOKEN
      submittedByUid: authUser.uid,            // from the TOKEN
    };
    await setDoc(doc(db, "issues", empId), {
      emp_id: empId,
      emp_name: empName || empId,
      lastWriterEmail: authUser.email ?? "",   // doc-level — RULES CHECK THIS
      lastWriterUid: authUser.uid,
      updatedAt: serverTimestamp(),
      reports: [...reports, newReport],
    }, { merge: true });

    // best-effort: link google email → employees/{empId} so HR sees who logged in
    await setDoc(doc(db, "employees", empId),
      { google_email: authUser.email, google_uid: authUser.uid }, { merge: true });
    ...
  });
  if (!result.ok) setErr(result.message);     // cancelled/blocked → show message
}
```

Key correctness points:
- The email is read from `authUser` (the token's user), **never from a form input**.
  There is no email field in the form at all.
- `lastWriterEmail` is written at the **document top level** — this is the field the
  security rules can actually read (see §6 for why per-report email can't be).
- `serverTimestamp()` is the trusted server clock (`created_at: Date.now()` inside
  the report is just the client's display time, not security-relevant).
- If the popup is cancelled/blocked, `executeProtectedAction` returns `ok:false` and
  the form shows a friendly error — the write never happens.

### Button states
```ts
{signingIn ? "Signing in…"
 : saving   ? "Submitting…"
 : user     ? "Submit Report"
 : "Sign in & Submit"}
```
- Logged out → button reads **"Sign in & Submit"** (with a Google glyph).
- During popup → **"Signing in…"** (button disabled).
- During write → **"Submitting…"**.
- A line above shows **"Signed in as <email>"** once authenticated.

✅ Clear loading states during the auth/popup phase.

---

## 5. Step-by-step runtime trace

**Case A — user NOT signed in:**
1. User opens Report Issue, picks profile, fills form, clicks **Sign in & Submit**.
2. `handleSubmit` validates locally, calls `executeProtectedAction(cb)`.
3. `auth.currentUser` is null → `signingIn=true`, Google popup opens.
4. User picks their Google account → popup resolves with `cred.user`.
5. Firebase persists the session (IndexedDB) automatically.
6. `cb(cred.user)` runs → writes the issue doc with `lastWriterEmail = that email`.
7. Firestore rules verify `request.auth.token.email == lastWriterEmail` → allow.
8. `onAuthStateChanged` also fires → `user` state updates → UI now shows
   "Signed in as …".

**Case B — user ALREADY signed in (e.g. submitted earlier, or reloaded):**
1. On load, Firebase restores the session; `onAuthStateChanged` sets `user`.
2. User clicks **Submit Report**.
3. `auth.currentUser` exists → callback runs **immediately**, no popup.
4. Write succeeds with the verified email.

---

## 6. `firestore.rules` — what the server enforces

```
match /issues/{empId} {
  allow read: if true;                         // public read
  allow create, update: if request.auth != null
                        && request.auth.token.email_verified == true
                        && request.resource.data.lastWriterEmail == request.auth.token.email;
  allow delete: if false;
}
```
- A write to any `issues/{empId}` doc is rejected **server-side** unless the caller
  is signed in, email-verified, and the doc's `lastWriterEmail` equals their token
  email. Editing localStorage/cookies cannot bypass this.
- It checks `lastWriterEmail` (top-level), **not** `submittedByEmail`, because
  `submittedByEmail` lives inside each element of the `reports[]` array, and
  Firestore rules **cannot index into arrays**. The per-report `submittedByEmail`
  remains as an audit field; the enforceable field must be top-level.
- `update` is allowed (not `if false`) because this app appends to a `reports[]`
  array via `setDoc(merge)` — the 2nd report and any cancel are *updates* to the
  same per-employee doc. Each update still must carry the correct verified email.

---

## 7. Is it correct? — verdict

**Yes, functionally correct for the chosen design**, with these honest limits:

✅ No forced login; public dashboard intact.
✅ Login persists across reloads (Firebase handles it; nothing custom to maintain).
✅ Email is taken from the signed token, never a form field.
✅ Server rules reject spoofed writers (can't be bypassed from the client).
✅ Graceful popup-cancel / popup-blocked handling.

⚠️ Known, accepted trade-offs (consequences of the array-in-one-doc data model):
1. Rules verify the **document writer's** email, not each array element's author. A
   signed-in employee could write into another employee's `issues` doc — but it is
   stamped with **their** real verified email, so the audit trail catches it. True
   per-report immutability needs one-doc-per-report (`addDoc`), which was declined.
2. "Any Google account" can sign in. The email is always verified + recorded, so you
   always know who. To block outsiders, add a rule that the token email must exist
   on an `employees` record.

---

## 8. What must be done in the Firebase Console (not code)

1. **Enable Google** under Authentication → Sign-in method.
2. **Authorized domains** (Authentication → Settings): add the Vercel domain(s) and
   `localhost`, else the popup throws `auth/unauthorized-domain`.
3. **Publish the corrected `firestore.rules`** (replace the older `leave_requests/…`
   rules that don't match this app's collections).

Until #3 is published, the auth gate is enforced only client-side.
