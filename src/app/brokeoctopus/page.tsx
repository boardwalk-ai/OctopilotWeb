"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type MenuItem = {
  id: string;
  label: string;
  description: string;
  icon: JSX.Element;
};

type TableSection = {
  id: string;
  title: string;
  subtitle: string;
  columns: string[];
  rows: string[][];
  badge?: string;
};

const menuItems: MenuItem[] = [
  { id: "user-management", label: "User Management", description: "Accounts, status, and roles", icon: <UsersIcon /> },
  { id: "subscription-management", label: "Subscription Management", description: "Plans, billing, and credits", icon: <CreditCardIcon /> },
  { id: "reports", label: "Reports", description: "Support and issue intake", icon: <FlagIcon /> },
  { id: "metadata", label: "Metadata", description: "Sessions and activity health", icon: <ClockIcon /> },
  { id: "market-data", label: "Market Data", description: "Customer footprint snapshot", icon: <GlobeIcon /> },
  { id: "purchase-history", label: "Purchase History", description: "Plan timeline and changes", icon: <ReceiptIcon /> },
  { id: "promo-area", label: "Promo Area", description: "Implement later", icon: <TagIcon /> },
  { id: "api-keys", label: "API Keys", description: "Key pool from database", icon: <KeyIcon /> },
  { id: "usage-tracking", label: "Usage Tracking", description: "Session count and operator actions", icon: <ChartIcon /> },
  { id: "analytics", label: "Analytics", description: "Performance and growth trends", icon: <PulseIcon /> },
  { id: "system-settings", label: "System Settings", description: "Implement later", icon: <SettingsIcon /> },
];

