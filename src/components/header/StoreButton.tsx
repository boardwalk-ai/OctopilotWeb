"use client";

import { useEffect, useMemo, useState } from "react";

type BillingKey = "weekly" | "monthly" | "quarterly" | "annual";
type PlanKey = "guest" | "pro" | "premium";

type BillingOption = {
  key: BillingKey;
  label: string;
  price: string;
  unit: string;
  struck?: string;
  badge?: string;
  credits: {
    word: string;
    humanizer: string;
    source: string;
  };
};

type PlanCard = {
  key: PlanKey;
  name: string;
  accentBorder: string;
  accentText: string;
  accentGlow: string;
  description: string;
  cta: string;
  disabled?: boolean;
  summary: string[];
  billing?: BillingOption[];
};

type AddOnGroup = {
  title: string;
  accentText: string;
  packs: Array<{
    label: string;
    price: string;
  }>;
};

const planCards: PlanCard[] = [
  {
    key: "guest",
    name: "Guest Plan",
    accentBorder: "border-blue-500/60",
    accentText: "text-blue-400",
    accentGlow: "shadow-[0_0_0_1px_rgba(59,130,246,0.15)]",
    description: "Starter access for exploring the writing flow before upgrading.",
    cta: "Free forever",
    disabled: true,
    summary: [
      "50 word credits",
      "50 humanizer credits",
      "5 source credits",
      "PDF + TXT export",
      "Automation mode",
      "Manual mode",
    ],
  },
  {
    key: "pro",
    name: "Pro Plan",
    accentBorder: "border-amber-400/60",
    accentText: "text-amber-300",
    accentGlow: "shadow-[0_0_0_1px_rgba(251,191,36,0.14)]",
    description: "Recurring credits for focused academic writing and daily productivity.",
    cta: "Choose Pro",
    summary: [
      "Everything in Guest",
      "1000 word credits",
      "1000 humanizer credits",
      "80 source credits",
      "PDF + TXT export",
      "Automation + Manual",
    ],
    billing: [
      {
        key: "weekly",
        label: "Weekly",
        price: "$2.99",
        unit: "per week",
        credits: { word: "500", humanizer: "500", source: "20" },
      },
      {
        key: "monthly",
        label: "Monthly",
        price: "$9.99",
        unit: "per month",
        struck: "$14.99",
        badge: "Discounted",
        credits: { word: "1000", humanizer: "1000", source: "80" },
      },
      {
        key: "quarterly",
        label: "Quarterly",
        price: "$12.99",
        unit: "per month",
        struck: "$15.99",
        credits: { word: "1000", humanizer: "1000", source: "80" },
      },
      {
        key: "annual",
        label: "Annual",
        price: "$9.99",
        unit: "per month",
        struck: "$16.99",
        credits: { word: "1000", humanizer: "1000", source: "80" },
      },
    ],
  },
  {
    key: "premium",
    name: "Premium Plan",
    accentBorder: "border-violet-500/60",
    accentText: "text-violet-300",
    accentGlow: "shadow-[0_0_0_1px_rgba(168,85,247,0.14)]",
    description: "High-volume credits for writing, source work, and heavier humanizer use.",
    cta: "Choose Premium",
    summary: [
      "Everything in Guest",
      "3000 word credits",
      "3000 humanizer credits",
      "300 source credits",
      "PDF + TXT export",
      "Automation + Manual",
    ],
    billing: [
      {
        key: "monthly",
        label: "Monthly",
        price: "$24.99",
        unit: "per month",
        struck: "$29.99",
        credits: { word: "3000", humanizer: "3000", source: "300" },
      },
      {
        key: "quarterly",
        label: "Quarterly",
        price: "$22.99",
        unit: "per month",
        struck: "$32.99",
        credits: { word: "3000", humanizer: "3000", source: "300" },
      },
      {
        key: "annual",
        label: "Annual",
        price: "$19.99",
        unit: "per month",
        struck: "$34.99",
        credits: { word: "3000", humanizer: "3000", source: "300" },
      },
    ],
  },
];

const addOnGroups: AddOnGroup[] = [
  {
    title: "Word Credits",
    accentText: "text-rose-400",
    packs: [
      { label: "1K word credits", price: "$0.99" },
      { label: "2.5K word credits", price: "$1.99" },
      { label: "7.5K word credits", price: "$4.99" },
    ],
  },
  {
    title: "Humanizer Credits",
    accentText: "text-violet-300",
    packs: [
      { label: "100 humanizer credits", price: "$0.99" },
      { label: "300 humanizer credits", price: "$1.99" },
      { label: "1K humanizer credits", price: "$4.99" },
    ],
  },
  {
    title: "Source Credits",
    accentText: "text-sky-400",
    packs: [
      { label: "50 source credits", price: "$0.99" },
      { label: "150 source credits", price: "$1.99" },
      { label: "450 source credits", price: "$4.99" },
    ],
  },
];

