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
            ? "border-red-500/35 bg-[#130a0a] text-white shadow-[0_18px_50px_rgba(239,68,68,0.18)]"
            : "border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-white/15 hover:text-white/80"
        }`}
      >
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
        className={`pointer-events-none absolute right-[calc(100%+14px)] top-1/2 z-10 flex -translate-y-1/2 items-center gap-3 transition-all duration-400 ${
          expanded ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className={`absolute right-[-10px] top-1/2 h-px bg-gradient-to-r from-transparent via-red-500/45 to-transparent transition-all duration-500 ${
            expanded ? "w-[420px] -translate-y-1/2 opacity-100" : "w-0 -translate-y-1/2 opacity-0"
          }`}
        />

        {credits.map((credit, index) => (
          <article
            key={credit.label}
            className={`relative overflow-hidden rounded-[22px] border border-white/10 bg-[#121212]/96 px-4 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all duration-500 ${
              expanded
                ? "translate-x-0 scale-100 opacity-100"
                : "translate-x-16 scale-90 opacity-0"
            }`}
            style={{
              transitionDelay: expanded ? `${index * 70}ms` : `${(credits.length - index) * 40}ms`,
              width: 140,
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-px opacity-70"
              style={{ background: `linear-gradient(90deg, transparent, ${credit.color}, transparent)` }}
            />
            <div
              className="absolute -right-6 -top-6 h-16 w-16 rounded-full blur-2xl"
              style={{ backgroundColor: `${credit.color}20` }}
            />
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: credit.color }} />
              <span className="text-[11px] uppercase tracking-[0.24em] text-white/32">{credit.label}</span>
            </div>
            <div className="mt-3 text-[1.9rem] font-semibold leading-none tracking-[-0.06em] text-white">
              {credit.value.toLocaleString()}
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/28">credits live</div>
          </article>
        ))}
      </div>
    </div>
  );
}
