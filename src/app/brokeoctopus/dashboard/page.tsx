"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";
import type { User } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthService } from "@/services/AuthService";
import { StreamService } from "@/services/StreamService";
import PromoAreaPanel from "@/components/admin/PromoAreaPanel";
import EarlyAccessEventsPanel from "@/components/admin/EarlyAccessEventsPanel";

type MenuItem = {
  id: string;
  label: string;
  description: string;
  icon: JSX.Element;
  columns: string[];
  group?: string;
};

type DataRow = Record<string, string | number | null>;
type EditableSubscriptionRow = DataRow & {
  userId?: string;
  name?: string;
  email?: string;
  currentPlan?: string;
  word?: string | number | null;
  humanizer?: string | number | null;
  source?: string | number | null;
};
type ReportRow = DataRow & {
  reportId?: string;
  email?: string;
  title?: string;
  description?: string;
  imageUrl?: string | null;
  status?: string;
  timestamp?: string;
};
type MetadataRow = DataRow & {
  userId?: string;
  name?: string;
  email?: string;
  sessions?: string | number | null;
  lastActivity?: string;
  status?: string;
  action?: string;
};
type SessionSummary = {
  id: string;
  sessionStartTime?: string | null;
  lastHeartbeat?: string | null;
  sessionClosedAt?: string | null;
  writingMode?: string | null;
  majorName?: string | null;
  essayType?: string | null;
  exportStatus?: string | null;
  exportType?: string | null;
  wordCount?: number | null;
  generatedOutputWordCount?: number | null;
  finalPageCount?: number | null;
};
type SessionDetail = Record<string, string | number | boolean | null>;
type SessionInspectorPayload = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  sessions: SessionSummary[];
};
type ControlCenterResponse = {
  quickMetrics: {
    totalUsers: number;
    activeSubscriptions: number;
    openReports: number;
    openRouterPool: number;
  };
  sections: Record<string, DataRow[]>;
};

type ResolveMethod = "word" | "humanizer" | "source" | "notify" | "deny";

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
  { id: "metadata", label: "Metadata", description: "Sessions and activity health", icon: <ClockIcon />, columns: ["No", "Email", "Sessions", "Last Activity", "Status", "Action"] },
  { id: "market-data", label: "Market Data", description: "Customer footprint snapshot", icon: <GlobeIcon />, columns: ["No", "Email", "IP Address", "Plan", "Customer Since"] },
  { id: "purchase-history", label: "Purchase History", description: "Plan timeline and changes", icon: <ReceiptIcon />, columns: ["No", "Email", "Current Plan", "Plan History"] },
  { id: "promo-area", label: "Promo Area", description: "Codes, expiry, and claim control", icon: <TagIcon />, columns: ["Status"] },
  { id: "referral-section", label: "Referral Section", description: "Referral rewards and claim visibility", icon: <KeyIcon />, columns: ["Status"] },
  {
    id: "events-early-access",
    label: "Early Access",
    description: "Calendar availability and appointment bookings",
    icon: <CalendarIcon />,
    columns: ["Status"],
    group: "Events",
  },
  { id: "api-keys", label: "API Keys", description: "Key pool from database", icon: <KeyIcon />, columns: ["No", "Provider", "Key", "Status"] },
  { id: "usage-tracking", label: "Usage Tracking", description: "Session count and operator action", icon: <ChartIcon />, columns: ["No", "Name", "Email", "Total Sessions", "Action"] },
  { id: "analytics", label: "Analytics", description: "Performance and growth trends", icon: <PulseIcon />, columns: ["Metric", "Value", "Change"] },
  { id: "system-settings", label: "System Settings", description: "Implement later", icon: <SettingsIcon />, columns: ["Status"] },
];

const keyOrderBySection: Record<string, string[]> = {
  "user-management": ["no", "name", "email", "status", "role", "actions"],
  "subscription-management": ["no", "name", "email", "nextBilling", "currentPlan", "word", "humanizer", "source", "actions"],
  reports: ["no", "email", "status", "timestamp", "action"],
  metadata: ["no", "email", "sessions", "lastActivity", "status", "action"],
  "market-data": ["no", "email", "ipAddress", "plan", "customerSince"],
  "purchase-history": ["no", "email", "currentPlan", "planHistory"],
  "api-keys": ["no", "provider", "key", "status"],
  "usage-tracking": ["no", "name", "email", "totalSessions", "action"],
  analytics: ["metric", "value", "change"],
};

const defaultAdminSectionId = "user-management";

