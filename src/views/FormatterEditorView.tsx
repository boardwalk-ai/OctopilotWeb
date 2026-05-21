"use client";

/* ══════════════════════════════════════════════════════════════════════════════
   FormatterEditorView — outer wrapper
   Left panel (upload + format) | FormatterEditorCore (editor) | Right panel (citations)
══════════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";
import type { ParsedDocumentResult } from "@/app/api/formatter/parse/route";
import type { ExportDocumentSnapshot } from "@/services/OrganizerService";
import type { FormatStyleId } from "./FormatStyleView";
import FormatterEditorCore from "./FormatterEditorCore";
export type { EditorViewProps } from "./FormatterEditorCore";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const DRAFT_KEY = "ghostciter_draft_v1";

const FORMAT_STYLES: { id: FormatStyleId; label: string; abbr: string; color: string }[] = [
  { id: "mla",     label: "MLA (8th Edition)",     abbr: "M", color: "#7c3aed" },
  { id: "apa",     label: "APA (7th Edition)",      abbr: "A", color: "#2563eb" },
  { id: "chicago", label: "Chicago (17th Edition)", abbr: "C", color: "#ea580c" },
  { id: "ieee",    label: "IEEE",                   abbr: "I", color: "#16a34a" },
  { id: "harvard", label: "Harvard",                abbr: "H", color: "#0369a1" },
];

type SourceType = "website" | "book" | "journal" | "newspaper" | "video" | "other";

const SOURCE_TYPES: { id: SourceType; label: string; fields: string[] }[] = [
  { id: "website",   label: "Website",   fields: ["Author", "Page Title", "Website Name", "Published Date", "URL", "Access Date"] },
  { id: "book",      label: "Book",      fields: ["Author(s)", "Title", "Publisher", "City", "Year", "Edition"] },
  { id: "journal",   label: "Journal",   fields: ["Author(s)", "Article Title", "Journal Name", "Volume", "Issue", "Pages", "Year", "DOI"] },
  { id: "newspaper", label: "Newspaper", fields: ["Author", "Article Title", "Newspaper Name", "Date", "Page"] },
  { id: "video",     label: "Video",     fields: ["Creator / Director", "Title", "Platform", "Year", "URL"] },
  { id: "other",     label: "Other",     fields: ["Author", "Title", "Source", "Year", "Notes"] },
];

type ParseStatus =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "done"; result: ParsedDocumentResult }
  | { kind: "error"; message: string };

function getInTextFormats(style: FormatStyleId): string[] {
  if (style === "mla")     return ["Author Page", "Author", "Page"];
  if (style === "apa")     return ["Author, Year", "Author", "Year"];
  if (style === "chicago") return ["Author Year", "Author", "Year, Page"];
  if (style === "ieee")    return ["[N]"];
  if (style === "harvard") return ["Author Year", "Author", "Year"];
  return ["Author Page"];
}

function countWordsRaw(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface GhostciterCitation { id: string; text: string; }

/* ─── Icons ──────────────────────────────────────────────────────────────────── */
function UploadIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function EditIconSm() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIconSm() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return <>{parts.map((p, i) => i % 2 === 1 ? <em key={i}>{p}</em> : p)}</>;
}

/* ─── Core props snapshot ────────────────────────────────────────────────────── */
interface CoreSnapshot {
  content: string;
  bibliography: string;
  initialDocTitle: string;
  studentName: string;
  instructorName: string;
  institutionName: string;
  courseInfo: string;
  subjectCode: string;
  essayDate: string;
  citations: GhostciterCitation[];
  formatStyle: FormatStyleId;
}

const EMPTY_SNAPSHOT: CoreSnapshot = {
  content: "", bibliography: "", initialDocTitle: "", studentName: "",
  instructorName: "", institutionName: "", courseInfo: "", subjectCode: "",
  essayDate: "", citations: [], formatStyle: "mla",
};

