"use client";

import { FormEvent, MouseEvent, useState } from "react";

export default function AuthView() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [cursor, setCursor] = useState({ x: 50, y: 50 });

  const isLogin = mode === "login";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const handlePointerMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setCursor({ x, y });
  };

  return (
    <main
      className="auth-shell relative h-screen overflow-hidden bg-black text-white"
      onMouseMove={handlePointerMove}
      style={
        {
          "--cursor-x": `${cursor.x}%`,
          "--cursor-y": `${cursor.y}%`,
        } as React.CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-cursor-glow" />
        <div className="auth-red-haze auth-red-haze-a" />
        <div className="auth-red-haze auth-red-haze-b" />
        <div className="auth-grid" />
        <div className="auth-noise" />
      </div>

      <div className="relative mx-auto flex h-screen w-full max-w-[1600px] items-center px-6 py-6 lg:px-10">
        <div className="grid h-full min-h-0 w-full items-stretch gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          <section className="flex min-h-0 flex-col rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] px-7 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl lg:px-9 lg:py-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-3 self-start rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.34em] text-white/88 backdrop-blur-xl">
                <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.95)]" />
                <span>Octopilot Web</span>
              </div>

              <div className="max-w-4xl space-y-4">
                <h1 className="max-w-4xl text-5xl font-semibold leading-[0.9] tracking-[-0.065em] text-white sm:text-[4.75rem] lg:text-[5.7rem]">
                  Enter the
                  <span className="mt-1 block text-red-500">writing engine.</span>
                </h1>
                <p className="max-w-2xl text-[15px] leading-7 text-white/66 sm:text-[17px]">
                  Build stronger essays with research, outlining, drafting, and humanizing inside one sharp academic
                  workspace designed for speed.
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

          <section className="relative flex min-h-0 items-center justify-center lg:justify-end">
            <div className="auth-card relative w-full max-w-[34rem] rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(3,3,3,0.98))] p-4 shadow-[0_45px_120px_rgba(0,0,0,0.55)] sm:p-4.5">
              <div className="pointer-events-none absolute inset-0 rounded-[36px] bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.14),transparent_36%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_45%)]" />
              <div className="relative rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/45">Portal Access</p>
                    <h2 className="mt-2.5 text-[2.15rem] font-semibold tracking-[-0.04em] text-white">
                      {isLogin ? "Welcome back" : "Create your cockpit"}
                    </h2>
                  </div>
                  <div className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-red-100/80">
                    Live
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isLogin
                        ? "bg-white text-black shadow-[0_14px_35px_rgba(255,255,255,0.12)]"
                        : "text-white/65 hover:bg-white/6"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      !isLogin
                        ? "bg-white text-black shadow-[0_14px_35px_rgba(255,255,255,0.12)]"
                        : "text-white/65 hover:bg-white/6"
                    }`}
                  >
                    Sign up
                  </button>
                </div>

                <button
                  type="button"
                  className="group mt-5 flex w-full items-center justify-center gap-3 rounded-[22px] border border-white/15 bg-white px-5 py-3.5 text-sm font-semibold text-black transition duration-300 hover:border-red-500/40 hover:bg-red-500 hover:text-white"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M21.8 12.23c0-.77-.07-1.51-.2-2.23H12v4.22h5.49a4.7 4.7 0 0 1-2.04 3.09v2.56h3.3c1.93-1.78 3.05-4.4 3.05-7.64Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.3-2.56c-.91.61-2.08.98-3.47.98-2.67 0-4.93-1.8-5.73-4.23H2.86v2.64A10.22 10.22 0 0 0 12 22Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M6.27 13.72A6.15 6.15 0 0 1 5.95 12c0-.6.11-1.18.32-1.72V7.64H2.86A10.22 10.22 0 0 0 1.8 12c0 1.65.4 3.22 1.06 4.36l3.41-2.64Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 6.05c1.5 0 2.84.51 3.9 1.51l2.92-2.92C17.08 2.98 14.76 2 12 2 7.95 2 4.43 4.3 2.86 7.64l3.41 2.64c.8-2.43 3.06-4.23 5.73-4.23Z"
                      />
                    </svg>
                  </span>
                  Continue with Google
                  <span className="transition-transform duration-300 group-hover:translate-x-1">↗</span>
                </button>

                <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-white/35">
                  <span className="h-px flex-1 bg-white/10" />
                  or use email
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <form className="space-y-3" onSubmit={handleSubmit}>
                  {!isLogin && (
                    <label className="block space-y-2">
                      <span className="text-[15px] font-medium text-white/88">Full name</span>
                      <input
                        type="text"
                        placeholder="Captain name"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white outline-none transition placeholder:text-white/26 focus:border-red-500/65 focus:bg-white/[0.06]"
                      />
                    </label>
                  )}

                  <label className="block space-y-2">
                    <span className="text-[15px] font-medium text-white/88">Email</span>
                    <input
                      type="email"
                      placeholder="pilot@octopilotai.com"
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white outline-none transition placeholder:text-white/26 focus:border-red-500/65 focus:bg-white/[0.06]"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-[15px] font-medium text-white/88">Password</span>
                    <input
                      type="password"
                      placeholder={isLogin ? "Enter your password" : "Choose a secure password"}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[15px] text-white outline-none transition placeholder:text-white/26 focus:border-red-500/65 focus:bg-white/[0.06]"
                    />
                  </label>

                  <button
                    type="submit"
                    className="w-full rounded-[22px] bg-red-500 px-5 py-3.5 text-[15px] font-semibold text-black shadow-[0_18px_50px_rgba(239,68,68,0.2)] transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:text-red-500 hover:shadow-[0_22px_60px_rgba(255,255,255,0.14)]"
                  >
                    {isLogin ? "Enter Octopilot" : "Launch my account"}
                  </button>
                </form>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[15px] text-white/42">
                  <span>{isLogin ? "Need an account?" : "Already registered?"}</span>
                  <button
                    type="button"
                    onClick={() => setMode(isLogin ? "signup" : "login")}
                    className="font-semibold text-red-300 transition hover:text-white"
                  >
                    {isLogin ? "Switch to signup" : "Switch to login"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
