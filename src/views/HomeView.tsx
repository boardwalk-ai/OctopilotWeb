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
import { PlaceholderView } from "@/views/AutomationViews";
import StepperHeader, { AutomationStepId } from "@/components/StepperHeader";
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
          if (method === "automation") {
            setPage("writing-style");
          } else {
            console.log("Selected method:", method);
          }
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

  if (page === "editor") {
    const goBack = () => setPage("humanizer");
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

        <StepperHeader currentStepIndex={stepIndex} skipFormat={org.citationStyle === "None"} />

        <div className="flex-1 min-h-0 overflow-hidden pt-[124px]">
          <EditorView onBack={goBack} onNext={goNext} />
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
        <StepperHeader currentStepIndex={stepIndex} skipFormat={org.citationStyle === "None"} />

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
