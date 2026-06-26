"use client";

import { useState, useRef, useEffect } from "react";
import { AccountSnapshot, AccountStateService } from "@/services/AccountStateService";
import { AuthService } from "@/services/AuthService";
import { BetaAccessService } from "@/services/BetaAccessService";
import { StreamService } from "@/services/StreamService";

interface Credit {
  label: string;
  value: number;
}

interface PlanInfoProps {
  planName?: string;
  credits?: Credit[];
  defaultExpanded?: boolean;
}

const defaultCredits: Credit[] = [
  { label: "OctoCredits", value: 0 },
];

type StreamCreditsPayload = {
  plan?: string | null;
  octoCredits?: number | null;
  wordCredits?: number | null;
  humanizerCredits?: number | null;
  sourceCredits?: number | null;
};

function getPlanTheme(planName: string) {
  const normalized = planName.toLowerCase();

  if (normalized.includes("premium")) {
    return {
      border: "#7c3aed",
      text: "#c084fc",
      background: "linear-gradient(90deg, rgba(44, 18, 78, 0.98), rgba(24, 10, 45, 0.98))",
      glow: "0 16px 32px rgba(124, 58, 237, 0.24)",
      overlay: "linear-gradient(90deg, rgba(192, 132, 252, 0.14), transparent 42%, transparent 100%)",
    };
  }

  if (normalized.includes("pro")) {
    return {
      border: "#eab308",
      text: "#facc15",
      background: "linear-gradient(90deg, rgba(68, 50, 7, 0.98), rgba(38, 27, 4, 0.98))",
      glow: "0 16px 32px rgba(234, 179, 8, 0.2)",
      overlay: "linear-gradient(90deg, rgba(250, 204, 21, 0.12), transparent 42%, transparent 100%)",
    };
  }

  return {
    border: "#1f62bb",
    text: "#4f9dff",
    background: "linear-gradient(90deg, rgba(16, 41, 74, 0.98), rgba(7, 24, 46, 0.98))",
    glow: "0 16px 32px rgba(31, 98, 187, 0.24)",
    overlay: "linear-gradient(90deg, rgba(79, 157, 255, 0.12), transparent 42%, transparent 100%)",
  };
}

function getDisplayPlanName(planName: string) {
  const normalized = planName.trim();
  if (!normalized) {
    return "Guest";
  }
  if (/^guest/i.test(normalized)) {
    return "Guest";
  }
  if (/^pro/i.test(normalized)) {
    return "Pro";
  }
  if (/^premium/i.test(normalized)) {
    return "Premium";
  }
  return normalized.replace(/\s+plan$/i, "");
}

function mapMeToCredits(payload?: AccountSnapshot | StreamCreditsPayload | null): Credit[] {
  const resolvedPayload = payload as
    | (AccountSnapshot & Partial<StreamCreditsPayload>)
    | (StreamCreditsPayload & Partial<AccountSnapshot>)
    | null
    | undefined;
  const octo = resolvedPayload?.octo_credits ?? resolvedPayload?.octoCredits;
  return [
    { label: "OctoCredits", value: Number(octo ?? 0) },
  ];
}

