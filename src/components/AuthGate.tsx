"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import HomeView from "@/views/HomeView";
import AuthView from "@/views/AuthView";
import { AuthService } from "@/services/AuthService";
import VerifyEmailView from "@/components/VerifyEmailView";

export default function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [isApplyingEmailAction, setIsApplyingEmailAction] = useState(() => typeof window !== "undefined");
  const [emailActionError, setEmailActionError] = useState<string | null>(null);

  useEffect(() => {
    return AuthService.subscribe(setUser);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    AuthService.applyEmailActionFromUrl(window.location.href)
      .catch((error) => {
        setEmailActionError(error instanceof Error ? error.message : "Could not complete email verification.");
      })
      .finally(() => {
        setIsApplyingEmailAction(false);
      });
  }, []);

  if (user === undefined || isApplyingEmailAction) {
    return (
      <main className="flex h-screen items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/75">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          {isApplyingEmailAction ? "Checking verification..." : "Checking authentication..."}
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthView initialError={emailActionError} />;
  }

  if (AuthService.requiresEmailVerification(user)) {
    return <VerifyEmailView user={user} onVerified={setUser} />;
  }

  return <HomeView />;
}
