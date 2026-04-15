"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AccountStateService } from "@/services/AccountStateService";
import { AuthService } from "@/services/AuthService";
import { Organizer } from "@/services/OrganizerService";
import { TrackerService } from "@/services/TrackerService";
import { useOrganizer } from "@/hooks/useOrganizer";
import { majorTypes } from "@/lib/majorConstants";
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
import ExportView from "@/views/ExportView";
import WritingChamberView from "@/views/WritingChamberView";
import GhostwriterView from "@/views/GhostwriterView";
import { PlaceholderView } from "@/views/AutomationViews";
import configMobileStyles from "./ConfigurationViewMobile.module.css";
import essayTypeMobileStyles from "./EssayTypeViewMobile.module.css";
import editorMobileStyles from "./EditorViewMobile.module.css";
import formatMobileStyles from "./FormatViewMobile.module.css";
import generationMobileStyles from "./GenerationViewMobile.module.css";
import humanizerMobileStyles from "./HumanizerViewMobile.module.css";
import instructionsMobileStyles from "./InstructionsViewMobile.module.css";
import majorSelectionMobileStyles from "./MajorSelectionViewMobile.module.css";
import outlinesMobileStyles from "./OutlinesViewMobile.module.css";
import previewMobileStyles from "./PreviewViewMobile.module.css";
import writingStyleMobileStyles from "./WritingStyleViewMobile.module.css";
import StepperHeader, { getVisibleAutomationSteps, AutomationStepId } from "@/components/StepperHeader";
import OctoAssistant from "@/components/OctoAssistant";
import styles from "./HomeViewMobile.module.css";
import {
  AppHeader,
  MainHeaderActions,
  LogoNav,
} from "@/components/header";

type Page = "home" | "methodology" | "ghostwriter" | AutomationStepId;

function hasWritingStyleAccess(plan?: string | null): boolean {
  if (!plan) return false;
  const normalized = plan.toLowerCase();
  return (normalized.includes("pro") || normalized.includes("premium")) && !normalized.includes("guest");
}

