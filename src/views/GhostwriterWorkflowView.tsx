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

// Splits pages naturally like MS Word — paragraphs flow across page boundaries
// by splitting at word boundaries when they don't fit, so every page is filled
// before moving to the next one.
async function paginateSnapshot(snapshot: ExportDocumentSnapshot): Promise<ExportDocumentSnapshot> {
  if (typeof document === "undefined") return snapshot;
  const marginPx = Math.round((snapshot.profile.marginInch || 1) * 96);
  const headerReserve = (snapshot.profile.headerText || snapshot.profile.showPageNumber) ? 40 : 0;
  // Small safety buffer to avoid the last line clipping when html2canvas rounds.
  const availableHeight = 1056 - marginPx * 2 - headerReserve - 6;
  const contentWidth = 816 - marginPx * 2;

  const newPages: ExportDocumentSnapshot["pages"] = [];

  for (const page of snapshot.pages) {
    // Title / centered pages keep as-is
    if (page.centerVertically) {
      newPages.push({ ...page, id: newPages.length + 1 });
      continue;
    }

    // Measurer mirrors the actual content div's typographic context.
    const measurer = document.createElement("div");
    measurer.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      `width:${contentWidth}px`,
      `font-family:${snapshot.profile.defaultFont || "Times New Roman"}`,
      `line-height:${String(page.lineHeight || snapshot.profile.lineHeight || 2)}`,
      `text-align:${page.textAlign || "left"}`,
      "color:#111827",
      "visibility:hidden",
    ].join(";");
    document.body.appendChild(measurer);

    try {
      const holder = document.createElement("div");
      holder.innerHTML = page.html;
      const sourceBlocks = Array.from(holder.children).filter((el) => {
        const e = el as HTMLElement;
        return e.textContent && e.textContent.trim().length > 0;
      }) as HTMLElement[];

      if (sourceBlocks.length === 0) {
        newPages.push({ ...page, id: newPages.length + 1 });
        continue;
      }

      const measureHeight = (el: HTMLElement): number => {
        measurer.appendChild(el);
        const h = el.offsetHeight;
        measurer.removeChild(el);
        return h;
      };

      const queue: HTMLElement[] = sourceBlocks.map((b) => b.cloneNode(true) as HTMLElement);
      const allChunks: HTMLElement[][] = [];
      let chunk: HTMLElement[] = [];
      let used = 0;

      const flush = () => {
        if (chunk.length > 0) {
          allChunks.push(chunk);
          chunk = [];
          used = 0;
        }
      };

      // Strip `text-indent:` from a continuation block's style so split
      // paragraphs don't look like brand-new indented paragraphs.
      const stripIndent = (el: HTMLElement) => {
        const s = el.getAttribute("style") || "";
        const next = s.replace(/text-indent\s*:[^;]*;?/gi, "");
        el.setAttribute("style", next);
      };

      // Binary-search the max number of words that fit in `space` inside a
      // clone of `block` (preserves the block's tag/style).
      const splitBlockByWords = (block: HTMLElement, space: number): [HTMLElement, HTMLElement] | null => {
        const fullText = block.textContent || "";
        const words = fullText.split(/\s+/).filter(Boolean);
        if (words.length <= 1) return null;

        const probe = block.cloneNode(false) as HTMLElement;
        measurer.appendChild(probe);
        try {
          let lo = 1;
          let hi = words.length - 1;
          let best = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            probe.textContent = words.slice(0, mid).join(" ");
            if (probe.offsetHeight <= space) {
              best = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          if (best === 0) return null;

          const head = block.cloneNode(false) as HTMLElement;
          head.textContent = words.slice(0, best).join(" ");
          const tail = block.cloneNode(false) as HTMLElement;
          tail.textContent = words.slice(best).join(" ");
          stripIndent(tail);
          return [head, tail];
        } finally {
          measurer.removeChild(probe);
        }
      };

      while (queue.length > 0) {
        const block = queue.shift()!;
        const blockHeight = measureHeight(block);
        const remaining = availableHeight - used;

        if (blockHeight <= remaining) {
          chunk.push(block);
          used += blockHeight;
          continue;
        }

        // Doesn't fit. If current page has content and block contains inline
        // HTML we shouldn't destroy (e.g., <a> hyperlinks), move to next page.
        const hasInlineHtml = block.querySelector("a, strong, em, b, i, span") !== null;
        if (hasInlineHtml && chunk.length > 0) {
          flush();
          queue.unshift(block);
          continue;
        }

        // Try a word-boundary split to fill remaining space.
        if (remaining > 50) {
          const split = splitBlockByWords(block, remaining);
          if (split) {
            chunk.push(split[0]);
            flush();
            queue.unshift(split[1]);
            continue;
          }
        }

        // Remaining space too small to split meaningfully. Start a fresh page
        // and retry the block there.
        if (chunk.length > 0) {
          flush();
          queue.unshift(block);
          continue;
        }

        // Page is empty and block still won't split (single word or inline HTML
        // heavy). Place as-is; clipping is a last-resort fallback.
        chunk.push(block);
        flush();
      }

      flush();

      allChunks.forEach((c) => {
        newPages.push({
          ...page,
          id: newPages.length + 1,
          html: c.map((el) => el.outerHTML).join(""),
        });
      });
    } finally {
      document.body.removeChild(measurer);
    }
  }

  return { ...snapshot, pages: newPages };
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
  const [originalExportDoc, setOriginalExportDoc] = useState<ExportDocumentSnapshot | null>(null);
  const [humanizedExportDoc, setHumanizedExportDoc] = useState<ExportDocumentSnapshot | null>(null);
  const [activeDownload, setActiveDownload] = useState<"original" | "humanized" | null>(null);
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
  const originalPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const humanizedPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const streamRef = useRef<HTMLElement>(null);
  const questionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mini editor
  const [miniEditorOpen, setMiniEditorOpen] = useState(false);
  const [miniEditorExiting, setMiniEditorExiting] = useState(false);
  const [miniEditorType, setMiniEditorType] = useState<"original" | "humanized">("original");
  const [miniEditorDownloading, setMiniEditorDownloading] = useState(false);
  const miniEditorContentRefs = useRef<Array<HTMLDivElement | null>>([]);

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
        const toolName = runState.pendingToolCall!.name;
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
        if (toolName === "finalize_export") {
          const raw = Organizer.get().exportDocument;
          setOriginalExportDoc(raw ? await paginateSnapshot(raw) : null);
        }
        if (toolName === "finalize_export_humanized") {
          const raw = Organizer.get().exportDocument;
          setHumanizedExportDoc(raw ? await paginateSnapshot(raw) : null);
        }
        const nextState = await GhostwriterOrchestrator.submitToolResult(runState.runId, toolName, result);
        setRunState(nextState);
      } catch (error) {
        setRunError(error instanceof Error ? error.message : "Tool execution failed.");
      } finally {
        isExecutingTool.current = false;
      }
    })();
  }, [draft, runState]);

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
      helperText: "We recommend using StealthGPT for best results.",
      inputType: "text",
      suggestions: ["StealthGPT", "UndetectableAI"],
    });
    setRetryingHumanize(false);
  };

  const handlePdfDownload = async (
    snapshot: ExportDocumentSnapshot,
    pageRefs: Array<HTMLDivElement | null>,
    type: "original" | "humanized",
  ) => {
    if (snapshot.pages.length === 0) return;

    setActiveDownload(type);
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [816, 1056],
        compress: true,
      });

      for (let index = 0; index < snapshot.pages.length; index += 1) {
        const node = pageRefs[index];
        if (!node) throw new Error("Missing export page.");

        // Collect hyperlink positions before rasterizing so we can overlay
        // real clickable link regions on the PDF page.
        const pageRect = node.getBoundingClientRect();
        const anchorRegions = Array.from(node.querySelectorAll("a[href]"))
          .map((a) => {
            const r = (a as HTMLElement).getBoundingClientRect();
            const href = (a as HTMLAnchorElement).href || (a as HTMLElement).getAttribute("href") || "";
            return {
              x: r.left - pageRect.left,
              y: r.top - pageRect.top,
              w: r.width,
              h: r.height,
              href,
            };
          })
          .filter((r) => r.w > 0 && r.h > 0 && /^https?:\/\//i.test(r.href));

        const canvas = await html2canvas(node, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false,
        });
        const image = canvas.toDataURL("image/png");
        if (index > 0) pdf.addPage([816, 1056], "portrait");
        pdf.addImage(image, "PNG", 0, 0, 816, 1056, undefined, "FAST");

        // Overlay clickable link regions on top of the rasterized page.
        anchorRegions.forEach((region) => {
          pdf.link(region.x, region.y, region.w, region.h, { url: region.href });
        });
      }

      pdf.save(makeFileName(snapshot.title, "pdf"));
    } finally {
      setActiveDownload(null);
    }
  };

  const miniEditorSnapshot = miniEditorType === "original" ? originalExportDoc : humanizedExportDoc;

  // Renders document pages identical to ExportView for accurate PDF capture
  function renderDocPages(
    snapshot: ExportDocumentSnapshot,
    pageRefs: React.MutableRefObject<Array<HTMLDivElement | null>>,
  ) {
    const profile = snapshot.profile;
    const marginPx = Math.round((profile.marginInch || 1) * 96);
    const hasMlaHead = org.citationStyle.trim().toUpperCase() === "MLA";

    return snapshot.pages.map((page, index) => {
      const showPageNum = page.showPageNumber ?? profile.showPageNumber;
      let pageNumLabel = "";
      if (showPageNum) {
        const pos = index + 1;
        const startPage = profile.pageNumberStartPage ?? 1;
        const startNum = profile.pageNumberStartNumber ?? 1;
        if (pos >= startPage) {
          pageNumLabel = String(Math.max(1, startNum + (pos - startPage)));
        }
      }
      const hasHeader = !!(profile.headerText || pageNumLabel);

      return (
        <div
          key={page.id}
          ref={(node) => { pageRefs.current[index] = node; }}
          style={{
            width: "816px",
            height: "1056px",
            background: "white",
            color: "#111827",
            fontFamily: profile.defaultFont || "Arial",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              paddingTop: `${marginPx}px`,
              paddingRight: `${marginPx}px`,
              paddingBottom: `${marginPx}px`,
              paddingLeft: `${marginPx}px`,
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {hasHeader && (
              <div style={{ marginBottom: "16px" }}>
                {hasMlaHead ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "4px 0", textAlign: "right", fontSize: "11pt", color: "#111827" }}>
                    {profile.headerText ? <span>{profile.headerText}</span> : null}
                    {pageNumLabel ? <span>{pageNumLabel}</span> : null}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "4px 0", fontSize: "11pt", color: "#111827" }}>
                    <span>{profile.headerText || ""}</span>
                    {pageNumLabel ? <span>{pageNumLabel}</span> : null}
                  </div>
                )}
              </div>
            )}
            <div
              data-content="1"
              style={{
                textAlign: page.textAlign || "left",
                lineHeight: String(page.lineHeight || profile.lineHeight || 1.5),
                ...(page.centerVertically ? { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" } : {}),
              }}
              dangerouslySetInnerHTML={{ __html: page.html }}
            />
          </div>
        </div>
      );
    });
  }

  const closeMiniEditor = () => {
    setMiniEditorExiting(true);
    setTimeout(() => {
      setMiniEditorOpen(false);
      setMiniEditorExiting(false);
    }, 220);
  };

  const handleOpenMiniEditor = (type: "original" | "humanized") => {
    miniEditorContentRefs.current = [];
    setMiniEditorType(type);
    setMiniEditorOpen(true);
    setMiniEditorExiting(false);
  };

  const handleMiniEditorFinish = async () => {
    if (!miniEditorSnapshot) return;
    const pageRefs = miniEditorType === "original" ? originalPageRefs : humanizedPageRefs;
    setMiniEditorDownloading(true);
    try {
      // Sync edited HTML from contentEditable refs into the hidden page content divs
      miniEditorSnapshot.pages.forEach((_, idx) => {
        const editedNode = miniEditorContentRefs.current[idx];
        const hiddenNode = pageRefs.current[idx];
        if (editedNode && hiddenNode) {
          const contentDiv = hiddenNode.querySelector("[data-content]") as HTMLElement | null;
          if (contentDiv) contentDiv.innerHTML = editedNode.innerHTML;
        }
      });
      // Wait a tick for the DOM to settle before html2canvas
      await new Promise<void>((resolve) => setTimeout(resolve, 60));
      await handlePdfDownload(miniEditorSnapshot, pageRefs.current, miniEditorType);
      closeMiniEditor();
    } finally {
      setMiniEditorDownloading(false);
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

            {originalExportDoc && !humanizedExportDoc && (
              <div className={styles.editorCard} onClick={() => handleOpenMiniEditor("original")}>
                <div className={styles.editorCardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div className={styles.editorCardMeta}>
                  <span className={styles.editorCardTitle}>Proceed to Editor</span>
                  <span className={styles.editorCardSub}>Refine the essay before downloading your final PDF</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </div>
            )}

            {originalExportDoc && (
              <div className={styles.finishedCard} onClick={() => void handlePdfDownload(originalExportDoc, originalPageRefs.current, "original")}>
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
                  <span className={styles.finishedCardTitle}>{originalExportDoc.title || "Your Essay"}</span>
                  <span className={styles.finishedCardFilename}>{makeFileName(originalExportDoc.title, "pdf")}</span>
                  <span className={styles.finishedCardType}>PDF · Original</span>
                </div>
                <button
                  type="button"
                  className={styles.finishedCardDownloadBtn}
                  onClick={(e) => { e.stopPropagation(); void handlePdfDownload(originalExportDoc, originalPageRefs.current, "original"); }}
                  title="Download PDF"
                >
                  {activeDownload === "original" ? (
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

            {humanizedExportDoc && (
              <div className={styles.editorCard} onClick={() => handleOpenMiniEditor("humanized")}>
                <div className={styles.editorCardIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div className={styles.editorCardMeta}>
                  <span className={styles.editorCardTitle}>Proceed to Editor</span>
                  <span className={styles.editorCardSub}>Refine the humanized essay before your final download</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </div>
            )}

            {humanizedExportDoc && (
              <div className={styles.finishedCard} onClick={() => void handlePdfDownload(humanizedExportDoc, humanizedPageRefs.current, "humanized")}>
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
                  <span className={styles.finishedCardTitle}>{humanizedExportDoc.title || "Humanized Essay"}</span>
                  <span className={styles.finishedCardFilename}>{makeFileName(humanizedExportDoc.title, "pdf")}</span>
                  <span className={styles.finishedCardType}>PDF · Humanized</span>
                </div>
                <button
                  type="button"
                  className={styles.finishedCardDownloadBtn}
                  onClick={(e) => { e.stopPropagation(); void handlePdfDownload(humanizedExportDoc, humanizedPageRefs.current, "humanized"); }}
                  title="Download Humanized PDF"
                >
                  {activeDownload === "humanized" ? (
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

      {originalExportDoc ? (
        <div className={styles.hiddenPreview}>
          {renderDocPages(originalExportDoc, originalPageRefs)}
        </div>
      ) : null}

      {humanizedExportDoc ? (
        <div className={styles.hiddenPreview}>
          {renderDocPages(humanizedExportDoc, humanizedPageRefs)}
        </div>
      ) : null}

      {/* Mini editor overlay */}
      {miniEditorOpen && miniEditorSnapshot && (
        <div
          className={`${styles.miniEditorOverlay} ${miniEditorExiting ? styles.miniEditorOverlayExiting : ""}`}
          onClick={(e) => { if (e.target === e.currentTarget) closeMiniEditor(); }}
        >
          <div className={`${styles.miniEditorPanel} ${miniEditorExiting ? styles.miniEditorPanelExiting : ""}`}>
            {/* Header */}
            <div className={styles.miniEditorHeader}>
              <div className={styles.miniEditorHeaderLeft}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Document Editor</span>
                <span className={styles.miniEditorBadge}>
                  {miniEditorType === "humanized" ? "Humanized" : "Original"}
                </span>
              </div>
              <button type="button" className={styles.miniEditorClose} onClick={closeMiniEditor} title="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Editable pages */}
            <div className={styles.miniEditorBody}>
              {miniEditorSnapshot.pages.map((page, idx) => (
                <div key={page.id} className={styles.miniEditorPage}>
                  {miniEditorSnapshot.pages.length > 1 && (
                    <div className={styles.miniEditorPageLabel}>Page {idx + 1}</div>
                  )}
                  <div
                    ref={(node) => { miniEditorContentRefs.current[idx] = node; }}
                    contentEditable
                    suppressContentEditableWarning
                    className={styles.miniEditorPageContent}
                    dangerouslySetInnerHTML={{ __html: page.html }}
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className={styles.miniEditorFooter}>
              <span className={styles.miniEditorHint}>Click anywhere on the text to edit</span>
              <div className={styles.miniEditorFooterActions}>
                <button type="button" className={styles.miniEditorCancelBtn} onClick={closeMiniEditor}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.miniEditorFinishBtn}
                  onClick={() => void handleMiniEditorFinish()}
                  disabled={miniEditorDownloading}
                >
                  {miniEditorDownloading ? (
                    <SpinnerIcon />
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Finish &amp; Download
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
