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
    <div ref={rootRef} className="relative h-[52px] w-[156px]">
      <div
        className={`absolute right-0 top-0 z-20 overflow-hidden rounded-[24px] border border-white/10 bg-[#141414]/96 shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-[width,height,background-color,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          expanded
            ? "h-[106px] w-[360px] border-white/12 bg-[#151515]/98 shadow-[0_24px_70px_rgba(0,0,0,0.36)]"
            : "h-[52px] w-[156px] border-[#20436b]/50 bg-[#101c2b]/96 shadow-[0_14px_32px_rgba(45,140,255,0.12)]"
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className={`relative z-20 flex h-[52px] w-full items-center gap-2 px-5 text-sm transition duration-300 ${
            expanded ? "justify-center text-[#2d8cff]" : "justify-start text-[#2d8cff]"
          }`}
        >
          <span className="text-[#2d8cff]">
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
          <span className="font-semibold">{planName}</span>
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
          className={`grid grid-cols-3 items-stretch px-4 pb-4 pt-1 transition-all duration-300 ${
            expanded ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
          }`}
        >
          {credits.map((credit, index) => (
            <div
              key={credit.label}
              className={`flex min-w-0 flex-col items-center px-4 text-center ${
                index !== credits.length - 1 ? "border-r border-white/12" : ""
              }`}
            >
              <div className="text-[1.15rem] font-semibold tracking-[-0.05em] text-white">
                {credit.value.toLocaleString()}
              </div>
              <div className="mt-1 text-[0.72rem] font-semibold text-white/70">{credit.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
