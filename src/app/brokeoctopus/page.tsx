"use client";

import { useEffect, useState } from "react";
import type { ReactNode, JSX } from "react";
import { AuthService } from "@/services/AuthService";

type MenuItem = {
  id: string;
  label: string;
  description: string;
  icon: JSX.Element;
  columns: string[];
};

type DataRow = Record<string, string | number | null>;
type ControlCenterResponse = {
  quickMetrics: {
    totalUsers: number;
    activeSubscriptions: number;
    openReports: number;
    openRouterPool: number;
  };
  sections: Record<string, DataRow[]>;
};

const menuItems: MenuItem[] = [
  {
    id: "user-management",
    label: "User Management",
    description: "Accounts, status, and roles",
    icon: <UsersIcon />,
    columns: ["No", "Name", "Email", "Status", "Role", "Actions"],
  },
  {
    id: "subscription-management",
    label: "Subscription Management",
    description: "Plans, billing, and credits",
    icon: <CreditCardIcon />,
    columns: ["No", "Name", "Email", "Next Billing", "Current Plan", "Word", "Humanizer", "Source", "Actions"],
  },
  {
    id: "reports",
    label: "Reports",
    description: "Support and issue intake",
    icon: <FlagIcon />,
    columns: ["No", "Email", "Status", "Timestamp", "Action"],
  },
  {
    id: "metadata",
    label: "Metadata",
    description: "Sessions and activity health",
    icon: <ClockIcon />,
    columns: ["No", "Email", "Session ID", "Last Activity", "Status"],
  },
  {
    id: "market-data",
    label: "Market Data",
    description: "Customer footprint snapshot",
    icon: <GlobeIcon />,
    columns: ["No", "Email", "IP Address", "Plan", "Customer Since"],
  },
  {
    id: "purchase-history",
    label: "Purchase History",
    description: "Plan timeline and changes",
    icon: <ReceiptIcon />,
    columns: ["No", "Email", "Current Plan", "Plan History"],
  },
  {
    id: "promo-area",
    label: "Promo Area",
    description: "Implement later",
    icon: <TagIcon />,
    columns: ["Status"],
  },
  {
    id: "api-keys",
    label: "API Keys",
    description: "Key pool from database",
    icon: <KeyIcon />,
    columns: ["No", "Provider", "Key", "Status"],
  },
  {
    id: "usage-tracking",
    label: "Usage Tracking",
    description: "Session count and operator action",
    icon: <ChartIcon />,
    columns: ["No", "Name", "Email", "Total Sessions", "Action"],
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Performance and growth trends",
    icon: <PulseIcon />,
    columns: ["Metric", "Value", "Change"],
  },
  {
    id: "system-settings",
    label: "System Settings",
    description: "Implement later",
    icon: <SettingsIcon />,
    columns: ["Status"],
  },
];

const keyOrderBySection: Record<string, string[]> = {
  "user-management": ["no", "name", "email", "status", "role", "actions"],
  "subscription-management": ["no", "name", "email", "nextBilling", "currentPlan", "word", "humanizer", "source", "actions"],
  reports: ["no", "email", "status", "timestamp", "action"],
  metadata: ["no", "email", "sessionId", "lastActivity", "status"],
  "market-data": ["no", "email", "ipAddress", "plan", "customerSince"],
  "purchase-history": ["no", "email", "currentPlan", "planHistory"],
  "api-keys": ["no", "provider", "key", "status"],
  "usage-tracking": ["no", "name", "email", "totalSessions", "action"],
  analytics: ["metric", "value", "change"],
};

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

function getActiveMenuItem(id: string) {
  return menuItems.find((item) => item.id === id) ?? menuItems[0];
}

function getOrderedRowValues(sectionId: string, row: DataRow) {
  const keyOrder = keyOrderBySection[sectionId] || Object.keys(row);
  return keyOrder.map((key) => row[key] ?? "-");
}

export default function BrokeOctopusPage() {
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(menuItems[0].id);
  const [data, setData] = useState<ControlCenterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSection = getActiveMenuItem(activeSectionId);
  const rows = data?.sections[activeSectionId] || [];

  const loadControlCenter = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await AuthService.getIdToken();
      if (!token) {
        throw new Error("You need to be signed in as an admin.");
      }

      const response = await fetch("/api/admin/control-center", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load admin data.");
      }

      setData(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load admin data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!controlCenterOpen) {
      return;
    }

    loadControlCenter();
  }, [controlCenterOpen]);

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
                    { label: "Active Users", value: String(data?.quickMetrics.totalUsers || 0), delta: "Live" },
                    { label: "Active Subs", value: String(data?.quickMetrics.activeSubscriptions || 0), delta: "Live" },
                    { label: "Open Reports", value: String(data?.quickMetrics.openReports || 0), delta: "Live" },
                    { label: "OpenRouter Pool", value: String(data?.quickMetrics.openRouterPool || 14), delta: "Live" },
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
                    "Admin tables now read from the FastAPI backend.",
                    "Use the control center for real users, subscriptions, reports, and key pool data.",
                    "Promo and system settings remain deferred until backend admin tooling is complete.",
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
                  <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.05em] text-white">{activeSection.label}</h1>
                  <p className="mt-2 text-sm leading-6 text-white/46">{activeSection.description}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {isLoading ? (
                    <div className="rounded-full border border-white/10 bg-[#131313] px-4 py-2 text-sm font-semibold text-white/70">
                      Loading...
                    </div>
                  ) : null}
                  <button
                    onClick={loadControlCenter}
                    className="rounded-full border border-white/10 bg-[#131313] px-4 py-2 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-300"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
                {error ? (
                  <div className="rounded-[22px] border border-red-500/25 bg-[#140b0b] px-5 py-4 text-sm text-red-100">{error}</div>
                ) : null}

                <section className="min-h-0 min-w-0 overflow-hidden rounded-[26px] border border-white/8 bg-[#101010]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Table View</div>
                      <div className="mt-2 text-lg font-semibold text-white">{activeSection.label}</div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.24em] text-white/32">
                      {rows.length > 0 ? `${rows.length} rows` : "No data"}
                    </div>
                  </div>

                  <div className="max-h-[calc(100vh-12rem)] overflow-auto">
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
                        {rows.length > 0 ? (
                          rows.map((row, rowIndex) => (
                            <tr key={`${activeSection.id}-${rowIndex}`} className="border-b border-white/6 last:border-b-0">
                              {getOrderedRowValues(activeSection.id, row).map((cell, cellIndex) => (
                                <td
                                  key={`${activeSection.id}-${rowIndex}-${cellIndex}`}
                                  className="px-4 py-4 text-sm leading-6 text-white/78"
                                >
                                  {String(cell ?? "-")}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={activeSection.columns.length}
                              className="px-4 py-10 text-center text-sm text-white/42"
                            >
                              {isLoading ? "Loading real data..." : "No data available for this section yet."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