const sections: TableSection[] = [
  {
    id: "user-management",
    title: "User Management",
    subtitle: "Access control and account health.",
    columns: ["No", "Name", "Email", "Status", "Role", "Actions"],
    rows: [
      ["01", "Shun Lae", "lucastobyshelby@gmail.com", "Active", "Admin", "View / Suspend"],
      ["02", "Mia Carter", "mia@octopilot.ai", "Pending", "Member", "Verify / Promote"],
      ["03", "Noah King", "noah@writerlab.com", "Disabled", "Member", "Restore / Delete"],
    ],
  },
  {
    id: "subscription-management",
    title: "Subscription Management",
    subtitle: "Stripe-side plans and credit balances.",
    columns: ["No", "Name", "Email", "Next Billing", "Current Plan", "Word", "Humanizer", "Source", "Actions"],
    rows: [
      ["01", "Shun Lae", "lucastobyshelby@gmail.com", "Mar 29, 2026", "Pro", "120k", "45", "18", "Edit / Cancel"],
      ["02", "Mia Carter", "mia@octopilot.ai", "Mar 18, 2026", "Starter", "30k", "8", "6", "Upgrade / Pause"],
      ["03", "Noah King", "noah@writerlab.com", "Expired", "Free", "5k", "0", "1", "Renew / Lock"],
    ],
  },
  {
    id: "reports",
    title: "Reports",
    subtitle: "Triage recent issues and moderation flags.",
    columns: ["No", "Email", "Status", "Timestamp", "Action"],
    rows: [
      ["01", "lucastobyshelby@gmail.com", "Open", "07 Mar 2026 16:28", "Review"],
      ["02", "mia@octopilot.ai", "Resolved", "07 Mar 2026 14:02", "Archive"],
      ["03", "noah@writerlab.com", "Escalated", "07 Mar 2026 11:47", "Assign"],
    ],
    badge: "7 Open",
  },
  {
    id: "metadata",
    title: "Metadata",
    subtitle: "Session heartbeat and runtime state.",
    columns: ["No", "Email", "Session ID", "Last Activity", "Status"],
    rows: [
      ["01", "lucastobyshelby@gmail.com", "SESS-81F2", "3 min ago", "Live"],
      ["02", "mia@octopilot.ai", "SESS-09A4", "22 min ago", "Idle"],
      ["03", "noah@writerlab.com", "SESS-77CD", "2 hrs ago", "Expired"],
    ],
  },
  {
    id: "market-data",
    title: "Market Data",
    subtitle: "Customer footprint and growth-side context.",
    columns: ["No", "Email", "IP Address", "Plan", "Customer Since"],
    rows: [
      ["01", "lucastobyshelby@gmail.com", "203.81.78.14", "Pro", "Jan 2026"],
      ["02", "mia@octopilot.ai", "103.44.19.83", "Starter", "Feb 2026"],
      ["03", "noah@writerlab.com", "95.211.17.20", "Free", "Mar 2026"],
    ],
  },
  {
    id: "purchase-history",
    title: "Purchase History",
    subtitle: "Track plan upgrades, renewals, and downgrades.",
    columns: ["No", "Email", "Current Plan", "Plan History"],
    rows: [
      ["01", "lucastobyshelby@gmail.com", "Pro", "Free > Starter > Pro"],
      ["02", "mia@octopilot.ai", "Starter", "Free > Starter"],
      ["03", "noah@writerlab.com", "Free", "Starter > Free"],
    ],
  },
  {
    id: "promo-area",
    title: "Promo Area",
    subtitle: "Promo tooling is intentionally deferred.",
    columns: ["Status", "Notes"],
    rows: [["Later", "Promo workflows will be implemented after launch hardening."]],
    badge: "Later",
  },
  {
    id: "api-keys",
    title: "API Keys",
    subtitle: "Current key pool mirrored from database.",
    columns: ["No", "Provider", "Key", "Status"],
    rows: [
      ["01", "OpenRouter", "sk-or-v1-397c...0d54", "Active"],
      ["02", "OpenRouter", "sk-or-v1-6837...3312", "Active"],
      ["03", "OpenRouter", "sk-or-v1-2e9b...79c9", "Active"],
      ["04", "OpenRouter", "sk-or-v1-c07f...8625", "Active"],
      ["05", "OpenRouter", "sk-or-v1-842a...df39", "Active"],
      ["06", "OpenRouter", "sk-or-v1-6a19...6ebf", "Active"],
      ["07", "OpenRouter", "sk-or-v1-3777...bbbd", "Active"],
      ["08", "OpenRouter", "sk-or-v1-4070...f158", "Active"],
      ["09", "OpenRouter", "sk-or-v1-1b12...d3bf", "Active"],
      ["10", "OpenRouter", "sk-or-v1-dfef...e4dd", "Active"],
      ["11", "OpenRouter", "sk-or-v1-d0df...52df", "Active"],
      ["12", "OpenRouter", "sk-or-v1-8776...503f", "Active"],
      ["13", "OpenRouter", "sk-or-v1-28be...9462", "Active"],
      ["14", "OpenRouter", "sk-or-v1-6ec3...0ba1", "Active"],
    ],
    badge: "14 Keys",
  },
  {
    id: "usage-tracking",
    title: "Usage Tracking",
    subtitle: "Spot heavy usage and session anomalies.",
    columns: ["No", "Name", "Email", "Total Sessions", "Action"],
    rows: [
      ["01", "Shun Lae", "lucastobyshelby@gmail.com", "48", "Inspect"],
      ["02", "Mia Carter", "mia@octopilot.ai", "13", "Inspect"],
      ["03", "Noah King", "noah@writerlab.com", "4", "Inspect"],
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    subtitle: "High-level platform health and conversion trends.",
    columns: ["Metric", "Value", "Change"],
    rows: [
      ["New Signups", "182", "+14%"],
      ["Active Subscriptions", "94", "+9%"],
      ["Report Rate", "3.8%", "-2%"],
      ["Session Depth", "22 min", "+6%"],
    ],
    badge: "Live",
  },
  {
    id: "system-settings",
    title: "System Settings",
    subtitle: "Settings editor is intentionally deferred.",
    columns: ["Status", "Notes"],
    rows: [["Later", "System settings UI will be implemented after backend/admin auth is finalized."]],
    badge: "Later",
  },
];

function getSection(id: string) {
  return sections.find((section) => section.id === id) ?? sections[0];
}

function IconFrame({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-4 w-4 items-center justify-center">{children}</span>;
}

function UsersIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="3.5" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M14 3.2a3.5 3.5 0 0 1 0 6.6" />
      </svg>
    </IconFrame>
  );
}

function CreditCardIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="M2.5 9.5h19" />
        <path d="M7 15h3" />
      </svg>
    </IconFrame>
  );
}

function FlagIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M5 21V5" />
        <path d="M5 5c5-3 9 3 14 0v9c-5 3-9-3-14 0" />
      </svg>
    </IconFrame>
  );
}

function ClockIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3 1.8" />
      </svg>
    </IconFrame>
  );
}

function GlobeIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17" />
        <path d="M12 3.5c2.8 2.7 4.2 5.6 4.2 8.5S14.8 17.8 12 20.5C9.2 17.8 7.8 14.9 7.8 12S9.2 6.2 12 3.5Z" />
      </svg>
    </IconFrame>
  );
}

function ReceiptIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M6 3.5h12v17l-2.5-1.7-2.5 1.7-2.5-1.7-2.5 1.7V3.5Z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
      </svg>
    </IconFrame>
  );
}

function TagIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M20.5 13 11 22.5 2.5 14V3.5H13L20.5 11a1.4 1.4 0 0 1 0 2Z" />
        <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    </IconFrame>
  );
}

function KeyIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <circle cx="8" cy="15" r="3.5" />
        <path d="M11.5 15H21" />
        <path d="M18 12v6" />
        <path d="M15 13.5v3" />
      </svg>
    </IconFrame>
  );
}

function ChartIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M4 19.5h16" />
        <path d="M7 16v-4" />
        <path d="M12 16V8" />
        <path d="M17 16v-7" />
      </svg>
    </IconFrame>
  );
}

function PulseIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <path d="M3 12h4l2-4 4 8 2-4h6" />
      </svg>
    </IconFrame>
  );
}

function SettingsIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .5-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.5H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
      </svg>
    </IconFrame>
  );
}

function getQuickMetrics(sectionId: string) {
  if (sectionId === "api-keys") {
    return [
      ["OpenRouter Keys", "14"],
      ["Humanizers", "2"],
      ["Pool Health", "Stable"],
      ["Rotation", "Ready"],
    ];
  }

  if (sectionId === "subscription-management") {
    return [
      ["Active Subs", "94"],
      ["Renewals", "39"],
      ["Failed Billing", "14"],
      ["Plan Mix", "Pro-led"],
    ];
  }

  if (sectionId === "reports") {
    return [
      ["Open Reports", "7"],
      ["Escalated", "2"],
      ["Avg Reply", "11m"],
      ["Resolved", "42"],
    ];
  }

  return [
    ["Live Sessions", "218"],
    ["Queued Reports", "7"],
    ["Key Pool", "14"],
    ["Renewals", "39"],
  ];
}

