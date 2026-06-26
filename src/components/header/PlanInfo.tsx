"use client";

import { useState, useEffect, useRef } from "react";
import { AccountSnapshot, AccountStateService } from "@/services/AccountStateService";
import { AuthService } from "@/services/AuthService";
import { BetaAccessService } from "@/services/BetaAccessService";
import { StreamService } from "@/services/StreamService";
import styles from "./PlanInfo.module.css";

interface Credit {
  label: string;
  value: number;
}

interface PlanInfoProps {
  planName?: string;
  credits?: Credit[];
}

const defaultCredits: Credit[] = [{ label: "OctoCredits", value: 0 }];

type StreamCreditsPayload = {
  plan?: string | null;
  octoCredits?: number | null;
  wordCredits?: number | null;
  humanizerCredits?: number | null;
  sourceCredits?: number | null;
};

// Matte, jewel-toned accents per plan — restrained and metallic, not neon.
function getPlanTheme(planName: string) {
  const normalized = planName.toLowerCase();
  if (normalized.includes("premium")) {
    return { dot: "#b69ad8", text: "#d6c6ec", halo: "rgba(182,154,216,0.45)" };
  }
  if (normalized.includes("pro")) {
    return { dot: "#d4b15e", text: "#e7cf95", halo: "rgba(212,177,94,0.5)" };
  }
  return { dot: "#94a6b8", text: "#c2cedb", halo: "rgba(148,166,184,0.4)" };
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

const MATTE_SURFACE: React.CSSProperties = {
  background: "#161719",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 0.5px rgba(255,255,255,0.02), 0 1px 2px rgba(0,0,0,0.5)",
};

// One odometer digit: when the glyph changes it rolls up and out while the new
// glyph rolls in from below. Unchanged digits never animate.
function Digit({ char }: { char: string }) {
  const [view, setView] = useState({ cur: char, prev: null as string | null, n: 0 });

  useEffect(() => {
    setView((value) => (value.cur === char ? value : { cur: char, prev: value.cur, n: value.n + 1 }));
  }, [char]);

  return (
    <span className={styles.reel}>
      {view.prev !== null ? (
        <span key={`out-${view.n}`} className={styles.rollOut}>
          {view.prev}
        </span>
      ) : null}
      <span key={`in-${view.n}`} className={view.n > 0 ? styles.rollIn : undefined}>
        {view.cur}
      </span>
    </span>
  );
}

function RollingNumber({ value }: { value: number }) {
  const text = Math.max(0, Math.round(value)).toLocaleString();
  const chars = text.split("");
  return (
    <span className="inline-flex items-stretch tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
      {chars.map((char, index) => {
        // Key by distance from the right so a digit keeps its identity (and avoids
        // a spurious roll) when the number's length changes across a comma.
        const fromRight = chars.length - index;
        if (!/\d/.test(char)) {
          return (
            <span key={`sep-${fromRight}`} className="px-[0.01em]">
              {char}
            </span>
          );
        }
        return <Digit key={`digit-${fromRight}`} char={char} />;
      })}
    </span>
  );
}

export default function PlanInfo({ planName = "Guest", credits = defaultCredits }: PlanInfoProps) {
  const [authReadyUser, setAuthReadyUser] = useState<ReturnType<typeof AuthService.getCurrentUser>>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [accountSnapshot, setAccountSnapshot] = useState<AccountSnapshot | null>(() => AccountStateService.read());
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [delta, setDelta] = useState<{ amount: number; id: number } | null>(null);
  const prevBalanceRef = useRef<number | null>(null);
  const deltaIdRef = useRef(0);

  const shouldHoldPlan = !isAuthResolved || (isAuthResolved && !!authReadyUser && !accountSnapshot && isBootstrapping);
  const resolvedPlanName = shouldHoldPlan ? "Loading" : getDisplayPlanName(accountSnapshot?.plan ?? planName);
  const resolvedCredits = accountSnapshot ? mapMeToCredits(accountSnapshot) : credits;
  const balance = Number(resolvedCredits[0]?.value ?? 0);
  const theme = getPlanTheme(shouldHoldPlan ? "Pro" : resolvedPlanName);

  // Flash a coloured delta (-630 / +500) whenever the balance moves.
  useEffect(() => {
    const previous = prevBalanceRef.current;
    if (previous !== null && !shouldHoldPlan && balance !== previous) {
      const diff = balance - previous;
      if (diff !== 0) {
        deltaIdRef.current += 1;
        setDelta({ amount: diff, id: deltaIdRef.current });
      }
    }
    prevBalanceRef.current = balance;
  }, [balance, shouldHoldPlan]);

  useEffect(() => {
    if (!delta) return;
    const timeout = window.setTimeout(() => {
      setDelta((current) => (current && current.id === delta.id ? null : current));
    }, 1700);
    return () => window.clearTimeout(timeout);
  }, [delta]);

  useEffect(() => {
    setAccountSnapshot(AccountStateService.read());
    const unsubscribeAccount = AccountStateService.subscribe((snapshot) => setAccountSnapshot(snapshot));
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
    <div className="flex items-center gap-2.5 max-md:gap-1.5">
      {/* Plan badge — standalone */}
      <div
        className={`${styles.mountIn} inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.06] pl-2.5 pr-3 transition-colors duration-300 hover:border-white/[0.13] max-md:h-8 max-md:pr-2.5`}
        style={MATTE_SURFACE}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: theme.dot, boxShadow: `0 0 0 2px ${theme.dot}1f, 0 0 7px ${theme.halo}` }}
        />
        <span
          className={`text-[0.72rem] font-semibold uppercase leading-none tracking-[0.11em] ${shouldHoldPlan ? "animate-pulse" : ""}`}
          style={{ color: theme.text }}
        >
          {resolvedPlanName}
        </span>
      </div>

      {/* Credit balance — standalone */}
      <div
        className={`${styles.mountIn} inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.06] pl-2.5 pr-3.5 transition-colors duration-300 hover:border-white/[0.13] max-md:h-8 max-md:pr-2.5`}
        style={{ ...MATTE_SURFACE, animationDelay: "70ms" }}
      >
        <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="#2a2410" stroke="#caa45a" strokeWidth="1.5" />
          <path d="M12 7.6l1.3 2.85 3.1.28-2.35 2.05.7 3.05-2.75-1.67-2.75 1.67.7-3.05L9.6 10.73l3.1-.28z" fill="#d4b15e" />
        </svg>

        <span className="flex items-baseline gap-1.5 leading-none">
          <span className={`text-[0.92rem] font-bold leading-none tracking-[-0.01em] text-[#f5f5f6] ${shouldHoldPlan ? "animate-pulse" : ""}`}>
            {shouldHoldPlan ? "•••" : <RollingNumber value={balance} />}
          </span>
          <span className="text-[0.56rem] font-semibold uppercase leading-none tracking-[0.14em] text-white/35 max-md:hidden">
            OctoCredits
          </span>
        </span>

        {/* Spend / top-up delta */}
        {delta ? (
          <span
            key={delta.id}
            className={`${styles.deltaPop} ml-0.5 text-[0.68rem] font-bold leading-none tabular-nums ${
              delta.amount < 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {delta.amount > 0 ? "+" : ""}
            {delta.amount.toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}
