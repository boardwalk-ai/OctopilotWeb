"use client";

import { useState, useRef, useEffect } from "react";

interface Credit {
  label: string;
  value: number;
  color: string;
}

interface PlanInfoProps {
  planName?: string;
  credits?: Credit[];
  defaultExpanded?: boolean;
}

const defaultCredits: Credit[] = [
  { label: "Essay", value: 5000, color: "#ef4444" },
  { label: "Humanizer", value: 5000, color: "#a855f7" },
  { label: "Source", value: 500, color: "#3b82f6" },
];

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

export default function PlanInfo({
  planName = "Guest",
  credits = defaultCredits,
  defaultExpanded = false,
}: PlanInfoProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rootRef = useRef<HTMLDivElement>(null);
  const shellWidth = expanded ? 388 : 138;
  const theme = getPlanTheme(planName);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="group relative flex h-[44px] items-center overflow-hidden rounded-[20px] border transition-[width,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `${shellWidth}px`, borderColor: theme.border, background: theme.background, boxShadow: theme.glow }}
      >
        <span className="pointer-events-none absolute inset-0 opacity-90" style={{ background: theme.overlay }} />
        <span className="relative flex h-full min-w-[138px] items-center gap-2 px-4 text-sm" style={{ color: theme.text }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3">
            <path d="m4 18 2-9 6 4 6-4 2 9H4Z" />
            <path d="M7 9 4.5 5.5" />
            <path d="M12 9V4.5" />
            <path d="M17 9 19.5 5.5" />
            <circle cx="4.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="19.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-[0.9rem] font-semibold tracking-[-0.02em]">{planName}</span>
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>

        <span
          className={`relative flex h-[28px] items-stretch overflow-hidden transition-[max-width,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            expanded ? "max-w-[250px] opacity-100" : "max-w-0 opacity-0"
          }`}
        >
          {credits.map((credit, index) => (
            <span
              key={credit.label}
              className={`flex min-w-[82px] flex-col items-center justify-center px-2 text-center ${
                index !== credits.length - 1 ? "border-l border-white/12" : ""
              }`}
            >
              <span className="text-[0.82rem] font-semibold tracking-[-0.03em] text-white">
                {credit.value.toLocaleString()}
              </span>
              <span className="mt-0.5 text-[0.52rem] font-medium uppercase tracking-[0.22em] text-white/58">
                {credit.label}
              </span>
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}