function resolveAdminSectionId(value: string | null) {
  if (!value) {
    return defaultAdminSectionId;
  }

  return menuItems.some((item) => item.id === value) ? value : defaultAdminSectionId;
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

function CalendarIcon() {
  return (
    <IconFrame>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
        <rect x="3.5" y="5" width="17" height="15" rx="2.4" />
        <path d="M7 3.5v3" />
        <path d="M17 3.5v3" />
        <path d="M3.5 9.5h17" />
        <path d="M8 13h3" />
        <path d="M13 13h3" />
        <path d="M8 17h3" />
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

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function readRowValue(row: DataRow, key: string) {
  const direct = row[key];
  if (direct !== undefined && direct !== null && direct !== "") return direct;

  const snake = row[toSnakeCase(key)];
  if (snake !== undefined && snake !== null && snake !== "") return snake;

  const compact = row[key.toLowerCase()];
  if (compact !== undefined && compact !== null && compact !== "") return compact;

  return "-";
}

function getOrderedRowValues(sectionId: string, row: DataRow) {
  const keyOrder = keyOrderBySection[sectionId] || Object.keys(row);
  return keyOrder.map((key) => readRowValue(row, key));
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
    </svg>
  );
}

function CreditEditModal({
  row,
  saving,
  error,
  onClose,
  onSave,
}: {
  row: EditableSubscriptionRow;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: { wordCredits: number; humanizerCredits: number; sourceCredits: number }) => Promise<void>;
}) {
  const [wordCredits, setWordCredits] = useState(String(row.word ?? 0));
  const [humanizerCredits, setHumanizerCredits] = useState(String(row.humanizer ?? 0));
  const [sourceCredits, setSourceCredits] = useState(String(row.source ?? 0));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/72 px-4">
      <div className="w-full max-w-[580px] rounded-[28px] border border-white/10 bg-[#0b0b0b] p-7 shadow-[0_32px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Edit Credits</p>
            <h2 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-white">{row.name || row.email || "User"}</h2>
            <p className="mt-2 text-sm text-white/45">{row.currentPlan || "Plan unavailable"}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white/72 transition hover:border-red-500/35 hover:text-white">
            Close
          </button>
        </div>

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <label className="block rounded-[22px] border border-white/8 bg-[#111111] p-4">
            <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">Word Credits</span>
            <input
              type="number"
              min="0"
              value={wordCredits}
              onChange={(event) => setWordCredits(event.target.value)}
              className="w-full rounded-[16px] border border-white/10 bg-[#181818] px-4 py-3 text-base font-semibold text-white outline-none transition focus:border-red-500/40"
            />
          </label>
          <label className="block rounded-[22px] border border-white/8 bg-[#111111] p-4">
            <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">Humanizer Credits</span>
            <input
              type="number"
              min="0"
              value={humanizerCredits}
              onChange={(event) => setHumanizerCredits(event.target.value)}
              className="w-full rounded-[16px] border border-white/10 bg-[#181818] px-4 py-3 text-base font-semibold text-white outline-none transition focus:border-red-500/40"
            />
          </label>
          <label className="block rounded-[22px] border border-white/8 bg-[#111111] p-4">
            <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">Source Credits</span>
            <input
              type="number"
              min="0"
              value={sourceCredits}
              onChange={(event) => setSourceCredits(event.target.value)}
              className="w-full rounded-[16px] border border-white/10 bg-[#181818] px-4 py-3 text-base font-semibold text-white outline-none transition focus:border-red-500/40"
            />
          </label>
        </div>

        {error ? <div className="mt-4 rounded-[18px] border border-red-500/25 bg-[#170c0c] px-4 py-3 text-sm text-red-100">{error}</div> : null}

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="min-w-[132px] rounded-full border border-white/10 bg-[#141414] px-5 py-3 text-sm font-semibold text-white/72 transition hover:border-white/20 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                wordCredits: Number(wordCredits || 0),
                humanizerCredits: Number(humanizerCredits || 0),
                sourceCredits: Number(sourceCredits || 0),
              })
            }
            disabled={saving}
            className="min-w-[168px] rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save credits"}
          </button>
        </div>
      </div>
    </div>
  );
}

