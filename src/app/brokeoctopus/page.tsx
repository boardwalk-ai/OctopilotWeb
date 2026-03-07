"use client";

import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";
import type { User } from "firebase/auth";
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
  { id: "user-management", label: "User Management", description: "Accounts, status, and roles", icon: <UsersIcon />, columns: ["No", "Name", "Email", "Status", "Role", "Actions"] },
  {
    id: "subscription-management",
    label: "Subscription Management",
    description: "Plans, billing, and credits",
    icon: <CreditCardIcon />,
    columns: ["No", "Name", "Email", "Next Billing", "Current Plan", "Word", "Humanizer", "Source", "Actions"],
  },
  { id: "reports", label: "Reports", description: "Support and issue intake", icon: <FlagIcon />, columns: ["No", "Email", "Status", "Timestamp", "Action"] },
  { id: "metadata", label: "Metadata", description: "Sessions and activity health", icon: <ClockIcon />, columns: ["No", "Email", "Session ID", "Last Activity", "Status"] },
  { id: "market-data", label: "Market Data", description: "Customer footprint snapshot", icon: <GlobeIcon />, columns: ["No", "Email", "IP Address", "Plan", "Customer Since"] },
  { id: "purchase-history", label: "Purchase History", description: "Plan timeline and changes", icon: <ReceiptIcon />, columns: ["No", "Email", "Current Plan", "Plan History"] },
  { id: "promo-area", label: "Promo Area", description: "Implement later", icon: <TagIcon />, columns: ["Status"] },
  { id: "api-keys", label: "API Keys", description: "Key pool from database", icon: <KeyIcon />, columns: ["No", "Provider", "Key", "Status"] },
  { id: "usage-tracking", label: "Usage Tracking", description: "Session count and operator action", icon: <ChartIcon />, columns: ["No", "Name", "Email", "Total Sessions", "Action"] },
  { id: "analytics", label: "Analytics", description: "Performance and growth trends", icon: <PulseIcon />, columns: ["Metric", "Value", "Change"] },
  { id: "system-settings", label: "System Settings", description: "Implement later", icon: <SettingsIcon />, columns: ["Status"] },
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

function getOrderedRowValues(sectionId: string, row: DataRow) {
  const keyOrder = keyOrderBySection[sectionId] || Object.keys(row);
  return keyOrder.map((key) => row[key] ?? "-");
}

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
      <p className="mt-3 text-sm leading-7 text-white/52">Use an admin-approved account to access the control center.</p>

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
          {isBusy ? "Signing in..." : "Enter control center"}
        </button>
      </div>
    </section>
  );
}

export default function BrokeOctopusPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(menuItems[0].id);
  const [data, setData] = useState<ControlCenterResponse | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const activeSection = menuItems.find((item) => item.id === activeSectionId) ?? menuItems[0];
  const rows = data?.sections[activeSectionId] || [];

  const loadDashboard = async () => {
    const token = await AuthService.getIdToken(true);
    if (!token) {
      throw new Error("You need to be signed in as an admin.");
    }

    const [accessResponse, dataResponse] = await Promise.all([
      fetch("/api/admin/check-access", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/admin/control-center", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const accessPayload = await accessResponse.json();
    if (!accessResponse.ok || !accessPayload.isAdmin) {
      throw new Error(accessPayload.error || "This account does not have admin access.");
    }

    const dataPayload = await dataResponse.json();
    if (!dataResponse.ok) {
      throw new Error(dataPayload.error || "Failed to load admin data.");
    }

    setIsAdmin(true);
    setData(dataPayload);
  };

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
      setData(null);
      return;
    }

    let ignore = false;

    const run = async () => {
      setIsBusy(true);
      setDashboardError(null);
      setAuthError(null);

      try {
        await loadDashboard();
      } catch (error) {
        if (!ignore) {
          setIsAdmin(false);
          setDashboardError(error instanceof Error ? error.message : "Failed to load admin data.");
        }
      } finally {
        if (!ignore) {
          setIsBusy(false);
        }
      }
    };

    run();
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

  const handleRefresh = async () => {
    setIsBusy(true);
    setDashboardError(null);

    try {
      await loadDashboard();
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Failed to refresh admin data.");
    } finally {
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
              authError={authError || dashboardError}
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
    <main className="h-screen overflow-hidden bg-[#050505] text-white">
      <div className="mx-auto flex h-screen w-full max-w-[1680px] px-4 py-4 lg:px-6">
        <section className="flex h-[calc(100vh-2rem)] w-full overflow-hidden rounded-[30px] border border-white/8 bg-[#090909] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
          <aside
            className={`${sidebarCollapsed ? "w-[92px]" : "w-[274px]"} flex shrink-0 flex-col border-r border-white/8 bg-[#060606] transition-all duration-300`}
          >
            <div className="border-b border-white/8 px-4 py-4">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.32em] text-white/35 ${sidebarCollapsed ? "text-center" : ""}`}>BrokeOctopus</p>
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
                        isActive ? "border-red-500/40 bg-[#140b0b] text-white" : "border-transparent bg-transparent text-white/58 hover:border-white/8 hover:bg-[#101010] hover:text-white"
                      }`}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-white/10 bg-[#0d0d0d] text-red-300">{item.icon}</div>
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
                onClick={async () => {
                  await AuthService.signOut();
                }}
                className="w-full rounded-[18px] border border-white/10 bg-[#111111] px-4 py-3 text-sm font-semibold text-white transition hover:border-red-500/30 hover:text-red-300"
              >
                Log out
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

              <button
                onClick={handleRefresh}
                className="rounded-full border border-white/10 bg-[#131313] px-4 py-2 text-sm font-semibold text-white transition hover:border-red-500/35 hover:text-red-300"
              >
                {isBusy ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
              {dashboardError ? <div className="mb-4 rounded-[22px] border border-red-500/25 bg-[#140b0b] px-5 py-4 text-sm text-red-100">{dashboardError}</div> : null}

              <section className="mb-4 rounded-[26px] border border-white/8 bg-[#101010] p-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Total Users", data?.quickMetrics.totalUsers ?? 0],
                    ["Active Subscriptions", data?.quickMetrics.activeSubscriptions ?? 0],
                    ["Open Reports", data?.quickMetrics.openReports ?? 0],
                    ["OpenRouter Pool", data?.quickMetrics.openRouterPool ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-[20px] border border-white/8 bg-[#151515] px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">{label}</div>
                      <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="min-h-0 min-w-0 overflow-hidden rounded-[26px] border border-white/8 bg-[#101010]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">Table View</div>
                    <div className="mt-2 text-lg font-semibold text-white">{activeSection.label}</div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/32">{rows.length > 0 ? `${rows.length} rows` : "No data"}</div>
                </div>

                <div className="max-h-[calc(100vh-18rem)] overflow-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/8 bg-[#0c0c0c]">
                        {activeSection.columns.map((column) => (
                          <th key={column} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-white/38">
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
                              <td key={`${activeSection.id}-${rowIndex}-${cellIndex}`} className="px-4 py-4 text-sm leading-6 text-white/78">
                                {String(cell ?? "-")}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={activeSection.columns.length} className="px-4 py-10 text-center text-sm text-white/42">
                            {isBusy ? "Loading real data..." : "No data available for this section yet."}
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
      </div>
    </main>
  );
}
