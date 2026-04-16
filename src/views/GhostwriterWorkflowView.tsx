"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { AlvinSearchResult } from "@/services/AlvinService";
import { ExportDocumentSnapshot, Organizer } from "@/services/OrganizerService";
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

const FORMAT_QUESTION_FIELDS: Array<keyof GhostwriterFormatAnswers> = [
  "studentName",
  "instructorName",
  "institutionName",
  "courseInfo",
  "subjectCode",
  "essayDate",
];

function getQuestionLabel(field: keyof GhostwriterFormatAnswers | keyof GhostwriterDraftSettings) {
  switch (field) {
    case "wordCount":
      return "What word count should I target?";
    case "citationStyle":
      return "Which citation format should I use?";
    case "studentName":
      return "What is the student name?";
    case "instructorName":
      return "Who is the instructor?";
    case "institutionName":
      return "Which institution should I place on the paper?";
    case "courseInfo":
      return "What course information should I show?";
    case "subjectCode":
      return "What is the subject or course code?";
    case "essayDate":
      return "What date should appear on the essay?";
    case "finalEssayTitle":
      return "What title should I put on the essay?";
    default:
      return "One more detail.";
  }
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

export default function GhostwriterWorkflowView({ draft, onBack }: GhostwriterWorkflowViewProps) {
  const org = useOrganizer();
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [phase, setPhase] = useState<"boot" | "needDraftSettings" | "needFormatInfo" | "finished">("boot");
  const [searchResults, setSearchResults] = useState<AlvinSearchResult[]>([]);
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
  const [draftQuestionField, setDraftQuestionField] = useState<keyof GhostwriterDraftSettings | null>(null);
  const [formatQuestionIndex, setFormatQuestionIndex] = useState(0);
  const hasStarted = useRef(false);
  const hiddenPageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const updateStep = (id: number, status: StepStatus, detail?: string) => {
    setSteps((prev) => prev.map((step) => (
      step.id === id
        ? { ...step, status, detail: detail || step.detail }
        : step
    )));
  };

  const topicSummary = useMemo(() => ({
    topic: org.essayTopic || "Waiting for topic",
    type: org.analyzedEssayType || org.essayType || "Essay",
    citation: org.citationStyle || "Pending",
    words: typeof org.wordCount === "number" ? org.wordCount : 0,
  }), [org.analyzedEssayType, org.citationStyle, org.essayTopic, org.essayType, org.wordCount]);

  const visibleSteps = useMemo(
    () => steps.filter((step) => step.status !== "pending"),
    [steps]
  );

  const currentFormatField = FORMAT_QUESTION_FIELDS[formatQuestionIndex] || null;

  const continueAfterDraftSettings = useCallback(async () => {
    try {
      updateStep(7, "running");
      await GhostwriterOrchestrator.sculptEssay(() => {
        // Keep the workflow clean. No visible token stream here.
      });
      updateStep(7, "completed", "Lucas delivered the essay draft.");

      updateStep(8, "blocked");
      setFormatQuestionIndex(0);
      setPhase("needFormatInfo");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Lucas generation failed.");
    }
  }, []);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    void (async () => {
      try {
        updateStep(1, "running");
        const analysis = await GhostwriterOrchestrator.analyzeInstruction(draft);
        setFormatAnswers((prev) => ({
          ...prev,
          finalEssayTitle: analysis.essayTopic,
        }));
        updateStep(1, "completed", `Topic locked: ${analysis.essayTopic}`);

        updateStep(2, "running");
        const outlines = await GhostwriterOrchestrator.setupOutlines();
        updateStep(2, "completed", `${outlines.length} outline blocks are ready.`);

        updateStep(3, "running");
        const sources = await GhostwriterOrchestrator.searchSources(4);
        setSearchResults(sources);
        updateStep(3, "completed", `${sources.length} candidate sources found.`);

        updateStep(4, "completed", `${sources.length} sources are visible in the right sidebar.`);

        updateStep(5, "running");
        await GhostwriterOrchestrator.scrapeSources(sources);
        const compacted = await GhostwriterOrchestrator.gatherSourceData();
        updateStep(5, "completed", `${compacted.length} sources compacted for Lucas.`);

        const detected = GhostwriterOrchestrator.detectDraftSettings(draft.prompt);
        if (!detected.wordCount) {
          updateStep(6, "blocked");
          setDraftQuestionField("wordCount");
          setPhase("needDraftSettings");
          return;
        }

        if (!detected.citationStyle) {
          Organizer.set({
            wordCount: detected.wordCount,
          });
          updateStep(6, "blocked");
          setDraftQuestionField("citationStyle");
          setPhase("needDraftSettings");
          return;
        }

        GhostwriterOrchestrator.applyDraftSettings({
          wordCount: detected.wordCount,
          citationStyle: detected.citationStyle,
        });
        updateStep(6, "completed", `Using ${detected.wordCount} words in ${detected.citationStyle}.`);

        await continueAfterDraftSettings();
      } catch (error) {
        setRunError(error instanceof Error ? error.message : "Ghostwriter workflow failed.");
      }
    })();
  }, [continueAfterDraftSettings, draft]);

  const finishFormatting = async () => {
    try {
      updateStep(8, "completed", "Formatting details collected.");
      updateStep(9, "running");
      GhostwriterOrchestrator.applyFormatAnswers(formatAnswers);
      const snapshot = await GhostwriterOrchestrator.finalizeDocument();
      setExportDocument(snapshot);
      updateStep(9, "completed", "Citation layout applied in the background.");

      updateStep(10, "completed", "PDF-ready file is ready to download.");
      setPhase("finished");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Formatting failed.");
    }
  };

  const handleDraftSettingsSubmit = async () => {
    if (draftQuestionField === "wordCount") {
      setDraftQuestionField("citationStyle");
      return;
    }

    GhostwriterOrchestrator.applyDraftSettings(draftSettings);
    updateStep(6, "completed", `Using ${draftSettings.wordCount} words in ${draftSettings.citationStyle}.`);
    setPhase("boot");
    setDraftQuestionField(null);
    await continueAfterDraftSettings();
  };

  const handleFormatQuestionContinue = async () => {
    if (formatQuestionIndex < FORMAT_QUESTION_FIELDS.length - 1) {
      setFormatQuestionIndex((prev) => prev + 1);
      return;
    }

    await finishFormatting();
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

  return (
    <div className={styles.workflowShell}>
      <AppHeader
        className={styles.workflowHeader}
        left={<BackToHome onClick={onBack} />}
        right={<MainHeaderActions />}
      />

      <div className={styles.workflowGrid}>
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

        <main className={styles.mainColumn}>
          <div className={styles.mainHero}>
            <Image src="/OCTOPILOT.png" alt="Octopilot" width={54} height={54} className={styles.heroLogo} />
            <div>
              <div className={styles.sidebarLabel}>Agentic Workflow</div>
              <h2 className={styles.mainTitle}>Ghostwriter is moving through the workflow one step at a time.</h2>
            </div>
          </div>

          <section className={styles.workflowStream}>
            {visibleSteps.map((step) => (
              <div key={step.id} className={`${styles.stepCard} ${styles[`step${step.status[0].toUpperCase()}${step.status.slice(1)}` as keyof typeof styles] || ""}`}>
                <div className={styles.stepIndex}>{step.id}</div>
                <div className={styles.stepCopy}>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
                <div className={styles.stepStatus}>{step.status}</div>
              </div>
            ))}

            {phase === "finished" && exportDocument && (
              <div className={styles.finishedCard}>
                <h3>Finished product ready.</h3>
                <p>The export snapshot is complete. Download the PDF directly from here.</p>
                <button type="button" className={styles.primaryButton} onClick={() => void handlePdfDownload()}>
                  {activeDownload ? "Preparing PDF..." : "Download PDF"}
                </button>
              </div>
            )}

            {runError && (
              <div className={styles.errorCard}>
                {runError}
              </div>
            )}
          </section>
        </main>

        {searchResults.length > 0 && (
          <aside className={styles.rightSidebar}>
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarLabel}>Sources</div>
              <div className={styles.sourceList}>
                {searchResults.map((source, index) => (
                  <div key={`${source.website_URL}-${index}`} className={styles.sourceItem}>
                    <strong>{source.Title || `Source ${index + 1}`}</strong>
                    <span>{source.Publisher || source.Author || "Search result"}</span>
                    <a href={source.website_URL} target="_blank" rel="noreferrer">{source.website_URL}</a>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.sidebarCard}>
              <button type="button" className={styles.collapseButton} onClick={() => setShowOutlines((prev) => !prev)}>
                <span>Outlines</span>
                <svg className={`${styles.collapseChevron} ${showOutlines ? styles.collapseChevronOpen : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {showOutlines ? (
                <div className={styles.outlineList}>
                  {org.selectedOutlines.map((outline) => (
                    <div key={outline.id} className={styles.outlineItem}>
                      <strong>{outline.title}</strong>
                      <span>{outline.description}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>
        )}

        {searchResults.length === 0 && (
          <aside className={styles.rightSidebar}>
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarLabel}>Essay Information</div>
              <div className={styles.kvColumn}>
                <div className={styles.kvStack}><span>Topic</span><strong>{topicSummary.topic}</strong></div>
                <div className={styles.kvStack}><span>Essay Type</span><strong>{topicSummary.type}</strong></div>
                <div className={styles.kvStack}><span>Citation</span><strong>{topicSummary.citation || "Pending"}</strong></div>
                <div className={styles.kvStack}><span>Word Count</span><strong>{topicSummary.words || "Pending"}</strong></div>
              </div>
            </div>
            <div className={styles.sidebarCard}>
              <button type="button" className={styles.collapseButton} onClick={() => setShowOutlines((prev) => !prev)}>
                <span>Outlines</span>
                <svg className={`${styles.collapseChevron} ${showOutlines ? styles.collapseChevronOpen : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {showOutlines ? (
                <div className={styles.outlineList}>
                  {org.selectedOutlines.length > 0 ? org.selectedOutlines.map((outline) => (
                    <div key={outline.id} className={styles.outlineItem}>
                      <strong>{outline.title}</strong>
                      <span>{outline.description}</span>
                    </div>
                  )) : <p className={styles.emptyText}>The outline stack will appear here after analysis.</p>}
                </div>
              ) : null}
            </div>
          </aside>
        )}
      </div>

      {(phase === "needDraftSettings" && draftQuestionField) ? (
        <div className={styles.bottomQuestionDock}>
          <div className={styles.bottomQuestionCard}>
            <div className={styles.bottomQuestionMeta}>Ghostwriter needs one detail</div>
            <h3>{getQuestionLabel(draftQuestionField)}</h3>
            <div className={styles.bottomQuestionInput}>
              {draftQuestionField === "citationStyle" ? (
                <select
                  value={draftSettings.citationStyle}
                  onChange={(event) => setDraftSettings((prev) => ({ ...prev, citationStyle: event.target.value }))}
                >
                  {["APA", "MLA", "Chicago", "Harvard", "IEEE", "None"].map((style) => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={300}
                  max={4000}
                  value={draftSettings.wordCount}
                  onChange={(event) => setDraftSettings((prev) => ({ ...prev, wordCount: Number(event.target.value) || 1200 }))}
                />
              )}
              <button type="button" className={styles.primaryButton} onClick={() => void handleDraftSettingsSubmit()}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {(phase === "needFormatInfo" && currentFormatField) ? (
        <div className={styles.bottomQuestionDock}>
          <div className={styles.bottomQuestionCard}>
            <div className={styles.bottomQuestionMeta}>One more formatting detail</div>
            <h3>{getQuestionLabel(currentFormatField)}</h3>
            <div className={styles.bottomQuestionInput}>
              <input
                type="text"
                value={formatAnswers[currentFormatField]}
                onChange={(event) => setFormatAnswers((prev) => ({ ...prev, [currentFormatField]: event.target.value }))}
              />
              <button type="button" className={styles.primaryButton} onClick={() => void handleFormatQuestionContinue()}>
                {formatQuestionIndex === FORMAT_QUESTION_FIELDS.length - 1 ? "Finish" : "Next"}
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
