"use client";

import { useEffect, useState } from "react";
import { AuthService } from "@/services/AuthService";
import { OctopilotAPIService } from "@/services/OctopilotAPIService";

/* ━━━ OctoCredit Store (Pricing Final v1.0) ━━━━━━━━━━━━━━━━━━━━━━━━━
 * Unified OctoCredit pricing wired to Stripe Checkout. */

type ProTerm = { key: string; label: string; price: string; unit: string; struck?: string; badge?: string };

const PRO_TERMS: ProTerm[] = [
  { key: "monthly", label: "Monthly", price: "$11.99", unit: "/ month" },
  { key: "quarterly", label: "Quarterly", price: "$24.99", unit: "/ 3 months", badge: "Save" },
  { key: "annual", label: "Annual", price: "$79.99", unit: "/ year", badge: "Best value" },
];

const TOPUPS: Array<{ key: string; oc: string; price: string }> = [
  { key: "topup_50", oc: "50", price: "$0.99" },
  { key: "topup_300", oc: "300", price: "$4.99" },
  { key: "topup_500", oc: "500", price: "$7.99" },
  { key: "topup_1000", oc: "1,000", price: "$9.99" },
  { key: "topup_2500", oc: "2,500", price: "$19.99" },
  { key: "topup_5000", oc: "5,000", price: "$39.99" },
];

function StoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
      <path d="M2 7h20" />
    </svg>
  );
}
function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function StoreButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"plans" | "topups">("plans");
  const [proTerm, setProTerm] = useState("monthly");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  const term = PRO_TERMS.find((t) => t.key === proTerm) ?? PRO_TERMS[0];

  async function checkout(payload: { kind: "subscription"; plan_key: "pro"; billing_key: string } | { kind: "addon"; addon_key: string }) {
    if (!AuthService.getCurrentUser()) { setNotice("Please sign in first to purchase."); return; }
    setNotice(null);
    setBusy(true);
    try {
      const res = await OctopilotAPIService.post<{ url: string }>("/api/v1/billing/checkout-session", payload);
      window.location.assign(res.url);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Checkout could not be started.");
      setBusy(false);
    }
  }
  const buyPro = () => checkout({ kind: "subscription", plan_key: "pro", billing_key: proTerm });
  const buyTopup = (key: string) => checkout({ kind: "addon", addon_key: key });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-red-500/25 bg-red-500/10 px-4 text-[0.82rem] font-semibold text-red-300 transition-colors duration-300 hover:border-red-500/40 hover:bg-red-500/[0.16] hover:text-red-200"
      >
        <StoreIcon />
        Store
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="relative flex max-h-[94vh] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0c] shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-[1.3rem] font-bold tracking-tight text-red-500">Octopilot Store</span>
                <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5">
                  {(["plans", "topups"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setView(v); setNotice(null); }}
                      className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold transition ${view === v ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white"}`}
                    >
                      {v === "topups" ? "Top-ups" : "Plans"}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-[0.68rem] font-medium text-neutral-300 transition hover:bg-white/10">Close</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {notice && (
                <div className="mb-5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[0.8rem] text-amber-200">{notice}</div>
              )}

              {view === "plans" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Free */}
                  <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-blue-400">Free</span>
                    <div className="mt-2 flex items-end gap-1.5">
                      <span className="text-[2rem] font-extrabold leading-none text-white">1,000</span>
                      <span className="mb-1 text-[0.85rem] font-semibold text-neutral-400">OctoCredits</span>
                    </div>
                    <p className="mt-1 text-[0.74rem] text-neutral-500">One-time grant on sign-up · no card</p>
                    <div className="mt-4 flex flex-col gap-2 text-[0.8rem] text-neutral-300">
                      {["1,000 OctoCredits (one-time)", "Cost-based usage — pay for what you use", "Full editor, Guided Generation + Writing Chamber", "PDF + DOCX export"].map((f) => (
                        <span key={f} className="flex items-center gap-2"><Check />{f}</span>
                      ))}
                    </div>
                    <button type="button" disabled className="mt-auto cursor-default rounded-full border border-white/10 bg-white/[0.03] py-2.5 text-[0.78rem] font-semibold text-neutral-500">Included with every account</button>
                  </div>

                  {/* Pro */}
                  <div className="flex flex-col rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-5">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-amber-300">Pro</span>
                    <div className="mt-2 flex items-end gap-1.5">
                      <span className="text-[2rem] font-extrabold leading-none text-white">{term.price}</span>
                      <span className="mb-1 text-[0.8rem] font-semibold text-neutral-400">{term.unit}</span>
                    </div>
                    <p className="mt-1 text-[0.74rem] text-amber-200/80">1,000 OctoCredits refilled every month</p>
                    {/* term selector */}
                    <div className="mt-3 flex rounded-full border border-white/10 bg-white/5 p-0.5">
                      {PRO_TERMS.map((t) => (
                        <button key={t.key} type="button" onClick={() => setProTerm(t.key)}
                          className={`relative flex-1 rounded-full py-1 text-[0.66rem] font-semibold transition ${proTerm === t.key ? "bg-amber-400 text-neutral-950" : "text-neutral-400 hover:text-white"}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-col gap-2 text-[0.8rem] text-neutral-300">
                      {["1,000 OctoCredits / month", "Credits refill every billing cycle", "Everything in Free", "Priority generation"].map((f) => (
                        <span key={f} className="flex items-center gap-2"><Check />{f}</span>
                      ))}
                    </div>
                    <button type="button" onClick={buyPro} disabled={busy} className="mt-auto rounded-full bg-amber-400 py-2.5 text-[0.82rem] font-bold text-neutral-950 transition hover:bg-amber-300 disabled:opacity-60">{busy ? "Opening checkout…" : `Choose Pro · ${term.label}`}</button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-4 text-[0.82rem] text-neutral-400">One-time <span className="font-semibold text-white">OctoCredit</span> top-ups — land in your account immediately. <span className="text-neutral-500">100 OctoCredits = $1 of usage.</span></p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {TOPUPS.map((p) => (
                      <button key={p.key} type="button" onClick={() => buyTopup(p.key)} disabled={busy}
                        className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-red-500/40 hover:bg-red-500/[0.04] disabled:opacity-60">
                        <span className="text-[1.5rem] font-extrabold text-white">{p.oc}</span>
                        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-neutral-500">OctoCredits</span>
                        <span className="mt-2 rounded-full bg-white/5 px-3 py-1 text-[0.78rem] font-bold text-red-400">{p.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/8 px-6 py-3 text-center text-[0.7rem] text-neutral-500">
              Cost-based pricing · you only spend OctoCredits on what you generate. Secure checkout via Stripe.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
