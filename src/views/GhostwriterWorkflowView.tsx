"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Sora } from "next/font/google";
import { AppHeader, BackToHome, MainHeaderActions } from "@/components/header";
import { useOrganizer } from "@/hooks/useOrganizer";
import {
  GhostwriterDraftInput,
  GhostwriterDraftSettings,
  GhostwriterFormatAnswers,
  GhostwriterOrchestrator,
} from "@/services/GhostwriterOrchestrator";
import { AlvinSearchResult } from "@/services/AlvinService";
import { ExportDocumentSnapshot } from "@/services/OrganizerService";
import styles from "./GhostwriterWorkflowView.module.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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

export default function GhostwriterWorkflowView({ draft, onBack }: GhostwriterWorkflowViewProps) {
  const org = useOrganizer();
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [phase, setPhase] = useState<"boot" | "needDraftSettings" | "needFormatInfo" | "finished">("boot");
  const [searchResults, setSearchResults] = useState<AlvinSearchResult[]>([]);
  const [streamedEssay, setStreamedEssay] = useState("");
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

  const continueAfterDraftSettings = useCallback(async () => {
    try {
      updateStep(7, "running");
      await GhostwriterOrchestrator.sculptEssay((essayText) => {
        setStreamedEssay(essayText);
      });
      updateStep(7, "completed", "Lucas delivered the essay draft.");

      updateStep(8, "blocked");
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
        if (!detected.wordCount || !detected.citationStyle) {
          updateStep(6, "blocked");
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
    GhostwriterOrchestrator.applyDraftSettings(draftSettings);
    updateStep(6, "completed", `Using ${draftSettings.wordCount} words in ${draftSettings.citationStyle}.`);
    setPhase("boot");
    await continueAfterDraftSettings();
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
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarLabel}>Ghostwriter Topic</div>
            <h1 className={`${sora.className} ${styles.topicTitle}`}>{topicSummary.topic}</h1>
            <p className={styles.topicMeta}>{topicSummary.type}</p>
          </div>

          <div className={styles.sidebarCard}>
            <div className={styles.sidebarLabel}>Draft Inputs</div>
            <div className={styles.kvRow}><span>Word Count</span><strong>{topicSummary.words || "Pending"}</strong></div>
            <div className={styles.kvRow}><span>Citation</span><strong>{topicSummary.citation || "Pending"}</strong></div>
            <div className={styles.kvRow}><span>Attachments</span><strong>{draft.attachments.length}</strong></div>
          </div>

          <div className={styles.sidebarCard}>
            <div className={styles.sidebarLabel}>Outlines</div>
            <div className={styles.outlineList}>
              {org.selectedOutlines.length > 0 ? org.selectedOutlines.map((outline) => (
                <div key={outline.id} className={styles.outlineItem}>
                  <strong>{outline.title}</strong>
                  <span>{outline.description}</span>
                </div>
              )) : <p className={styles.emptyText}>The outline stack will appear here after analysis.</p>}
            </div>
          </div>
        </aside>

        <main className={styles.mainColumn}>
          <div className={styles.mainHero}>
            <Image src="/OCTOPILOT.png" alt="Octopilot" width={54} height={54} className={styles.heroLogo} />
            <div>
              <div className={styles.sidebarLabel}>Agentic Workflow</div>
              <h2 className={styles.mainTitle}>Ghostwriter is building the paper step by step.</h2>
            </div>
          </div>

          <section className={styles.workflowStream}>
            {steps.map((step) => (
              <div key={step.id} className={`${styles.stepCard} ${styles[`step${step.status[0].toUpperCase()}${step.status.slice(1)}` as keyof typeof styles] || ""}`}>
                <div className={styles.stepIndex}>{step.id}</div>
                <div className={styles.stepCopy}>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
                <div className={styles.stepStatus}>{step.status}</div>
              </div>
            ))}

            {phase === "needDraftSettings" && (
              <div className={styles.questionCard}>
                <h3>Before Lucas writes, I need two details.</h3>
                <p>The instruction did not lock both the word count and citation format.</p>
                <div className={styles.formGrid}>
                  <label>
                    <span>Word Count</span>
                    <input
                      type="number"
                      min={300}
                      max={4000}
                      value={draftSettings.wordCount}
                      onChange={(event) => setDraftSettings((prev) => ({ ...prev, wordCount: Number(event.target.value) || 1200 }))}
                    />
                  </label>
                  <label>
                    <span>Citation Format</span>
                    <select
                      value={draftSettings.citationStyle}
                      onChange={(event) => setDraftSettings((prev) => ({ ...prev, citationStyle: event.target.value }))}
                    >
                      {["APA", "MLA", "Chicago", "Harvard", "IEEE", "None"].map((style) => (
                        <option key={style} value={style}>{style}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className={styles.primaryButton} onClick={() => void handleDraftSettingsSubmit()}>
                  Continue workflow
                </button>
              </div>
            )}

            {phase === "needFormatInfo" && (
              <div className={styles.questionCard}>
                <h3>Now I need the citation header details.</h3>
                <p>This is the same metadata the final format step needs before the background export process runs.</p>
                <div className={styles.formGrid}>
                  <label><span>Essay Title</span><input value={formatAnswers.finalEssayTitle} onChange={(event) => setFormatAnswers((prev) => ({ ...prev, finalEssayTitle: event.target.value }))} /></label>
                  <label><span>Student Name</span><input value={formatAnswers.studentName} onChange={(event) => setFormatAnswers((prev) => ({ ...prev, studentName: event.target.value }))} /></label>
                  <label><span>Instructor Name</span><input value={formatAnswers.instructorName} onChange={(event) => setFormatAnswers((prev) => ({ ...prev, instructorName: event.target.value }))} /></label>
                  <label><span>Institution Name</span><input value={formatAnswers.institutionName} onChange={(event) => setFormatAnswers((prev) => ({ ...prev, institutionName: event.target.value }))} /></label>
                  <label><span>Course Info</span><input value={formatAnswers.courseInfo} onChange={(event) => setFormatAnswers((prev) => ({ ...prev, courseInfo: event.target.value }))} /></label>
                  <label><span>Subject Code</span><input value={formatAnswers.subjectCode} onChange={(event) => setFormatAnswers((prev) => ({ ...prev, subjectCode: event.target.value }))} /></label>
                  <label><span>Essay Date</span><input value={formatAnswers.essayDate} onChange={(event) => setFormatAnswers((prev) => ({ ...prev, essayDate: event.target.value }))} /></label>
                </div>
                <button type="button" className={styles.primaryButton} onClick={() => void finishFormatting()}>
                  Finish document
                </button>
              </div>
            )}

            {streamedEssay && (
              <div className={styles.previewCard}>
                <div className={styles.sidebarLabel}>Lucas Draft Stream</div>
                <pre>{streamedEssay}</pre>
              </div>
            )}

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
          </aside>
        )}
      </div>

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
