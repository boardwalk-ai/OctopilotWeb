"use client";

import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { AuthService } from "@/services/AuthService";
import styles from "./AuthViewMobile.module.css";

type AuthViewProps = {
  initialError?: string | null;
};

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function TosModal({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-[#0d0d0d] p-6 shadow-[0_40px_100px_rgba(0,0,0,0.7)]">
        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.1),transparent_50%)]" />
        <div className="relative">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h3 className="text-[18px] font-semibold text-white">Before you continue</h3>
          <p className="mt-3 text-[14px] leading-relaxed text-white/55">
            By signing up, you agree to Octopilot AI&apos;s{" "}
            <a
              href="https://octopilotai.com/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-red-300 underline underline-offset-2 hover:text-white"
            >
              Privacy Policy
            </a>{" "}
            and{" "}
            <a
              href="https://octopilotai.com/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-red-300 underline underline-offset-2 hover:text-white"
            >
              Terms of Service
            </a>
            .
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={onAgree}
              className="w-full rounded-[18px] bg-red-500 py-3 text-[14px] font-semibold text-white transition hover:bg-red-400"
            >
              Agree &amp; Create Account
            </button>
            <button
              onClick={onCancel}
              className="w-full rounded-[18px] border border-white/10 bg-white/[0.03] py-3 text-[14px] font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthView({ initialError = null }: AuthViewProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [cursor, setCursor] = useState({ x: 50, y: 50 });
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const [forgotPasswordDone, setForgotPasswordDone] = useState(false);
  const [showTosModal, setShowTosModal] = useState(false);

  const isLogin = mode === "login";
  const isBusy = isEmailLoading || isGoogleLoading || isForgotPasswordLoading;

  // Complete email-link sign-in if the page was opened from a magic link
  useEffect(() => {
    if (typeof window === "undefined" || !AuthService.isEmailLink(window.location.href)) return;

    const storedEmail = AuthService.getStoredEmailForSignIn();

    AuthService.completeEmailLinkSignIn(window.location.href, storedEmail || undefined)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not finish email sign-in.");
      });
  }, []);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const runSignup = async () => {
    setIsEmailLoading(true);
    try {
      await AuthService.signUpWithEmail(fullName, email.trim(), password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isLogin) {
      // Show ToS modal before creating account
      setShowTosModal(true);
      return;
    }

    setIsEmailLoading(true);
    try {
      await AuthService.signInWithEmail(email.trim(), password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleTosAgree = async () => {
    setShowTosModal(false);
    await runSignup();
  };

  const handlePointerMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setCursor({ x, y });
  };

  const handleGoogle = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await AuthService.signInWithGoogle();
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : "Google sign-in failed.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setError(null);
    setIsForgotPasswordLoading(true);
    try {
      await AuthService.sendPasswordResetEmail(email);
      setForgotPasswordDone(true);
    } catch (forgotError) {
      setError(forgotError instanceof Error ? forgotError.message : "Could not send reset email.");
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setShowForgotPassword(false);
    setForgotPasswordDone(false);
    setError(null);
    setShowPassword(false);
  };

  return (
    <>
      {showTosModal && (
        <TosModal
          onAgree={handleTosAgree}
          onCancel={() => setShowTosModal(false)}
        />
      )}

      <main
        className={`auth-shell relative h-screen overflow-hidden bg-black text-white ${styles.authMobileShell}`}
        onMouseMove={handlePointerMove}
        style={{ "--cursor-x": `${cursor.x}%`, "--cursor-y": `${cursor.y}%` } as React.CSSProperties}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="auth-cursor-glow" />
          <div className="auth-red-haze auth-red-haze-a" />
          <div className="auth-red-haze auth-red-haze-b" />
          <div className="auth-grid" />
          <div className="auth-noise" />
        </div>

        <div className={`relative mx-auto flex h-screen w-full max-w-[1600px] items-center px-6 py-6 lg:px-10 ${styles.authFrame}`}>
          <div className={`grid h-full min-h-0 w-full items-stretch gap-6 lg:grid-cols-[1.12fr_0.88fr] ${styles.authGrid}`}>

            {/* Left hero panel */}
            <section className={`flex min-h-0 flex-col rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-7 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl lg:px-9 lg:py-8 ${styles.authHero}`}>
              <div className={`space-y-5 ${styles.authHeroTop}`}>
                <div className="inline-flex items-center gap-3 self-start rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-black backdrop-blur-xl">
                  <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.95)]" />
                  <span>Octopilot Web</span>
                </div>
                <div className="max-w-4xl space-y-4">
                  <h1 className={`max-w-4xl text-5xl font-semibold leading-[0.9] tracking-[-0.065em] text-white sm:text-[4.75rem] lg:text-[5.7rem] ${styles.desktopHeroTitle}`}>
                    Enter the
                    <span className="mt-1 block text-red-500">writing engine.</span>
                  </h1>
                  <h1 className={`max-w-4xl text-5xl font-semibold leading-[0.9] tracking-[-0.065em] text-white sm:text-[4.75rem] lg:text-[5.7rem] ${styles.mobileHeroTitle}`}>
                    <span className={styles.mobileHeroAccent}>Writing</span> engine.
                  </h1>
                  <p className={`max-w-2xl text-[15px] leading-7 text-white/66 sm:text-[17px] ${styles.desktopHeroBody}`}>
                    Build stronger essays with research, outlining, drafting, and humanizing inside one sharp academic workspace designed for speed.
                  </p>
                  <p className={`max-w-2xl text-[15px] leading-7 text-white/66 sm:text-[17px] ${styles.mobileHeroBody}`}>
                    Research, draft, and humanize faster.
                  </p>
                </div>
              </div>

              <div className="mt-auto space-y-4 pt-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    ["Research Faster", "Move from topic to credible sources without leaving the workspace."],
                    ["Draft with Control", "Shape structure, tone, and formatting before the first full pass."],
                    ["Humanize Output", "Refine AI-written text into cleaner, more natural academic prose."],
                  ].map(([title, body]) => (
                    <article
                      key={title}
                      className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    >
                      <h2 className="text-[13px] font-semibold tracking-[0.04em] text-white">{title}</h2>
                      <p className="mt-2.5 text-[13px] leading-6 text-white/62">{body}</p>
                    </article>
                  ))}
                </div>
                <div className="auth-footer-line flex items-center justify-between gap-4 rounded-[28px] border border-red-500/16 bg-[linear-gradient(90deg,rgba(127,29,29,0.18),rgba(0,0,0,0.02))] px-5 py-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white/45">What You Get</p>
                    <p className="mt-2 text-sm text-white/78">One clean launch point for outlining, writing, and polish.</p>
                  </div>
                  <div className="rounded-full border border-red-500/30 bg-red-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-red-200">
                    Ready
                  </div>
                </div>
              </div>
            </section>

            {/* Right auth panel */}
            <section className={`relative flex min-h-0 items-center justify-center lg:justify-end ${styles.authPanel}`}>
              <div className={`auth-card relative w-full max-w-[34rem] rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(3,3,3,0.98))] p-4 shadow-[0_45px_120px_rgba(0,0,0,0.55)] sm:p-4.5 ${styles.authCard}`}>
                <div className="pointer-events-none absolute inset-0 rounded-[36px] bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.14),transparent_36%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_45%)]" />
                <div className={`relative rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-5 sm:p-6 ${styles.authCardInner}`}>

                  {/* Header — no "Live" badge */}
                  <div className={`${styles.authCardHeader}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/45">Portal Access</p>
                    <h2 className="mt-2.5 text-[2.15rem] font-semibold tracking-[-0.04em] text-white">
                      {isLogin ? "Welcome back" : "Create account"}
                    </h2>
                  </div>

                  {/* Login / Sign up toggle */}
                  <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5">
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      disabled={isBusy}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${isLogin ? "bg-white text-black shadow-[0_14px_35px_rgba(255,255,255,0.12)]" : "text-white/65 hover:bg-white/6"}`}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      disabled={isBusy}
                      className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${!isLogin ? "bg-white text-black shadow-[0_14px_35px_rgba(255,255,255,0.12)]" : "text-white/65 hover:bg-white/6"}`}
                    >
                      Sign up
                    </button>
                  </div>

                  {/* Google — icon uses hardcoded colors so hover can't break it */}
                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={isBusy}
                    className={`group mt-5 flex w-full items-center justify-center gap-3 rounded-[22px] border border-white/15 bg-white px-5 py-3.5 text-sm font-semibold text-black transition duration-300 hover:border-red-500/40 hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-70 ${styles.googleButton}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                        <path fill="#4285F4" d="M21.8 12.23c0-.77-.07-1.51-.2-2.23H12v4.22h5.49a4.7 4.7 0 0 1-2.04 3.09v2.56h3.3c1.93-1.78 3.05-4.4 3.05-7.64Z" />
                        <path fill="#34A853" d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.3-2.56c-.91.61-2.08.98-3.47.98-2.67 0-4.93-1.8-5.73-4.23H2.86v2.64A10.22 10.22 0 0 0 12 22Z" />
                        <path fill="#FBBC05" d="M6.27 13.72A6.15 6.15 0 0 1 5.95 12c0-.6.11-1.18.32-1.72V7.64H2.86A10.22 10.22 0 0 0 1.8 12c0 1.65.4 3.22 1.06 4.36l3.41-2.64Z" />
                        <path fill="#EA4335" d="M12 6.05c1.5 0 2.84.51 3.9 1.51l2.92-2.92C17.08 2.98 14.76 2 12 2 7.95 2 4.43 4.3 2.86 7.64l3.41 2.64c.8-2.43 3.06-4.23 5.73-4.23Z" />
                      </svg>
                    </span>
                    {isGoogleLoading ? "Connecting to Google..." : "Continue with Google"}
                    <span className="transition-transform duration-300 group-hover:translate-x-1">↗</span>
                  </button>

                  <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-white/35">
                    <span className="h-px flex-1 bg-white/10" />
                    or use email
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <form className={`space-y-3 ${styles.authForm}`} onSubmit={handleSubmit}>
                    {!isLogin && (
                      <label className="block space-y-2">
                        <span className="text-[15px] font-medium text-white/88">Full name</span>
                        <input
                          type="text"
                          placeholder="Your full name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white outline-none transition placeholder:text-white/26 focus:border-red-500/65 focus:bg-white/[0.06]"
                          autoComplete="name"
                          disabled={isBusy}
                          required
                        />
                      </label>
                    )}

                    <label className="block space-y-2">
                      <span className="text-[15px] font-medium text-white/88">Email</span>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white outline-none transition placeholder:text-white/26 focus:border-red-500/65 focus:bg-white/[0.06]"
                        autoComplete="email"
                        disabled={isBusy}
                        required
                      />
                    </label>

                    <label className="block space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[15px] font-medium text-white/88">Password</span>
                        {isLogin && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => { setShowForgotPassword(!showForgotPassword); setForgotPasswordDone(false); setError(null); }}
                            className="text-[12px] font-medium text-white/40 transition hover:text-red-300 disabled:opacity-50"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder={isLogin ? "Enter your password" : "Choose a secure password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 pr-12 text-[15px] text-white outline-none transition placeholder:text-white/26 focus:border-red-500/65 focus:bg-white/[0.06]"
                          autoComplete={isLogin ? "current-password" : "new-password"}
                          disabled={isBusy}
                          required={!showForgotPassword}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 transition hover:text-white/70"
                          tabIndex={-1}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          <EyeIcon open={showPassword} />
                        </button>
                      </div>
                    </label>

                    {/* Forgot password panel */}
                    {isLogin && showForgotPassword && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                        {forgotPasswordDone ? (
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 text-green-400">✓</span>
                            <p className="text-[13px] leading-relaxed text-white/70">
                              Reset link sent to <span className="font-semibold text-white/90">{email.trim()}</span>. Check your inbox and follow the link to set a new password.
                            </p>
                          </div>
                        ) : (
                          <>
                            <p className="text-[12px] text-white/50 leading-relaxed">
                              We&apos;ll send a reset link to the email above.
                            </p>
                            <button
                              type="button"
                              onClick={handleForgotPassword}
                              disabled={isBusy || !email.trim()}
                              className="w-full rounded-[18px] border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[13px] font-semibold text-white/80 transition hover:border-red-500/40 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isForgotPasswordLoading ? "Sending…" : "Send reset link"}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Error — role=alert so screen readers announce it */}
                    {error && (
                      <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isBusy}
                      className={`w-full rounded-[22px] bg-red-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-[0_18px_50px_rgba(239,68,68,0.2)] transition duration-300 hover:-translate-y-0.5 hover:bg-red-400 hover:shadow-[0_22px_60px_rgba(239,68,68,0.3)] disabled:cursor-not-allowed disabled:opacity-70 ${styles.primaryButton}`}
                    >
                      {isEmailLoading ? "Authorizing..." : isLogin ? "Sign in" : "Create account"}
                    </button>
                  </form>
                </div>
              </div>
            </section>

          </div>
        </div>
      </main>
    </>
  );
}
