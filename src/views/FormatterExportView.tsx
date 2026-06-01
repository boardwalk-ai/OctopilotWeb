"use client";

import { useCallback, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import desktopStyles from "./FormatterExportView.module.css";
import mobileStyles from "./FormatterExportViewMobile.module.css";
import type { FormatStyleId } from "./FormatStyleView";
import type { ExportDocumentSnapshot } from "@/services/OrganizerService";

/* ── Merge CSS modules ───────────────────────────────────────────────────── */
function mergeStyles(...mods: Record<string, string>[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const mod of mods) {
    for (const [key, val] of Object.entries(mod)) {
      result[key] = result[key] ? `${result[key]} ${val}` : val;
    }
  }
  return result;
}
const styles = mergeStyles(
  desktopStyles as Record<string, string>,
  mobileStyles as Record<string, string>,
);

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function makeFileName(title: string, ext: string) {
  const safe = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "formatted-document"}.${ext}`;
}
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ── DOCX builder (lazy-loaded to avoid SSR issues) ─────────────────────── */
async function buildDocx(snapshot: ExportDocumentSnapshot): Promise<Blob> {
  const docxModule = await import("docx");
  const { Document, Paragraph, TextRun, Header, PageNumber, AlignmentType, Packer } = docxModule;

  const font  = snapshot.profile.defaultFont || "Times New Roman";
  const sizePt = 12;
  const lineRule = "auto" as const;
  const lineVal = Math.round((snapshot.profile.lineHeight ?? 2) * 240);
  const marginTwip = Math.round((snapshot.profile.marginInch ?? 1) * 1440);

  // Parse each page's plain text into paragraphs
  const bodyChildren: InstanceType<typeof Paragraph>[] = [];

  for (let pi = 0; pi < snapshot.pages.length; pi++) {
    const page = snapshot.pages[pi];
    const blocks = page.plainText.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);

    for (const block of blocks) {
      // Detect if block is a heading-like line (short, no period at end)
      const isHeading = block.length < 80 && !block.endsWith(".");
      bodyChildren.push(
        new Paragraph({
          children: [new TextRun({ text: block, font, size: sizePt * 2, bold: false })],
          spacing: { line: isHeading ? 240 : lineVal, lineRule, before: isHeading ? 240 : 0 },
          indent: pi === 0 && blocks[0] === block ? {} : { firstLine: isHeading ? 0 : 720 },
          alignment: (page.textAlign ?? "left") as (typeof AlignmentType)[keyof typeof AlignmentType],
        })
      );
    }

    // Page break between pages (except last)
    if (pi < snapshot.pages.length - 1) {
      bodyChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: marginTwip, right: marginTwip, bottom: marginTwip, left: marginTwip },
          },
        },
        headers: snapshot.profile.headerText
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: snapshot.profile.headerText, font, size: sizePt * 2 }),
                      ...(snapshot.profile.showPageNumber
                        ? [
                            new TextRun({ text: "  " }),
                            new TextRun({ children: [PageNumber.CURRENT] }),
                          ]
                        : []),
                    ],
                    alignment: AlignmentType.RIGHT,
                  }),
                ],
              }),
            }
          : {},
        children: bodyChildren,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/* ── Props ───────────────────────────────────────────────────────────────── */
type FormatterExportViewProps = {
  snapshot: ExportDocumentSnapshot;
  formatStyle: FormatStyleId;
  onBack: () => void;
  onRestart: () => void;
};

type ExportState = "idle" | "busy" | "done" | "error";
type ExportId = "pdf" | "txt" | "docx";

/* ── Component ───────────────────────────────────────────────────────────── */
export default function FormatterExportView({
  snapshot,
  formatStyle,
  onBack,
  onRestart,
}: FormatterExportViewProps) {
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [states, setStates] = useState<Record<ExportId, ExportState>>({ pdf: "idle", txt: "idle", docx: "idle" });
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const setState = (id: ExportId, s: ExportState) =>
    setStates((prev) => ({ ...prev, [id]: s }));

  const { title, pages, profile } = snapshot;
  const wordCount = pages.reduce((n, p) => n + countWords(p.plainText), 0);
  const styleLabel = formatStyle.toUpperCase();

  /* ── PDF ─────────────────────────────────────────────────────────────── */
  const handlePdf = useCallback(async () => {
    if (states.pdf === "busy") return;
    setError("");
    setState("pdf", "busy");
    const fileName = makeFileName(title, "pdf");
    try {
      // Wait for fonts to be ready before capturing
      await document.fonts.ready;
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [816, 1056], compress: true });
      for (let i = 0; i < pages.length; i++) {
        const node = pageRefs.current[i];
        if (!node) throw new Error("Page not rendered.");
        const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
        if (i > 0) pdf.addPage([816, 1056], "portrait");
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 816, 1056, undefined, "FAST");
      }
      pdf.save(fileName);
      setState("pdf", "done");
      setTimeout(() => setState("pdf", "idle"), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed.");
      setState("pdf", "error");
    }
  }, [states.pdf, title, pages]);

  /* ── Copy plain text ─────────────────────────────────────────────────── */
  const handleCopyText = useCallback(async () => {
    const text = pages.map((p, i) => (pages.length > 1 ? `[Page ${i + 1}]\n\n` : "") + p.plainText.trim()).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Clipboard access denied.");
    }
  }, [pages]);

  /* ── DOCX ────────────────────────────────────────────────────────────── */
  const handleDocx = useCallback(async () => {
    if (states.docx === "busy") return;
    setError("");
    setState("docx", "busy");
    const fileName = makeFileName(title, "docx");
    try {
      const blob = await buildDocx(snapshot);
      downloadBlob(blob, fileName);
      setState("docx", "done");
      setTimeout(() => setState("docx", "idle"), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "DOCX export failed.");
      setState("docx", "error");
    }
  }, [states.docx, title, snapshot]);

  /* ── Page margin style ───────────────────────────────────────────────── */
  const marginPx = Math.round((profile.marginInch ?? 1) * 96);

  return (
    <div className={styles.shell}>
      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <div className={styles.topNav}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          Doc Oct
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        <div className={styles.inner}>

          {/* Doc meta */}
          <div className={styles.docMeta}>
            <h1 className={styles.docTitle}>{title || "Untitled document"}</h1>
            <div className={styles.metaPills}>
              <span className={`${styles.metaPill} ${styles.metaPillStyle}`}>{styleLabel}</span>
              <span className={styles.metaPill}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {pages.length} {pages.length === 1 ? "page" : "pages"}
              </span>
              <span className={styles.metaPill}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" />
                  <line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" />
                </svg>
                {wordCount.toLocaleString()} words
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className={styles.errorBar}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* Export cards */}
          <div className={styles.cardsGrid}>

            {/* ── PDF ─────────────────────────────────────────────────── */}
            <div className={styles.card}>
              <div className={`${styles.cardIconWrap} ${styles.cardIconPdf}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M9 15h2a2 2 0 0 0 0-4H9v6M15 13h2M15 17h1" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className={styles.cardTitle}>Download PDF</h2>
              <p className={styles.cardDesc}>
                Pixel-perfect export — every page rendered exactly as it appears in the editor. Best for printing and submission.
              </p>
              <button
                type="button"
                className={`${styles.cardBtn} ${styles.cardBtnPdf} ${states.pdf === "done" ? styles.cardBtnSuccess : ""}`}
                disabled={states.pdf === "busy" || pages.length === 0}
                onClick={() => void handlePdf()}
              >
                <span className={styles.btnShine} aria-hidden />
                {states.pdf === "busy" && <span className={styles.spinner} />}
                {states.pdf === "done" && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {states.pdf === "busy" ? "Generating PDF…" : states.pdf === "done" ? "Downloaded!" : "Download PDF"}
              </button>
            </div>

            {/* ── Plain text ───────────────────────────────────────────── */}
            <div className={styles.card}>
              <div className={`${styles.cardIconWrap} ${styles.cardIconTxt}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  <line x1="13" y1="13" x2="18" y2="13" /><line x1="13" y1="17" x2="18" y2="17" />
                </svg>
              </div>
              <h2 className={styles.cardTitle}>Copy Plain Text</h2>
              <p className={styles.cardDesc}>
                Copy the full formatted text to your clipboard — ready to paste into any editor, email, or document.
              </p>
              <button
                type="button"
                className={`${styles.cardBtn} ${copied ? styles.cardBtnSuccess : ""}`}
                disabled={pages.length === 0}
                onClick={() => void handleCopyText()}
              >
                {copied ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>

            {/* ── DOCX ─────────────────────────────────────────────────── */}
            <div className={styles.card}>
              <div className={`${styles.cardIconWrap} ${styles.cardIconDocx}`}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="m8 13 2 4 2-4M16 13v4M14 13h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className={styles.cardTitle}>Download DOCX</h2>
              <p className={styles.cardDesc}>
                Editable Word document with correct font, line spacing, margins, and headers — ready to open in Microsoft Word or Google Docs.
              </p>
              <button
                type="button"
                className={`${styles.cardBtn} ${states.docx === "done" ? styles.cardBtnSuccess : ""}`}
                disabled={states.docx === "busy" || pages.length === 0}
                onClick={() => void handleDocx()}
              >
                {states.docx === "busy" && <span className={styles.spinner} />}
                {states.docx === "done" && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ display: states.docx !== "idle" ? "none" : undefined }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {states.docx === "busy" ? "Building DOCX…" : states.docx === "done" ? "Downloaded!" : "Download DOCX"}
              </button>
            </div>
          </div>

          {/* Bottom bar */}
          <div className={styles.bottomBar}>
            <button type="button" className={styles.restartBtn} onClick={onRestart}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Start over
            </button>
            <span className={styles.doneNote}>All exports stay on your device.</span>
          </div>

        </div>
      </div>

      {/* ── Hidden page renderer for PDF capture ─────────────────────────── */}
      <div className={styles.hiddenRenderer} aria-hidden>
        {pages.map((page, i) => (
          <div
            key={page.id}
            ref={(el) => { pageRefs.current[i] = el; }}
            className={styles.pageNode}
            style={{
              padding: `${marginPx}px`,
              fontFamily: profile.defaultFont || "Times New Roman",
              fontSize: "12pt",
              lineHeight: profile.lineHeight ?? 2,
              textAlign: (page.textAlign ?? "left") as React.CSSProperties["textAlign"],
              color: "#111827",
            }}
            dangerouslySetInnerHTML={{ __html: page.html }}
          />
        ))}
      </div>
    </div>
  );
}