export default function PlanInfo({
  planName = "Guest",
  credits = defaultCredits,
  defaultExpanded = false,
}: PlanInfoProps) {
  const [authReadyUser, setAuthReadyUser] = useState<ReturnType<typeof AuthService.getCurrentUser>>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [accountSnapshot, setAccountSnapshot] = useState<AccountSnapshot | null>(() => AccountStateService.read());
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldHoldPlan = !isAuthResolved || (isAuthResolved && !!authReadyUser && !accountSnapshot && isBootstrapping);
  const resolvedPlanName = shouldHoldPlan
    ? "Loading"
    : getDisplayPlanName(accountSnapshot?.plan ?? planName);
  const resolvedCredits = accountSnapshot ? mapMeToCredits(accountSnapshot) : credits;
  const theme = getPlanTheme(shouldHoldPlan ? "Pro" : resolvedPlanName);
  const balance = Number(resolvedCredits[0]?.value ?? 0);
  const isPro = /^pro/i.test(resolvedPlanName);
  const renewalDate = (() => {
    const raw = accountSnapshot?.subscription_end_date;
    if (!isPro || !raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  })();

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    setAccountSnapshot(AccountStateService.read());
    const unsubscribeAccount = AccountStateService.subscribe((snapshot) => {
      setAccountSnapshot(snapshot);
    });
    const unsubscribeAuth = AuthService.subscribe((nextUser) => {
      setAuthReadyUser(nextUser);
      setIsAuthResolved(true);
    });

    setAuthReadyUser(AuthService.getCurrentUser());
    setIsAuthResolved(true);

    return () => {
      unsubscribeAccount();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stopStream: (() => void) | undefined;

    const boot = async () => {
      if (!isAuthResolved) {
        return;
      }

      const currentUser = authReadyUser;
      if (!currentUser) {
        AccountStateService.clear();
        BetaAccessService.clear();
        setIsBootstrapping(false);
        return;
      }

      setIsBootstrapping(!AccountStateService.hasHydratedCurrentUser() && !AccountStateService.read());

      try {
        await AccountStateService.bootstrap();
      } catch {
        // Keep the previous cached state if bootstrap fails.
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }

      // Warm the beta-access cache during the same auth-resolve pass so the
      // methodology screen renders its final card set without a flash later.
      void BetaAccessService.bootstrap();

      try {
        stopStream = await StreamService.connect({
          onEvent: (event) => {
            if (event.type !== "sync_credits" || !event.data) {
              return;
            }

            try {
              const parsed = JSON.parse(event.data) as StreamCreditsPayload;
              AccountStateService.write(parsed);
            } catch {
              // ignore malformed events
            }
          },
        });
      } catch {
        // stream is optional; fallback stays functional without it
      }
    };

    void boot();

    return () => {
      cancelled = true;
      stopStream?.();
    };
  }, [authReadyUser, isAuthResolved]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="group relative flex items-center gap-1.5 overflow-hidden rounded-full border py-[5px] pl-[5px] pr-2.5 transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-px active:translate-y-0"
        style={{ borderColor: `${theme.border}66`, background: theme.background, boxShadow: theme.glow }}
      >
        {/* Accent wash + top hairline */}
        <span className="pointer-events-none absolute inset-0 opacity-80" style={{ background: theme.overlay }} />
        <span className="pointer-events-none absolute inset-x-4 top-0 h-px opacity-50" style={{ background: `linear-gradient(90deg, transparent, ${theme.text}, transparent)` }} />

        {/* Plan badge */}
        <span
          className="relative flex items-center gap-1.5 rounded-full px-2.5 py-[3px]"
          style={{ background: `${theme.text}1f`, boxShadow: `inset 0 0 0 1px ${theme.text}26` }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: theme.text, boxShadow: `0 0 7px ${theme.text}` }} />
          <span
            className={`text-[0.74rem] font-bold leading-none tracking-[-0.01em] ${shouldHoldPlan ? "animate-pulse" : ""}`}
            style={{ color: theme.text }}
          >
            {resolvedPlanName}
          </span>
        </span>

        {/* Balance */}
        <span className="relative ml-0.5 flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" fill="none">
            <circle cx="12" cy="12" r="9" fill={`${theme.text}1f`} stroke={theme.text} strokeWidth="1.6" />
            <path d="M12 7.5l1.3 2.9 3.2.3-2.4 2.1.7 3.1-2.8-1.7-2.8 1.7.7-3.1-2.4-2.1 3.2-.3z" fill={theme.text} />
          </svg>
          <span className="flex items-baseline gap-1">
            <span className={`text-[0.92rem] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-white ${shouldHoldPlan ? "animate-pulse" : ""}`}>
              {shouldHoldPlan ? "•••" : balance.toLocaleString()}
            </span>
            <span className="text-[0.56rem] font-bold uppercase leading-none tracking-[0.16em]" style={{ color: `${theme.text}b0` }}>
              OC
            </span>
          </span>
        </span>

        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke={`${theme.text}cc`}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`relative ml-0.5 shrink-0 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Wallet popover */}
      <div
        className={`absolute right-0 top-[calc(100%+10px)] z-[70] w-[252px] origin-top-right rounded-2xl border p-4 transition-all duration-200 ease-out ${
          expanded ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-[0.97] opacity-0"
        }`}
        style={{
          borderColor: `${theme.border}55`,
          background: "linear-gradient(180deg, rgba(17,17,20,0.98), rgba(9,9,11,0.98))",
          boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px ${theme.text}14`,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-white/40">OctoCredits</span>
          <span
            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.62rem] font-bold tracking-[-0.01em]"
            style={{ background: `${theme.text}1c`, color: theme.text }}
          >
            <span className="h-1 w-1 rounded-full" style={{ background: theme.text }} />
            {resolvedPlanName}
          </span>
        </div>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[1.7rem] font-extrabold leading-none tabular-nums tracking-[-0.04em] text-white">
            {shouldHoldPlan ? "•••" : balance.toLocaleString()}
          </span>
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-white/35">credits</span>
        </div>

        <div className="mt-3 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${theme.text}33, transparent)` }} />

        <p className="mt-3 text-[0.7rem] leading-relaxed text-white/45">
          {renewalDate ? (
            <>Renews on <span className="font-semibold text-white/70">{renewalDate}</span>.</>
          ) : isPro ? (
            <>Your Pro plan refills 1,000 credits every cycle.</>
          ) : (
            <>100 credits = <span className="font-semibold text-white/70">$1</span> of usage. Top up anytime in the Store.</>
          )}
        </p>
      </div>
    </div>
  );
}