export default function HomeView() {
  const [page, setPage] = useState<Page>("home");
  const [selectedMajor, setSelectedMajor] = useState(0);
  const [isWorkspaceTopBarCollapsed, setIsWorkspaceTopBarCollapsed] = useState(false);
  const [accountPlan, setAccountPlan] = useState<string | null>(() => AccountStateService.read()?.plan ?? null);
  const stepScrollRef = useRef<HTMLDivElement>(null);
  const org = useOrganizer();

  const handleSelectMajor = useCallback((index: number) => {
    setSelectedMajor(index);
    Organizer.set({ majorIndex: index, majorName: majorTypes[index]?.name || "" });
  }, []);

  const skipWritingStyle = !hasWritingStyleAccess(accountPlan);
  const skipFormat = org.citationStyle === "None";
  const visibleSteps = useMemo(
    () => getVisibleAutomationSteps({ skipFormat, skipWritingStyle, writingMode: org.writingMode }),
    [org.writingMode, skipFormat, skipWritingStyle]
  );

  const currentStep = page as AutomationStepId;
  const stepIndex = visibleSteps.findIndex((step) => step.id === currentStep);
  const progressPercent = stepIndex >= 0
    ? Math.max(0, Math.min(100, ((stepIndex + 1) / visibleSteps.length) * 100))
    : 0;

  useEffect(() => {
    const applySnapshot = (snapshot: ReturnType<typeof AccountStateService.read>) => {
      setAccountPlan(snapshot?.plan ?? null);
    };

    applySnapshot(AccountStateService.read());
    const unsubscribeAccount = AccountStateService.subscribe(applySnapshot);
    const unsubscribeAuth = AuthService.subscribe((nextUser) => {
      if (!nextUser) {
        setAccountPlan(null);
        return;
      }

      void AccountStateService.bootstrap().catch(() => {
        // Keep current cached snapshot.
      });
    });

    if (AuthService.getCurrentUser()) {
      void AccountStateService.bootstrap().catch(() => {
        // Keep current cached snapshot.
      });
    }

    return () => {
      unsubscribeAccount();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (stepIndex >= 0) {
      stepScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [page, stepIndex]);

  useEffect(() => {
    if (!TrackerService.getSessionId()) return;
    void TrackerService.syncOrganizer(org);
  }, [org]);

  const resolveWritingStyleAccess = useCallback(async () => {
    if (accountPlan !== null) {
      return hasWritingStyleAccess(accountPlan);
    }

    try {
      const me = await AccountStateService.bootstrap();
      const nextPlan = me?.plan ?? null;
      setAccountPlan(nextPlan);
      return hasWritingStyleAccess(nextPlan);
    } catch {
      return false;
    }
  }, [accountPlan]);

  if (page === "methodology") {
    return (
      <>
        <MethodologyView
          onSelect={async (method) => {
            Organizer.set({ writingMode: method });
            await TrackerService.startSession(method);

            if (method === "ghostwriter") {
              setPage("ghostwriter");
              return;
            }

            const canUseWritingStyle = await resolveWritingStyleAccess();

            if (!canUseWritingStyle) {
              Organizer.set({
                writingStyleStatus: "guest_bypass",
                writingStyleFileName: null,
              });
              await TrackerService.updateSession({ writing_style_status: "guest_bypass" });
              setPage("major-selection");
              return;
            }

            setPage("writing-style");
          }}
        />
        <OctoAssistant currentPage={page} />
      </>
    );
  }

  if (page === "ghostwriter") {
    return (
      <>
        <GhostwriterView onBack={() => setPage("methodology")} />
        <OctoAssistant currentPage={page} />
      </>
    );
  }

  if (page === "editor") {
    const goBack = () => setPage("humanizer");
    const goNext = (nextPage: AutomationStepId) => setPage(nextPage);

    return (
      <>
        <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
          <AppHeader
            className={`${editorMobileStyles.editorHeader} transition-transform duration-300 ease-out ${isWorkspaceTopBarCollapsed ? "-translate-y-full" : "translate-y-0"}`}
            left={<LogoNav />}
            right={<MainHeaderActions />}
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
              currentStepId={currentStep}
              skipFormat={skipFormat}
              skipWritingStyle={skipWritingStyle}
              writingMode={org.writingMode}
              className={editorMobileStyles.editorStepper}
            />
          )}

          <button
            type="button"
            onClick={() => setIsWorkspaceTopBarCollapsed((prev) => !prev)}
            className={`${editorMobileStyles.editorCollapseButton} ${isWorkspaceTopBarCollapsed ? editorMobileStyles.editorCollapseButtonCollapsed : editorMobileStyles.editorCollapseButtonExpanded}`}
            title={isWorkspaceTopBarCollapsed ? "Expand top bars" : "Collapse top bars"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              {isWorkspaceTopBarCollapsed ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}
            </svg>
            {isWorkspaceTopBarCollapsed ? "Expand" : "Collapse"}
          </button>

          <div className={`flex-1 min-h-0 overflow-hidden transition-[padding-top] duration-300 ease-out ${isWorkspaceTopBarCollapsed ? editorMobileStyles.editorViewportCollapsed : editorMobileStyles.editorViewportExpanded}`}>
            <EditorView onBack={goBack} onNext={goNext} />
          </div>
        </div>
        <OctoAssistant currentPage={page} />
      </>
    );
  }

  if (page === "export") {
    const goBack = () => setPage("editor");
    const restartAdventure = () => {
      void (async () => {
        await TrackerService.closeSession();
        TrackerService.clear();
        Organizer.reset();
        setPage("home");
      })();
    };

    return (
      <div className="fixed inset-0 overflow-hidden bg-[#0a0a0a]">
        <ExportView onBack={goBack} onRestart={restartAdventure} />
      </div>
    );
  }

  if (page === "generation" && org.writingMode === "manual") {
    const goBack = () => setPage("format");
    const goNext = (nextPage: AutomationStepId) => setPage(nextPage);

    return (
        <>
        <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
          <AppHeader
            className={`${editorMobileStyles.editorHeader} transition-transform duration-300 ease-out ${isWorkspaceTopBarCollapsed ? "-translate-y-full" : "translate-y-0"}`}
            left={<LogoNav />}
            right={<MainHeaderActions />}
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
              currentStepId={currentStep}
              skipFormat={skipFormat}
              skipWritingStyle={skipWritingStyle}
              writingMode={org.writingMode}
              className={editorMobileStyles.editorStepper}
            />
          )}

          <button
            type="button"
            onClick={() => setIsWorkspaceTopBarCollapsed((prev) => !prev)}
            className={`${editorMobileStyles.editorCollapseButton} ${isWorkspaceTopBarCollapsed ? editorMobileStyles.editorCollapseButtonCollapsed : editorMobileStyles.editorCollapseButtonExpanded}`}
            title={isWorkspaceTopBarCollapsed ? "Expand top bars" : "Collapse top bars"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              {isWorkspaceTopBarCollapsed ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}
            </svg>
            {isWorkspaceTopBarCollapsed ? "Expand" : "Collapse"}
          </button>

          <div className={`flex-1 min-h-0 overflow-hidden transition-[padding-top] duration-300 ease-out ${isWorkspaceTopBarCollapsed ? editorMobileStyles.editorViewportCollapsed : editorMobileStyles.editorViewportExpanded}`}>
            <WritingChamberView onBack={goBack} onNext={goNext} />
          </div>
        </div>
        <OctoAssistant currentPage={page} />
      </>
    );
  }

  if (stepIndex >= 0) {
    const goBack = () => {
      if (stepIndex === 0) {
        setPage("methodology");
        return;
      }

      const previousStep = visibleSteps[stepIndex - 1];
      setPage(previousStep ? previousStep.id : "methodology");
    };

    const goNext = (nextPage: AutomationStepId) => setPage(nextPage);

    return (
      <>
        <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">
          <AppHeader
            className={page === "writing-style"
              ? writingStyleMobileStyles.writingStyleHeader
              : page === "major-selection"
                ? majorSelectionMobileStyles.majorHeader
                : page === "essay-type"
                  ? essayTypeMobileStyles.essayHeader
                  : page === "instructions"
                    ? instructionsMobileStyles.instructionsHeader
                    : page === "outlines"
                      ? outlinesMobileStyles.outlinesHeader
                      : page === "configuration"
                        ? configMobileStyles.configHeader
                        : page === "format"
                          ? formatMobileStyles.formatHeader
                          : page === "generation"
                            ? generationMobileStyles.generationHeader
                            : page === "preview"
                              ? previewMobileStyles.previewHeader
                              : page === "humanizer"
                                ? humanizerMobileStyles.humanizerHeader
                : ""}
            left={<LogoNav />}
            right={<MainHeaderActions />}
          />

          <StepperHeader
            currentStepId={currentStep}
            skipFormat={skipFormat}
            skipWritingStyle={skipWritingStyle}
            writingMode={org.writingMode}
            className={page === "writing-style"
              ? writingStyleMobileStyles.writingStyleStepper
              : page === "major-selection"
                ? majorSelectionMobileStyles.majorStepper
                : page === "essay-type"
                  ? essayTypeMobileStyles.essayStepper
                  : page === "instructions"
                    ? instructionsMobileStyles.instructionsStepper
                    : page === "outlines"
                      ? outlinesMobileStyles.outlinesStepper
                      : page === "configuration"
                        ? configMobileStyles.configStepper
                        : page === "format"
                          ? formatMobileStyles.formatStepper
                          : page === "generation"
                            ? generationMobileStyles.generationStepper
                            : page === "preview"
                              ? previewMobileStyles.previewStepper
                              : page === "humanizer"
                                ? humanizerMobileStyles.humanizerStepper
                : ""}
          />

          <div
            ref={stepScrollRef}
            className={`relative z-10 flex-1 min-h-0 ${page === "major-selection" || page === "essay-type" || page === "instructions" || page === "outlines" || page === "configuration" || page === "format" || page === "generation" || page === "preview" || page === "humanizer" ? "overflow-hidden md:overflow-y-auto" : "overflow-y-auto"}`}
          >
            {page === "writing-style" ? (
              <WritingStyleView onBack={goBack} onNext={goNext} />
            ) : page === "major-selection" ? (
              <MajorSelectionView onBack={goBack} onNext={goNext} onSelectMajor={handleSelectMajor} />
            ) : page === "essay-type" ? (
              <EssayTypeView selectedMajor={selectedMajor} onBack={goBack} onNext={goNext} />
            ) : page === "instructions" ? (
              <InstructionsView onBack={goBack} onNext={goNext} />
            ) : page === "outlines" ? (
              <OutlinesView onBack={goBack} onNext={goNext} />
            ) : page === "configuration" ? (
              <ConfigurationView onBack={goBack} onNext={goNext} />
            ) : page === "format" ? (
              <FormatView onBack={goBack} onNext={goNext} />
            ) : page === "generation" ? (
              <GenerationView onBack={goBack} onNext={goNext} />
            ) : page === "preview" ? (
              <PreviewView onBack={goBack} onNext={goNext} />
            ) : page === "humanizer" ? (
              <HumanizerView onBack={goBack} onNext={goNext} />
            ) : (
              <PlaceholderView step={currentStep} index={stepIndex} onBack={goBack} onNext={goNext} />
            )}
          </div>
        </div>
        <OctoAssistant currentPage={page} />
      </>
    );
  }

  return (
    <>
      <div className={`fixed inset-0 flex flex-col overflow-hidden bg-[#0a0a0a] ${styles.homeShell}`}>
        <AppHeader
          className={styles.homeHeader}
          right={<MainHeaderActions />}
        />

        <AnimatedBackground />

        <div className={`relative z-10 flex flex-1 flex-col items-center justify-center ${styles.homeHero}`}>
          <div className={`mb-6 ${styles.homeMascotWrap}`}>
            <Image
              src="/OCTOPILOT.png"
              alt="Octopilot mascot"
              width={120}
              height={120}
              className={`drop-shadow-[0_0_40px_rgba(239,68,68,0.15)] ${styles.homeMascot}`}
            />
          </div>

          <Image
            src="/logoText.png"
            alt="OctoPilot AI"
            width={400}
            height={80}
            className={`mb-5 w-[280px] sm:w-[360px] ${styles.homeLogo}`}
            style={{ width: undefined, height: "auto" }}
          />

          <p className={`mb-10 max-w-md text-center text-lg leading-relaxed text-white/40 ${styles.homeSubtitle}`}>
            Elevate your academic writing with AI-powered precision
          </p>

          <div className={`flex flex-col gap-3 ${styles.homeActions}`}>
            <button
              onClick={() => setPage("methodology")}
              className={`group relative overflow-hidden rounded-full bg-red-600 px-10 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(239,68,68,0.25)] transition hover:bg-red-500 hover:shadow-[0_0_60px_rgba(239,68,68,0.35)] ${styles.homePrimaryCta}`}
            >
              <span className="relative z-10">Start Writing</span>
              <div className="absolute inset-0 -translate-x-full bg-white/10 transition-transform duration-300 group-hover:translate-x-0" />
            </button>
          </div>

          <a
            href="https://www.octopilotai.com"
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm text-white/30 transition hover:text-white/60 ${styles.homeLearnMore}`}
          >
            Learn more
          </a>
        </div>
      </div>
      <OctoAssistant currentPage={page} />
    </>
  );
}
