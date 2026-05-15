"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import styles from "./FormatterToolView.module.css";

type FormatterToolViewProps = { onBack: () => void };
type DocumentOptions = { preserveWording: boolean; fixFormattingOnly: boolean; academicCleanup: boolean };
const WORDS_PER_PAGE = 250;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!plain) throw new Error("This .docx file appears to be empty.");
  return plain;
}

async function readUploadedFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return file.text();
  if (name.endsWith(".docx")) return extractDocxText(file);
  throw new Error("Unsupported file type. Use .docx or .txt for now.");
}

function OptionRow({
  label,
  checked,
  disabled,
  future,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  future?: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`${styles.optionRow} ${disabled ? styles.optionRowDisabled : ""}`}
      onClick={() => !disabled && onToggle()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle();
        }
      }}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
    >
      <div className={`${styles.checkBox} ${checked ? styles.checkBoxChecked : ""}`}>
        <span className={styles.checkMark}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      </div>
      <span className={styles.optionLabel}>
        {label}
        {future ? <span className={styles.optionFuture}>Future</span> : null}
      </span>
    </div>
  );
}

export default function FormatterToolView({ onBack }: FormatterToolViewProps) {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [options, setOptions] = useState<DocumentOptions>({
    preserveWording: true,
    fixFormattingOnly: true,
    academicCleanup: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
  const applyFile = async (file: File) => {
    setIsUploading(true);
    try {
      const text = await readUploadedFile(file);
      setContent(text);
      setFileName(file.name);
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
      setContent(text);
      setFileName(null);
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
  const toggleOption = (key: keyof DocumentOptions) => {
    if (key === "academicCleanup") return;
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const clearDocument = () => { setContent(""); setFileName(null); };
  const previewClass = [styles.previewBox, content ? styles.previewBoxHas : "", dragOver ? styles.previewBoxDrag : ""].filter(Boolean).join(" ");
  return (
    <div className={styles.shell}>
      <div className={styles.topNav}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
          Back
        </button>
        <div className={styles.badge}><span className={styles.badgeDot} />Formatter Tool</div>
      </div>
      <div className={styles.body}>
        <div className={styles.cardWrap}><article className={styles.card}>
            <div className={styles.cardGlow} aria-hidden />
            <header className={styles.stepHeader}>
              <div className={styles.stepBadge}>2</div>
              <h1 className={styles.stepTitle}>Input Document</h1>
            </header>
            <div className={styles.cardInner}>
              <p className={styles.sectionLabel}>Paste or Upload your document</p>
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
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className={styles.placeholderLine} />
                    ))}
                  </div>
                ) : null}
                <textarea
                  className={styles.previewText}
                  value={content}
                  onChange={(e) => { setContent(e.target.value); if (fileName) setFileName(null); }}
                  placeholder={content ? "" : "Your document preview will appear here…"}
                  aria-label="Document content"
                />
              </div>
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
              <div className={styles.actionRow}>
                <button type="button" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={() => void handlePasteFromClipboard()} disabled={isUploading}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Paste Text
                </button>
                <button type="button" className={styles.actionBtn} onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {isUploading ? "Uploading…" : "Upload File"}
                </button>
                <input ref={fileInputRef} type="file" className={styles.hiddenInput} accept=".docx,.txt" onChange={handleFileChange} />
              </div>
              <div className={styles.formatsBox}>
                <p className={styles.formatsLabel}>Supported formats:</p>
                <div className={styles.formatsList}>
                  <span>.docx</span>
                  <span>.txt</span>
                  <span>.pdf <span className={styles.formatSoon}>(soon)</span></span>
                </div>
              </div>
              <section className={styles.optionsSection}>
                <h2 className={styles.optionsTitle}>Document Options</h2>
                <div className={styles.optionList}>
                  <OptionRow label="Preserve My Wording" checked={options.preserveWording} onToggle={() => toggleOption("preserveWording")} />
                  <OptionRow label="Fix Formatting Only" checked={options.fixFormattingOnly} onToggle={() => toggleOption("fixFormattingOnly")} />
                  <OptionRow label="Academic Cleanup" checked={options.academicCleanup} disabled
                    future
                    onToggle={() => toggleOption("academicCleanup")} />
                </div>
              </section>
              <footer className={styles.statsBar}>
                <span className={styles.statItem}>Word Count <strong>{wordCount.toLocaleString()}</strong></span>
                <span className={styles.statDot}>·</span>
                <span className={styles.statItem}>Characters <strong>{charCount.toLocaleString()}</strong></span>
                <span className={styles.statDot}>·</span>
                <span className={styles.statItem}>Pages <strong>{pageCount}</strong></span>
              </footer>
            </div>
          </article>
        </div>
      </div>
      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}
