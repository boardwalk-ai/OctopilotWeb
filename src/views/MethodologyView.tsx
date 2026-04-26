"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { User } from "firebase/auth";
import {
  Zap,
  PenLine,
  GhostIcon,
  Monitor,
} from "lucide-react";
import { useOrganizer } from "@/hooks/useOrganizer";
import { AuthService } from "@/services/AuthService";
import {
  AppHeader,
  LogoNav,
  MainHeaderActions,
} from "@/components/header";
import RadialOrbitalTimeline, { type TimelineItem } from "@/components/ui/radial-orbital-timeline";
import styles from "./MethodologyViewMobile.module.css";

interface MethodologyViewProps {
  onSelect: (method: "automation" | "manual" | "ghostwriter" | "octopilotslides") => void;
}

type BetaAccessFeatures = {
  ghostwriter: boolean;
  octopilotSlides: boolean;
};

const DEFAULT_BETA_ACCESS: BetaAccessFeatures = {
  ghostwriter: false,
  octopilotSlides: false,
};

export default function MethodologyView({ onSelect }: MethodologyViewProps) {
  const org = useOrganizer();
  const [selected, setSelected] = useState<"automation" | "manual" | "ghostwriter" | "octopilotslides">(
    org.writingMode || "automation"
  );
  const [user, setUser] = useState<User | null>(() => AuthService.getCurrentUser());
  const [betaAccess, setBetaAccess] = useState<BetaAccessFeatures>(DEFAULT_BETA_ACCESS);
  const canSeeGhostwriter = betaAccess.ghostwriter;
  const canSeeOctopilotSlides = betaAccess.octopilotSlides;

  const effectiveSelected = (() => {
    if (!canSeeGhostwriter && selected === "ghostwriter") return "automation" as const;
    if (!canSeeOctopilotSlides && selected === "octopilotslides") return "automation" as const;
    return selected;
  })();

  useEffect(() => {
    return AuthService.subscribe(setUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBetaAccess = async () => {
      if (!user) {
        if (!cancelled) setBetaAccess(DEFAULT_BETA_ACCESS);
        return;
      }

      try {
        const token = await AuthService.getIdToken();
        if (!token) {
          if (!cancelled) setBetaAccess(DEFAULT_BETA_ACCESS);
          return;
        }

        const response = await fetch("/api/beta-access/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) setBetaAccess(DEFAULT_BETA_ACCESS);
          return;
        }

        const payload = (await response.json()) as { features?: Partial<BetaAccessFeatures> };
        if (cancelled) return;
        setBetaAccess({
          ghostwriter: Boolean(payload.features?.ghostwriter),
          octopilotSlides: Boolean(payload.features?.octopilotSlides),
        });
      } catch {
        if (!cancelled) setBetaAccess(DEFAULT_BETA_ACCESS);
      }
    };

    void loadBetaAccess();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Map modes to orbital timeline data
  const allModes: (TimelineItem & { key: "automation" | "manual" | "ghostwriter" | "octopilotslides" })[] = [
    {
      id: 1,
      key: "automation",
      title: "Automation",
      date: "Best for Speed",
      content: "Let AI generate a complete essay based on your outline and sources. Perfect for quick drafts with human-sounding output, built-in research, and auto citations.",
      category: "Mode",
      icon: Zap,
      relatedIds: [2],
      status: "completed",
      energy: 100,
    },
    {
      id: 2,
      key: "manual",
      title: "Manual Writing",
      date: "Best for Learning",
      content: "Write section by section with AI assistance. Great for skill development — you get the recipe, you do the cooking. Includes Writing Chamber and readable source panel.",
      category: "Mode",
      icon: PenLine,
      relatedIds: [1],
      status: "completed",
      energy: 80,
    },
    ...(canSeeGhostwriter
      ? [
          {
            id: 3,
            key: "ghostwriter" as const,
            title: "Ghostwriter",
            date: "Beta",
            content: "A revision-first writing mode for reshaping drafts, tightening tone, and polishing sections with guided AI help. You steer the idea. AI sharpens the prose.",
            category: "Mode",
            icon: GhostIcon,
            relatedIds: [1, 2],
            status: "in-progress" as const,
            energy: 65,
          },
        ]
      : []),
    ...(canSeeOctopilotSlides
      ? [
          {
            id: 4,
            key: "octopilotslides" as const,
            title: "OctopilotSlides",
            date: "Beta",
            content: "Turn your research and outlines into polished slide decks — with speaker notes, citations, and export-ready formatting. Your ideas, beautifully presented.",
            category: "Mode",
            icon: Monitor,
            relatedIds: [1, 2],
            status: "pending" as const,
            energy: 40,
          },
        ]
      : []),
  ];

  const selectedNodeId = allModes.find((m) => m.key === effectiveSelected)?.id ?? 1;

  const modeColorMap: Record<string, string> = {
    automation: "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:bg-red-400",
    manual: "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:bg-red-400",
    ghostwriter: "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:bg-red-400",
    octopilotslides: "bg-violet-500 shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:bg-violet-400",
  };

  const selectedMode = allModes.find((m) => m.id === selectedNodeId);

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden bg-black ${styles.methodologyShell}`}>
      <AppHeader
        className={styles.methodologyHeader}
        left={<LogoNav />}
        right={<MainHeaderActions />}
      />

      {/* Main content: orbital on left, info panel on right */}
      <div className={`flex flex-1 overflow-hidden pt-16 ${styles.methodologyContent}`}>

        {/* Left — orbital timeline */}
        <div className="relative flex-1 flex flex-col items-center justify-center">

          {/* Header text floating above the orbit */}
          <div className="absolute top-8 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
            <Image
              src="/OCTOPILOT.png"
              alt="Octopilot"
              width={40}
              height={40}
              className="mb-2 opacity-80"
            />
            <h1 className="text-xl font-bold text-white tracking-tight">Methodology</h1>
            <p className="text-xs text-white/40 mt-0.5">Choose your writing experience</p>
          </div>

          <RadialOrbitalTimeline
            timelineData={allModes}
            selectedId={selectedNodeId}
            onSelect={(id) => {
              const mode = allModes.find((m) => m.id === id);
              if (mode) setSelected(mode.key);
            }}
          />
        </div>

        {/* Right — selected mode info panel */}
        <div className="w-80 flex flex-col justify-center pr-10 gap-6 shrink-0">
          {selectedMode ? (
            <div className="flex flex-col gap-4">
              {/* Mode name + badge */}
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    selectedMode.key === "octopilotslides"
                      ? "bg-violet-500/10"
                      : "bg-red-500/10"
                  }`}
                >
                  <selectedMode.icon
                    size={20}
                    className={selectedMode.key === "octopilotslides" ? "text-violet-400" : "text-red-500"}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white leading-tight">{selectedMode.title}</h2>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      selectedMode.key === "octopilotslides"
                        ? "text-violet-400"
                        : "text-red-500"
                    }`}
                  >
                    {selectedMode.date}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-white/60 leading-relaxed">
                {selectedMode.content}
              </p>

              {/* Capability bar */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs text-white/40">
                  <span>Capability</span>
                  <span className="font-mono">{selectedMode.energy}%</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      selectedMode.key === "octopilotslides"
                        ? "bg-gradient-to-r from-violet-500 to-purple-400"
                        : "bg-gradient-to-r from-red-500 to-orange-400"
                    }`}
                    style={{ width: `${selectedMode.energy}%` }}
                  />
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={() => onSelect(effectiveSelected)}
                className={`mt-2 flex items-center justify-center gap-2.5 rounded-full px-8 py-3.5 text-[15px] font-bold tracking-wide text-white transition ${modeColorMap[effectiveSelected]}`}
              >
                Get Started
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.7 10.7l-4 4a1 1 0 0 1-1.4-1.4l2.3-2.3H6a1 1 0 0 1 0-2h7.6l-2.3-2.3a1 1 0 0 1 1.4-1.4l4 4a1 1 0 0 1 0 1.4z" />
                </svg>
              </button>

              <p className="text-center text-[11px] text-white/20">
                Click a node to explore · Click Get Started to begin
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
