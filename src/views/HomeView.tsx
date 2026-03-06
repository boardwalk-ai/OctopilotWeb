"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { Organizer } from "@/services/OrganizerService";
import { useOrganizer } from "@/hooks/useOrganizer";
import { majorTypes } from "@/lib/majorConstants";
import SplashScreen from "@/components/SplashScreen";
import AnimatedBackground from "@/components/AnimatedBackground";
import MethodologyView from "@/views/MethodologyView";
import WritingStyleView from "@/views/WritingStyleView";
import MajorSelectionView from "@/views/MajorSelectionView";
import EssayTypeView from "@/views/EssayTypeView";
import InstructionsView from "@/views/InstructionsView";
import OutlinesView from "@/views/OutlinesView";
import ConfigurationView from "@/views/ConfigurationView";
import FormatView from "@/views/FormatView";
import GenerationView from "@/views/GenerationView";
import PreviewView from "@/views/PreviewView";
import HumanizerView from "@/views/HumanizerView";
import EditorView from "@/views/EditorView";
import WritingChamberView from "@/views/WritingChamberView";
import { PlaceholderView } from "@/views/AutomationViews";
import StepperHeader, { automationSteps, AutomationStepId } from "@/components/StepperHeader";
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

type Page = "home" | "methodology" | AutomationStepId;

