"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { AppHeader, BackToHome, MainHeaderActions } from "@/components/header";
import { useOrganizer } from "@/hooks/useOrganizer";
import {
  GhostwriterDraftInput,
  GhostwriterDraftSettings,
  GhostwriterFormatAnswers,
  GhostwriterOrchestrator,
} from "@/services/GhostwriterOrchestrator";
import { ExportDocumentSnapshot, Organizer } from "@/services/OrganizerService";
import { GhostwriterQuestionField, GhostwriterRunState } from "@/lib/ghostwriterTypes";
import styles from "./GhostwriterWorkflowView.module.css";

type GhostwriterWorkflowViewProps = {
  draft: GhostwriterDraftInput;
  onBack: () => void;
};

type StepStatus = "pending" | "running" | "completed" | "blocked";

type WorkflowStep = {
  id: number;
  title: string;
  detail: string;
  status: StepStatus;
};

const INITIAL_STEPS: WorkflowStep[] = [
  { id: 1,  title: "Analyzing your instruction",    detail: "Reading the prompt and locking in the topic.",              status: "pending" },
  { id: 2,  title: "Building paragraph outlines",   detail: "Structuring the essay section by section.",                 status: "pending" },
  { id: 3,  title: "Searching for sources",         detail: "Looking for relevant, citable sources.",                    status: "pending" },
  { id: 4,  title: "Populating the sources panel",  detail: "Loading search results into the sidebar.",                  status: "pending" },
  { id: 5,  title: "Gathering data from sources",   detail: "Scraping and compacting source content.",                   status: "pending" },
  { id: 6,  title: "Checking draft settings",       detail: "Confirming word count and citation style before writing.",  status: "pending" },
  { id: 7,  title: "Writing your essay",            detail: "Drafting the full essay from outlines and sources.",        status: "pending" },
  { id: 8,  title: "Collecting formatting details", detail: "Gathering student, instructor, and course metadata.",       status: "pending" },
  { id: 9,  title: "Applying citation layout",      detail: "Running the citation formatter in the background.",         status: "pending" },
  { id: 10, title: "Preparing your PDF",            detail: "Packaging the final document for download.",                status: "pending" },
  { id: 11, title: "Humanizing your essay",         detail: "Processing with AI detection bypass.",                      status: "pending" },
  { id: 12, title: "Packaging humanized document",  detail: "Building the final cleaned-up PDF.",                       status: "pending" },
];

