"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { AuthService } from "@/services/AuthService";

type VerifyEmailViewProps = {
  user: User;
  onVerified: (user: User) => void;
};

export default function VerifyEmailView({ user, onVerified }: VerifyEmailViewProps) {
  const [notice, setNotice] = useState<string | null>(
    `Please check ${user.email || "your inbox"} and verify your email address before entering the app.`
  );
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleRefresh = async () => {
    setError(null);
    setNotice(null);
    setIsRefreshing(true);

    try {
      const refreshedUser = await AuthService.reloadCurrentUser();

      if (refreshedUser && !AuthService.requiresEmailVerification(refreshedUser)) {
        onVerified(refreshedUser);
        return;
      }

      setNotice("Still waiting for verification. After clicking the link in your inbox, come back here and try again.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh verification state.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    setIsResending(true);

    try {
      await AuthService.sendVerificationEmail(user);
      setNotice(`A new verification email was sent to ${user.email || "your inbox"}.`);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Could not resend verification email.");
    } finally {
      setIsResending(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setIsSigningOut(true);

    try {
      await AuthService.signOut();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Could not sign out.");
    } finally {
      setIsSigningOut(false);
    }
  };

  const isBusy = isRefreshing || isResending || isSigningOut;

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.18),transparent_32%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_40%)]" />
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />

      <section className="relative z-10 w-full max-w-xl rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(3,3,3,0.98))] p-5 shadow-[0_45px_120px_rgba(0,0,0,0.55)] sm:p-7">
        <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-6 sm:p-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-black backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.95)]" />
            <span>Email Verification</span>
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
            Verify your email first.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-white/66">
            Your Octopilot Web account was created, but email/password accounts must be verified before entering the app.
          </p>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-4 text-sm leading-7 text-white/75">
            <div className="font-medium text-white">{user.email}</div>
            <div className="mt-2">Open the verification email, click the link, then return here and confirm.</div>
          </div>

          {notice && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/78">
              {notice}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isBusy}
              className="rounded-[22px] bg-red-500 px-5 py-3.5 text-[15px] font-semibold text-black transition duration-300 hover:bg-white hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isRefreshing ? "Checking..." : "I verified my email"}
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={isBusy}
              className="rounded-[22px] border border-white/12 bg-white/[0.03] px-5 py-3.5 text-[15px] font-medium text-white/78 transition hover:border-red-500/35 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isResending ? "Sending..." : "Resend verification email"}
            </button>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isBusy}
            className="mt-4 w-full rounded-[22px] border border-white/10 bg-transparent px-5 py-3 text-sm font-medium text-white/46 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSigningOut ? "Signing out..." : "Use another account"}
          </button>
        </div>
      </section>
    </main>
  );
}
