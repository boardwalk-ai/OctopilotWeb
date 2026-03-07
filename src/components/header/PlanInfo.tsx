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
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`relative z-20 flex h-[46px] items-center gap-2 rounded-[18px] border px-4 text-[#2d8cff] transition-all duration-300 ${
            expanded
              ? "border-[#20436b]/60 bg-[#101c2b]/96 shadow-[0_14px_32px_rgba(45,140,255,0.12)]"
              : "border-[#20436b]/50 bg-[#101c2b]/96 shadow-[0_14px_32px_rgba(45,140,255,0.12)]"
          }`}
        >
          <span className="text-[#2d8cff]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[13px] w-[13px]">
              <path d="m4 18 2-9 6 4 6-4 2 9H4Z" />
              <path d="M7 9 4.5 5.5" />
              <path d="M12 9V4.5" />
              <path d="M17 9 19.5 5.5" />
              <circle cx="4.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="4.5" r="1" fill="currentColor" stroke="none" />
              <circle cx="19.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span className="text-[0.95rem] font-semibold">{planName}</span>
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
        </button>

        <div
          className={`flex items-center overflow-hidden rounded-[18px] border border-white/10 bg-[#151515]/98 transition-[max-width,opacity,transform,padding,margin] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            expanded
              ? "ml-1 max-w-[230px] translate-x-0 px-2 py-1.5 opacity-100"
              : "pointer-events-none ml-0 max-w-0 translate-x-[-6px] px-0 py-0 opacity-0"
          }`}
        >
          {credits.map((credit, index) => (
            <div
              key={credit.label}
              className={`flex min-w-[72px] flex-col items-center px-2 text-center ${
                index !== credits.length - 1 ? "border-r border-white/12" : ""
              }`}
            >
              <div className="text-[0.88rem] font-semibold tracking-[-0.03em] text-white">
                {credit.value.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-white/60">
                {credit.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