const TOOL_LABELS: Record<string, string> = {
  analyze_instruction: "analyze_instruction",
  generate_outlines: "generate_outlines",
  gather_sources: "gather_sources",
  generate_essay: "generate_essay",
  finalize_export: "finalize_export",
  humanize_essay: "humanize_essay",
  finalize_export_humanized: "finalize_export_humanized",
};

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function makeFileName(title: string, ext: string) {
  const safe = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "octopilot-export"}.${ext}`;
}

function defaultDateString() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getAnswerValue(
  field: GhostwriterQuestionField,
  draftSettings: GhostwriterDraftSettings,
  formatAnswers: GhostwriterFormatAnswers,
) {
  if (field === "wordCount") return draftSettings.wordCount;
  if (field === "citationStyle") return draftSettings.citationStyle;
  if (field in formatAnswers) return (formatAnswers as Record<string, unknown>)[field] as string;
  return "";
}

function SpinnerIcon() {
  return (
    <svg className={styles.spinnerIcon} width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="28 56" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function BlockedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export default function GhostwriterWorkflowView({ draft, onBack }: GhostwriterWorkflowViewProps) {
  const org = useOrganizer();
  const [runState, setRunState] = useState<GhostwriterRunState | null>(null);
  const [draftSettings, setDraftSettings] = useState<GhostwriterDraftSettings>(() => {
    const detected = GhostwriterOrchestrator.detectDraftSettings(draft.prompt);
    return {
      wordCount: detected.wordCount || 1200,
      citationStyle: detected.citationStyle || "APA",
    };
  });
  const [formatAnswers, setFormatAnswers] = useState<GhostwriterFormatAnswers>({
    finalEssayTitle: "",
    studentName: "",
    instructorName: "",
    institutionName: "",
    courseInfo: "",
    subjectCode: "",
    essayDate: defaultDateString(),
  });
  const [exportDocument, setExportDocument] = useState<ExportDocumentSnapshot | null>(null);
  const [activeDownload, setActiveDownload] = useState(false);
  const [runError, setRunError] = useState("");
  const [showOutlines, setShowOutlines] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [openThinkingSteps, setOpenThinkingSteps] = useState<Set<number>>(new Set());
  // Essay streaming
  const [essayStreamContent, setEssayStreamContent] = useState("");
  const [editingOpen, setEditingOpen] = useState(true);
  // Humanized content
  const [humanizedBoxOpen, setHumanizedBoxOpen] = useState(true);
  const [humanizedBoxes, setHumanizedBoxes] = useState<Array<{ content: string; provider: string }>>([]);
  const [retryingHumanize, setRetryingHumanize] = useState(false);
  // Timer
  const workflowStartRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);
  // Question fade transition
  const [displayedQuestion, setDisplayedQuestion] = useState(runState?.pendingQuestion ?? null);
  const [questionExiting, setQuestionExiting] = useState(false);
  const hasStarted = useRef(false);
  const isExecutingTool = useRef(false);
  const hiddenPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const streamRef = useRef<HTMLElement>(null);
  const questionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topicSummary = useMemo(() => ({
    topic: org.essayTopic || "Waiting for topic",
    type: org.analyzedEssayType || org.essayType || "Essay",
    citation: org.citationStyle || "Pending",
    words: typeof org.wordCount === "number" ? org.wordCount : 0,
  }), [org.analyzedEssayType, org.citationStyle, org.essayTopic, org.essayType, org.wordCount]);

  const visibleSteps = useMemo(
    () => (runState?.steps || INITIAL_STEPS).filter((step) => step.status !== "pending"),
    [runState]
  );

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    void (async () => {
      try {
        setFormatAnswers((prev) => ({
          ...prev,
          finalEssayTitle: Organizer.get().essayTopic || prev.finalEssayTitle,
        }));
        const startedRun = await GhostwriterOrchestrator.startRun(draft.prompt);
        setRunState(startedRun);
      } catch (error) {
        setRunError(error instanceof Error ? error.message : "Ghostwriter workflow failed.");
      }
    })();
  }, [draft]);

  useEffect(() => {
    if (!runState?.pendingToolCall || isExecutingTool.current) return;

    isExecutingTool.current = true;
    const isEssayTool = runState.pendingToolCall.name === "generate_essay";
    if (isEssayTool) {
      setEssayStreamContent("");
      setEditingOpen(true);
    }

    void (async () => {
      try {
        let chunks = "";
        const result = await GhostwriterOrchestrator.executeToolCall(
          runState.pendingToolCall!,
          draft,
          isEssayTool
            ? (chunk) => {
                chunks += chunk;
                setEssayStreamContent(chunks);
              }
            : undefined,
        );
        const nextState = await GhostwriterOrchestrator.submitToolResult(runState.runId, runState.pendingToolCall!.name, result);
        setRunState(nextState);
      } catch (error) {
        setRunError(error instanceof Error ? error.message : "Tool execution failed.");
      } finally {
        isExecutingTool.current = false;
      }
    })();
  }, [draft, runState]);

  useEffect(() => {
    if (runState?.status === "finished") {
      setExportDocument(Organizer.get().exportDocument);
    }
  }, [runState]);

  // Auto-scroll stream to bottom whenever new steps appear
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleSteps]);

  // Timer
  useEffect(() => {
    if (runState?.status === "finished" && finalDuration === null) {
      setFinalDuration(Math.floor((Date.now() - workflowStartRef.current) / 1000));
      return;
    }
    if (runState?.status === "finished") return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - workflowStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [runState?.status, finalDuration]);

  // Capture humanized content when it arrives in run state
  useEffect(() => {
    const content = runState?.context.humanizedContent;
    const provider = runState?.context.humanizeProvider;
    if (content && provider) {
      setHumanizedBoxes((prev) => {
        const alreadyHave = prev.some((b) => b.content === content);
        if (alreadyHave) return prev;
        return [...prev, { content, provider }];
      });
      setHumanizedBoxOpen(true);
    }
  }, [runState?.context.humanizedContent]);

  // Question fade transition
  useEffect(() => {
    const next = runState?.pendingQuestion ?? null;
    if (next?.id === displayedQuestion?.id) return;

    if (questionTimerRef.current) clearTimeout(questionTimerRef.current);

    if (displayedQuestion) {
      setQuestionExiting(true);
      questionTimerRef.current = setTimeout(() => {
        setDisplayedQuestion(next);
        setQuestionExiting(false);
      }, 210);
    } else {
      setDisplayedQuestion(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runState?.pendingQuestion?.id]);

  const submitCurrentAnswer = async (overrideValue?: string | number) => {
    if (!runState?.pendingQuestion) return;

    try {
      const field = runState.pendingQuestion.field;
      const value = overrideValue !== undefined ? overrideValue : getAnswerValue(field, draftSettings, formatAnswers);
      const nextState = await GhostwriterOrchestrator.submitAnswer(runState.runId, field, value);
      setRunState(nextState);
      setCustomAnswer("");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Question submission failed.");
    }
  };

  const handleChipClick = (chip: string) => {
    if (!runState?.pendingQuestion) return;
    const field = runState.pendingQuestion.field;
    if (field === "wordCount" || field === "outlineCount") {
      void submitCurrentAnswer(Number(chip));
    } else {
      void submitCurrentAnswer(chip);
    }
  };

  const handleHumanizeRetry = () => {
    if (!runState) return;
    setRetryingHumanize(true);
    // Re-inject the humanizerChoice question into displayed question state
    setDisplayedQuestion({
      id: `retry-${Date.now()}`,
      field: "humanizerChoice",
      prompt: "Which humanizer should I try this time?",
      inputType: "text",
      suggestions: ["UndetectableAI", "StealthGPT"],
    });
    setRetryingHumanize(false);
  };

  const handlePdfDownload = async () => {
    if (!exportDocument || exportDocument.pages.length === 0) return;

    setActiveDownload(true);
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [816, 1056],
        compress: true,
      });

      for (let index = 0; index < exportDocument.pages.length; index += 1) {
        const node = hiddenPageRefs.current[index];
        if (!node) throw new Error("Missing export page.");
        const canvas = await html2canvas(node, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        const image = canvas.toDataURL("image/png");
        if (index > 0) pdf.addPage([816, 1056], "portrait");
        pdf.addImage(image, "PNG", 0, 0, 816, 1056, undefined, "FAST");
      }

      pdf.save(makeFileName(exportDocument.title, "pdf"));
    } finally {
      setActiveDownload(false);
    }
  };

  const hasSearchResults = (runState?.context.searchResults || []).length > 0;

  return (
    <div className={styles.workflowShell}>
      <AppHeader
        className={styles.workflowHeader}
        left={<BackToHome onClick={onBack} />}
        right={<MainHeaderActions />}
      />

      <div className={`${styles.workflowGrid} ${rightCollapsed ? styles.workflowGridCollapsed : ""}`}>
        {/* Left sidebar */}
        <aside className={styles.leftSidebar}>
          <button type="button" className={styles.newChatButton} onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <span>New chat</span>
          </button>

          <nav className={styles.primaryNav}>
            {["Search", "Plugins", "Automations"].map((item) => (
              <button key={item} type="button" className={styles.navItem}>
                <span>{item}</span>
              </button>
            ))}
          </nav>

          <div className={styles.sidebarSection}>
            <div className={styles.sidebarSectionLabel}>Project Folders</div>
            <div className={styles.threadList}>
              <div className={styles.threadFolder}>
                <strong>Octopilot Web</strong>
                <span>Ghostwriter mode</span>
              </div>
              <div className={styles.threadFolder}>
                <strong>Research Threads</strong>
                <span>{topicSummary.topic}</span>
              </div>
            </div>
          </div>

          <div className={styles.sidebarSection}>
            <div className={styles.sidebarSectionLabel}>Threads</div>
            <div className={styles.threadList}>
              <button type="button" className={`${styles.threadItem} ${styles.threadItemActive}`}>
                <strong>{topicSummary.topic}</strong>
                <span>{topicSummary.type}</span>
              </button>
              <button type="button" className={styles.threadItem}>
                <strong>Ghostwriter draft</strong>
                <span>{draft.attachments.length} attachment{draft.attachments.length === 1 ? "" : "s"}</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main workflow stream */}
        <main className={styles.mainColumn}>
          <div className={styles.mainHero}>
            <Image src="/OCTOPILOT.png" alt="Octopilot" width={48} height={48} className={styles.heroLogo} />
            <div>
              <div className={styles.heroLabel}>Agentic Workflow</div>
              <h2 className={styles.mainTitle}>{runState?.goal.title || "Ghostwriter is moving through the workflow one step at a time."}</h2>
              <p className={styles.goalProgress}>
                {runState?.progress.label || "Starting"} · {runState?.progress.percent || 0}% complete
              </p>
            </div>
          </div>

          <section ref={streamRef} className={styles.workflowStream}>
            {visibleSteps.map((step) => {
              const isRunning = step.status === "running";
              const thinkingOpen = openThinkingSteps.has(step.id);
              const isActiveToolStep = isRunning && runState?.pendingToolCall;

              return (
                <div
                  key={step.id}
                  className={`${styles.streamLine} ${styles[`stream${step.status[0].toUpperCase()}${step.status.slice(1)}` as keyof typeof styles] || ""}`}
                >
                  <div className={styles.streamIconWrap}>
                    {step.status === "completed" && <CheckIcon />}
                    {step.status === "running" && <SpinnerIcon />}
                    {step.status === "blocked" && <BlockedIcon />}
                  </div>
                  <div className={styles.streamCopy}>
                    <span className={styles.streamTitle}>
                      {step.title}
                      {isRunning && <span className={styles.streamDots}><span>.</span><span>.</span><span>.</span><span>.</span></span>}
                    </span>

                    {/* Completed step: detail + optional essay collapsible for step 7 */}
                    {!isRunning && (
                      <>
                        <span className={styles.streamDetail}>{step.detail}</span>
                        {step.id === 7 && essayStreamContent && (
                          <div className={styles.thinkingSection} style={{ marginTop: "0.4rem" }}>
                            <button
                              type="button"
                              className={styles.thinkingToggle}
                              onClick={() => setEditingOpen((prev) => !prev)}
                            >
                              <span>Editing</span>
                              <svg
                                className={`${styles.thinkingChevron} ${editingOpen ? styles.thinkingChevronOpen : ""}`}
                                width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              >
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            </button>
                            {editingOpen && (
                              <div className={`${styles.thinkingBox} ${styles.editingBox}`}>
                                {essayStreamContent}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Running step: essay step gets "Editing ▾", others get "Thinking ▾" */}
                    {isRunning && step.id === 7 && (
                      <div className={styles.thinkingSection}>
                        <button
                          type="button"
                          className={styles.thinkingToggle}
                          onClick={() => setEditingOpen((prev) => !prev)}
                        >
                          <span>Editing</span>
                          <svg
                            className={`${styles.thinkingChevron} ${editingOpen ? styles.thinkingChevronOpen : ""}`}
                            width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                        {editingOpen && (
                          <div className={`${styles.thinkingBox} ${styles.editingBox}`}>
                            {essayStreamContent || "Starting essay draft…"}
                          </div>
                        )}
                      </div>
                    )}

                    {isRunning && step.id !== 7 && (
                      <div className={styles.thinkingSection}>
                        <button
                          type="button"
                          className={styles.thinkingToggle}
                          onClick={() => setOpenThinkingSteps((prev) => {
                            const next = new Set(prev);
                            if (next.has(step.id)) next.delete(step.id);
                            else next.add(step.id);
                            return next;
                          })}
                        >
                          <span>Thinking</span>
                          <svg
                            className={`${styles.thinkingChevron} ${thinkingOpen ? styles.thinkingChevronOpen : ""}`}
                            width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                        {thinkingOpen && (
                          <div className={styles.thinkingBox}>{step.detail}</div>
                        )}
                        {isActiveToolStep && (
                          <div className={styles.toolCallLine}>
                            <span className={styles.toolCallLabel}>Calling</span>
                            <code className={styles.toolCallName}>
                              {TOOL_LABELS[runState.pendingToolCall!.name] || runState.pendingToolCall!.name}
                            </code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {runState?.status === "finished" && exportDocument && (
              <div className={styles.finishedCard} onClick={() => void handlePdfDownload()}>
                <div className={styles.finishedCardIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div className={styles.finishedCardMeta}>
                  <span className={styles.finishedCardTitle}>{exportDocument.title || "Your Essay"}</span>
                  <span className={styles.finishedCardFilename}>{makeFileName(exportDocument.title, "pdf")}</span>
                  <span className={styles.finishedCardType}>PDF</span>
                </div>
                <button
                  type="button"
                  className={styles.finishedCardDownloadBtn}
                  onClick={(e) => { e.stopPropagation(); void handlePdfDownload(); }}
                  title="Download PDF"
                >
                  {activeDownload ? (
                    <SpinnerIcon />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  )}
                </button>
              </div>
            )}

            {/* Humanized content boxes (one per humanize run) */}
            {humanizedBoxes.map((box, idx) => (
              <div key={idx} className={styles.humanizedSection}>
                <div className={styles.humanizedHeader}>
                  <span className={styles.humanizedLabel}>
                    Humanized · {box.provider}
                  </span>
                  <div className={styles.humanizedActions}>
                    <button
                      type="button"
                      className={styles.humanizedActionBtn}
                      title="Retry with different humanizer"
                      onClick={handleHumanizeRetry}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.humanizedActionBtn}
                      title="Copy to clipboard"
                      onClick={() => void navigator.clipboard.writeText(box.content)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <a
                      href="https://gptzero.me"
                      target="_blank"
                      rel="noreferrer"
                      className={styles.humanizedActionBtn}
                      title="Check on GPTZero"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.humanizedToggle}
                  onClick={() => setHumanizedBoxOpen((prev) => !prev)}
                >
                  <span>{humanizedBoxOpen ? "Collapse" : "Expand"} content</span>
                  <svg
                    className={`${styles.thinkingChevron} ${humanizedBoxOpen ? styles.thinkingChevronOpen : ""}`}
                    width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {humanizedBoxOpen && (
                  <div className={`${styles.thinkingBox} ${styles.editingBox}`}>
                    {box.content}
                  </div>
                )}
              </div>
            ))}

            {runError && (
              <div className={styles.errorLine}>
                <span>{runError}</span>
              </div>
            )}
          </section>

          {/* Timer bar */}
          <div className={`${styles.timerBar} ${finalDuration !== null ? styles.timerBarDone : ""}`}>
            {finalDuration !== null ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>Completed in {formatDuration(finalDuration)}</span>
              </>
            ) : (
              <>
                <span className={styles.timerDot} />
                <span>{formatDuration(elapsedSeconds)}</span>
              </>
            )}
          </div>

          {/* Chat bar */}
          <div className={styles.mainChatBar}>
            <input
              type="text"
              className={styles.chatInput}
              placeholder="Send a message to Ghostwriter…"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && chatMessage.trim()) {
                  setChatMessage("");
                }
              }}
            />
            <button
              type="button"
              className={styles.chatSendBtn}
              disabled={!chatMessage.trim()}
              onClick={() => setChatMessage("")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22 11 13 2 9l20-7z" />
              </svg>
            </button>
          </div>
        </main>

        {/* Right sidebar */}
        <aside className={`${styles.rightSidebar} ${rightCollapsed ? styles.rightSidebarHidden : ""}`}>
          <div className={styles.rightSidebarHeader}>
            <span className={styles.sidebarSectionLabel}>{hasSearchResults ? "Sources" : "Essay Information"}</span>
            <button
              type="button"
              className={styles.collapseRightBtn}
              onClick={() => setRightCollapsed(true)}
              title="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18 6-6-6-6" />
                <path d="M9 18V6" />
              </svg>
            </button>
          </div>

          {hasSearchResults ? (
            <div className={styles.sourceList}>
              {(runState?.context.searchResults || []).map((source, index) => (
                <div key={`${source.website_URL}-${index}`} className={styles.sourceItem}>
                  <strong>{source.Title || `Source ${index + 1}`}</strong>
                  <span>{source.Publisher || source.Author || "Search result"}</span>
                  <a href={source.website_URL} target="_blank" rel="noreferrer">{source.website_URL}</a>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.kvColumn}>
              <div className={styles.kvStack}><span>Topic</span><strong>{topicSummary.topic}</strong></div>
              <div className={styles.kvStack}><span>Essay Type</span><strong>{topicSummary.type}</strong></div>
              <div className={styles.kvStack}><span>Citation</span><strong>{topicSummary.citation || "Pending"}</strong></div>
              <div className={styles.kvStack}><span>Word Count</span><strong>{topicSummary.words || "Pending"}</strong></div>
            </div>
          )}

          <div className={styles.outlineSection}>
            <button type="button" className={styles.collapseButton} onClick={() => setShowOutlines((prev) => !prev)}>
              <span>Outlines</span>
              <svg className={`${styles.collapseChevron} ${showOutlines ? styles.collapseChevronOpen : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {showOutlines && (
              <div className={styles.outlineList}>
                {org.selectedOutlines.length > 0 ? org.selectedOutlines.map((outline) => (
                  <div key={outline.id} className={styles.outlineItem}>
                    <strong>{outline.title}</strong>
                    <span>{outline.description}</span>
                  </div>
                )) : <p className={styles.emptyText}>The outline stack will appear here after analysis.</p>}
              </div>
            )}
          </div>
        </aside>

        {/* Right sidebar collapsed tab */}
        {rightCollapsed && (
          <button
            type="button"
            className={styles.expandRightBtn}
            onClick={() => setRightCollapsed(false)}
            title="Expand sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18-6-6 6-6" />
              <path d="M15 18V6" />
            </svg>
          </button>
        )}
      </div>

      {/* AI question dock — slides up from screen bottom */}
      {displayedQuestion ? (
        <div className={`${styles.bottomQuestionDock} ${questionExiting ? styles.bottomQuestionDockExiting : ""}`}>
          <div className={styles.bottomQuestionCard}>
            <div className={styles.bottomQuestionMeta}>
              <SpinnerIcon />
              <span>Ghostwriter</span>
            </div>
            <h3>{displayedQuestion.prompt}</h3>
            {displayedQuestion.helperText ? (
              <p className={styles.bottomQuestionHelper}>{displayedQuestion.helperText}</p>
            ) : null}

            {/* Suggestion chips */}
            {(displayedQuestion.suggestions || []).length > 0 && (
              <div className={styles.suggestionChips}>
                {(displayedQuestion.suggestions || []).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={styles.suggestionChip}
                    onClick={() => handleChipClick(chip)}
                  >
                    {displayedQuestion.field === "wordCount" ? `${chip} words` : chip}
                  </button>
                ))}
              </div>
            )}

            {/* Custom answer input */}
            <div className={styles.bottomQuestionInput}>
              <input
                type={displayedQuestion.inputType === "number" ? "number" : "text"}
                className={styles.questionCustomInput}
                placeholder={
                  displayedQuestion.field === "wordCount"
                    ? "Or enter a custom count…"
                    : displayedQuestion.suggestions?.length
                    ? "Or type a custom answer…"
                    : "Type your answer…"
                }
                value={customAnswer}
                min={displayedQuestion.field === "wordCount" ? 300 : undefined}
                max={displayedQuestion.field === "wordCount" ? 4000 : undefined}
                onChange={(e) => setCustomAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customAnswer.trim()) {
                    const val = displayedQuestion.field === "wordCount"
                      ? Number(customAnswer) || 1200
                      : customAnswer;
                    void submitCurrentAnswer(val);
                  }
                }}
              />
              <button
                type="button"
                className={styles.questionSendBtn}
                disabled={!customAnswer.trim()}
                onClick={() => {
                  if (!customAnswer.trim()) return;
                  const val = displayedQuestion.field === "wordCount"
                    ? Number(customAnswer) || 1200
                    : customAnswer;
                  void submitCurrentAnswer(val);
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22 11 13 2 9l20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {exportDocument ? (
        <div className={styles.hiddenPreview}>
          {exportDocument.pages.map((page, index) => (
            <div
              key={page.id}
              ref={(node) => {
                hiddenPageRefs.current[index] = node;
              }}
              className={styles.hiddenPage}
            >
              <div dangerouslySetInnerHTML={{ __html: page.html }} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