export default function HomeView() {
  const [showSplash, setShowSplash] = useState(true);
  const [page, setPage] = useState<Page>("home");
  const [selectedMajor, setSelectedMajor] = useState(0);
  const [isWorkspaceTopBarCollapsed, setIsWorkspaceTopBarCollapsed] = useState(false);

  const org = useOrganizer();

  const handleSelectMajor = useCallback((index: number) => {
    setSelectedMajor(index);
    Organizer.set({ majorIndex: index, majorName: majorTypes[index]?.name || "" });
  }, []);

  const handleSplashFinished = useCallback(() => {
    setShowSplash(false);
  }, []);

  if (page === "methodology") {
    return (
      <MethodologyView
        onBack={() => setPage("home")}
        onSelect={(method) => {
          Organizer.set({ writingMode: method });
          setPage("writing-style");
        }}
      />
    );
  }

  const automationStepsMap: Record<Page, number> = {
    home: -1,
    methodology: -1,
    "writing-style": 0,
    "major-selection": 1,
    "essay-type": 2,
    "instructions": 3,
    "outlines": 4,
    "configuration": 5,
    "format": 6,
    "generation": 7,
    "preview": 8,
    "humanizer": 9,
    "editor": 10,
    "export": 11,
  };

  const currentStep = page as AutomationStepId;
  const stepIndex = automationStepsMap[page];
  const skipFormat = org.citationStyle === "None";
  const totalStepsForProgress = skipFormat
    ? automationSteps.filter((s) => s !== "Format").length
    : automationSteps.length;
  const adjustedStepIndexForProgress = skipFormat && stepIndex > 5
    ? stepIndex - 1
    : stepIndex;
  const progressPercent = Math.max(
    0,
    Math.min(100, ((adjustedStepIndexForProgress + 1) / totalStepsForProgress) * 100)
  );

  if (page === "editor") {
    const goBack = () => setPage("humanizer");
    const goNext = (nextPage: AutomationStepId) => setPage(nextPage);

    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
        <AppHeader
          className={`transition-transform duration-300 ease-out ${isWorkspaceTopBarCollapsed ? "-translate-y-full" : "translate-y-0"}`}
          left={
            <>
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

        {isWorkspaceTopBarCollapsed ? (
          <div className="fixed top-0 left-0 right-0 z-40 h-[3px] bg-white/[0.04]">
            <div
              className="h-full rounded-r-full bg-red-500"
              style={{
                width: `${progressPercent}%`,
                boxShadow: "0 0 8px rgba(239, 68, 68, 0.5), 0 0 2px rgba(239, 68, 68, 0.8)",
              }}
            />
          </div>
        ) : (
          <StepperHeader
            currentStepIndex={stepIndex}
            skipFormat={skipFormat}
            writingMode={org.writingMode}
            className="top-16"
          />
        )}

        <button
          type="button"
          onClick={() => setIsWorkspaceTopBarCollapsed((prev) => !prev)}
          className={`fixed right-4 z-50 flex h-8 items-center gap-1 rounded-full border border-white/15 bg-[#121821]/95 px-3 text-[11px] font-semibold uppercase tracking-wide text-white/85 shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-all duration-300 hover:bg-[#1a2230] ${isWorkspaceTopBarCollapsed ? "top-3" : "top-[86px]"}`}
          title={isWorkspaceTopBarCollapsed ? "Expand top bars" : "Collapse top bars"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            {isWorkspaceTopBarCollapsed ? (
              <path d="m6 15 6-6 6 6" />
            ) : (
              <path d="m6 9 6 6 6-6" />
            )}
          </svg>
          {isWorkspaceTopBarCollapsed ? "Expand" : "Collapse"}
        </button>

        <div className={`flex-1 min-h-0 overflow-hidden transition-[padding-top] duration-300 ease-out ${isWorkspaceTopBarCollapsed ? "pt-2" : "pt-[124px]"}`}>
          <EditorView onBack={goBack} onNext={goNext} />
        </div>
      </div>
    );
  }

  if (page === "generation" && org.writingMode === "manual") {
    const goBack = () => setPage("format");
    const goNext = (nextPage: AutomationStepId) => setPage(nextPage);

    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
        <AppHeader
          className={`transition-transform duration-300 ease-out ${isWorkspaceTopBarCollapsed ? "-translate-y-full" : "translate-y-0"}`}
          left={
            <>
              <BackToHome onClick={goBack} />
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

        {isWorkspaceTopBarCollapsed ? (
          <div className="fixed top-0 left-0 right-0 z-40 h-[3px] bg-white/[0.04]">
            <div
              className="h-full rounded-r-full bg-red-500"
              style={{
                width: `${progressPercent}%`,
                boxShadow: "0 0 8px rgba(239, 68, 68, 0.5), 0 0 2px rgba(239, 68, 68, 0.8)",
              }}
            />
          </div>
        ) : (
          <StepperHeader
            currentStepIndex={stepIndex}
            skipFormat={skipFormat}
            writingMode={org.writingMode}
            className="top-16"
          />
        )}

        <button
          type="button"
          onClick={() => setIsWorkspaceTopBarCollapsed((prev) => !prev)}
          className={`fixed right-4 z-50 flex h-8 items-center gap-1 rounded-full border border-white/15 bg-[#121821]/95 px-3 text-[11px] font-semibold uppercase tracking-wide text-white/85 shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-all duration-300 hover:bg-[#1a2230] ${isWorkspaceTopBarCollapsed ? "top-3" : "top-[86px]"}`}
          title={isWorkspaceTopBarCollapsed ? "Expand top bars" : "Collapse top bars"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            {isWorkspaceTopBarCollapsed ? (
              <path d="m6 15 6-6 6 6" />
            ) : (
              <path d="m6 9 6 6 6-6" />
            )}
          </svg>
          {isWorkspaceTopBarCollapsed ? "Expand" : "Collapse"}
        </button>

        <div className={`flex-1 min-h-0 overflow-hidden transition-[padding-top] duration-300 ease-out ${isWorkspaceTopBarCollapsed ? "pt-2" : "pt-[124px]"}`}>
          <WritingChamberView onBack={goBack} onNext={goNext} />
        </div>
      </div>
    );
  }

  if (stepIndex >= 0) {
    const goBack = () => {
      if (stepIndex === 0) {
        setPage("methodology");
      } else {
        const entries = Object.entries(automationStepsMap);
        const previousEntry = entries.find(([, val]) => val === stepIndex - 1);
        if (previousEntry) {
          setPage(previousEntry[0] as Page);
        } else {
          setPage("methodology");
        }
      }
    };

    const goNext = (nextPage: AutomationStepId) => setPage(nextPage);

    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
        <AppHeader
          left={
            <>
              <BackToHome onClick={goBack} />
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

        {/* Persistent StepperHeader — never unmounts during automation flow */}
        <StepperHeader
          currentStepIndex={stepIndex}
          skipFormat={skipFormat}
          writingMode={org.writingMode}
        />

        {/* Step Content Wrapper — Handles All Scrolling */}
        <div className="flex-1 min-h-0 overflow-y-auto relative z-10">
          {page === "writing-style" ? (
            <WritingStyleView
              onBack={goBack}
              onNext={goNext}
            />
          ) : page === "major-selection" ? (
            <MajorSelectionView
              onBack={goBack}
              onNext={goNext}
              onSelectMajor={handleSelectMajor}
            />
          ) : page === "essay-type" ? (
            <EssayTypeView
              selectedMajor={selectedMajor}
              onBack={goBack}
              onNext={goNext}
            />
          ) : page === "instructions" ? (
            <InstructionsView
              onBack={goBack}
              onNext={goNext}
            />
          ) : page === "outlines" ? (
            <OutlinesView
              onBack={goBack}
              onNext={goNext}
            />
          ) : page === "configuration" ? (
            <ConfigurationView
              onBack={goBack}
              onNext={goNext}
            />
          ) : page === "format" ? (
            <FormatView
              onBack={goBack}
              onNext={goNext}
            />
          ) : page === "generation" ? (
            <GenerationView
              onBack={goBack}
              onNext={goNext}
            />
          ) : page === "preview" ? (
            <PreviewView
              onBack={goBack}
              onNext={goNext}
            />
          ) : page === "humanizer" ? (
            <HumanizerView
              onBack={goBack}
              onNext={goNext}
            />
          ) : (
            <PlaceholderView
              step={currentStep}
              index={stepIndex}
              onBack={goBack}
              onNext={goNext}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {showSplash && <SplashScreen onFinished={handleSplashFinished} />}

      <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
        <AppHeader
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

        <AnimatedBackground />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
          <div className="mb-6">
            <Image
              src="/OCTOPILOT.png"
              alt="Octopilot mascot"
              width={120}
              height={120}
              className="drop-shadow-[0_0_40px_rgba(239,68,68,0.15)]"
            />
          </div>

          <Image
            src="/logoText.png"
            alt="OctoPilot AI"
            width={400}
            height={80}
            className="mb-5 w-[280px] sm:w-[360px]"
            style={{ width: undefined, height: "auto" }}
          />

          <p className="mb-10 max-w-md text-center text-lg leading-relaxed text-white/40">
            Elevate your academic writing with AI-powered precision
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => setPage("methodology")}
              className="group relative overflow-hidden rounded-full bg-red-600 px-10 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(239,68,68,0.25)] transition hover:bg-red-500 hover:shadow-[0_0_60px_rgba(239,68,68,0.35)]"
            >
              <span className="relative z-10">Start Writing</span>
              <div className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-300 group-hover:translate-x-0" />
            </button>
            <button
              onClick={() => {
                if (org.isTestMode) {
                  Organizer.reset();
                } else {
                  Organizer.setTestData();
                  setPage("writing-style");
                }
              }}
              className={`group relative mb-4 overflow-hidden rounded-full border border-white/10 px-10 py-3 text-sm font-semibold transition ${org.isTestMode ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'}`}
            >
              <span className="relative z-10">{org.isTestMode ? "Disable Test Mode" : "Test Mode (Bypass AI)"}</span>
            </button>
          </div>

          <a
            href="https://www.octopilotai.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-white/30 transition hover:text-white/60"
          >
            Learn more
          </a>
        </div>
      </div>
    </>
  );
}
