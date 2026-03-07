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
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`relative z-20 flex h-[52px] items-center gap-2 rounded-[20px] border px-5 text-sm transition duration-300 ${
          expanded
            ? "border-[#20436b] bg-[#101c2b] text-[#2d8cff] shadow-[0_18px_50px_rgba(45,140,255,0.18)]"
            : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-white/15 hover:text-white/80"
        }`}
      >
        <span className={`transition-colors duration-300 ${expanded ? "text-[#2d8cff]" : "text-white/70"}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d="m4 18 2-9 6 4 6-4 2 9H4Z" />
            <path d="M7 9 4.5 5.5" />
            <path d="M12 9V4.5" />
            <path d="M17 9 19.5 5.5" />
            <circle cx="4.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="19.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span className="font-medium">{planName}</span>
        <svg
          width="12"
          height="12"
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
      </button>

      <div
        className={`pointer-events-none absolute right-0 top-[calc(100%+14px)] z-10 transition-all duration-300 ${
          expanded ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className={`relative min-w-[470px] rounded-[30px] border border-white/10 bg-[#141414]/97 px-8 pb-7 pt-11 shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur-md transition-all duration-300 ${
            expanded ? "translate-y-0 scale-100" : "-translate-y-2 scale-95"
          }`}
        >
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-[54px] items-center gap-2 rounded-full border border-[#20436b] bg-[#101c2b] px-5 text-[#2d8cff] shadow-[0_14px_40px_rgba(45,140,255,0.18)]">
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="m4 18 2-9 6 4 6-4 2 9H4Z" />
                  <path d="M7 9 4.5 5.5" />
                  <path d="M12 9V4.5" />
                  <path d="M17 9 19.5 5.5" />
                  <circle cx="4.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none" />
                  <circle cx="19.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span className="text-[1.05rem] font-semibold">{planName}</span>
              <svg
                width="12"
                height="12"
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
            </div>
          </div>

          <div className="grid grid-cols-3 items-stretch gap-0">
            {credits.map((credit, index) => (
              <div
                key={credit.label}
                className={`flex min-w-[120px] flex-col items-center px-5 text-center transition-all duration-500 ${
                  expanded ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                } ${index !== credits.length - 1 ? "border-r border-white/12" : ""}`}
                style={{
                  transitionDelay: expanded ? `${80 + index * 75}ms` : "0ms",
                }}
              >
                <div className="text-[2.15rem] font-semibold tracking-[-0.07em] text-white">
                  {credit.value.toLocaleString()}
                </div>
                <div className="mt-1 text-[0.78rem] font-semibold text-white/78">{credit.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
