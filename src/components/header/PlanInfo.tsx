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
      className={`relative transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        expanded ? "w-[286px]" : "w-[150px]"
      }`}
    >
      <div
        className={`overflow-hidden rounded-[24px] border border-white/10 bg-[#141414]/96 shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition-[height,background-color,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          expanded
            ? "h-[84px] rounded-[22px] border-white/12 bg-[#151515]/98 shadow-[0_20px_56px_rgba(0,0,0,0.32)]"
            : "h-[46px] rounded-[18px] border-[#20436b]/50 bg-[#101c2b]/96 shadow-[0_14px_32px_rgba(45,140,255,0.12)]"
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className={`relative z-20 flex w-full items-center gap-2 transition duration-300 ${
            expanded
              ? "h-[38px] justify-center px-4 text-[#2d8cff]"
              : "h-[46px] justify-start px-4 text-[#2d8cff]"
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
          className={`grid grid-cols-3 items-stretch px-3 pb-3 pt-0 transition-all duration-300 ${
            expanded ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
          }`}
        >
          {credits.map((credit, index) => (
            <div
              key={credit.label}
              className={`flex min-w-0 flex-col items-center px-2 text-center ${
                index !== credits.length - 1 ? "border-r border-white/12" : ""
              }`}
            >
              <div className="text-[0.95rem] font-semibold tracking-[-0.04em] text-white">
                {credit.value.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[0.62rem] font-semibold text-white/68">{credit.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
