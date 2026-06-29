import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Firebase config. Read from Vite env vars (VITE_FIREBASE_*) when present, with a
// fallback to the project defaults so the app keeps working if env isn't set.
// NOTE: Firebase web API keys are PUBLIC by design (they ship in the client bundle);
// env vars here are for per-environment config, not secrecy. Real protection lives
// in the Firestore security rules.
const env = import.meta.env;
const firebaseConfig = {
  apiKey:            env.VITE_FIREBASE_API_KEY             ?? "AIzaSyCqfFBqHt-RmKTmFXPkFLT5vRj3eGh02jQ",
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN         ?? "canary-face.firebaseapp.com",
  projectId:         env.VITE_FIREBASE_PROJECT_ID          ?? "canary-face",
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET      ?? "canary-face.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "792626968908",
  appId:             env.VITE_FIREBASE_APP_ID              ?? "1:792626968908:web:7388d3752f8a1cc38c77e9",
};

const app = initializeApp(firebaseConfig);

// Enable offline IndexedDB cache (multi-tab safe). Reads are served from cache
// instantly and survive brief network drops, cutting redundant network reads.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// ── Auth (Google) ──
// Used only for the just-in-time login when submitting a Report Issue. The rest of
// the app stays public/anonymous. The token's verified email is what we trust for
// audit stamping — never a client-typed field.
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Always show the account chooser, so a shared machine can't silently reuse a session.
googleProvider.setCustomParameters({ prompt: "select_account" });