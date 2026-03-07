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

export default function PlanInfo({
  planName = "Guest",
  credits = defaultCredits,
  defaultExpanded = false,
}: PlanInfoProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rootRef = useRef<HTMLDivElement>(null);
  const shellWidth = expanded ? 410 : 150;

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
        className="group relative flex h-[48px] items-center overflow-hidden rounded-[22px] border border-[#1f62bb] bg-[linear-gradient(90deg,rgba(18,38,64,0.96),rgba(5,17,33,0.98))] shadow-[0_16px_32px_rgba(8,30,63,0.35)] transition-[width,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `${shellWidth}px` }}
      >
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(58,130,246,0.12),transparent_38%,transparent_100%)] opacity-90" />
        <span className="relative flex h-full min-w-[150px] items-center gap-2.5 px-4.5 text-[#2d8cff]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[13px] w-[13px]">
            <path d="m4 18 2-9 6 4 6-4 2 9H4Z" />
            <path d="M7 9 4.5 5.5" />
            <path d="M12 9V4.5" />
            <path d="M17 9 19.5 5.5" />
            <circle cx="4.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="19.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-[0.98rem] font-semibold tracking-[-0.02em]">{planName}</span>
          <svg
            width="10"
            height="10"
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
          className={`relative flex h-[30px] items-stretch overflow-hidden transition-[max-width,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            expanded ? "max-w-[260px] opacity-100" : "max-w-0 opacity-0"
          }`}
        >
          {credits.map((credit, index) => (
            <span
              key={credit.label}
              className={`flex min-w-[86px] flex-col items-center justify-center px-3 text-center ${
                index !== credits.length - 1 ? "border-l border-white/12" : ""
              }`}
            >
              <span className="text-[0.92rem] font-semibold tracking-[-0.03em] text-white">
                {credit.value.toLocaleString()}
              </span>
              <span className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.24em] text-white/58">
                {credit.label}
              </span>
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}
