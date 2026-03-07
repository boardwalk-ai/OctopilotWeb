import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, setPersistence } from "firebase/auth";

// Firebase configuration for Octopilot Web.
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBcq3ylnbryHAENyn4KkqjuouIl4EBvOkc",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "octopilot-ai-7b29e.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "octopilot-ai-7b29e",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "octopilot-ai-7b29e.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "712429690306",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:712429690306:web:fcc508befb950e84b8ca5b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-F8L6GTDZLZ",
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account",
});

let persistencePromise: Promise<void> | null = null;

export function ensureFirebasePersistence(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!persistencePromise) {
    persistencePromise = setPersistence(firebaseAuth, browserLocalPersistence);
  }

  return persistencePromise;
}

export function getEmailLinkRedirectUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_EMAIL_LINK_REDIRECT_URL || `${window.location.origin}/`;
  }

  return process.env.NEXT_PUBLIC_EMAIL_LINK_REDIRECT_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000/";
}