const creditRules = [
  "10 words = 1 word credit",
  "10 words = 1 humanizer credit",
  "1 source = 1 source credit",
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

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function StoreButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"plans" | "addons">("plans");
  const [selectedBilling, setSelectedBilling] = useState<Record<PlanKey, BillingKey>>({
    guest: "monthly",
    pro: "monthly",
    premium: "monthly",
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const renderedPlanCards = useMemo(
    () =>
      planCards.map((plan) => {
        const activeBilling = plan.billing?.find((option) => option.key === selectedBilling[plan.key]) ?? plan.billing?.[0];
        return { ...plan, activeBilling };
      }),
    [selectedBilling]
  );

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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="relative flex h-[88vh] w-full max-w-[1640px] overflow-hidden rounded-[30px] border border-white/10 bg-[#090909] shadow-[0_40px_120px_rgba(0,0,0,0.58)]"
            onClick={(event) => event.stopPropagation()}
          >
            <aside className="hidden w-[300px] shrink-0 border-r border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.14),transparent_32%),#0b0b0b] px-7 py-7 xl:flex xl:flex-col">
              <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-neutral-400">
                Octopilot Store
              </div>

              <div className="mt-6">
                <h2 className="text-[2rem] font-semibold leading-[0.98] tracking-[-0.05em] text-white">
                  Upgrade only when the workload demands it.
                </h2>
                <p className="mt-4 text-[0.92rem] leading-6 text-neutral-400">
                  Pick a recurring plan for monthly access, then use add-ons only when your bucket needs a quick refill.
                </p>
              </div>

              <div className="mt-7 inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setTab("plans")}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${tab === "plans" ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white"}`}
                >
                  Plans
                </button>
                <button
                  type="button"
                  onClick={() => setTab("addons")}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${tab === "addons" ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white"}`}
                >
                  Add-ons
                </button>
              </div>

              <div className="mt-6 space-y-2">
                {creditRules.map((rule) => (
                  <div key={rule} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[0.84rem] text-neutral-400">
                    {rule}
                  </div>
                ))}
              </div>

              <div className="mt-auto rounded-[24px] border border-white/8 bg-[#121212] p-5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-neutral-500">Stripe mapping</p>
                <p className="mt-3 text-[0.88rem] leading-6 text-neutral-400">
                  Recurring plans should map to Stripe subscription prices. Add-on packs should map to one-time payment prices.
                </p>
              </div>
            </aside>

            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="flex items-start justify-between border-b border-white/8 px-6 py-5 xl:hidden">
                <div>
                  <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-neutral-400">
                    Octopilot Store
                  </div>
                  <h2 className="mt-4 max-w-3xl text-[2rem] font-semibold leading-[1.02] tracking-[-0.05em] text-white">
                    Pick a plan, then layer in credits only when you need them.
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-medium text-neutral-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="hidden justify-end border-b border-white/8 px-6 py-5 xl:flex">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-medium text-neutral-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="h-full overflow-y-auto px-6 py-5">
                {tab === "plans" ? (
                  <div className="grid gap-4 xl:h-full xl:grid-cols-3">
                    {renderedPlanCards.map((plan) => (
                      <section
                        key={plan.key}
                        className={`flex h-full flex-col rounded-[28px] border bg-[#101010] p-5 ${plan.accentBorder} ${plan.accentGlow}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${plan.accentText}`}>{plan.name}</p>
                            <p className="mt-3 text-[0.95rem] leading-7 text-neutral-400">{plan.description}</p>
                          </div>
                          {plan.key === "pro" ? (
                            <span className="rounded-full bg-red-500 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white">
                              Discounted
                            </span>
                          ) : null}
                        </div>

                        {plan.billing?.length ? (
                          <div className="mt-5 grid grid-cols-2 gap-2 rounded-[22px] border border-white/8 bg-white/[0.03] p-2">
                            {plan.billing.map((option) => {
                              const active = option.key === plan.activeBilling?.key;
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => setSelectedBilling((current) => ({ ...current, [plan.key]: option.key }))}
                                  className={`rounded-2xl px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition ${
                                    active ? "bg-white text-neutral-950" : "bg-transparent text-neutral-500 hover:text-white"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="mt-5 rounded-[24px] border border-white/8 bg-[#151515] px-4 py-4">
                          {plan.billing?.length && plan.activeBilling ? (
                            <>
                              <div className="flex items-end gap-2">
                                <span className="text-[2.3rem] font-semibold tracking-[-0.05em] text-white">{plan.activeBilling.price}</span>
                                <span className="pb-1 text-[0.92rem] text-white/60">{plan.activeBilling.unit}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-3">
                                {plan.activeBilling.struck ? (
                                  <span className="text-[0.92rem] text-white/40 line-through">{plan.activeBilling.struck}</span>
                                ) : null}
                                {plan.activeBilling.badge ? (
                                  <span className="text-[0.78rem] uppercase tracking-[0.18em] text-red-400">{plan.activeBilling.badge}</span>
                                ) : null}
                              </div>

                              <div className="mt-4 grid grid-cols-3 gap-2.5">
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
                                  <p className="text-[0.62rem] uppercase tracking-[0.14em] text-white/42">Word</p>
                                  <p className="mt-2 text-[1.55rem] font-semibold leading-none text-white">{plan.activeBilling.credits.word}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
                                  <p className="text-[0.58rem] uppercase tracking-[0.08em] text-white/42">Humanizer</p>
                                  <p className="mt-2 text-[1.55rem] font-semibold leading-none text-white">{plan.activeBilling.credits.humanizer}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
                                  <p className="text-[0.62rem] uppercase tracking-[0.14em] text-white/42">Source</p>
                                  <p className="mt-2 text-[1.55rem] font-semibold leading-none text-white">{plan.activeBilling.credits.source}</p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-end gap-2">
                                <span className="text-[2.3rem] font-semibold tracking-[-0.05em] text-white">Free</span>
                                <span className="pb-1 text-[0.92rem] text-white/60">default access</span>
                              </div>
                              <p className="mt-2 text-[0.92rem] text-white/45">Assigned automatically to every new account.</p>

                              <div className="mt-4 grid grid-cols-3 gap-2.5">
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
                                  <p className="text-[0.62rem] uppercase tracking-[0.14em] text-white/42">Word</p>
                                  <p className="mt-2 text-[1.55rem] font-semibold leading-none text-white">50</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
                                  <p className="text-[0.58rem] uppercase tracking-[0.08em] text-white/42">Humanizer</p>
                                  <p className="mt-2 text-[1.55rem] font-semibold leading-none text-white">50</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
                                  <p className="text-[0.62rem] uppercase tracking-[0.14em] text-white/42">Source</p>
                                  <p className="mt-2 text-[1.55rem] font-semibold leading-none text-white">5</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={plan.disabled}
                          className={`mt-4 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition ${
                            plan.disabled
                              ? "cursor-not-allowed border border-white/8 bg-white/[0.04] text-neutral-500"
                              : "bg-white text-neutral-950 hover:bg-neutral-200"
                          }`}
                        >
                          {plan.cta}
                        </button>

                        <div className="mt-4 grid flex-1 gap-x-3 gap-y-2 sm:grid-cols-2">
                          {plan.summary.map((item) => (
                            <div key={item} className="flex items-start gap-2 text-[0.82rem] leading-5 text-neutral-300">
                              <span className={`mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${plan.accentBorder} ${plan.accentText}`}>
                                <CheckIcon />
                              </span>
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 xl:h-full xl:grid-cols-[1fr_1fr_1fr_320px]">
                    {addOnGroups.map((group) => (
                      <section key={group.title} className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
                        <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${group.accentText}`}>{group.title}</p>
                        <div className="mt-5 space-y-3">
                          {group.packs.map((pack) => (
                            <div key={pack.label} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                              <p className="text-[0.95rem] font-semibold text-white">{pack.label}</p>
                              <div className="mt-3 flex items-end justify-between gap-3">
                                <p className="text-[0.82rem] uppercase tracking-[0.16em] text-neutral-500">One-time pack</p>
                                <p className="text-2xl font-semibold tracking-[-0.04em] text-white">{pack.price}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}

                    <aside className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">How add-ons work</p>
                      <div className="mt-5 space-y-4 text-[0.9rem] leading-6 text-neutral-400">
                        <p>Add-ons are one-time payments. They are meant for users who need extra credits before their next refresh cycle lands.</p>
                        <p>Subscriptions should be recurring Stripe Prices. Add-ons should be one-time Stripe Prices.</p>
                      </div>
                    </aside>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
