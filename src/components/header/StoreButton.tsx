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
  accent: string;
  accentText: string;
  blurb: string;
  cta: string;
  disabled?: boolean;
  guestInclusions?: boolean;
  features: string[];
  billing?: BillingOption[];
};

type AddOnGroup = {
  title: string;
  accent: string;
  packs: Array<{
    label: string;
    price: string;
  }>;
};

const planCards: PlanCard[] = [
  {
    key: "guest",
    name: "Guest Plan",
    accent: "border-blue-500/70",
    accentText: "text-blue-400",
    blurb: "Best for first-time users who want to explore the workflow before upgrading.",
    cta: "Free forever",
    disabled: true,
    features: [
      "50 word credits",
      "50 humanizer credits",
      "5 source credits",
      "Free PDF export",
      "Free TXT export",
      "Automation mode",
      "Manual mode",
    ],
  },
  {
    key: "pro",
    name: "Pro Plan",
    accent: "border-amber-400/70",
    accentText: "text-amber-300",
    blurb: "For focused academic writing with recurring credits and practical automation.",
    cta: "Choose Pro",
    guestInclusions: true,
    features: [
      "1000 word credits",
      "1000 humanizer credits",
      "80 source credits",
      "Free PDF export",
      "Free TXT export",
      "Automation mode",
      "Manual mode",
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
    accent: "border-violet-500/70",
    accentText: "text-violet-300",
    blurb: "For heavy-volume writing, source work, and premium humanizer usage every month.",
    cta: "Choose Premium",
    guestInclusions: true,
    features: [
      "3000 word credits",
      "3000 humanizer credits",
      "300 source credits",
      "Free PDF export",
      "Free TXT export",
      "Automation mode",
      "Manual mode",
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
    accent: "text-rose-600",
    packs: [
      { label: "1K word credits", price: "$0.99" },
      { label: "2.5K word credits", price: "$1.99" },
      { label: "7.5K word credits", price: "$4.99" },
    ],
  },
  {
    title: "Humanizer Credits",
    accent: "text-violet-600",
    packs: [
      { label: "100 humanizer credits", price: "$0.99" },
      { label: "300 humanizer credits", price: "$1.99" },
      { label: "1K humanizer credits", price: "$4.99" },
    ],
  },
  {
    title: "Source Credits",
    accent: "text-sky-600",
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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="relative flex h-[88vh] w-full max-w-[1680px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#090909] shadow-[0_40px_120px_rgba(0,0,0,0.58)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_24%),#090909] px-6 py-5 sm:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-neutral-400">
                    Octopilot Store
                  </div>
                  <h2 className="text-[2.15rem] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[2.5rem]">
                    Pick a plan, then layer in credits only when you need them.
                  </h2>
                  <p className="mt-2 max-w-2xl text-[0.92rem] leading-6 text-neutral-400">
                    Clean subscription tiers for recurring access, plus add-on packs for moments when your monthly bucket runs dry before refresh.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-medium text-neutral-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => setTab("plans")}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "plans" ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white"}`}
                  >
                    Plans
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("addons")}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${tab === "addons" ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white"}`}
                  >
                    Add-on Store
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {creditRules.map((rule) => (
                    <span key={rule} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.78rem] font-medium text-neutral-400">
                      {rule}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-6 py-5 sm:px-8">
              {tab === "plans" ? (
                <div className="grid h-full gap-4 xl:grid-cols-3">
                  {renderedPlanCards.map((plan) => (
                    <section
                      key={plan.key}
                      className={`relative overflow-hidden rounded-[28px] border bg-[#101010] shadow-[0_18px_50px_rgba(0,0,0,0.28)] ${plan.accent}`}
                    >
                      <div className="relative flex h-full flex-col p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${plan.accentText}`}>
                              {plan.name}
                            </p>
                            <p className="mt-2 line-clamp-3 text-[0.92rem] leading-7 text-neutral-400">{plan.blurb}</p>
                          </div>
                          {plan.activeBilling?.badge ? (
                            <span className="rounded-full bg-red-500 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white">
                              {plan.activeBilling.badge}
                            </span>
                          ) : null}
                        </div>

                        {plan.billing?.length ? (
                          <div className="mt-4 inline-flex flex-wrap gap-2 rounded-[20px] border border-white/8 bg-white/[0.04] p-2">
                            {plan.billing.map((option) => {
                              const active = option.key === plan.activeBilling?.key;
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => setSelectedBilling((current) => ({ ...current, [plan.key]: option.key }))}
                                  className={`rounded-2xl px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition ${
                                    active
                                      ? "bg-white text-neutral-950 shadow-[0_10px_25px_rgba(0,0,0,0.18)]"
                                      : "bg-transparent text-neutral-500 hover:text-white"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="mt-4 rounded-[24px] border border-white/8 bg-[#141414] px-4 py-4 text-white">
                          {plan.activeBilling ? (
                            <>
                              <div className="flex items-end gap-2">
                                <span className="text-[2.15rem] font-semibold tracking-[-0.05em]">{plan.activeBilling.price}</span>
                                <span className="pb-1 text-[0.92rem] text-white/60">{plan.activeBilling.unit}</span>
                              </div>
                              {plan.activeBilling.struck ? (
                                <p className="mt-1 text-[0.92rem] text-white/45 line-through">{plan.activeBilling.struck}</p>
                              ) : (
                                <p className="mt-1 text-[0.92rem] text-white/45">{plan.disabled ? "Included by default on signup" : "Recurring Stripe subscription"}</p>
                              )}

                              <div className="mt-4 grid grid-cols-3 gap-2.5">
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                                  <p className="text-[0.6rem] uppercase tracking-[0.18em] text-white/45">Word</p>
                                  <p className="mt-2 text-[1.6rem] font-semibold leading-none">{plan.activeBilling.credits.word}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                                  <p className="text-[0.57rem] uppercase tracking-[0.12em] text-white/45">Humanizer</p>
                                  <p className="mt-2 text-[1.6rem] font-semibold leading-none">{plan.activeBilling.credits.humanizer}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                                  <p className="text-[0.6rem] uppercase tracking-[0.18em] text-white/45">Source</p>
                                  <p className="mt-2 text-[1.6rem] font-semibold leading-none">{plan.activeBilling.credits.source}</p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-end gap-2">
                                <span className="text-[2.15rem] font-semibold tracking-[-0.05em]">Free</span>
                                <span className="pb-1 text-[0.92rem] text-white/60">default access</span>
                              </div>
                              <p className="mt-2 text-[0.92rem] text-white/45">Starter access assigned automatically when a new user signs in.</p>
                              <div className="mt-4 grid grid-cols-3 gap-2.5">
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                                  <p className="text-[0.6rem] uppercase tracking-[0.18em] text-white/45">Word</p>
                                  <p className="mt-2 text-[1.6rem] font-semibold leading-none">50</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                                  <p className="text-[0.57rem] uppercase tracking-[0.12em] text-white/45">Humanizer</p>
                                  <p className="mt-2 text-[1.6rem] font-semibold leading-none">50</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                                  <p className="text-[0.6rem] uppercase tracking-[0.18em] text-white/45">Source</p>
                                  <p className="mt-2 text-[1.6rem] font-semibold leading-none">5</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="mt-4 flex-1 space-y-2.5">
                          {plan.guestInclusions ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-2.5 text-[0.88rem] text-neutral-400">
                              Everything in Guest Plan, plus recurring credit refreshes.
                            </div>
                          ) : null}
                          <div className="grid gap-2 sm:grid-cols-2">
                            {plan.features.map((feature) => (
                              <div key={feature} className="flex items-start gap-2.5 text-[0.88rem] leading-6 text-neutral-300">
                                <span className={`mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${plan.accent} ${plan.accentText}`}>
                                  <CheckIcon />
                                </span>
                                <span>{feature}</span>
                              </div>
                            ))}
                          </div>
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
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="grid h-full gap-4 xl:grid-cols-[1.2fr_1.2fr_1.2fr_0.9fr]">
                  {addOnGroups.map((group) => (
                    <section key={group.title} className="rounded-[28px] border border-white/8 bg-[#101010] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
                      <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${group.accent}`}>{group.title}</p>
                      <div className="mt-5 space-y-3">
                        {group.packs.map((pack) => (
                          <div key={pack.label} className="rounded-2xl border border-white/8 bg-white/[0.04] p-3.5">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-white">{pack.label}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-500">One-time credit top-up</p>
                              </div>
                              <p className="text-xl font-semibold tracking-[-0.04em] text-white">{pack.price}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}

                  <aside className="rounded-[28px] border border-white/8 bg-[#101010] p-5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">How add-ons work</p>
                    <div className="mt-5 space-y-4 text-sm leading-6 text-white/72">
                      <p>Add-ons are one-time purchases. They sit on top of your subscription bucket and are ideal when your refresh date is still far away.</p>
                      <p>Use subscriptions for predictable monthly access. Use add-ons when you only need a quick credit refill.</p>
                    </div>
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/45">Stripe mapping</p>
                      <p className="mt-3 text-sm leading-6 text-white/75">Each pack should be a separate one-time Stripe Price. Subscriptions should use recurring Prices.</p>
                    </div>
                  </aside>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
