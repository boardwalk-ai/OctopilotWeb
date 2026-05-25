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

type ToneId = "positive" | "sweet" | "neutral" | "direct" | "no_nonsense" | "roast";

const TONE_META: { id: ToneId; label: string }[] = [
  { id: "roast",       label: "Roast 🔥" },
  { id: "positive",    label: "Positive" },
  { id: "sweet",       label: "Sweet" },
  { id: "neutral",     label: "Neutral" },
  { id: "direct",      label: "Direct" },
  { id: "no_nonsense", label: "No Nonsense" },
];

interface OctoSuggestion { icon: string; title: string; fix: string; }
interface ChatMsg { id: string; role: "user" | "assistant"; text: string; suggestions?: OctoSuggestion[]; }

/* ─── Octo markdown renderer ─────────────────────────────────────────────────── */
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={key++} className="font-bold text-[#f1f5f9]">{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={key++} className="not-italic font-semibold text-[#93c5fd]">{match[2]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

function OctoMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      nodes.push(<p key={key++} className="mt-2 mb-0.5 text-[12px] font-bold text-[#e2e8f0]">{parseInline(line.slice(4))}</p>);
    } else if (line.startsWith("## ")) {
      nodes.push(<p key={key++} className="mt-2 mb-0.5 text-[13px] font-bold text-[#f1f5f9]">{parseInline(line.slice(3))}</p>);
    } else if (line.startsWith("# ")) {
      nodes.push(<p key={key++} className="mt-2 mb-1 text-[14px] font-bold text-[#f1f5f9]">{parseInline(line.slice(2))}</p>);
    } else if (line.trim() === "") {
      nodes.push(<div key={key++} className="h-2" />);
    } else {
      nodes.push(<p key={key++} className="leading-relaxed">{parseInline(line)}</p>);
    }
  }
  return <>{nodes}</>;
}

function SuggestionCards({ suggestions }: { suggestions: OctoSuggestion[] }) {
  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#334155]">How to improve</p>
      {suggestions.map((s, i) => (
        <div
          key={i}
          className="rounded-[10px] border border-[#1e3a5f] bg-[#0d1e30] px-2.5 py-2"
          style={{ animation: `chat-msg-in 0.28s ease-out ${0.12 + i * 0.09}s both` }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] leading-none">{s.icon}</span>
            <span className="text-[10.5px] font-semibold text-[#93c5fd]">{s.title}</span>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[#475569]">{s.fix}</p>
        </div>
      ))}
    </div>
  );
}

