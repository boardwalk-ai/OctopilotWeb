"use client";

import { FormEvent, useState } from "react";

export default function AuthView() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const isLogin = mode === "login";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <main className="auth-shell relative min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-orb auth-orb-a" />
        <div className="auth-orb auth-orb-b" />
        <div className="auth-grid" />
        <div className="auth-glow-ring auth-glow-ring-a" />
        <div className="auth-glow-ring auth-glow-ring-b" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-10 lg:px-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.95fr]">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.38em] text-cyan-100/75 backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.95)]" />
              Octopilot Web
            </div>

            <div className="max-w-3xl space-y-6">
              <h1 className="max-w-3xl text-5xl font-semibold leading-[0.94] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
                Write inside a
                <span className="block bg-[linear-gradient(135deg,#8bf3ff_0%,#f6d365_48%,#f7797d_100%)] bg-clip-text text-transparent">
                  cinematic workspace.
                </span>
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Replace the old splash with a sharper front door: floating geometry, glass depth, and a login flow
                that feels closer to a product launch than a placeholder.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Depth-first UI", "Layered panels, parallax gradients, and a luminous shell."],
                ["Fast entry", "Google sign-in is promoted first so users can get in without friction."],
                ["Built to convert", "Sign in and sign up share one expressive interface instead of separate dead-end forms."],
              ].map(([title, body]) => (
                <article
                  key={title}
                  className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_25px_80px_rgba(0,0,0,0.25)]"
                >
                  <h2 className="text-sm font-semibold tracking-[0.04em] text-white">{title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="relative flex justify-center lg:justify-end">
            <div className="auth-card-stack pointer-events-none absolute inset-x-6 top-6 hidden h-[85%] lg:block" />

            <div
              className="auth-card relative w-full max-w-xl rounded-[32px] border border-white/14 bg-[linear-gradient(180deg,rgba(13,22,37,0.88),rgba(7,11,20,0.95))] p-4 shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-6"
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const px = (event.clientX - rect.left) / rect.width;
                const py = (event.clientY - rect.top) / rect.height;
                setTilt({
                  x: (py - 0.5) * -12,
                  y: (px - 0.5) * 14,
                });
              }}
              onMouseLeave={() => setTilt({ x: 0, y: 0 })}
              style={{
                transform: `perspective(1600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              }}
            >
              <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(139,243,255,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(247,121,125,0.18),transparent_32%)]" />
              <div className="relative rounded-[28px] border border-white/10 bg-black/20 p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-100/65">Portal Access</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                      {isLogin ? "Welcome back" : "Create your cockpit"}
                    </h2>
                  </div>
                  <div className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-200/80">
                    Live
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/6 p-1.5">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isLogin
                        ? "bg-white text-slate-950 shadow-[0_14px_35px_rgba(255,255,255,0.18)]"
                        : "text-slate-300 hover:bg-white/6"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      !isLogin
                        ? "bg-white text-slate-950 shadow-[0_14px_35px_rgba(255,255,255,0.18)]"
                        : "text-slate-300 hover:bg-white/6"
                    }`}
                  >
                    Sign up
                  </button>
                </div>

                <button
                  type="button"
                  className="group mt-6 flex w-full items-center justify-center gap-3 rounded-[22px] border border-white/15 bg-[linear-gradient(135deg,#ffffff_0%,#e2efff_100%)] px-5 py-4 text-sm font-semibold text-slate-950 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(226,239,255,0.22)]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
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

                <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-slate-400">
                  <span className="h-px flex-1 bg-white/10" />
                  or use email
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                  {!isLogin && (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-200">Full name</span>
                      <input
                        type="text"
                        placeholder="Captain name"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:bg-white/[0.07]"
                      />
                    </label>
                  )}

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-200">Email</span>
                    <input
                      type="email"
                      placeholder="pilot@octopilotai.com"
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:bg-white/[0.07]"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-200">Password</span>
                    <input
                      type="password"
                      placeholder={isLogin ? "Enter your password" : "Choose a secure password"}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:bg-white/[0.07]"
                    />
                  </label>

                  {!isLogin && (
                    <p className="rounded-2xl border border-cyan-300/12 bg-cyan-300/8 px-4 py-3 text-sm leading-6 text-cyan-50/85">
                      New web accounts get a cleaner entry lane with Stripe-ready billing and a browser-first workspace.
                    </p>
                  )}

                  <button
                    type="submit"
                    className="w-full rounded-[22px] bg-[linear-gradient(135deg,#7dd3fc_0%,#fca5a5_55%,#fde68a_100%)] px-5 py-4 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(125,211,252,0.2)] transition duration-300 hover:-translate-y-0.5"
                  >
                    {isLogin ? "Enter Octopilot" : "Launch my account"}
                  </button>
                </form>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                  <span>{isLogin ? "Need an account?" : "Already registered?"}</span>
                  <button
                    type="button"
                    onClick={() => setMode(isLogin ? "signup" : "login")}
                    className="font-semibold text-cyan-200 transition hover:text-white"
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