export default function BrokeOctopusPage() {
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(sections[0].id);

  const activeSection = getSection(activeSectionId);
  const quickMetrics = getQuickMetrics(activeSectionId);

  return (
    <main className="h-screen overflow-hidden bg-[#050505] text-white">
      <div className="mx-auto flex h-screen w-full max-w-[1680px] px-4 py-4 lg:px-6">
        {!controlCenterOpen ? (
          <section className="flex w-full flex-col rounded-[30px] border border-white/8 bg-[#090909] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.45)] lg:p-8">
            <div className="flex flex-col gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/35">BrokeOctopus</p>
                <h1 className="mt-2 text-[2.8rem] font-semibold tracking-[-0.06em] text-white">Admin Dashboard</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/52">
                  Web operations panel for plans, referrals, support load, and infrastructure pressure.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button className="rounded-full border border-white/10 bg-[#151515] px-5 py-3 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-400">
                  Refresh snapshot
                </button>
                <button
                  onClick={() => setControlCenterOpen(true)}
                  className="rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500"
                >
                  Open control center
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <section className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Overview</div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Live business pulse</div>
                  </div>
                  <div className="rounded-full border border-red-500/30 bg-[#170d0d] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200">
                    Today
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                  {[
                    { label: "Active Users", value: "12,480", delta: "+8.2%" },
                    { label: "MRR", value: "$18,240", delta: "+12.4%" },
                    { label: "Failed Payments", value: "14", delta: "Needs review" },
                    { label: "Open Reports", value: "7", delta: "2 urgent" },
                  ].map((card) => (
                    <article key={card.label} className="rounded-[22px] border border-white/8 bg-[#151515] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">{card.label}</div>
                      <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{card.value}</div>
                      <div className="mt-2 text-sm font-medium text-red-300">{card.delta}</div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/8 bg-[#101010] p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Priority Flags</div>
                <div className="mt-4 space-y-3">
                  {[
                    "3 users are pending manual billing recovery.",
                    "Referral redemptions spiked 41% over baseline.",
                    "One AI provider pool is within 8% of quota.",
                  ].map((item) => (
                    <div key={item} className="rounded-[18px] border border-red-500/18 bg-[#160d0d] px-4 py-3 text-sm leading-6 text-white/78">
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : (
          <section className="flex h-[calc(100vh-2rem)] w-full overflow-hidden rounded-[30px] border border-white/8 bg-[#090909] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
            <aside
              className={`${
                sidebarCollapsed ? "w-[92px]" : "w-[274px]"
              } flex shrink-0 flex-col border-r border-white/8 bg-[#060606] transition-all duration-300`}
            >
              <div className="border-b border-white/8 px-4 py-4">
                <p className={`text-[11px] font-semibold uppercase tracking-[0.32em] text-white/35 ${sidebarCollapsed ? "text-center" : ""}`}>
                  BrokeOctopus
                </p>
                {!sidebarCollapsed ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <h2 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-white">Control Center</h2>
                    <button
                      onClick={() => setSidebarCollapsed((value) => !value)}
                      className="rounded-full border border-white/10 bg-[#121212] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/72 transition hover:border-red-500/35 hover:text-white"
                    >
                      Collapse
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSidebarCollapsed((value) => !value)}
                    className="mt-3 w-full rounded-full border border-white/10 bg-[#121212] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/72 transition hover:border-red-500/35 hover:text-white"
                  >
                    Open
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-2 py-3">
                <div className="space-y-1.5">
                  {menuItems.map((item) => {
                    const isActive = item.id === activeSectionId;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSectionId(item.id)}
                        className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                          isActive
                            ? "border-red-500/40 bg-[#140b0b] text-white"
                            : "border-transparent bg-transparent text-white/58 hover:border-white/8 hover:bg-[#101010] hover:text-white"
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-[#0d0d0d] text-red-300">
                          {item.icon}
                        </div>
                        {!sidebarCollapsed ? (
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">{item.label}</div>
                            <div className="mt-0.5 text-xs leading-5 text-white/38">{item.description}</div>
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-white/8 p-3">
                <button
                  onClick={() => setControlCenterOpen(false)}
                  className="w-full rounded-[18px] border border-white/10 bg-[#111111] px-4 py-3 text-sm font-semibold text-white transition hover:border-red-500/30 hover:text-red-300"
                >
                  {sidebarCollapsed ? "Back" : "Back to overview"}
                </button>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4 lg:px-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/35">Admin Section</p>
                  <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-white">{activeSection.title}</h1>
                  <p className="mt-2 text-sm leading-6 text-white/46">{activeSection.subtitle}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {activeSection.badge ? (
                    <div className="rounded-full border border-red-500/30 bg-[#190b0b] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200">
                      {activeSection.badge}
                    </div>
                  ) : null}
                  <button className="rounded-full border border-white/10 bg-[#131313] px-4 py-2 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-300">
                    Export
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
                <section className="mb-4 rounded-[26px] border border-white/8 bg-[#101010] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Quick Metrics</div>
                      <div className="mt-2 text-lg font-semibold text-white">Live admin pulse for {activeSection.title.toLowerCase()}.</div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.24em] text-white/32">Topline</div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {quickMetrics.map(([label, value]) => (
                      <div key={label} className="rounded-[20px] border border-white/8 bg-[#151515] px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">{label}</div>
                        <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{value}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid gap-4 xl:grid-cols-[1.38fr_0.62fr]">
                  <section className="min-h-0 min-w-0 overflow-hidden rounded-[26px] border border-white/8 bg-[#101010]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Table View</div>
                      <div className="mt-2 text-lg font-semibold text-white">{activeSection.title}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded-full border border-white/10 bg-[#151515] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/70 transition hover:border-red-500/35 hover:text-white">
                        Refresh
                      </button>
                      <button className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-white hover:text-red-500">
                        Action
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[calc(100vh-23rem)] overflow-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-white/8 bg-[#0c0c0c]">
                          {activeSection.columns.map((column) => (
                            <th
                              key={column}
                              className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-white/38"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeSection.rows.map((row, rowIndex) => (
                          <tr key={`${activeSection.id}-${rowIndex}`} className="border-b border-white/6 last:border-b-0">
                            {row.map((cell, cellIndex) => (
                              <td
                                key={`${activeSection.id}-${rowIndex}-${cellIndex}`}
                                className="px-4 py-4 text-sm leading-6 text-white/78"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </section>

                  <section className="space-y-4">
                    <article className="rounded-[26px] border border-white/8 bg-[#101010] p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Operator Notes</div>
                      <div className="mt-4 space-y-3">
                        {[
                          "Stripe webhooks are next backend task after domain cutover.",
                          "Promo area and system settings remain intentionally deferred.",
                          "Admin auth should be locked before exposing this route publicly.",
                        ].map((note) => (
                          <div key={note} className="rounded-[18px] border border-red-500/18 bg-[#160c0c] px-4 py-3 text-sm leading-6 text-white/78">
                            {note}
                          </div>
                        ))}
                      </div>
                    </article>
                  </section>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
