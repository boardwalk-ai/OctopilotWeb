"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParsedDocumentResult } from "@/app/api/formatter/parse/route";
import { fetchWithUserAuthorization } from "@/services/authenticatedFetch";
import { FormatterService } from "@/services/FormatterService";
import type { FormatStyleId } from "./FormatStyleView";
import styles from "./GhostciterDashboardView.module.css";

const DRAFT_KEY = "ghostciter_draft_v1";

/* US Letter page dimensions */
const GC_PAGE_W = 816;   // px  (8.5 in × 96 dpi)
const GC_PAGE_H = 1056;  // px  (11 in × 96 dpi)
const GC_SEP_H  = 32;    // px  dark strip between pages

interface GcPage { id: number; sectionIdx: number }

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* ── Format styles ───────────────────────────────────────────────────────────── */
const FORMAT_STYLES: { id: FormatStyleId; label: string; abbr: string; color: string }[] = [
  { id: "mla",     label: "MLA (8th Edition)",     abbr: "M", color: "#7c3aed" },
  { id: "apa",     label: "APA (7th Edition)",      abbr: "A", color: "#2563eb" },
  { id: "chicago", label: "Chicago (17th Edition)", abbr: "C", color: "#ea580c" },
  { id: "ieee",    label: "IEEE",                   abbr: "I", color: "#16a34a" },
  { id: "harvard", label: "Harvard",                abbr: "H", color: "#0369a1" },
];

/* ── Source types ────────────────────────────────────────────────────────────── */
type SourceType = "website" | "book" | "journal" | "newspaper" | "video" | "other";

const SOURCE_TYPES: { id: SourceType; label: string; fields: string[] }[] = [
  { id: "website",   label: "Website",   fields: ["Author", "Page Title", "Website Name", "Published Date", "URL", "Access Date"] },
  { id: "book",      label: "Book",      fields: ["Author(s)", "Title", "Publisher", "City", "Year", "Edition"] },
  { id: "journal",   label: "Journal",   fields: ["Author(s)", "Article Title", "Journal Name", "Volume", "Issue", "Pages", "Year", "DOI"] },
  { id: "newspaper", label: "Newspaper", fields: ["Author", "Article Title", "Newspaper Name", "Date", "Page"] },
  { id: "video",     label: "Video",     fields: ["Creator / Director", "Title", "Platform", "Year", "URL"] },
  { id: "other",     label: "Other",     fields: ["Author", "Title", "Source", "Year", "Notes"] },
];

/* ── In-text format helpers ──────────────────────────────────────────────────── */
function getInTextFormats(style: FormatStyleId): string[] {
  if (style === "mla")     return ["Author Page", "Author", "Page"];
  if (style === "apa")     return ["Author, Year", "Author", "Year"];
  if (style === "chicago") return ["Author Year", "Author", "Year, Page"];
  if (style === "ieee")    return ["[N]"];
  if (style === "harvard") return ["Author Year", "Author", "Year"];
  return ["Author Page"];
}

/* ── Parse status type ───────────────────────────────────────────────────────── */
type ParseStatus =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "done"; result: ParsedDocumentResult }
  | { kind: "error"; message: string };

/* ── Citation type ───────────────────────────────────────────────────────────── */
interface Citation {
  id: string;
  text: string;
}

/* ── Inline rich-text renderer (*text* → <em>) ───────────────────────────────── */
function RichText({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <em key={i}>{part}</em> : part
      )}
    </>
  );
}

/* ── Props ───────────────────────────────────────────────────────────────────── */
type GhostciterDashboardViewProps = {
  onBack: () => void;
  onContinue: (
    content: string,
    parsed: ParsedDocumentResult | null,
    citations: { id: string; text: string }[],
    formatStyle: FormatStyleId,
  ) => void;
};

