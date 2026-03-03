"use client";

import { useState } from "react";
import Image from "next/image";
import {
  AppHeader,
  BackToHome,
  LogoNav,
  NotificationBell,
  PlanInfo,
  StoreButton,
  SaveButton,
  ReportButton,
  UserAvatar,
} from "@/components/header";

interface MethodologyViewProps {
  onBack: () => void;
  onSelect: (method: "automation" | "manual") => void;
}

const automationFeatures = [
  {
    label: "Human-sounding output",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8V4H8" /><path d="M2 12a10 10 0 0 0 10 10" /><path d="M22 12A10 10 0 0 0 12 2" /><path d="M12 12a5 5 0 0 0 5 5" /><path d="M12 12a5 5 0 0 1-5-5" />
      </svg>
    ),
  },
  {
    label: "Built-in research",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    label: "Auto citations",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 17.6V2h12v15.6" /><path d="M6 2H4v18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" />
      </svg>
    ),
  },
  {
    label: "Outline or Auto-Outline",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M9 12h6" /><path d="M9 16h6" />
      </svg>
    ),
  },
  {
    label: "Humanizers",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

const manualFeatures = [
  {
    label: "Outline or Auto-Outline",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M9 12h6" /><path d="M9 16h6" />
      </svg>
    ),
  },
  {
    label: "Writing Chamber",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
      </svg>
    ),
  },
  {
    label: "Auto citations",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 17.6V2h12v15.6" /><path d="M6 2H4v18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" />
      </svg>
    ),
  },
  {
    label: "Built-in research",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    label: "Readable source panel",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18" /><path d="M3 9h9" /><path d="M3 15h9" />
      </svg>
    ),
  },
];

export default function MethodologyView({ onBack, onSelect }: MethodologyViewProps) {
  const [selected, setSelected] = useState<"automation" | "manual">("automation");

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-black">
      <AppHeader
        left={
          <>
            <BackToHome onClick={onBack} />
            <LogoNav />
          </>
        }
        right={
          <>
            <NotificationBell />
            <PlanInfo />
            <StoreButton />
            <SaveButton />
            <ReportButton />
            <UserAvatar />
          </>
        }
      />

      {/* Content */}
      <div className="flex flex-1 flex-col items-center px-6 pt-20">
        {/* Logo */}
        <Image
          src="/OCTOPILOT.png"
          alt="Octopilot"
          width={56}
          height={56}
          className="mb-3"
        />

        {/* Title */}
        <h1 className="mb-1.5 text-2xl font-bold text-white">Methodology</h1>
        <p className="mb-8 text-sm text-white/40">
          Choose your preferred Writing Experience
        </p>

        {/* Two Column Cards Container */}
        <div className="w-full flex-1 mt-4">
          <div className="grid w-full grid-cols-2 gap-6">
            {/* Automation Card */}
            <button
              onClick={() => setSelected("automation")}
              className={`flex flex-col relative rounded-[20px] border p-7 text-left transition-all duration-200 hover:scale-[1.02] ${selected === "automation"
                ? "border-red-500/40 bg-red-500/[0.04]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
                }`}
            >
              <div className="mb-6 flex items-start gap-4 w-full relative">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div className="flex-1 pr-6">
                  <h2 className="text-xl font-bold text-white mb-0.5">Automation Mode</h2>
                  <p className="text-[13px] font-medium text-red-500 mb-2">AI writes. You review.</p>
                  <p className="text-[14px] text-white/60 leading-relaxed pr-2">
                    Let AI generate a complete essay based on your outline and sources. Perfect for quick drafts.
                  </p>
                </div>
                {/* Radio indicator */}
                <div className={`absolute right-0 top-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${selected === "automation" ? "border-red-500" : "border-white/20"
                  }`}>
                  {selected === "automation" && <div className="h-3 w-3 rounded-full bg-red-500" />}
                </div>
              </div>

              <ul className="w-full grid grid-rows-3 grid-flow-col gap-x-2 gap-y-4 pt-4 mt-auto pb-6">
                {automationFeatures.map((f) => (
                  <li key={f.label} className="flex items-center gap-3 text-[13.5px] font-medium text-white/80">
                    <span className="text-red-500 opacity-80">{f.icon}</span>
                    {f.label}
                  </li>
                ))}
              </ul>

              <div className="absolute bottom-7 right-7">
                <span className="rounded-full bg-red-500/20 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-500">
                  Best for Speed
                </span>
              </div>
            </button>

            {/* Manual Writing Card */}
            <button
              onClick={() => setSelected("manual")}
              className={`flex flex-col relative rounded-[20px] border p-7 text-left transition-all duration-200 hover:scale-[1.02] ${selected === "manual"
                ? "border-red-500/40 bg-red-500/[0.04]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
                }`}
            >
              <div className="mb-6 flex items-start gap-4 w-full relative">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
                  </svg>
                </div>
                <div className="flex-1 pr-6">
                  <h2 className="text-xl font-bold text-white mb-0.5">Manual Writing Mode</h2>
                  <p className="text-[13px] font-medium text-red-500 mb-2">We give you the recipe, you do the cooking</p>
                  <p className="text-[14px] text-white/60 leading-relaxed pr-2">
                    Write section by section with AI assistance. Great for learning and skill development.
                  </p>
                </div>
                {/* Radio indicator */}
                <div className={`absolute right-0 top-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${selected === "manual" ? "border-red-500" : "border-white/20"
                  }`}>
                  {selected === "manual" && <div className="h-3 w-3 rounded-full bg-red-500" />}
                </div>
              </div>

              <ul className="w-full grid grid-rows-3 grid-flow-col gap-x-2 gap-y-4 pt-4 mt-auto pb-6">
                {manualFeatures.map((f) => (
                  <li key={f.label} className="flex items-center gap-3 text-[13.5px] font-medium text-white/80">
                    <span className="text-red-500 opacity-80">{f.icon}</span>
                    {f.label}
                  </li>
                ))}
              </ul>

              <div className="absolute bottom-7 right-7">
                <span className="rounded-full bg-red-500/20 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-500">
                  Best for Learning
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Get Started */}
        <div className="pb-6">
          <button
            onClick={() => onSelect(selected)}
            className="flex items-center gap-2.5 rounded-full bg-red-500 px-8 py-3.5 text-[15px] font-bold tracking-wide text-white shadow-[0_0_30px_rgba(239,68,68,0.4)] transition hover:bg-red-400"
          >
            Get Started
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.7 10.7l-4 4a1 1 0 0 1-1.4-1.4l2.3-2.3H6a1 1 0 0 1 0-2h7.6l-2.3-2.3a1 1 0 0 1 1.4-1.4l4 4a1 1 0 0 1 0 1.4z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