function parseSuggestions(text: string): { cleanText: string; suggestions: OctoSuggestion[] } {
  const match = text.match(/\[SUGGESTIONS_JSON\]\s*([\s\S]*?)\s*\[\/SUGGESTIONS_JSON\]/);
  if (!match) return { cleanText: text, suggestions: [] };
  const cleanText = text.slice(0, text.indexOf("[SUGGESTIONS_JSON]")).trimEnd();
  try {
    const parsed = JSON.parse(match[1].trim()) as { suggestions?: OctoSuggestion[] };
    return { cleanText, suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [] };
  } catch {
    return { cleanText, suggestions: [] };
  }
}

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
  /* ── Shutter entrance animation ── */
  const [shutterDone, setShutterDone] = useState(false);

  /* ── Auth / credits ── */
  const [currentUser, setCurrentUser] = useState(() => AuthService.getCurrentUser());
  const [humanizerCredits, setHumanizerCredits] = useState<number | null>(null);

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
  const [citMode, setCitMode] = useState<"manual" | "auto">("manual");
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

  /* ── Left tab & Octo bot chat ── */
  const [leftTab, setLeftTab] = useState<"octo" | "upload">("upload");
  const [chatTone, setChatTone] = useState<ToneId>("roast");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fmtRootRef = useRef<HTMLDivElement>(null);

  const wordCount = useMemo(() => countWordsRaw(rawContent), [rawContent]);
  const charCount = rawContent.length;
  const pageCount = useMemo(() => (wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 250))), [wordCount]);
  const parsedResult = parseStatus.kind === "done" ? parseStatus.result : null;
  const canApply = rawContent.trim().length > 0 && parseStatus.kind !== "parsing";
  const isDocLocked = isUploading || parseStatus.kind === "parsing";
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

  /* ── Auth state + credits listener ── */
  useEffect(() => {
    const unsub = AuthService.subscribe(async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const c = await CreditService.getAvailableCredits();
          setHumanizerCredits(c.humanizer);
        } catch { setHumanizerCredits(null); }
      } else {
        setHumanizerCredits(null);
      }
    });
    return unsub;
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
    setManualAuthor(""); setManualPublisher(""); setManualYear(""); setManualContent("");
    setManualFormUrl("");
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

  /* ── Drag-to-scroll with momentum ── */
  useEffect(() => {
    const root = fmtRootRef.current;
    if (!root) return;

    const SKIP = new Set(["INPUT", "TEXTAREA", "BUTTON", "A", "SELECT"]);
    let isDown = false, hasDragged = false;
    let scrollEl: Element | null = null;
    let startX = 0, startY = 0, startSL = 0, startST = 0;
    let lastX = 0, lastY = 0, lastT = 0;
    let velX = 0, velY = 0, rafId = 0;

    const getScrollable = (el: Element | null): Element | null => {
      while (el && root.contains(el)) {
        const s = window.getComputedStyle(el);
        const canX = (s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1;
        const canY = (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
        if (canX || canY) return el;
        el = el.parentElement;
      }
      return null;
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const t = e.target as Element;
      if (SKIP.has(t.tagName) || t.closest('[contenteditable="true"],input,textarea,button,a,select')) return;
      const sc = getScrollable(t);
      if (!sc) return;
      cancelAnimationFrame(rafId);
      isDown = true; hasDragged = false; scrollEl = sc;
      startX = lastX = e.clientX; startY = lastY = e.clientY;
      startSL = sc.scrollLeft; startST = sc.scrollTop;
      lastT = performance.now(); velX = velY = 0;
    };

    const onMove = (e: MouseEvent) => {
      if (!isDown || !scrollEl) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!hasDragged && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      hasDragged = true;
      root.classList.add("fmt-dragging");
      scrollEl.scrollLeft = startSL - dx;
      scrollEl.scrollTop  = startST - dy;
      const now = performance.now(), dt = now - lastT;
      if (dt > 0) { velX = (e.clientX - lastX) / dt; velY = (e.clientY - lastY) / dt; }
      lastX = e.clientX; lastY = e.clientY; lastT = now;
    };

    const onUp = () => {
      if (!isDown) return;
      isDown = false;
      root.classList.remove("fmt-dragging");
      if (!hasDragged || !scrollEl) { scrollEl = null; return; }
      const el = scrollEl; scrollEl = null;
      let mx = velX * 120, my = velY * 120;
      const tick = () => {
        if (Math.abs(mx) < 0.4 && Math.abs(my) < 0.4) return;
        el.scrollLeft -= mx; el.scrollTop -= my;
        mx *= 0.87; my *= 0.87;
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };

    root.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      root.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(rafId);
    };
  }, []);

  /* ── Octo bot: auto-scroll chat ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  /* ── Octo bot: send message (streaming) ── */
  const sendChat = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;

    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", text: trimmed };
    const assistantId = crypto.randomUUID();

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatStarted(true);
    setChatLoading(true);

    try {
      const essayCtx = rawContent.trim() || coreSnapshot.content.trim();
      const history = [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.text }));

      const res = await fetchWithUserAuthorization("/api/octobot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, tone: chatTone, context: essayCtx }),
      });

      if (!res.ok || !res.body) throw new Error("Stream unavailable.");

      // Insert empty assistant bubble — typing dots disappear, streaming text appears
      setChatMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, text: m.text + chunk } : m)
        );
      }

      // Parse suggestions out of the completed response
      setChatMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          const { cleanText, suggestions } = parseSuggestions(m.text);
          return { ...m, text: cleanText, suggestions: suggestions.length > 0 ? suggestions : undefined };
        })
      );
    } catch {
      setChatMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "assistant",
        text: "Hmm, something went wrong. Try again? 😅",
      }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMessages, chatTone, coreSnapshot.content, rawContent]);

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
    <div ref={fmtRootRef} className="fmt-root flex h-screen flex-col overflow-hidden bg-[#11151b]">

      {/* ── Top bar ── */}
      <div className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-[#2a2f38] bg-[#13161c] px-4">
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
              @keyframes octopilot-char-scan {
                0%   { color: #ff2200; transform: scale(1); }
                8%   { color: #ffaa88; transform: scale(1.28); }
                22%  { color: #ff2200; transform: scale(1); }
                100% { color: #ff2200; transform: scale(1); }
              }
              @keyframes cit-card-in {
                from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes shutter-top {
                0%   { transform: translateY(0); }
                100% { transform: translateY(-100%); }
              }
              @keyframes shutter-bottom {
                0%   { transform: translateY(0); }
                100% { transform: translateY(100%); }
              }
              @keyframes editor-enter {
                from { opacity: 0; transform: translateY(16px) scale(0.985); }
                to   { opacity: 1; transform: translateY(0)    scale(1);     }
              }
              @keyframes chat-msg-in {
                from { opacity: 0; transform: translateY(8px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0)   scale(1);    }
              }
              @keyframes typing-bounce {
                0%, 60%, 100% { transform: translateY(0); }
                30%           { transform: translateY(-4px); }
              }
              /* Hide all scrollbars, keep scroll functional */
              .fmt-root *::-webkit-scrollbar { display: none; }
              .fmt-root * { -ms-overflow-style: none; scrollbar-width: none; }
              /* Grabbing cursor while drag-scrolling */
              .fmt-root.fmt-dragging,
              .fmt-root.fmt-dragging * { cursor: grabbing !important; user-select: none !important; }
              /* Disable text selection everywhere except editable areas */
              .fmt-root { user-select: none; -webkit-user-select: none; }
              .fmt-root [contenteditable="true"],
              .fmt-root textarea,
              .fmt-root input[type="text"],
              .fmt-root input[type="email"],
              .fmt-root input[type="password"],
              .fmt-root input[type="url"],
              .fmt-root input[type="number"] { user-select: text; -webkit-user-select: text; }
            `}</style>
            <span className="font-extrabold italic tracking-tight leading-none">
              <span style={{ fontSize: '21px', color: '#ff2200' }}>
                {"Octopilot".split("").map((char, i) => (
                  <span key={i} style={{
                    display: 'inline-block',
                    animation: 'octopilot-char-scan 2.4s linear infinite',
                    animationDelay: `${(i / 9) * 2.4}s`,
                  }}>{char}</span>
                ))}
              </span>
              <span style={{ fontSize: '14px' }} className="text-[#e2e8f0]"> Formatter Tool</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Save Draft */}
          <button
            type="button"
            onClick={saveDraft}
            disabled={!rawContent.trim()}
            className="rounded-full px-3 py-1 text-[12px] font-medium text-[#64748b] transition hover:bg-[#1e252f] hover:text-[#e2e8f0] disabled:opacity-40"
          >
            Save Draft
          </button>

          <div className="h-4 w-px bg-[#2a2f38]" />

          {/* Humanizer credits — logged in only */}
          {currentUser && humanizerCredits !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-[#1a1f28] px-2.5 py-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span className="text-[11px] font-semibold text-[#e2e8f0]">{humanizerCredits.toLocaleString()}</span>
            </div>
          )}

          {/* Avatar */}
          {currentUser ? (
            currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Profile"
                className="h-7 w-7 rounded-full object-cover ring-1 ring-[#2a2f38]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#252c38] text-[11px] font-bold text-[#e2e8f0] ring-1 ring-[#3a4150]">
                {((currentUser.displayName ?? currentUser.email ?? "?")[0] ?? "?").toUpperCase()}
              </div>
            )
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1a1f28] text-[#4b5563]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
          )}

          {/* Logout — logged in only */}
          {currentUser && (
            <button
              type="button"
              onClick={() => void AuthService.signOut()}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-[#4b5563] transition hover:bg-[#1e252f] hover:text-[#94a3b8] active:scale-95"
            >
              Sign out
            </button>
          )}
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
            {/* Header */}
            <div className="relative flex items-center justify-center border-b border-[#2a2f38] px-3 py-2.5">
              <span className="text-[13px] font-bold tracking-wide text-[#e2e8f0]">1 · Document</span>
              <button onClick={() => setLeftOpen(false)} className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full text-[#4b5563] hover:bg-[#1e252f] hover:text-[#9ca3af]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="flex-shrink-0 border-b border-[#2a2f38] px-3 py-2">
              <div className="flex rounded-full bg-[#1a1f28] p-1">
                {(["octo", "upload"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setLeftTab(tab)}
                    className={`flex-1 rounded-full py-1.5 text-[11px] font-medium transition active:scale-[0.97] ${leftTab === tab ? "bg-[#252c38] text-[#e2e8f0] shadow-sm" : "text-[#64748b] hover:text-[#94a3b8]"}`}
                  >
                    {tab === "octo" ? "Octo the Bot" : "Upload"}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Upload tab ── */}
            {leftTab === "upload" && (
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">

                {/* Upload zone */}
                <div
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-3 py-7 text-center transition ${isDocLocked ? "cursor-not-allowed border-[#2a2f38] opacity-40" : dragOver ? "cursor-pointer border-[#ea4335] bg-[#ea4335]/6" : "cursor-pointer border-[#2a2f38] hover:border-[#3a4150]"}`}
                  onClick={() => { if (!isDocLocked) fileInputRef.current?.click(); }}
                  onDragEnter={(e) => { if (!isDocLocked) { e.preventDefault(); setDragOver(true); } }}
                  onDragOver={(e) => { if (!isDocLocked) { e.preventDefault(); setDragOver(true); } }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!isDocLocked) { const f = e.dataTransfer.files?.[0]; if (f) void applyFile(f); } }}
                >
                  <div className="text-[#374151]"><UploadIcon /></div>
                  <p className="text-[11px] text-[#64748b]">
                    {isUploading ? "Reading file…" : isDocLocked ? "Analysing document…" : "Drop file or click to browse"}
                  </p>
                  <p className="text-[10px] text-[#374151]">.docx · .txt · .pdf</p>
                </div>

                <input ref={fileInputRef} type="file" className="hidden" accept=".docx,.txt,.pdf" onChange={handleFileChange} disabled={isDocLocked} />

                {/* File chip */}
                {rawContent && !isUploading && (
                  <div className="mt-2 flex items-center gap-2 rounded-full bg-[#1a1f28] px-3 py-1.5">
                    <span className="text-[#4b5563]"><FileIcon /></span>
                    <span className="flex-1 truncate text-[11px] text-[#94a3b8]">{fileName ?? "Pasted document"}</span>
                    <button type="button" onClick={clearDocument} className="text-[#4b5563] transition hover:text-[#ef4444] active:scale-90">×</button>
                  </div>
                )}

                {renderParseStatus()}

                {/* Stats */}
                <div className="mt-2.5 flex justify-between rounded-2xl bg-[#1a1f28] px-3 py-2 text-[10px] text-[#4b5563]">
                  <span>{wordCount.toLocaleString()} words</span>
                  <span>{charCount.toLocaleString()} chars</span>
                  <span>~{pageCount} pages</span>
                </div>

                <div className="my-3 h-px bg-[#2a2f38]" />

                {/* Format Style */}
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#4b5563]">Format Style</p>
                <div className="flex flex-col gap-1">
                  {FORMAT_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFormatStyle(s.id)}
                      className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)] ${formatStyle === s.id ? "bg-[#1e252f] ring-1 ring-[#3a4150]" : "hover:bg-[#181d24]"}`}
                    >
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: s.color }}>{s.abbr}</div>
                      <span className={`flex-1 text-[11px] ${formatStyle === s.id ? "text-[#e2e8f0]" : "text-[#64748b]"}`}>{s.label}</span>
                      {formatStyle === s.id && <div className="h-1.5 w-1.5 rounded-full bg-[#ea4335]" />}
                    </button>
                  ))}
                </div>

                {/* Format Document / New Session */}
                {editorActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
                      window.location.reload();
                    }}
                    className="mt-4 w-full rounded-full border border-[#2a2f38] py-2.5 text-[12px] font-medium text-[#94a3b8] transition hover:bg-[#1e252f] hover:text-[#e2e8f0] active:translate-y-[1px]"
                  >
                    Start a new session
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={applyDocument}
                    disabled={!canApply}
                    className="mt-4 w-full rounded-full bg-[#ea4335] py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.45)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Format Document
                  </button>
                )}
              </div>
            )}

            {/* ── Octo Bot tab ── */}
            {leftTab === "octo" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

                {/* Tone selector */}
                <div className="flex-shrink-0 overflow-x-auto border-b border-[#2a2f38] px-3 py-2">
                  <div className="flex gap-1.5 pb-0.5">
                    {TONE_META.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setChatTone(t.id)}
                        className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition active:scale-[0.95] ${chatTone === t.id ? "bg-[#ea4335] text-white" : "bg-[#1a1f28] text-[#64748b] hover:bg-[#1e252f] hover:text-[#94a3b8]"}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Messages */}
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  {!chatStarted ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 pb-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1a1f28] ring-1 ring-[#2a2f38]">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" fill="#ea4335" opacity="0.12" />
                          <path d="M9 10.5c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.1-.6 2.08-1.5 2.6V15h-3v-1.9C9.6 12.58 9 11.6 9 10.5z" fill="#ea4335" />
                          <rect x="10.25" y="15.5" width="3.5" height="1.25" rx="0.625" fill="#ea4335" />
                          <rect x="10.75" y="17.25" width="2.5" height="1" rx="0.5" fill="#ea4335" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className="text-[12px] font-medium text-[#e2e8f0]">Octo is ready</p>
                        <p className="mt-0.5 text-[10px] text-[#4b5563]">
                          {chatTone === "roast" ? "Brace yourself. 💀" : "Ask for a critique."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void sendChat("Yo Octo, criticize my essay")}
                        className="rounded-full border border-[#ea4335]/40 bg-[#ea4335]/10 px-4 py-2 text-[11px] font-medium text-[#ea4335] transition hover:bg-[#ea4335]/20 active:scale-[0.97]"
                      >
                        "Yo Octo, criticize my essay"
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          style={{ animation: "chat-msg-in 0.22s ease-out both" }}
                        >
                          <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[85%] px-3 py-2 text-[12px] ${
                                msg.role === "user"
                                  ? "rounded-[14px] rounded-br-[4px] bg-[#ea4335] text-white whitespace-pre-wrap break-words leading-relaxed"
                                  : "rounded-[14px] rounded-bl-[4px] bg-[#1e252f] text-[#cbd5e1]"
                              }`}
                            >
                              {msg.role === "user" ? msg.text : <OctoMarkdown text={msg.text} />}
                            </div>
                          </div>
                          {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
                            <SuggestionCards suggestions={msg.suggestions} />
                          )}
                        </div>
                      ))}
                      {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                        <div className="flex justify-start" style={{ animation: "chat-msg-in 0.22s ease-out both" }}>
                          <div className="flex items-center gap-1 rounded-[14px] rounded-bl-[4px] bg-[#1e252f] px-3 py-3">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="h-1.5 w-1.5 rounded-full bg-[#64748b]"
                                style={{ animation: `typing-bounce 1.1s ease-in-out ${i * 0.18}s infinite` }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* Input */}
                {chatStarted && (
                  <div className="flex-shrink-0 border-t border-[#2a2f38] px-3 py-2.5">
                    <div className="flex items-end gap-1.5">
                      <textarea
                        rows={1}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendChat(chatInput);
                          }
                        }}
                        placeholder="Message Octo…"
                        disabled={chatLoading}
                        className="min-h-[34px] flex-1 resize-none rounded-[10px] border border-[#2a2f38] bg-[#0f1218] px-3 py-2 text-[12px] text-[#e2e8f0] placeholder-[#374151] outline-none focus:border-[#3a4150] disabled:opacity-50"
                        style={{ maxHeight: "80px" }}
                      />
                      <button
                        type="button"
                        onClick={() => void sendChat(chatInput)}
                        disabled={chatLoading || !chatInput.trim()}
                        className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-[#ea4335] text-white transition hover:bg-[#dc2626] active:scale-[0.93] disabled:opacity-40"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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

        {/* CENTER: editor (always mounted; empty until Format Document is clicked) */}
        <div className="min-w-0 flex-1">
          <div
            key={editorKey}
            className="h-full"
            style={editorActive ? { animation: 'editor-enter 0.42s cubic-bezier(0.22, 1, 0.36, 1) both' } : undefined}
          >
            <FormatterEditorCore
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
          </div>
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

              {/* ── Mode Switcher ── */}
              <div className="mb-3 flex rounded-full bg-[#1a1f28] p-1">
                {(["manual", "auto"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setCitMode(mode); setCitPhase({ kind: "idle" }); }}
                    className={`flex-1 rounded-full py-1.5 text-[11px] font-medium transition active:scale-[0.97] ${citMode === mode ? "bg-[#252c38] text-[#e2e8f0] shadow-sm" : "text-[#64748b] hover:text-[#94a3b8]"}`}
                  >
                    {mode === "manual" ? "Manual" : "Auto"}
                  </button>
                ))}
              </div>

              {/* ── Auto: URL scrape ── */}
              {citMode === "auto" && (
                <div className="mb-3">
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      className="min-w-0 flex-1 rounded-2xl border border-[#2a2f38] bg-[#0f1218] px-3 py-1.5 text-[11px] text-[#e2e8f0] placeholder-[#4b5563] outline-none focus:border-[#4b5563]"
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
                      className="rounded-full bg-[#ea4335] px-4 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] disabled:opacity-40"
                    >
                      {citPhase.kind === "scraping" ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : "Scrape"}
                    </button>
                  </div>

                  {/* Scraped metadata + format picker */}
                  {citPhase.kind === "awaiting_format" && (
                    <div className="mt-2 rounded-[16px] border border-[#2a2f38] bg-[#161b23] p-3" style={{ animation: 'cit-card-in 0.22s ease-out' }}>
                      <div className="mb-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {citPhase.meta.title && <p className="truncate text-[11px] font-medium text-[#e2e8f0]">{citPhase.meta.title}</p>}
                          {citPhase.meta.author && <p className="truncate text-[10px] text-[#64748b]">{citPhase.meta.author}</p>}
                          {citPhase.meta.year && <p className="text-[10px] text-[#4b5563]">{citPhase.meta.year}</p>}
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-[#0d2218] px-2 py-0.5 text-[9px] font-semibold text-[#4ade80]">Scrape succeeded</span>
                      </div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#4b5563]">Which format?</p>
                      <div className="mb-2.5 flex flex-wrap gap-1.5">
                        {FORMAT_STYLES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setCitFormatPick(s.id)}
                            className={`relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition active:translate-y-[1px] active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.3)] ${citFormatPick === s.id ? "bg-[#252c38] text-[#e2e8f0] ring-1 ring-[#3a4150]" : "bg-[#1a1f28] text-[#64748b] hover:bg-[#1e252f] hover:text-[#94a3b8]"}`}
                          >
                            {s.label.split(" (")[0]}
                            {s.id === currentEssayFormat && (
                              <span className="rounded-[3px] bg-[#ea4335] px-[3px] py-[1px] text-[8px] font-bold leading-none text-white">current</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGenerateCitation(citPhase.url, citPhase.meta, citFormatPick)}
                        className="w-full rounded-full bg-[#ea4335] py-2 text-[11px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]"
                      >
                        Generate Citation
                      </button>
                    </div>
                  )}

                  {/* Generating spinner */}
                  {citPhase.kind === "generating" && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-2xl bg-[#1e2530] px-3 py-1.5 text-[11px] text-[#94a3b8]">
                      <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#94a3b8] border-t-transparent" />
                      <span>Generating citation…</span>
                    </div>
                  )}

                  {/* Error */}
                  {citPhase.kind === "error" && (
                    <div className="mt-2 rounded-2xl border border-[#3a1f1f] bg-[#1e1208] p-2.5">
                      <p className="mb-1.5 text-[11px] text-[#fbbf24]">{citPhase.message}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setManualFormUrl(citPhase.url);
                          setCitMode("manual");
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
              {citMode === "manual" && (
                <div className="mb-3">
                  {[
                    { label: "Author name", value: manualAuthor, set: setManualAuthor, ph: "e.g. John Smith" },
                    { label: "Publisher name", value: manualPublisher, set: setManualPublisher, ph: "e.g. Penguin Books" },
                    { label: "Published year", value: manualYear, set: setManualYear, ph: "e.g. 2023" },
                  ].map(({ label, value, set, ph }) => (
                    <div key={label} className="mb-1.5">
                      <p className="mb-0.5 text-[10px] text-[#4b5563]">{label}</p>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-[#2a2f38] bg-[#0f1218] px-3 py-1.5 text-[11px] text-[#e2e8f0] placeholder-[#374151] outline-none focus:border-[#4b5563]"
                        placeholder={ph}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="mb-2">
                    <p className="mb-0.5 text-[10px] text-[#4b5563]">Full content (helps AI)</p>
                    <textarea
                      className="w-full rounded-2xl border border-[#2a2f38] bg-[#0f1218] px-3 py-1.5 text-[11px] text-[#e2e8f0] placeholder-[#374151] outline-none focus:border-[#4b5563]"
                      placeholder="Paste a summary or excerpt…"
                      rows={4}
                      value={manualContent}
                      onChange={(e) => setManualContent(e.target.value)}
                    />
                  </div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#4b5563]">Which format?</p>
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {FORMAT_STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setCitFormatPick(s.id)}
                        className={`relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition active:translate-y-[1px] active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.3)] ${citFormatPick === s.id ? "bg-[#252c38] text-[#e2e8f0] ring-1 ring-[#3a4150]" : "bg-[#1a1f28] text-[#64748b] hover:bg-[#1e252f] hover:text-[#94a3b8]"}`}
                      >
                        {s.label.split(" (")[0]}
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
                    className="w-full rounded-full bg-[#ea4335] py-2 text-[11px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] disabled:opacity-40"
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
              </div>

              {citCards.length === 0 && (
                <p className="text-[10px] text-[#374151]">
                  {citMode === "auto" ? "Scrape a URL above to generate citations." : "Fill in the form above to generate a citation."}
                </p>
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
                    className="flex-1 rounded-[10px] bg-[#ea4335] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px]"
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
                    className="flex-1 rounded-[10px] border border-[#2a2f38] py-2.5 text-[13px] font-medium text-[#94a3b8] transition hover:bg-[#1e252f] hover:text-[#e2e8f0] active:translate-y-[1px]"
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

      {/* ── Cinematic shutter entrance ── */}
      {!shutterDone && (
        <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
          <div
            className="absolute left-0 right-0 top-0 h-1/2 bg-[#0a0d11]"
            style={{ animation: 'shutter-top 0.72s cubic-bezier(0.76, 0, 0.24, 1) 0.12s both' }}
            onAnimationEnd={() => setShutterDone(true)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-1/2 bg-[#0a0d11]"
            style={{ animation: 'shutter-bottom 0.72s cubic-bezier(0.76, 0, 0.24, 1) 0.12s both' }}
          />
        </div>
      )}
    </div>
  );
}
