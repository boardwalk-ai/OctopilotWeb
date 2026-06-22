"use client";

/* ══════════════════════════════════════════════════════════════════════════════
   FormatterEditorView — outer wrapper
   Left panel (upload + format) | FormatterEditorCore (editor) | Right panel (citations)
══════════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";
import { AuthService } from "@/services/AuthService";
import { CreditService } from "@/services/CreditService";
import { DocumentService, DocumentLimitError, type DocumentPayload, type DocumentSummary } from "@/services/DocumentService";
import type { ParsedDocumentResult } from "@/app/api/formatter/parse/route";
import type { ExportDocumentSnapshot } from "@/services/OrganizerService";
import type { FormatStyleId } from "./FormatStyleView";
import FormatterEditorCore from "./FormatterEditorCore";
import StoreButton from "@/components/header/StoreButton";
import { LIQUID_GLASS_DISPLACEMENT_MAP } from "./liquidGlassMap";
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
type ChatMode = "chat" | "criticism";

const TONE_META: { id: ToneId; label: string }[] = [
  { id: "roast",       label: "Roast 🔥" },
  { id: "positive",    label: "Positive" },
  { id: "sweet",       label: "Sweet" },
  { id: "neutral",     label: "Neutral" },
  { id: "direct",      label: "Direct" },
  { id: "no_nonsense", label: "No Nonsense" },
];

interface OctoSuggestion { icon: string; title: string; fix: string; }
interface OctoGrammarItem  { title: string; issue: string; fix: string; quote?: string; }
interface OctoStyleItem    { title: string; observation: string; suggestion: string; quote?: string; }

/* Issue-type → highlight color (matches bullet + editor highlight) */
function octoIssueColor(title: string, section: "grammar" | "style"): string {
  const t = title.toLowerCase();
  if (/repeat|repetit|redundan/.test(t)) return "#f59e0b";              // repeated words — amber
  if (/run-on|runon|fragment|comma splice/.test(t)) return "#ef4444";   // run-ons — red
  if (/structure|organi[sz]|flow|transition|order/.test(t)) return "#3b82f6"; // structure — blue
  if (/clarit|clear|vague|confus|wordy/.test(t)) return "#a855f7";      // clarity — purple
  return section === "grammar" ? "#ea4335" : "#8b5cf6";
}
interface OctoRatings      { vocabulary: number; grammar: number; thinking: number; ideas: number; }
interface OctoStructuredResponse {
  type: "critique" | "chat";
  message?: string;
  grammar?: OctoGrammarItem[];
  style?: OctoStyleItem[];
  ratings?: OctoRatings;
  fallbackText?: string;
}

interface AssignmentAnalysis {
  analysis: string;
  essayTopic: string;
  essayType: string;
  scope: string;
  structure: string;
}

/** Serialize an assignment analysis into a compact context string for Octo. */
function serializeAssignment(a: AssignmentAnalysis): string {
  return [
    `Assignment summary: ${a.analysis}`,
    `Topic: ${a.essayTopic}`,
    `Essay type: ${a.essayType}`,
    `Scope: ${a.scope}`,
    `Expected structure: ${a.structure}`,
  ].filter(Boolean).join("\n");
}

