// Authentication service - Firebase auth on the client, token consumption on the server.

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { ensureFirebasePersistence, firebaseAuth, googleProvider } from "@/third-party-config/firebase";

function mapFirebaseError(error: unknown): Error {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;
    const readable = {
      "auth/email-already-in-use": "That email is already in use.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/invalid-credential": "Your email or password is incorrect.",
      "auth/missing-password": "Enter your password.",
      "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
      "auth/too-many-requests": "Too many attempts. Try again in a bit.",
      "auth/user-not-found": "No account was found for that email.",
      "auth/weak-password": "Use a stronger password with at least 6 characters.",
      "auth/network-request-failed": "Network error. Check your connection and try again.",
    } satisfies Record<string, string>;

    return new Error(readable[code] || "Authentication failed. Please try again.");
  }

  return error instanceof Error ? error : new Error("Authentication failed. Please try again.");
}

export class AuthService {
  static async signInWithGoogle(): Promise<User> {
    try {
      await ensureFirebasePersistence();
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      return result.user;
    } catch (error) {
      throw mapFirebaseError(error);
    }
  }

  static async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      await ensureFirebasePersistence();
      const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
      return result.user;
    } catch (error) {
      throw mapFirebaseError(error);
    }
  }

  static async signUpWithEmail(name: string, email: string, password: string): Promise<User> {
    try {
      await ensureFirebasePersistence();
      const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (name.trim()) {
        await updateProfile(result.user, { displayName: name.trim() });
      }
      return result.user;
    } catch (error) {
      throw mapFirebaseError(error);
    }
  }

  static async signOut(): Promise<void> {
    await signOut(firebaseAuth);
  }

  static subscribe(listener: (user: User | null) => void): () => void {
    return onAuthStateChanged(firebaseAuth, listener);
  }

  static getCurrentUser(): User | null {
    return firebaseAuth.currentUser;
  }

  static async getIdToken(forceRefresh = false): Promise<string | null> {
    const user = firebaseAuth.currentUser;
    if (!user) {
      return null;
    }
    return user.getIdToken(forceRefresh);
  }

  static async getAuthorizationHeader(forceRefresh = false): Promise<string | null> {
    const token = await AuthService.getIdToken(forceRefresh);
    return token ? `Bearer ${token}` : null;
  }
}
