import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCqfFBqHt-RmKTmFXPkFLT5vRj3eGh02jQ",
  authDomain: "canary-face.firebaseapp.com",
  projectId: "canary-face",
  storageBucket: "canary-face.firebasestorage.app",
  messagingSenderId: "792626968908",
  appId: "1:792626968908:web:7388d3752f8a1cc38c77e9",
};

const app = initializeApp(firebaseConfig);

// Enable offline IndexedDB cache (multi-tab safe). Reads are served from cache
// instantly and survive brief network drops, cutting redundant network reads.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});