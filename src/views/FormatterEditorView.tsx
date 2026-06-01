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

/* ─── Dictionary / Thesaurus types ──────────────────────────────────────────── */
interface DictApiPhonetic { text?: string; audio?: string; }
interface DictApiDefinition { definition: string; example?: string; synonyms?: string[]; antonyms?: string[]; }
interface DictApiMeaning { partOfSpeech: string; definitions: DictApiDefinition[]; synonyms: string[]; antonyms: string[]; }
interface DictApiEntry { word: string; phonetic?: string; phonetics: DictApiPhonetic[]; meanings: DictApiMeaning[]; }
interface DictMeaning { partOfSpeech: string; definitions: { definition: string; example?: string }[]; }
interface DictResult { word: string; phonetic?: string; audioUrl?: string; meanings: DictMeaning[]; synonyms: string[]; antonyms: string[]; }
interface ThesWord { word: string; score: number; }
interface ThesResult { word: string; synonyms: ThesWord[]; antonyms: ThesWord[]; }
interface SourceResult { url: string; title: string; author?: string; publishedYear?: string; publisher?: string; fullContent: string; }
type SourceCitStyle = { inText: string; bibliography: string };
interface SourceModalState {
  source: SourceResult;
  color: string;
  citations: Partial<Record<FormatStyleId, SourceCitStyle>>;
  citLoading: boolean;
  citError: string | null;
  activeStyle: FormatStyleId;
}

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
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#4b1a17]">How to improve</p>
      {suggestions.map((s, i) => (
        <div
          key={i}
          className="rounded-[10px] border border-[#ea4335]/30 bg-[#0f1115] px-2.5 py-2"
          style={{ animation: `chat-msg-in 0.28s ease-out ${0.12 + i * 0.09}s both` }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] leading-none">{s.icon}</span>
            <span className="text-[10.5px] font-semibold text-[#ea4335]">{s.title}</span>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[#64748b]">{s.fix}</p>
        </div>
      ))}
    </div>
  );
}

interface SourceCardProps {
  source: SourceResult;
  index: number;
  color: string;
  expandedQuoteUrl: string | null;
  quoteText: string;
  setQuoteText: (t: string) => void;
  setExpandedQuoteUrl: (u: string | null) => void;
  onInsertQuote: (quote: string, source: SourceResult) => void;
  onOpenModal: (source: SourceResult, color: string) => void;
  onColorChange: (url: string, color: string) => void;
}
function SourceCard({ source, index, color, expandedQuoteUrl, quoteText, setQuoteText, setExpandedQuoteUrl, onInsertQuote, onOpenModal, onColorChange }: SourceCardProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const isExpanded = expandedQuoteUrl === source.url;
  const domain = getDomain(source.url);
  const { label: typeLabel } = getSourceType(source.url);
  const authorShort = source.author ? source.author.split(",")[0]!.trim() : "";
  return (
    <div
      className="mb-2 flex overflow-hidden rounded-[12px]"
      style={{
        border: `1px solid ${color}35`,
        background: "#0f1218",
        animation: `dict-in 0.25s ease-out ${index * 0.07}s both`,
      }}
    >
      {/* Left color strip */}
      <div className="w-[3px] flex-shrink-0" style={{ background: color }} />

      <div className="flex-1 p-3">
        {/* Clickable header → opens modal */}
        <button
          type="button"
          onClick={() => { setPickerOpen(false); onOpenModal(source, color); }}
          className="mb-2 w-full text-left transition hover:opacity-80 active:opacity-60"
        >
          <div className="mb-1.5 flex items-start gap-2">
            <span
              className="mt-[2px] flex-shrink-0 rounded-[4px] px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide"
              style={{ background: `${color}22`, color }}
            >{typeLabel}</span>
            <p className="line-clamp-2 flex-1 text-[11px] font-semibold leading-snug text-[#cbd5e1]">
              {source.title || domain}
            </p>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" className="mt-[2px] flex-shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-1 text-[9.5px] text-[#4b5563]">
            {authorShort && <span>{authorShort}</span>}
            {authorShort && source.publishedYear && <span>·</span>}
            {source.publishedYear && <span>{source.publishedYear}</span>}
            {(authorShort || source.publishedYear) && source.publisher && <span>·</span>}
            {source.publisher && <span className="text-[#374151]">{source.publisher.slice(0, 28)}</span>}
          </div>
          <div className="flex items-center gap-1 text-[9px] text-[#2a2f38]">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span className="truncate">{domain}</span>
          </div>
        </button>

        {/* Bottom row: Quote + Color picker */}
        <div className="flex items-center gap-2">
          {!isExpanded && (
            <button
              type="button"
              onClick={() => { setPickerOpen(false); setExpandedQuoteUrl(source.url); setQuoteText(""); }}
              className="rounded-full border px-2.5 py-1 text-[10px] font-medium transition hover:text-white active:scale-[0.95]"
              style={{ borderColor: `${color}40`, color }}
            >
              Quote
            </button>
          )}

          {/* Color dot → picker */}
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPickerOpen(!pickerOpen); }}
              className="flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-white/10 transition hover:ring-white/30 active:scale-[0.9]"
              style={{ background: color }}
              title="Change card color"
            />
            {pickerOpen && (
              <div
                className="absolute bottom-6 right-0 z-20 flex flex-wrap gap-1 rounded-[10px] border border-[#2a2f38] bg-[#161b23] p-2 shadow-xl"
                style={{ width: 130 }}
                onClick={(e) => e.stopPropagation()}
              >
                {SOURCE_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { onColorChange(source.url, c); setPickerOpen(false); }}
                    className="h-4 w-4 rounded-full transition hover:scale-125 active:scale-90"
                    style={{
                      background: c,
                      outline: color === c ? "2px solid white" : "none",
                      outlineOffset: 1,
                    }}
                    title={c}
                  />
                ))}
                {/* Custom color input */}
                <label className="relative flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-[#2a2f38] text-[8px] text-[#64748b] hover:bg-[#374151]" title="Custom color">
                  <span>＋</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => onColorChange(source.url, e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Expanded quote input */}
        {isExpanded && (
          <div className="mt-2 flex flex-col gap-1.5">
            <textarea
              autoFocus
              value={quoteText}
              onChange={(e) => setQuoteText(e.target.value)}
              placeholder="Paste or type the exact quote…"
              rows={3}
              className="w-full resize-none rounded-xl border border-[#2a2f38] bg-[#161b23] px-2.5 py-2 text-[11px] text-[#e2e8f0] placeholder-[#374151] outline-none"
              style={{ borderColor: `${color}40` }}
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setExpandedQuoteUrl(null)}
                className="flex-1 rounded-full border border-[#2a2f38] py-1.5 text-[10px] text-[#4b5563] transition hover:text-[#94a3b8] active:scale-[0.96]"
              >Cancel</button>
              <button
                type="button"
                onClick={() => onInsertQuote(quoteText, source)}
                disabled={!quoteText.trim()}
                className="flex-1 rounded-full py-1.5 text-[10px] font-semibold text-white transition active:scale-[0.96] disabled:opacity-40"
                style={{ background: color }}
              >Insert ✓</button>
            </div>
          </div>
        )}
      </div>
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

