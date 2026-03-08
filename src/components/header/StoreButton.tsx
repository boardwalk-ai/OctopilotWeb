"use client";

import { useEffect, useMemo, useState } from "react";

/* ━━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
type BillingKey = "weekly" | "monthly" | "quarterly" | "annual";
type PlanKey = "guest" | "pro" | "premium";

type BillingOption = {
  key: BillingKey;
  label: string;
  price: string;
  unit: string;
  struck?: string;
  badge?: string;
  credits: { word: string; humanizer: string; source: string };
};

type PlanDef = {
  key: PlanKey;
  name: string;
  headline: string;
  tagline: string;
  pitch: string;
  highlights: string[];
  accentHex: string;
  accentBorder: string;
  accentText: string;
  cta: string;
  disabled?: boolean;
  features: string[];
  billing?: BillingOption[];
  defaultCredits?: { word: string; humanizer: string; source: string };
};

type AddOnGroup = {
  title: string;
  description: string;
  accentText: string;
  accentHex: string;
  packs: Array<{ label: string; price: string }>;
};

/* ━━━ Data ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const plans: PlanDef[] = [
  {
    key: "guest",
    name: "Guest",
    headline: "Start writing smarter — for free.",
    tagline: "Starter access for exploring the writing flow before upgrading.",
    pitch: "Every new account gets instant access to 50 word credits, 50 humanizer credits, and 5 source credits. No credit card required — just sign up and start producing polished, citation-ready academic work.",
    highlights: ["No credit card needed", "Instant access after sign-up", "Full editor experience"],
    accentHex: "#3b82f6",
    accentBorder: "border-blue-500/50",
    accentText: "text-blue-400",
    cta: "Included with every account",
    disabled: true,
    defaultCredits: { word: "50", humanizer: "50", source: "5" },
    features: ["50 word credits", "50 humanizer credits", "5 source credits", "PDF + TXT export", "Automation mode", "Manual mode"],
  },
  {
    key: "pro",
    name: "Pro",
    headline: "Write more, worry less.",
    tagline: "Recurring credits for focused academic writing and daily productivity.",
    pitch: "Pro gives you a monthly bucket of 1 000 word and humanizer credits plus 80 source credits — enough for essays, research papers, and weekly assignments. Prices start at just $2.99/week, and the monthly plan is currently discounted.",
    highlights: ["Perfect for weekly assignments", "Save 33% on monthly billing", "Credits refresh every cycle"],
    accentHex: "#fbbf24",
    accentBorder: "border-amber-400/50",
    accentText: "text-amber-300",
    cta: "Choose Pro",
    features: ["Everything in Guest", "Up to 1 000 word credits", "Up to 1 000 humanizer credits", "80 source credits", "PDF + TXT export", "Automation + Manual"],
    billing: [
      { key: "weekly", label: "Weekly", price: "$2.99", unit: "per week", credits: { word: "500", humanizer: "500", source: "20" } },
      { key: "monthly", label: "Monthly", price: "$9.99", unit: "per month", struck: "$14.99", badge: "Discounted", credits: { word: "1000", humanizer: "1000", source: "80" } },
      { key: "quarterly", label: "Quarterly", price: "$12.99", unit: "per month", struck: "$15.99", credits: { word: "1000", humanizer: "1000", source: "80" } },
      { key: "annual", label: "Annual", price: "$9.99", unit: "per month", struck: "$16.99", credits: { word: "1000", humanizer: "1000", source: "80" } },
    ],
  },
  {
    key: "premium",
    name: "Premium",
    headline: "Unlimited ambition, massive capacity.",
    tagline: "High-volume credits for writing, source work, and heavier humanizer use.",
    pitch: "Premium delivers 3 000 word credits, 3 000 humanizer credits, and 300 source credits every cycle. Ideal for power users, thesis writers, and content teams who need to produce high-volume, citation-heavy work without ever running dry.",
    highlights: ["Built for thesis & dissertations", "6× more credits than Pro", "Best value on annual billing"],
    accentHex: "#a855f7",
    accentBorder: "border-violet-500/50",
    accentText: "text-violet-300",
    cta: "Choose Premium",
    features: ["Everything in Guest", "3 000 word credits", "3 000 humanizer credits", "300 source credits", "PDF + TXT export", "Automation + Manual"],
    billing: [
      { key: "monthly", label: "Monthly", price: "$24.99", unit: "per month", struck: "$29.99", credits: { word: "3000", humanizer: "3000", source: "300" } },
      { key: "quarterly", label: "Quarterly", price: "$22.99", unit: "per month", struck: "$32.99", credits: { word: "3000", humanizer: "3000", source: "300" } },
      { key: "annual", label: "Annual", price: "$19.99", unit: "per month", struck: "$34.99", credits: { word: "3000", humanizer: "3000", source: "300" } },
    ],
  },
];

const addOnGroups: AddOnGroup[] = [
  {
    title: "Word Credits",
    description: "Power your AI writer with extra word credits. Each credit covers 10 words of generated content — perfect for topping up before deadlines.",
    accentText: "text-rose-400",
    accentHex: "#fb7185",
    packs: [
      { label: "1K word credits", price: "$0.99" },
      { label: "2.5K word credits", price: "$1.99" },
      { label: "7.5K word credits", price: "$4.99" },
    ],
  },
  {
    title: "Humanizer Credits",
    description: "Make AI-generated text undetectable. Each humanizer credit covers 10 words of humanization — essential for academic submissions.",
    accentText: "text-violet-300",
    accentHex: "#c4b5fd",
    packs: [
      { label: "100 humanizer credits", price: "$0.99" },
      { label: "300 humanizer credits", price: "$1.99" },
      { label: "1K humanizer credits", price: "$4.99" },
    ],
  },
  {
    title: "Source Credits",
    description: "Add real, credible citations to your work. One source credit fetches one verified academic source to strengthen your arguments.",
    accentText: "text-sky-400",
    accentHex: "#38bdf8",
    packs: [
      { label: "50 source credits", price: "$0.99" },
      { label: "150 source credits", price: "$1.99" },
      { label: "450 source credits", price: "$4.99" },
    ],
  },
];

/* ━━━ Icons ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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

function Check({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ━━━ Component ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function StoreButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"plans" | "addons">("plans");
  const [activePlan, setActivePlan] = useState<PlanKey>("pro");
  const [selectedBilling, setSelectedBilling] = useState<Record<PlanKey, BillingKey>>({
    guest: "monthly",
    pro: "monthly",
    premium: "monthly",
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  const plan = useMemo(() => {
    const p = plans.find((x) => x.key === activePlan)!;
    const ab = p.billing?.find((o) => o.key === selectedBilling[p.key]) ?? p.billing?.[0];
    const credits = ab?.credits ?? p.defaultCredits ?? { word: "0", humanizer: "0", source: "0" };
    return { ...p, activeBilling: ab, credits };
  }, [activePlan, selectedBilling]);

  const hasBilling = !!plan.billing?.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:border-red-500/50 hover:bg-red-500/10"
      >
        <StoreIcon />
        Store
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="relative flex max-h-[94vh] w-full max-w-[1060px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0c] shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Top bar ── */}
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-[1.3rem] font-bold tracking-tight text-red-500">
                  Octopilot Store
                </span>
                <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5">
                  {(["plans", "addons"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold transition ${view === v ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white"
                        }`}
                    >
                      {v === "addons" ? "Add-ons" : "Plans"}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-[0.68rem] font-medium text-neutral-300 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto">
              {view === "plans" ? (
                <div className="flex flex-col">
                  {/* Plan tabs */}
                  <div className="flex border-b border-white/8">
                    {plans.map((p) => {
                      const active = p.key === activePlan;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setActivePlan(p.key)}
                          className="relative flex-1 py-3 text-center text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition"
                          style={{ color: active ? p.accentHex : "rgb(115,115,115)" }}
                        >
                          {p.name}
                          {active && (
                            <span
                              className="absolute inset-x-0 bottom-0 h-[2px]"
                              style={{ background: p.accentHex }}
                            />
                          )}
                          {p.key === "pro" && (
                            <span className="ml-1.5 inline-block rounded-full bg-red-500 px-1.5 py-px align-middle text-[0.48rem] font-bold uppercase tracking-wide text-white">
                              Sale
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active plan detail — two-column with animation */}
                  <div
                    key={activePlan}
                    className="flex animate-[fadeSlideIn_0.3s_ease-out] flex-col gap-6 p-6 md:flex-row md:gap-8"
                  >
                    {/* Left: marketing copy */}
                    <div className="flex flex-col md:w-[45%]">
                      <h3 className="text-[1.35rem] font-bold leading-tight tracking-tight text-white">{plan.headline}</h3>
                      <p className="mt-2 text-[0.84rem] leading-relaxed text-neutral-400">{plan.tagline}</p>
                      <p className="mt-3 text-[0.82rem] leading-[1.65] text-neutral-500">{plan.pitch}</p>

                      {/* Highlights */}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {plan.highlights.map((h) => (
                          <span key={h} className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[0.68rem] font-medium text-neutral-400">
                            {h}
                          </span>
                        ))}
                      </div>

                      {/* Features */}
                      <div className="mt-5">
                        <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-neutral-500">What&apos;s included</p>
                        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                          {plan.features.map((f) => (
                            <div key={f} className="flex items-start gap-1.5 text-[0.78rem] leading-snug text-neutral-300">
                              <span className="mt-0.5 shrink-0"><Check color={plan.accentHex} /></span>
                              <span>{f}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Why Octopilot */}
                      <div className="mt-5 rounded-xl border border-white/6 bg-white/[0.02] p-4">
                        <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-neutral-500">Why Octopilot?</p>
                        <p className="mt-2 text-[0.78rem] leading-[1.6] text-neutral-500">
                          AI-powered academic writing with built-in humanizer to keep your work undetectable. Add real citations from credible sources, export to PDF or TXT, and switch between automation and manual control.
                        </p>
                      </div>
                    </div>

                    {/* Right: pricing card */}
                    <div className="flex flex-1 flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                      {/* Billing toggle */}
                      {hasBilling ? (
                        <div className="flex flex-wrap gap-1.5">
                          {plan.billing!.map((opt) => {
                            const on = opt.key === plan.activeBilling?.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => setSelectedBilling((c) => ({ ...c, [plan.key]: opt.key }))}
                                className={`rounded-full border px-3.5 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] transition ${on
                                  ? "border-white/20 bg-white text-neutral-950"
                                  : "border-white/8 bg-white/[0.04] text-neutral-500 hover:border-white/20 hover:text-white"
                                  }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[0.7rem] font-medium uppercase tracking-wider text-neutral-500">Default plan</p>
                      )}

                      {/* Price */}
                      <div className="mt-4">
                        {hasBilling && plan.activeBilling ? (
                          <>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[2.6rem] font-bold tracking-tight text-white">{plan.activeBilling.price}</span>
                              <span className="text-[0.88rem] text-white/50">{plan.activeBilling.unit}</span>
                            </div>
                            {(plan.activeBilling.struck || plan.activeBilling.badge) && (
                              <div className="mt-0.5 flex items-center gap-2">
                                {plan.activeBilling.struck && <span className="text-sm text-white/30 line-through">{plan.activeBilling.struck}</span>}
                                {plan.activeBilling.badge && <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-red-400">{plan.activeBilling.badge}</span>}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[2.6rem] font-bold tracking-tight text-white">Guest</span>
                            <span className="text-[0.88rem] text-white/50">free access</span>
                          </div>
                        )}
                      </div>

                      {/* Credits */}
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {[
                          { label: "Word", value: plan.credits.word },
                          { label: "Humanizer", value: plan.credits.humanizer },
                          { label: "Source", value: plan.credits.source },
                        ].map((c) => (
                          <div
                            key={c.label}
                            className="flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3"
                          >
                            <span className="text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-white/40">{c.label}</span>
                            <span className="mt-1 text-xl font-bold leading-none text-white">{c.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* CTA */}
                      <button
                        type="button"
                        disabled={plan.disabled}
                        className={`mt-5 w-full rounded-full py-3 text-[0.82rem] font-semibold tracking-wide transition ${plan.disabled
                          ? "cursor-not-allowed border border-white/8 bg-white/[0.04] text-neutral-500"
                          : "text-neutral-950 hover:opacity-90"
                          }`}
                        style={!plan.disabled ? { background: plan.accentHex } : undefined}
                      >
                        {plan.cta}
                      </button>

                      {/* Bottom note */}
                      <p className="mt-2.5 text-center text-[0.65rem] text-neutral-600">
                        {plan.disabled ? "Included with every account" : "Cancel or switch plans anytime"}
                      </p>

                      {/* Trust signals */}
                      <div className="mt-4 border-t border-white/6 pt-4">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1.5 text-[0.68rem] text-neutral-500">
                            <span className="text-green-400">✓</span> Secure Stripe checkout
                          </div>
                          <div className="flex items-center gap-1.5 text-[0.68rem] text-neutral-500">
                            <span className="text-green-400">✓</span> Instant activation
                          </div>
                          <div className="flex items-center gap-1.5 text-[0.68rem] text-neutral-500">
                            <span className="text-green-400">✓</span> No hidden fees
                          </div>
                          <div className="flex items-center gap-1.5 text-[0.68rem] text-neutral-500">
                            <span className="text-green-400">✓</span> Switch plans anytime
                          </div>
                        </div>
                      </div>

                      {/* Extra info */}
                      <div className="mt-4 rounded-xl border border-white/6 bg-white/[0.02] p-3">
                        <p className="text-[0.68rem] leading-[1.6] text-neutral-500">
                          Credits refresh at the start of each billing cycle. Unused credits do not roll over. Need more mid-cycle? Grab an add-on pack from the Add-ons tab.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Add-ons ── */
                <div className="animate-[fadeSlideIn_0.3s_ease-out] p-6">
                  {/* Header */}
                  <div>
                    <h3 className="text-[1.3rem] font-bold tracking-tight text-white">Top up credits instantly</h3>
                    <p className="mt-1.5 text-[0.82rem] leading-relaxed text-neutral-400">
                      Running low before your next cycle? Add-on packs are one-time purchases that land in your account immediately.
                    </p>
                  </div>

                  <div className="mt-5 space-y-5">
                    {addOnGroups.map((group) => (
                      <div key={group.title}>
                        <div className="flex items-baseline justify-between">
                          <p className={`text-[0.62rem] font-bold uppercase tracking-[0.22em] ${group.accentText}`}>{group.title}</p>
                          <p className="text-[0.62rem] text-neutral-600">{group.description.split('.')[0]}.</p>
                        </div>
                        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                          {group.packs.map((pack) => (
                            <div key={pack.label} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-[0.8rem] font-semibold text-white">{pack.label}</span>
                                <span className="text-[0.62rem] text-neutral-600">One-time purchase</span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <span className="text-base font-bold text-white">{pack.price}</span>
                                <button
                                  type="button"
                                  className="rounded-full px-3.5 py-1.5 text-[0.65rem] font-semibold transition hover:opacity-90"
                                  style={{ background: group.accentHex, color: '#0c0c0c' }}
                                >
                                  Buy
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bottom info row */}
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
                    <div className="flex-1 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
                      <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-neutral-500">How it works</p>
                      <p className="mt-1.5 text-[0.72rem] leading-[1.55] text-neutral-500">One-time payments that deposit credits instantly. They stack on top of your plan&apos;s allocation and never expire.</p>
                    </div>
                    <div className="flex-1 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
                      <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-neutral-500">Who it&apos;s for</p>
                      <p className="mt-1.5 text-[0.72rem] leading-[1.55] text-neutral-500">Students with tight deadlines, researchers on multiple papers, or anyone who needs a quick refill without switching plans.</p>
                    </div>
                    <div className="flex-1 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
                      <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-neutral-500">Payment</p>
                      <p className="mt-1.5 text-[0.72rem] leading-[1.55] text-neutral-500">All purchases are processed securely via Stripe. No recurring charges — buy only when you need to.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
