// Authentication service - Firebase auth on the client, token consumption on the server.

import {
  ActionCodeSettings,
  User,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { ensureFirebasePersistence, firebaseAuth, getEmailLinkRedirectUrl, googleProvider } from "@/third-party-config/firebase";

const EMAIL_STORAGE_KEY = "octopilot.emailForSignIn";
const EMAIL_MODE_STORAGE_KEY = "octopilot.emailLinkMode";
const EMAIL_NAME_STORAGE_KEY = "octopilot.emailLinkName";

type EmailLinkMode = "login" | "signup";

type EmailLinkCompletionResult =
  | { status: "signed_in"; user: User; isNewUser: boolean }
  | { status: "needs_email" }
  | { status: "not_email_link" };

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
      "auth/missing-email": "Enter your email address.",
      "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
      "auth/expired-action-code": "That sign-in link expired. Request a new one.",
      "auth/invalid-action-code": "That sign-in link is invalid. Request a new one.",
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

  static isEmailLink(url: string): boolean {
    return isSignInWithEmailLink(firebaseAuth, url);
  }

  static async sendEmailLink(email: string, options?: { mode?: EmailLinkMode; name?: string }): Promise<void> {
    try {
      await ensureFirebasePersistence();

      const actionCodeSettings: ActionCodeSettings = {
        url: getEmailLinkRedirectUrl(),
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(firebaseAuth, email, actionCodeSettings);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
        window.localStorage.setItem(EMAIL_MODE_STORAGE_KEY, options?.mode || "login");

        if (options?.name?.trim()) {
          window.localStorage.setItem(EMAIL_NAME_STORAGE_KEY, options.name.trim());
        } else {
          window.localStorage.removeItem(EMAIL_NAME_STORAGE_KEY);
        }
      }
    } catch (error) {
      throw mapFirebaseError(error);
    }
  }

  static getStoredEmailForSignIn(): string {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(EMAIL_STORAGE_KEY) || "";
  }

  static async completeEmailLinkSignIn(url: string, emailOverride?: string): Promise<EmailLinkCompletionResult> {
    if (!AuthService.isEmailLink(url)) {
      return { status: "not_email_link" };
    }

    const email = emailOverride?.trim() || AuthService.getStoredEmailForSignIn();
    if (!email) {
      return { status: "needs_email" };
    }

    try {
      await ensureFirebasePersistence();
      const result = await signInWithEmailLink(firebaseAuth, email, url);
      const pendingName =
        typeof window !== "undefined" ? window.localStorage.getItem(EMAIL_NAME_STORAGE_KEY)?.trim() || "" : "";

      if (pendingName && !result.user.displayName) {
        await updateProfile(result.user, { displayName: pendingName });
      }

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
        window.localStorage.removeItem(EMAIL_MODE_STORAGE_KEY);
        window.localStorage.removeItem(EMAIL_NAME_STORAGE_KEY);

        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("apiKey");
        cleanUrl.searchParams.delete("mode");
        cleanUrl.searchParams.delete("oobCode");
        cleanUrl.searchParams.delete("continueUrl");
        cleanUrl.searchParams.delete("lang");
        window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      }

      return {
        status: "signed_in",
        user: result.user,
        isNewUser: getAdditionalUserInfo(result)?.isNewUser ?? false,
      };
    } catch (error) {
      throw mapFirebaseError(error);
    }
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
