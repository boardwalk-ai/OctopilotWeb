"use client";

import { useState, useEffect } from "react";
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
    return { dot: "#c084fc", text: "#d8b4fe", ring: "rgba(168, 85, 247, 0.35)" };
  }
  if (normalized.includes("pro")) {
    return { dot: "#facc15", text: "#fde047", ring: "rgba(234, 179, 8, 0.35)" };
  }
  return { dot: "#4f9dff", text: "#93c5fd", ring: "rgba(59, 130, 246, 0.32)" };
}

function getDisplayPlanName(planName: string) {
  const normalized = planName.trim();
  if (!normalized) return "Guest";
  if (/^guest/i.test(normalized)) return "Guest";
  if (/^pro/i.test(normalized)) return "Pro";
  if (/^premium/i.test(normalized)) return "Premium";
  return normalized.replace(/\s+plan$/i, "");
}

function mapMeToCredits(payload?: AccountSnapshot | StreamCreditsPayload | null): Credit[] {
  const resolvedPayload = payload as
    | (AccountSnapshot & Partial<StreamCreditsPayload>)
    | (StreamCreditsPayload & Partial<AccountSnapshot>)
    | null
    | undefined;
  const octo = resolvedPayload?.octo_credits ?? resolvedPayload?.octoCredits;
  return [{ label: "OctoCredits", value: Number(octo ?? 0) }];
}

export default function PlanInfo({ planName = "Guest", credits = defaultCredits }: PlanInfoProps) {
  const [authReadyUser, setAuthReadyUser] = useState<ReturnType<typeof AuthService.getCurrentUser>>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [accountSnapshot, setAccountSnapshot] = useState<AccountSnapshot | null>(() => AccountStateService.read());
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const shouldHoldPlan = !isAuthResolved || (isAuthResolved && !!authReadyUser && !accountSnapshot && isBootstrapping);
  const resolvedPlanName = shouldHoldPlan ? "Loading" : getDisplayPlanName(accountSnapshot?.plan ?? planName);
  const resolvedCredits = accountSnapshot ? mapMeToCredits(accountSnapshot) : credits;
  const balance = Number(resolvedCredits[0]?.value ?? 0);
  const theme = getPlanTheme(shouldHoldPlan ? "Pro" : resolvedPlanName);

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
      if (!isAuthResolved) return;

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
        if (!cancelled) setIsBootstrapping(false);
      }

      // Warm the beta-access cache during the same auth-resolve pass so the
      // methodology screen renders its final card set without a flash later.
      void BetaAccessService.bootstrap();

      try {
        stopStream = await StreamService.connect({
          onEvent: (event) => {
            if (event.type !== "sync_credits" || !event.data) return;
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
    <div
      className="group inline-flex h-9 select-none items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] pl-2.5 pr-3.5 transition-colors duration-300 hover:border-white/[0.16] hover:bg-white/[0.06] max-md:h-8 max-md:gap-2 max-md:pl-2 max-md:pr-2.5"
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05)` }}
    >
      {/* Plan badge */}
      <span className="flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: theme.dot, boxShadow: `0 0 7px ${theme.dot}` }}
        />
        <span
          className={`text-[0.74rem] font-semibold leading-none tracking-[-0.01em] ${shouldHoldPlan ? "animate-pulse" : ""}`}
          style={{ color: theme.text }}
        >
          {resolvedPlanName}
        </span>
      </span>

      {/* Divider */}
      <span className="h-4 w-px bg-white/[0.12]" />

      {/* Credit balance */}
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="rgba(250,204,21,0.14)" stroke="#facc15" strokeWidth="1.6" />
          <path d="M12 7.4l1.35 2.95 3.25.3-2.45 2.15.73 3.2-2.88-1.74-2.88 1.74.73-3.2-2.45-2.15 3.25-.3z" fill="#facc15" />
        </svg>
        <span className="flex items-baseline gap-1.5">
          <span className={`text-[0.92rem] font-bold leading-none tabular-nums tracking-[-0.02em] text-white ${shouldHoldPlan ? "animate-pulse" : ""}`}>
            {shouldHoldPlan ? "•••" : balance.toLocaleString()}
          </span>
          <span className="text-[0.58rem] font-semibold uppercase leading-none tracking-[0.14em] text-white/40 max-md:hidden">
            OctoCredits
          </span>
        </span>
      </span>
    </div>
  );
}