const SOURCE_PALETTE = [
  "#ea4335","#f59e0b","#10b981","#3b82f6","#8b5cf6",
  "#ec4899","#06b6d4","#f97316","#84cc16","#e11d48",
];

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url.slice(0, 30); }
}

function getSourceType(url: string): { label: string; color: string } {
  const d = getDomain(url);
  if (d.endsWith(".edu") || d.includes(".ac.")) return { label: "Academic", color: "#3b82f6" };
  if (d.endsWith(".gov")) return { label: "Government", color: "#22c55e" };
  if (["nature.com","science.org","pubmed.ncbi","journals.sagepub","academic.oup","tandfonline","wiley","springer","elsevier"].some(k => d.includes(k)))
    return { label: "Journal", color: "#a78bfa" };
  return { label: "Web", color: "#4b5563" };
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
  abstract: string;
  keywords: string;
  formatStyle: FormatStyleId;
}

const EMPTY_SNAPSHOT: CoreSnapshot = {
  content: "", bibliography: "", initialDocTitle: "", studentName: "",
  instructorName: "", institutionName: "", courseInfo: "", subjectCode: "",
  essayDate: "", abstract: "", keywords: "", formatStyle: "mla",
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

  /* ── Humanizer panel ── */
  const [humProvider, setHumProvider] = useState<"StealthGPT" | "UndetectableAI">("StealthGPT");
  const [stealthRephrase, setStealthRephrase] = useState(false);
  const [uaiReadability, setUaiReadability] = useState("University");
  const [uaiPurpose, setUaiPurpose] = useState("Essay");
  const [uaiStrength, setUaiStrength] = useState("More Human");
  const [humInput, setHumInput] = useState("");
  const [humOutput, setHumOutput] = useState("");
  const [humPanelLoading, setHumPanelLoading] = useState(false);
  const [humPanelError, setHumPanelError] = useState<string | null>(null);
  const [humCopied, setHumCopied] = useState(false);

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

  /* ── Octo bot chat ── */
  const [chatTone, setChatTone] = useState<ToneId>("roast");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

  /* ── Right tab ── */
  const [rightTab, setRightTab] = useState<"citations" | "dictionary" | "thesaurus" | "source">("citations");
  /* ── Dictionary ── */
  const [dictInput, setDictInput] = useState("");
  const [dictLoading, setDictLoading] = useState(false);
  const [dictResult, setDictResult] = useState<DictResult | null>(null);
  const [dictError, setDictError] = useState<string | null>(null);
  const [copiedWord, setCopiedWord] = useState<string | null>(null);
  /* ── Thesaurus ── */
  const [thesInput, setThesInput] = useState("");
  const [thesLoading, setThesLoading] = useState(false);
  const [thesResult, setThesResult] = useState<ThesResult | null>(null);
  const [thesError, setThesError] = useState<string | null>(null);
  /* ── Source tab ── */
  const [sourceSubTab, setSourceSubTab] = useState<"auto" | "keyword" | "intelligence">("auto");
  const [sourceKeyword, setSourceKeyword] = useState("");
  const [sourceResults, setSourceResults] = useState<SourceResult[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceQuery, setSourceQuery] = useState<string | null>(null);
  const [selectedEditorText, setSelectedEditorText] = useState("");
  const [expandedQuoteUrl, setExpandedQuoteUrl] = useState<string | null>(null);
  const [quoteText, setQuoteText] = useState("");
  const [sourceColors, setSourceColors] = useState<Record<string, string>>({});
  const [sourceModal, setSourceModal] = useState<SourceModalState | null>(null);
  const [contentSelection, setContentSelection] = useState("");

  /* ── Selection tracking (for insert-at-cursor) ── */
  const savedRangeRef = useRef<Range | null>(null);
  const savedEditorElRef = useRef<HTMLElement | null>(null);
  /* ── Bib entry insert ref (populated by FormatterEditorCore) ── */
  const insertBibEntryRef = useRef<((text: string) => void) | null>(null);
  /* ── Snapshot ref (populated by FormatterEditorCore for left-panel humanize) ── */
  const getSnapshotRef = useRef<(() => import("@/services/OrganizerService").ExportDocumentSnapshot) | null>(null);

  /* ── Editor re-init ── */
  const [editorKey, setEditorKey] = useState(0);
  const [coreSnapshot, setCoreSnapshot] = useState<CoreSnapshot>(EMPTY_SNAPSHOT);
  // Editor is always active — users type directly without uploading
  const editorActive = true;

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
          // Capture selected text for Search Intelligence
          const selText = sel.toString().trim();
          if (selText.length > 3) setSelectedEditorText(selText);
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

  /* ── Format Document → re-initialize editor with chosen style ── */
  const applyDocumentWithStyle = useCallback((style: FormatStyleId) => {
    setFormatStyle(style);

    const snap = getSnapshotRef.current?.();
    const allHtml = snap?.pages.map(p => p.html ?? "").join("") ?? "";

    // Parse data-field attributes from current editor HTML to carry over
    // what the user typed into the new format template.
    const extracted: Partial<CoreSnapshot> = {};
    if (allHtml && typeof window !== "undefined") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(allHtml, "text/html");

      const getField = (name: string) =>
        doc.querySelector(`[data-field="${name}"]`)?.textContent?.trim() ?? "";

      // Metadata fields
      const studentName   = getField("studentName");
      const instructorName = getField("instructorName");
      const institutionName = getField("institutionName");
      const courseInfo    = getField("courseInfo");
      const essayDate     = getField("essayDate");
      const essayTitle    = getField("essayTitle");
      const abstract      = getField("abstract");
      const keywords      = getField("keywords");

      if (studentName)    extracted.studentName    = studentName;
      if (instructorName) extracted.instructorName = instructorName;
      if (institutionName) extracted.institutionName = institutionName;
      if (courseInfo)     extracted.courseInfo     = courseInfo;
      if (essayDate)      extracted.essayDate      = essayDate;
      if (essayTitle)     extracted.initialDocTitle = essayTitle;
      if (abstract)       extracted.abstract       = abstract;
      if (keywords)       extracted.keywords       = keywords;

      // Essay body — join all [data-field="essay"] paragraphs as plain text
      const essayParas = Array.from(doc.querySelectorAll('[data-field="essay"]'))
        .map(el => el.textContent?.trim())
        .filter(Boolean);
      if (essayParas.length) extracted.content = essayParas.join("\n\n");
    }

    setCoreSnapshot(prev => ({ ...prev, ...extracted, formatStyle: style }));
    setEditorKey((k) => k + 1);
  }, []);

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

  /* ── Dictionary search ── */
  const searchDictionary = useCallback(async (word: string) => {
    const q = word.trim().toLowerCase();
    if (!q) return;
    setDictLoading(true); setDictError(null); setDictResult(null);
    try {
      const [dictRes, synRes, antRes] = await Promise.all([
        fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`),
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(q)}&max=14`),
        fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(q)}&max=10`),
      ]);

      if (!dictRes.ok) { setDictError("Word not found. Try another spelling."); return; }

      const data = (await dictRes.json()) as DictApiEntry[];
      const dataSyn = synRes.ok ? (await synRes.json()) as ThesWord[] : [];
      const dataAnt = antRes.ok ? (await antRes.json()) as ThesWord[] : [];

      const entry = data[0];
      if (!entry) { setDictError("No results found."); return; }

      const phoneticEntry = entry.phonetics?.find(p => p.audio && p.text) ?? entry.phonetics?.find(p => p.text) ?? null;

      // Collect API-level synonyms/antonyms
      const apiSyn = new Set<string>();
      const apiAnt = new Set<string>();
      entry.meanings?.forEach(m => {
        m.synonyms?.forEach(s => apiSyn.add(s));
        m.antonyms?.forEach(a => apiAnt.add(a));
        m.definitions?.forEach(d => { d.synonyms?.forEach(s => apiSyn.add(s)); d.antonyms?.forEach(a => apiAnt.add(a)); });
      });

      // Prefer API synonyms; fall back to Datamuse if API has none
      const finalSyn = apiSyn.size > 0 ? [...apiSyn].slice(0, 14) : dataSyn.map(w => w.word).slice(0, 14);
      const finalAnt = apiAnt.size > 0 ? [...apiAnt].slice(0, 10) : dataAnt.map(w => w.word).slice(0, 10);

      setDictResult({
        word: entry.word,
        phonetic: phoneticEntry?.text ?? entry.phonetic,
        audioUrl: phoneticEntry?.audio,
        meanings: (entry.meanings ?? []).slice(0, 4).map(m => ({
          partOfSpeech: m.partOfSpeech,
          definitions: (m.definitions ?? []).slice(0, 3).map(d => ({ definition: d.definition, example: d.example })),
        })),
        synonyms: finalSyn,
        antonyms: finalAnt,
      });
    } catch { setDictError("Network error. Please try again."); }
    finally { setDictLoading(false); }
  }, []);

  /* ── Thesaurus search ── */
  const searchThesaurus = useCallback(async (word: string) => {
    const q = word.trim().toLowerCase();
    if (!q) return;
    setThesLoading(true); setThesError(null); setThesResult(null);
    try {
      const [synRes, antRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(q)}&max=40`),
        fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(q)}&max=24`),
      ]);
      const synonyms = (await synRes.json()) as ThesWord[];
      const antonyms = (await antRes.json()) as ThesWord[];
      if (synonyms.length === 0 && antonyms.length === 0) { setThesError("No results found for this word."); return; }
      setThesResult({ word: q, synonyms, antonyms });
    } catch { setThesError("Network error. Please try again."); }
    finally { setThesLoading(false); }
  }, []);

  /* ── Copy word chip ── */
  const copyWord = useCallback((word: string) => {
    navigator.clipboard?.writeText(word).catch(() => {});
    setCopiedWord(word);
    setTimeout(() => setCopiedWord(null), 1200);
  }, []);

  /* ── Source: search ── */
  const runSourceSearch = useCallback(async (mode: "auto" | "keyword" | "intelligence") => {
    const essayText = rawContent.trim() || coreSnapshot.content.trim();
    let topic = "";
    if (mode === "auto") {
      topic = essayText;
      if (topic.length < 50) { setSourceError("Write more essay content before searching."); return; }
    } else if (mode === "keyword") {
      topic = sourceKeyword.trim();
      if (!topic) return;
    } else {
      topic = selectedEditorText.trim();
      if (!topic) { setSourceError("Select some text in your essay first."); return; }
    }

    setSourceLoading(true);
    setSourceError(null);
    setSourceResults([]);
    setSourceColors({});
    setSourceQuery(null);
    setSourceStatus(null);
    setExpandedQuoteUrl(null);

    try {
      const isAuto = mode === "auto";
      const endpoint = isAuto ? "/api/sources/auto-search" : "/api/sources/search";
      const body = isAuto
        ? { essayContent: topic.slice(0, 8000) }
        : { essayTopic: topic, outlines: [], targetCount: 6 };

      const res = await fetchWithUserAuthorization(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Search failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6)) as {
              type: string; source?: SourceResult; message?: string; query?: string;
            };
            if (parsed.type === "source" && parsed.source) {
              setSourceResults((prev) => {
                const idx = prev.length;
                const assignedColor = SOURCE_PALETTE[idx % SOURCE_PALETTE.length]!;
                setSourceColors((c) => ({ ...c, [parsed.source!.url]: assignedColor }));
                return [...prev, parsed.source!];
              });
            } else if (parsed.type === "status") {
              setSourceStatus(parsed.message ?? null);
            } else if (parsed.type === "query") {
              setSourceQuery(parsed.query ?? null);
              setSourceStatus(null);
            } else if (parsed.type === "error") {
              setSourceError(parsed.message ?? "Search failed.");
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSourceLoading(false);
      setSourceStatus(null);
    }
  }, [rawContent, coreSnapshot.content, sourceKeyword, selectedEditorText]);

  /* ── Source: insert quote at cursor ── */
  const insertQuote = useCallback((quote: string, source: SourceResult) => {
    const authorPart = source.author ? source.author.split(",")[0]!.trim() : (source.publisher ?? "Source");
    const yearPart = source.publishedYear ?? "";
    const citation = yearPart ? `(${authorPart}, ${yearPart})` : `(${authorPart})`;
    const insertText = `"${quote.trim()}" ${citation}`;

    const range = savedRangeRef.current;
    const editorEl = savedEditorElRef.current;
    if (range && editorEl && editorActive) {
      editorEl.focus();
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      document.execCommand("insertText", false, insertText);
      showToast("Quote inserted ✓");
    } else {
      navigator.clipboard?.writeText(insertText).catch(() => {});
      showToast(editorActive ? "Click in the document first, then Insert." : "Copied to clipboard ✓");
    }
    setExpandedQuoteUrl(null);
    setQuoteText("");
  }, [editorActive, showToast]);

  /* ── Source: open modal + load all 5 citation styles ── */
  const handleSourceColorChange = useCallback((url: string, color: string) => {
    setSourceColors((prev) => ({ ...prev, [url]: color }));
    setSourceModal((prev) => prev && prev.source.url === url ? { ...prev, color } : prev);
  }, []);

  const openSourceModal = useCallback(async (source: SourceResult, color: string) => {
    setSourceModal({ source, color, citations: {}, citLoading: true, citError: null, activeStyle: currentEssayFormat });
    setContentSelection("");
    const styles: FormatStyleId[] = ["mla", "apa", "chicago", "ieee", "harvard"];
    try {
      const results = await Promise.all(
        styles.map(async (style) => {
          try {
            const res = await fetchWithUserAuthorization("/api/spoonie/citation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                task: "CITATION_FULL",
                input: {
                  style: style.toUpperCase(),
                  url: source.url,
                  title: source.title ?? "",
                  authors: source.author ?? "",
                  year: source.publishedYear ?? "",
                  publisher: source.publisher ?? "",
                },
              }),
            });
            const data = (await res.json()) as { inText?: string; bibliography?: string };
            return { style, inText: data.inText ?? "", bibliography: data.bibliography ?? "" };
          } catch {
            return { style, inText: "", bibliography: "" };
          }
        })
      );
      const citMap: Partial<Record<FormatStyleId, SourceCitStyle>> = {};
      results.forEach((r) => { if (r.inText || r.bibliography) citMap[r.style] = { inText: r.inText, bibliography: r.bibliography }; });
      setSourceModal((prev) => prev ? { ...prev, citations: citMap, citLoading: false } : null);
    } catch {
      setSourceModal((prev) => prev ? { ...prev, citLoading: false, citError: "Could not generate citations." } : null);
    }
  }, [currentEssayFormat]);

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
    opts?: { rephrase?: boolean; readability?: string; purpose?: string; strength?: string },
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
          body: JSON.stringify({ prompt: essayText, rephrase: opts?.rephrase ?? false }),
        });
        const data = (await res.json()) as { result?: string; error?: string };
        if (!res.ok || !data.result) throw new Error(data.error ?? "StealthGPT returned empty result.");
        humanizedText = data.result.trim();
      } else {
        const res = await fetchWithUserAuthorization("/api/humanize/undetectable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: essayText, readability: opts?.readability ?? "University", purpose: opts?.purpose ?? "Essay", strength: opts?.strength ?? "More Human" }),
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

  /* ── Humanize: standalone panel tool (input → output) ── */
  const handlePanelHumanize = useCallback(async () => {
    const text = humInput.trim();
    if (!text) { showToast("Enter text to humanize."); return; }
    setHumPanelLoading(true);
    setHumPanelError(null);
    setHumOutput("");
    try {
      if (humProvider === "StealthGPT") {
        const res = await fetchWithUserAuthorization("/api/humanize/stealthgpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, rephrase: stealthRephrase }),
        });
        const data = (await res.json()) as { result?: string; error?: string };
        if (!res.ok || !data.result) throw new Error(data.error ?? "StealthGPT returned empty result.");
        setHumOutput(data.result.trim());
      } else {
        const res = await fetchWithUserAuthorization("/api/humanize/undetectable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, readability: uaiReadability, purpose: uaiPurpose, strength: uaiStrength }),
        });
        const data = (await res.json()) as { result?: string; output?: string; error?: string };
        const result = data.result ?? data.output ?? "";
        if (!res.ok || !result) throw new Error(data.error ?? "UndetectableAI returned empty result.");
        setHumOutput(result.trim());
      }
    } catch (e) {
      setHumPanelError(e instanceof Error ? e.message : "Humanization failed.");
    } finally {
      setHumPanelLoading(false);
    }
  }, [humInput, humProvider, stealthRephrase, uaiReadability, uaiPurpose, uaiStrength, showToast]);

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
              @keyframes dict-in {
                from { opacity: 0; transform: translateY(12px) scale(0.98); }
                to   { opacity: 1; transform: translateY(0)    scale(1);    }
              }
              @keyframes chip-pop {
                0%   { transform: scale(1); }
                40%  { transform: scale(0.88); }
                100% { transform: scale(1); }
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
              <span style={{ fontSize: '14px' }} className="text-[#e2e8f0]"> Doc Oct</span>
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

            {/* ── Single scrollable column ── */}
            <div className="min-h-0 flex-1 overflow-y-auto">

              {/* ════ 1. HUMANIZER ════ */}
              <div className="border-b border-[#2a2f38] px-3 py-2.5">

                {/* Header */}
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4b5563]">Humanizer</p>
                  {humanizerCredits !== null && (
                    <span className="rounded-full bg-[#1a1f28] px-2 py-0.5 text-[9px] text-[#64748b]">{humanizerCredits} cr</span>
                  )}
                </div>

                {/* Input box */}
                <textarea
                  value={humInput}
                  onChange={(e) => { setHumInput(e.target.value); setHumOutput(""); setHumPanelError(null); }}
                  placeholder="Paste or type text to humanize…"
                  rows={5}
                  className="w-full resize-none rounded-xl border border-[#2a2f38] bg-[#0f1218] px-3 py-2 text-[11px] leading-relaxed text-[#cbd5e1] placeholder-[#374151] outline-none transition focus:border-[#ea4335]/40 focus:ring-1 focus:ring-[#ea4335]/20"
                />

                {/* Provider toggle */}
                <div className="my-2 flex rounded-full bg-[#1a1f28] p-[3px]">
                  {(["StealthGPT", "UndetectableAI"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setHumProvider(p); setHumOutput(""); setHumPanelError(null); }}
                      className={`flex-1 rounded-full py-1 text-[10px] font-semibold transition ${humProvider === p ? "bg-[#ea4335] text-white" : "text-[#64748b] hover:text-[#94a3b8]"}`}
                    >
                      {p === "StealthGPT" ? "StealthGPT" : "Undetectable"}
                    </button>
                  ))}
                </div>

                {/* Provider-specific params */}
                {humProvider === "StealthGPT" ? (
                  <div className="flex items-center justify-between rounded-xl bg-[#1a1f28] px-3 py-2">
                    <span className="text-[10.5px] text-[#94a3b8]">Rephrase mode</span>
                    <button
                      type="button"
                      onClick={() => setStealthRephrase((v) => !v)}
                      className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${stealthRephrase ? "bg-[#ea4335]" : "bg-[#2a2f38]"}`}
                    >
                      <span className={`absolute top-[2px] h-4 w-4 rounded-full bg-white shadow transition-all ${stealthRephrase ? "left-[18px]" : "left-[2px]"}`} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div>
                      <p className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-[#4b5563]">Readability</p>
                      <div className="flex flex-wrap gap-1">
                        {["High School", "University", "Doctorate", "Journalist", "Marketing"].map((v) => (
                          <button key={v} type="button" onClick={() => setUaiReadability(v)}
                            className={`rounded-full px-2 py-[3px] text-[9.5px] font-medium transition ${uaiReadability === v ? "bg-[#ea4335] text-white" : "bg-[#1e252f] text-[#64748b] hover:text-[#94a3b8]"}`}
                          >{v}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-[#4b5563]">Purpose</p>
                      <div className="flex flex-wrap gap-1">
                        {["Essay", "Article", "Marketing", "Story", "Cover Letter", "Report"].map((v) => (
                          <button key={v} type="button" onClick={() => setUaiPurpose(v)}
                            className={`rounded-full px-2 py-[3px] text-[9.5px] font-medium transition ${uaiPurpose === v ? "bg-[#ea4335] text-white" : "bg-[#1e252f] text-[#64748b] hover:text-[#94a3b8]"}`}
                          >{v}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-0.5 text-[9px] font-medium uppercase tracking-wide text-[#4b5563]">Strength</p>
                      <div className="flex flex-wrap gap-1">
                        {["More Human", "Balanced", "More Readable"].map((v) => (
                          <button key={v} type="button" onClick={() => setUaiStrength(v)}
                            className={`rounded-full px-2 py-[3px] text-[9.5px] font-medium transition ${uaiStrength === v ? "bg-[#ea4335] text-white" : "bg-[#1e252f] text-[#64748b] hover:text-[#94a3b8]"}`}
                          >{v}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Humanize button */}
                <button
                  type="button"
                  onClick={() => void handlePanelHumanize()}
                  disabled={humPanelLoading || !humInput.trim()}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ea4335] py-2 text-[11px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {humPanelLoading ? (
                    <>
                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                      Humanizing…
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      Humanize
                    </>
                  )}
                </button>

                {/* Error */}
                {humPanelError && (
                  <p className="mt-2 rounded-xl bg-[#2a1010] px-3 py-2 text-[10.5px] text-[#f87171]">{humPanelError}</p>
                )}

                {/* Output box */}
                {humOutput && (
                  <div className="mt-2.5">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-[#4b5563]">Result</p>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(humOutput);
                          setHumCopied(true);
                          setTimeout(() => setHumCopied(false), 2000);
                        }}
                        className="flex items-center gap-1 rounded-full bg-[#1a1f28] px-2 py-[3px] text-[9.5px] font-medium text-[#64748b] transition hover:text-[#e2e8f0] active:scale-95"
                      >
                        {humCopied ? (
                          <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg><span className="text-[#4ade80]">Copied</span></>
                        ) : (
                          <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</>
                        )}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={humOutput}
                      rows={6}
                      className="w-full resize-none rounded-xl border border-[#2a2f38] bg-[#0a0d11] px-3 py-2 text-[11px] leading-relaxed text-[#94a3b8] outline-none"
                    />
                  </div>
                )}
              </div>

              {/* ════ 3. OCTO THE BOT ════ */}
              <div>
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#ea4335]">Octo the Bot</span>
                </div>

                {/* Tone pills */}
                <div className="overflow-x-auto px-3 pb-2">
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

                {/* Chat messages */}
                <div className="overflow-y-auto px-3 pb-2" style={{ maxHeight: "260px" }}>
                  {!chatStarted ? (
                    <div className="flex flex-col items-center gap-3 py-5 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1f28] ring-1 ring-[#2a2f38]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" fill="#ea4335" opacity="0.12" />
                          <path d="M9 10.5c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.1-.6 2.08-1.5 2.6V15h-3v-1.9C9.6 12.58 9 11.6 9 10.5z" fill="#ea4335" />
                          <rect x="10.25" y="15.5" width="3.5" height="1.25" rx="0.625" fill="#ea4335" />
                          <rect x="10.75" y="17.25" width="2.5" height="1" rx="0.5" fill="#ea4335" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[12px] font-medium text-[#e2e8f0]">Octo is ready</p>
                        <p className="mt-0.5 text-[10px] text-[#4b5563]">{chatTone === "roast" ? "Brace yourself. 💀" : "Ask for a critique."}</p>
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
                    <div className="flex flex-col gap-2.5 pt-1">
                      {chatMessages.map((msg) => (
                        <div key={msg.id} style={{ animation: "chat-msg-in 0.22s ease-out both" }}>
                          <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] px-3 py-2 text-[12px] ${msg.role === "user" ? "rounded-[14px] rounded-br-[4px] bg-[#ea4335] text-white whitespace-pre-wrap break-words leading-relaxed" : "rounded-[14px] rounded-bl-[4px] bg-[#1e252f] text-[#cbd5e1]"}`}>
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
                              <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#64748b]" style={{ animation: `typing-bounce 1.1s ease-in-out ${i * 0.18}s infinite` }} />
                            ))}
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* Input bar */}
                {chatStarted && (
                  <div className="border-t border-[#2a2f38] px-3 py-2.5">
                    <div className="flex items-end gap-1.5">
                      <textarea
                        rows={1}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChat(chatInput); } }}
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
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                      </button>
                    </div>
                  </div>
                )}

                <div className="h-4" />
              </div>

            </div> {/* end single scroll column */}
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
              formatStyle={formatStyle}
              onReformat={(id) => applyDocumentWithStyle(id)}
              canReformat={true}
              getSnapshotRef={getSnapshotRef}
              onBack={onBack}
              onFinish={onFinish ? handleCoreFinish : undefined}
              insertBibEntryRef={insertBibEntryRef}
              abstract={coreSnapshot.abstract}
              keywords={coreSnapshot.keywords}
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
              <span className="text-[13px] font-bold tracking-wide text-[#e2e8f0]">3 · Tools</span>
            </div>

            {/* ── Tab bar ── */}
            <div className="flex flex-shrink-0 border-b border-[#2a2f38]">
              {(["citations", "dictionary", "thesaurus", "source"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRightTab(tab)}
                  className={`relative flex-1 py-2.5 text-[9.5px] font-semibold tracking-wide transition-colors active:scale-[0.97] ${rightTab === tab ? "text-[#f1f5f9]" : "text-[#4b5563] hover:text-[#94a3b8]"}`}
                >
                  {tab === "citations" ? "Citations" : tab === "dictionary" ? "Dictionary" : tab === "thesaurus" ? "Thesaurus" : "Source"}
                  {rightTab === tab && (
                    <span className="absolute bottom-0 left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-[#ea4335]" style={{ animation: "dict-in 0.18s ease-out both" }} />
                  )}
                </button>
              ))}
            </div>

            {/* ══════════════ CITATIONS TAB ══════════════ */}
            {rightTab === "citations" && (
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
                        <button type="button" onClick={() => handleInsertInText(card.inText)} className="flex-shrink-0 rounded-[4px] bg-[#252c38] px-1.5 py-0.5 text-[9px] font-semibold text-[#94a3b8] transition hover:bg-[#2e3647] hover:text-[#e2e8f0]">Insert</button>
                      </div>
                    </div>
                    {/* Bibliography */}
                    <div>
                      <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-[#4b5563]">Bibliography</p>
                      <div className="flex items-start gap-1.5 rounded-[6px] bg-[#0f1218] px-2 py-1.5">
                        <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-[#94a3b8]">{card.bibliography}</p>
                        <button type="button" onClick={() => handleInsertBib(card.bibliography)} className="flex-shrink-0 rounded-[4px] bg-[#252c38] px-1.5 py-0.5 text-[9px] font-semibold text-[#94a3b8] transition hover:bg-[#2e3647] hover:text-[#e2e8f0]">Insert</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
            )} {/* end citations tab */}

            {/* ══════════════ DICTIONARY TAB ══════════════ */}
            {rightTab === "dictionary" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

                {/* Search bar */}
                <div className="flex-shrink-0 border-b border-[#2a2f38] px-3 py-3">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={dictInput}
                      onChange={(e) => setDictInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void searchDictionary(dictInput); }}
                      placeholder="Search a word…"
                      className="min-w-0 flex-1 rounded-xl border border-[#2a2f38] bg-[#0f1218] px-3 py-2 text-[12px] text-[#e2e8f0] placeholder-[#374151] outline-none transition focus:border-[#ea4335]/50"
                    />
                    <button
                      type="button"
                      onClick={() => void searchDictionary(dictInput)}
                      disabled={dictLoading || !dictInput.trim()}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#ea4335] text-white transition hover:bg-[#dc2626] active:scale-[0.92] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:opacity-40"
                    >
                      {dictLoading
                        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      }
                    </button>
                  </div>
                </div>

                {/* Results */}
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">

                  {/* Idle state */}
                  {!dictResult && !dictError && !dictLoading && (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a2f38" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                      <p className="text-[11px] text-[#374151]">Type a word and press Enter</p>
                    </div>
                  )}

                  {/* Error */}
                  {dictError && (
                    <div className="rounded-xl border border-[#3a1f1f] bg-[#1a0f0f] px-3 py-2.5 text-[11px] text-[#f87171]" style={{ animation: "dict-in 0.2s ease-out" }}>
                      {dictError}
                    </div>
                  )}

                  {/* Result */}
                  {dictResult && (
                    <div style={{ animation: "dict-in 0.25s ease-out" }}>

                      {/* Word + phonetic */}
                      <div className="mb-3">
                        <h2 className="text-[20px] font-bold tracking-tight text-[#f1f5f9]">{dictResult.word}</h2>
                        {dictResult.phonetic && (
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-[12px] text-[#64748b]">{dictResult.phonetic}</span>
                            {dictResult.audioUrl && (
                              <button
                                type="button"
                                onClick={() => { try { new Audio(dictResult.audioUrl!).play(); } catch { /* ignore */ } }}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1f28] text-[#ea4335] transition hover:bg-[#ea4335] hover:text-white active:scale-[0.88]"
                                title="Play pronunciation"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="h-px bg-[#1e252f] mb-3" />

                      {/* Meanings */}
                      {dictResult.meanings.map((m, mi) => (
                        <div key={mi} className="mb-4" style={{ animation: `dict-in 0.25s ease-out ${mi * 0.06}s both` }}>

                          {/* Part of speech badge */}
                          <span className="mb-2 inline-block rounded-md bg-[#ea4335]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#ea4335]">
                            {m.partOfSpeech}
                          </span>

                          {/* Definitions */}
                          <ol className="mb-2 flex flex-col gap-1.5 pl-1">
                            {m.definitions.map((d, di) => (
                              <li key={di} className="flex gap-2">
                                <span className="mt-[2px] flex-shrink-0 text-[9px] font-bold text-[#374151]">{di + 1}.</span>
                                <div>
                                  <p className="text-[11px] leading-relaxed text-[#cbd5e1]">{d.definition}</p>
                                  {d.example && (
                                    <p className="mt-0.5 text-[10px] italic leading-relaxed text-[#475569]">"{d.example}"</p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>

                          {mi < dictResult.meanings.length - 1 && <div className="mt-3 h-px bg-[#1a1f28]" />}
                        </div>
                      ))}

                      {/* Synonyms — result level */}
                      {dictResult.synonyms.length > 0 && (
                        <div className="mt-3" style={{ animation: "dict-in 0.28s ease-out 0.15s both" }}>
                          <div className="h-px bg-[#1a1f28] mb-3" />
                          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#374151]">Synonyms</p>
                          <div className="flex flex-wrap gap-1">
                            {dictResult.synonyms.map((w) => (
                              <button key={w} type="button" onClick={() => copyWord(w)}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition active:scale-[0.88] ${copiedWord === w ? "bg-[#ea4335] text-white" : "bg-[#1a1f28] text-[#94a3b8] hover:bg-[#ea4335]/20 hover:text-[#f1f5f9]"}`}
                                style={{ animation: copiedWord === w ? "chip-pop 0.25s ease-out" : undefined }}
                                title="Click to copy"
                              >{w}</button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Antonyms — result level */}
                      {dictResult.antonyms.length > 0 && (
                        <div className="mt-3" style={{ animation: "dict-in 0.28s ease-out 0.22s both" }}>
                          <div className="h-px bg-[#1a1f28] mb-3" />
                          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[#374151]">Antonyms</p>
                          <div className="flex flex-wrap gap-1">
                            {dictResult.antonyms.map((w) => (
                              <button key={w} type="button" onClick={() => copyWord(w)}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition active:scale-[0.88] ${copiedWord === w ? "bg-[#ea4335] text-white" : "bg-[#1a1f28] text-[#f87171] hover:bg-[#ea4335]/20 hover:text-[#fca5a5]"}`}
                                style={{ animation: copiedWord === w ? "chip-pop 0.25s ease-out" : undefined }}
                                title="Click to copy"
                              >{w}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )} {/* end dictionary tab */}

            {/* ══════════════ THESAURUS TAB ══════════════ */}
            {rightTab === "thesaurus" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

                {/* Search bar */}
                <div className="flex-shrink-0 border-b border-[#2a2f38] px-3 py-3">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={thesInput}
                      onChange={(e) => setThesInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void searchThesaurus(thesInput); }}
                      placeholder="Find synonyms…"
                      className="min-w-0 flex-1 rounded-xl border border-[#2a2f38] bg-[#0f1218] px-3 py-2 text-[12px] text-[#e2e8f0] placeholder-[#374151] outline-none transition focus:border-[#ea4335]/50"
                    />
                    <button
                      type="button"
                      onClick={() => void searchThesaurus(thesInput)}
                      disabled={thesLoading || !thesInput.trim()}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#ea4335] text-white transition hover:bg-[#dc2626] active:scale-[0.92] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:opacity-40"
                    >
                      {thesLoading
                        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      }
                    </button>
                  </div>
                </div>

                {/* Results */}
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">

                  {/* Idle */}
                  {!thesResult && !thesError && !thesLoading && (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a2f38" strokeWidth="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      <p className="text-[11px] text-[#374151]">Type a word to find alternatives</p>
                    </div>
                  )}

                  {/* Error */}
                  {thesError && (
                    <div className="rounded-xl border border-[#3a1f1f] bg-[#1a0f0f] px-3 py-2.5 text-[11px] text-[#f87171]" style={{ animation: "dict-in 0.2s ease-out" }}>
                      {thesError}
                    </div>
                  )}

                  {/* Result */}
                  {thesResult && (
                    <div style={{ animation: "dict-in 0.25s ease-out" }}>

                      <h2 className="mb-1 text-[18px] font-bold tracking-tight text-[#f1f5f9]">{thesResult.word}</h2>
                      <p className="mb-3 text-[9px] text-[#374151]">Click any word to copy it</p>

                      {/* Synonyms */}
                      {thesResult.synonyms.length > 0 && (
                        <div className="mb-4">
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-[#374151]">Synonyms</p>
                            <span className="rounded-full bg-[#1a1f28] px-1.5 py-0.5 text-[9px] text-[#4b5563]">{thesResult.synonyms.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {thesResult.synonyms.map((w, i) => (
                              <button
                                key={w.word}
                                type="button"
                                onClick={() => copyWord(w.word)}
                                style={{ animation: `dict-in 0.2s ease-out ${i * 0.018}s both`, ...(copiedWord === w.word ? { animation: "chip-pop 0.25s ease-out" } : {}) }}
                                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition active:scale-[0.88] ${copiedWord === w.word ? "bg-[#ea4335] text-white" : "bg-[#161b23] text-[#94a3b8] ring-1 ring-[#2a2f38] hover:bg-[#ea4335]/15 hover:text-[#f1f5f9] hover:ring-[#ea4335]/30"}`}
                                title="Click to copy"
                              >{w.word}</button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Antonyms */}
                      {thesResult.antonyms.length > 0 && (
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-[#374151]">Antonyms</p>
                            <span className="rounded-full bg-[#1a1f28] px-1.5 py-0.5 text-[9px] text-[#4b5563]">{thesResult.antonyms.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {thesResult.antonyms.map((w, i) => (
                              <button
                                key={w.word}
                                type="button"
                                onClick={() => copyWord(w.word)}
                                style={{ animation: `dict-in 0.2s ease-out ${i * 0.018}s both`, ...(copiedWord === w.word ? { animation: "chip-pop 0.25s ease-out" } : {}) }}
                                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition active:scale-[0.88] ${copiedWord === w.word ? "bg-[#ea4335] text-white" : "bg-[#161b23] text-[#f87171] ring-1 ring-[#2a2f38] hover:bg-[#ea4335]/15 hover:text-[#fca5a5] hover:ring-[#ea4335]/30"}`}
                                title="Click to copy"
                              >{w.word}</button>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              </div>
            )} {/* end thesaurus tab */}

            {/* ══════════════ SOURCE TAB ══════════════ */}
            {rightTab === "source" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

                {/* ── Auth gate ── */}
                {!currentUser ? (
                  <div className="flex flex-col items-center gap-4 px-5 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1a1f28] ring-1 ring-[#2a2f38]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-[#e2e8f0]">Sign in to use Source</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#374151]">Citations, Dictionary &amp; Thesaurus<br/>are free to use</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void AuthService.signInWithGoogle().catch(() => showToast("Sign-in failed."))}
                      className="flex items-center gap-2 rounded-full border border-[#2a2f38] bg-[#1a1f28] px-4 py-2 text-[12px] font-medium text-[#e2e8f0] transition hover:bg-[#252c38] active:scale-[0.97]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      Sign in with Google
                    </button>
                  </div>
                ) : (
                  <>
                    {/* ── Sub-tab pills ── */}
                    <div className="flex-shrink-0 border-b border-[#2a2f38] px-3 py-2.5">
                      <div className="flex rounded-full bg-[#1a1f28] p-0.5">
                        {(["auto", "keyword", "intelligence"] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setSourceSubTab(st)}
                            className={`flex-1 rounded-full py-1.5 text-[9.5px] font-medium transition active:scale-[0.97] ${sourceSubTab === st ? "bg-[#252c38] text-[#e2e8f0] shadow-sm" : "text-[#4b5563] hover:text-[#94a3b8]"}`}
                          >
                            {st === "auto" ? "Auto Search" : st === "keyword" ? "Keyword" : "Intelligence"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Input area ── */}
                    <div className="flex-shrink-0 border-b border-[#2a2f38] px-3 py-3">

                      {sourceSubTab === "auto" && (
                        <div className="flex flex-col gap-2.5">
                          <p className="text-[10.5px] leading-relaxed text-[#475569]">
                            AI reads your essay and finds the most relevant academic sources — no keyword needed.
                          </p>
                          <button
                            type="button"
                            onClick={() => void runSourceSearch("auto")}
                            disabled={sourceLoading}
                            className="flex items-center justify-center gap-2 rounded-full bg-[#ea4335] py-2 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] disabled:opacity-50"
                          >
                            {sourceLoading ? (
                              <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />Searching…</>
                            ) : (
                              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Auto Search</>
                            )}
                          </button>
                        </div>
                      )}

                      {sourceSubTab === "keyword" && (
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={sourceKeyword}
                            onChange={(e) => setSourceKeyword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void runSourceSearch("keyword"); }}
                            placeholder="Search for sources…"
                            disabled={sourceLoading}
                            className="min-w-0 flex-1 rounded-xl border border-[#2a2f38] bg-[#0f1218] px-3 py-2 text-[12px] text-[#e2e8f0] placeholder-[#374151] outline-none transition focus:border-[#ea4335]/50 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => void runSourceSearch("keyword")}
                            disabled={sourceLoading || !sourceKeyword.trim()}
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#ea4335] text-white transition hover:bg-[#dc2626] active:scale-[0.92] disabled:opacity-40"
                          >
                            {sourceLoading
                              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                            }
                          </button>
                        </div>
                      )}

                      {sourceSubTab === "intelligence" && (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10.5px] text-[#475569]">Select any text in your essay to find supporting sources.</p>
                          <div className="min-h-[52px] rounded-xl border border-[#2a2f38] bg-[#0f1218] px-3 py-2">
                            {selectedEditorText
                              ? <p className="line-clamp-3 text-[11px] leading-relaxed text-[#94a3b8]">"{selectedEditorText}"</p>
                              : <p className="text-[11px] italic text-[#374151]">Highlight text in your essay…</p>
                            }
                          </div>
                          <button
                            type="button"
                            onClick={() => void runSourceSearch("intelligence")}
                            disabled={!selectedEditorText || sourceLoading}
                            className="flex items-center justify-center gap-2 rounded-full border border-[#ea4335]/40 bg-[#ea4335]/10 py-2 text-[11px] font-medium text-[#ea4335] transition hover:bg-[#ea4335]/20 active:scale-[0.97] disabled:opacity-40"
                          >
                            {sourceLoading
                              ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#ea4335] border-t-transparent" />Searching…</>
                              : "Search for sources"
                            }
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ── Status bar ── */}
                    {(sourceStatus || sourceQuery) && (
                      <div className="flex-shrink-0 border-b border-[#2a2f38] bg-[#0a0d12] px-3 py-2">
                        {sourceStatus && (
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 animate-spin rounded-full border-2 border-[#4b5563] border-t-transparent" />
                            <span className="text-[10px] text-[#4b5563]">{sourceStatus}</span>
                          </div>
                        )}
                        {sourceQuery && (
                          <div className="text-[10px]">
                            <span className="text-[#374151]">AI query: </span>
                            <span className="text-[#64748b] italic">{sourceQuery}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Results area ── */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">

                      {/* Error */}
                      {sourceError && (
                        <div className="rounded-xl border border-[#3a1f1f] bg-[#1a0f0f] px-3 py-2.5 text-[11px] text-[#f87171]" style={{ animation: "dict-in 0.2s ease-out" }}>
                          {sourceError}
                        </div>
                      )}

                      {/* Idle state */}
                      {!sourceLoading && !sourceError && sourceResults.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-2.5 py-10 text-center">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2a2f38" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          <p className="text-[11px] text-[#2a2f38]">
                            {sourceSubTab === "auto" ? "Press Auto Search to find sources" : sourceSubTab === "keyword" ? "Type a keyword and search" : "Select text in your essay above"}
                          </p>
                        </div>
                      )}

                      {/* Loading skeleton while waiting for first result */}
                      {sourceLoading && sourceResults.length === 0 && (
                        <div className="flex flex-col gap-2">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="rounded-[12px] border border-[#1a1f28] bg-[#0f1218] p-3" style={{ opacity: 1 - i * 0.25 }}>
                              <div className="mb-2 h-2.5 w-14 animate-pulse rounded-full bg-[#1a1f28]" />
                              <div className="mb-1.5 h-3 w-full animate-pulse rounded-full bg-[#1a1f28]" />
                              <div className="h-3 w-2/3 animate-pulse rounded-full bg-[#1a1f28]" />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Source cards */}
                      {sourceResults.map((source, idx) => (
                        <SourceCard
                          key={source.url}
                          source={source}
                          index={idx}
                          color={sourceColors[source.url] ?? SOURCE_PALETTE[idx % SOURCE_PALETTE.length]!}
                          expandedQuoteUrl={expandedQuoteUrl}
                          quoteText={quoteText}
                          setQuoteText={setQuoteText}
                          setExpandedQuoteUrl={setExpandedQuoteUrl}
                          onInsertQuote={insertQuote}
                          onOpenModal={openSourceModal}
                          onColorChange={handleSourceColorChange}
                        />
                      ))}

                      {/* "Finding more…" indicator when sources are already streaming */}
                      {sourceLoading && sourceResults.length > 0 && (
                        <div className="flex items-center gap-2 py-2 text-[10px] text-[#374151]">
                          <span className="h-2 w-2 animate-spin rounded-full border-2 border-[#374151] border-t-transparent" />
                          Finding more sources…
                        </div>
                      )}

                    </div>
                  </>
                )}
              </div>
            )} {/* end source tab */}

          </div>
        </div>

      </div>

      {/* ══ Source Detail Modal ══ */}
      {sourceModal && (() => {
        const { source, color: modalColor, citations, citLoading, citError, activeStyle } = sourceModal;
        const domain = getDomain(source.url);
        const { label: typeLabel } = getSourceType(source.url);
        const activeCit = citations[activeStyle];
        const STYLES: FormatStyleId[] = ["mla", "apa", "chicago", "ieee", "harvard"];
        const STYLE_LABELS: Record<FormatStyleId, string> = { mla: "MLA", apa: "APA", chicago: "Chicago", ieee: "IEEE", harvard: "Harvard" };
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) { setSourceModal(null); setContentSelection(""); } }}
          >
            <div className="flex max-h-[90vh] w-full max-w-[600px] flex-col rounded-[20px] bg-[#13161c] shadow-2xl"
              style={{ border: `1px solid ${modalColor}40`, animation: "editor-enter 0.22s cubic-bezier(0.22,1,0.36,1) both" }}
            >
              {/* Modal header */}
              <div className="flex flex-shrink-0 items-start gap-3 border-b px-5 py-4" style={{ borderColor: `${modalColor}30` }}>
                <span
                  className="mt-[3px] flex-shrink-0 rounded-[5px] px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide"
                  style={{ background: `${modalColor}22`, color: modalColor }}
                >{typeLabel}</span>
                <p className="flex-1 text-[13px] font-semibold leading-snug text-[#e2e8f0]">{source.title || domain}</p>
                <button
                  type="button"
                  onClick={() => { setSourceModal(null); setContentSelection(""); }}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[#4b5563] transition hover:bg-[#1e252f] hover:text-[#94a3b8]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* Scrollable body */}
              <div className="min-h-0 flex-1 overflow-y-auto">

                {/* ── Source info ── */}
                <div className="border-b border-[#1e252f] px-5 py-4">
                  <div className="flex flex-col gap-1.5">
                    {source.author && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-[#374151]">Author</span>
                        <span className="text-[#94a3b8]">{source.author}</span>
                      </div>
                    )}
                    {source.publishedYear && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-[#374151]">Year</span>
                        <span className="text-[#94a3b8]">{source.publishedYear}</span>
                      </div>
                    )}
                    {source.publisher && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-[#374151]">Publisher</span>
                        <span className="text-[#94a3b8]">{source.publisher}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-[#374151]">URL</span>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 truncate text-[#ea4335] hover:underline"
                      >{source.url}</a>
                    </div>
                  </div>
                </div>

                {/* ── Full content ── */}
                <div className="border-b border-[#1e252f] px-5 py-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#374151]">Full Content</span>
                    {contentSelection && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(contentSelection).catch(() => {});
                          setContentSelection("");
                          showToast("Copied ✓");
                        }}
                        className="flex items-center gap-1 rounded-full bg-[#ea4335] px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-[#dc2626] active:scale-[0.95]"
                        style={{ animation: "chip-pop 0.18s ease-out" }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copy selected
                      </button>
                    )}
                  </div>
                  <div
                    className="max-h-[200px] overflow-y-auto rounded-xl border border-[#1e252f] bg-[#0a0d12] px-3 py-2.5 text-[11px] leading-relaxed text-[#64748b]"
                    style={{ userSelect: "text", WebkitUserSelect: "text" }}
                    onMouseUp={() => {
                      const sel = window.getSelection()?.toString().trim() ?? "";
                      setContentSelection(sel.length > 2 ? sel : "");
                    }}
                  >
                    {source.fullContent || "No content available."}
                  </div>
                </div>

                {/* ── Citations ── */}
                <div className="px-5 py-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#374151]">Citations</p>

                  {/* Style pills */}
                  <div className="mb-4 flex gap-1.5 flex-wrap">
                    {STYLES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSourceModal((prev) => prev ? { ...prev, activeStyle: s } : null)}
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold transition active:scale-[0.95] ${activeStyle === s ? "text-white" : "bg-[#1a1f28] text-[#4b5563] hover:text-[#94a3b8]"}`}
                        style={activeStyle === s ? { background: modalColor } : undefined}
                      >
                        {STYLE_LABELS[s]}
                      </button>
                    ))}
                  </div>

                  {/* Loading */}
                  {citLoading && (
                    <div className="flex items-center gap-2 py-4 text-[11px] text-[#4b5563]">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#4b5563] border-t-transparent" />
                      Generating citations for all styles…
                    </div>
                  )}

                  {/* Error */}
                  {citError && !citLoading && (
                    <div className="rounded-xl border border-[#3a1f1f] bg-[#1a0f0f] px-3 py-2.5 text-[11px] text-[#f87171]">{citError}</div>
                  )}

                  {/* Citation boxes */}
                  {!citLoading && activeCit && (
                    <div className="flex flex-col gap-3">
                      {/* In-text */}
                      <div>
                        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-[#374151]">In-text Citation</p>
                        <div className="flex items-start gap-2 rounded-xl border border-[#1e252f] bg-[#0a0d12] px-3 py-2.5">
                          <p className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-[#93c5fd]">{activeCit.inText}</p>
                          <div className="flex flex-shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(activeCit.inText).catch(() => {}); showToast("In-text citation copied ✓"); }}
                              className="rounded-[5px] bg-[#1e252f] px-2 py-0.5 text-[9px] font-semibold text-[#64748b] transition hover:text-[#e2e8f0]"
                            >Copy</button>
                            <button
                              type="button"
                              onClick={() => { handleInsertInText(activeCit.inText); setSourceModal(null); }}
                              className="rounded-[5px] bg-[#ea4335]/20 px-2 py-0.5 text-[9px] font-semibold text-[#ea4335] transition hover:bg-[#ea4335]/30"
                            >Insert</button>
                          </div>
                        </div>
                      </div>
                      {/* Bibliography */}
                      <div>
                        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-[#374151]">Bibliography</p>
                        <div className="flex items-start gap-2 rounded-xl border border-[#1e252f] bg-[#0a0d12] px-3 py-2.5">
                          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-[#94a3b8]">{activeCit.bibliography}</p>
                          <div className="flex flex-shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(activeCit.bibliography).catch(() => {}); showToast("Bibliography copied ✓"); }}
                              className="rounded-[5px] bg-[#1e252f] px-2 py-0.5 text-[9px] font-semibold text-[#64748b] transition hover:text-[#e2e8f0]"
                            >Copy</button>
                            <button
                              type="button"
                              onClick={() => { handleInsertBib(activeCit.bibliography); setSourceModal(null); }}
                              className="rounded-[5px] bg-[#ea4335]/20 px-2 py-0.5 text-[9px] font-semibold text-[#ea4335] transition hover:bg-[#ea4335]/30"
                            >Insert</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* No citation for this style yet */}
                  {!citLoading && !activeCit && !citError && (
                    <p className="text-[11px] text-[#374151]">No citation generated for {STYLE_LABELS[activeStyle]}.</p>
                  )}
                </div>

              </div>
            </div>
          </div>
        );
      })()}

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
