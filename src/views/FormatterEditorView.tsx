"use client";

/* ══════════════════════════════════════════════════════════════════════════════
   FormatterEditorView — outer wrapper
   Left panel (upload + format) | FormatterEditorCore (editor) | Right panel (citations)
══════════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";
import { AuthService } from "@/services/AuthService";
import { CreditService } from "@/services/CreditService";
import type { ParsedDocumentResult } from "@/app/api/formatter/parse/route";
import type { ExportDocumentSnapshot } from "@/services/OrganizerService";
import type { FormatStyleId } from "./FormatStyleView";
import FormatterEditorCore from "./FormatterEditorCore";
import StoreButton from "@/components/header/StoreButton";
export type { EditorViewProps } from "./FormatterEditorCore";

const IS_STANDALONE = process.env.NEXT_PUBLIC_STANDALONE_MODE === "true";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const DRAFT_KEY = "ghostciter_draft_v1";

const FORMAT_STYLES: { id: FormatStyleId; label: string; abbr: string; color: string }[] = [
  { id: "mla",     label: "MLA (8th Edition)",     abbr: "M", color: "#7c3aed" },
  { id: "apa",     label: "APA (7th Edition)",      abbr: "A", color: "#2563eb" },
  { id: "chicago", label: "Chicago (17th Edition)", abbr: "C", color: "#ea580c" },
  { id: "ieee",    label: "IEEE",                   abbr: "I", color: "#16a34a" },
  { id: "harvard", label: "Harvard",                abbr: "H", color: "#0369a1" },
];

type ParseStatus =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "done"; result: ParsedDocumentResult }
  | { kind: "error"; message: string };

interface CitationCard {
  id: string;
  url: string;
  inText: string;
  bibliography: string;
}

interface ScrapedMeta {
  title?: string;
  author?: string;
  year?: string;
  publisher?: string;
}

type CitPhase =
  | { kind: "idle" }
  | { kind: "scraping" }
  | { kind: "awaiting_format"; url: string; meta: ScrapedMeta }
  | { kind: "error"; url: string; message: string }
  | { kind: "generating" };

type HumanizePhase =
  | { kind: "idle" }
  | { kind: "ask"; snapshot: ExportDocumentSnapshot }
  | { kind: "login_required"; snapshot: ExportDocumentSnapshot }
  | { kind: "insufficient_credits"; required: number; available: number; snapshot: ExportDocumentSnapshot }
  | { kind: "pick_provider"; snapshot: ExportDocumentSnapshot }
  | { kind: "humanizing"; provider: "StealthGPT" | "UndetectableAI"; snapshot: ExportDocumentSnapshot }
  | { kind: "error"; message: string; snapshot: ExportDocumentSnapshot }
  | { kind: "done" };

function countWordsRaw(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

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
function TrashIconSm() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
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
  formatStyle: FormatStyleId;
}

const EMPTY_SNAPSHOT: CoreSnapshot = {
  content: "", bibliography: "", initialDocTitle: "", studentName: "",
  instructorName: "", institutionName: "", courseInfo: "", subjectCode: "",
  essayDate: "", formatStyle: "mla",
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
  const [citUrlInput, setCitUrlInput] = useState("");
  const [citPhase, setCitPhase] = useState<CitPhase>({ kind: "idle" });
  const [citFormatPick, setCitFormatPick] = useState<FormatStyleId>("mla");
  const [citCards, setCitCards] = useState<CitationCard[]>([]);
  // Manual form fields
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualFormUrl, setManualFormUrl] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [manualPublisher, setManualPublisher] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [humanizePhase, setHumanizePhase] = useState<HumanizePhase>({ kind: "idle" });
  /* ── Standalone login modal state ── */
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  /* ── Selection tracking (for insert-at-cursor) ── */
  const savedRangeRef = useRef<Range | null>(null);
  const savedEditorElRef = useRef<HTMLElement | null>(null);
  /* ── Bib entry insert ref (populated by FormatterEditorCore) ── */
  const insertBibEntryRef = useRef<((text: string) => void) | null>(null);

  /* ── Editor re-init ── */
  const [editorKey, setEditorKey] = useState(0);
  const [coreSnapshot, setCoreSnapshot] = useState<CoreSnapshot>(EMPTY_SNAPSHOT);
  const [editorActive, setEditorActive] = useState(false);

  /* ── Refs ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wordCount = useMemo(() => countWordsRaw(rawContent), [rawContent]);
  const charCount = rawContent.length;
  const pageCount = useMemo(() => (wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 250))), [wordCount]);
  const parsedResult = parseStatus.kind === "done" ? parseStatus.result : null;
  const canApply = rawContent.trim().length > 0 && parseStatus.kind !== "parsing";
  const currentEssayFormat: FormatStyleId = editorActive ? coreSnapshot.formatStyle : formatStyle;

  /* ── Toast ── */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /* ── Draft save ── */
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: rawContent, formatStyle, fileName }));
      showToast("Draft saved");
    } catch { showToast("Could not save draft"); }
  }, [rawContent, formatStyle, fileName, showToast]);

  /* ── Draft restore on mount ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        content?: string; formatStyle?: FormatStyleId; fileName?: string;
      };
      if (draft.content) { setRawContent(draft.content); setFileName(draft.fileName ?? null); triggerParse(draft.content); }
      if (draft.formatStyle) setFormatStyle(draft.formatStyle);
      setTimeout(() => showToast("Draft restored ✓"), 400);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
  }, []);

  /* ── Track last editor selection for insert-at-cursor ── */
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const container = range.startContainer;
      let el: Element | null = container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container as Element;
      while (el) {
        if ((el as HTMLElement).contentEditable === "true") {
          savedRangeRef.current = range.cloneRange();
          savedEditorElRef.current = el as HTMLElement;
          return;
        }
        el = el.parentElement;
      }
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
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
    const combinedBib = [p?.bibliography, ...citCards.map((c) => c.bibliography)]
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
      formatStyle,
    });
    setEditorKey((k) => k + 1);
    setEditorActive(true);
  }, [parsedResult, rawContent, citCards, formatStyle]);

  /* ── Citations: scrape URL ── */
  const handleScrapeUrl = async () => {
    const url = citUrlInput.trim();
    if (!url) return;
    setCitPhase({ kind: "scraping" });
    setCitFormatPick(currentEssayFormat);
    try {
      const res = await fetchWithUserAuthorization(`/api/scrape?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setCitPhase({ kind: "error", url, message: err.error ?? `Scrape failed (${res.status})` });
        return;
      }
      const data = await res.json() as {
        title?: string; author?: string; publishedYear?: string; publisher?: string;
        references?: { title?: string; authors?: string[]; publicationYear?: number; publisher?: string; source?: string }[];
      };
      // Normalise upstream v1 / v2
      let meta: ScrapedMeta = {};
      if (Array.isArray(data.references) && data.references.length > 0) {
        const ref = data.references[0]!;
        meta = {
          title: ref.title,
          author: ref.authors?.join(", "),
          year: ref.publicationYear ? String(ref.publicationYear) : undefined,
          publisher: ref.publisher ?? ref.source,
        };
      } else {
        meta = { title: data.title, publisher: data.publisher, author: data.author, year: data.publishedYear };
      }
      if (!meta.title && !meta.publisher) {
        setCitPhase({ kind: "error", url, message: "Scraper returned no usable metadata for this URL." });
        return;
      }
      setCitPhase({ kind: "awaiting_format", url, meta });
    } catch {
      setCitPhase({ kind: "error", url, message: "Network error. Please try again." });
    }
  };

  /* ── Citations: generate from scraped meta ── */
  const handleGenerateCitation = async (url: string, meta: ScrapedMeta, style: FormatStyleId) => {
    setCitPhase({ kind: "generating" });
    try {
      const res = await fetchWithUserAuthorization("/api/spoonie/citation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "CITATION_FULL",
          input: {
            style: style.toUpperCase(),
            url,
            title: meta.title ?? "",
            authors: meta.author ?? "",
            year: meta.year ?? "",
            publisher: meta.publisher ?? "",
          },
        }),
      });
      const data = (await res.json()) as { inText?: string; bibliography?: string; error?: string };
      if (!res.ok || !data.inText || !data.bibliography) {
        setCitPhase({ kind: "error", url, message: data.error ?? "AI could not generate citation." });
        return;
      }
      setCitCards((prev) => [...prev, { id: crypto.randomUUID(), url, inText: data.inText!, bibliography: data.bibliography! }]);
      setCitUrlInput("");
      setCitPhase({ kind: "idle" });
      setShowManualForm(false);
    } catch {
      setCitPhase({ kind: "error", url, message: "Network error while generating citation." });
    }
  };

  /* ── Citations: manual generate ── */
  const handleManualGenerate = async () => {
    const url = manualFormUrl || citUrlInput.trim() || "manual";
    const meta: ScrapedMeta = {
      title: manualContent.slice(0, 120) || undefined,
      author: manualAuthor || undefined,
      year: manualYear || undefined,
      publisher: manualPublisher || undefined,
    };
    await handleGenerateCitation(url, meta, citFormatPick);
    if (showManualForm) {
      setManualAuthor(""); setManualPublisher(""); setManualYear(""); setManualContent("");
      setManualFormUrl(""); setShowManualForm(false);
    }
  };

  /* ── Citations: insert in-text at cursor ── */
  const handleInsertInText = (text: string) => {
    const range = savedRangeRef.current;
    const editorEl = savedEditorElRef.current;
    if (range && editorEl && editorActive) {
      editorEl.focus();
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      document.execCommand("insertText", false, text);
      showToast("In-text citation inserted ✓");
    } else {
      // Fallback: clipboard
      navigator.clipboard?.writeText(text).catch(() => {/* ignore */});
      showToast(editorActive ? "Click in the document first, then Insert." : "Format a document first, then Insert.");
    }
  };

  /* ── Citations: insert bibliography entry to last page ── */
  const handleInsertBib = (text: string) => {
    if (insertBibEntryRef.current && editorActive) {
      insertBibEntryRef.current(text);
      showToast("Bibliography entry added ✓");
    } else {
      // Fallback: clipboard
      navigator.clipboard?.writeText(text).catch(() => {/* ignore */});
      showToast(editorActive ? "Could not reach bibliography page." : "Format a document first, then Insert.");
    }
  };

  /* ── Citations: remove card ── */
  const removeCitCard = (id: string) => setCitCards((prev) => prev.filter((c) => c.id !== id));

  /* ── Humanize: re-apply document with humanized content ── */
  const applyDocumentWithContent = useCallback((humanizedContent: string) => {
    const p = parsedResult;
    const combinedBib = [p?.bibliography, ...citCards.map((c) => c.bibliography)]
      .filter(Boolean).join("\n\n");
    setCoreSnapshot((prev) => ({ ...prev, content: humanizedContent, bibliography: combinedBib }));
    setEditorKey((k) => k + 1);
    setEditorActive(true);
  }, [parsedResult, citCards]);

  /* ── Humanize: poll Undetectable document ── */
  const pollUndetectableDoc = useCallback(async (id: string): Promise<string> => {
    for (let i = 0; i < 15; i++) {
      if (i > 0) await new Promise<void>((r) => setTimeout(r, 3000));
      const res = await fetchWithUserAuthorization("/api/humanize/undetectable/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { output?: string };
      if (data.output?.trim()) return data.output.trim();
    }
    throw new Error("Undetectable AI timed out. Please try again.");
  }, []);

  /* ── Humanize: run selected provider ── */
  const handleHumanize = useCallback(async (
    provider: "StealthGPT" | "UndetectableAI",
    snapshot: ExportDocumentSnapshot,
  ) => {
    setHumanizePhase({ kind: "humanizing", provider, snapshot });
    const essayText = snapshot.pages.map((p) => p.plainText ?? "").join("\n\n").trim();
    const wordCount = countWordsRaw(essayText);
    try {
      // In standalone mode, deduct humanizer credits before calling the API
      if (IS_STANDALONE) {
        await CreditService.deductHumanizerCreditsForWords(wordCount);
      }
      let humanizedText = "";
      if (provider === "StealthGPT") {
        const res = await fetchWithUserAuthorization("/api/humanize/stealthgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: essayText, rephrase: false }),
        });
        const data = (await res.json()) as { result?: string; error?: string };
        if (!res.ok || !data.result) throw new Error(data.error ?? "StealthGPT returned empty result.");
        humanizedText = data.result.trim();
      } else {
        const res = await fetchWithUserAuthorization("/api/humanize/undetectable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: essayText, readability: "University", purpose: "Essay", strength: "More Human" }),
        });
        const sub = (await res.json()) as { output?: string; id?: string; documentId?: string; error?: string };
        if (!res.ok) throw new Error(sub.error ?? "Undetectable AI submission failed.");
        if (sub.output?.trim()) {
          humanizedText = sub.output.trim();
        } else {
          const docId = sub.id ?? sub.documentId;
          if (!docId) throw new Error("Undetectable AI did not return a document ID.");
          humanizedText = await pollUndetectableDoc(String(docId));
        }
      }
      if (!humanizedText) throw new Error("Humanizer returned empty text.");
      applyDocumentWithContent(humanizedText);
      setHumanizePhase({ kind: "done" });
      showToast("Humanized ✓ — Review the document, then click Finish to download.");
    } catch (err) {
      setHumanizePhase({ kind: "error", message: err instanceof Error ? err.message : "Humanization failed.", snapshot });
    }
  }, [pollUndetectableDoc, applyDocumentWithContent, showToast]);

  /* ── Humanize: intercept Finish button ── */
  const handleCoreFinish = useCallback((snapshot: ExportDocumentSnapshot) => {
    if (humanizePhase.kind === "done") {
      if (onFinish) onFinish(snapshot, coreSnapshot.formatStyle);
      return;
    }
    setHumanizePhase({ kind: "ask", snapshot });
  }, [humanizePhase.kind, onFinish, coreSnapshot.formatStyle]);

  /* ── Standalone: gate humanize behind login + credits ── */
  const handleStandaloneHumanizeGate = useCallback(async (snapshot: ExportDocumentSnapshot) => {
    // Step 1: require login
    const user = AuthService.getCurrentUser();
    if (!user) {
      setHumanizePhase({ kind: "login_required", snapshot });
      return;
    }
    // Step 2: check credits
    const essayText = snapshot.pages.map((p) => p.plainText ?? "").join("\n\n").trim();
    const wordCount = countWordsRaw(essayText);
    const required = CreditService.creditsFromWords(wordCount);
    try {
      await CreditService.ensureSufficientHumanizerCreditsForWords(wordCount);
    } catch {
      const available = (await CreditService.getAvailableCredits()).humanizer;
      setHumanizePhase({ kind: "insufficient_credits", required, available, snapshot });
      return;
    }
    setHumanizePhase({ kind: "pick_provider", snapshot });
  }, []);

  /* ── Standalone: handle login submit ── */
  const handleLoginGoogle = useCallback(async () => {
    setLoginLoading(true); setLoginError(null);
    try {
      await AuthService.signInWithGoogle();
      // After login, re-trigger gate — humanizePhase.snapshot is preserved
      if (humanizePhase.kind === "login_required") {
        void handleStandaloneHumanizeGate(humanizePhase.snapshot);
      }
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Google sign-in failed.");
    } finally { setLoginLoading(false); }
  }, [humanizePhase, handleStandaloneHumanizeGate]);

  const handleLoginEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true); setLoginError(null);
    try {
      await AuthService.signInWithEmail(loginEmail.trim(), loginPassword);
      if (humanizePhase.kind === "login_required") {
        void handleStandaloneHumanizeGate(humanizePhase.snapshot);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Authentication failed.");
    } finally { setLoginLoading(false); }
  }, [loginEmail, loginPassword, humanizePhase, handleStandaloneHumanizeGate]);

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
          {!IS_STANDALONE && (
            <>
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] font-medium text-[#94a3b8] transition hover:bg-[#1e252f] hover:text-[#e2e8f0]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
                Back
              </button>
              <div className="h-4 w-px bg-[#2a2f38]" />
            </>
          )}
          <div className="flex items-center">
            <style>{`
              @keyframes octopilot-scan {
                0%   { background-position: -200% center; }
                100% { background-position: 200% center; }
              }
              @keyframes octopilot-char-zoom {
                0%   { transform: scale(1); }
                10%  { transform: scale(1.28); }
                24%  { transform: scale(1); }
                100% { transform: scale(1); }
              }
            `}</style>
            <span className="font-extrabold italic tracking-tight leading-none">
              <span style={{
                background: 'linear-gradient(90deg, #ff2200 0%, #ff2200 30%, #ffb8aa 50%, #ff2200 70%, #ff2200 100%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'octopilot-scan 2.4s linear infinite',
                fontSize: '21px',
              }}>
                {"Octopilot".split("").map((char, i) => (
                  <span key={i} style={{
                    display: 'inline-block',
                    animation: 'octopilot-char-zoom 2.4s linear infinite',
                    animationDelay: `${(i / 9) * 2.4}s`,
                  }}>{char}</span>
                ))}
              </span>
              <span style={{ fontSize: '14px' }} className="text-[#e2e8f0]"> Formatter Tool</span>
            </span>
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
            <div className="relative flex items-center justify-center border-b border-[#2a2f38] px-3 py-2.5">
              <span className="text-[13px] font-bold tracking-wide text-[#e2e8f0]">1 · Document</span>
              <button onClick={() => setLeftOpen(false)} className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full text-[#4b5563] hover:bg-[#1e252f] hover:text-[#9ca3af]">
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
              formatStyle={coreSnapshot.formatStyle}
              onBack={onBack}
              onFinish={onFinish ? handleCoreFinish : undefined}
              insertBibEntryRef={insertBibEntryRef}
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
          style={{ width: rightOpen ? 272 : 0 }}
        >
          <div className={`flex h-full min-h-0 w-[272px] flex-col transition-opacity duration-200 ${rightOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            {/* Header */}
            <div className="relative flex items-center justify-center border-b border-[#2a2f38] px-3 py-2.5">
              <button onClick={() => setRightOpen(false)} className="absolute left-2 flex h-6 w-6 items-center justify-center rounded-full text-[#4b5563] hover:bg-[#1e252f] hover:text-[#9ca3af]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
              </button>
              <span className="text-[13px] font-bold tracking-wide text-[#e2e8f0]">3 · Citations</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">

              {/* ── URL Input ── */}
              {!showManualForm && (
                <div className="mb-3">
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      className="min-w-0 flex-1 rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] placeholder-[#4b5563] outline-none focus:border-[#4b5563]"
                      placeholder="Paste a URL to cite…"
                      value={citUrlInput}
                      onChange={(e) => { setCitUrlInput(e.target.value); if (citPhase.kind !== "idle") setCitPhase({ kind: "idle" }); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && citUrlInput.trim()) void handleScrapeUrl(); }}
                      disabled={citPhase.kind === "scraping" || citPhase.kind === "generating"}
                    />
                    <button
                      type="button"
                      onClick={() => void handleScrapeUrl()}
                      disabled={citPhase.kind === "scraping" || citPhase.kind === "generating" || !citUrlInput.trim()}
                      className="rounded-[6px] bg-[#1e252f] px-2.5 py-1.5 text-[11px] font-medium text-[#94a3b8] transition hover:bg-[#252c38] disabled:opacity-40"
                    >
                      {citPhase.kind === "scraping" ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#94a3b8] border-t-transparent" />
                      ) : "Scrape"}
                    </button>
                  </div>

                  {/* Scraped metadata + format picker */}
                  {citPhase.kind === "awaiting_format" && (
                    <div className="mt-2 rounded-[8px] border border-[#2a2f38] bg-[#161b23] p-2.5">
                      <div className="mb-2 flex items-start gap-1.5">
                        <svg width="10" height="10" className="mt-0.5 flex-shrink-0 text-[#4ade80]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
                        <div className="min-w-0">
                          {citPhase.meta.title && <p className="truncate text-[10px] font-medium text-[#e2e8f0]">{citPhase.meta.title}</p>}
                          {citPhase.meta.author && <p className="truncate text-[10px] text-[#64748b]">{citPhase.meta.author}</p>}
                          {citPhase.meta.year && <p className="text-[10px] text-[#4b5563]">{citPhase.meta.year}</p>}
                        </div>
                      </div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#4b5563]">Which format?</p>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {FORMAT_STYLES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setCitFormatPick(s.id)}
                            className={`relative flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10px] font-medium transition ${citFormatPick === s.id ? "bg-[#252c38] text-[#e2e8f0] ring-1 ring-[#3a4150]" : "bg-[#1a1f28] text-[#64748b] hover:bg-[#1e252f] hover:text-[#94a3b8]"}`}
                          >
                            {s.abbr}
                            {s.id === currentEssayFormat && (
                              <span className="rounded-[3px] bg-[#ea4335] px-[3px] py-[1px] text-[8px] font-bold leading-none text-white">current</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGenerateCitation(citPhase.url, citPhase.meta, citFormatPick)}
                        className="w-full rounded-[6px] bg-[#ea4335] py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#dc2626]"
                      >
                        Generate Citation
                      </button>
                    </div>
                  )}

                  {/* Generating spinner */}
                  {citPhase.kind === "generating" && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#1e2530] px-2 py-1.5 text-[11px] text-[#94a3b8]">
                      <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#94a3b8] border-t-transparent" />
                      <span>Generating citation…</span>
                    </div>
                  )}

                  {/* Error */}
                  {citPhase.kind === "error" && (
                    <div className="mt-2 rounded-[8px] border border-[#3a1f1f] bg-[#1e1208] p-2.5">
                      <p className="mb-1.5 text-[11px] text-[#fbbf24]">{citPhase.message}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setManualFormUrl(citPhase.url);
                          setShowManualForm(true);
                          setCitPhase({ kind: "idle" });
                        }}
                        className="text-[11px] font-medium text-[#60a5fa] hover:text-[#93c5fd]"
                      >
                        Enter details manually →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Manual Form ── */}
              {showManualForm && (
                <div className="mb-3 rounded-[8px] border border-[#2a2f38] bg-[#161b23] p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-[#e2e8f0]">Manual Entry</p>
                    <button
                      type="button"
                      onClick={() => { setShowManualForm(false); setManualAuthor(""); setManualPublisher(""); setManualYear(""); setManualContent(""); setManualFormUrl(""); }}
                      className="text-[11px] text-[#4b5563] hover:text-[#94a3b8]"
                    >✕</button>
                  </div>
                  {[
                    { label: "Author name", value: manualAuthor, set: setManualAuthor, ph: "e.g. John Smith" },
                    { label: "Publisher name", value: manualPublisher, set: setManualPublisher, ph: "e.g. Penguin Books" },
                    { label: "Published year", value: manualYear, set: setManualYear, ph: "e.g. 2023" },
                  ].map(({ label, value, set, ph }) => (
                    <div key={label} className="mb-1.5">
                      <p className="mb-0.5 text-[10px] text-[#4b5563]">{label}</p>
                      <input
                        type="text"
                        className="w-full rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] placeholder-[#374151] outline-none focus:border-[#4b5563]"
                        placeholder={ph}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="mb-2">
                    <p className="mb-0.5 text-[10px] text-[#4b5563]">Full content (helps AI)</p>
                    <textarea
                      className="w-full rounded-[6px] border border-[#2a2f38] bg-[#0f1218] px-2 py-1.5 text-[11px] text-[#e2e8f0] placeholder-[#374151] outline-none focus:border-[#4b5563]"
                      placeholder="Paste a summary or excerpt…"
                      rows={4}
                      value={manualContent}
                      onChange={(e) => setManualContent(e.target.value)}
                    />
                  </div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#4b5563]">Which format?</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {FORMAT_STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setCitFormatPick(s.id)}
                        className={`relative flex items-center gap-1 rounded-[6px] px-2 py-1 text-[10px] font-medium transition ${citFormatPick === s.id ? "bg-[#252c38] text-[#e2e8f0] ring-1 ring-[#3a4150]" : "bg-[#1a1f28] text-[#64748b] hover:bg-[#1e252f] hover:text-[#94a3b8]"}`}
                      >
                        {s.abbr}
                        {s.id === currentEssayFormat && (
                          <span className="rounded-[3px] bg-[#ea4335] px-[3px] py-[1px] text-[8px] font-bold leading-none text-white">current</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleManualGenerate()}
                    disabled={citPhase.kind === "generating" || (!manualAuthor.trim() && !manualPublisher.trim() && !manualContent.trim())}
                    className="w-full rounded-[6px] bg-[#ea4335] py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#dc2626] disabled:opacity-40"
                  >
                    {citPhase.kind === "generating" ? "Generating…" : "Generate Citation"}
                  </button>
                </div>
              )}

              {/* ── Citation Cards ── */}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#94a3b8]">
                  Bibliography {citCards.length > 0 && `(${citCards.length})`}
                </span>
                {!showManualForm && citPhase.kind === "idle" && (
                  <button
                    type="button"
                    onClick={() => setShowManualForm(true)}
                    className="text-[10px] text-[#4b5563] hover:text-[#94a3b8]"
                  >
                    + Manual
                  </button>
                )}
              </div>

              {citCards.length === 0 && (
                <p className="text-[10px] text-[#374151]">Scrape a URL above to generate citations.</p>
              )}

              <div className="flex flex-col gap-2">
                {citCards.map((card, idx) => (
                  <div key={card.id} className="rounded-[8px] bg-[#1a1f28] p-2.5">
                    {/* Card header */}
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="flex-shrink-0 rounded-full bg-[#252c38] px-1.5 py-0.5 text-[9px] font-bold text-[#94a3b8]">{idx + 1}</span>
                      <p className="min-w-0 flex-1 truncate text-[9px] text-[#4b5563]">{card.url}</p>
                      <button type="button" onClick={() => removeCitCard(card.id)} className="flex-shrink-0 text-[#4b5563] hover:text-[#ef4444]">
                        <TrashIconSm />
                      </button>
                    </div>

                    {/* In-text */}
                    <div className="mb-1.5">
                      <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-[#4b5563]">In-text citation</p>
                      <div className="flex items-start gap-1.5 rounded-[6px] bg-[#0f1218] px-2 py-1.5">
                        <p className="min-w-0 flex-1 font-mono text-[10px] leading-relaxed text-[#93c5fd]">{card.inText}</p>
                        <button
                          type="button"
                          onClick={() => handleInsertInText(card.inText)}
                          className="flex-shrink-0 rounded-[4px] bg-[#252c38] px-1.5 py-0.5 text-[9px] font-semibold text-[#94a3b8] transition hover:bg-[#2e3647] hover:text-[#e2e8f0]"
                        >
                          Insert
                        </button>
                      </div>
                    </div>

                    {/* Bibliography */}
                    <div>
                      <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-[#4b5563]">Bibliography</p>
                      <div className="flex items-start gap-1.5 rounded-[6px] bg-[#0f1218] px-2 py-1.5">
                        <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-[#94a3b8]">{card.bibliography}</p>
                        <button
                          type="button"
                          onClick={() => handleInsertBib(card.bibliography)}
                          className="flex-shrink-0 rounded-[4px] bg-[#252c38] px-1.5 py-0.5 text-[9px] font-semibold text-[#94a3b8] transition hover:bg-[#2e3647] hover:text-[#e2e8f0]"
                        >
                          Insert
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Humanize Modal */}
      {(humanizePhase.kind === "ask" || humanizePhase.kind === "pick_provider" || humanizePhase.kind === "humanizing" || humanizePhase.kind === "error" || humanizePhase.kind === "login_required" || humanizePhase.kind === "insufficient_credits") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
          <div className="w-[400px] rounded-[18px] border border-[#2a2f38] bg-[#13161c] p-6 shadow-2xl">

            {/* ── Ask: Humanize? ── */}
            {humanizePhase.kind === "ask" && (
              <>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#1e252f]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 6v6l4 2" /></svg>
                </div>
                <h2 className="mb-1 text-[15px] font-semibold text-[#e2e8f0]">Humanize before exporting?</h2>
                <p className="mb-5 text-[13px] leading-relaxed text-[#64748b]">Run your essay through an AI bypass humanizer to make it undetectable before downloading.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { if (onFinish) onFinish(humanizePhase.snapshot, coreSnapshot.formatStyle); setHumanizePhase({ kind: "idle" }); }}
                    className="flex-1 rounded-[10px] border border-[#2a2f38] py-2.5 text-[13px] font-medium text-[#94a3b8] transition hover:bg-[#1e252f] hover:text-[#e2e8f0]"
                  >
                    Skip — Download Now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (IS_STANDALONE) {
                        void handleStandaloneHumanizeGate(humanizePhase.snapshot);
                      } else {
                        setHumanizePhase({ kind: "pick_provider", snapshot: humanizePhase.snapshot });
                      }
                    }}
                    className="flex-1 rounded-[10px] bg-[#ea4335] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#dc2626]"
                  >
                    Yes, Humanize →
                  </button>
                </div>
              </>
            )}

            {/* ── Pick Provider ── */}
            {humanizePhase.kind === "pick_provider" && (
              <>
                <h2 className="mb-1 text-[15px] font-semibold text-[#e2e8f0]">Choose a humanizer</h2>
                <p className="mb-4 text-[13px] text-[#64748b]">Select which AI bypass service to use.</p>
                <div className="mb-4 flex gap-3">
                  {/* Undetectable AI */}
                  <button
                    type="button"
                    onClick={() => void handleHumanize("UndetectableAI", humanizePhase.snapshot)}
                    className="flex flex-1 flex-col items-center gap-2 rounded-[12px] border border-[#2a2f38] bg-[#161b23] px-3 py-4 transition hover:border-[#3a4150] hover:bg-[#1a1f28]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d2218] text-[#4ade80]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12s1.5-2 4-2 4 2 4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                    </div>
                    <span className="text-[12px] font-semibold text-[#e2e8f0]">Undetectable AI</span>
                    <span className="text-center text-[10px] text-[#4b5563]">Async · University level</span>
                  </button>
                  {/* StealthGPT */}
                  <button
                    type="button"
                    onClick={() => void handleHumanize("StealthGPT", humanizePhase.snapshot)}
                    className="flex flex-1 flex-col items-center gap-2 rounded-[12px] border border-[#2a2f38] bg-[#161b23] px-3 py-4 transition hover:border-[#3a4150] hover:bg-[#1a1f28]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1e2a1a] text-[#86efac]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                    </div>
                    <span className="text-[12px] font-semibold text-[#e2e8f0]">StealthGPT</span>
                    <span className="text-center text-[10px] text-[#4b5563]">Instant · Standard tone</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setHumanizePhase({ kind: "ask", snapshot: humanizePhase.snapshot })}
                  className="w-full rounded-[10px] py-2 text-[12px] text-[#4b5563] transition hover:text-[#94a3b8]"
                >
                  ← Back
                </button>
              </>
            )}

            {/* ── Humanizing ── */}
            {humanizePhase.kind === "humanizing" && (
              <>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#1e252f]">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-[#ea4335] border-t-transparent" />
                </div>
                <h2 className="mb-1 text-[15px] font-semibold text-[#e2e8f0]">Humanizing with {humanizePhase.provider === "StealthGPT" ? "StealthGPT" : "Undetectable AI"}…</h2>
                <p className="text-[13px] text-[#64748b]">
                  {humanizePhase.provider === "UndetectableAI"
                    ? "Submitting to Undetectable AI and polling for results. This may take up to a minute."
                    : "Sending your essay to StealthGPT. Usually completes in a few seconds."}
                </p>
              </>
            )}

            {/* ── Error ── */}
            {humanizePhase.kind === "error" && (
              <>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#1e1208]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <h2 className="mb-1 text-[15px] font-semibold text-[#e2e8f0]">Humanization failed</h2>
                <p className="mb-4 text-[13px] text-[#fbbf24]">{humanizePhase.message}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHumanizePhase({ kind: "pick_provider", snapshot: humanizePhase.snapshot })}
                    className="flex-1 rounded-[10px] bg-[#1e252f] py-2.5 text-[13px] font-medium text-[#94a3b8] transition hover:bg-[#252c38]"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (onFinish) onFinish(humanizePhase.snapshot, coreSnapshot.formatStyle); setHumanizePhase({ kind: "idle" }); }}
                    className="flex-1 rounded-[10px] border border-[#2a2f38] py-2.5 text-[13px] font-medium text-[#64748b] transition hover:text-[#94a3b8]"
                  >
                    Skip — Download
                  </button>
                </div>
              </>
            )}

            {/* ── Login Required (standalone mode) ── */}
            {humanizePhase.kind === "login_required" && (
              <>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#1e252f]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea4335" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                </div>
                <h2 className="mb-1 text-[15px] font-semibold text-[#e2e8f0]">Sign in to humanize</h2>
                <p className="mb-4 text-[13px] leading-relaxed text-[#64748b]">Humanization uses your credits. Create a free account to get started — new users receive 300 humanizer credits.</p>
                {loginError && (
                  <p className="mb-3 rounded-[6px] bg-[#1e1208] px-3 py-2 text-[12px] text-[#fbbf24]">{loginError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void handleLoginGoogle()}
                  disabled={loginLoading}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#2a2f38] bg-[#1a1f28] py-2.5 text-[13px] font-medium text-[#e2e8f0] transition hover:bg-[#252c38] disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
                <form onSubmit={(e) => void handleLoginEmail(e)}>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Email"
                    className="mb-2 w-full rounded-[8px] border border-[#2a2f38] bg-[#161b23] px-3 py-2 text-[13px] text-[#e2e8f0] placeholder-[#4b5563] outline-none focus:border-[#3a4150]"
                    required
                  />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Password"
                    className="mb-3 w-full rounded-[8px] border border-[#2a2f38] bg-[#161b23] px-3 py-2 text-[13px] text-[#e2e8f0] placeholder-[#4b5563] outline-none focus:border-[#3a4150]"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loginLoading || !loginEmail || !loginPassword}
                    className="mb-2 w-full rounded-[10px] bg-[#ea4335] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#dc2626] disabled:opacity-50"
                  >
                    {loginLoading ? "Signing in…" : "Sign In"}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => { setHumanizePhase({ kind: "idle" }); setLoginError(null); }}
                  className="w-full rounded-[10px] py-2 text-[12px] text-[#4b5563] transition hover:text-[#94a3b8]"
                >
                  Cancel
                </button>
              </>
            )}

            {/* ── Insufficient Credits (standalone mode) ── */}
            {humanizePhase.kind === "insufficient_credits" && (
              <>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#1e1208]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <h2 className="mb-1 text-[15px] font-semibold text-[#e2e8f0]">Insufficient Credits</h2>
                <p className="mb-1 text-[13px] leading-relaxed text-[#64748b]">
                  This essay requires <span className="text-[#fbbf24] font-medium">{humanizePhase.required} humanizer credits</span>, but you only have <span className="text-[#e2e8f0] font-medium">{humanizePhase.available}</span>.
                </p>
                <p className="mb-5 text-[12px] text-[#4b5563]">Recharge your credits to continue, or skip humanization and download now.</p>
                <div className="mb-2 flex gap-2">
                  <div className="flex-1">
                    <StoreButton />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (onFinish) onFinish(humanizePhase.snapshot, coreSnapshot.formatStyle); setHumanizePhase({ kind: "idle" }); }}
                    className="flex-1 rounded-[10px] border border-[#2a2f38] py-2.5 text-[13px] font-medium text-[#64748b] transition hover:text-[#94a3b8]"
                  >
                    Skip — Download
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setHumanizePhase({ kind: "ask", snapshot: humanizePhase.snapshot })}
                  className="w-full rounded-[10px] py-2 text-[12px] text-[#4b5563] transition hover:text-[#94a3b8]"
                >
                  ← Back
                </button>
              </>
            )}

          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[8px] bg-[#252c38] px-4 py-2 text-[12px] font-medium text-[#e2e8f0] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
