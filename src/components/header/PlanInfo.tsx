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
    <div
      ref={rootRef}
      className="relative"
    >
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`group relative z-20 flex h-[48px] items-center gap-2.5 overflow-hidden rounded-[20px] border px-4.5 text-[#2d8cff] transition-all duration-300 ${
            expanded
              ? "border-[#1f62bb] bg-[linear-gradient(90deg,rgba(18,38,64,0.96),rgba(6,18,34,0.98))] shadow-[0_18px_34px_rgba(27,94,181,0.18)]"
              : "border-[#1b58aa] bg-[linear-gradient(90deg,rgba(18,38,64,0.96),rgba(8,22,40,0.98))] shadow-[0_14px_26px_rgba(27,94,181,0.12)] hover:border-[#2a6fd0] hover:shadow-[0_18px_34px_rgba(27,94,181,0.16)]"
          }`}
        >
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(58,130,246,0.12),transparent_38%,transparent_100%)] opacity-90" />
          <span className="text-[#2d8cff]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="relative h-[13px] w-[13px]">
              <path d="m4 18 2-9 6 4 6-4 2 9H4Z" />
              <path d="M7 9 4.5 5.5" />
              <path d="M12 9V4.5" />
              <path d="M17 9 19.5 5.5" />
              <circle cx="4.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="19.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="relative text-[0.98rem] font-semibold tracking-[-0.02em]">{planName}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`relative transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div
          className={`relative flex items-center overflow-hidden rounded-[22px] border border-[#1f62bb] bg-[linear-gradient(90deg,rgba(18,38,64,0.96),rgba(5,17,33,0.98))] shadow-[0_16px_32px_rgba(8,30,63,0.35)] transition-[max-width,opacity,transform,padding,margin] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            expanded
              ? "ml-1.5 max-w-[252px] translate-x-0 px-3 py-2 opacity-100"
              : "pointer-events-none ml-0 max-w-0 translate-x-[-6px] px-0 py-0 opacity-0"
          }`}
        >
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(63,146,255,0.08),transparent_35%,transparent_100%)]" />
          {credits.map((credit, index) => (
            <div
              key={credit.label}
              className={`relative flex min-w-[76px] flex-col items-center px-2.5 text-center ${
                index !== credits.length - 1 ? "border-r border-white/12" : ""
              }`}
            >
              <div className="text-[0.92rem] font-semibold tracking-[-0.03em] text-white">
                {credit.value.toLocaleString()}
              </div>
              <div className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.24em] text-white/58">
                {credit.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