const RESOLUTION_TEMPLATE_PRESETS: Record<ResolveMethod, string[]> = {
  word: [
    "We are sorry for your experience. We have added {credits} word credits to your account to make things right. Thank you for trusting Octopilot.",
    "Thanks for reporting this. We reviewed the issue and restored {credits} word credits to your balance.",
    "Our team confirmed the problem and added {credits} word credits back to your account.",
    "We appreciate the report. {credits} word credits have now been credited to your account.",
    "We are sorry for the inconvenience. {credits} word credits were added to your account by our support team.",
  ],
  humanizer: [
    "We are sorry for your experience. We have added {credits} humanizer credits to your account to make things right. Thank you for trusting Octopilot.",
    "Thanks for reporting this. We reviewed the issue and restored {credits} humanizer credits to your balance.",
    "Our team confirmed the problem and added {credits} humanizer credits back to your account.",
    "We appreciate the report. {credits} humanizer credits have now been credited to your account.",
    "We are sorry for the inconvenience. {credits} humanizer credits were added to your account by our support team.",
  ],
  source: [
    "We are sorry for your experience. We have added {credits} source credits to your account to make things right. Thank you for trusting Octopilot.",
    "Thanks for reporting this. We reviewed the issue and restored {credits} source credits to your balance.",
    "Our team confirmed the problem and added {credits} source credits back to your account.",
    "We appreciate the report. {credits} source credits have now been credited to your account.",
    "We are sorry for the inconvenience. {credits} source credits were added to your account by our support team.",
  ],
  notify: [
    "Thank you for reporting this. Our team has reviewed the issue and a fix is already in progress.",
    "We have reproduced the problem and our engineers are currently working on the resolution.",
    "Your report has been logged successfully. We will keep improving this area and appreciate your patience.",
    "Thanks for raising this issue. The case is now under review by our internal team.",
    "We reviewed your report and the issue has been forwarded to the responsible team for a fix.",
  ],
  deny: [
    "Thank you for the report. After review, we are unable to approve a credit adjustment for this case.",
    "We carefully reviewed the issue but could not confirm an account credit reimbursement at this time.",
    "Thanks for reaching out. We investigated the report, but this request is outside our refund criteria.",
    "Our team reviewed your case and we are unable to issue a credit refund for this report.",
    "We appreciate the report. At the moment, we are unable to approve the requested adjustment.",
  ],
};

function formatTemplate(template: string, credits: number) {
  return template.replaceAll("{credits}", String(credits));
}

function ResolveTypeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
        active ? "bg-red-500 text-black" : "border border-white/10 bg-[#111111] text-white/62 hover:border-red-500/35 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function MessageOption({
  checked,
  label,
  children,
  onSelect,
}: {
  checked: boolean;
  label: string;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <div className={`rounded-[20px] border px-4 py-4 transition ${checked ? "border-red-500/35 bg-[#130b0b]" : "border-white/10 bg-[#101010]"}`}>
      <button onClick={onSelect} className="mb-3 flex items-center gap-3 text-left">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${checked ? "border-red-500 bg-red-500" : "border-white/20 bg-transparent"}`}>
          {checked ? <span className="h-2 w-2 rounded-full bg-black" /> : null}
        </span>
        <span className="text-sm font-semibold text-white">{label}</span>
      </button>
      {children}
    </div>
  );
}

function ReportInspectModal({
  row,
  saving,
  error,
  onClose,
  onSend,
}: {
  row: ReportRow;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSend: (payload: { reportId: string; method: ResolveMethod; credits?: number; message: string }) => Promise<void>;
}) {
  const [activeMethod, setActiveMethod] = useState<ResolveMethod>("word");
  const [selectedMessageKind, setSelectedMessageKind] = useState<"template" | "custom">("template");
  const [templateIndex, setTemplateIndex] = useState(0);
  const [isEditingCredits, setIsEditingCredits] = useState(false);
  const [wordCredits, setWordCredits] = useState(Number(row.word ?? 0));
  const [humanizerCredits, setHumanizerCredits] = useState(Number(row.humanizer ?? 0));
  const [sourceCredits, setSourceCredits] = useState(Number(row.source ?? 0));
  const [templateMessage, setTemplateMessage] = useState(formatTemplate(RESOLUTION_TEMPLATE_PRESETS.word[0], Number(row.word ?? 0)));
  const [customMessage, setCustomMessage] = useState("");

  const creditDelta =
    activeMethod === "word"
      ? wordCredits - Number(row.word ?? 0)
      : activeMethod === "humanizer"
        ? humanizerCredits - Number(row.humanizer ?? 0)
        : sourceCredits - Number(row.source ?? 0);

  const selectedCredits =
    activeMethod === "word" ? wordCredits : activeMethod === "humanizer" ? humanizerCredits : sourceCredits;
  const originalCredits =
    activeMethod === "word" ? Number(row.word ?? 0) : activeMethod === "humanizer" ? Number(row.humanizer ?? 0) : Number(row.source ?? 0);

  const supportsCredits = activeMethod === "word" || activeMethod === "humanizer" || activeMethod === "source";

  const syncTemplateMessage = (method: ResolveMethod, nextTemplateIndex: number, nextCredits?: number) => {
    const baseCredits =
      nextCredits ?? (method === "word" ? wordCredits : method === "humanizer" ? humanizerCredits : sourceCredits);
    const nextTemplate = RESOLUTION_TEMPLATE_PRESETS[method][nextTemplateIndex] || RESOLUTION_TEMPLATE_PRESETS[method][0];
    setTemplateMessage(formatTemplate(nextTemplate, baseCredits));
  };

  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-black/78 px-4 py-6">
      <div className="flex min-h-full items-start justify-center">
        <div className="w-full max-w-[960px] overflow-hidden rounded-[30px] border border-white/10 bg-[#090909] shadow-[0_32px_80px_rgba(0,0,0,0.55)]">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/8 bg-[#090909] px-7 py-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/36">Inspect Report</p>
            <h2 className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{row.title || "Untitled report"}</h2>
            <p className="mt-2 text-sm text-white/45">{row.email || "-"}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white/72 transition hover:border-red-500/35 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="max-h-[calc(100vh-120px)] overflow-y-auto px-7 pb-7">
            <div className="pt-6 grid gap-5 lg:grid-cols-[1.05fr_1.15fr]">
              <section className="space-y-4 rounded-[24px] border border-white/10 bg-[#101010] p-5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/36">Issue Title</div>
                  <div className="mt-2 text-lg font-semibold text-white">{row.title || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/36">Issue Content</div>
                  <div className="mt-2 text-sm leading-7 text-white/62">{row.description || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/36">Screenshot</div>
                  <div className="mt-3 rounded-[18px] border border-white/10 bg-[#080808] p-3">
                    {row.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(row.imageUrl)} alt={String(row.title || "Issue screenshot")} className="max-h-[320px] w-full rounded-[14px] object-contain" />
                    ) : (
                      <div className="flex min-h-[180px] items-center justify-center text-sm text-white/42">No image attached for this issue.</div>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-[24px] border border-white/10 bg-[#101010] p-5">
                <div className="flex flex-wrap gap-2">
                  <ResolveTypeButton active={activeMethod === "word"} label="Word" onClick={() => { setActiveMethod("word"); setTemplateIndex(0); syncTemplateMessage("word", 0, wordCredits); }} />
                  <ResolveTypeButton active={activeMethod === "humanizer"} label="Humanizer" onClick={() => { setActiveMethod("humanizer"); setTemplateIndex(0); syncTemplateMessage("humanizer", 0, humanizerCredits); }} />
                  <ResolveTypeButton active={activeMethod === "source"} label="Source" onClick={() => { setActiveMethod("source"); setTemplateIndex(0); syncTemplateMessage("source", 0, sourceCredits); }} />
                  <ResolveTypeButton active={activeMethod === "notify"} label="Notify" onClick={() => { setActiveMethod("notify"); setTemplateIndex(0); syncTemplateMessage("notify", 0, 0); }} />
                  <ResolveTypeButton active={activeMethod === "deny"} label="Deny" onClick={() => { setActiveMethod("deny"); setTemplateIndex(0); syncTemplateMessage("deny", 0, 0); }} />
                </div>

                {supportsCredits ? (
                  <div className="mt-5 rounded-[20px] border border-white/10 bg-[#0c0c0c] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-white/78">
                        {row.name || row.email}&rsquo;s {activeMethod} credit
                      </div>
                      <button
                        onClick={() => setIsEditingCredits((value) => !value)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#141414] text-white/72 transition hover:border-red-500/35 hover:text-red-300"
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        value={selectedCredits}
                        disabled={!isEditingCredits}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value || 0);
                          if (activeMethod === "word") setWordCredits(nextValue);
                          if (activeMethod === "humanizer") setHumanizerCredits(nextValue);
                          if (activeMethod === "source") setSourceCredits(nextValue);
                          if (selectedMessageKind === "template") {
                            syncTemplateMessage(activeMethod, templateIndex, nextValue);
                          }
                        }}
                        className="w-[180px] rounded-[16px] border border-white/10 bg-[#181818] px-4 py-3 text-base font-semibold text-white outline-none transition focus:border-red-500/40 disabled:cursor-not-allowed disabled:text-white/38"
                      />
                      <div className="text-sm text-white/46">
                        Current {originalCredits} <span className={`ml-2 font-semibold ${creditDelta >= 0 ? "text-emerald-300" : "text-red-300"}`}>{creditDelta >= 0 ? `+${creditDelta}` : creditDelta}</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 space-y-4">
                  <MessageOption checked={selectedMessageKind === "template"} label="Template message" onSelect={() => setSelectedMessageKind("template")}>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {RESOLUTION_TEMPLATE_PRESETS[activeMethod].map((_, index) => (
                        <button
                          key={`${activeMethod}-${index}`}
                          onClick={() => {
                            setTemplateIndex(index);
                            syncTemplateMessage(activeMethod, index);
                          }}
                          className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] transition ${
                            templateIndex === index ? "bg-white text-black" : "border border-white/10 bg-[#151515] text-white/56 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          Template {index + 1}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={templateMessage}
                      onChange={(event) => setTemplateMessage(event.target.value)}
                      rows={5}
                      className="w-full resize-none rounded-[18px] border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/40"
                    />
                  </MessageOption>

                  <MessageOption checked={selectedMessageKind === "custom"} label="Custom message" onSelect={() => setSelectedMessageKind("custom")}>
                    <textarea
                      value={customMessage}
                      onChange={(event) => setCustomMessage(event.target.value)}
                      rows={5}
                      placeholder="Write a custom message"
                      className="w-full resize-none rounded-[18px] border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/40"
                    />
                  </MessageOption>
                </div>

                {error ? <div className="mt-4 rounded-[18px] border border-red-500/25 bg-[#170c0c] px-4 py-3 text-sm text-red-100">{error}</div> : null}

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    onClick={onClose}
                    className="rounded-full border border-white/10 bg-[#141414] px-5 py-3 text-sm font-semibold text-white/72 transition hover:border-white/20 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      row.reportId
                        ? onSend({
                            reportId: row.reportId,
                            method: activeMethod,
                            credits: supportsCredits ? Math.max(0, selectedCredits - originalCredits) : undefined,
                            message: selectedMessageKind === "template" ? templateMessage.trim() : customMessage.trim(),
                          })
                        : Promise.resolve()
                    }
                    disabled={saving || !row.reportId}
                    className="rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Sending..." : "Send"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDetailLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function SessionInspectModal({
  payload,
  selectedSessionId,
  detail,
  loading,
  deletingSessionId,
  error,
  onClose,
  onSelectSession,
  onDeleteSession,
}: {
  payload: SessionInspectorPayload;
  selectedSessionId: string | null;
  detail: SessionDetail | null;
  loading: boolean;
  deletingSessionId: string | null;
  error: string | null;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}) {
  const detailEntries = detail ? Object.entries(detail) : [];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/78 px-4 py-6">
      <div className="flex h-full max-h-[92vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#090909] shadow-[0_32px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/35">Session Inspector</p>
            <h2 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.05em] text-white">{payload.user.name || payload.user.email || "Unknown user"}</h2>
            <p className="mt-2 text-sm text-white/45">{payload.user.email || "No email"}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white/72 transition hover:border-red-500/35 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-white/8 bg-[#070707] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Sessions</div>
              <div className="text-xs text-white/35">{payload.sessions.length} total</div>
            </div>

            <div className="space-y-3">
              {payload.sessions.map((session) => {
                const isActive = selectedSessionId === session.id;
                const displayStatus = session.exportStatus || (session.sessionClosedAt ? "closed" : "active");
                return (
                  <div
                    key={session.id}
                    className={`rounded-[22px] border p-4 transition ${isActive ? "border-red-500/40 bg-[#150b0b]" : "border-white/8 bg-[#101010]"}`}
                  >
                    <button onClick={() => onSelectSession(session.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">{session.writingMode || "Unknown mode"}</div>
                          <div className="mt-2 text-base font-semibold text-white">{session.essayType || session.majorName || "Untitled session"}</div>
                          <div className="mt-2 text-xs leading-6 text-white/45">
                            Started: {session.sessionStartTime ? new Date(session.sessionStartTime).toLocaleString() : "-"}
                          </div>
                          <div className="text-xs leading-6 text-white/45">
                            Last activity: {session.lastHeartbeat ? new Date(session.lastHeartbeat).toLocaleString() : "-"}
                          </div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                          {displayStatus}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/42">
                        <span className="rounded-full border border-white/10 px-2.5 py-1">Words: {session.generatedOutputWordCount ?? session.wordCount ?? 0}</span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1">Pages: {session.finalPageCount ?? 0}</span>
                        <span className="rounded-full border border-white/10 px-2.5 py-1">Export: {session.exportType || "-"}</span>
                      </div>
                    </button>

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => onDeleteSession(session.id)}
                        disabled={deletingSessionId === session.id}
                        className="rounded-full border border-red-500/18 bg-[#160b0b] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-200 transition hover:border-red-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingSessionId === session.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/35">Tracker Data</div>
                <div className="mt-2 text-lg font-semibold text-white">{selectedSessionId ? "Session detail" : "Select a session"}</div>
              </div>
            </div>

            {error ? <div className="mb-4 rounded-[18px] border border-red-500/25 bg-[#170c0c] px-4 py-3 text-sm text-red-100">{error}</div> : null}

            {loading ? (
              <div className="rounded-[22px] border border-white/8 bg-[#101010] px-5 py-6 text-sm text-white/55">Loading session data...</div>
            ) : detailEntries.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {detailEntries.map(([key, value]) => (
                  <div key={key} className="rounded-[20px] border border-white/8 bg-[#101010] px-4 py-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">{formatDetailLabel(key)}</div>
                    <div className="mt-2 text-sm leading-6 text-white/82 break-words">{String(value ?? "-")}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-white/8 bg-[#101010] px-5 py-6 text-sm text-white/45">
                Select a session card on the left to inspect the full tracker payload.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSectionId = resolveAdminSectionId(searchParams.get("section"));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(requestedSectionId);
  const [data, setData] = useState<ControlCenterResponse | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editingRow, setEditingRow] = useState<EditableSubscriptionRow | null>(null);
  const [isSavingCredits, setIsSavingCredits] = useState(false);
  const [creditModalError, setCreditModalError] = useState<string | null>(null);
  const [inspectingReport, setInspectingReport] = useState<ReportRow | null>(null);
  const [isResolvingReport, setIsResolvingReport] = useState(false);
  const [reportModalError, setReportModalError] = useState<string | null>(null);
  const [inspectingMetadataRow, setInspectingMetadataRow] = useState<MetadataRow | null>(null);
  const [sessionInspectorPayload, setSessionInspectorPayload] = useState<SessionInspectorPayload | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SessionDetail | null>(null);
  const [sessionInspectorError, setSessionInspectorError] = useState<string | null>(null);
  const [isLoadingSessionInspector, setIsLoadingSessionInspector] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const activeSection = menuItems.find((item) => item.id === activeSectionId) ?? menuItems[0];
  const rows = data?.sections[activeSectionId] || [];
  const metadataRows = useMemo(() => (data?.sections.metadata || []) as MetadataRow[], [data?.sections.metadata]);

  useEffect(() => {
    setActiveSectionId(requestedSectionId);
  }, [requestedSectionId]);

  const openSection = (sectionId: string) => {
    const nextSectionId = resolveAdminSectionId(sectionId);
    setActiveSectionId(nextSectionId);

    const params = new URLSearchParams(searchParams.toString());
    if (nextSectionId === defaultAdminSectionId) {
      params.delete("section");
    } else {
      params.set("section", nextSectionId);
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `/brokeoctopus/dashboard?${query}` : "/brokeoctopus/dashboard");
    });
  };

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

  useEffect(() => {
    if (!user || !isAdmin) {
      return;
    }

    let cleanup: (() => void) | undefined;
    let mounted = true;

    const connect = async () => {
      try {
        cleanup = await StreamService.connect({
          onEvent: (event) => {
            if (!mounted) {
              return;
            }
            if (event.type === "admin_reports" || event.type === "sync_reports") {
              void loadDashboard().catch(() => undefined);
            }
          },
        });
      } catch {
        // best effort
      }
    };

    void connect();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [user, isAdmin]);

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
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Failed to refresh admin data.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveCredits = async (payload: { wordCredits: number; humanizerCredits: number; sourceCredits: number }) => {
    if (!editingRow?.userId) {
      setCreditModalError("Missing user identifier for this row.");
      return;
    }

    const token = await AuthService.getIdToken(true);
    if (!token) {
      setCreditModalError("You need to be signed in as an admin.");
      return;
    }

    setIsSavingCredits(true);
    setCreditModalError(null);

    try {
      const response = await fetch(`/api/admin/users/${editingRow.userId}/credits`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = await response.json();
      if (!response.ok) {
        throw new Error(responsePayload.error || "Failed to update credits.");
      }

      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          sections: {
            ...current.sections,
            "subscription-management": (current.sections["subscription-management"] || []).map((row) =>
              row.userId === editingRow.userId
                ? {
                    ...row,
                    word: payload.wordCredits,
                    humanizer: payload.humanizerCredits,
                    source: payload.sourceCredits,
                  }
                : row
            ),
          },
        };
      });

      setEditingRow(null);
    } catch (error) {
      setCreditModalError(error instanceof Error ? error.message : "Failed to update credits.");
    } finally {
      setIsSavingCredits(false);
    }
  };

  const handleResolveReport = async (payload: { reportId: string; method: ResolveMethod; credits?: number; message: string }) => {
    const token = await AuthService.getIdToken(true);
    if (!token) {
      setReportModalError("You need to be signed in as an admin.");
      return;
    }

    setIsResolvingReport(true);
    setReportModalError(null);

    try {
      const backendMethod =
        payload.method === "word" ? "word" : payload.method === "humanizer" ? "humanizer" : payload.method === "source" ? "source" : payload.method;
      const response = await fetch(`/backend/api/v1/admin/reports/${payload.reportId}/resolve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: backendMethod,
          credits: payload.credits,
          message: payload.message,
        }),
      });

      const responsePayload = await response.json();
      if (!response.ok) {
        throw new Error(responsePayload.detail || responsePayload.error || "Failed to resolve report.");
      }

      await loadDashboard();
      setInspectingReport(null);
    } catch (error) {
      setReportModalError(error instanceof Error ? error.message : "Failed to resolve report.");
    } finally {
      setIsResolvingReport(false);
    }
  };

  const loadSessionDetail = async (sessionId: string, token: string) => {
    setIsLoadingSessionInspector(true);
    setSessionInspectorError(null);

    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load session detail.");
      }
      setSelectedSessionId(sessionId);
      setSelectedSessionDetail(payload as SessionDetail);
    } catch (error) {
      setSessionInspectorError(error instanceof Error ? error.message : "Failed to load session detail.");
    } finally {
      setIsLoadingSessionInspector(false);
    }
  };

  const handleInspectMetadata = async (row: MetadataRow) => {
    if (!row.userId) {
      setSessionInspectorError("Missing user identifier for this row.");
      return;
    }

    const token = await AuthService.getIdToken(true);
    if (!token) {
      setSessionInspectorError("You need to be signed in as an admin.");
      return;
    }

    setInspectingMetadataRow(row);
    setSessionInspectorPayload(null);
    setSelectedSessionId(null);
    setSelectedSessionDetail(null);
    setSessionInspectorError(null);
    setIsLoadingSessionInspector(true);

    try {
      const response = await fetch(`/api/admin/users/${row.userId}/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load user sessions.");
      }

      const typedPayload = payload as SessionInspectorPayload;
      setSessionInspectorPayload(typedPayload);
      const firstSessionId = typedPayload.sessions[0]?.id || null;
      if (firstSessionId) {
        await loadSessionDetail(firstSessionId, token);
      } else {
        setIsLoadingSessionInspector(false);
      }
    } catch (error) {
      setSessionInspectorError(error instanceof Error ? error.message : "Failed to load user sessions.");
      setIsLoadingSessionInspector(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    const token = await AuthService.getIdToken(true);
    if (!token) {
      setSessionInspectorError("You need to be signed in as an admin.");
      return;
    }
    await loadSessionDetail(sessionId, token);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const token = await AuthService.getIdToken(true);
    if (!token) {
      setSessionInspectorError("You need to be signed in as an admin.");
      return;
    }

    setDeletingSessionId(sessionId);
    setSessionInspectorError(null);
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete session.");
      }

      const remainingSessions = (sessionInspectorPayload?.sessions || []).filter((session) => session.id !== sessionId);

      setSessionInspectorPayload((current) =>
        current
          ? { ...current, sessions: current.sessions.filter((session) => session.id !== sessionId) }
          : current
      );

      if (selectedSessionId === sessionId) {
        const nextId = remainingSessions[0]?.id || null;
        setSelectedSessionId(nextId);
        setSelectedSessionDetail(null);
        if (nextId) {
          await loadSessionDetail(nextId, token);
        }
      }

      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          sections: {
            ...current.sections,
            metadata: metadataRows
              .map((metadataRow) =>
                metadataRow.userId === inspectingMetadataRow?.userId
                  ? {
                      ...metadataRow,
                      sessions: Math.max(0, Number(metadataRow.sessions || 0) - 1),
                    }
                  : metadataRow
              )
              .filter((metadataRow) => Number(metadataRow.sessions || 0) > 0),
          },
        };
      });
    } catch (error) {
      setSessionInspectorError(error instanceof Error ? error.message : "Failed to delete session.");
    } finally {
      setDeletingSessionId(null);
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
                {menuItems.map((item, index) => {
                  const isActive = item.id === activeSectionId;
                  const previousGroup = index > 0 ? menuItems[index - 1].group : undefined;
                  const showGroupHeading = !sidebarCollapsed && item.group && item.group !== previousGroup;
                  return (
                    <div key={item.id}>
                      {showGroupHeading ? (
                        <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/25">{item.group}</div>
                      ) : null}
                      <button
                        onClick={() => openSection(item.id)}
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
                    </div>
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

              {activeSection.id === "promo-area" ? (
                <PromoAreaPanel refreshKey={refreshKey} mode="promo" />
              ) : activeSection.id === "referral-section" ? (
                <PromoAreaPanel refreshKey={refreshKey} mode="referral" />
              ) : activeSection.id === "events-early-access" ? (
                <EarlyAccessEventsPanel refreshKey={refreshKey} />
              ) : (
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
                              {keyOrderBySection[activeSection.id]?.map((key, cellIndex) => (
                                <td key={`${activeSection.id}-${rowIndex}-${cellIndex}`} className="px-4 py-4 text-sm leading-6 text-white/78">
                                  {activeSection.id === "subscription-management" && key === "actions" && row.userId ? (
                                    <button
                                      onClick={() => {
                                        setCreditModalError(null);
                                        setEditingRow(row as EditableSubscriptionRow);
                                      }}
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#141414] text-white/72 transition hover:border-red-500/35 hover:text-red-300"
                                      title="Edit credits"
                                    >
                                      <PencilIcon />
                                    </button>
                                  ) : activeSection.id === "reports" && key === "action" ? (
                                    <button
                                      onClick={() => {
                                        setReportModalError(null);
                                        setInspectingReport(row as ReportRow);
                                      }}
                                      className="rounded-full border border-white/10 bg-[#141414] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-red-500/35 hover:text-red-300"
                                    >
                                      Inspect
                                    </button>
                                  ) : activeSection.id === "metadata" && key === "action" ? (
                                    <button
                                      onClick={() => {
                                        setSessionInspectorError(null);
                                        void handleInspectMetadata(row as MetadataRow);
                                      }}
                                      className="rounded-full border border-white/10 bg-[#141414] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-red-500/35 hover:text-red-300"
                                    >
                                      Inspect
                                    </button>
                                  ) : (
                                    String(row[key] ?? "-")
                                  )}
                                </td>
                              )) || getOrderedRowValues(activeSection.id, row).map((cell, cellIndex) => (
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
              )}
            </div>
          </div>
        </section>
      </div>
      {editingRow ? (
        <CreditEditModal
          row={editingRow}
          saving={isSavingCredits}
          error={creditModalError}
          onClose={() => {
            if (!isSavingCredits) {
              setEditingRow(null);
              setCreditModalError(null);
            }
          }}
          onSave={handleSaveCredits}
        />
      ) : null}
      {inspectingReport ? (
        <ReportInspectModal
          row={inspectingReport}
          saving={isResolvingReport}
          error={reportModalError}
          onClose={() => {
            if (!isResolvingReport) {
              setInspectingReport(null);
              setReportModalError(null);
            }
          }}
          onSend={handleResolveReport}
        />
      ) : null}
      {inspectingMetadataRow && sessionInspectorPayload ? (
        <SessionInspectModal
          payload={sessionInspectorPayload}
          selectedSessionId={selectedSessionId}
          detail={selectedSessionDetail}
          loading={isLoadingSessionInspector}
          deletingSessionId={deletingSessionId}
          error={sessionInspectorError}
          onClose={() => {
            if (!deletingSessionId) {
              setInspectingMetadataRow(null);
              setSessionInspectorPayload(null);
              setSelectedSessionId(null);
              setSelectedSessionDetail(null);
              setSessionInspectorError(null);
            }
          }}
          onSelectSession={(sessionId) => {
            void handleSelectSession(sessionId);
          }}
          onDeleteSession={(sessionId) => {
            void handleDeleteSession(sessionId);
          }}
        />
      ) : null}
    </main>
  );
}