/* ── SVG icons ───────────────────────────────────────────────────────────────── */
function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function ChevronLeftSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function DocumentIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* ── Component ───────────────────────────────────────────────────────────────── */
export default function GhostciterDashboardView({ onBack, onContinue }: GhostciterDashboardViewProps) {
  /* ── Document state ── */
  const [docTab, setDocTab] = useState<"paste" | "upload">("paste");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parseStatus, setParseStatus] = useState<ParseStatus>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);

  /* ── Format style ── */
  const [formatStyle, setFormatStyle] = useState<FormatStyleId>("mla");

  /* ── Citation state ── */
  const [citTab, setCitTab] = useState<"scrape" | "manual">("scrape");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>("website");
  const [manualFields, setManualFields] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  /* ── In-text citation ── */
  const [inTextSourceId, setInTextSourceId] = useState<string>("");
  const [inTextFormat, setInTextFormat] = useState<string>("");

  /* ── Real-page pagination state ── */
  const [gcPages,       setGcPages]       = useState<GcPage[]>([]);
  const [gcCurrentPage, setGcCurrentPage] = useState(1);

  /* ── Refs ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const midScrollRef = useRef<HTMLDivElement>(null);
  const gcPagesRef      = useRef<GcPage[]>([]);
  const gcEditorRefs    = useRef<Record<number, HTMLDivElement | null>>({});
  const gcShellRefs     = useRef<Record<number, HTMLDivElement | null>>({});
  const gcContentRef    = useRef<Record<number, string>>({});
  const gcNextId        = useRef(1);
  const gcRebalanceRef  = useRef<(fromId: number) => void>(() => {});
  const gcSectionMetaRef = useRef<Array<{ centerVertically?: boolean; lineHeight?: number; textAlign?: string; showPageNumber?: boolean }>>([]);

  /* ── Derived stats ── */
  const wordCount = useMemo(() => countWords(content), [content]);
  const charCount = content.length;
  const pageCount = useMemo(
    () => (wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 250))),
    [wordCount],
  );

  /* ── Style data helpers ── */
  const currentStyleData = FORMAT_STYLES.find((s) => s.id === formatStyle)!;
  const inTextFormats = useMemo(() => getInTextFormats(formatStyle), [formatStyle]);

  /* ── Sync inTextFormat when style changes ── */
  useEffect(() => {
    setInTextFormat(inTextFormats[0] ?? "");
  }, [inTextFormats]);

  /* ── Sync inTextSourceId when citations change ── */
  useEffect(() => {
    if (citations.length > 0 && !citations.find((c) => c.id === inTextSourceId)) {
      setInTextSourceId(citations[0]!.id);
    }
    if (citations.length === 0) setInTextSourceId("");
  }, [citations, inTextSourceId]);

  /* ── Toast ── */
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /* ── Draft: save ── */
  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ content, formatStyle, citations, fileName }));
      showToast("Draft saved");
    } catch {
      showToast("Could not save draft");
    }
  }, [content, formatStyle, citations, fileName, showToast]);

  /* ── Draft: restore on mount ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        content?: string; formatStyle?: FormatStyleId; citations?: Citation[]; fileName?: string;
      };
      if (draft.content) { setContent(draft.content); setFileName(draft.fileName ?? null); triggerParse(draft.content); }
      if (draft.formatStyle) setFormatStyle(draft.formatStyle);
      if (Array.isArray(draft.citations)) setCitations(draft.citations);
      setTimeout(() => showToast("Draft restored ✓"), 400);
    } catch { /* ignore corrupt drafts */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Cleanup ── */
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
  }, []);

  /* ── Background parse (debounced 800ms) ── */
  const triggerParse = useCallback((text: string) => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    if (!text.trim() || text.trim().length < 50) {
      setParseStatus({ kind: "idle" });
      return;
    }
    setParseStatus({ kind: "parsing" });
    parseTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetchWithUserAuthorization("/api/formatter/parse", {
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

  /* ── Content helpers ── */
  const applyContent = useCallback((text: string, name?: string) => {
    setContent(text);
    setFileName(name ?? null);
    triggerParse(text);
  }, [triggerParse]);

  /* ── File upload → send directly to parse API (AI reads all formats) ── */
  const applyFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".txt")) {
      showToast("Unsupported file type. Use .pdf, .docx, or .txt.");
      return;
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
        showToast(data.error ?? "Could not parse file.");
        return;
      }
      // Show the essay body in the textarea (AI extracted it)
      setContent(data.essay || "");
      setFileName(file.name);
      setParseStatus({ kind: "done", result: data });
      setDocTab("paste");
      showToast(`Loaded ${file.name}`);
    } catch {
      setParseStatus({ kind: "error", message: "Network error while reading file." });
      showToast("Network error while reading file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    if (fileName) setFileName(null);
    triggerParse(text);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void applyFile(file);
  };

  const clearDocument = () => {
    setContent("");
    setFileName(null);
    setParseStatus({ kind: "idle" });
  };

  /* ── Drag-drop on textarea ── */
  const handleTextAreaDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void applyFile(file);
  };

  /* ─── Pagination engine (ported from EditorView) ─── */

  const gcCleanup = useCallback((root: HTMLElement | null) => {
    if (!root) return;
    const unwrap = (el: HTMLElement) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    };
    const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let tn = textWalker.nextNode();
    while (tn) {
      const t = tn as Text;
      if (t.nodeValue?.includes("​")) t.nodeValue = t.nodeValue.replace(/​/g, "");
      tn = textWalker.nextNode();
    }
    const spans = Array.from(root.querySelectorAll("span"));
    for (const span of spans) {
      const text = (span.textContent || "").replace(/​/g, "");
      if (span.children.length === 0 && text.trim().length === 0) {
        text.length === 0 ? span.remove() : span.replaceWith(document.createTextNode(" "));
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      const sizedSpans = Array.from(root.querySelectorAll("span")).filter(
        (n) => n instanceof HTMLElement && !!(n as HTMLElement).style.fontSize
      ) as HTMLElement[];
      for (const span of sizedSpans) {
        const kids = Array.from(span.childNodes);
        const meaningful = kids.filter((n) => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim());
        const elKids = kids.filter((n) => n.nodeType === Node.ELEMENT_NODE) as HTMLElement[];
        if (elKids.length > 0 && meaningful.length === 0) { unwrap(span); changed = true; break; }
        const parent = span.parentElement;
        if (parent instanceof HTMLElement && parent.tagName === "SPAN" && parent.style.fontSize) {
          const others = Array.from(parent.childNodes).filter((n) => {
            if (n === span) return false;
            if (n.nodeType === Node.TEXT_NODE) return !!n.textContent?.trim();
            return true;
          });
          if (others.length === 0) { unwrap(parent); changed = true; break; }
        }
      }
    }
    root.normalize();
  }, []);

  const gcIsEmpty = useCallback((root: HTMLElement | null) => {
    if (!root) return true;
    const text = (root.textContent || "").replace(/​/g, "").trim();
    if (text.length > 0) return false;
    if (root.querySelector("img,video,audio,iframe,table,hr")) return false;
    return true;
  }, []);

  const gcMoveOverflow = useCallback((source: HTMLElement, target: HTMLElement) => {
    const adjustSplit = (text: string, keep: number) => {
      let k = keep;
      const left = text.slice(0, k);
      const right = text.slice(k);
      if (/^[A-Za-z0-9]/.test(right) && /[A-Za-z0-9]$/.test(left)) {
        const idx = Math.max(left.lastIndexOf(" "), left.lastIndexOf("\t"), left.lastIndexOf("\n"), left.lastIndexOf("-"));
        if (idx > 0) k = idx + 1;
      }
      return Math.max(0, Math.min(k, text.length - 1));
    };

    if (target.childNodes.length === 1 && target.firstChild?.nodeName === "BR") target.innerHTML = "";
    const last = source.lastChild;
    if (!last) return false;

    if (last.nodeType === Node.TEXT_NODE) {
      const tn = last as Text;
      const orig = tn.nodeValue || "";
      if (!orig.length) { tn.remove(); return true; }
      let keep = 0, low = 0, high = orig.length;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        tn.nodeValue = orig.slice(0, mid);
        source.scrollHeight > source.clientHeight + 1 ? (high = mid - 1) : ((keep = mid), (low = mid + 1));
      }
      if (keep >= orig.length) keep = Math.max(0, orig.length - 1);
      keep = adjustSplit(orig, keep);
      let keepTxt = orig.slice(0, keep);
      let moveTxt = orig.slice(keep).replace(/^[ \t]+/, "");
      if (!moveTxt.length) { keepTxt = orig.slice(0, Math.max(0, orig.length - 1)); moveTxt = orig.slice(keepTxt.length).replace(/^[ \t]+/, ""); }
      if (keepTxt.length === 0) tn.remove(); else tn.nodeValue = keepTxt;
      target.insertBefore(document.createTextNode(moveTxt), target.firstChild);
      return true;
    }

    if (last instanceof HTMLElement) {
      if (last.dataset.keepWithNext === "1") { target.insertBefore(last, target.firstChild); return true; }
      const frag = last.cloneNode(false) as HTMLElement;
      if (frag.style) { frag.style.textIndent = "0"; frag.style.marginTop = "0"; }
      let movedAny = false;
      target.insertBefore(frag, target.firstChild);
      while (source.scrollHeight > source.clientHeight + 1 && last.lastChild) {
        const child = last.lastChild;
        if (child.nodeType === Node.TEXT_NODE) {
          const tn = child as Text;
          const orig = tn.nodeValue || "";
          if (!orig.length) { tn.remove(); continue; }
          let keep = 0, low = 0, high = orig.length;
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            tn.nodeValue = orig.slice(0, mid);
            source.scrollHeight > source.clientHeight + 1 ? (high = mid - 1) : ((keep = mid), (low = mid + 1));
          }
          if (keep >= orig.length) keep = Math.max(0, orig.length - 1);
          keep = adjustSplit(orig, keep);
          let keepTxt = orig.slice(0, keep);
          let moveTxt = orig.slice(keep).replace(/^[ \t]+/, "");
          if (!moveTxt.length) { keepTxt = orig.slice(0, Math.max(0, orig.length - 1)); moveTxt = orig.slice(keepTxt.length).replace(/^[ \t]+/, ""); }
          if (keepTxt.length === 0) tn.remove(); else tn.nodeValue = keepTxt;
          frag.insertBefore(document.createTextNode(moveTxt), frag.firstChild);
          movedAny = true;
          continue;
        }
        frag.insertBefore(child, frag.firstChild);
        movedAny = true;
      }
      if (!last.textContent?.trim() && last.children.length === 0) last.remove();
      if (!movedAny || (!frag.textContent?.trim() && frag.children.length === 0)) frag.remove();
      return movedAny;
    }

    target.insertBefore(last, target.firstChild);
    return true;
  }, []);

  const gcMoveUnderflow = useCallback((source: HTMLElement, target: HTMLElement) => {
    let first: ChildNode | null = source.firstChild;
    while (first && first.nodeType === Node.TEXT_NODE && !(first.textContent || "").trim()) {
      const next = first.nextSibling; first.remove(); first = next;
    }
    if (!first) return false;
    if (first instanceof HTMLElement && first.dataset.keepWithNext === "1") return false;
    if (target.childNodes.length === 1 && target.firstChild?.nodeName === "BR") target.innerHTML = "";
    target.appendChild(first);
    return true;
  }, []);

  const gcRebalance = useCallback((startPageId: number) => {
    const startIdx = gcPagesRef.current.findIndex((p) => p.id === startPageId);
    if (startIdx < 0) return;

    /* ── Overflow pass ── */
    for (let i = startIdx; i < gcPagesRef.current.length; i++) {
      const page = gcPagesRef.current[i];
      const el   = gcEditorRefs.current[page.id];
      if (!el) continue;
      if (gcSectionMetaRef.current[page.sectionIdx]?.centerVertically) continue;

      gcCleanup(el);

      while (el.scrollHeight > el.clientHeight + 1) {
        const nextPage = gcPagesRef.current[i + 1];
        const needNew  = !nextPage || nextPage.sectionIdx !== page.sectionIdx;

        if (needNew) {
          const newId = gcNextId.current++;
          gcContentRef.current[newId] = "<br/>";
          setGcPages((prev) => {
            const at   = i + 1;
            const next = [...prev.slice(0, at), { id: newId, sectionIdx: page.sectionIdx }, ...prev.slice(at)];
            gcPagesRef.current = next;
            return next;
          });
          requestAnimationFrame(() => gcRebalanceRef.current(startPageId));
          return;
        }

        const nextEl = gcEditorRefs.current[nextPage.id];
        if (!nextEl) { requestAnimationFrame(() => gcRebalanceRef.current(startPageId)); return; }

        gcCleanup(nextEl);
        const moved = gcMoveOverflow(el, nextEl);
        gcCleanup(el);
        gcCleanup(nextEl);
        if (!moved) break;
      }
    }

    /* ── Underflow / backfill pass ── */
    for (let i = startIdx; i < gcPagesRef.current.length - 1; i++) {
      const page     = gcPagesRef.current[i];
      const nextPage = gcPagesRef.current[i + 1];
      if (nextPage.sectionIdx !== page.sectionIdx) continue; // no cross-section flow
      const el     = gcEditorRefs.current[page.id];
      const nextEl = gcEditorRefs.current[nextPage.id];
      if (!el || !nextEl) continue;
      if (gcSectionMetaRef.current[page.sectionIdx]?.centerVertically) continue;

      gcCleanup(el);
      gcCleanup(nextEl);

      while (!gcIsEmpty(nextEl) && el.scrollHeight < el.clientHeight - 2) {
        const moved = gcMoveUnderflow(nextEl, el);
        gcCleanup(el);
        gcCleanup(nextEl);
        if (!moved) break;
        if (el.scrollHeight > el.clientHeight + 1) {
          const last = el.lastChild;
          if (last) nextEl.insertBefore(last, nextEl.firstChild);
          gcCleanup(el);
          gcCleanup(nextEl);
          break;
        }
      }
    }

    /* ── Trim trailing empty overflow pages ── */
    const removable: number[] = [];
    for (let i = gcPagesRef.current.length - 1; i >= 0; i--) {
      const page = gcPagesRef.current[i];
      const isFirstOfSection = i === 0 || gcPagesRef.current[i - 1].sectionIdx !== page.sectionIdx;
      if (isFirstOfSection) break;
      const el = gcEditorRefs.current[page.id];
      if (gcIsEmpty(el ?? null)) removable.push(page.id);
      else break;
    }
    if (removable.length > 0) {
      setGcPages((prev) => {
        const next = prev.filter((p) => !removable.includes(p.id));
        gcPagesRef.current = next;
        return next;
      });
      for (const id of removable) {
        delete gcContentRef.current[id];
        delete gcEditorRefs.current[id];
        delete gcShellRefs.current[id];
      }
    }

    /* ── Save content snapshot ── */
    for (const page of gcPagesRef.current) {
      const el = gcEditorRefs.current[page.id];
      if (el) gcContentRef.current[page.id] = el.innerHTML || "<br/>";
    }
  }, [gcCleanup, gcIsEmpty, gcMoveOverflow, gcMoveUnderflow]);

  useEffect(() => { gcRebalanceRef.current = gcRebalance; }, [gcRebalance]);

  /* ── Formatted output ── */
  const citationBibText = useMemo(
    () => citations.map((c) => c.text).join("\n\n"),
    [citations],
  );

  const parsedResult = parseStatus.kind === "done" ? parseStatus.result : null;

  const formattedOutput = useMemo(() => {
    if (!content.trim()) return null;
    const p = parsedResult;
    const formatter = FormatterService.getFormatter(formatStyle);
    // Merge AI-extracted bibliography with manually added citations
    const combinedBib = [p?.bibliography, citationBibText].filter(Boolean).join("\n\n");
    return formatter.format({
      essay: p?.essay ?? content,
      bibliography: combinedBib,
      finalEssayTitle: p?.finalEssayTitle ?? "",
      studentName: p?.studentName ?? "",
      instructorName: p?.instructorName ?? "",
      institutionName: p?.institutionName ?? "",
      courseInfo: p?.courseInfo ?? "",
      subjectCode: p?.subjectCode ?? "",
      essayDate: p?.essayDate ?? "",
    });
  }, [content, parsedResult, formatStyle, citationBibText]);

  /* ── Sync formatted output → real pages ── */
  useEffect(() => {
    if (!formattedOutput?.pages?.length) {
      gcEditorRefs.current = {};
      gcShellRefs.current  = {};
      gcContentRef.current = {};
      gcNextId.current     = 1;
      gcPagesRef.current   = [];
      setGcPages([]);
      setGcCurrentPage(1);
      return;
    }

    gcSectionMetaRef.current = formattedOutput.pages.map((p) => ({
      centerVertically: p.centerVertically,
      lineHeight:       p.lineHeight,
      textAlign:        p.textAlign,
      showPageNumber:   p.showPageNumber,
    }));

    gcEditorRefs.current = {};
    gcShellRefs.current  = {};
    gcContentRef.current = {};
    gcNextId.current     = 1;

    const initial: GcPage[] = formattedOutput.pages.map((sec, sectionIdx) => {
      const id = gcNextId.current++;
      gcContentRef.current[id] = sec.content || "<br/>";
      return { id, sectionIdx };
    });

    gcPagesRef.current = initial;
    setGcPages(initial);
    setGcCurrentPage(1);

    // After React commits the new divs (hydration happens in ref callback),
    // run the rebalance pass.
    requestAnimationFrame(() => {
      const first = gcPagesRef.current.find(
        (p) => !gcSectionMetaRef.current[p.sectionIdx]?.centerVertically
      );
      if (first) gcRebalanceRef.current(first.id);
    });
  }, [formattedOutput]);

  /* ── Page input handler ── */
  const gcHandleInput = useCallback((pageId: number) => {
    const el = gcEditorRefs.current[pageId];
    if (el) gcContentRef.current[pageId] = el.innerHTML || "<br/>";
    gcRebalanceRef.current(pageId);
  }, []);

  /* ── Scroll → current page tracker ── */
  useEffect(() => {
    const viewport = midScrollRef.current;
    if (!viewport) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const anchorY = viewport.scrollTop + viewport.clientHeight * 0.28;
      let nearestId  = gcPagesRef.current[0]?.id ?? -1;
      let nearestDist = Infinity;
      for (const p of gcPagesRef.current) {
        const shell = gcShellRefs.current[p.id];
        if (!shell) continue;
        const dist = Math.abs(shell.offsetTop - anchorY);
        if (dist < nearestDist) { nearestDist = dist; nearestId = p.id; }
      }
      const idx = gcPagesRef.current.findIndex((p) => p.id === nearestId);
      if (idx >= 0) setGcCurrentPage(idx + 1);
    };
    const onScroll = () => { if (raf) return; raf = window.requestAnimationFrame(update); };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => { viewport.removeEventListener("scroll", onScroll); if (raf) window.cancelAnimationFrame(raf); };
  }, [gcPages]);

  /* ── Scroll to physical page ── */
  const gcScrollToPage = useCallback((pageNum: number) => {
    const page = gcPagesRef.current[pageNum - 1];
    if (!page) return;
    gcShellRefs.current[page.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setGcCurrentPage(pageNum);
  }, []);

  /* ── Scrape citation ── */
  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeMsg(null);
    try {
      const res = await fetch("/api/spoonie/citation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "CITATION_PREVIEW",
          input: { url: scrapeUrl.trim(), style: formatStyle.toUpperCase() },
        }),
      });
      const data = (await res.json()) as { citation?: string; error?: string };
      if (!res.ok || !data.citation) {
        setScrapeMsg({ type: "error", text: data.error ?? "Could not extract citation." });
        return;
      }
      setCitations((prev) => [...prev, { id: crypto.randomUUID(), text: data.citation! }]);
      setScrapeUrl("");
      setScrapeMsg({ type: "ok", text: "Citation added!" });
      setTimeout(() => setScrapeMsg(null), 2500);
    } catch {
      setScrapeMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setScraping(false);
    }
  };

  /* ── Manual add citation ── */
  const handleManualAdd = async () => {
    setAdding(true);
    setAddMsg(null);
    try {
      const res = await fetch("/api/spoonie/citation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "FIELDWORK_CITATION",
          input: { type: sourceType, style: formatStyle.toUpperCase(), ...manualFields },
        }),
      });
      const data = (await res.json()) as { citation?: string; error?: string };
      if (!res.ok || !data.citation) {
        setAddMsg({ type: "error", text: data.error ?? "Could not format citation." });
        return;
      }
      setCitations((prev) => [...prev, { id: crypto.randomUUID(), text: data.citation! }]);
      setManualFields({});
      setAddMsg({ type: "ok", text: "Citation added!" });
      setTimeout(() => setAddMsg(null), 2500);
    } catch {
      setAddMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setAdding(false);
    }
  };

  /* ── Edit / delete citations ── */
  const startEdit = (c: Citation) => { setEditingId(c.id); setEditText(c.text); };
  const saveEdit = () => {
    if (!editingId) return;
    setCitations((prev) =>
      prev.map((c) => c.id === editingId ? { ...c, text: editText.trim() || c.text } : c)
    );
    setEditingId(null);
  };
  const deleteCitation = (id: string) => setCitations((prev) => prev.filter((c) => c.id !== id));

  /* ── Manual fields helpers ── */
  const currentSourceFields = SOURCE_TYPES.find((s) => s.id === sourceType)?.fields ?? [];
  const canManualAdd = currentSourceFields.some((f) => manualFields[f]?.trim());

  /* ── Parse status rendered ── */
  const styleLabels: Record<string, string> = {
    mla: "MLA", apa: "APA", chicago: "Chicago", ieee: "IEEE", harvard: "Harvard",
  };

  function renderParseStatus() {
    if (parseStatus.kind === "idle" || !content.trim()) return null;
    if (parseStatus.kind === "parsing") {
      return (
        <div className={styles.parseStatus}>
          <span className={styles.parseSpinner} />
          <span>Analysing document structure…</span>
        </div>
      );
    }
    if (parseStatus.kind === "done") {
      const label = styleLabels[parseStatus.result.detectedStyle];
      return (
        <div className={`${styles.parseStatus} ${styles.parseStatusOk}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>
            {label
              ? `Detected: ${label} format · analysed by AI`
              : `Document structure analysed by AI`}
          </span>
        </div>
      );
    }
    if (parseStatus.kind === "error") {
      return (
        <div className={`${styles.parseStatus} ${styles.parseStatusWarn}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{parseStatus.message} — you can still continue.</span>
        </div>
      );
    }
    return null;
  }

  const canContinue = content.trim().length > 0 && parseStatus.kind !== "parsing";


  /* ── Render ─────────────────────────────────────────────────────────────────── */
  return (
    <div className={styles.shell}>
      {/* ── Top nav ─────────────────────────────────────────────────────────── */}
      <div className={styles.topNav}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <ChevronLeft />
          Back
        </button>

        <div className={styles.navBadge}>
          <span className={styles.navBadgeDot} />
          Formatter Tool
        </div>

        <div className={styles.navSpacer} />

        <button type="button" className={styles.saveDraftBtn} onClick={saveDraft} disabled={!content.trim()}>
          Save Draft
        </button>

        <button
          type="button"
          className={styles.continueBtn}
          disabled={!canContinue}
          onClick={() => {
            const editedHtml = gcPagesRef.current
              .map((p) => gcEditorRefs.current[p.id]?.innerHTML || gcContentRef.current[p.id] || "")
              .join("") || content;
            onContinue(editedHtml, parsedResult, citations, formatStyle);
          }}
        >
          Open Full Editor
          <ArrowRight />
        </button>
      </div>

      {/* ── 3-column body ───────────────────────────────────────────────────── */}
      <div className={styles.body}>

        {/* ═══════════════════════════════════════════════════════════════════
            LEFT COLUMN — Document + Style
        ═══════════════════════════════════════════════════════════════════ */}
        <div className={styles.colLeft}>
          {/* Section 1 header */}
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>1 Your Document</p>
            <p className={styles.sectionSubtitle}>Paste, type, or upload your essay</p>
          </div>

          {/* Tabs */}
          <div className={styles.tabRow}>
            <button
              type="button"
              className={`${styles.tab} ${docTab === "paste" ? styles.tabActive : ""}`}
              onClick={() => setDocTab("paste")}
            >
              Paste Text
            </button>
            <button
              type="button"
              className={`${styles.tab} ${docTab === "upload" ? styles.tabActive : ""}`}
              onClick={() => setDocTab("upload")}
            >
              Upload File
            </button>
          </div>

          {/* Paste tab */}
          {docTab === "paste" && (
            <>
              <textarea
                className={`${styles.textarea} ${dragOver ? styles.textareaDragOver : ""}`}
                value={content}
                onChange={handleTextChange}
                placeholder="Paste or type your document here…"
                aria-label="Document content"
                onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleTextAreaDrop}
              />
              <div className={styles.wordCountRow}>
                <span>{wordCount.toLocaleString()} words</span>
                <span>{charCount.toLocaleString()} chars</span>
              </div>
              {renderParseStatus()}
            </>
          )}

          {/* Upload tab */}
          {docTab === "upload" && (
            <>
              <div
                className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneDrag : ""}`}
                onClick={() => fileInputRef.current?.click()}
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
                <div className={styles.uploadZoneIcon}>
                  <UploadIcon />
                </div>
                <p className={styles.uploadZoneText}>
                  {isUploading ? "Reading file…" : "Drop file here or click to browse"}
                </p>
                <p className={styles.uploadZoneHint}>Accepts .docx, .txt, .pdf</p>
              </div>
              {content && !isUploading && (
                <div className={styles.fileChip}>
                  <FileIcon />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                    {fileName ?? "Pasted document"}
                  </span>
                  <button type="button" className={styles.chipClear} onClick={clearDocument} aria-label="Clear">
                    ×
                  </button>
                </div>
              )}
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className={styles.hiddenInput}
            accept=".docx,.txt,.pdf"
            onChange={handleFileChange}
          />

          {/* File chip when in paste tab + file loaded */}
          {docTab === "paste" && fileName && (
            <div className={styles.fileChip}>
              <FileIcon />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{fileName}</span>
              <button type="button" className={styles.chipClear} onClick={clearDocument} aria-label="Clear">
                ×
              </button>
            </div>
          )}

          {/* Supported formats */}
          <div className={styles.formatsRow}>
            <p className={styles.formatsLabel}>Supported:</p>
            <span className={styles.formatBadge}>.docx</span>
            <span className={styles.formatBadge}>.txt</span>
            <span className={styles.formatBadge}>.pdf</span>
          </div>

          {/* Stats bar */}
          <div className={styles.statsBar}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Words</span>
              <span className={styles.statValue}>{wordCount.toLocaleString()}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Chars</span>
              <span className={styles.statValue}>{charCount.toLocaleString()}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Pages</span>
              <span className={styles.statValue}>{pageCount}</span>
            </div>
          </div>

          <hr className={styles.divider} />

          {/* Section 2 header */}
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>2 Choose Format Style</p>
            <p className={styles.sectionSubtitle}>Select your citation style</p>
          </div>

          {/* Style radio list */}
          <div className={styles.styleList}>
            {FORMAT_STYLES.map((s) => (
              <div
                key={s.id}
                className={`${styles.styleItem} ${formatStyle === s.id ? styles.styleItemActive : ""}`}
                onClick={() => setFormatStyle(s.id)}
                role="radio"
                aria-checked={formatStyle === s.id}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setFormatStyle(s.id); }}
              >
                <div
                  className={styles.styleBadge}
                  style={{ background: s.color }}
                >
                  {s.abbr}
                </div>
                <span className={styles.styleLabel}>{s.label}</span>
                <div
                  className={`${styles.styleRadio} ${formatStyle === s.id ? styles.styleRadioActive : ""}`}
                />
              </div>
            ))}
          </div>

          <p className={styles.styleNote}>You can change the format later in the editor.</p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            MIDDLE COLUMN — Real-page formatted preview
        ═══════════════════════════════════════════════════════════════════ */}
        <div className={styles.colMid}>
          {/* Mid header */}
          <div className={styles.midHeader}>
            <span className={styles.midTitle}>
              {formattedOutput
                ? `Formatted Preview (${currentStyleData.label})`
                : "Formatted Preview"}
            </span>
          </div>

          {/* Scrollable paper area */}
          <div ref={midScrollRef} className={styles.midScrollArea}>
            <div className={styles.paperContainer}>
              {gcPages.length > 0 ? (
                <div className={styles.pageStack}>
                  {gcPages.map((page, idx) => {
                    const meta      = gcSectionMetaRef.current[page.sectionIdx] ?? {};
                    const isCentered = meta.centerVertically ?? false;
                    const lineH      = meta.lineHeight ?? 2;
                    const textAlign  = (meta.textAlign ?? "left") as React.CSSProperties["textAlign"];
                    const profile    = formattedOutput!.profile;
                    const marginPx   = (profile.marginInch ?? 1) * 96;
                    const font       = profile.defaultFont ?? "Times New Roman";

                    return (
                      <div key={page.id}>
                        {idx > 0 && <div className={styles.pageSeparator} />}
                        <div
                          ref={(el) => { gcShellRefs.current[page.id] = el; }}
                          className={styles.pageShell}
                        >
                          <div
                            ref={(el) => {
                              gcEditorRefs.current[page.id] = el;
                              if (el && el.dataset.gcHydrated !== "1") {
                                el.innerHTML = gcContentRef.current[page.id] || "<br/>";
                                el.dataset.gcHydrated = "1";
                              }
                            }}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={() => gcHandleInput(page.id)}
                            className={isCentered ? styles.pageEditableCentered : styles.pageEditable}
                            style={{
                              padding:    `${marginPx}px`,
                              fontFamily: font,
                              fontSize:   "12pt",
                              lineHeight: String(lineH),
                              textAlign,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.paperEmpty}>
                  <div className={styles.paperEmptyIcon}>
                    <DocumentIcon />
                  </div>
                  <span>Your formatted preview will appear here…</span>
                  <span style={{ fontSize: "11px", opacity: 0.6 }}>
                    Paste or upload a document to get started
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Page navigation */}
          {gcPages.length > 0 && (
            <div className={styles.pageNav}>
              <button
                type="button"
                className={styles.pageNavBtn}
                disabled={gcCurrentPage <= 1}
                onClick={() => gcScrollToPage(gcCurrentPage - 1)}
                title="Previous page"
              >
                <ChevronLeftSm />
              </button>
              <span className={styles.pageNavText}>
                {gcCurrentPage} of {gcPages.length}
              </span>
              <button
                type="button"
                className={styles.pageNavBtn}
                disabled={gcCurrentPage >= gcPages.length}
                onClick={() => gcScrollToPage(gcCurrentPage + 1)}
                title="Next page"
              >
                <ChevronRight />
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            RIGHT COLUMN — Citations
        ═══════════════════════════════════════════════════════════════════ */}
        <div className={styles.colRight}>
          {/* Section 3 header */}
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>3 Add Citations</p>
            <p className={styles.sectionSubtitle}>Build your bibliography</p>
          </div>

          {/* Citation tabs */}
          <div className={styles.tabRow}>
            <button
              type="button"
              className={`${styles.tab} ${citTab === "scrape" ? styles.tabActive : ""}`}
              onClick={() => setCitTab("scrape")}
            >
              Find / Scrape
            </button>
            <button
              type="button"
              className={`${styles.tab} ${citTab === "manual" ? styles.tabActive : ""}`}
              onClick={() => setCitTab("manual")}
            >
              Manual Entry
            </button>
          </div>

          {/* Scrape tab */}
          {citTab === "scrape" && (
            <>
              <div className={styles.inputRow}>
                <input
                  type="url"
                  className={styles.input}
                  placeholder="Paste a URL to auto-cite…"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleScrape(); }}
                />
                <button
                  type="button"
                  className={styles.autoFillBtn}
                  onClick={() => void handleScrape()}
                  disabled={scraping || !scrapeUrl.trim()}
                >
                  {scraping ? "…" : "✦ Auto-Fill"}
                </button>
              </div>

              {scrapeMsg && (
                <div
                  className={`${styles.feedbackMsg} ${
                    scrapeMsg.type === "ok" ? styles.feedbackOk : styles.feedbackErr
                  }`}
                >
                  {scrapeMsg.text}
                </div>
              )}

              <p className={styles.fieldLabel}>Source Type</p>
              <select
                className={styles.select}
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
              >
                {SOURCE_TYPES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </>
          )}

          {/* Manual tab */}
          {citTab === "manual" && (
            <>
              <p className={styles.fieldLabel}>Source Type</p>
              <select
                className={styles.select}
                value={sourceType}
                onChange={(e) => {
                  setSourceType(e.target.value as SourceType);
                  setManualFields({});
                }}
              >
                {SOURCE_TYPES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>

              {currentSourceFields.map((field) => (
                <div key={field}>
                  <p className={styles.fieldLabel}>{field}</p>
                  <input
                    type="text"
                    className={styles.input}
                    style={{ display: "block", width: "100%", boxSizing: "border-box", marginBottom: "6px" }}
                    placeholder={field}
                    value={manualFields[field] ?? ""}
                    onChange={(e) =>
                      setManualFields((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                  />
                </div>
              ))}

              {addMsg && (
                <div
                  className={`${styles.feedbackMsg} ${
                    addMsg.type === "ok" ? styles.feedbackOk : styles.feedbackErr
                  }`}
                >
                  {addMsg.text}
                </div>
              )}

              <button
                type="button"
                className={styles.addBtn}
                onClick={() => void handleManualAdd()}
                disabled={adding || !canManualAdd}
              >
                {adding ? "Adding…" : "Add Citation"}
              </button>
            </>
          )}

          <hr className={styles.divider} />

          {/* Bibliography list */}
          <div className={styles.bibliographyHeader}>
            <span className={styles.bibliographyTitle}>
              Bibliography ({citations.length})
            </span>
            {citations.length > 0 && (
              <button type="button" className={styles.manageAllBtn}>
                Manage All
              </button>
            )}
          </div>

          <div className={styles.citationList}>
            {citations.map((cit) => (
              <div key={cit.id} className={styles.citationItem}>
                {editingId === cit.id ? (
                  <>
                    <textarea
                      className={styles.citationEditTextarea}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className={styles.citationEditActions}>
                      <button type="button" className={styles.citationEditSave} onClick={saveEdit}>
                        Save
                      </button>
                      <button
                        type="button"
                        className={styles.citationEditCancel}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.citationItemHeader}>
                      <span className={styles.citationTypeTag}>
                        {SOURCE_TYPES.find((s) => s.id === sourceType)?.label ?? "Source"}
                      </span>
                      <div className={styles.citationActions}>
                        <button
                          type="button"
                          className={styles.citationActionBtn}
                          onClick={() => startEdit(cit)}
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className={`${styles.citationActionBtn} ${styles.citationActionBtnDanger}`}
                          onClick={() => deleteCitation(cit.id)}
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    <p className={styles.citationText}>
                      <RichText text={cit.text} />
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            className={styles.addCitationDashed}
            onClick={() => setCitTab("scrape")}
          >
            <PlusIcon />
            Add New Citation
          </button>

          <hr className={styles.divider} />

          {/* In-text citation section */}
          <div className={styles.inTextSection}>
            <div className={styles.inTextTitle}>Insert In-Text Citation</div>

            {citations.length === 0 ? (
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.28)", margin: "0 0 8px" }}>
                Add citations above to insert in-text references.
              </p>
            ) : (
              <>
                <p className={styles.fieldLabel}>Select Source</p>
                <select
                  className={styles.select}
                  value={inTextSourceId}
                  onChange={(e) => setInTextSourceId(e.target.value)}
                >
                  {citations.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      Source {i + 1}: {c.text.slice(0, 40)}…
                    </option>
                  ))}
                </select>

                <p className={styles.fieldLabel}>Format</p>
                <select
                  className={styles.select}
                  value={inTextFormat}
                  onChange={(e) => setInTextFormat(e.target.value)}
                >
                  {inTextFormats.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>

                <button
                  type="button"
                  className={styles.insertCitationBtn}
                  disabled={!inTextSourceId}
                >
                  Insert Citation
                </button>
              </>
            )}

            <p className={styles.inTextNote}>
              Citations will be added to your document and bibliography automatically when you open in the editor.
            </p>
          </div>
        </div>
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
