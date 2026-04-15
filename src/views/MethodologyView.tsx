"use client";

import { useState } from "react";
import Image from "next/image";
import { useOrganizer } from "@/hooks/useOrganizer";
import {
  AppHeader,
  LogoNav,
  MainHeaderActions,
} from "@/components/header";
import styles from "./MethodologyViewMobile.module.css";

interface MethodologyViewProps {
  onSelect: (method: "automation" | "manual" | "ghostwriter") => void;
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

const ghostwriterFeatures = [
  {
    label: "Human-sounding output",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  {
    label: "Adaptive tone matching",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18" /><path d="M5 8c0-2.5 1.8-4 4-4 1.8 0 3.2.8 4 2 0.8-1.2 2.2-2 4-2 2.2 0 4 1.5 4 4s-1.8 4-4 4c-1.8 0-3.2-.8-4-2-.8 1.2-2.2 2-4 2-2.2 0-4-1.5-4-4Z" />
      </svg>
    ),
  },
  {
    label: "Draft polishing",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m4 20 4.5-1 9.7-9.7a2.1 2.1 0 1 0-3-3L5.5 16 4 20Z" /><path d="m13.5 6.5 4 4" />
      </svg>
    ),
  },
  {
    label: "Built-in citations",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 17.6V2h12v15.6" /><path d="M6 2H4v18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" />
      </svg>
    ),
  },
  {
    label: "Revision-focused flow",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v5h5" />
      </svg>
    ),
  },
];

