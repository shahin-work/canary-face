import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
export const db = getFirestore(app);