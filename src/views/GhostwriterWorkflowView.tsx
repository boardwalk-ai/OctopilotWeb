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
  { id: 1, title: "Analyze the instruction", detail: "Hein reads the prompt and defines the topic.", status: "pending" },
  { id: 2, title: "Setting up outlines", detail: "Lily prepares the paragraph structure.", status: "pending" },
  { id: 3, title: "Source search", detail: "Alvin looks for useful sources.", status: "pending" },
  { id: 4, title: "Sources sidebar", detail: "Source results open in the right column.", status: "pending" },
  { id: 5, title: "Gathering data from sources", detail: "Scraping and compaction run here.", status: "pending" },
  { id: 6, title: "Clarify draft settings", detail: "Ask for missing word count and citation style.", status: "pending" },
  { id: 7, title: "Sculpting the essay", detail: "Lucas writes the draft.", status: "pending" },
  { id: 8, title: "Collect formatting details", detail: "Ask for student, instructor, and course metadata.", status: "pending" },
  { id: 9, title: "Formatting in the background", detail: "Apply the final citation layout without showing the intermediate editor step.", status: "pending" },
  { id: 10, title: "Finished product", detail: "Prepare the PDF-ready export.", status: "pending" },
];

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
  return formatAnswers[field];
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
  const hasStarted = useRef(false);
  const isExecutingTool = useRef(false);
  const hiddenPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const streamRef = useRef<HTMLElement>(null);

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
    void (async () => {
      try {
        const result = await GhostwriterOrchestrator.executeToolCall(runState.pendingToolCall!, draft);
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
    if (field === "wordCount") {
      void submitCurrentAnswer(Number(chip));
    } else {
      void submitCurrentAnswer(chip);
    }
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
            {visibleSteps.map((step) => (
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
                  <span className={styles.streamTitle}>{step.title}</span>
                  <span className={styles.streamDetail}>
                    {step.detail}
                    {step.status === "running" && <span className={styles.streamDots}><span>.</span><span>.</span><span>.</span><span>.</span></span>}
                  </span>
                </div>
              </div>
            ))}

            {runState?.status === "finished" && exportDocument && (
              <div className={styles.finishedLine}>
                <div className={styles.streamIconWrap} style={{ color: "#22c55e" }}>
                  <CheckIcon />
                </div>
                <div className={styles.streamCopy}>
                  <span className={styles.streamTitle}>Finished product ready.</span>
                  <span className={styles.streamDetail}>The export snapshot is complete. Download the PDF directly from here.</span>
                </div>
                <button type="button" className={styles.primaryButton} onClick={() => void handlePdfDownload()}>
                  {activeDownload ? "Preparing PDF…" : "Download PDF"}
                </button>
              </div>
            )}

            {runError && (
              <div className={styles.errorLine}>
                <span>{runError}</span>
              </div>
            )}
          </section>

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
      {runState?.pendingQuestion ? (
        <div className={styles.bottomQuestionDock}>
          <div className={styles.bottomQuestionCard}>
            <div className={styles.bottomQuestionMeta}>
              <SpinnerIcon />
              <span>Ghostwriter</span>
            </div>
            <h3>{runState.pendingQuestion.prompt}</h3>
            {runState.pendingQuestion.helperText ? (
              <p className={styles.bottomQuestionHelper}>{runState.pendingQuestion.helperText}</p>
            ) : null}

            {/* Suggestion chips */}
            {(runState.pendingQuestion.suggestions || []).length > 0 && (
              <div className={styles.suggestionChips}>
                {(runState.pendingQuestion.suggestions || []).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={styles.suggestionChip}
                    onClick={() => handleChipClick(chip)}
                  >
                    {runState.pendingQuestion!.field === "wordCount" ? `${chip} words` : chip}
                  </button>
                ))}
              </div>
            )}

            {/* Custom answer input */}
            <div className={styles.bottomQuestionInput}>
              <input
                type={runState.pendingQuestion.inputType === "number" ? "number" : "text"}
                className={styles.questionCustomInput}
                placeholder={
                  runState.pendingQuestion.field === "wordCount"
                    ? "Or enter a custom count…"
                    : runState.pendingQuestion.suggestions?.length
                    ? "Or type a custom answer…"
                    : "Type your answer…"
                }
                value={customAnswer}
                min={runState.pendingQuestion.field === "wordCount" ? 300 : undefined}
                max={runState.pendingQuestion.field === "wordCount" ? 4000 : undefined}
                onChange={(e) => setCustomAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customAnswer.trim()) {
                    const val = runState.pendingQuestion!.field === "wordCount"
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
                  const val = runState.pendingQuestion!.field === "wordCount"
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