/** Build the editor-highlight items from a critique response. */
function critiqueHighlightItems(data: OctoStructuredResponse): { id: string; quote: string; color: string }[] {
  const items: { id: string; quote: string; color: string }[] = [];
  (data.grammar ?? []).forEach((g, i) => {
    if (g.quote?.trim()) items.push({ id: `g-${i}`, quote: g.quote, color: octoIssueColor(g.title, "grammar") });
  });
  (data.style ?? []).forEach((s, i) => {
    if (s.quote?.trim()) items.push({ id: `s-${i}`, quote: s.quote, color: octoIssueColor(s.title, "style") });
  });
  return items;
}
interface ChatMsg { id: string; role: "user" | "assistant"; text: string; suggestions?: OctoSuggestion[]; structured?: OctoStructuredResponse; }

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
interface UploadedFile {
  id: string;
  file: File;
  name: string;
  isImage: boolean;
  previewUrl: string | null;
  // Citation fields
  citTitle: string;
  citAuthor: string;
  citYear: string;
  citPublisher: string;
  // State
  expanded: boolean;
  scanning: boolean;
  scanError: string | null;
  result: SourceResult | null;
}
type SourceCitStyle = { inText: string; bibliography: string };
interface SourceModalState {
  source: SourceResult;
  color: string;
  citations: Partial<Record<FormatStyleId, SourceCitStyle>>;
  citLoading: boolean;
  citError: string | null;
  activeStyle: FormatStyleId;
  suggestions: string[];
  suggestLoading: boolean;
  suggestError: string | null;
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
      parts.push(<strong key={key++} className="font-bold text-[var(--ed-text)]">{match[1]}</strong>);
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
      nodes.push(<p key={key++} className="mt-2 mb-0.5 text-[13px] font-bold text-[var(--ed-text)]">{parseInline(line.slice(4))}</p>);
    } else if (line.startsWith("## ")) {
      nodes.push(<p key={key++} className="mt-2 mb-0.5 text-[14px] font-bold text-[var(--ed-text)]">{parseInline(line.slice(3))}</p>);
    } else if (line.startsWith("# ")) {
      nodes.push(<p key={key++} className="mt-2 mb-1 text-[15px] font-bold text-[var(--ed-text)]">{parseInline(line.slice(2))}</p>);
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
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#4b1a17]">How to improve</p>
      {suggestions.map((s, i) => (
        <div
          key={i}
          className="rounded-[10px] border border-[#ea4335]/30 bg-[var(--ed-bg)] px-2.5 py-2"
          style={{ animation: `chat-msg-in 0.42s ease-out ${0.18 + i * 0.13}s both` }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] leading-none">{s.icon}</span>
            <span className="text-[11.5px] font-semibold text-[#ea4335]">{s.title}</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ed-text-faint)]">{s.fix}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Animated rating bars ──────────────────────────────────────────────────── */
function RatingBars({ ratings }: { ratings: OctoRatings }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setReady(true), 120); return () => clearTimeout(t); }, []);
  const items: { label: string; value: number; color: string }[] = [
    { label: "Vocabulary", value: ratings.vocabulary, color: "#3b82f6" },
    { label: "Grammar",    value: ratings.grammar,    color: "#ea4335" },
    { label: "Thinking",   value: ratings.thinking,   color: "#8b5cf6" },
    { label: "Ideas",      value: ratings.ideas,      color: "#22c55e" },
  ];
  return (
    <div className="mt-2.5 rounded-[10px] border border-[#1a2030] bg-[var(--ed-surface-3)] px-3 py-2.5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Essay Ratings</p>
      <div className="flex flex-col gap-2">
        {items.map(({ label, value, color }) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10.5px] text-[var(--ed-text-dim)]">{label}</span>
              <span className="text-[11px] font-bold" style={{ color }}>
                {value} <span className="text-[9px] font-normal text-[var(--ed-border)]">/ 10</span>
              </span>
            </div>
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-[#1a2030]">
              <div
                className="h-full rounded-full"
                style={{
                  width: ready ? `${value * 10}%` : "0%",
                  background: color,
                  transition: "width 0.85s cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Single expandable critique bullet ─────────────────────────────────────── */
function CritiqueBullet({
  itemId, title, detail1, detail2,
  label1, label2, color, delay, tone, essayCtx,
  hasHighlight, onJump,
}: {
  itemId: string; title: string;
  detail1: string; detail2: string;
  label1: string; label2: string;
  color: string; delay: number;
  tone: ToneId; essayCtx: string;
  hasHighlight?: boolean;
  onJump?: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [reply, setReply] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setLoading(true); setInput(""); setReply("");
    const ctx = `Octo's note: "${title}" — "${detail1}${detail2 ? " / " + detail2 : ""}"\nUser question: ${q}`;
    try {
      const res = await fetchWithUserAuthorization("/api/octobot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: ctx }],
          tone, context: essayCtx, structured: false,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setReply((p) => p + dec.decode(value, { stream: true }));
      }
    } catch { setReply("Something went wrong. Try again."); }
    finally { setLoading(false); }
  };

  return (
    <div
      className="overflow-hidden rounded-[10px] border bg-[var(--ed-bg)]"
      style={{ borderColor: `${color}30`, animation: `chat-msg-in 0.32s ease-out ${delay}s both` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[#161b22] active:bg-[var(--ed-bg-pill)]"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
          className={`flex-shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          style={{ color }}
        >
          <path d="M2 1.5L5.5 4 2 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="flex-1 text-[12px] font-semibold leading-snug" style={{ color }}>{title}</span>
        {hasHighlight && onJump && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onJump(itemId); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onJump(itemId); } }}
            className="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition hover:scale-110 active:scale-95"
            style={{ background: `${color}22`, color }}
            title="Jump to this spot in the document"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
          </span>
        )}
      </button>

      {open && (
        <div className="border-t px-3 pb-3" style={{ borderColor: `${color}18` }}>
          {/* detail 1 (issue / observation) */}
          <div className="mt-2 mb-0.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color }}>{label1}</span>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--ed-text-muted)]">{detail1}</p>
          </div>
          {/* detail 2 (fix / suggestion) */}
          {detail2 && (
            <div className="mt-1.5 mb-1">
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#22c55e]">{label2}</span>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#86efac]">{detail2}</p>
            </div>
          )}

          {/* streaming reply */}
          {reply && (
            <div className="mb-2 mt-2 rounded-[8px] bg-[var(--ed-surface-4)] px-2.5 py-2">
              <p className="text-[11px] leading-relaxed text-[var(--ed-status-text)]">{reply}</p>
            </div>
          )}

          {/* follow-up input */}
          <div className="mt-2 flex items-end gap-1.5">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Ask Octo about this…"
              disabled={loading}
              className="min-h-[30px] flex-1 resize-none rounded-[8px] border border-[var(--ed-border)] bg-[var(--ed-bg-subbar)] px-2.5 py-1.5 text-[12px] text-[var(--ed-text)] placeholder-[var(--ed-border)] outline-none focus:border-[var(--ed-border-2)] disabled:opacity-50"
              style={{ maxHeight: "60px" }}
            />
            <button
              type="button" onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-[#ea4335] text-white transition hover:bg-[#dc2626] active:scale-[0.93] disabled:opacity-40"
            >
              {loading
                ? <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Full critique view ─────────────────────────────────────────────────────── */
function OctoCritiqueView({
  data, tone, essayCtx, onJump,
}: { data: OctoStructuredResponse; tone: ToneId; essayCtx: string; onJump?: (id: string) => void }) {
  if (data.fallbackText || (data.type === "chat" && data.message)) {
    const text = data.message ?? data.fallbackText ?? "";
    return (
      <div className="rounded-[14px] rounded-bl-[4px] bg-[var(--ed-surface-4)] px-3 py-2 text-[13px] text-[var(--ed-status-text)]">
        <OctoMarkdown text={text} />
      </div>
    );
  }

  const grammar = data.grammar ?? [];
  const style   = data.style   ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* Grammar section */}
      {grammar.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#ea4335]">
            Grammar
          </p>
          <div className="flex flex-col gap-1.5">
            {grammar.map((item, i) => (
              <CritiqueBullet
                key={i} itemId={`g-${i}`}
                title={item.title}
                detail1={item.issue}
                detail2={item.fix}
                label1="Issue" label2="Fix"
                color={octoIssueColor(item.title, "grammar")}
                delay={i * 0.06}
                tone={tone} essayCtx={essayCtx}
                hasHighlight={Boolean(item.quote)}
                onJump={onJump}
              />
            ))}
          </div>
        </div>
      )}

      {/* Writing Style section */}
      {style.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8b5cf6]">
            Writing Style
          </p>
          <div className="flex flex-col gap-1.5">
            {style.map((item, i) => (
              <CritiqueBullet
                key={i} itemId={`s-${i}`}
                title={item.title}
                detail1={item.observation}
                detail2={item.suggestion}
                label1="Observation" label2="Suggestion"
                color={octoIssueColor(item.title, "style")}
                delay={(grammar.length + i) * 0.06}
                tone={tone} essayCtx={essayCtx}
                hasHighlight={Boolean(item.quote)}
                onJump={onJump}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rating bars */}
      {data.ratings && <RatingBars ratings={data.ratings} />}
    </div>
  );
}

/* ── Reusable Octo chat panel (used in left panel + expanded mode) ──────────── */
interface OctoChatPanelProps {
  chatTone: ToneId;
  setChatTone: (t: ToneId) => void;
  chatStarted: boolean;
  chatMessages: ChatMsg[];
  chatLoading: boolean;
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: (text: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  essayCtx: string;
  onJump: (id: string) => void;
  chatMode: ChatMode;
  setChatMode: (m: ChatMode) => void;
  /** "panel" = compact left-panel sizing, "expanded" = full-height side view */
  variant: "panel" | "expanded";
}
function OctoChatPanel({
  chatTone, setChatTone, chatStarted, chatMessages, chatLoading,
  chatInput, setChatInput, sendChat, chatEndRef, essayCtx, onJump,
  chatMode, setChatMode, variant,
}: OctoChatPanelProps) {
  const expanded = variant === "expanded";
  return (
    <div className={`flex min-h-0 flex-col ${expanded ? "min-h-0 flex-1" : ""}`}>
      {/* Tone pills */}
      <div className="overflow-x-auto px-3 pb-2 pt-1 flex-shrink-0">
        <div className="flex gap-1.5 pb-0.5">
          {TONE_META.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setChatTone(t.id)}
              className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition active:scale-[0.95] ${chatTone === t.id ? "bg-[#ea4335] text-white" : "bg-[var(--ed-bg-pill)] text-[var(--ed-text-faint)] hover:bg-[var(--ed-surface-4)] hover:text-[var(--ed-text-muted)]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      <div
        className={`overflow-y-auto px-3 pb-2 ${expanded ? "min-h-0 flex-1" : ""}`}
        style={expanded ? undefined : { maxHeight: "260px" }}
      >
        {!chatStarted ? (
          <div className="flex flex-col items-center gap-3 py-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ed-bg-pill)] ring-1 ring-[var(--ed-border)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#ea4335" opacity="0.12" />
                <path d="M9 10.5c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.1-.6 2.08-1.5 2.6V15h-3v-1.9C9.6 12.58 9 11.6 9 10.5z" fill="#ea4335" />
                <rect x="10.25" y="15.5" width="3.5" height="1.25" rx="0.625" fill="#ea4335" />
                <rect x="10.75" y="17.25" width="2.5" height="1" rx="0.5" fill="#ea4335" />
              </svg>
            </div>
            <div>
              <p className="text-[13px] font-medium text-[var(--ed-text)]">Octo is ready</p>
              <p className="mt-0.5 text-[11px] text-[var(--ed-text-dim)]">{chatTone === "roast" ? "Brace yourself. 💀" : "Ask for a critique."}</p>
            </div>
            <button
              type="button"
              onClick={() => void sendChat("Yo Octo, criticize my essay")}
              className="rounded-full border border-[#ea4335]/40 bg-[#ea4335]/10 px-4 py-2 text-[12px] font-medium text-[#ea4335] transition hover:bg-[#ea4335]/20 active:scale-[0.97]"
            >
              &quot;Yo Octo, criticize my essay&quot;
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-1">
            {chatMessages.map((msg) => (
              <div key={msg.id} style={{ animation: "chat-msg-in 0.22s ease-out both" }}>
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-[14px] rounded-br-[4px] bg-[#ea4335] px-3 py-2 text-[13px] text-white whitespace-pre-wrap break-words leading-relaxed">
                      {msg.text}
                    </div>
                  </div>
                ) : msg.structured ? (
                  <OctoCritiqueView
                    data={msg.structured}
                    tone={chatTone}
                    essayCtx={essayCtx}
                    onJump={onJump}
                  />
                ) : (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-[14px] rounded-bl-[4px] bg-[var(--ed-surface-4)] px-3 py-2 text-[13px] text-[var(--ed-status-text)]">
                      <OctoMarkdown text={msg.text} />
                    </div>
                  </div>
                )}
                {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
                  <SuggestionCards suggestions={msg.suggestions} />
                )}
              </div>
            ))}
            {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start" style={{ animation: "chat-msg-in 0.22s ease-out both" }}>
                <div className="flex items-center gap-1 rounded-[14px] rounded-bl-[4px] bg-[var(--ed-surface-4)] px-3 py-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--ed-text-faint)]" style={{ animation: `typing-bounce 1.1s ease-in-out ${i * 0.18}s infinite` }} />
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
        <div className="border-t border-[var(--ed-border)] px-3 py-2.5 flex-shrink-0">
          {/* Mode switch — translucent glass segmented pill (iOS style) */}
          <div className="mb-2 flex justify-center">
            <div
              className="glass-chip flex gap-0.5 rounded-full p-0.5"
              style={{ borderRadius: 9999 }}
            >
              {(["chat", "criticism"] as ChatMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setChatMode(m)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition active:scale-[0.96] ${chatMode === m ? "bg-[#ea4335] text-white shadow-sm" : "text-[var(--ed-text-faint)] hover:text-[var(--ed-text)]"}`}
                >
                  {m === "chat" ? "Chat" : "Criticize"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-1.5">
            <textarea
              rows={1}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChat(chatInput); } }}
              placeholder={chatMode === "criticism" ? "Ask Octo to criticize…" : "Message Octo…"}
              disabled={chatLoading}
              className="min-h-[34px] flex-1 resize-none rounded-[10px] border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-2 text-[13px] text-[var(--ed-text)] placeholder-[var(--ed-text-label)] outline-none focus:border-[var(--ed-border-2)] disabled:opacity-50"
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
    </div>
  );
}

/* ── Left-panel Octo mini preview (read-only, click to open the window) ──────── */
function OctoMiniPreview({
  chatStarted, chatMessages, chatTone, onOpen, onCriticize,
}: {
  chatStarted: boolean;
  chatMessages: ChatMsg[];
  chatTone: ToneId;
  onOpen: () => void;
  onCriticize: () => void;
}) {
  const summarize = (m: ChatMsg): string => {
    if (m.role === "user") return m.text;
    if (m.structured?.type === "critique") {
      const g = m.structured.grammar?.length ?? 0;
      const s = m.structured.style?.length ?? 0;
      return `Critique — ${g} grammar, ${s} style note${s === 1 ? "" : "s"}`;
    }
    return m.structured?.message ?? m.text ?? "";
  };

  return (
    <div className="flex h-full flex-col px-3 pb-3">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
        className="group flex min-h-0 flex-1 cursor-pointer flex-col overflow-hidden rounded-[14px] border border-[var(--ed-border)] bg-[var(--ed-surface-2)] transition hover:border-[var(--ed-border-2)]"
        title="Open Octo the Bot"
      >
        {/* header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--ed-border)] px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#ea4335]">Octo the Bot</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--ed-text-dim)] transition group-hover:text-[var(--ed-text-muted)]"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </div>

        {/* read-only live preview — fills available height */}
        {!chatStarted ? (
          <div className="pointer-events-none flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-3 py-2 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ed-bg-pill)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#ea4335" opacity="0.12" />
                <path d="M9 10.5c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.1-.6 2.08-1.5 2.6V15h-3v-1.9C9.6 12.58 9 11.6 9 10.5z" fill="#ea4335" />
                <rect x="10.25" y="15.5" width="3.5" height="1.25" rx="0.625" fill="#ea4335" />
              </svg>
            </div>
            <p className="text-[12px] font-medium text-[var(--ed-text)]">Octo is ready</p>
            <p className="text-[10.5px] text-[var(--ed-text-dim)]">{chatTone === "roast" ? "Brace yourself. 💀" : "Ask for a critique."}</p>
          </div>
        ) : (
          <div
            className="pointer-events-none flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-3 py-2.5"
            style={{ maskImage: "linear-gradient(to bottom, transparent, #000 18%)" }}
          >
            {chatMessages.slice(-8).map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[88%] truncate rounded-[8px] px-2 py-1 text-[11px] ${m.role === "user" ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-4)] text-[var(--ed-text-muted)]"}`}>
                  {summarize(m)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Criticize button — submits + opens the window */}
      <button
        type="button"
        onClick={onCriticize}
        className="mt-2 w-full flex-shrink-0 rounded-full border border-[#ea4335]/40 bg-[#ea4335]/10 px-4 py-2 text-[12px] font-medium text-[#ea4335] transition hover:bg-[#ea4335]/20 active:scale-[0.98]"
      >
        &quot;Yo Octo, criticize my essay&quot;
      </button>
    </div>
  );
}

/* ── Outline card (title + tag hue + glass bullets) ──────────────────────────── */
interface OutlineData { type: string; title: string; description: string; bullets: string[] }

type RestoredPage = { content: string; textAlign?: "left" | "center" | "right" | "justify"; centerVertically?: boolean; showPageNumber?: boolean; lineHeight?: number };

/** Full document state persisted in documents.state (JSONB) — restored verbatim. */
interface SavedState {
  v?: number;
  formatStyle?: FormatStyleId;
  onboardingTopic?: string;
  rawContent?: string;
  assignmentAnalysis?: AssignmentAnalysis | null;
  analyzedTopic?: string;
  outlines?: OutlineData[];
  sourceResults?: SourceResult[];
  citCards?: CitationCard[];
  sourceColors?: Record<string, string>;
  snapshot?: ExportDocumentSnapshot | null;
}
function outlineTagColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("introduction")) return "#3b82f6"; // blue
  if (t.includes("conclusion")) return "#0d9488";   // teal
  return "#f59e0b";                                  // body — amber
}
function OutlineCard({ o, index, onRemove, onUpdate }: {
  o: OutlineData; index: number;
  onRemove?: () => void;
  onUpdate?: (updated: OutlineData) => void;
}) {
  const hue = outlineTagColor(o.type);
  const editable = Boolean(onUpdate);
  const setBullet = (i: number, val: string) => onUpdate?.({ ...o, bullets: o.bullets.map((b, j) => (j === i ? val : b)) });
  const removeBullet = (i: number) => onUpdate?.({ ...o, bullets: o.bullets.filter((_, j) => j !== i) });
  const addBullet = () => onUpdate?.({ ...o, bullets: [...o.bullets, ""] });

  const grow = { fieldSizing: "content" } as React.CSSProperties;
  return (
    <div className="group rounded-2xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] p-3.5" style={{ animation: `chat-msg-in 0.3s ease-out ${index * 0.04}s both` }}>
      {/* Tag row */}
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className="glass-chip rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: `${hue}26`, borderColor: `${hue}59`, color: hue }}
        >{o.type}</span>
        {onRemove && (
          <button type="button" title="Remove section" onClick={onRemove}
            className="flex-shrink-0 rounded-full p-1 text-[var(--ed-text-dim)] opacity-0 transition hover:text-[var(--ed-text)] group-hover:opacity-100">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
      {/* Title — on its own line below the tag, wraps freely */}
      {editable ? (
        <textarea
          rows={1}
          value={o.title}
          onChange={(e) => onUpdate?.({ ...o, title: e.target.value })}
          placeholder="Section title…"
          style={grow}
          className="mb-2.5 w-full resize-none overflow-hidden break-words bg-transparent text-[14px] font-semibold leading-snug text-[var(--ed-text)] placeholder-[var(--ed-text-label)] outline-none"
        />
      ) : (
        <p className="mb-2.5 break-words text-[14px] font-semibold leading-snug text-[var(--ed-text)]">{o.title}</p>
      )}

      {/* Bullets */}
      <div className="flex flex-col gap-1.5">
        {o.bullets.map((b, i) => (
          <div key={i} className="glass-chip group/b flex items-start gap-2 rounded-xl px-2.5 py-1.5">
            <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: hue }} />
            {editable ? (
              <>
                <textarea
                  rows={1}
                  value={b}
                  onChange={(e) => setBullet(i, e.target.value)}
                  placeholder="Add a point…"
                  style={grow}
                  className="min-w-0 flex-1 resize-none overflow-hidden break-words bg-transparent py-[1px] text-[12px] leading-relaxed text-[var(--ed-text-muted)] placeholder-[var(--ed-text-label)] outline-none"
                />
                <button type="button" title="Remove point" onClick={() => removeBullet(i)}
                  className="mt-[3px] flex-shrink-0 text-[var(--ed-text-dim)] opacity-0 transition hover:text-[var(--ed-text)] group-hover/b:opacity-100">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </>
            ) : (
              <span className="break-words text-[12px] leading-relaxed text-[var(--ed-text-muted)]">{b}</span>
            )}
          </div>
        ))}
        {editable && (
          <button type="button" onClick={addBullet}
            className="flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-[11px] font-medium text-[var(--ed-text-dim)] transition hover:text-[var(--ed-text)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Add point
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Full-viewport wizard shell (welcome / setup / analysis) ─────────────────── */
const WIZARD_STEPS = ["Topic", "Setup", "Analysis"] as const;
function WizardShell({
  step, eyebrow, headline, onBack, exiting, scroll, children,
}: {
  step: 1 | 2 | 3;
  eyebrow: string;
  headline: React.ReactNode;
  onBack?: () => void;
  exiting: boolean;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div data-theme="dark" className={`absolute inset-0 flex flex-col bg-[#0a0c11] lg:flex-row ${exiting ? "cinematic-exit" : "cinematic-enter"}`}>
      {/* ── LEFT BRAND RAIL ── */}
      <aside className="relative flex shrink-0 flex-col justify-between overflow-hidden border-b border-white/10 bg-gradient-to-b from-[#0e1016] to-[#08090d] p-8 lg:h-full lg:w-[44%] lg:border-b-0 lg:border-r lg:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #ea4335 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #7f1d1d 0%, transparent 70%)", filter: "blur(70px)" }} />
        <span className="pointer-events-none absolute -bottom-16 right-2 select-none text-[200px] font-black leading-none text-white/[0.03] lg:text-[280px]">0{step}</span>

        {/* logo */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white ring-2 ring-[#ea4335]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/OCTOPILOT.png" alt="Octopilot" className="h-6 w-6 object-contain" />
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.22em] text-white/50">Octopilot · Doc&nbsp;Oct</span>
        </div>

        {/* eyebrow + display headline */}
        <div className="relative z-10 my-10 lg:my-0">
          <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.34em] text-[#ea4335]">{eyebrow}</p>
          <h1 className="text-[clamp(34px,5vw,58px)] font-bold leading-[1.04] tracking-tight text-white">{headline}</h1>
        </div>

        {/* step tracker */}
        <div className="relative z-10 flex items-center gap-2.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2.5">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold transition ${n === step ? "bg-[#ea4335] text-white shadow-[0_0_16px_rgba(234,67,53,0.6)]" : n < step ? "bg-white/15 text-white/70" : "border border-white/15 text-white/30"}`}>
                {n < step ? "✓" : n}
              </span>
              {n < 3 && <span className={`h-px w-7 ${n < step ? "bg-[#ea4335]/50" : "bg-white/10"}`} />}
            </div>
          ))}
          <span className="ml-2 text-[12px] font-medium text-white/35">{WIZARD_STEPS[step - 1]}</span>
        </div>
      </aside>

      {/* ── RIGHT CONTENT ── */}
      <main className={`relative flex min-h-0 flex-1 flex-col ${scroll ? "overflow-y-auto" : "overflow-hidden"} p-8 sm:p-12 lg:p-16`}>
        {onBack && (
          <button type="button" onClick={onBack}
            className="ob-item mb-8 flex w-fit flex-shrink-0 items-center gap-1.5 text-[13px] text-white/40 transition hover:text-white/70" style={{ animationDelay: "0ms" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
            Back
          </button>
        )}
        <div className={`flex w-full max-w-xl flex-1 flex-col ${scroll ? "" : "justify-center"} ${scroll ? "" : "my-auto"}`}>
          {children}
        </div>
      </main>
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
  onAddToBib: (source: SourceResult) => void;
  bibAdding: boolean;
}
function SourceCard({ source, index, color, expandedQuoteUrl, quoteText, setQuoteText, setExpandedQuoteUrl, onInsertQuote, onOpenModal, onColorChange, onAddToBib, bibAdding }: SourceCardProps) {
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
        background: "var(--ed-surface-2)",
        animation: `dict-in 0.38s ease-out ${index * 0.10}s both`,
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
              className="mt-[2px] flex-shrink-0 rounded-[4px] px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-wide"
              style={{ background: `${color}22`, color }}
            >{typeLabel}</span>
            <p className="line-clamp-2 flex-1 text-[12px] font-semibold leading-snug text-[var(--ed-status-text)]">
              {source.title || domain}
            </p>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ed-text-label)" strokeWidth="2" strokeLinecap="round" className="mt-[2px] flex-shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </div>
          <div className="mb-1 flex flex-wrap items-center gap-1 text-[10.5px] text-[var(--ed-text-dim)]">
            {authorShort && <span>{authorShort}</span>}
            {authorShort && source.publishedYear && <span>·</span>}
            {source.publishedYear && <span>{source.publishedYear}</span>}
            {(authorShort || source.publishedYear) && source.publisher && <span>·</span>}
            {source.publisher && <span className="text-[var(--ed-text-label)]">{source.publisher.slice(0, 28)}</span>}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-[var(--ed-border)]">
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
              className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition hover:text-white active:scale-[0.95]"
              style={{ borderColor: `${color}40`, color }}
            >
              Quote
            </button>
          )}

          {/* One-click: add this source to the Works Cited / Bibliography page */}
          {!isExpanded && (
            <button
              type="button"
              onClick={() => { setPickerOpen(false); onAddToBib(source); }}
              disabled={bibAdding}
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition hover:text-white active:scale-[0.95] disabled:opacity-50"
              style={{ borderColor: `${color}40`, color }}
              title="Generate citation and add to bibliography page"
            >
              {bibAdding ? (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              )}
              Bib
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
                className="absolute bottom-6 right-0 z-20 flex flex-wrap gap-1 rounded-[10px] border border-[var(--ed-border)] bg-[var(--ed-surface-5)] p-2 shadow-xl"
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
                <label className="relative flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-[var(--ed-border)] text-[9px] text-[var(--ed-text-faint)] hover:bg-[var(--ed-text-label)]" title="Custom color">
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
              className="w-full resize-none rounded-xl border border-[var(--ed-border)] bg-[var(--ed-surface-5)] px-2.5 py-2 text-[12px] text-[var(--ed-text)] placeholder-[var(--ed-text-label)] outline-none"
              style={{ borderColor: `${color}40` }}
            />
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setExpandedQuoteUrl(null)}
                className="flex-1 rounded-full border border-[var(--ed-border)] py-1.5 text-[11px] text-[var(--ed-text-dim)] transition hover:text-[var(--ed-text-muted)] active:scale-[0.96]"
              >Cancel</button>
              <button
                type="button"
                onClick={() => onInsertQuote(quoteText, source)}
                disabled={!quoteText.trim()}
                className="flex-1 rounded-full py-1.5 text-[11px] font-semibold text-white transition active:scale-[0.96] disabled:opacity-40"
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
  return { label: "Web", color: "var(--ed-text-dim)" };
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
  // ── Panel widths (0 = collapsed) ──
  const LEFT_DEFAULT = 260;
  const RIGHT_DEFAULT = 320;
  const LEFT_SNAPS  = [0, LEFT_DEFAULT];
  const RIGHT_SNAPS = [0, RIGHT_DEFAULT];
  const [leftWidth,  setLeftWidth]  = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);
  const [panelResizing, setPanelResizing] = useState(false);
  const leftOpen  = leftWidth  > 0;
  const rightOpen = rightWidth > 0;

  /* ── Editor theme (light / dark) — source of truth for the whole editor ── */
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const stored = window.localStorage.getItem("dococt-editor-theme");
      return stored === "light" || stored === "dark" ? stored : "dark";
    } catch { return "dark"; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("dococt-editor-theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((p) => (p === "dark" ? "light" : "dark")), []);

  /* ── Octo expanded (side-by-side with editor) ── */
  const OCTO_PANEL_W = 440;
  const [octoExpanded, setOctoExpanded] = useState(false);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const priorWidthsRef = useRef<{ left: number; right: number } | null>(null);

  const openOctoExpanded = useCallback(() => {
    // Remember current panel widths, collapse both, then expand Octo
    priorWidthsRef.current = { left: leftWidth, right: rightWidth };
    setLeftWidth(0);
    setRightWidth(0);
    setOctoExpanded(true);
  }, [leftWidth, rightWidth]);

  const closeOctoExpanded = useCallback(() => {
    setOctoExpanded(false);
    // Restore the panels the user had open before expanding
    const prior = priorWidthsRef.current;
    if (prior) {
      setLeftWidth(prior.left);
      setRightWidth(prior.right);
      priorWidthsRef.current = null;
    }
  }, []);

  /* ── Format style ── */
  const [formatStyle, setFormatStyle] = useState<FormatStyleId>("mla");

  /* ── Paraphraser panel ── */
  const [humProvider, setHumProvider] = useState<"StealthGPT" | "UndetectableAI">("StealthGPT");
  const [stealthRephrase, setStealthRephrase] = useState(false);
  const [stealthEducation, setStealthEducation] = useState("Standard");
  const [stealthStrength, setStealthStrength] = useState("Medium");
  const [stealthDetector, setStealthDetector] = useState("GPTZero");
  const [uaiReadability, setUaiReadability] = useState("University");
  const [uaiPurpose, setUaiPurpose] = useState("Essay");
  const [uaiStrength, setUaiStrength] = useState("More Human");
  const [humInput, setHumInput] = useState("");
  const [humOutput, setHumOutput] = useState("");
  const [humPanelLoading, setHumPanelLoading] = useState(false);
  const [humPanelError, setHumPanelError] = useState<string | null>(null);
  const [humCopied, setHumCopied] = useState(false);

  /* ── Onboarding flow ── */
  const [viewState, setViewState] = useState<"welcome" | "setup" | "analysis" | "editor">("welcome");
  const [viewExiting, setViewExiting] = useState(false);
  const [onboardingTopic, setOnboardingTopic] = useState("");
  const [onboardingFormat, setOnboardingFormat] = useState<FormatStyleId>("mla");

  /* ── Assignment analysis (Hein) — shown on the analysis page, fed to Octo ── */
  const [assignmentAnalysis, setAssignmentAnalysis] = useState<AssignmentAnalysis | null>(null);
  const [analyzedTopic, setAnalyzedTopic] = useState("");  // the topic the current analysis was generated from
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  /* ── Outlines (optional, generated on the analysis page) ── */
  const [outlines, setOutlines] = useState<{ type: string; title: string; description: string; bullets: string[] }[]>([]);
  const [outlinesLoading, setOutlinesLoading] = useState(false);
  // Outline mode UI: which sub-control is open + Build My Way fields
  const [outlineMode, setOutlineMode] = useState<null | "single" | "build">(null);
  const [buildType, setBuildType] = useState<"Introduction" | "Body Paragraph" | "Conclusion">("Introduction");
  const [buildTitle, setBuildTitle] = useState("");

  const analyzeAssignment = useCallback(async (textArg?: string) => {
    const text = (textArg ?? "").trim();
    if (!text || assignmentLoading) return;
    setAssignmentLoading(true);
    setAssignmentError(null);
    try {
      const res = await fetchWithUserAuthorization("/api/hein/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: text }),
      });
      const data = await res.json() as AssignmentAnalysis & { error?: string };
      if (!res.ok || !data.analysis) throw new Error(data.error ?? "Analysis failed");
      setAssignmentAnalysis(data);
      setAnalyzedTopic(text);
      setOutlines([]);  // old outlines belong to the previous topic
    } catch {
      setAssignmentError("Couldn't analyze the assignment. Try again.");
    } finally {
      setAssignmentLoading(false);
    }
  }, [assignmentLoading]);

  const runOutline = useCallback(async (
    mode: "auto" | "build" | "single",
    requestedType?: string,
    customTitle?: string,
  ) => {
    if (!assignmentAnalysis || outlinesLoading) return;
    setOutlinesLoading(true);
    try {
      const res = await fetchWithUserAuthorization("/api/lily/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: assignmentAnalysis.analysis,
          essayTopic: assignmentAnalysis.essayTopic,
          essayType: assignmentAnalysis.essayType,
          scope: assignmentAnalysis.scope,
          structure: assignmentAnalysis.structure,
          mode,
          requestedType,
          customTitle,
          count: mode === "auto" ? 5 : undefined,
          bullets: true,
        }),
      });
      const data = await res.json() as { outlines?: { type: string; title: string; description: string; bullets?: string[] }[] };
      const items = (data.outlines ?? []).map((o) => ({
        type: o.type, title: o.title, description: o.description ?? "", bullets: o.bullets ?? [],
      }));
      // Auto replaces the whole set; build/single append a single paragraph.
      if (mode === "auto") setOutlines(items);
      else setOutlines((prev) => [...prev, ...items]);
      setOutlineMode(null);
      setBuildTitle("");
    } catch {
      /* non-blocking — outlines are optional */
    } finally {
      setOutlinesLoading(false);
    }
  }, [assignmentAnalysis, outlinesLoading]);

  // When the analysis page opens, run Hein — but only if we don't already have
  // an analysis for THIS topic (so a new prompt re-analyzes; the same prompt
  // reuses the cache and doesn't waste credits).
  useEffect(() => {
    const topic = onboardingTopic.trim();
    const stale = !assignmentAnalysis || analyzedTopic !== topic;
    if (viewState === "analysis" && stale && !assignmentLoading && topic) {
      void analyzeAssignment(topic);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState]);

  // Cache the assignment analysis + outline (+ the topic it belongs to) in
  // localStorage so a reload restores them instead of re-running the AI.
  const wizardCacheLoaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dococt-wizard-cache");
      if (raw) {
        const cached = JSON.parse(raw) as { assignmentAnalysis?: AssignmentAnalysis | null; outlines?: OutlineData[]; analyzedTopic?: string };
        if (cached.assignmentAnalysis) setAssignmentAnalysis(cached.assignmentAnalysis);
        if (Array.isArray(cached.outlines)) setOutlines(cached.outlines);
        if (typeof cached.analyzedTopic === "string") setAnalyzedTopic(cached.analyzedTopic);
      }
    } catch { /* ignore */ }
    wizardCacheLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!wizardCacheLoaded.current) return;  // don't overwrite before restore
    try {
      localStorage.setItem("dococt-wizard-cache", JSON.stringify({ assignmentAnalysis, outlines, analyzedTopic }));
    } catch { /* ignore */ }
  }, [assignmentAnalysis, outlines, analyzedTopic]);

  /* ── Citation state ── */
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
  const [chatMode, setChatMode] = useState<ChatMode>("criticism");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

  /* ── Right tab ── */
  const [rightTab, setRightTab] = useState<"citations" | "dictionary" | "thesaurus" | "source" | "paraphraser">("citations");
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
  const [sourceSubTab, setSourceSubTab] = useState<"auto" | "keyword" | "intelligence" | "uploads">("auto");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
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
  const [autoSuggest, setAutoSuggest] = useState(true);
  const [autoHumanize, setAutoHumanize] = useState(true);
  // Citation cache keyed by source URL — avoids re-fetching on modal reopen
  const citCacheRef = useRef<Record<string, Partial<Record<FormatStyleId, SourceCitStyle>>>>({});
  // Suggestion cache keyed by source URL — avoids re-generating on modal reopen
  const suggestCacheRef = useRef<Record<string, string[]>>({});

  /* ── Selection tracking (for insert-at-cursor) ── */
  const savedRangeRef = useRef<Range | null>(null);
  const savedEditorElRef = useRef<HTMLElement | null>(null);
  /* ── Bib entry insert ref (populated by FormatterEditorCore) ── */
  const insertBibEntryRef = useRef<((text: string) => void) | null>(null);
  /* ── Octo critique highlight refs (populated by FormatterEditorCore) ── */
  const octoHighlightRef = useRef<((items: { id: string; quote: string; color: string }[]) => number) | null>(null);
  const octoJumpRef = useRef<((id: string) => void) | null>(null);
  /* ── Snapshot ref (populated by FormatterEditorCore for left-panel humanize) ── */
  const getSnapshotRef = useRef<(() => import("@/services/OrganizerService").ExportDocumentSnapshot) | null>(null);

  /* ── Editor re-init ── */
  const [editorKey, setEditorKey] = useState(0);
  const [coreSnapshot, setCoreSnapshot] = useState<CoreSnapshot>(EMPTY_SNAPSHOT);
  // Editor is always active — users type directly without uploading
  const editorActive = true;

  /* ── Save Deck: per-document save state ── */
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [restoredPages, setRestoredPages] = useState<RestoredPage[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deckDocs, setDeckDocs] = useState<DocumentSummary[]>([]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [docLimit, setDocLimit] = useState(10);
  // Whether Firebase has reported initial auth state — gates the home view so
  // the logged-out welcome doesn't flash before the Save Deck for signed-in users.
  const [authChecked, setAuthChecked] = useState(false);
  // Branded boot loader: real progress through auth → plan/deck fetch → ready.
  const [booted, setBooted] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const deckLoadedOnceRef = useRef(false);
  const lastSavedRef = useRef<string>("");
  const savingRef = useRef(false);
  const currentDocIdRef = useRef<string | null>(null);
  useEffect(() => { currentDocIdRef.current = currentDocId; }, [currentDocId]);

  /* ── Refs ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const leftDragRef  = useRef<{ startX: number; startW: number } | null>(null);
  const rightDragRef = useRef<{ startX: number; startW: number } | null>(null);
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

  /* ── Onboarding: cinematic transition ── */
  const transitionTo = useCallback((next: "welcome" | "setup" | "analysis" | "editor", opts?: { topic?: string; style?: FormatStyleId }) => {
    setViewExiting(true);
    setTimeout(() => {
      if (opts?.style) {
        setFormatStyle(opts.style);
        setCoreSnapshot((prev) => ({ ...prev, formatStyle: opts.style! }));
      }
      if (opts?.topic !== undefined) setOnboardingTopic(opts.topic);
      setViewState(next);
      setViewExiting(false);
    }, 480);
  }, []);

  /* ── Save Deck: serialize → save (auto every 10s on change + Ctrl+S) ── */
  const buildSavePayload = useCallback((): DocumentPayload => {
    const snap = getSnapshotRef.current?.() ?? null;
    const wordCount = snap
      ? snap.pages.reduce((n, p) => n + (p.plainText || "").split(/\s+/).filter(Boolean).length, 0)
      : 0;
    const preview = ((snap?.pages.map((p) => p.plainText).join(" ")) || rawContent || "")
      .replace(/\s+/g, " ").trim().slice(0, 160);
    const title = (snap?.title || onboardingTopic || "Untitled document").trim();
    const state: SavedState = {
      v: 1, formatStyle, onboardingTopic, rawContent,
      assignmentAnalysis, analyzedTopic, outlines,
      sourceResults, citCards, sourceColors, snapshot: snap,
    };
    return {
      title,
      format_style: formatStyle,
      word_count: wordCount,
      preview,
      state,
      sources: sourceResults.map((s) => ({ source_ref: s.url, title: s.title, url: s.url, content: s.fullContent })),
      outlines: outlines.map((o) => ({ type: o.type, title: o.title, bullets: o.bullets.map((b) => ({ text: b })) })),
    };
  }, [formatStyle, onboardingTopic, rawContent, assignmentAnalysis, analyzedTopic, outlines, sourceResults, citCards, sourceColors]);

  const saveNow = useCallback(async (opts?: { force?: boolean }) => {
    if (savingRef.current) return;
    if (!AuthService.getCurrentUser()) return;        // signed-in users only
    let payload: DocumentPayload;
    try { payload = buildSavePayload(); } catch { return; }
    if (payload.word_count === 0 && !opts?.force) return;   // nothing meaningful yet
    const serialized = JSON.stringify(payload);
    if (!opts?.force && serialized === lastSavedRef.current) return;  // unchanged → skip
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      if (!currentDocIdRef.current) {
        const id = await DocumentService.create(payload);
        setCurrentDocId(id);
      } else {
        await DocumentService.save(currentDocIdRef.current, payload);
      }
      lastSavedRef.current = serialized;
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      if (e instanceof DocumentLimitError) showToast(e.message);
    } finally {
      savingRef.current = false;
    }
  }, [buildSavePayload, showToast]);

  // Autosave: every 10s while editing, save if anything changed (overwrite).
  useEffect(() => {
    if (viewState !== "editor") return;
    const t = setInterval(() => { void saveNow(); }, 10_000);
    return () => clearInterval(t);
  }, [viewState, saveNow]);

  // Manual save: Ctrl/Cmd+S saves the exact current state immediately.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveNow({ force: true });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveNow]);

  // Open a saved document → rehydrate every field + the exact editor pages.
  const openDocument = useCallback(async (id: string) => {
    try {
      const doc = await DocumentService.load(id);
      const st = (doc.state || {}) as SavedState;
      setFormatStyle((st.formatStyle as FormatStyleId) || (doc.format_style as FormatStyleId) || "mla");
      setOnboardingTopic(st.onboardingTopic || "");
      setRawContent(st.rawContent || "");
      setAssignmentAnalysis(st.assignmentAnalysis ?? null);
      setAnalyzedTopic(st.analyzedTopic || "");
      setOutlines(Array.isArray(st.outlines) ? st.outlines : []);
      setSourceResults(Array.isArray(st.sourceResults) ? st.sourceResults : []);
      setCitCards(Array.isArray(st.citCards) ? st.citCards : []);
      setSourceColors(st.sourceColors || {});
      const snap = st.snapshot ?? null;
      if (snap?.pages?.length) {
        setRestoredPages(snap.pages.map((p) => ({
          content: p.html, textAlign: p.textAlign, centerVertically: p.centerVertically,
          showPageNumber: p.showPageNumber, lineHeight: p.lineHeight,
        })));
        setCoreSnapshot((prev) => ({ ...prev, initialDocTitle: snap.title || prev.initialDocTitle, content: "" }));
      } else {
        setRestoredPages(null);
      }
      setCurrentDocId(id);
      lastSavedRef.current = "";
      setEditorKey((k) => k + 1);
      transitionTo("editor");
    } catch {
      showToast("Couldn't open that document.");
    }
  }, [transitionTo, showToast]);

  // Load the Save Deck's recent documents.
  const refreshDeck = useCallback(async () => {
    if (!AuthService.getCurrentUser()) return;
    setDeckLoading(true);
    try {
      const { documents, limit } = await DocumentService.list();
      setDeckDocs(documents);
      setDocLimit(limit);
    } catch { /* ignore */ }
    finally { setDeckLoading(false); deckLoadedOnceRef.current = true; }
  }, []);

  // Start a fresh document from a template → setup wizard. "none" = Blank
  // (format left unselected so the user picks it).
  const startNewDocument = useCallback((style: FormatStyleId | null) => {
    if (deckDocs.length >= docLimit) {
      showToast(`You've reached your ${docLimit}-document limit. Delete one to start a new paper.`);
      return;
    }
    setCurrentDocId(null);
    setRestoredPages(null);
    lastSavedRef.current = "";
    setSaveStatus("idle");
    setOutlines([]);
    setAssignmentAnalysis(null);
    setAnalyzedTopic("");
    setCoreSnapshot(EMPTY_SNAPSHOT);
    // Blank (null) → wizard with no format forced; otherwise pre-select it.
    if (style) { setFormatStyle(style); transitionTo("setup", { style }); }
    else transitionTo("setup");
  }, [transitionTo, deckDocs.length, docLimit, showToast]);

  // Refresh the deck whenever the signed-in user lands on the home view.
  useEffect(() => {
    if (viewState === "welcome" && currentUser) void refreshDeck();
  }, [viewState, currentUser, refreshDeck]);

  // Boot loader progress — eases toward a target set by real milestones:
  // engine start → auth resolved → plan/deck fetched → ready.
  useEffect(() => {
    if (booted) return;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setBootProgress((prev) => {
        const elapsed = Date.now() - startedAt;
        let target = elapsed > 220 ? 36 : 20;                                   // engine starting
        if (authChecked) target = currentUser ? 64 : 90;                        // warming up
        if (authChecked && (!currentUser || deckLoadedOnceRef.current)) target = 100; // ready
        const next = prev + Math.max(0.5, (target - prev) * 0.12);
        return Math.min(next, target);
      });
    }, 28);
    return () => clearInterval(tick);
  }, [booted, authChecked, currentUser]);

  // Once progress reaches the top, hold a beat then reveal the app.
  useEffect(() => {
    if (booted || bootProgress < 99.4) return;
    const t = setTimeout(() => setBooted(true), 460);
    return () => clearTimeout(t);
  }, [booted, bootProgress]);

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
      setAuthChecked(true);
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

  /* ── Panel resize: global mouse events ── */
  useEffect(() => {
    const SNAP_R = 44; // px radius for magnetic snap

    function snap(value: number, checkpoints: number[]): number {
      let best = value, bestDist = Infinity;
      for (const cp of checkpoints) {
        const d = Math.abs(value - cp);
        if (d < bestDist) { bestDist = d; best = cp; }
      }
      return bestDist <= SNAP_R ? best : value;
    }

    const onMove = (e: MouseEvent) => {
      const maxW = Math.floor(window.innerWidth / 2) - 40;
      // Auto-layout switching: once a panel is dragged "wide" (past ~38% of the
      // viewport) the opposite panel auto-collapses so the editor never gets
      // squeezed between two large panels.
      const AUTO_COLLAPSE = Math.floor(window.innerWidth * 0.38);
      if (leftDragRef.current) {
        const raw = Math.max(0, Math.min(
          leftDragRef.current.startW + (e.clientX - leftDragRef.current.startX), maxW
        ));
        const next = snap(raw, LEFT_SNAPS);
        setLeftWidth(next);
        if (next >= AUTO_COLLAPSE) setRightWidth(0);
      }
      if (rightDragRef.current) {
        const raw = Math.max(0, Math.min(
          rightDragRef.current.startW + (rightDragRef.current.startX - e.clientX), maxW
        ));
        const next = snap(raw, RIGHT_SNAPS);
        setRightWidth(next);
        if (next >= AUTO_COLLAPSE) setLeftWidth(0);
      }
    };

    const onUp = () => {
      if (leftDragRef.current || rightDragRef.current) {
        leftDragRef.current  = null;
        rightDragRef.current = null;
        document.body.style.cursor     = "";
        document.body.style.userSelect = "";
        setPanelResizing(false);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const pagesHtml = snap?.pages.map(p => p.html ?? "") ?? [];

    // Carry over what the user typed into the new format template.
    // Tagged elements (data-field) are metadata/essay from a previous format
    // pass; untagged block elements are user-typed content that must NOT be
    // dropped (fresh editors have no tags at all).
    const extracted: Partial<CoreSnapshot> = {};
    if (pagesHtml.length && typeof window !== "undefined") {
      const parser = new DOMParser();
      const essayParas: string[] = [];
      const bibEntries: string[] = [];
      const meta: Record<string, string> = {};

      const isPlaceholder = (t: string) => {
        const low = t.toLowerCase();
        return low.includes("add your references here")
          || low.includes("write your abstract here")
          || low.includes("keyword1, keyword2");
      };

      for (const html of pagesHtml) {
        const doc = parser.parseFromString(html, "text/html");

        // References page → re-capture entries so user edits survive reformat
        if (doc.querySelector("[data-reference-heading]")) {
          doc.body.querySelectorAll("p").forEach((p) => {
            if (p.hasAttribute("data-reference-heading")) return;
            const t = p.textContent?.trim() ?? "";
            if (!t || isPlaceholder(t)) return;
            bibEntries.push(t.replace(/^\[\d+\]\s*/, ""));
          });
          continue;
        }

        for (const el of Array.from(doc.body.children)) {
          const t = el.textContent?.trim() ?? "";
          const field = el.getAttribute("data-field");
          if (field && field !== "essay") {
            if (!t || isPlaceholder(t) || meta[field]) continue;
            // Strip the rendered "Keywords:" label so it doesn't double up
            meta[field] = field === "keywords" ? t.replace(/^keywords:\s*/i, "") : t;
          } else if (t) {
            // data-field="essay" OR untagged user-typed paragraph
            essayParas.push(t);
          }
        }
      }

      if (meta.studentName)     extracted.studentName     = meta.studentName;
      if (meta.instructorName)  extracted.instructorName  = meta.instructorName;
      if (meta.institutionName) extracted.institutionName = meta.institutionName;
      if (meta.courseInfo)      extracted.courseInfo      = meta.courseInfo;
      if (meta.essayDate)       extracted.essayDate       = meta.essayDate;
      if (meta.essayTitle)      extracted.initialDocTitle = meta.essayTitle;
      if (meta.abstract)        extracted.abstract        = meta.abstract;
      if (meta.keywords)        extracted.keywords        = meta.keywords;
      if (essayParas.length)    extracted.content         = essayParas.join("\n\n");
      if (bibEntries.length)    extracted.bibliography    = bibEntries.join("\n");

      // Last-resort fallback: never lose typed text
      if (!essayParas.length) {
        const plain = snap?.pages.map(p => p.plainText).join("\n\n").trim() ?? "";
        if (plain) extracted.content = plain;
      }
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

  /* ── Serialize a ChatMsg for history (structured responses → readable text) ── */
  const serializeMsgForHistory = useCallback((m: ChatMsg): string => {
    if (m.role === "user") return m.text;
    if (!m.structured) return m.text;
    const d = m.structured;
    if (d.type === "chat" && d.message) return d.message;
    if (d.fallbackText) return d.fallbackText;
    if (d.type === "critique") {
      const parts: string[] = [];
      if (d.grammar?.length) parts.push("Grammar: " + d.grammar.map((i) => `${i.title} — ${i.issue} | Fix: ${i.fix}`).join("; "));
      if (d.style?.length)   parts.push("Style: "   + d.style.map((i)   => `${i.title} — ${i.observation} | Suggestion: ${i.suggestion}`).join("; "));
      if (d.ratings) parts.push(`Ratings — Vocab: ${d.ratings.vocabulary}/10, Grammar: ${d.ratings.grammar}/10, Thinking: ${d.ratings.thinking}/10, Ideas: ${d.ratings.ideas}/10`);
      return parts.join("\n") || "[Essay critique]";
    }
    return m.text || "[Response]";
  }, []);

  /* ── Octo bot: send message ── */
  const sendChat = useCallback(async (text: string, modeOverride?: ChatMode) => {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    const mode = modeOverride ?? chatMode;

    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", text: trimmed };
    const assistantId = crypto.randomUUID();

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatStarted(true);
    setChatLoading(true);

    try {
      // Always pass essay as context — prefer live editor snapshot, fall back to parsed/raw
      const liveSnap = getSnapshotRef.current?.();
      const liveText = liveSnap?.pages.map(p => p.plainText).join("\n\n").trim() ?? "";
      const essayCtx = liveText || rawContent.trim() || coreSnapshot.content.trim();
      const history = [...chatMessages, userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: serializeMsgForHistory(m),
      }));

      const res = await fetchWithUserAuthorization("/api/octobot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history, tone: chatTone, context: essayCtx, structured: true, mode,
          assignment: assignmentAnalysis ? serializeAssignment(assignmentAnalysis) : undefined,
        }),
      });

      if (!res.ok) throw new Error("Request failed.");

      const data = await res.json() as OctoStructuredResponse;
      setChatMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "", structured: data }]);

      // Highlight critique quotes directly in the document (Grammarly-style) —
      // optional: only when the user has highlighting enabled.
      if (data.type === "critique" && highlightEnabled) {
        const items = critiqueHighlightItems(data);
        if (items.length) requestAnimationFrame(() => octoHighlightRef.current?.(items));
      }
    } catch {
      setChatMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "assistant",
        text: "Hmm, something went wrong. Try again? 😅",
      }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMessages, chatTone, chatMode, highlightEnabled, assignmentAnalysis, coreSnapshot.content, rawContent, serializeMsgForHistory]);

  /* ── Octo: toggle document highlighting (optional) ── */
  const toggleHighlight = useCallback(() => {
    setHighlightEnabled((prev) => {
      const next = !prev;
      if (!next) {
        octoHighlightRef.current?.([]);  // clear existing highlights
      } else {
        // re-apply from the most recent critique in the conversation
        const lastCritique = [...chatMessages].reverse().find((m) => m.structured?.type === "critique");
        if (lastCritique?.structured) {
          const items = critiqueHighlightItems(lastCritique.structured);
          if (items.length) requestAnimationFrame(() => octoHighlightRef.current?.(items));
        }
      }
      return next;
    });
  }, [chatMessages]);

  /* ── Octo: criticize action (forces criticism mode, submits, opens window) ── */
  const criticizeNow = useCallback(() => {
    setChatMode("criticism");
    void sendChat("Yo Octo, criticize my essay", "criticism");
    openOctoExpanded();
  }, [sendChat, openOctoExpanded]);

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
      // Prefer the onboarding topic — if present, use it directly (no AI analysis needed).
      // Fall back to essay content analysis if no topic was specified.
      if (!onboardingTopic && essayText.length < 50) {
        setSourceError("Specify a topic in onboarding or write more essay content first.");
        return;
      }
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
      // Auto mode: send topic if available (skips AI analysis step),
      //            otherwise send essay content for AI-driven query generation.
      const body = isAuto
        ? (onboardingTopic
            ? { essayTopic: onboardingTopic }
            : { essayContent: essayText.slice(0, 8000) })
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
  }, [rawContent, coreSnapshot.content, sourceKeyword, selectedEditorText, onboardingTopic]);

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

  /* ── Uploads: add files ── */
  const handleAddUploadFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const ACCEPTED = /\.(pdf|jpe?g|png|webp|heic|heif|avif|gif)$/i;
    Array.from(files).forEach((file) => {
      if (!ACCEPTED.test(file.name)) {
        showToast(`${file.name} — unsupported format`);
        return;
      }
      const isImage = /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(file.name);
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      const id = crypto.randomUUID();
      setUploadedFiles((prev) => [
        ...prev,
        {
          id, file, name: file.name, isImage, previewUrl,
          citTitle: file.name.replace(/\.[^.]+$/, ""),
          citAuthor: "", citYear: "", citPublisher: "",
          expanded: true, scanning: false, scanError: null, result: null,
        },
      ]);
    });
  }, [showToast]);

  /* ── Uploads: scan a file → create SourceResult ── */
  const handleScanUpload = useCallback(async (id: string) => {
    const uf = uploadedFiles.find((f) => f.id === id);
    if (!uf || uf.scanning) return;

    setUploadedFiles((prev) =>
      prev.map((f) => f.id === id ? { ...f, scanning: true, scanError: null } : f)
    );

    try {
      const form = new FormData();
      form.append("file", uf.file);
      const res = await fetchWithUserAuthorization("/api/sources/upload-scan", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { fullContent?: string; error?: string };
      if (!res.ok || !data.fullContent) throw new Error(data.error ?? "Scan failed.");

      const sourceResult: SourceResult = {
        url: `upload://${id}`,
        title: uf.citTitle || uf.name,
        author: uf.citAuthor || undefined,
        publishedYear: uf.citYear || undefined,
        publisher: uf.citPublisher || undefined,
        fullContent: data.fullContent,
      };

      setUploadedFiles((prev) =>
        prev.map((f) => f.id === id ? { ...f, scanning: false, result: sourceResult } : f)
      );

      // Add to source results + assign a color
      setSourceResults((prev) => {
        const idx = prev.length;
        const color = SOURCE_PALETTE[idx % SOURCE_PALETTE.length]!;
        setSourceColors((c) => ({ ...c, [sourceResult.url]: color }));
        return [...prev, sourceResult];
      });

      showToast("Source created ✓");
    } catch (err) {
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, scanning: false, scanError: err instanceof Error ? err.message : "Scan failed." } : f
        )
      );
    }
  }, [uploadedFiles, showToast]);

  const openSourceModal = useCallback(async (source: SourceResult, color: string) => {
    const cached = citCacheRef.current[source.url];
    setSourceModal({
      source, color,
      citations: cached ?? {},
      citLoading: !cached,
      citError: null,
      activeStyle: currentEssayFormat,
      suggestions: suggestCacheRef.current[source.url] ?? [],
      suggestLoading: false,
      suggestError: null,
    });
    setContentSelection("");

    // Fetch citations only if not cached
    if (!cached) {
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
        citCacheRef.current[source.url] = citMap;
        setSourceModal((prev) => prev ? { ...prev, citations: citMap, citLoading: false } : null);
      } catch {
        setSourceModal((prev) => prev ? { ...prev, citLoading: false, citError: "Could not generate citations." } : null);
      }
    }
  }, [currentEssayFormat]);

  /* ── Source suggest: generate one continuation sentence ── */
  const fetchSuggestion = useCallback(async () => {
    setSourceModal((prev) => prev ? { ...prev, suggestLoading: true, suggestError: null } : null);
    try {
      const modal = sourceModal;
      if (!modal) return;
      const liveSnap = getSnapshotRef.current?.();
      const essayCtx = liveSnap?.pages.map(p => p.plainText).join("\n\n").trim() ?? rawContent.trim();
      const res = await fetchWithUserAuthorization("/api/sources/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceContent: modal.source.fullContent,
          sourceTitle: modal.source.title,
          sourceUrl: modal.source.url,
          essayContext: essayCtx,
          humanize: autoHumanize,
          inTextCitation: modal.citations[modal.activeStyle]?.inText ?? "",
          citationStyle: modal.activeStyle,
        }),
      });
      const data = await res.json() as { suggestion?: string; error?: string };
      if (!res.ok || !data.suggestion) throw new Error(data.error ?? "No suggestion");
      setSourceModal((prev) => {
        if (!prev) return null;
        const updated = [...prev.suggestions, data.suggestion!];
        suggestCacheRef.current[prev.source.url] = updated;
        return { ...prev, suggestions: updated, suggestLoading: false };
      });
    } catch {
      setSourceModal((prev) => prev ? { ...prev, suggestLoading: false, suggestError: "Could not generate suggestion." } : null);
    }
  }, [sourceModal, autoHumanize, rawContent]);

  // Auto-fetch first suggestion when modal opens
  useEffect(() => {
    if (autoSuggest && sourceModal && !sourceModal.citLoading && sourceModal.suggestions.length === 0 && !sourceModal.suggestLoading) {
      void fetchSuggestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceModal?.source.url, sourceModal?.citLoading, autoSuggest]);

  /* ── Source card: one-click add to Works Cited / Bibliography ── */
  const [bibAddingUrl, setBibAddingUrl] = useState<string | null>(null);
  const handleAddSourceToBib = useCallback(async (source: SourceResult) => {
    if (bibAddingUrl) return;
    const style = currentEssayFormat;

    // Use cached citation if the modal already generated one for this style
    const cached = citCacheRef.current[source.url]?.[style]?.bibliography;
    let bibliography = cached ?? "";

    if (!bibliography) {
      setBibAddingUrl(source.url);
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
        bibliography = data.bibliography ?? "";
        if (bibliography) {
          citCacheRef.current[source.url] = {
            ...citCacheRef.current[source.url],
            [style]: { inText: data.inText ?? "", bibliography },
          };
        }
      } catch {
        // fall through to error toast below
      } finally {
        setBibAddingUrl(null);
      }
    }

    if (!bibliography) { showToast("Could not generate citation. Try again."); return; }

    if (insertBibEntryRef.current) {
      insertBibEntryRef.current(bibliography);
      showToast("Added to bibliography ✓");
    } else {
      navigator.clipboard?.writeText(bibliography).catch(() => {});
      showToast("Citation copied — format a document to insert.");
    }
  }, [bibAddingUrl, currentEssayFormat, showToast]);

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
          body: JSON.stringify({
            prompt: text,
            rephrase: stealthRephrase,
            educationLevel: stealthEducation,
            strength: stealthStrength,
            detector: stealthDetector,
          }),
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
  }, [humInput, humProvider, stealthRephrase, stealthEducation, stealthStrength, stealthDetector, uaiReadability, uaiPurpose, uaiStrength, showToast]);

  /* ── Parse status ── */
  function renderParseStatus() {
    if (parseStatus.kind === "idle" || !rawContent.trim()) return null;
    if (parseStatus.kind === "parsing") return (
      <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#1e2530] px-2 py-1.5 text-[12px] text-[var(--ed-text-muted)]">
        <span className="inline-block h-2 w-2 animate-spin rounded-full border-2 border-[var(--ed-text-muted)] border-t-transparent" />
        <span>Analysing document…</span>
      </div>
    );
    if (parseStatus.kind === "done") return (
      <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#0d2218] px-2 py-1.5 text-[12px] text-[#4ade80]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg>
        <span>Structure analysed by AI</span>
      </div>
    );
    if (parseStatus.kind === "error") return (
      <div className="mt-2 flex items-center gap-1.5 rounded-[6px] bg-[#1e1208] px-2 py-1.5 text-[12px] text-[#fbbf24]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /></svg>
        <span>{parseStatus.message}</span>
      </div>
    );
    return null;
  }

  /* ── Render ── */
  return (
    <div ref={fmtRootRef} data-theme={theme} className="fmt-root flex h-screen flex-col overflow-hidden bg-[var(--ed-bg-canvas)]">

      {/* ── Branded boot loader — covers the app while auth + plan + deck load ── */}
      {!booted && (() => {
        const pct = Math.min(100, Math.round(bootProgress));
        const stage = pct < 40 ? "Doc Oct Engine is starting" : pct < 82 ? "Warming up" : "Entering";
        const R = 52, C = 2 * Math.PI * R;
        return (
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
            style={{
              background: "radial-gradient(120% 90% at 50% 18%, #11151f 0%, #080b11 55%, #05070b 100%)",
              opacity: pct >= 100 ? 0 : 1,
              transition: "opacity 0.5s ease",
              pointerEvents: pct >= 100 ? "none" : "auto",
            }}
          >
            <style>{`
              @keyframes octopilot-char-scan { 0%{color:#ff2200;transform:scale(1)}8%{color:#ffb199;transform:scale(1.34)}22%{color:#ff2200;transform:scale(1)}100%{color:#ff2200;transform:scale(1)} }
              @keyframes bl-rise { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
              @keyframes bl-aurora { 0%,100%{transform:translate(-6%,-4%) rotate(0deg)} 50%{transform:translate(6%,4%) rotate(8deg)} }
              @keyframes bl-aurora2 { 0%,100%{transform:translate(5%,3%) scale(1)} 50%{transform:translate(-5%,-3%) scale(1.15)} }
              @keyframes bl-shine { 0%{transform:translateX(-130%)} 100%{transform:translateX(420%)} }
              @keyframes bl-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
              @keyframes bl-spin { to{transform:rotate(360deg)} }
              @keyframes bl-grid { from{background-position:0 0} to{background-position:0 38px} }
            `}</style>

            {/* faint moving dot-grid */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
              backgroundSize: "38px 38px", animation: "bl-grid 6s linear infinite",
            }} />
            {/* aurora glows */}
            <div className="pointer-events-none absolute -left-[12%] top-[8%] h-[42vmax] w-[42vmax] rounded-full" style={{ background: "radial-gradient(circle,rgba(234,67,53,0.22),transparent 62%)", filter: "blur(40px)", animation: "bl-aurora 12s ease-in-out infinite" }} />
            <div className="pointer-events-none absolute -right-[14%] bottom-[2%] h-[46vmax] w-[46vmax] rounded-full" style={{ background: "radial-gradient(circle,rgba(124,58,237,0.16),transparent 64%)", filter: "blur(48px)", animation: "bl-aurora2 15s ease-in-out infinite" }} />
            {/* vignette */}
            <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 240px 60px rgba(0,0,0,0.65)" }} />

            <div className="relative flex flex-col items-center px-8">
              {/* Octopilot Doc Oct wordmark — header char-scan, scaled up */}
              <div style={{ animation: "bl-rise 0.8s cubic-bezier(0.22,1,0.36,1) both", filter: "drop-shadow(0 6px 30px rgba(255,34,0,0.28))" }}>
                <span className="font-extrabold italic tracking-tight leading-none">
                  <span style={{ fontSize: "clamp(40px,8vw,84px)", color: "#ff2200" }}>
                    {"Octopilot".split("").map((char, i) => (
                      <span key={i} style={{ display: "inline-block", animation: "octopilot-char-scan 2.4s linear infinite", animationDelay: `${(i / 9) * 2.4}s` }}>{char}</span>
                    ))}
                  </span>
                  <span style={{ fontSize: "clamp(26px,5.2vw,54px)" }} className="ml-2 text-white"> Doc Oct</span>
                </span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.62em] text-white/25" style={{ animation: "bl-rise 0.8s ease 0.1s both" }}>Academic Formatter Engine</p>

              {/* Progress — circular ring + percentage, with a glowing arc */}
              <div className="relative mt-14 flex items-center justify-center" style={{ width: 168, height: 168, animation: "bl-rise 0.8s cubic-bezier(0.22,1,0.36,1) 0.15s both" }}>
                <svg width="168" height="168" viewBox="0 0 120 120" className="absolute -rotate-90">
                  <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
                  <circle cx="60" cy="60" r={R} fill="none" stroke="url(#blgrad)" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 0.14s linear", filter: "drop-shadow(0 0 6px rgba(255,80,55,0.9))" }} />
                  <defs>
                    <linearGradient id="blgrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#ff2200" /><stop offset="100%" stopColor="#ff8a7a" />
                    </linearGradient>
                  </defs>
                </svg>
                {/* spinning tick accent */}
                <div className="absolute" style={{ width: 168, height: 168, animation: "bl-spin 3.2s linear infinite" }}>
                  <span className="absolute left-1/2 top-[6px] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#ff5a3c]" style={{ boxShadow: "0 0 8px #ff5a3c" }} />
                </div>
                <div className="flex items-end tabular-nums">
                  <span className="text-[48px] font-black leading-none text-white">{pct}</span>
                  <span className="mb-1.5 text-[18px] font-bold text-white/35">%</span>
                </div>
              </div>

              {/* slim bar with shimmer */}
              <div className="relative mt-9 h-[3px] w-[min(380px,68vw)] overflow-hidden rounded-full bg-white/[0.06]" style={{ animation: "bl-rise 0.8s ease 0.2s both" }}>
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#ff2200,#ff8a7a)", transition: "width 0.14s linear", boxShadow: "0 0 12px rgba(255,60,40,0.8)" }} />
                <div className="absolute inset-y-0 w-1/4" style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)", animation: "bl-shine 1.7s ease-in-out infinite" }} />
              </div>

              {/* stage label */}
              <div className="mt-7 flex items-center gap-2.5" style={{ animation: "bl-rise 0.8s ease 0.25s both" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff2200]" style={{ animation: "bl-blink 1.1s ease-in-out infinite", boxShadow: "0 0 8px #ff2200" }} />
                <p key={stage} className="text-[13.5px] font-medium tracking-[0.04em] text-white/55" style={{ animation: "bl-rise 0.45s ease both" }}>{stage}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Liquid-glass displacement filter (refraction + chromatic aberration) — used by .liquid-glass */}
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="liquid-glass-filter" x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
            <feImage x="0" y="0" width="100%" height="100%" result="MAP" href={LIQUID_GLASS_DISPLACEMENT_MAP} preserveAspectRatio="xMidYMid slice" />
            <feColorMatrix in="MAP" type="matrix" values="0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0 0 0 1 0" result="EDGE_I" />
            <feComponentTransfer in="EDGE_I" result="EDGE_MASK"><feFuncA type="discrete" tableValues="0 0.1 1" /></feComponentTransfer>
            <feOffset in="SourceGraphic" dx="0" dy="0" result="CENTER" />
            <feDisplacementMap in="SourceGraphic" in2="MAP" scale="-70" xChannelSelector="R" yChannelSelector="B" result="RD" />
            <feColorMatrix in="RD" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="RC" />
            <feDisplacementMap in="SourceGraphic" in2="MAP" scale="-77" xChannelSelector="R" yChannelSelector="B" result="GD" />
            <feColorMatrix in="GD" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="GC" />
            <feDisplacementMap in="SourceGraphic" in2="MAP" scale="-84" xChannelSelector="R" yChannelSelector="B" result="BD" />
            <feColorMatrix in="BD" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="BC" />
            <feBlend in="GC" in2="BC" mode="screen" result="GB" />
            <feBlend in="RC" in2="GB" mode="screen" result="RGB" />
            <feGaussianBlur in="RGB" stdDeviation="0.3" result="ABB" />
            <feComposite in="ABB" in2="EDGE_MASK" operator="in" result="EDGE_AB" />
            <feComponentTransfer in="EDGE_MASK" result="INV"><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>
            <feComposite in="CENTER" in2="INV" operator="in" result="CENTER_CLEAN" />
            <feComposite in="EDGE_AB" in2="CENTER_CLEAN" operator="over" />
          </filter>
        </defs>
      </svg>

      {/* ── Top bar ── */}
      <div className="relative flex h-[56px] flex-shrink-0 items-center justify-between border-b border-[var(--ed-border)] bg-[var(--ed-bg-subbar)] px-4">
        <div className="flex items-center gap-2">
          {!IS_STANDALONE && (
            <button
              type="button"
              onClick={onBack}
              title="Back"
              className="glass-chip flex h-8 w-8 items-center justify-center rounded-full text-[var(--ed-text-muted)] transition hover:text-[var(--ed-text)]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          <div className="flex items-center">
            <style>{`
              /* ── Apple-style liquid glass (dark vibrancy) ── */
              .liquid-glass {
                position: relative;
                background: linear-gradient(135deg, rgba(48,52,64,0.40), rgba(15,18,25,0.48));
                /* Refraction via SVG displacement map + light frost. Chromium honors
                   url() in backdrop-filter; Safari falls back to the -webkit blur. */
                backdrop-filter: url(#liquid-glass-filter) blur(2px) saturate(150%);
                -webkit-backdrop-filter: blur(24px) saturate(170%);
                border: 1px solid rgba(255,255,255,0.14);
                box-shadow:
                  0 16px 48px rgba(0,0,0,0.50),
                  inset 0 1px 0 rgba(255,255,255,0.30),
                  inset 0 0 0 1px rgba(255,255,255,0.05);
              }
              /* top sheen — light running across the surface */
              .liquid-glass::before {
                content: "";
                position: absolute;
                inset: 0;
                border-radius: inherit;
                pointer-events: none;
                background:
                  linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 34%),
                  radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.10), rgba(255,255,255,0) 45%);
              }
              /* compact glass for chips/tabs/switches */
              .glass-chip {
                background: linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03));
                backdrop-filter: blur(14px) saturate(170%);
                -webkit-backdrop-filter: blur(14px) saturate(170%);
                border: 1px solid rgba(255,255,255,0.14);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.20);
              }
              /* Apple-like spring press on every editor button: snappy push-down,
                 springy overshoot on release (≈ framer spring stiffness 500 / damping 30). */
              .fmt-root button {
                transition: transform 0.34s cubic-bezier(0.34, 1.56, 0.64, 1),
                            background-color 0.18s ease, border-color 0.18s ease,
                            color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
              }
              .fmt-root button:active {
                transform: scale(0.97) translateY(2px);
                transition: transform 0.06s cubic-bezier(0.4, 0, 1, 1);
              }
              @media (prefers-reduced-motion: reduce) {
                .fmt-root button { transition: none; }
                .fmt-root button:active { transform: none; }
              }
              @keyframes octopilot-char-scan {
                0%   { color: #ff2200; transform: scale(1); }
                8%   { color: #ffaa88; transform: scale(1.28); }
                22%  { color: #ff2200; transform: scale(1); }
                100% { color: #ff2200; transform: scale(1); }
              }
              @keyframes cit-card-in {
                from { opacity: 0; transform: translateY(-10px) scale(0.97); }
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
                from { opacity: 0; transform: translateY(22px) scale(0.982); }
                to   { opacity: 1; transform: translateY(0)    scale(1);     }
              }
              @keyframes chat-msg-in {
                from { opacity: 0; transform: translateY(10px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0)    scale(1);    }
              }
              @keyframes octo-slide-in {
                from { opacity: 0; transform: translateX(-40px); }
                to   { opacity: 1; transform: translateX(0);     }
              }
              @keyframes typing-bounce {
                0%, 60%, 100% { transform: translateY(0); }
                30%           { transform: translateY(-5px); }
              }
              @keyframes dict-in {
                from { opacity: 0; transform: translateY(16px) scale(0.97); }
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
          </div>
        </div>

        {/* ── CENTER — Octopilot Doc Oct (logo font + animation unchanged) ── */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
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
            <span style={{ fontSize: '14px' }} className="text-[var(--ed-text)]"> Doc Oct</span>
          </span>
        </div>

        {/* ── RIGHT controls ── */}
        <div className="flex items-center gap-2">
          {/* Save (cloud) — glass pill with autosave status. Signed-in only. */}
          {currentUser ? (
            <button
              type="button"
              onClick={() => void saveNow({ force: true })}
              title="Save now (Ctrl+S) · autosaves every 10s"
              className="glass-chip flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-[var(--ed-text-muted)] transition hover:text-[var(--ed-text)]"
            >
              {saveStatus === "saving" ? (
                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
              ) : saveStatus === "saved" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              ) : saveStatus === "error" ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
              )}
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Retry" : "Save"}
            </button>
          ) : (
            <button
              type="button"
              onClick={saveDraft}
              disabled={!rawContent.trim()}
              className="glass-chip flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-[var(--ed-text-muted)] transition hover:text-[var(--ed-text)] disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
              Save
            </button>
          )}

          {/* Humanizer credits — glass pill */}
          {currentUser && humanizerCredits !== null && (
            <div className="glass-chip flex items-center gap-1.5 rounded-full px-3 py-1.5" title="Humanizer credits">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1.5" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span className="text-[12px] font-bold text-[var(--ed-text)]">{humanizerCredits.toLocaleString()}</span>
            </div>
          )}

          {/* Avatar + Sign out — grouped glass pill */}
          {currentUser ? (
            <div className="glass-chip flex items-center gap-1.5 rounded-full py-1 pl-1 pr-1.5">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Profile" className="h-7 w-7 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ea4335] text-[12px] font-bold text-white">
                  {((currentUser.displayName ?? currentUser.email ?? "?")[0] ?? "?").toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => void AuthService.signOut()}
                title="Sign out"
                className="rounded-full p-1.5 text-[var(--ed-text-dim)] transition hover:text-[#f87171]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
          ) : (
            <div className="glass-chip flex h-8 w-8 items-center justify-center rounded-full text-[var(--ed-text-dim)]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
            </div>
          )}
        </div>
      </div>

      {/* ── Three-panel body ── */}
      <div className="relative min-h-0 flex-1">

        {/* LEFT PANEL — slides over center like a warehouse door (editor only) */}
        {viewState === "editor" && (
        <div
          className="absolute left-0 top-0 z-10 flex h-full flex-col overflow-hidden border-r border-[var(--ed-border)] bg-[var(--ed-bg-subbar)]"
          style={{
            width: leftWidth,
            transition: panelResizing ? "none" : "width 0.4s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* ── Left resize handle ── */}
          <div
            className="absolute right-0 top-0 z-20 h-full w-[5px] cursor-col-resize select-none hover:bg-[#ea4335]/25 active:bg-[#ea4335]/40"
            style={{ transition: "background 0.15s" }}
            onMouseDown={(e) => {
              e.preventDefault();
              leftDragRef.current = { startX: e.clientX, startW: leftWidth };
              document.body.style.cursor     = "col-resize";
              document.body.style.userSelect = "none";
              setPanelResizing(true);
            }}
          />
          <div
            className={`flex h-full min-h-0 flex-col transition-opacity duration-200 ${leftOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            style={{ width: Math.max(leftWidth, LEFT_DEFAULT) }}
          >
            {/* Header */}
            <div className="relative flex items-center justify-center border-b border-[var(--ed-border)] px-3 py-2.5">
              <span className="text-[14px] font-bold tracking-wide text-[var(--ed-text)]">Outline</span>
              <button onClick={() => setLeftWidth(0)} className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full text-[var(--ed-text-dim)] hover:bg-[var(--ed-surface-4)] hover:text-[var(--ed-text-muted)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            </div>

            {/* ── Single scrollable column: assignment analysis + wizard outline ── */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {(assignmentAnalysis || outlines.length > 0) ? (
                <div className="flex flex-col gap-4 p-3">
                  {/* Assignment analysis (mirrors the setup wizard) */}
                  {assignmentAnalysis && (
                    <div className="flex flex-col gap-2">
                      <p className="px-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-dim)]">Analysis</p>
                      <div className="rounded-xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] p-3">
                        <p className="text-[12.5px] leading-relaxed text-[var(--ed-text-muted)]">{assignmentAnalysis.analysis}</p>
                        <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-[var(--ed-border)] pt-2.5">
                          {([
                            ["Topic", assignmentAnalysis.essayTopic],
                            ["Essay type", assignmentAnalysis.essayType],
                            ["Scope", assignmentAnalysis.scope],
                            ["Structure", assignmentAnalysis.structure],
                          ] as [string, string][]).filter(([, v]) => v?.trim()).map(([label, val]) => (
                            <div key={label}>
                              <span className="text-[9.5px] font-bold uppercase tracking-widest text-[var(--ed-text-dim)]">{label}</span>
                              <p className="mt-0.5 text-[12px] leading-snug text-[var(--ed-text-faint)]">{val}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Wizard-generated outline */}
                  {outlines.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <p className="px-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-dim)]">Your outline · {outlines.length} section{outlines.length === 1 ? "" : "s"}</p>
                      {outlines.map((o, i) => (
                        <OutlineCard key={i} o={o} index={i}
                                onUpdate={(u) => setOutlines((prev) => prev.map((x, j) => (j === i ? u : x)))}
                                onRemove={() => setOutlines((prev) => prev.filter((_, j) => j !== i))} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ed-surface-4)]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea4335" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>
                  </div>
                  <p className="text-[12.5px] font-medium text-[var(--ed-text-muted)]">Nothing here yet</p>
                  <p className="text-[11px] leading-relaxed text-[var(--ed-text-dim)]">Analyze your assignment and generate an outline in the setup wizard — both show up here as you write.</p>
                </div>
              )}

            </div> {/* end single scroll column */}
          </div>
        </div>
        )}

        {/* Left re-open tab */}
        {viewState === "editor" && !leftOpen && !octoExpanded && (
          <button
            type="button"
            onClick={() => setLeftWidth(LEFT_DEFAULT)}
            className="group absolute inset-y-0 left-0 z-20 flex w-6 items-center justify-center transition active:scale-[0.97]"
            title="Open document panel"
          >
            <span className="flex h-16 w-[18px] items-center justify-center rounded-r-[10px] bg-gradient-to-b from-[#ea4335] to-[#c62828] text-white shadow-[0_0_14px_rgba(234,67,53,0.55)] transition-all duration-200 group-hover:w-[22px] group-hover:shadow-[0_0_20px_rgba(234,67,53,0.8)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="m9 18 6-6-6-6" /></svg>
            </span>
          </button>
        )}

        {/* CENTER: always full size — panels overlay on top */}
        <div className="absolute inset-0 overflow-hidden bg-[var(--ed-app-bg)]">

          {/* ── WELCOME PANEL ── */}
          {/* Auth still resolving — hold a neutral splash so the logged-out
              welcome never flashes before the Save Deck for signed-in users. */}
          {viewState === "welcome" && !authChecked && (
            <div className="flex h-full items-center justify-center bg-[#0b0e13]">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#ea4335]" />
            </div>
          )}

          {viewState === "welcome" && authChecked && !currentUser && (
            <WizardShell
              step={1}
              exiting={viewExiting}
              eyebrow="Academic formatting, automated"
              headline={<>Write with precision.<br /><span className="text-[#ea4335]">Cite with confidence.</span></>}
            >
              <p className="ob-item mb-10 max-w-md text-[16px] leading-relaxed text-white/45" style={{ animationDelay: "180ms" }}>
                Format your essays to exact style guidelines — MLA, APA, Chicago, IEEE, Harvard — every margin, indent, and citation handled automatically.
              </p>
              <div className="ob-item grid gap-3.5 sm:grid-cols-2" style={{ animationDelay: "290ms" }}>
                <button
                  type="button"
                  onClick={() => transitionTo("setup")}
                  className="group relative overflow-hidden rounded-3xl bg-[#ea4335] p-6 text-left transition hover:bg-[#dc2626] active:scale-[0.98]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 to-transparent" />
                  <div className="relative flex h-full flex-col">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" className="mb-8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                    <p className="mt-auto text-[17px] font-semibold text-white">Specify my topic</p>
                    <p className="mt-1 text-[13px] text-white/70">Premium features + source search</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-white">Start <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="transition-transform group-hover:translate-x-1"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => transitionTo("editor")}
                  className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-left transition hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.98]"
                >
                  <div className="relative flex h-full flex-col">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea4335" strokeWidth="2" strokeLinecap="round" className="mb-8"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
                    <p className="mt-auto text-[17px] font-semibold text-white">Start writing</p>
                    <p className="mt-1 text-[13px] text-white/45">Jump straight in — disposable session</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-white/70">Open editor <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="transition-transform group-hover:translate-x-1"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
                  </div>
                </button>
              </div>
            </WizardShell>
          )}

          {/* ── SAVE DECK (logged-in home) ── */}
          {viewState === "welcome" && authChecked && currentUser && (
            <div className={`h-full overflow-y-auto bg-[#0b0e13] ${viewExiting ? "cinematic-exit" : "cinematic-enter"}`}>
              <div className="mx-auto max-w-[1100px] px-8 py-10">
                {/* Greeting */}
                <div className="mb-8">
                  <h1 className="text-[26px] font-bold text-white">
                    Your <span className="text-[#ea4335]">Doc Oct</span> workspace
                  </h1>
                  <p className="mt-1 text-[14px] text-white/45">Start a new paper or pick up where you left off — everything autosaves.</p>
                </div>

                {/* Templates */}
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/35">Start a new document</p>
                <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {([
                    { id: null, label: "Blank", sub: "No format" },
                    { id: "mla", label: "MLA Paper", sub: "MLA 9th" },
                    { id: "apa", label: "APA Paper", sub: "APA 7th" },
                    { id: "ieee", label: "IEEE Paper", sub: "IEEE" },
                    { id: "chicago", label: "Chicago Paper", sub: "Chicago" },
                    { id: "harvard", label: "Harvard Paper", sub: "Harvard" },
                  ] as { id: FormatStyleId | null; label: string; sub: string }[]).map((t) => (
                    <button
                      key={t.id ?? "blank"}
                      type="button"
                      onClick={() => startNewDocument(t.id)}
                      className="group flex flex-col items-stretch text-left transition active:scale-[0.98]"
                    >
                      <div className="relative mb-2 aspect-[8.5/11] overflow-hidden rounded-lg border border-white/10 bg-white shadow-sm transition group-hover:border-[#ea4335]/60 group-hover:shadow-[0_0_0_2px_rgba(234,67,53,0.35)]">
                        {t.id === null ? (
                          <div className="flex h-full items-center justify-center">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ea4335" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                          </div>
                        ) : (
                          <div className="flex h-full flex-col gap-[5px] px-3 py-3">
                            <div className="mx-auto mb-1 h-[5px] w-[60%] rounded-full bg-[#c9ced6]" />
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div key={i} className="h-[3px] rounded-full bg-[#e2e5ea]" style={{ width: `${[100, 92, 96, 84, 98, 90, 94, 70][i]}%` }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[13px] font-semibold text-white/85 group-hover:text-white">{t.label}</span>
                      <span className="text-[11px] text-white/35">{t.sub}</span>
                    </button>
                  ))}
                </div>

                {/* Recent documents */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/35">Recent documents</p>
                    <span className={`text-[11px] font-medium ${deckDocs.length >= docLimit ? "text-[#ea4335]" : "text-white/30"}`}>
                      {deckDocs.length} / {docLimit}
                    </span>
                  </div>
                  <button type="button" onClick={() => void refreshDeck()} className="text-[11px] font-medium text-white/40 transition hover:text-white/70">Refresh</button>
                </div>

                {deckLoading && deckDocs.length === 0 ? (
                  <div className="flex items-center gap-2.5 py-10 text-[13px] text-white/40">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Loading your documents…
                  </div>
                ) : deckDocs.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
                    <p className="text-[14px] font-medium text-white/60">No saved documents yet</p>
                    <p className="mt-1 text-[12px] text-white/35">Pick a template above — your work will appear here automatically.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {deckDocs.map((d) => (
                      <div key={d.id} className="group relative cursor-pointer" onClick={() => void openDocument(d.id)}>
                        <div className="relative mb-2 aspect-[8.5/11] overflow-hidden rounded-lg border border-white/10 bg-white shadow-sm transition group-hover:border-[#ea4335]/60 group-hover:shadow-[0_0_0_2px_rgba(234,67,53,0.35)]">
                          <div className="flex h-full flex-col gap-[4px] px-3 py-3">
                            <div className="mb-1 h-[5px] w-[55%] rounded-full bg-[#c9ced6]" />
                            <p className="line-clamp-[9] text-[5.5px] leading-[1.7] text-[#9aa0aa]">{d.preview || "Empty document"}</p>
                          </div>
                          <button
                            type="button"
                            title="Delete"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!window.confirm(`Delete “${d.title}”? This can't be undone.`)) return;
                              try { await DocumentService.remove(d.id); setDeckDocs((prev) => prev.filter((x) => x.id !== d.id)); }
                              catch { showToast("Couldn't delete."); }
                            }}
                            className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/80 transition hover:bg-[#ea4335] group-hover:flex"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                          </button>
                        </div>
                        <span className="block truncate text-[13px] font-semibold text-white/85 group-hover:text-white">{d.title}</span>
                        <span className="text-[11px] text-white/35">
                          {d.format_style && d.format_style !== "none" ? `${d.format_style.toUpperCase()} · ` : ""}
                          {new Date(d.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SETUP PANEL ── */}
          {viewState === "setup" && (
            <WizardShell
              step={2}
              exiting={viewExiting}
              onBack={() => transitionTo("welcome")}
              eyebrow="Step two"
              headline={<>Set up<br />your paper.</>}
            >
              {/* Essay topic */}
              <div className="ob-item mb-8" style={{ animationDelay: "120ms" }}>
                <label className="mb-2.5 block text-[12px] font-semibold uppercase tracking-[0.18em] text-white/40">Essay topic or assignment prompt</label>
                <input
                  type="text"
                  value={onboardingTopic}
                  onChange={(e) => setOnboardingTopic(e.target.value)}
                  placeholder="e.g. The impact of social media on mental health"
                  className="w-full border-0 border-b-2 border-white/15 bg-transparent pb-3 text-[22px] font-medium text-white placeholder-white/25 outline-none transition focus:border-[#ea4335]"
                />
              </div>

              {/* Citation format */}
              <div className="ob-item mb-10" style={{ animationDelay: "210ms" }}>
                <label className="mb-3 block text-[12px] font-semibold uppercase tracking-[0.18em] text-white/40">Citation format</label>
                <div className="flex flex-wrap gap-2.5">
                  {FORMAT_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setOnboardingFormat(s.id)}
                      className="flex items-center gap-2 rounded-2xl border px-4 py-3 text-[14px] font-medium transition active:scale-[0.96]"
                      style={onboardingFormat === s.id
                        ? { background: `${s.color}1f`, borderColor: s.color, color: "#fff" }
                        : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.55)" }}
                    >
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: s.color }}>{s.abbr}</div>
                      {s.label.split(" (")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ob-item" style={{ animationDelay: "300ms" }}>
                <button
                  type="button"
                  onClick={() => transitionTo(onboardingTopic.trim() ? "analysis" : "editor", { topic: onboardingTopic, style: onboardingFormat })}
                  className="group flex items-center justify-center gap-2 rounded-2xl bg-[#ea4335] px-8 py-4 text-[16px] font-semibold text-white transition hover:bg-[#dc2626] active:scale-[0.98]"
                >
                  {onboardingTopic.trim() ? "Analyze & Continue" : "Open Editor"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="transition-transform group-hover:translate-x-1"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
            </WizardShell>
          )}

          {/* ── ASSIGNMENT ANALYSIS + OUTLINES (between setup and editor) ── */}
          {viewState === "analysis" && (
            <WizardShell
              step={3}
              exiting={viewExiting}
              scroll
              onBack={() => transitionTo("setup")}
              eyebrow="Step three"
              headline={<>Your assignment,<br /><span className="text-[#ea4335]">decoded.</span></>}
            >
              <p className="ob-item mb-6 text-[15px] leading-relaxed text-white/45" style={{ animationDelay: "120ms" }}>Octo broke down your prompt. Review it, optionally generate an outline, then start writing.</p>

                {/* Analysis card */}
                <div className="ob-item mb-6 flex-shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5" style={{ animationDelay: "180ms" }}>
                  {assignmentLoading ? (
                    <div className="flex items-center gap-2.5 py-4 text-[14px] text-white/50">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Analyzing your assignment…
                    </div>
                  ) : assignmentError ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] text-[#f87171]">{assignmentError}</p>
                      <button type="button" onClick={() => void analyzeAssignment(onboardingTopic)} className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/20">Retry</button>
                    </div>
                  ) : assignmentAnalysis ? (
                    <div className="space-y-3">
                      <p className="text-[14px] leading-relaxed text-white/85">{assignmentAnalysis.analysis}</p>
                      <div className="grid grid-cols-1 gap-2.5 border-t border-white/10 pt-3 sm:grid-cols-2">
                        {([
                          ["Topic", assignmentAnalysis.essayTopic],
                          ["Essay type", assignmentAnalysis.essayType],
                          ["Scope", assignmentAnalysis.scope],
                          ["Structure", assignmentAnalysis.structure],
                        ] as [string, string][]).filter(([, v]) => v?.trim()).map(([label, val]) => (
                          <div key={label}>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">{label}</span>
                            <p className="mt-0.5 text-[13px] leading-snug text-white/70">{val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="py-2 text-[13px] text-white/40">No analysis yet.</p>
                  )}
                </div>

                {/* Outlines (optional) — 3 modes like Guided Generation */}
                <div className="ob-item mb-6 flex-shrink-0" style={{ animationDelay: "240ms" }}>
                  <h3 className="text-[15px] font-semibold text-white">Outline <span className="text-white/40">(optional)</span></h3>
                  <p className="mb-3 text-[12px] text-white/35">Pick a mode, or skip and write freely.</p>

                  {assignmentAnalysis && (
                    <>
                      {/* Mode buttons */}
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["build", "Build My Way", "M12 5v14M5 12h14"],
                          ["auto", "Auto Outline", "M3 12h7l2-3 2 6 2-3h5"],
                          ["single", "One Paragraph", "M4 6h16M4 12h10M4 18h7"],
                        ] as [string, string, string][]).map(([m, label, icon]) => (
                          <button
                            key={m}
                            type="button"
                            disabled={outlinesLoading}
                            onClick={() => {
                              if (m === "auto") void runOutline("auto");
                              else setOutlineMode((prev) => (prev === m ? null : (m as "single" | "build")));
                            }}
                            className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-[11px] font-semibold transition active:scale-[0.97] disabled:opacity-50 ${outlineMode === m ? "border-[#ea4335] bg-[#ea4335]/15 text-white" : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/80"}`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* One Paragraph Only — 3 type params */}
                      {outlineMode === "single" && (
                        <div className="mt-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-3" style={{ animation: "dict-in 0.18s ease-out both" }}>
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/35">Which paragraph?</p>
                          <div className="flex flex-wrap gap-2">
                            {(["Introduction", "Body Paragraph", "Conclusion"] as const).map((t) => (
                              <button key={t} type="button" disabled={outlinesLoading}
                                onClick={() => void runOutline("single", t)}
                                className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium text-white/75 transition hover:border-[#ea4335]/50 hover:text-white active:scale-[0.96] disabled:opacity-50">
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Build My Way — type + custom title */}
                      {outlineMode === "build" && (
                        <div className="mt-2.5 space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-3" style={{ animation: "dict-in 0.18s ease-out both" }}>
                          <div className="flex flex-wrap gap-2">
                            {(["Introduction", "Body Paragraph", "Conclusion"] as const).map((t) => (
                              <button key={t} type="button"
                                onClick={() => setBuildType(t)}
                                className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition active:scale-[0.96] ${buildType === t ? "border-[#ea4335] bg-[#ea4335]/15 text-white" : "border-white/15 bg-white/[0.04] text-white/60 hover:text-white/85"}`}>
                                {t}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={buildTitle}
                            onChange={(e) => setBuildTitle(e.target.value)}
                            placeholder="What should this paragraph focus on?"
                            className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[12px] text-white placeholder-white/25 outline-none focus:border-[#ea4335]/50"
                          />
                          <button type="button" disabled={outlinesLoading || !buildTitle.trim()}
                            onClick={() => void runOutline("build", buildType, buildTitle.trim())}
                            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#ea4335] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] active:scale-[0.97] disabled:opacity-40">
                            {outlinesLoading ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />Building…</> : "Build paragraph"}
                          </button>
                        </div>
                      )}

                      {outlinesLoading && outlineMode === null && (
                        <div className="mt-3 flex items-center gap-2 text-[12px] text-white/50">
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Generating outline…
                        </div>
                      )}

                      {outlines.length > 0 && (
                        <div className="mt-3 space-y-2.5">
                          {outlines.map((o, i) => (
                            <OutlineCard key={i} o={o} index={i}
                            onUpdate={(u) => setOutlines((prev) => prev.map((x, j) => (j === i ? u : x)))}
                            onRemove={() => setOutlines((prev) => prev.filter((_, j) => j !== i))} />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Continue */}
                <div className="ob-item flex-shrink-0 pb-2 pt-2" style={{ animationDelay: "300ms" }}>
                  <button
                    type="button"
                    onClick={() => transitionTo("editor", { topic: onboardingTopic, style: onboardingFormat })}
                    className="group flex items-center justify-center gap-2 rounded-2xl bg-[#ea4335] px-8 py-4 text-[16px] font-semibold text-white transition hover:bg-[#dc2626] active:scale-[0.98]"
                  >
                    {outlines.length ? "Continue to Editor" : "Skip outline & write"}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="transition-transform group-hover:translate-x-1"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
            </WizardShell>
          )}

          {/* ── EDITOR ── */}
          {viewState === "editor" && (
            <div
              key={editorKey}
              className={`h-full ${viewExiting ? "cinematic-exit" : "cinematic-enter"}`}
            >
              <FormatterEditorCore
                content={coreSnapshot.content}
                restoredPages={restoredPages ?? undefined}
                bibliography={coreSnapshot.bibliography}
                initialDocTitle={coreSnapshot.initialDocTitle}
                studentName={coreSnapshot.studentName}
                instructorName={coreSnapshot.instructorName}
                institutionName={coreSnapshot.institutionName}
                courseInfo={coreSnapshot.courseInfo}
                subjectCode={coreSnapshot.subjectCode}
                essayDate={coreSnapshot.essayDate}
                abstract={coreSnapshot.abstract}
                keywords={coreSnapshot.keywords}
                formatStyle={formatStyle}
                onReformat={(id) => applyDocumentWithStyle(id)}
                canReformat={true}
                getSnapshotRef={getSnapshotRef}
                onBack={onBack}
                onFinish={onFinish ? handleCoreFinish : undefined}
                insertBibEntryRef={insertBibEntryRef}
                octoHighlightRef={octoHighlightRef}
                octoJumpRef={octoJumpRef}
                panelInsets={{ left: octoExpanded ? OCTO_PANEL_W + 24 : leftWidth, right: rightWidth, animated: !panelResizing }}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            </div>
          )}
        </div>

        {/* Right re-open tab */}
        {viewState === "editor" && !rightOpen && (
          <button
            type="button"
            onClick={() => setRightWidth(RIGHT_DEFAULT)}
            className="group absolute inset-y-0 right-0 z-20 flex w-6 items-center justify-center transition active:scale-[0.97]"
            title="Open citations panel"
          >
            <span className="flex h-16 w-[18px] items-center justify-center rounded-l-[10px] bg-gradient-to-b from-[#ea4335] to-[#c62828] text-white shadow-[0_0_14px_rgba(234,67,53,0.55)] transition-all duration-200 group-hover:w-[22px] group-hover:shadow-[0_0_20px_rgba(234,67,53,0.8)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="m15 18-6-6 6-6" /></svg>
            </span>
          </button>
        )}

        {/* RIGHT PANEL — slides over center like a warehouse door (editor only) */}
        {viewState === "editor" && (
        <div
          className="absolute right-0 top-0 z-10 flex h-full flex-col overflow-hidden border-l border-[var(--ed-border)] bg-[var(--ed-bg-subbar)]"
          style={{
            width: rightWidth,
            transition: panelResizing ? "none" : "width 0.4s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {/* ── Right resize handle ── */}
          <div
            className="absolute left-0 top-0 z-20 h-full w-[5px] cursor-col-resize select-none hover:bg-[#ea4335]/25 active:bg-[#ea4335]/40"
            style={{ transition: "background 0.15s" }}
            onMouseDown={(e) => {
              e.preventDefault();
              rightDragRef.current = { startX: e.clientX, startW: rightWidth };
              document.body.style.cursor     = "col-resize";
              document.body.style.userSelect = "none";
              setPanelResizing(true);
            }}
          />
          <div
            className={`flex h-full min-h-0 flex-col transition-opacity duration-200 ${rightOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            style={{ width: Math.max(rightWidth, RIGHT_DEFAULT) }}
          >

            {/* Header */}
            <div className="relative flex items-center justify-center border-b border-[var(--ed-border)] px-3 py-2.5">
              <button onClick={() => setRightWidth(0)} className="absolute left-2 flex h-6 w-6 items-center justify-center rounded-full text-[var(--ed-text-dim)] hover:bg-[var(--ed-surface-4)] hover:text-[var(--ed-text-muted)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
              </button>
              <span className="text-[14px] font-bold tracking-wide text-[var(--ed-text)]">Tools</span>
            </div>

            {/* ── Tab bar ── */}
            <div className="flex flex-shrink-0 overflow-x-auto border-b border-[var(--ed-border)]">
              {(["citations", "source", "paraphraser", "dictionary", "thesaurus"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRightTab(tab)}
                  className={`relative flex-shrink-0 px-3 py-2.5 text-[10.5px] font-semibold tracking-wide transition-colors active:scale-[0.97] ${rightTab === tab ? "text-[var(--ed-text)]" : "text-[var(--ed-text-dim)] hover:text-[var(--ed-text-muted)]"}`}
                >
                  {tab === "citations" ? "Citations" : tab === "dictionary" ? "Dictionary" : tab === "thesaurus" ? "Thesaurus" : tab === "paraphraser" ? "Paraphraser" : "Source"}
                  {rightTab === tab && (
                    <span className="absolute bottom-0 left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-[#ea4335]" style={{ animation: "dict-in 0.18s ease-out both" }} />
                  )}
                </button>
              ))}
            </div>

            {/* ══════════════ PARAPHRASER TAB ══════════════ */}
            {rightTab === "paraphraser" && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {/* Header */}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ed-text-dim)]">Paraphraser</p>
                {humanizerCredits !== null && (
                  <span className="rounded-full bg-[var(--ed-bg-pill)] px-2 py-0.5 text-[10px] text-[var(--ed-text-faint)]">{humanizerCredits} cr</span>
                )}
              </div>

              {/* Input box */}
              <textarea
                value={humInput}
                onChange={(e) => { setHumInput(e.target.value); setHumOutput(""); setHumPanelError(null); }}
                placeholder="Paste or type text to humanize…"
                rows={5}
                className="w-full resize-none rounded-xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ed-status-text)] placeholder-[var(--ed-text-label)] outline-none transition focus:border-[#ea4335]/40 focus:ring-1 focus:ring-[#ea4335]/20"
              />

              {/* Provider toggle */}
              <div className="my-2 flex rounded-full glass-chip p-[3px]">
                {(["StealthGPT", "UndetectableAI"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setHumProvider(p); setHumOutput(""); setHumPanelError(null); }}
                    className={`flex-1 rounded-full py-1 text-[11px] font-semibold transition ${humProvider === p ? "bg-[#ea4335] text-white" : "text-[var(--ed-text-faint)] hover:text-[var(--ed-text-muted)]"}`}
                  >
                    {p === "StealthGPT" ? "StealthGPT" : "Undetectable"}
                  </button>
                ))}
              </div>

              {/* Provider-specific params */}
              {humProvider === "StealthGPT" ? (
                <div className="flex flex-col gap-1.5">
                  <div>
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ed-text-dim)]">Education Level</p>
                    <div className="flex flex-wrap gap-1">
                      {["Standard", "High School", "College", "PHD"].map((v) => (
                        <button key={v} type="button" onClick={() => setStealthEducation(v)}
                          className={`rounded-full px-2 py-[3px] text-[10.5px] font-medium transition ${stealthEducation === v ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-4)] text-[var(--ed-text-faint)] hover:text-[var(--ed-text-muted)]"}`}
                        >{v}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ed-text-dim)]">Strength</p>
                    <div className="flex flex-wrap gap-1">
                      {["Low", "Medium", "High"].map((v) => (
                        <button key={v} type="button" onClick={() => setStealthStrength(v)}
                          className={`rounded-full px-2 py-[3px] text-[10.5px] font-medium transition ${stealthStrength === v ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-4)] text-[var(--ed-text-faint)] hover:text-[var(--ed-text-muted)]"}`}
                        >{v}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ed-text-dim)]">Detector</p>
                    <div className="flex flex-wrap gap-1">
                      {["Turnitin", "GPTZero"].map((v) => (
                        <button key={v} type="button" onClick={() => setStealthDetector(v)}
                          className={`rounded-full px-2 py-[3px] text-[10.5px] font-medium transition ${stealthDetector === v ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-4)] text-[var(--ed-text-faint)] hover:text-[var(--ed-text-muted)]"}`}
                        >{v}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-[var(--ed-bg-pill)] px-3 py-2">
                    <span className="text-[11.5px] text-[var(--ed-text-muted)]">Rephrase mode</span>
                    <button
                      type="button"
                      onClick={() => setStealthRephrase((v) => !v)}
                      className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${stealthRephrase ? "bg-[#ea4335]" : "bg-[var(--ed-border)]"}`}
                    >
                      <span className={`absolute top-[2px] h-4 w-4 rounded-full bg-white shadow transition-all ${stealthRephrase ? "left-[18px]" : "left-[2px]"}`} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div>
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ed-text-dim)]">Readability</p>
                    <div className="flex flex-wrap gap-1">
                      {["High School", "University", "Doctorate", "Journalist", "Marketing"].map((v) => (
                        <button key={v} type="button" onClick={() => setUaiReadability(v)}
                          className={`rounded-full px-2 py-[3px] text-[10.5px] font-medium transition ${uaiReadability === v ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-4)] text-[var(--ed-text-faint)] hover:text-[var(--ed-text-muted)]"}`}
                        >{v}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ed-text-dim)]">Purpose</p>
                    <div className="flex flex-wrap gap-1">
                      {["Essay", "Article", "Marketing", "Story", "Cover Letter", "Report"].map((v) => (
                        <button key={v} type="button" onClick={() => setUaiPurpose(v)}
                          className={`rounded-full px-2 py-[3px] text-[10.5px] font-medium transition ${uaiPurpose === v ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-4)] text-[var(--ed-text-faint)] hover:text-[var(--ed-text-muted)]"}`}
                        >{v}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ed-text-dim)]">Strength</p>
                    <div className="flex flex-wrap gap-1">
                      {["More Human", "Balanced", "More Readable"].map((v) => (
                        <button key={v} type="button" onClick={() => setUaiStrength(v)}
                          className={`rounded-full px-2 py-[3px] text-[10.5px] font-medium transition ${uaiStrength === v ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-4)] text-[var(--ed-text-faint)] hover:text-[var(--ed-text-muted)]"}`}
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
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ea4335] py-2 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-40"
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

              {humPanelError && (
                <p className="mt-2 rounded-xl bg-[#2a1010] px-3 py-2 text-[11.5px] text-[#f87171]">{humPanelError}</p>
              )}

              {/* Output box */}
              {humOutput && (
                <div className="mt-2.5">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ed-text-dim)]">Result</p>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(humOutput);
                        setHumCopied(true);
                        setTimeout(() => setHumCopied(false), 2000);
                      }}
                      className="flex items-center gap-1 rounded-full bg-[var(--ed-bg-pill)] px-2 py-[3px] text-[10.5px] font-medium text-[var(--ed-text-faint)] transition hover:text-[var(--ed-text)] active:scale-95"
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
                    className="w-full resize-none rounded-xl border border-[var(--ed-border)] bg-[#0a0d11] px-3 py-2 text-[12px] leading-relaxed text-[var(--ed-text-muted)] outline-none"
                  />
                </div>
              )}
            </div>
            )}

            {/* ══════════════ CITATIONS TAB ══════════════ */}
            {rightTab === "citations" && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">

              {/* ── Mode Switcher ── */}
              <div className="mb-3 flex rounded-full glass-chip p-1">
                {(["manual", "auto"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setCitMode(mode); setCitPhase({ kind: "idle" }); }}
                    className={`flex-1 rounded-full py-1.5 text-[12px] font-medium transition active:scale-[0.97] ${citMode === mode ? "bg-[var(--ed-surface-6)] text-[var(--ed-text)] shadow-sm" : "text-[var(--ed-text-faint)] hover:text-[var(--ed-text-muted)]"}`}
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
                      className="min-w-0 flex-1 rounded-2xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-1.5 text-[12px] text-[var(--ed-text)] placeholder-[var(--ed-text-dim)] outline-none focus:border-[var(--ed-text-dim)]"
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
                      className="rounded-full bg-[#ea4335] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] disabled:opacity-40"
                    >
                      {citPhase.kind === "scraping" ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : "Scrape"}
                    </button>
                  </div>

                  {/* Scraped metadata + format picker */}
                  {citPhase.kind === "awaiting_format" && (
                    <div className="mt-2 rounded-[16px] border border-[var(--ed-border)] bg-[var(--ed-surface-5)] p-3" style={{ animation: 'cit-card-in 0.34s ease-out' }}>
                      <div className="mb-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {citPhase.meta.title && <p className="truncate text-[12px] font-medium text-[var(--ed-text)]">{citPhase.meta.title}</p>}
                          {citPhase.meta.author && <p className="truncate text-[11px] text-[var(--ed-text-faint)]">{citPhase.meta.author}</p>}
                          {citPhase.meta.year && <p className="text-[11px] text-[var(--ed-text-dim)]">{citPhase.meta.year}</p>}
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-[#0d2218] px-2 py-0.5 text-[10px] font-semibold text-[#4ade80]">Scrape succeeded</span>
                      </div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ed-text-dim)]">Which format?</p>
                      <div className="mb-2.5 flex flex-wrap gap-1.5">
                        {FORMAT_STYLES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setCitFormatPick(s.id)}
                            className={`relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition active:translate-y-[1px] active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.3)] ${citFormatPick === s.id ? "bg-[var(--ed-surface-6)] text-[var(--ed-text)] ring-1 ring-[var(--ed-border-2)]" : "bg-[var(--ed-bg-pill)] text-[var(--ed-text-faint)] hover:bg-[var(--ed-surface-4)] hover:text-[var(--ed-text-muted)]"}`}
                          >
                            {s.label.split(" (")[0]}
                            {s.id === currentEssayFormat && (
                              <span className="rounded-[3px] bg-[#ea4335] px-[3px] py-[1px] text-[9px] font-bold leading-none text-white">current</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGenerateCitation(citPhase.url, citPhase.meta, citFormatPick)}
                        className="w-full rounded-full bg-[#ea4335] py-2 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]"
                      >
                        Generate Citation
                      </button>
                    </div>
                  )}

                  {/* Generating spinner */}
                  {citPhase.kind === "generating" && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-2xl bg-[#1e2530] px-3 py-1.5 text-[12px] text-[var(--ed-text-muted)]">
                      <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-[var(--ed-text-muted)] border-t-transparent" />
                      <span>Generating citation…</span>
                    </div>
                  )}

                  {/* Error */}
                  {citPhase.kind === "error" && (
                    <div className="mt-2 rounded-2xl border border-[#3a1f1f] bg-[#1e1208] p-2.5">
                      <p className="mb-1.5 text-[12px] text-[#fbbf24]">{citPhase.message}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setManualFormUrl(citPhase.url);
                          setCitMode("manual");
                          setCitPhase({ kind: "idle" });
                        }}
                        className="text-[12px] font-medium text-[#60a5fa] hover:text-[#93c5fd]"
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
                      <p className="mb-0.5 text-[11px] text-[var(--ed-text-dim)]">{label}</p>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-1.5 text-[12px] text-[var(--ed-text)] placeholder-[var(--ed-text-label)] outline-none focus:border-[var(--ed-text-dim)]"
                        placeholder={ph}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="mb-2">
                    <p className="mb-0.5 text-[11px] text-[var(--ed-text-dim)]">Full content (helps AI)</p>
                    <textarea
                      className="w-full rounded-2xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-1.5 text-[12px] text-[var(--ed-text)] placeholder-[var(--ed-text-label)] outline-none focus:border-[var(--ed-text-dim)]"
                      placeholder="Paste a summary or excerpt…"
                      rows={4}
                      value={manualContent}
                      onChange={(e) => setManualContent(e.target.value)}
                    />
                  </div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ed-text-dim)]">Which format?</p>
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {FORMAT_STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setCitFormatPick(s.id)}
                        className={`relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition active:translate-y-[1px] active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.3)] ${citFormatPick === s.id ? "bg-[var(--ed-surface-6)] text-[var(--ed-text)] ring-1 ring-[var(--ed-border-2)]" : "bg-[var(--ed-bg-pill)] text-[var(--ed-text-faint)] hover:bg-[var(--ed-surface-4)] hover:text-[var(--ed-text-muted)]"}`}
                      >
                        {s.label.split(" (")[0]}
                        {s.id === currentEssayFormat && (
                          <span className="rounded-[3px] bg-[#ea4335] px-[3px] py-[1px] text-[9px] font-bold leading-none text-white">current</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleManualGenerate()}
                    disabled={citPhase.kind === "generating" || (!manualAuthor.trim() && !manualPublisher.trim() && !manualContent.trim())}
                    className="w-full rounded-full bg-[#ea4335] py-2 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] disabled:opacity-40"
                  >
                    {citPhase.kind === "generating" ? "Generating…" : "Generate Citation"}
                  </button>
                </div>
              )}

              {/* ── Citation Cards ── */}
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--ed-text-muted)]">
                  Bibliography {citCards.length > 0 && `(${citCards.length})`}
                </span>
              </div>

              {citCards.length === 0 && (
                <p className="text-[11px] text-[var(--ed-text-label)]">
                  {citMode === "auto" ? "Scrape a URL above to generate citations." : "Fill in the form above to generate a citation."}
                </p>
              )}

              <div className="flex flex-col gap-2">
                {citCards.map((card, idx) => (
                  <div key={card.id} className="rounded-[8px] bg-[var(--ed-bg-pill)] p-2.5">
                    {/* Card header */}
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="flex-shrink-0 rounded-full bg-[var(--ed-surface-6)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ed-text-muted)]">{idx + 1}</span>
                      <p className="min-w-0 flex-1 truncate text-[10px] text-[var(--ed-text-dim)]">{card.url}</p>
                      <button type="button" onClick={() => removeCitCard(card.id)} className="flex-shrink-0 text-[var(--ed-text-dim)] hover:text-[#ef4444]">
                        <TrashIconSm />
                      </button>
                    </div>
                    {/* In-text */}
                    <div className="mb-1.5">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ed-text-dim)]">In-text citation</p>
                      <div className="flex items-start gap-1.5 rounded-[6px] bg-[var(--ed-surface-2)] px-2 py-1.5">
                        <p className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed text-[#93c5fd]">{card.inText}</p>
                        <button type="button" onClick={() => handleInsertInText(card.inText)} className="flex-shrink-0 rounded-[4px] bg-[var(--ed-surface-6)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ed-text-muted)] transition hover:bg-[#2e3647] hover:text-[var(--ed-text)]">Insert</button>
                      </div>
                    </div>
                    {/* Bibliography */}
                    <div>
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ed-text-dim)]">Bibliography</p>
                      <div className="flex items-start gap-1.5 rounded-[6px] bg-[var(--ed-surface-2)] px-2 py-1.5">
                        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--ed-text-muted)]">{card.bibliography}</p>
                        <button type="button" onClick={() => handleInsertBib(card.bibliography)} className="flex-shrink-0 rounded-[4px] bg-[var(--ed-surface-6)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ed-text-muted)] transition hover:bg-[#2e3647] hover:text-[var(--ed-text)]">Insert</button>
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
                <div className="flex-shrink-0 border-b border-[var(--ed-border)] px-3 py-3">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={dictInput}
                      onChange={(e) => setDictInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void searchDictionary(dictInput); }}
                      placeholder="Search a word…"
                      className="min-w-0 flex-1 rounded-xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-2 text-[13px] text-[var(--ed-text)] placeholder-[var(--ed-text-label)] outline-none transition focus:border-[#ea4335]/50"
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
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ed-border)" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                      <p className="text-[12px] text-[var(--ed-text-label)]">Type a word and press Enter</p>
                    </div>
                  )}

                  {/* Error */}
                  {dictError && (
                    <div className="rounded-xl border border-[#3a1f1f] bg-[#1a0f0f] px-3 py-2.5 text-[12px] text-[#f87171]" style={{ animation: "dict-in 0.2s ease-out" }}>
                      {dictError}
                    </div>
                  )}

                  {/* Result */}
                  {dictResult && (
                    <div style={{ animation: "dict-in 0.25s ease-out" }}>

                      {/* Word + phonetic */}
                      <div className="mb-3">
                        <h2 className="text-[20px] font-bold tracking-tight text-[var(--ed-text)]">{dictResult.word}</h2>
                        {dictResult.phonetic && (
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="text-[13px] text-[var(--ed-text-faint)]">{dictResult.phonetic}</span>
                            {dictResult.audioUrl && (
                              <button
                                type="button"
                                onClick={() => { try { new Audio(dictResult.audioUrl!).play(); } catch { /* ignore */ } }}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ed-bg-pill)] text-[#ea4335] transition hover:bg-[#ea4335] hover:text-white active:scale-[0.88]"
                                title="Play pronunciation"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="h-px bg-[var(--ed-surface-4)] mb-3" />

                      {/* Meanings */}
                      {dictResult.meanings.map((m, mi) => (
                        <div key={mi} className="mb-4" style={{ animation: `dict-in 0.25s ease-out ${mi * 0.06}s both` }}>

                          {/* Part of speech badge */}
                          <span className="mb-2 inline-block rounded-md bg-[#ea4335]/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-[#ea4335]">
                            {m.partOfSpeech}
                          </span>

                          {/* Definitions */}
                          <ol className="mb-2 flex flex-col gap-1.5 pl-1">
                            {m.definitions.map((d, di) => (
                              <li key={di} className="flex gap-2">
                                <span className="mt-[2px] flex-shrink-0 text-[10px] font-bold text-[var(--ed-text-label)]">{di + 1}.</span>
                                <div>
                                  <p className="text-[12px] leading-relaxed text-[var(--ed-status-text)]">{d.definition}</p>
                                  {d.example && (
                                    <p className="mt-0.5 text-[11px] italic leading-relaxed text-[#475569]">"{d.example}"</p>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>

                          {mi < dictResult.meanings.length - 1 && <div className="mt-3 h-px bg-[var(--ed-bg-pill)]" />}
                        </div>
                      ))}

                      {/* Synonyms — result level */}
                      {dictResult.synonyms.length > 0 && (
                        <div className="mt-3" style={{ animation: "dict-in 0.28s ease-out 0.15s both" }}>
                          <div className="h-px bg-[var(--ed-bg-pill)] mb-3" />
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Synonyms</p>
                          <div className="flex flex-wrap gap-1">
                            {dictResult.synonyms.map((w) => (
                              <button key={w} type="button" onClick={() => copyWord(w)}
                                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition active:scale-[0.88] ${copiedWord === w ? "bg-[#ea4335] text-white" : "bg-[var(--ed-bg-pill)] text-[var(--ed-text-muted)] hover:bg-[#ea4335]/20 hover:text-[var(--ed-text)]"}`}
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
                          <div className="h-px bg-[var(--ed-bg-pill)] mb-3" />
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Antonyms</p>
                          <div className="flex flex-wrap gap-1">
                            {dictResult.antonyms.map((w) => (
                              <button key={w} type="button" onClick={() => copyWord(w)}
                                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition active:scale-[0.88] ${copiedWord === w ? "bg-[#ea4335] text-white" : "bg-[var(--ed-bg-pill)] text-[#f87171] hover:bg-[#ea4335]/20 hover:text-[#fca5a5]"}`}
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
                <div className="flex-shrink-0 border-b border-[var(--ed-border)] px-3 py-3">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={thesInput}
                      onChange={(e) => setThesInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void searchThesaurus(thesInput); }}
                      placeholder="Find synonyms…"
                      className="min-w-0 flex-1 rounded-xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-2 text-[13px] text-[var(--ed-text)] placeholder-[var(--ed-text-label)] outline-none transition focus:border-[#ea4335]/50"
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
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ed-border)" strokeWidth="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      <p className="text-[12px] text-[var(--ed-text-label)]">Type a word to find alternatives</p>
                    </div>
                  )}

                  {/* Error */}
                  {thesError && (
                    <div className="rounded-xl border border-[#3a1f1f] bg-[#1a0f0f] px-3 py-2.5 text-[12px] text-[#f87171]" style={{ animation: "dict-in 0.2s ease-out" }}>
                      {thesError}
                    </div>
                  )}

                  {/* Result */}
                  {thesResult && (
                    <div style={{ animation: "dict-in 0.25s ease-out" }}>

                      <h2 className="mb-1 text-[18px] font-bold tracking-tight text-[var(--ed-text)]">{thesResult.word}</h2>
                      <p className="mb-3 text-[10px] text-[var(--ed-text-label)]">Click any word to copy it</p>

                      {/* Synonyms */}
                      {thesResult.synonyms.length > 0 && (
                        <div className="mb-4">
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Synonyms</p>
                            <span className="rounded-full bg-[var(--ed-bg-pill)] px-1.5 py-0.5 text-[10px] text-[var(--ed-text-dim)]">{thesResult.synonyms.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {thesResult.synonyms.map((w, i) => (
                              <button
                                key={w.word}
                                type="button"
                                onClick={() => copyWord(w.word)}
                                style={{ animation: `dict-in 0.2s ease-out ${i * 0.018}s both`, ...(copiedWord === w.word ? { animation: "chip-pop 0.25s ease-out" } : {}) }}
                                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition active:scale-[0.88] ${copiedWord === w.word ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-5)] text-[var(--ed-text-muted)] ring-1 ring-[var(--ed-border)] hover:bg-[#ea4335]/15 hover:text-[var(--ed-text)] hover:ring-[#ea4335]/30"}`}
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
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Antonyms</p>
                            <span className="rounded-full bg-[var(--ed-bg-pill)] px-1.5 py-0.5 text-[10px] text-[var(--ed-text-dim)]">{thesResult.antonyms.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {thesResult.antonyms.map((w, i) => (
                              <button
                                key={w.word}
                                type="button"
                                onClick={() => copyWord(w.word)}
                                style={{ animation: `dict-in 0.2s ease-out ${i * 0.018}s both`, ...(copiedWord === w.word ? { animation: "chip-pop 0.25s ease-out" } : {}) }}
                                className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition active:scale-[0.88] ${copiedWord === w.word ? "bg-[#ea4335] text-white" : "bg-[var(--ed-surface-5)] text-[#f87171] ring-1 ring-[var(--ed-border)] hover:bg-[#ea4335]/15 hover:text-[#fca5a5] hover:ring-[#ea4335]/30"}`}
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
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ed-bg-pill)] ring-1 ring-[var(--ed-border)]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ed-text-label)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[var(--ed-text)]">Sign in to use Source</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--ed-text-label)]">Citations, Dictionary &amp; Thesaurus<br/>are free to use</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void AuthService.signInWithGoogle().catch(() => showToast("Sign-in failed."))}
                      className="flex items-center gap-2 rounded-full border border-[var(--ed-border)] bg-[var(--ed-bg-pill)] px-4 py-2 text-[13px] font-medium text-[var(--ed-text)] transition hover:bg-[var(--ed-surface-6)] active:scale-[0.97]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      Sign in with Google
                    </button>
                  </div>
                ) : (
                  <>
                    {/* ── Sub-tab pills ── */}
                    <div className="flex-shrink-0 border-b border-[var(--ed-border)] px-3 py-2.5">
                      <div className="flex rounded-full glass-chip p-0.5">
                        {(["auto", "keyword", "intelligence", "uploads"] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setSourceSubTab(st)}
                            className={`flex-1 rounded-full py-1.5 text-[10.5px] font-medium transition active:scale-[0.97] ${sourceSubTab === st ? "bg-[var(--ed-surface-6)] text-[var(--ed-text)] shadow-sm" : "text-[var(--ed-text-dim)] hover:text-[var(--ed-text-muted)]"}`}
                          >
                            {st === "auto" ? "Auto Search" : st === "keyword" ? "Keyword" : st === "intelligence" ? "Intelligence" : "Uploads"}
                          </button>
                        ))}
                      </div>
                      {/* ── Docked controls ── */}
                      <div className="mt-2 flex items-center gap-3">
                        {([ ["autoSuggest", "Auto Suggest", autoSuggest, setAutoSuggest], ["autoHumanize", "Auto Humanize", autoHumanize, setAutoHumanize] ] as [string, string, boolean, (v: boolean) => void][]).map(([key, label, val, setter]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setter(!val)}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition active:scale-[0.96] ${val ? "border-[#0d9488]/40 bg-[#0d9488]/10 text-[#0d9488]" : "border-[var(--ed-border)] bg-transparent text-[var(--ed-text-dim)] hover:text-[var(--ed-text-faint)]"}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${val ? "bg-[#0d9488]" : "bg-[var(--ed-text-label)]"}`} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Uploads tab ── */}
                    {sourceSubTab === "uploads" && (
                      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                        {/* Upload button */}
                        <div className="flex-shrink-0 border-b border-[var(--ed-border)] px-3 py-3">
                          <input
                            ref={uploadInputRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.gif"
                            multiple
                            className="hidden"
                            onChange={(e) => { handleAddUploadFiles(e.target.files); e.target.value = ""; }}
                          />
                          <button
                            type="button"
                            onClick={() => uploadInputRef.current?.click()}
                            className="flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-[#ea4335]/40 bg-[#ea4335]/5 py-2.5 text-[12px] font-medium text-[#ea4335] transition hover:bg-[#ea4335]/10 active:scale-[0.97]"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Upload File
                            <span className="text-[10px] font-normal text-[var(--ed-text-dim)]">PDF · IMG</span>
                          </button>
                        </div>

                        {/* File list */}
                        <div className="flex-1 overflow-y-auto px-3 py-3">
                          {uploadedFiles.length === 0 && (
                            <div className="flex flex-col items-center gap-2 py-10 text-center">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ed-border)" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              <p className="text-[11.5px] text-[var(--ed-border)]">Upload a PDF or image to cite it</p>
                            </div>
                          )}

                          {/* Thumbnail grid */}
                          {uploadedFiles.length > 0 && (
                            <div className="mb-3 grid grid-cols-3 gap-2">
                              {uploadedFiles.map((uf) => (
                                <button
                                  key={uf.id}
                                  type="button"
                                  onClick={() => setUploadedFiles((prev) =>
                                    prev.map((f) => f.id === uf.id ? { ...f, expanded: !f.expanded } : f)
                                  )}
                                  className="group flex flex-col items-center gap-1 rounded-[10px] border border-[var(--ed-border)] bg-[var(--ed-surface-2)] p-1.5 transition hover:border-[#ea4335]/40 hover:bg-[var(--ed-bg-subbar)] active:scale-[0.96]"
                                  style={{ animation: "dict-in 0.28s ease-out both" }}
                                >
                                  <div
                                    className="flex h-14 w-full items-center justify-center overflow-hidden rounded-[7px] bg-[var(--ed-bg-pill)]"
                                    style={uf.result ? { borderBottom: "2px solid #22c55e" } : undefined}
                                  >
                                    {uf.isImage && uf.previewUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={uf.previewUrl} alt={uf.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ed-text-label)" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                    )}
                                  </div>
                                  <p className="w-full truncate text-center text-[9.5px] text-[var(--ed-text-dim)] group-hover:text-[var(--ed-text-muted)]">
                                    {uf.name.length > 14 ? uf.name.slice(0, 12) + "…" : uf.name}
                                  </p>
                                  {uf.result && (
                                    <span className="text-[8px] font-bold text-[#22c55e]">✓ cited</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Expanded file detail */}
                          {uploadedFiles.filter((f) => f.expanded).map((uf) => (
                            <div
                              key={uf.id}
                              className="mb-3 overflow-hidden rounded-[12px] border border-[var(--ed-border)] bg-[var(--ed-surface-2)]"
                              style={{ animation: "dict-in 0.25s ease-out both" }}
                            >
                              {/* Header */}
                              <div className="flex items-center gap-2 border-b border-[var(--ed-bg-pill)] px-3 py-2">
                                <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--ed-text-muted)]">{uf.name}</p>
                                {/* Remove */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (uf.previewUrl) URL.revokeObjectURL(uf.previewUrl);
                                    setUploadedFiles((prev) => prev.filter((f) => f.id !== uf.id));
                                    if (uf.result) setSourceResults((prev) => prev.filter((s) => s.url !== uf.result!.url));
                                  }}
                                  className="flex-shrink-0 rounded-full p-0.5 text-[var(--ed-text-label)] transition hover:text-[#f87171]"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                </button>
                              </div>

                              {/* Image preview */}
                              {uf.isImage && uf.previewUrl && (
                                <div className="border-b border-[var(--ed-bg-pill)] bg-[var(--ed-surface-3)] px-3 py-2">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={uf.previewUrl} alt={uf.name} className="max-h-36 w-full rounded-[8px] object-contain" />
                                </div>
                              )}

                              {/* Citation fields */}
                              <div className="flex flex-col gap-2 px-3 py-3">
                                {[
                                  { key: "citTitle",     label: "Title",     placeholder: "Document title" },
                                  { key: "citAuthor",    label: "Author",    placeholder: "e.g. Smith, John" },
                                  { key: "citYear",      label: "Year",      placeholder: "e.g. 2023" },
                                  { key: "citPublisher", label: "Publisher", placeholder: "e.g. Oxford University Press" },
                                ].map(({ key, label, placeholder }) => (
                                  <div key={key} className="flex items-center gap-2">
                                    <label className="w-[56px] flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--ed-text-label)]">{label}</label>
                                    <input
                                      type="text"
                                      value={(uf as unknown as Record<string, string>)[key] ?? ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setUploadedFiles((prev) =>
                                          prev.map((f) => f.id === uf.id ? { ...f, [key]: val } : f)
                                        );
                                      }}
                                      placeholder={placeholder}
                                      className="min-w-0 flex-1 rounded-[8px] border border-[var(--ed-border)] bg-[var(--ed-bg-subbar)] px-2.5 py-1.5 text-[12px] text-[var(--ed-text)] placeholder-[var(--ed-border)] outline-none transition focus:border-[#ea4335]/50"
                                    />
                                  </div>
                                ))}

                                {/* Error */}
                                {uf.scanError && (
                                  <p className="rounded-[8px] bg-[#1a0f0f] px-2.5 py-1.5 text-[11px] text-[#f87171]">{uf.scanError}</p>
                                )}

                                {/* Create Citation button */}
                                {!uf.result ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleScanUpload(uf.id)}
                                    disabled={uf.scanning}
                                    className="mt-1 flex items-center justify-center gap-2 rounded-full bg-[#ea4335] py-2 text-[12px] font-semibold text-white transition hover:bg-[#dc2626] active:scale-[0.97] disabled:opacity-50"
                                  >
                                    {uf.scanning ? (
                                      <>
                                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Scanning…
                                      </>
                                    ) : (
                                      <>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        Create Citation
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <div className="mt-1 flex items-center gap-2 rounded-full bg-[#0d2218] px-3 py-2">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                    <span className="text-[11px] font-semibold text-[#22c55e]">Source card added to results</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Input area (search tabs only) ── */}
                    {sourceSubTab !== "uploads" && (
                    <div className="flex-shrink-0 border-b border-[var(--ed-border)] px-3 py-3">

                      {sourceSubTab === "auto" && (
                        <div className="flex flex-col gap-2.5">
                          {onboardingTopic ? (
                            /* Topic from onboarding — show as context chip */
                            <div className="rounded-xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-2.5">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--ed-text-dim)]">Your topic</p>
                              <p className="text-[12px] leading-snug text-[var(--ed-status-text)]">{onboardingTopic}</p>
                              <p className="mt-1.5 text-[10.5px] text-[var(--ed-text-label)]">Sources will be found based on this topic.</p>
                            </div>
                          ) : (
                            <p className="text-[11.5px] leading-relaxed text-[#475569]">
                              AI reads your essay and finds the most relevant academic sources — no keyword needed.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => void runSourceSearch("auto")}
                            disabled={sourceLoading}
                            className="flex items-center justify-center gap-2 rounded-full bg-[#ea4335] py-2 text-[13px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)] disabled:opacity-50"
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
                            className="min-w-0 flex-1 rounded-xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-2 text-[13px] text-[var(--ed-text)] placeholder-[var(--ed-text-label)] outline-none transition focus:border-[#ea4335]/50 disabled:opacity-50"
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
                          <p className="text-[11.5px] text-[#475569]">Select any text in your essay to find supporting sources.</p>
                          <div className="min-h-[52px] rounded-xl border border-[var(--ed-border)] bg-[var(--ed-surface-2)] px-3 py-2">
                            {selectedEditorText
                              ? <p className="line-clamp-3 text-[12px] leading-relaxed text-[var(--ed-text-muted)]">"{selectedEditorText}"</p>
                              : <p className="text-[12px] italic text-[var(--ed-text-label)]">Highlight text in your essay…</p>
                            }
                          </div>
                          <button
                            type="button"
                            onClick={() => void runSourceSearch("intelligence")}
                            disabled={!selectedEditorText || sourceLoading}
                            className="flex items-center justify-center gap-2 rounded-full border border-[#ea4335]/40 bg-[#ea4335]/10 py-2 text-[12px] font-medium text-[#ea4335] transition hover:bg-[#ea4335]/20 active:scale-[0.97] disabled:opacity-40"
                          >
                            {sourceLoading
                              ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#ea4335] border-t-transparent" />Searching…</>
                              : "Search for sources"
                            }
                          </button>
                        </div>
                      )}
                    </div>
                    )} {/* end sourceSubTab !== "uploads" input area */}

                    {/* ── Status bar + Results (search tabs only) ── */}
                    {sourceSubTab !== "uploads" && <>
                    {/* ── Status bar ── */}
                    {(sourceStatus || sourceQuery) && (
                      <div className="flex-shrink-0 border-b border-[var(--ed-border)] bg-[var(--ed-surface-3)] px-3 py-2">
                        {sourceStatus && (
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 animate-spin rounded-full border-2 border-[var(--ed-text-dim)] border-t-transparent" />
                            <span className="text-[11px] text-[var(--ed-text-dim)]">{sourceStatus}</span>
                          </div>
                        )}
                        {sourceQuery && (
                          <div className="text-[11px]">
                            <span className="text-[var(--ed-text-label)]">AI query: </span>
                            <span className="text-[var(--ed-text-faint)] italic">{sourceQuery}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Results area ── */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">

                      {/* Error */}
                      {sourceError && (
                        <div className="rounded-xl border border-[#3a1f1f] bg-[#1a0f0f] px-3 py-2.5 text-[12px] text-[#f87171]" style={{ animation: "dict-in 0.2s ease-out" }}>
                          {sourceError}
                        </div>
                      )}

                      {/* Idle state */}
                      {!sourceLoading && !sourceError && sourceResults.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-2.5 py-10 text-center">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--ed-border)" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          <p className="text-[12px] text-[var(--ed-border)]">
                            {sourceSubTab === "auto" ? "Press Auto Search to find sources" : sourceSubTab === "keyword" ? "Type a keyword and search" : "Select text in your essay above"}
                          </p>
                        </div>
                      )}

                      {/* Loading skeleton while waiting for first result */}
                      {sourceLoading && sourceResults.length === 0 && (
                        <div className="flex flex-col gap-2">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="rounded-[12px] border border-[var(--ed-bg-pill)] bg-[var(--ed-surface-2)] p-3" style={{ opacity: 1 - i * 0.25 }}>
                              <div className="mb-2 h-2.5 w-14 animate-pulse rounded-full bg-[var(--ed-bg-pill)]" />
                              <div className="mb-1.5 h-3 w-full animate-pulse rounded-full bg-[var(--ed-bg-pill)]" />
                              <div className="h-3 w-2/3 animate-pulse rounded-full bg-[var(--ed-bg-pill)]" />
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
                          onAddToBib={(s) => void handleAddSourceToBib(s)}
                          bibAdding={bibAddingUrl === source.url}
                        />
                      ))}

                      {/* "Finding more…" indicator when sources are already streaming */}
                      {sourceLoading && sourceResults.length > 0 && (
                        <div className="flex items-center gap-2 py-2 text-[11px] text-[var(--ed-text-label)]">
                          <span className="h-2 w-2 animate-spin rounded-full border-2 border-[var(--ed-text-label)] border-t-transparent" />
                          Finding more sources…
                        </div>
                      )}

                    </div>
                    </> /* end search-tabs status+results */}
                  </>
                )}
              </div>
            )} {/* end source tab */}

          </div>
        </div>
        )}

        {/* ══ OCTO EXPANDED — floating glass card on the LEFT, editor on the right ══ */}
        {viewState === "editor" && octoExpanded && (
          <div
            className="liquid-glass absolute left-3 top-3 bottom-3 z-30 flex flex-col overflow-hidden rounded-[22px]"
            style={{
              width: OCTO_PANEL_W,
              animation: "octo-slide-in 0.36s cubic-bezier(0.22,1,0.36,1) both",
            }}
          >
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white ring-1 ring-[#ea4335]/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/OCTOPILOT.png" alt="Octo" className="h-5 w-5 object-contain" />
                </span>
                <span className="text-[14px] font-bold tracking-wide text-[var(--ed-text)]">Octo the Bot</span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Optional document highlighting toggle */}
                <button
                  type="button"
                  onClick={toggleHighlight}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition active:scale-[0.95] ${highlightEnabled ? "bg-[#ea4335]/15 text-[#ea4335]" : "bg-white/10 text-[var(--ed-text-dim)] hover:text-[var(--ed-text-muted)]"}`}
                  title={highlightEnabled ? "Highlighting on — click to turn off" : "Highlighting off — click to turn on"}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11-6 6v3h3l6-6"/><path d="m17 5 2 2"/><path d="M14.5 5.5 18 2l4 4-3.5 3.5z"/></svg>
                  Highlight
                </button>
                <button
                  type="button"
                  onClick={closeOctoExpanded}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[var(--ed-status-text)] transition hover:bg-white/20 hover:text-white active:scale-[0.92]"
                  title="Minimize"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <OctoChatPanel
              variant="expanded"
              chatTone={chatTone} setChatTone={setChatTone}
              chatMode={chatMode} setChatMode={setChatMode}
              chatStarted={chatStarted} chatMessages={chatMessages}
              chatLoading={chatLoading} chatInput={chatInput} setChatInput={setChatInput}
              sendChat={sendChat} chatEndRef={chatEndRef}
              essayCtx={rawContent.trim() || coreSnapshot.content.trim()}
              onJump={(id) => octoJumpRef.current?.(id)}
            />
          </div>
        )}

        {/* ══ Floating Octo (bottom-left) — OctoPilot logo + label, opens window ══ */}
        {viewState === "editor" && !octoExpanded && (
          <button
            type="button"
            onClick={openOctoExpanded}
            className="group absolute bottom-5 left-5 z-30 flex flex-col items-center gap-1.5 transition-transform duration-200 hover:scale-105 active:scale-95"
            title="Open Octo the Bot"
          >
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white ring-2 ring-[#ea4335] shadow-[0_6px_24px_rgba(234,67,53,0.45)] transition-shadow duration-200 group-hover:shadow-[0_8px_32px_rgba(234,67,53,0.7)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/OCTOPILOT.png" alt="Octo" className="h-9 w-9 object-contain" />
              <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#ea4335] opacity-20" style={{ animationDuration: "2.4s" }} />
            </span>
            <span className="rounded-full bg-[#ea4335] px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm">Octo the Bot</span>
          </button>
        )}

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
            <div className="flex max-h-[90vh] w-full max-w-[600px] flex-col rounded-[20px] bg-[var(--ed-bg-subbar)] shadow-2xl"
              style={{ border: `1px solid ${modalColor}40`, animation: "editor-enter 0.22s cubic-bezier(0.22,1,0.36,1) both" }}
            >
              {/* Modal header */}
              <div className="flex flex-shrink-0 items-start gap-3 border-b px-5 py-4" style={{ borderColor: `${modalColor}30` }}>
                <span
                  className="mt-[3px] flex-shrink-0 rounded-[5px] px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-wide"
                  style={{ background: `${modalColor}22`, color: modalColor }}
                >{typeLabel}</span>
                <p className="flex-1 text-[14px] font-semibold leading-snug text-[var(--ed-text)]">{source.title || domain}</p>
                <button
                  type="button"
                  onClick={() => { setSourceModal(null); setContentSelection(""); }}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[var(--ed-text-dim)] transition hover:bg-[var(--ed-surface-4)] hover:text-[var(--ed-text-muted)]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* Scrollable body */}
              <div className="min-h-0 flex-1 overflow-y-auto">

                {/* ── Source info ── */}
                <div className="border-b border-[var(--ed-surface-4)] px-5 py-4">
                  <div className="flex flex-col gap-1.5">
                    {source.author && (
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-[var(--ed-text-label)]">Author</span>
                        <span className="text-[var(--ed-text-muted)]">{source.author}</span>
                      </div>
                    )}
                    {source.publishedYear && (
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-[var(--ed-text-label)]">Year</span>
                        <span className="text-[var(--ed-text-muted)]">{source.publishedYear}</span>
                      </div>
                    )}
                    {source.publisher && (
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="text-[var(--ed-text-label)]">Publisher</span>
                        <span className="text-[var(--ed-text-muted)]">{source.publisher}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="text-[var(--ed-text-label)]">URL</span>
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
                <div className="border-b border-[var(--ed-surface-4)] px-5 py-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Full Content</span>
                    {contentSelection && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(contentSelection).catch(() => {});
                          setContentSelection("");
                          showToast("Copied ✓");
                        }}
                        className="flex items-center gap-1 rounded-full bg-[#ea4335] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#dc2626] active:scale-[0.95]"
                        style={{ animation: "chip-pop 0.18s ease-out" }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copy selected
                      </button>
                    )}
                  </div>
                  <div
                    className="max-h-[200px] overflow-y-auto rounded-xl border border-[var(--ed-surface-4)] bg-[var(--ed-surface-3)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--ed-text-faint)]"
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
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Citations</p>

                  {/* Style pills */}
                  <div className="mb-4 flex gap-1.5 flex-wrap">
                    {STYLES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSourceModal((prev) => {
                              if (!prev || prev.activeStyle === s) return prev;
                              // Clear suggestion cache so new style's citation is used
                              suggestCacheRef.current[prev.source.url] = [];
                              return { ...prev, activeStyle: s, suggestions: [], suggestLoading: false };
                            })}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold transition active:scale-[0.95] ${activeStyle === s ? "text-white" : "bg-[var(--ed-bg-pill)] text-[var(--ed-text-dim)] hover:text-[var(--ed-text-muted)]"}`}
                        style={activeStyle === s ? { background: modalColor } : undefined}
                      >
                        {STYLE_LABELS[s]}
                      </button>
                    ))}
                  </div>

                  {/* Loading */}
                  {citLoading && (
                    <div className="flex items-center gap-2 py-4 text-[12px] text-[var(--ed-text-dim)]">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--ed-text-dim)] border-t-transparent" />
                      Generating citations for all styles…
                    </div>
                  )}

                  {/* Error */}
                  {citError && !citLoading && (
                    <div className="rounded-xl border border-[#3a1f1f] bg-[#1a0f0f] px-3 py-2.5 text-[12px] text-[#f87171]">{citError}</div>
                  )}

                  {/* Citation boxes */}
                  {!citLoading && activeCit && (
                    <div className="flex flex-col gap-3">
                      {/* In-text */}
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">In-text Citation</p>
                        <div className="flex items-start gap-2 rounded-xl border border-[var(--ed-surface-4)] bg-[var(--ed-surface-3)] px-3 py-2.5">
                          <p className="min-w-0 flex-1 font-mono text-[12px] leading-relaxed text-[#93c5fd]">{activeCit.inText}</p>
                          <div className="flex flex-shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(activeCit.inText).catch(() => {}); showToast("In-text citation copied ✓"); }}
                              className="rounded-[5px] bg-[var(--ed-surface-4)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ed-text-faint)] transition hover:text-[var(--ed-text)]"
                            >Copy</button>
                            <button
                              type="button"
                              onClick={() => { handleInsertInText(activeCit.inText); setSourceModal(null); }}
                              className="rounded-[5px] bg-[#ea4335]/20 px-2 py-0.5 text-[10px] font-semibold text-[#ea4335] transition hover:bg-[#ea4335]/30"
                            >Insert</button>
                          </div>
                        </div>
                      </div>
                      {/* Bibliography */}
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Bibliography</p>
                        <div className="flex items-start gap-2 rounded-xl border border-[var(--ed-surface-4)] bg-[var(--ed-surface-3)] px-3 py-2.5">
                          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--ed-text-muted)]">{activeCit.bibliography}</p>
                          <div className="flex flex-shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(activeCit.bibliography).catch(() => {}); showToast("Bibliography copied ✓"); }}
                              className="rounded-[5px] bg-[var(--ed-surface-4)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ed-text-faint)] transition hover:text-[var(--ed-text)]"
                            >Copy</button>
                            <button
                              type="button"
                              onClick={() => { handleInsertBib(activeCit.bibliography); setSourceModal(null); }}
                              className="rounded-[5px] bg-[#ea4335]/20 px-2 py-0.5 text-[10px] font-semibold text-[#ea4335] transition hover:bg-[#ea4335]/30"
                            >Insert</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* No citation for this style yet */}
                  {!citLoading && !activeCit && !citError && (
                    <p className="text-[12px] text-[var(--ed-text-label)]">No citation generated for {STYLE_LABELS[activeStyle]}.</p>
                  )}
                </div>

                {/* ── Suggested continuation ── */}
                {autoSuggest && (
                  <div className="border-t border-[var(--ed-surface-4)] px-5 py-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--ed-text-label)]">Suggested</span>
                      {autoHumanize && (
                        <span className="rounded-full bg-[#0d9488]/15 px-2 py-0.5 text-[9px] font-semibold text-[#0d9488]">Humanized</span>
                      )}
                    </div>

                    {sourceModal.suggestLoading && (
                      <div className="flex items-center gap-2 py-3 text-[12px] text-[var(--ed-text-dim)]">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--ed-text-dim)] border-t-transparent" />
                        {autoHumanize ? "Generating & humanizing…" : "Generating suggestion…"}
                      </div>
                    )}

                    {sourceModal.suggestError && !sourceModal.suggestLoading && (
                      <p className="text-[12px] text-[#f87171]">{sourceModal.suggestError}</p>
                    )}

                    {!sourceModal.suggestLoading && sourceModal.suggestions.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {sourceModal.suggestions.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 rounded-xl border border-[var(--ed-surface-4)] bg-[var(--ed-surface-3)] px-3 py-2.5">
                            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-[#c4b5fd]">{s}</p>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(s).catch(() => {}); showToast("Suggestion copied ✓"); }}
                              className="flex-shrink-0 rounded-full bg-[var(--ed-surface-4)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ed-text-faint)] transition hover:text-[var(--ed-text)]"
                            >Copy</button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => void fetchSuggestion()}
                          disabled={sourceModal.suggestLoading}
                          className="self-start rounded-full border border-[var(--ed-border)] bg-[var(--ed-bg-subbar)] px-3 py-1 text-[11px] font-semibold text-[var(--ed-text-faint)] transition hover:border-[var(--ed-border-2)] hover:text-[var(--ed-text-muted)] active:scale-[0.96] disabled:opacity-40"
                        >+ more</button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })()}

      {/* Humanize Modal */}
      {(humanizePhase.kind === "ask" || humanizePhase.kind === "pick_provider" || humanizePhase.kind === "humanizing" || humanizePhase.kind === "error" || humanizePhase.kind === "login_required" || humanizePhase.kind === "insufficient_credits") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
          <div className="w-[400px] rounded-[18px] border border-[var(--ed-border)] bg-[var(--ed-bg-subbar)] p-6 shadow-2xl">

            {/* ── Ask: Humanize? ── */}
            {humanizePhase.kind === "ask" && (
              <>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ed-surface-4)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 6v6l4 2" /></svg>
                </div>
                <h2 className="mb-1 text-[16px] font-semibold text-[var(--ed-text)]">Humanize before exporting?</h2>
                <p className="mb-5 text-[14px] leading-relaxed text-[var(--ed-text-faint)]">Run your essay through an AI bypass humanizer to make it undetectable before downloading.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { if (onFinish) onFinish(humanizePhase.snapshot, coreSnapshot.formatStyle); setHumanizePhase({ kind: "idle" }); }}
                    className="flex-1 rounded-[10px] bg-[#ea4335] py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#dc2626] active:translate-y-[1px]"
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
                    className="flex-1 rounded-[10px] border border-[var(--ed-border)] py-2.5 text-[14px] font-medium text-[var(--ed-text-muted)] transition hover:bg-[var(--ed-surface-4)] hover:text-[var(--ed-text)] active:translate-y-[1px]"
                  >
                    Yes, Humanize →
                  </button>
                </div>
              </>
            )}

            {/* ── Pick Provider ── */}
            {humanizePhase.kind === "pick_provider" && (
              <>
                <h2 className="mb-1 text-[16px] font-semibold text-[var(--ed-text)]">Choose a humanizer</h2>
                <p className="mb-4 text-[14px] text-[var(--ed-text-faint)]">Select which AI bypass service to use.</p>
                <div className="mb-4 flex gap-3">
                  {/* Undetectable AI */}
                  <button
                    type="button"
                    onClick={() => void handleHumanize("UndetectableAI", humanizePhase.snapshot)}
                    className="flex flex-1 flex-col items-center gap-2 rounded-[12px] border border-[var(--ed-border)] bg-[var(--ed-surface-5)] px-3 py-4 transition hover:border-[var(--ed-border-2)] hover:bg-[var(--ed-bg-pill)]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d2218] text-[#4ade80]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 12s1.5-2 4-2 4 2 4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                    </div>
                    <span className="text-[13px] font-semibold text-[var(--ed-text)]">Undetectable AI</span>
                    <span className="text-center text-[11px] text-[var(--ed-text-dim)]">Async · University level</span>
                  </button>
                  {/* StealthGPT */}
                  <button
                    type="button"
                    onClick={() => void handleHumanize("StealthGPT", humanizePhase.snapshot)}
                    className="flex flex-1 flex-col items-center gap-2 rounded-[12px] border border-[var(--ed-border)] bg-[var(--ed-surface-5)] px-3 py-4 transition hover:border-[var(--ed-border-2)] hover:bg-[var(--ed-bg-pill)]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1e2a1a] text-[#86efac]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                    </div>
                    <span className="text-[13px] font-semibold text-[var(--ed-text)]">StealthGPT</span>
                    <span className="text-center text-[11px] text-[var(--ed-text-dim)]">Instant · Standard tone</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setHumanizePhase({ kind: "ask", snapshot: humanizePhase.snapshot })}
                  className="w-full rounded-[10px] py-2 text-[13px] text-[var(--ed-text-dim)] transition hover:text-[var(--ed-text-muted)]"
                >
                  ← Back
                </button>
              </>
            )}

            {/* ── Humanizing ── */}
            {humanizePhase.kind === "humanizing" && (
              <>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ed-surface-4)]">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-[#ea4335] border-t-transparent" />
                </div>
                <h2 className="mb-1 text-[16px] font-semibold text-[var(--ed-text)]">Humanizing with {humanizePhase.provider === "StealthGPT" ? "StealthGPT" : "Undetectable AI"}…</h2>
                <p className="text-[14px] text-[var(--ed-text-faint)]">
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
                <h2 className="mb-1 text-[16px] font-semibold text-[var(--ed-text)]">Humanization failed</h2>
                <p className="mb-4 text-[14px] text-[#fbbf24]">{humanizePhase.message}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHumanizePhase({ kind: "pick_provider", snapshot: humanizePhase.snapshot })}
                    className="flex-1 rounded-[10px] bg-[var(--ed-surface-4)] py-2.5 text-[14px] font-medium text-[var(--ed-text-muted)] transition hover:bg-[var(--ed-surface-6)]"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (onFinish) onFinish(humanizePhase.snapshot, coreSnapshot.formatStyle); setHumanizePhase({ kind: "idle" }); }}
                    className="flex-1 rounded-[10px] border border-[var(--ed-border)] py-2.5 text-[14px] font-medium text-[var(--ed-text-faint)] transition hover:text-[var(--ed-text-muted)]"
                  >
                    Skip — Download
                  </button>
                </div>
              </>
            )}

            {/* ── Login Required (standalone mode) ── */}
            {humanizePhase.kind === "login_required" && (
              <>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ed-surface-4)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea4335" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                </div>
                <h2 className="mb-1 text-[16px] font-semibold text-[var(--ed-text)]">Sign in to humanize</h2>
                <p className="mb-4 text-[14px] leading-relaxed text-[var(--ed-text-faint)]">Humanization uses your credits. Create a free account to get started — new users receive 300 humanizer credits.</p>
                {loginError && (
                  <p className="mb-3 rounded-[6px] bg-[#1e1208] px-3 py-2 text-[13px] text-[#fbbf24]">{loginError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void handleLoginGoogle()}
                  disabled={loginLoading}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--ed-border)] bg-[var(--ed-bg-pill)] py-2.5 text-[14px] font-medium text-[var(--ed-text)] transition hover:bg-[var(--ed-surface-6)] disabled:opacity-50"
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
                    className="mb-2 w-full rounded-[8px] border border-[var(--ed-border)] bg-[var(--ed-surface-5)] px-3 py-2 text-[14px] text-[var(--ed-text)] placeholder-[var(--ed-text-dim)] outline-none focus:border-[var(--ed-border-2)]"
                    required
                  />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Password"
                    className="mb-3 w-full rounded-[8px] border border-[var(--ed-border)] bg-[var(--ed-surface-5)] px-3 py-2 text-[14px] text-[var(--ed-text)] placeholder-[var(--ed-text-dim)] outline-none focus:border-[var(--ed-border-2)]"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loginLoading || !loginEmail || !loginPassword}
                    className="mb-2 w-full rounded-[10px] bg-[#ea4335] py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#dc2626] disabled:opacity-50"
                  >
                    {loginLoading ? "Signing in…" : "Sign In"}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => { setHumanizePhase({ kind: "idle" }); setLoginError(null); }}
                  className="w-full rounded-[10px] py-2 text-[13px] text-[var(--ed-text-dim)] transition hover:text-[var(--ed-text-muted)]"
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
                <h2 className="mb-1 text-[16px] font-semibold text-[var(--ed-text)]">Insufficient Credits</h2>
                <p className="mb-1 text-[14px] leading-relaxed text-[var(--ed-text-faint)]">
                  This essay requires <span className="text-[#fbbf24] font-medium">{humanizePhase.required} humanizer credits</span>, but you only have <span className="text-[var(--ed-text)] font-medium">{humanizePhase.available}</span>.
                </p>
                <p className="mb-5 text-[13px] text-[var(--ed-text-dim)]">Recharge your credits to continue, or skip humanization and download now.</p>
                <div className="mb-2 flex gap-2">
                  <div className="flex-1">
                    <StoreButton />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (onFinish) onFinish(humanizePhase.snapshot, coreSnapshot.formatStyle); setHumanizePhase({ kind: "idle" }); }}
                    className="flex-1 rounded-[10px] border border-[var(--ed-border)] py-2.5 text-[14px] font-medium text-[var(--ed-text-faint)] transition hover:text-[var(--ed-text-muted)]"
                  >
                    Skip — Download
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setHumanizePhase({ kind: "ask", snapshot: humanizePhase.snapshot })}
                  className="w-full rounded-[10px] py-2 text-[13px] text-[var(--ed-text-dim)] transition hover:text-[var(--ed-text-muted)]"
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
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[8px] bg-[var(--ed-surface-6)] px-4 py-2 text-[13px] font-medium text-[var(--ed-text)] shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Cinematic shutter entrance ── */}
      {!shutterDone && (
        <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
          <div
            className="absolute left-0 right-0 top-0 h-1/2 bg-[#0a0d11]"
            style={{ animation: 'shutter-top 1.05s cubic-bezier(0.76, 0, 0.24, 1) 0.18s both' }}
            onAnimationEnd={() => setShutterDone(true)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-1/2 bg-[#0a0d11]"
            style={{ animation: 'shutter-bottom 1.05s cubic-bezier(0.76, 0, 0.24, 1) 0.18s both' }}
          />
        </div>
      )}
    </div>
  );
}