/* ─── Component ──────────────────────────────────────────────────────────────── */
interface Props {
  onBack: () => void;
  onFinish?: (snapshot: ExportDocumentSnapshot, formatStyle: FormatStyleId) => void;
}

export default function FormatterEditorView({ onBack, onFinish }: Props) {
  /* ── Document state ── */
  const [docTab, setDocTab] = useState<"paste" | "upload">("paste");
  const [rawContent, setRawContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parseStatus, setParseStatus] = useState<ParseStatus>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);

  /* ── Format style ── */
  const [formatStyle, setFormatStyle] = useState<FormatStyleId>("mla");

  /* ── Citation state ── */
  const [rightOpen, setRightOpen] = useState(true);
  const [citTab, setCitTab] = useState<"scrape" | "manual">("scrape");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>("website");
  const [manualFields, setManualFields] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);
  const [citations, setCitations] = useState<GhostciterCitation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [inTextSourceId, setInTextSourceId] = useState<string>("");
  const [inTextFormat, setInTextFormat] = useState<string>("");

  /* ── Editor re-init ── */
  const [editorKey, setEditorKey] = useState(0);
  const [coreSnapshot, setCoreSnapshot] = useState<CoreSnapshot>(EMPTY_SNAPSHOT);
  const [editorActive, setEditorActive] = useState(false);

  /* ── Refs ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Derived ── */
  const wordCount = useMemo(() => countWordsRaw(rawContent), [rawContent]);
  const charCount = rawContent.length;
  const pageCount = useMemo(() => (wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 250))), [wordCount]);
  const parsedResult = parseStatus.kind === "done" ? parseStatus.result : null;
  const inTextFormats = useMemo(() => getInTextFormats(formatStyle), [formatStyle]);
  const currentSourceFields = SOURCE_TYPES.find((s) => s.id === sourceType)?.fields ?? [];
  const canManualAdd = currentSourceFields.some((f) => manualFields[f]?.trim());
  const canApply = rawContent.trim().length > 0 && parseStatus.kind !== "parsing";

  /* ── Sync inTextFormat / inTextSourceId ── */
  useEffect(() => { setInTextFormat(inTextFormats[0] ?? ""); }, [inTextFormats]);
  useEffect(() => {
    if (citations.length > 0 && !citations.find((c) => c.id === inTextSourceId)) setInTextSourceId(citations[0]!.id);
    if (citations.length === 0) setInTextSourceId("");
  }, [citations, inTextSourceId]);

  /* ── Toast ── */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /* ── Draft save ── */
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: rawContent, formatStyle, citations, fileName }));
      showToast("Draft saved");
    } catch { showToast("Could not save draft"); }
  }, [rawContent, formatStyle, citations, fileName, showToast]);

  /* ── Draft restore on mount ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        content?: string; formatStyle?: FormatStyleId;
        citations?: GhostciterCitation[]; fileName?: string;
      };
      if (draft.content) { setRawContent(draft.content); setFileName(draft.fileName ?? null); triggerParse(draft.content); }
      if (draft.formatStyle) setFormatStyle(draft.formatStyle);
      if (Array.isArray(draft.citations)) setCitations(draft.citations);
      setTimeout(() => showToast("Draft restored ✓"), 400);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
  }, []);

  /* ── Background parse ── */
  const triggerParse = useCallback((text: string) => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    if (!text.trim() || text.trim().length < 50) { setParseStatus({ kind: "idle" }); return; }
    setParseStatus({ kind: "parsing" });
    parseTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetchWithUserAuthorization("/api/formatter/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = (await res.json()) as ParsedDocumentResult & { error?: string };
        if (!res.ok || data.error) { setParseStatus({ kind: "error", message: data.error ?? "Could not parse." }); return; }
        setParseStatus({ kind: "done", result: data });
      } catch { setParseStatus({ kind: "error", message: "Network error." }); }
    }, 800);
  }, []);

  /* ── File upload ── */
  const applyFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".txt")) {
      showToast("Unsupported file type. Use .pdf, .docx, or .txt."); return;
    }
    setIsUploading(true);
    setParseStatus({ kind: "parsing" });
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetchWithUserAuthorization("/api/formatter/parse", { method: "POST", body: form });
      const data = (await res.json()) as ParsedDocumentResult & { error?: string };
      if (!res.ok || data.error) {
        setParseStatus({ kind: "error", message: data.error ?? "Could not parse file." });
        showToast(data.error ?? "Could not parse file."); return;
      }
      setRawContent(data.essay || "");
      setFileName(file.name);
      setParseStatus({ kind: "done", result: data });
      setDocTab("paste");
      showToast(`Loaded ${file.name}`);
    } catch {
      setParseStatus({ kind: "error", message: "Network error while reading file." });
      showToast("Network error while reading file.");
    } finally { setIsUploading(false); }
  }, [showToast]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRawContent(text);
    if (fileName) setFileName(null);
    triggerParse(text);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (file) void applyFile(file);
  };

  const handleTextAreaDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void applyFile(file);
  };

  const clearDocument = () => { setRawContent(""); setFileName(null); setParseStatus({ kind: "idle" }); };

  /* ── Format Document → re-initialize editor ── */
  const applyDocument = useCallback(() => {
    const p = parsedResult;
    const combinedBib = [p?.bibliography, citations.map((c) => c.text).join("\n\n")]
      .filter(Boolean).join("\n\n");
    setCoreSnapshot({
      content: p?.essay ?? rawContent,
      bibliography: combinedBib,
      initialDocTitle: p?.finalEssayTitle ?? "",
      studentName: p?.studentName ?? "",
      instructorName: p?.instructorName ?? "",
      institutionName: p?.institutionName ?? "",
      courseInfo: p?.courseInfo ?? "",
      subjectCode: p?.subjectCode ?? "",
      essayDate: p?.essayDate ?? "",
      citations,
      formatStyle,
    });
    setEditorKey((k) => k + 1);
    setEditorActive(true);
  }, [parsedResult, rawContent, citations, formatStyle]);

  /* ── Citations: scrape ── */
  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true); setScrapeMsg(null);
    try {
      const res = await fetch("/api/spoonie/citation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "CITATION_PREVIEW", input: { url: scrapeUrl.trim(), style: formatStyle.toUpperCase() } }),
      });
      const data = (await res.json()) as { citation?: string; error?: string };
      if (!res.ok || !data.citation) { setScrapeMsg({ type: "error", text: data.error ?? "Could not extract citation." }); return; }
      setCitations((prev) => [...prev, { id: crypto.randomUUID(), text: data.citation! }]);
      setScrapeUrl(""); setScrapeMsg({ type: "ok", text: "Citation added!" });
      setTimeout(() => setScrapeMsg(null), 2500);
    } catch { setScrapeMsg({ type: "error", text: "Network error. Please try again." }); }
    finally { setScraping(false); }
  };

  /* ── Citations: manual ── */
  const handleManualAdd = async () => {
    setAdding(true); setAddMsg(null);
    try {
      const res = await fetch("/api/spoonie/citation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "FIELDWORK_CITATION", input: { type: sourceType, style: formatStyle.toUpperCase(), ...manualFields } }),
      });
      const data = (await res.json()) as { citation?: string; error?: string };
      if (!res.ok || !data.citation) { setAddMsg({ type: "error", text: data.error ?? "Could not format citation." }); return; }
      setCitations((prev) => [...prev, { id: crypto.randomUUID(), text: data.citation! }]);
      setManualFields({}); setAddMsg({ type: "ok", text: "Citation added!" });
      setTimeout(() => setAddMsg(null), 2500);
    } catch { setAddMsg({ type: "error", text: "Network error. Please try again." }); }
    finally { setAdding(false); }
  };

  const startEdit = (c: GhostciterCitation) => { setEditingId(c.id); setEditText(c.text); };
  const saveEdit = () => {
    if (!editingId) return;
    setCitations((prev) => prev.map((c) => c.id === editingId ? { ...c, text: editText.trim() || c.text } : c));
    setEditingId(null);
  };
  const deleteCitation = (id: string) => setCitations((prev) => prev.filter((c) => c.id !== id));

  /* ── Parse status ── */
  function renderParseStatus() {
    if (parseStatus.kind === "idle" || !rawContent.trim()) return null;
    if (parseStatus.kind === "parsing") return (
      <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#1e2530] px-2 py-1.5 text-[11px] text-[#94a3b8]">
        <span className="inline-block h-2 w-2 animate-spin rounded-full border-2 border-[#94a3b8] border-t-transparent" />
        <span>Analysing document…</span>
      </div>
    );
    if (parseStatus.kind === "done") return (
      <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#0d2218] px-2 py-1.5 text-[11px] text-[#4ade80]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
        <span>Structure analysed by AI</span>
      </div>
    );
    if (parseStatus.kind === "error") return (
      <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#1e1208] px-2 py-1.5 text-[11px] text-[#fbbf24]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /></svg>
        <span>{parseStatus.message}</span>
      </div>
    );
    return null;
  }

  /* ── Render ── */
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#11151b]">

      {/* ── Top bar ── */}
      <div className="flex h-[40px] flex-shrink-0 items-center justify-between border-b border-[#2a2f38] bg-[#13161c] px-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] font-medium text-[#94a3b8] transition hover:bg-[#1e252f] hover:text-[#e2e8f0]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
            Back
          </button>
          <div className="h-4 w-px bg-[#2a2f38]" />
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#ea4335]" />
            <span className="text-[12px] font-medium text-[#e2e8f0]">Formatter Tool</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={!rawContent.trim()}
            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium text-[#94a3b8] transition hover:bg-[#1e252f] hover:text-[#e2e8f0] disabled:opacity-40"
          >
            Save Draft
          </button>
        </div>
      </div>

      {/* ── Three-panel body ── */}
      <div className="flex min-h-0 flex-1">

        {/* LEFT PANEL */}
        <div
          className="relative flex flex-shrink-0 flex-col overflow-hidden border-r border-[#2a2f38] bg-[#13161c] transition-[width] duration-300"
          style={{ width: leftOpen ? 260 : 0 }}
        >
          <div className={`flex h-full min-h-0 w-[260px] flex-col transition-opacity duration-200 ${leftOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="flex items-center justify-between border-b border-[#2a2f38] px-3 py-2">
              <span className="text-[12px] font-semibold text-[#e2e8f0]">1 · Document</span>
              <button onClick={() => setLeftOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-full text-[#4b5563] hover:bg-[#1e252f] hover:text-[#9ca3af]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {/* Tabs */}
              <div className="mb-3 flex rounded-[8px] bg-[#1a1f28] p-0.5">
                {(["paste", "upload"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDocTab(tab)}
                    className={`flex-1 rounded-[6px] py-1 text-[11px] font-medium transition ${docTab === tab ? "bg-[#252c38] text-[#e2e8f0]" : "text-[#64748b] hover:text-[#94a3b8]"}`}
                  >
                    {tab === "paste" ? "Paste Text" : "Upload File"}
                  </button>
                ))}
              </div>

              {/* Paste tab */}
              {docTab === "paste" && (
                <textarea
                  className={`w-full resize-none rounded-[8px] border bg-[#0f1218] px-2.5 py-2 text-[11px] text-[#e2e8f0] placeholder-[#4b5563] outline-none transition ${dragOver ? "border-[#ea4335]" : "border-[#2a2f38] focus:border-[#4b5563]"}`}
                  rows={9}
                  value={rawContent}
                  onChange={handleTextChange}
                  placeholder="Paste or type your document here…"
                  onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleTextAreaDrop}
                />
              )}

              {/* Upload tab */}
              {docTab === "upload" && (
                <div
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed px-3 py-7 text-center transition ${dragOver ? "border-[#ea4335] bg-[#ea4335]/6" : "border-[#2a2f38] hover:border-[#3a4150]"}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void applyFile(f); }}
                >
                  <div className="text-[#374151]"><UploadIcon /></div>
                  <p className="text-[11px] text-[#64748b]">{isUploading ? "Reading file…" : "Drop file or click to browse"}</p>
                  <p className="text-[10px] text-[#374151]">.docx · .txt · .pdf</p>
                </div>
              )}

              <input ref={fileInputRef} type="file" className="hidden" accept=".docx,.txt,.pdf" onChange={handleFileChange} />

              {/* File chip */}
              {rawContent && !isUploading && (
                <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#1a1f28] px-2 py-1.5">
                  <span className="text-[#4b5563]"><FileIcon /></span>
                  <span className="flex-1 truncate text-[11px] text-[#94a3b8]">{fileName ?? "Pasted document"}</span>
                  <button type="button" onClick={clearDocument} className="text-[#4b5563] transition hover:text-[#ef4444]">×</button>
                </div>
              )}

              {renderParseStatus()}

              {/* Stats */}
              <div className="mt-2.5 flex justify-between rounded-[6px] bg-[#1a1f28] px-2 py-1.5 text-[10px] text-[#4b5563]">
                <span>{wordCount.toLocaleString()} words</span>
                <span>{charCount.toLocaleString()} chars</span>
                <span>~{pageCount} pages</span>
              </div>

              <div className="my-3 h-px bg-[#2a2f38]" />

              {/* Format style */}
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#4b5563]">Format Style</p>
              <div className="flex flex-col gap-1">
                {FORMAT_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFormatStyle(s.id)}
                    className={`flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left transition ${formatStyle === s.id ? "bg-[#1e252f] ring-1 ring-[#3a4150]" : "hover:bg-[#181d24]"}`}
                  >
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: s.color }}>{s.abbr}</div>
                    <span className={`flex-1 text-[11px] ${formatStyle === s.id ? "text-[#e2e8f0]" : "text-[#64748b]"}`}>{s.label}</span>
                    {formatStyle === s.id && <div className="h-1.5 w-1.5 rounded-full bg-[#ea4335]" />}
                  </button>
                ))}
              </div>

              {/* Format Document button */}
              <button
                type="button"
                onClick={applyDocument}
                disabled={!canApply}
                className="mt-4 w-full rounded-[8px] bg-[#ea4335] py-2 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {editorActive ? "Re-format Document" : "Format Document"}
              </button>

              {editorActive && (
                <p className="mt-1.5 text-center text-[10px] text-[#4b5563]">Re-formatting will reset editor edits.</p>
              )}
            </div>
          </div>
        </div>

        {/* Left re-open tab */}
        {!leftOpen && (
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            className="flex w-6 flex-shrink-0 items-center justify-center self-stretch border-r border-[#2a2f38] bg-[#13161c] text-[#4b5563] transition hover:bg-[#1a1f28] hover:text-[#94a3b8]"
            title="Open document panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        )}

        {/* CENTER: editor or placeholder */}
        <div className="min-w-0 flex-1">
          {editorActive ? (
            <FormatterEditorCore
              key={editorKey}
              content={coreSnapshot.content}
              bibliography={coreSnapshot.bibliography}
              initialDocTitle={coreSnapshot.initialDocTitle}
              studentName={coreSnapshot.studentName}
              instructorName={coreSnapshot.instructorName}
              institutionName={coreSnapshot.institutionName}
              courseInfo={coreSnapshot.courseInfo}
              subjectCode={coreSnapshot.subjectCode}
              essayDate={coreSnapshot.essayDate}
              citations={coreSnapshot.citations}
              formatStyle={coreSnapshot.formatStyle}
              onBack={onBack}
              onFinish={onFinish ? (snapshot) => onFinish(snapshot, coreSnapshot.formatStyle) : undefined}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#11151b]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1a1f28]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.3">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[14px] font-medium text-[#374151]">No document yet</p>
                <p className="mt-1 text-[12px] text-[#2a2f38]">Upload or paste a document in the left panel,<br />then click <span className="text-[#64748b]">Format Document</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Right re-open tab */}
        {!rightOpen && (
          <button
            type="button"
            onClick={() => setRightOpen(true)}
            className="flex w-6 flex-shrink-0 items-center justify-center self-stretch border-l border-[#2a2f38] bg-[#13161c] text-[#4b5563] transition hover:bg-[#1a1f28] hover:text-[#94a3b8]"
            title="Open citations panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        )}

        {/* RIGHT PANEL */}
        <div
          className="flex flex-shrink-0 flex-col overflow-hidden border-l border-[#2a2f38] bg-[#13161c] transition-[width] duration-300"
          style={{ width: rightOpen ? 260 : 0 }}
        >
          <div className={`flex h-full min-h-0 w-[260px] flex-col transition-opacity duration-200 ${rightOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="flex items-center justify-between border-b border-[#2a2f38] px-3 py-2">
              <button onClick={() => setRightOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-full text-[#4b5563] hover:bg-[#1e252f] hover:text-[#9ca3af]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
              </button>
              <span className="text-[12px] font-semibold text-[#e2e8f0]">3 · Citations</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {/* Citation tabs */}
              <div className="mb-3 flex rounded-[8px] bg-[#1a1f28] p-0.5">
                {(["scrape", "manual"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCitTab(tab)}
                    className={`flex-1 rounded-[6px] py-1 text-[11px] font-medium transition ${citTab === tab ? "bg-[#252c38] text-[#e2e8f0]" : "text-[#64748b] hover:text-[#94a3b8]"}`}
                  >
                    {tab === "scrape" ? "Find / Scrape" : "Manual Entry"}
                  </button>
                ))}
              </div>

              {/* Scrape tab */}
              {citTab === "scrape" && (
                <>
                  <div className="mb-2 flex gap-1.5">
                    <input
                      type="url"
                      className="min-w-0 flex-1 rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] placeholder-[#4b5563] outline-none focus:border-[#4b5563]"
                      placeholder="Paste a URL…"
                      value={scrapeUrl}
                      onChange={(e) => setScrapeUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleScrape(); }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleScrape()}
                      disabled={scraping || !scrapeUrl.trim()}
                      className="rounded-[6px] bg-[#1e252f] px-2.5 py-1.5 text-[11px] font-medium text-[#94a3b8] transition hover:bg-[#252c38] disabled:opacity-40"
                    >
                      {scraping ? "…" : "✦ Auto"}
                    </button>
                  </div>
                  {scrapeMsg && (
                    <div className={`mb-2 rounded-[6px] px-2 py-1.5 text-[11px] ${scrapeMsg.type === "ok" ? "bg-[#0d2218] text-[#4ade80]" : "bg-[#1e1208] text-[#fbbf24]"}`}>
                      {scrapeMsg.text}
                    </div>
                  )}
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#4b5563]">Source Type</p>
                  <select
                    className="mb-2 w-full rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] outline-none"
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as SourceType)}
                  >
                    {SOURCE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </>
              )}

              {/* Manual tab */}
              {citTab === "manual" && (
                <>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#4b5563]">Source Type</p>
                  <select
                    className="mb-2 w-full rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] outline-none"
                    value={sourceType}
                    onChange={(e) => { setSourceType(e.target.value as SourceType); setManualFields({}); }}
                  >
                    {SOURCE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  {currentSourceFields.map((field) => (
                    <div key={field} className="mb-1.5">
                      <p className="mb-0.5 text-[10px] text-[#4b5563]">{field}</p>
                      <input
                        type="text"
                        className="w-full rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] placeholder-[#374151] outline-none focus:border-[#4b5563]"
                        placeholder={field}
                        value={manualFields[field] ?? ""}
                        onChange={(e) => setManualFields((prev) => ({ ...prev, [field]: e.target.value }))}
                      />
                    </div>
                  ))}
                  {addMsg && (
                    <div className={`mb-2 rounded-[6px] px-2 py-1.5 text-[11px] ${addMsg.type === "ok" ? "bg-[#0d2218] text-[#4ade80]" : "bg-[#1e1208] text-[#fbbf24]"}`}>
                      {addMsg.text}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleManualAdd()}
                    disabled={adding || !canManualAdd}
                    className="w-full rounded-[8px] bg-[#1e252f] py-1.5 text-[11px] font-medium text-[#94a3b8] transition hover:bg-[#252c38] disabled:opacity-40"
                  >
                    {adding ? "Adding…" : "Add Citation"}
                  </button>
                </>
              )}

              <div className="my-3 h-px bg-[#2a2f38]" />

              {/* Bibliography */}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#94a3b8]">Bibliography ({citations.length})</span>
              </div>

              <div className="flex flex-col gap-2">
                {citations.map((cit) => (
                  <div key={cit.id} className="rounded-[8px] bg-[#1a1f28] p-2.5">
                    {editingId === cit.id ? (
                      <>
                        <textarea
                          className="w-full rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] outline-none"
                          rows={3}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <div className="mt-1.5 flex gap-1.5">
                          <button type="button" onClick={saveEdit} className="rounded-[5px] bg-[#252c38] px-2 py-1 text-[10px] text-[#e2e8f0]">Save</button>
                          <button type="button" onClick={() => setEditingId(null)} className="rounded-[5px] bg-[#1e252f] px-2 py-1 text-[10px] text-[#64748b]">Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="rounded-[4px] bg-[#252c38] px-1.5 py-0.5 text-[9px] font-medium text-[#94a3b8]">
                            {SOURCE_TYPES.find((s) => s.id === sourceType)?.label ?? "Source"}
                          </span>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => startEdit(cit)} className="text-[#4b5563] transition hover:text-[#94a3b8]"><EditIconSm /></button>
                            <button type="button" onClick={() => deleteCitation(cit.id)} className="text-[#4b5563] transition hover:text-[#ef4444]"><TrashIconSm /></button>
                          </div>
                        </div>
                        <p className="text-[11px] leading-relaxed text-[#94a3b8]"><RichText text={cit.text} /></p>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCitTab("scrape")}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-[#2a2f38] py-2 text-[11px] text-[#4b5563] transition hover:border-[#3a4150] hover:text-[#64748b]"
              >
                <PlusIcon /> Add Citation
              </button>

              <div className="my-3 h-px bg-[#2a2f38]" />

              {/* In-text citation */}
              <p className="mb-2 text-[11px] font-semibold text-[#94a3b8]">Insert In-Text</p>
              {citations.length === 0 ? (
                <p className="text-[10px] text-[#374151]">Add citations above first.</p>
              ) : (
                <>
                  <p className="mb-0.5 text-[10px] text-[#4b5563]">Select Source</p>
                  <select
                    className="mb-2 w-full rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] outline-none"
                    value={inTextSourceId}
                    onChange={(e) => setInTextSourceId(e.target.value)}
                  >
                    {citations.map((c, i) => (
                      <option key={c.id} value={c.id}>Source {i + 1}: {c.text.slice(0, 35)}…</option>
                    ))}
                  </select>
                  <p className="mb-0.5 text-[10px] text-[#4b5563]">Format</p>
                  <select
                    className="mb-2 w-full rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] outline-none"
                    value={inTextFormat}
                    onChange={(e) => setInTextFormat(e.target.value)}
                  >
                    {inTextFormats.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={!inTextSourceId}
                    className="w-full rounded-[8px] bg-[#1e252f] py-1.5 text-[11px] font-medium text-[#94a3b8] transition hover:bg-[#252c38] disabled:opacity-40"
                  >
                    Insert Citation
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[8px] bg-[#252c38] px-4 py-2 text-[12px] font-medium text-[#e2e8f0] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