export default function MethodologyView({ onSelect }: MethodologyViewProps) {
  const org = useOrganizer();
  const [selected, setSelected] = useState<"automation" | "manual" | "ghostwriter">(org.writingMode || "automation");

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden bg-black ${styles.methodologyShell}`}>
      <AppHeader
        className={styles.methodologyHeader}
        left={<LogoNav />}
        right={<MainHeaderActions />}
      />

      {/* Content */}
      <div className={`flex flex-1 flex-col items-center px-6 pt-20 ${styles.methodologyContent}`}>
        {/* Logo */}
        <Image
          src="/OCTOPILOT.png"
          alt="Octopilot"
          width={56}
          height={56}
          className={`mb-3 ${styles.methodologyMascot}`}
        />

        {/* Title */}
        <h1 className={`mb-1.5 text-2xl font-bold text-white ${styles.methodologyTitle}`}>Methodology</h1>
        <p className={`mb-8 text-sm text-white/40 ${styles.methodologySubtitle}`}>
          Choose your preferred Writing Experience
        </p>

        {/* Two Column Cards Container */}
        <div className={`w-full flex-1 mt-4 ${styles.methodologySelection}`}>
          <div className={`grid w-full grid-cols-1 gap-6 md:grid-cols-3 ${styles.methodologyGrid}`}>
            {/* Automation Card */}
            <button
              onClick={() => setSelected("automation")}
              className={`flex flex-col relative rounded-[20px] border p-7 text-left transition-all duration-200 hover:scale-[1.02] ${styles.methodologyCard} ${selected === "automation"
                ? "border-red-500/40 bg-red-500/[0.04]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
                }`}
            >
              <div className={`mb-6 flex items-start gap-4 w-full relative ${styles.methodologyCardTop}`}>
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ${styles.methodologyIconBox}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div className={`flex-1 pr-6 ${styles.methodologyCopy}`}>
                  <h2 className={`text-xl font-bold text-white mb-0.5 ${styles.methodologyCardTitle}`}>Automation Mode</h2>
                  <p className={`text-[13px] font-medium text-red-500 mb-2 ${styles.methodologyLead}`}>AI writes. You review.</p>
                  <p className={`text-[14px] text-white/60 leading-relaxed pr-2 ${styles.methodologyBody}`}>
                    Let AI generate a complete essay based on your outline and sources. Perfect for quick drafts.
                  </p>
                </div>
                {/* Radio indicator */}
                <div className={`absolute right-0 top-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${styles.methodologyRadio} ${selected === "automation" ? "border-red-500" : "border-white/20"
                  }`}>
                  {selected === "automation" && <div className="h-3 w-3 rounded-full bg-red-500" />}
                </div>
              </div>

              <ul className={`w-full grid grid-rows-3 grid-flow-col gap-x-2 gap-y-4 pt-4 mt-auto pb-6 ${styles.methodologyFeatures}`}>
                {automationFeatures.map((f) => (
                  <li key={f.label} className={`flex items-center gap-3 text-[13.5px] font-medium text-white/80 ${styles.methodologyFeature}`}>
                    <span className={`text-red-500 opacity-80 ${styles.methodologyFeatureIcon}`}>{f.icon}</span>
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>

              <div className={`absolute bottom-7 right-7 ${styles.methodologyBadgeWrap}`}>
                <span className={`rounded-full bg-red-500/20 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-500 ${styles.methodologyBadge}`}>
                  Best for Speed
                </span>
              </div>
            </button>

            {/* Manual Writing Card */}
            <button
              onClick={() => setSelected("manual")}
              className={`flex flex-col relative rounded-[20px] border p-7 text-left transition-all duration-200 hover:scale-[1.02] ${styles.methodologyCard} ${selected === "manual"
                ? "border-red-500/40 bg-red-500/[0.04]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
                }`}
            >
              <div className={`mb-6 flex items-start gap-4 w-full relative ${styles.methodologyCardTop}`}>
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ${styles.methodologyIconBox}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
                  </svg>
                </div>
                <div className={`flex-1 pr-6 ${styles.methodologyCopy}`}>
                  <h2 className={`text-xl font-bold text-white mb-0.5 ${styles.methodologyCardTitle}`}>Manual Writing Mode</h2>
                  <p className={`text-[13px] font-medium text-red-500 mb-2 ${styles.methodologyLead}`}>We give you the recipe, you do the cooking</p>
                  <p className={`text-[14px] text-white/60 leading-relaxed pr-2 ${styles.methodologyBody}`}>
                    Write section by section with AI assistance. Great for learning and skill development.
                  </p>
                </div>
                {/* Radio indicator */}
                <div className={`absolute right-0 top-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${styles.methodologyRadio} ${selected === "manual" ? "border-red-500" : "border-white/20"
                  }`}>
                  {selected === "manual" && <div className="h-3 w-3 rounded-full bg-red-500" />}
                </div>
              </div>

              <ul className={`w-full grid grid-rows-3 grid-flow-col gap-x-2 gap-y-4 pt-4 mt-auto pb-6 ${styles.methodologyFeatures}`}>
                {manualFeatures.map((f) => (
                  <li key={f.label} className={`flex items-center gap-3 text-[13.5px] font-medium text-white/80 ${styles.methodologyFeature}`}>
                    <span className={`text-red-500 opacity-80 ${styles.methodologyFeatureIcon}`}>{f.icon}</span>
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>

              <div className={`absolute bottom-7 right-7 ${styles.methodologyBadgeWrap}`}>
                <span className={`rounded-full bg-red-500/20 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-500 ${styles.methodologyBadge}`}>
                  Best for Learning
                </span>
              </div>
            </button>

            {/* Ghostwriter Card */}
            <button
              onClick={() => {
                setSelected("ghostwriter");
                onSelect("ghostwriter");
              }}
              className={`flex flex-col relative rounded-[20px] border p-7 text-left transition-all duration-200 hover:scale-[1.02] ${styles.methodologyCard} ${selected === "ghostwriter"
                ? "border-red-500/40 bg-red-500/[0.04]"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
                }`}
            >
              <div className={`mb-6 flex items-start gap-4 w-full relative ${styles.methodologyCardTop}`}>
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ${styles.methodologyIconBox}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 20 4.5-1 9.7-9.7a2.1 2.1 0 1 0-3-3L5.5 16 4 20Z" />
                    <path d="m13.5 6.5 4 4" />
                  </svg>
                </div>
                <div className={`flex-1 pr-6 ${styles.methodologyCopy}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className={`text-xl font-bold text-white ${styles.methodologyCardTitle}`}>Ghostwriter</h2>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                      Beta
                    </span>
                  </div>
                  <p className={`text-[13px] font-medium text-red-500 mb-2 ${styles.methodologyLead}`}>You steer the idea. AI sharpens the prose.</p>
                  <p className={`text-[14px] text-white/60 leading-relaxed pr-2 ${styles.methodologyBody}`}>
                    A revision-first writing mode for reshaping drafts, tightening tone, and polishing sections with guided AI help.
                  </p>
                </div>
                <div className={`absolute right-0 top-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${styles.methodologyRadio} ${selected === "ghostwriter" ? "border-red-500" : "border-white/20"
                  }`}>
                  {selected === "ghostwriter" && <div className="h-3 w-3 rounded-full bg-red-500" />}
                </div>
              </div>

              <ul className={`w-full grid grid-rows-3 grid-flow-col gap-x-2 gap-y-4 pt-4 mt-auto pb-6 ${styles.methodologyFeatures}`}>
                {ghostwriterFeatures.map((f) => (
                  <li key={f.label} className={`flex items-center gap-3 text-[13.5px] font-medium text-white/80 ${styles.methodologyFeature}`}>
                    <span className={`text-red-500 opacity-80 ${styles.methodologyFeatureIcon}`}>{f.icon}</span>
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>

              <div className={`absolute bottom-7 right-7 ${styles.methodologyBadgeWrap}`}>
                <span className={`rounded-full bg-emerald-500/20 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300 ${styles.methodologyBadge}`}>
                  Beta
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Get Started */}
        <div className={`pb-6 ${styles.methodologyFooter}`}>
          <button
            onClick={() => onSelect(selected)}
            className={`flex items-center gap-2.5 rounded-full bg-red-500 px-8 py-3.5 text-[15px] font-bold tracking-wide text-white shadow-[0_0_30px_rgba(239,68,68,0.4)] transition hover:bg-red-400 ${styles.methodologyCta}`}
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
