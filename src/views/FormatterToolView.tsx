"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import desktopStyles from "./FormatterToolView.module.css";
import mobileStyles from "./FormatterToolViewMobile.module.css";
import type { ParsedDocumentResult } from "@/app/api/formatter/parse/route";

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

const WORDS_PER_PAGE = 250;
function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ── File readers ────────────────────────────────────────────────────────── */
async function extractDocxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("Could not read this .docx file.");
  const withBreaks = documentXml
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^/]*\/>/g, "\n");
  const plain = withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
  if (!plain) throw new Error("This .docx file appears to be empty.");
  return plain;
}

async function extractPdfText(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/pdf/extract", { method: "POST", body: form });
  if (!res.ok) throw new Error("Could not extract PDF text.");
  const data = (await res.json()) as { pages?: string[]; text?: string; error?: string };
  // API returns { pages: string[] } — join them into one string
  if (data.pages && data.pages.length > 0) {
    const joined = data.pages.join("\n\n").trim();
    if (!joined) throw new Error("PDF extraction returned empty text.");
    return joined;
  }
  // Fallback: some versions return { text }
  if (data.text) return data.text;
  throw new Error(data.error ?? "PDF extraction returned empty result.");
}

async function readUploadedFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return file.text();
  if (name.endsWith(".docx")) return extractDocxText(file);
  if (name.endsWith(".pdf")) return extractPdfText(file);
  throw new Error("Unsupported file type. Use .pdf, .docx, or .txt.");
}

/* ── Parse status type ───────────────────────────────────────────────────── */
type ParseStatus =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "done"; result: ParsedDocumentResult }
  | { kind: "error"; message: string };

/* ── Props ───────────────────────────────────────────────────────────────── */
type FormatterToolViewProps = {
  onBack: () => void;
  onContinue: (content: string, parsed: ParsedDocumentResult | null) => void;
};

