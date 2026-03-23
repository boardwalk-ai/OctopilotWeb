"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { AuthService } from "@/services/AuthService";
import AdminOverviewPanel from "@/components/admin/AdminOverviewPanel";

function AdminLoginView({
  email,
  password,
  setEmail,
  setPassword,
  authError,
  isBusy,
  onEmailLogin,
  onGoogleLogin,
}: {
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  authError: string | null;
  isBusy: boolean;
  onEmailLogin: () => Promise<void>;
  onGoogleLogin: () => Promise<void>;
}) {
  return (
    <section className="mx-auto flex w-full max-w-[460px] flex-col justify-center rounded-[30px] border border-white/8 bg-[#090909] p-7 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/35">BrokeOctopus</p>
      <h1 className="mt-4 text-[2.5rem] font-semibold tracking-[-0.06em] text-white">Admin Login</h1>
      <p className="mt-3 text-sm leading-7 text-white/52">Sign in first. The next screen is the new Overview page, then you can continue into the full dashboard.</p>

      <div className="mt-8 space-y-4">
        <button
          onClick={onGoogleLogin}
          disabled={isBusy}
          className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-red-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white">G</span>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/28">
          <span className="h-px flex-1 bg-white/8" />
          Or use email
          <span className="h-px flex-1 bg-white/8" />
        </div>

        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          className="w-full rounded-[18px] border border-white/10 bg-[#121212] px-4 py-4 text-sm text-white outline-none transition focus:border-red-500/40"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="w-full rounded-[18px] border border-white/10 bg-[#121212] px-4 py-4 text-sm text-white outline-none transition focus:border-red-500/40"
        />

        {authError ? <div className="rounded-[18px] border border-red-500/25 bg-[#140b0b] px-4 py-3 text-sm text-red-100">{authError}</div> : null}

        <button
          onClick={onEmailLogin}
          disabled={isBusy}
          className="w-full rounded-full bg-red-500 px-5 py-4 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? "Signing in..." : "Enter Overview"}
        </button>
      </div>
    </section>
  );
}

export default function BrokeOctopusOverviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    return AuthService.subscribe(setUser);
  }, []);

  useEffect(() => {
    if (user === undefined) {
      return;
    }

    if (!user) {
      setIsBusy(false);
      setIsAdmin(false);
      return;
    }

    let ignore = false;

    const verifyAdmin = async () => {
      setIsBusy(true);
      setAuthError(null);

      try {
        const token = await AuthService.getIdToken(true);
        if (!token) {
          throw new Error("You need to be signed in as an admin.");
        }

        const response = await fetch("/api/admin/check-access", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json();

        if (!response.ok || !payload.isAdmin) {
          throw new Error(payload.error || "This account does not have admin access.");
        }

        if (!ignore) {
          setIsAdmin(true);
        }
      } catch (error) {
        if (!ignore) {
          setIsAdmin(false);
          setAuthError(error instanceof Error ? error.message : "Failed to verify admin access.");
        }
      } finally {
        if (!ignore) {
          setIsBusy(false);
        }
      }
    };

    void verifyAdmin();

    return () => {
      ignore = true;
    };
  }, [user]);

  const handleEmailLogin = async () => {
    setIsBusy(true);
    setAuthError(null);

    try {
      await AuthService.signInWithEmail(email.trim(), password);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to sign in.");
      setIsBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsBusy(true);
    setAuthError(null);

    try {
      await AuthService.signInWithGoogle();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to sign in.");
      setIsBusy(false);
    }
  };

  if (user === undefined || (isBusy && !isAdmin && !user)) {
    return (
      <main className="flex h-screen items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/75">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          Checking admin access...
        </div>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main className="h-screen overflow-hidden bg-[#050505] text-white">
        <div className="mx-auto flex h-screen w-full max-w-[1680px] items-center justify-center px-4 py-4 lg:px-6">
          <div className="w-full max-w-[460px]">
            <AdminLoginView
              email={email}
              password={password}
              setEmail={setEmail}
              setPassword={setPassword}
              authError={authError}
              isBusy={isBusy}
              onEmailLogin={handleEmailLogin}
              onGoogleLogin={handleGoogleLogin}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] px-4 py-4 lg:px-6">
        <section className="flex min-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[30px] border border-white/8 bg-[#090909] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4 lg:px-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/35">BrokeOctopus</p>
              <h1 className="mt-2 text-[2.2rem] font-semibold tracking-[-0.05em] text-white">Overview</h1>
              <p className="mt-2 text-sm leading-6 text-white/46">This is now the first admin page. Use it as the landing screen, then continue into the full dashboard when you need detail.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setRefreshKey((current) => current + 1)}
                className="rounded-full border border-white/10 bg-[#131313] px-4 py-2 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-300"
              >
                Refresh
              </button>
              <button
                onClick={() => router.push("/brokeoctopus/dashboard")}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-red-500"
              >
                Open Dashboard
              </button>
              <button
                onClick={async () => {
                  await AuthService.signOut();
                }}
                className="rounded-full border border-white/10 bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white transition hover:border-red-500/30 hover:text-red-300"
              >
                Log out
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <AdminOverviewPanel
              refreshKey={refreshKey}
              onOpenSection={(sectionId) => {
                const query = sectionId === "user-management" ? "" : `?section=${sectionId}`;
                router.push(`/brokeoctopus/dashboard${query}`);
              }}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
