"use client";

import { useState, useRef, useEffect } from "react";
import { AuthService } from "@/services/AuthService";
import { OctopilotAPIService } from "@/services/OctopilotAPIService";
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
  { label: "Essay", value: 50 },
  { label: "Humanizer", value: 50 },
  { label: "Source", value: 5 },
];

type MeResponse = {
  plan?: string | null;
  word_credits?: number | null;
  humanizer_credits?: number | null;
  source_credits?: number | null;
};

type StreamCreditsPayload = {
  plan?: string | null;
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

function mapMeToCredits(payload?: MeResponse | StreamCreditsPayload | null): Credit[] {
  const resolvedPayload = payload as
    | (MeResponse & Partial<StreamCreditsPayload>)
    | (StreamCreditsPayload & Partial<MeResponse>)
    | null
    | undefined;
  const wordCredits = resolvedPayload?.word_credits ?? resolvedPayload?.wordCredits;
  const humanizerCredits = resolvedPayload?.humanizer_credits ?? resolvedPayload?.humanizerCredits;
  const sourceCredits = resolvedPayload?.source_credits ?? resolvedPayload?.sourceCredits;

  return [
    { label: "Essay", value: Number(wordCredits ?? 50) },
    { label: "Humanizer", value: Number(humanizerCredits ?? 50) },
    { label: "Source", value: Number(sourceCredits ?? 5) },
  ];
}

export default function PlanInfo({
  planName = "Guest",
  credits = defaultCredits,
  defaultExpanded = false,
}: PlanInfoProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [resolvedPlanName, setResolvedPlanName] = useState(getDisplayPlanName(planName));
  const [resolvedCredits, setResolvedCredits] = useState<Credit[]>(credits);
  const rootRef = useRef<HTMLDivElement>(null);
  const shellWidth = expanded ? 388 : 138;
  const theme = getPlanTheme(resolvedPlanName);

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
    let cancelled = false;
    let stopStream: (() => void) | undefined;

    const applyPayload = (payload?: MeResponse | StreamCreditsPayload | null) => {
      if (cancelled || !payload) {
        return;
      }

      if (payload.plan) {
        setResolvedPlanName(getDisplayPlanName(payload.plan));
      }
      setResolvedCredits(mapMeToCredits(payload));
    };

    const boot = async () => {
      const currentUser = AuthService.getCurrentUser();
      if (!currentUser) {
        setResolvedPlanName(getDisplayPlanName(planName));
        setResolvedCredits(credits);
        return;
      }

      try {
        const me = await OctopilotAPIService.get<MeResponse>("/api/v1/me");
        applyPayload(me);
      } catch {
        // keep fallback values
      }

      try {
        stopStream = await StreamService.connect({
          onEvent: (event) => {
            if (event.type !== "sync_credits" || !event.data) {
              return;
            }

            try {
              const parsed = JSON.parse(event.data) as StreamCreditsPayload;
              applyPayload(parsed);
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
  }, [credits, planName]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group relative flex h-[46px] items-center overflow-hidden rounded-full border-[1.5px] transition-[width,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `${shellWidth}px`, borderColor: theme.border, background: theme.background, boxShadow: theme.glow }}
      >
        {/* Glow overlay */}
        <span className="pointer-events-none absolute inset-0 opacity-90" style={{ background: theme.overlay }} />
        {/* Inner top edge glow */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-30" style={{ background: `linear-gradient(90deg, transparent, ${theme.text}, transparent)` }} />

        {/* Plan name area — centered */}
        <span className="relative flex h-full min-w-[138px] items-center justify-center gap-2.5 px-4" style={{ color: theme.text }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[14px] w-[14px] shrink-0">
            <path d="m4 18 2-9 6 4 6-4 2 9H4Z" />
            <path d="M7 9 4.5 5.5" />
            <path d="M12 9V4.5" />
            <path d="M17 9 19.5 5.5" />
            <circle cx="4.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="19.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-[0.92rem] font-bold tracking-[-0.01em]">{resolvedPlanName}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>

        {/* Credits panel */}
        <span
          className={`relative flex h-[30px] items-stretch overflow-hidden transition-[max-width,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${expanded ? "max-w-[250px] opacity-100" : "max-w-0 opacity-0"
            }`}
        >
          {resolvedCredits.map((credit, index) => (
            <span
              key={credit.label}
              className={`flex min-w-[82px] flex-col items-center justify-center px-2 text-center ${index === 0 ? "border-l" : index !== credits.length ? "border-l" : ""
                }`}
              style={{ borderColor: `${theme.text}22` }}
            >
              <span className="text-[0.84rem] font-bold tabular-nums tracking-[-0.02em] text-white">
                {credit.value.toLocaleString()}
              </span>
              <span className="mt-px text-[0.5rem] font-semibold uppercase tracking-[0.2em]" style={{ color: `${theme.text}88` }}>
                {credit.label}
              </span>
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}