/* ── Component ───────────────────────────────────────────────────────────── */
export default function FormatterToolView({ onBack, onContinue }: FormatterToolViewProps) {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus>({ kind: "idle" });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wordCount = useMemo(() => countWords(content), [content]);
  const charCount = content.length;
  const pageCount = useMemo(
    () => (wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE))),
    [wordCount],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
  }, []);

  /* ── Background parse (debounced 800ms) ──────────────────────────────── */
  const triggerParse = useCallback((text: string) => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    if (!text.trim() || text.trim().length < 50) {
      setParseStatus({ kind: "idle" });
      return;
    }
    setParseStatus({ kind: "parsing" });
    parseTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/formatter/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = (await res.json()) as ParsedDocumentResult & { error?: string };
        if (!res.ok || data.error) {
          setParseStatus({ kind: "error", message: data.error ?? "Could not parse document." });
          return;
        }
        setParseStatus({ kind: "done", result: data });
      } catch {
        setParseStatus({ kind: "error", message: "Network error during parsing." });
      }
    }, 800);
  }, []);

  /* ── File / paste loading ────────────────────────────────────────────── */
  const applyContent = useCallback((text: string, name?: string) => {
    setContent(text);
    setFileName(name ?? null);
    triggerParse(text);
  }, [triggerParse]);

  const applyFile = async (file: File) => {
    setIsUploading(true);
    try {
      const text = await readUploadedFile(file);
      applyContent(text, file.name);
      showToast(`Loaded ${file.name}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not read file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { showToast("Clipboard is empty."); return; }
      applyContent(text);
      showToast("Pasted from clipboard");
    } catch {
      showToast("Allow clipboard access to paste text.");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void applyFile(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    if (fileName) setFileName(null);
    triggerParse(text);
  };

  const clearDocument = () => {
    setContent("");
    setFileName(null);
    setParseStatus({ kind: "idle" });
  };

  const previewClass = [
    styles.previewBox,
    content ? styles.previewBoxHas : "",
    dragOver ? styles.previewBoxDrag : "",
  ].filter(Boolean).join(" ");

  /* ── Parse status UI ─────────────────────────────────────────────────── */
  const styleLabels: Record<string, string> = {
    mla: "MLA", apa: "APA", chicago: "Chicago", ieee: "IEEE", harvard: "Harvard",
  };

  const renderParseStatus = () => {
    if (parseStatus.kind === "idle" || !content.trim()) return null;
    if (parseStatus.kind === "parsing") {
      return (
        <div className={styles.parseStatus}>
          <span className={styles.parseSpinner} />
          <span className={styles.parseText}>Analysing document structure…</span>
        </div>
      );
    }
    if (parseStatus.kind === "done") {
      const { result } = parseStatus;
      const label = styleLabels[result.detectedStyle];
      return (
        <div className={`${styles.parseStatus} ${styles.parseStatusOk}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className={styles.parseText}>
            {label
              ? `Detected: ${label} format · parsed by ${result.parsedBy === "ai" ? "AI" : "heuristic"}`
              : `Structure parsed · parsed by ${result.parsedBy === "ai" ? "AI" : "heuristic"}`}
          </span>
        </div>
      );
    }
    if (parseStatus.kind === "error") {
      return (
        <div className={`${styles.parseStatus} ${styles.parseStatusWarn}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className={styles.parseText}>{parseStatus.message} — you can still continue.</span>
        </div>
      );
    }
    return null;
  };

  const parsedResult = parseStatus.kind === "done" ? parseStatus.result : null;
  const canContinue = content.trim().length > 0 && parseStatus.kind !== "parsing";

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
          Formatter Tool
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        <div className={styles.bodyLeft}>
          <p className={styles.sectionLabel}>Paste or Upload your document</p>

          {/* Preview textarea */}
          <div
            className={previewClass}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void applyFile(file);
            }}
          >
            {!content ? <div className={styles.previewShimmer} aria-hidden /> : null}
            {!content ? (
              <div className={styles.placeholderLines} aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={styles.placeholderLine} />
                ))}
              </div>
            ) : null}
            <textarea
              className={styles.previewText}
              value={content}
              onChange={handleTextChange}
              placeholder={content ? "" : "Your document preview will appear here…"}
              aria-label="Document content"
            />
          </div>

          {/* Parse status */}
          {renderParseStatus()}

          {/* File chip */}
          {fileName ? (
            <div className={styles.fileChip}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {fileName}
              <button type="button" className={styles.chipClear} onClick={clearDocument} aria-label="Clear file">×</button>
            </div>
          ) : null}

          {/* Action row */}
          <div className={styles.actionRow}>
            <button type="button" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => void handlePasteFromClipboard()} disabled={isUploading}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Paste Text
            </button>
            <button type="button" className={styles.actionBtn}
              onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {isUploading ? "Reading…" : "Upload File"}
            </button>
            <input ref={fileInputRef} type="file" className={styles.hiddenInput}
              accept=".docx,.txt,.pdf" onChange={handleFileChange} />
          </div>

          {/* Supported formats */}
          <div className={styles.formatsBox}>
            <p className={styles.formatsLabel}>Supported formats:</p>
            <div className={styles.formatsList}>
              <span>.docx</span><span>.txt</span><span>.pdf</span>
            </div>
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────────────────────── */}
        <div className={styles.bodyRight}>
          {/* Stats */}
          <div className={styles.statsBar}>
            <span className={styles.statItem}>Word Count <strong>{wordCount.toLocaleString()}</strong></span>
            <span className={styles.statItem}>Characters <strong>{charCount.toLocaleString()}</strong></span>
            <span className={styles.statItem}>Est. Pages <strong>{pageCount}</strong></span>
          </div>

          {/* Continue */}
          <button
            type="button"
            className={styles.continueBtn}
            disabled={!canContinue}
            onClick={() => onContinue(content, parsedResult)}
          >
            <span className={styles.continueBtnShine} aria-hidden />
            {parseStatus.kind === "parsing" ? "Analysing…" : "Continue"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}
