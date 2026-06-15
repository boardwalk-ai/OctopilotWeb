"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ExportDocumentSnapshot, Organizer, OrganizerState } from "@/services/OrganizerService";
import { FormatterService } from "@/services/FormatterService";
import { FormatterPage } from "@/services/FormatterTypes";
import mobileStyles from "./EditorViewMobile.module.css";
import type { FormatStyleId } from "./FormatStyleView";
import "./theme.css";

interface GhostciterCitation { id: string; text: string; }

export interface EditorViewProps {
    onBack: () => void;
    onFinish?: (snapshot: ExportDocumentSnapshot) => void;
    // Raw essay body
    content: string;
    // Parsed fields (from document parser)
    bibliography?: string;
    initialDocTitle?: string;
    studentName?: string;
    instructorName?: string;
    institutionName?: string;
    courseInfo?: string;
    subjectCode?: string;
    essayDate?: string;
    // Legacy manual citations
    citations?: GhostciterCitation[];
    formatStyle?: FormatStyleId;
    // Called when user picks a style pill + clicks Format Document
    onReformat?: (id: FormatStyleId) => void;
    // Whether the parent has content ready to format
    canReformat?: boolean;
    // APA abstract page fields
    abstract?: string;
    keywords?: string;
    // Ref populated by Core so parent can call buildExportSnapshot() directly
    getSnapshotRef?: React.MutableRefObject<(() => ExportDocumentSnapshot) | null>;
    // Ref populated by Core so parent can append a single bib entry to the last page
    insertBibEntryRef?: React.MutableRefObject<((text: string) => void) | null>;
    // Refs populated by Core: highlight Octo critique quotes in the document /
    // scroll to a highlight by id (returns number of quotes matched)
    octoHighlightRef?: React.MutableRefObject<((items: OctoHighlightItem[]) => number) | null>;
    octoJumpRef?: React.MutableRefObject<((id: string) => void) | null>;
    // How much the left/right overlay panels are covering the center (for toolbar centering)
    panelInsets?: { left: number; right: number; animated: boolean };
}

interface DocPage {
    id: number;
    title: string;
}

interface PageFormatMeta {
    textAlign?: "left" | "center" | "right" | "justify";
    centerVertically?: boolean;
    showPageNumber?: boolean;
    lineHeight?: number;
}

const TEXT_STYLE_PRESETS = {
    p: { label: "Normal text", block: "p", size: 12, bold: false },
    h1: { label: "Heading 1", block: "h1", size: 24, bold: true },
    h2: { label: "Heading 2", block: "h2", size: 20, bold: true },
    h3: { label: "Heading 3", block: "h3", size: 16, bold: true },
    h4: { label: "Heading 4", block: "h4", size: 14, bold: true },
} as const;

/* ─── Toolbar Icon Component ─── */
const TbIcon = ({ children, active, onClick, title, disabled }: { children: React.ReactNode; active?: boolean; onClick?: () => void; title?: string; disabled?: boolean }) => (
    <button
        type="button"
        onClick={onClick}
        onMouseDown={(e) => e.preventDefault()}
        title={title}
        disabled={disabled}
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-[4px] transition-colors ${disabled ? "opacity-30 cursor-not-allowed" : ""} ${active ? "bg-[#ea4335]/22 text-[#f87171]" : "text-white/85 hover:bg-[var(--ed-hover)]"}`}
    >
        {children}
    </button>
);

const TbSep = () => <div className="mx-1 h-5 w-px bg-[var(--ed-text-label)]" />;

const ThemeToggle = ({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) => (
    <TbIcon title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={onToggle}>
        {theme === "dark" ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
        ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
        )}
    </TbIcon>
);

type DropdownOption = { label: string; value: string | number };

const ToolbarDropdown = ({
    value,
    options,
    onSelect,
    widthClass,
}: {
    value: string | number;
    options: DropdownOption[];
    onSelect: (value: string | number) => void;
    widthClass: string;
}) => {
    const [open, setOpen] = useState(false);
    const active = options.find(o => o.value === value);

    return (
        <div className={`relative ${widthClass}`}>
            <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen(prev => !prev)}
                className="flex h-[28px] w-full items-center justify-between rounded-[6px] px-2 text-[13px] text-[var(--ed-text)] transition hover:bg-[var(--ed-hover)]"
            >
                <span className="truncate">{active?.label}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ed-text-muted)" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-full z-30 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[10px] border border-[var(--ed-border-strong)] bg-[var(--ed-bg-surface)] p-1 shadow-[0_12px_26px_rgba(0,0,0,0.4)]">
                        {options.map((opt) => (
                            <button
                                key={String(opt.value)}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { onSelect(opt.value); setOpen(false); }}
                                className={`flex w-full items-center justify-between rounded-[7px] px-2.5 py-1.5 text-left text-[13px] transition ${opt.value === value ? "bg-[var(--ed-active-bg)] text-[var(--ed-active-text)]" : "text-[var(--ed-text)] hover:bg-[var(--ed-hover)]"}`}
                            >
                                <span className="truncate">{opt.label}</span>
                                {opt.value === value && (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

const LEGACY_FONT_SIZE_PT = [8, 10, 12, 14, 18, 24, 36, 48, 72];

/* ─── Grammar check helpers ──────────────────────────────────────────────── */
type GMatch = {
    message: string;
    offset: number;
    length: number;
    replacements: { value: string }[];
    rule: { id: string; issueType?: string };
};

function removeGrammarSpans(el: HTMLElement): void {
    el.querySelectorAll("[data-ge]").forEach((s) => {
        const p = s.parentNode;
        if (!p) return;
        while (s.firstChild) p.insertBefore(s.firstChild, s);
        p.removeChild(s);
    });
    el.normalize();
}

/* ── Octo the Bot issue highlights ──────────────────────────────────────────── */
export interface OctoHighlightItem {
    id: string;
    quote: string;
    color: string;
}

function removeOctoSpans(el: HTMLElement): void {
    el.querySelectorAll("[data-octo-id]").forEach((s) => {
        const p = s.parentNode;
        if (!p) return;
        while (s.firstChild) p.insertBefore(s.firstChild, s);
        p.removeChild(s);
    });
    el.normalize();
}

/** Whitespace/case-tolerant search: returns offsets into `fullText`. */
function findQuoteRange(fullText: string, quote: string): { start: number; end: number } | null {
    const needle = quote
        .trim()
        .replace(/^["'""'']+|["'""'']+$/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase();
    if (needle.length < 3) return null;

    const normChars: string[] = [];
    const map: number[] = [];
    let prevSpace = true;
    for (let i = 0; i < fullText.length; i++) {
        const ch = fullText[i]!;
        if (/\s/.test(ch)) {
            if (prevSpace) continue;
            normChars.push(" "); map.push(i); prevSpace = true;
        } else {
            normChars.push(ch.toLowerCase()); map.push(i); prevSpace = false;
        }
    }
    const idx = normChars.join("").indexOf(needle);
    if (idx < 0) return null;
    return { start: map[idx]!, end: map[idx + needle.length - 1]! + 1 };
}

function applyOctoHighlightToEditor(el: HTMLElement, item: OctoHighlightItem): boolean {
    const { text: fullText, nodes: index } = buildTextAndIndex(el);
    const found = findQuoteRange(fullText, item.quote);
    if (!found) return false;
    try {
        const s1 = index.find(t => t.start <= found.start && t.start + (t.node.textContent?.length ?? 0) > found.start);
        const s2 = index.find(t => t.start < found.end && t.start + (t.node.textContent?.length ?? 0) >= found.end);
        if (!s1 || !s2) return false;
        const range = document.createRange();
        range.setStart(s1.node, found.start - s1.start);
        range.setEnd(s2.node, found.end - s2.start);
        const sp = document.createElement("span");
        sp.setAttribute("data-octo-id", item.id);
        sp.style.cssText = `background:${item.color}2e;border-bottom:2px solid ${item.color};border-radius:2px;transition:background 0.3s;`;
        try {
            range.surroundContents(sp);
        } catch {
            // Range crosses inline element boundaries — extract and re-insert
            sp.appendChild(range.extractContents());
            range.insertNode(sp);
        }
        return true;
    } catch {
        return false;
    }
}

// Block-level HTML tags — a newline is inserted between them so
// LanguageTool sees proper sentence boundaries.
const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "TD", "TH"]);

function getClosestBlock(node: Node, root: Element): Element | null {
    let p = node.parentElement;
    while (p && p !== root) {
        if (BLOCK_TAGS.has(p.tagName)) return p;
        p = p.parentElement;
    }
    return null;
}

/**
 * Walk all text nodes and build:
 *   - text : the string we send to LanguageTool (with \n between blocks)
 *   - nodes: each text node with its start-offset in that string
 *
 * Using \n between block elements gives LanguageTool proper sentence
 * context so it can catch subject-verb agreement errors etc.
 */
function buildTextAndIndex(el: HTMLElement): { text: string; nodes: Array<{ node: Text; start: number }> } {
    const nodes: Array<{ node: Text; start: number }> = [];
    const parts: string[] = [];
    let offset = 0;
    let lastBlock: Element | null = null;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
        const content = node.textContent ?? "";
        if (!content) { node = walker.nextNode() as Text | null; continue; }

        const block = getClosestBlock(node, el);
        if (lastBlock !== null && block !== lastBlock) {
            // Crossed a block boundary — inject \n so LanguageTool sees a sentence break
            parts.push("\n");
            offset += 1;
        }

        nodes.push({ node, start: offset });
        parts.push(content);
        offset += content.length;
        lastBlock = block;
        node = walker.nextNode() as Text | null;
    }

    return { text: parts.join(""), nodes };
}

// Keep the old name as an alias so applyGrammarHighlights can use it
function buildTextIndex(el: HTMLElement): Array<{ node: Text; start: number }> {
    return buildTextAndIndex(el).nodes;
}

function applyGrammarHighlights(el: HTMLElement, matches: GMatch[]): void {
    removeGrammarSpans(el);
    if (!matches.length) return;
    // Use the SAME text-with-newlines index so offsets match what was sent to the API
    const { text: fullText, nodes: index } = buildTextAndIndex(el);
    const total = fullText.length;
    // Process highest offsets first so earlier offsets stay valid
    const sorted = [...matches].sort((a, b) => b.offset - a.offset);
    for (const m of sorted) {
        if (m.offset < 0 || m.offset + m.length > total) continue;
        try {
            const s1 = index.find(t => t.start <= m.offset && t.start + (t.node.textContent?.length ?? 0) > m.offset);
            const s2 = index.find(t => t.start < m.offset + m.length && t.start + (t.node.textContent?.length ?? 0) >= m.offset + m.length);
            if (!s1 || !s2) continue;
            const range = document.createRange();
            range.setStart(s1.node, m.offset - s1.start);
            range.setEnd(s2.node, m.offset + m.length - s2.start);
            const sp = document.createElement("span");
            sp.setAttribute("data-ge", "1");
            sp.setAttribute("data-gm", m.message);
            sp.setAttribute("data-gf", m.replacements.slice(0, 3).map(r => r.value).join(" / "));
            sp.style.cssText = "text-decoration:underline wavy #ef4444;text-underline-offset:3px;cursor:help;";
            range.surroundContents(sp);
        } catch { /* skip cross-element ranges */ }
    }
}

const EDITOR_FORMAT_STYLES: { id: FormatStyleId; label: string; color: string }[] = [
    { id: "mla",     label: "MLA",     color: "#7c3aed" },
    { id: "apa",     label: "APA",     color: "#2563eb" },
    { id: "chicago", label: "Chicago", color: "#ea580c" },
    { id: "ieee",    label: "IEEE",    color: "#16a34a" },
    { id: "harvard", label: "Harvard", color: "#0369a1" },
];

function getLeadingElement(root: HTMLElement | null): HTMLElement | null {
    if (!root) return null;
    const children = Array.from(root.children) as HTMLElement[];
    return children.find((child) => (child.textContent || "").trim().length > 0 || child.querySelector("img,video,audio,iframe,table,hr")) || null;
}

function isReferenceSectionStart(root: HTMLElement | null): boolean {
    return getLeadingElement(root)?.dataset.referenceHeading === "1";
}

function getReferenceHeading(root: HTMLElement | null): HTMLElement | null {
    return root?.querySelector("[data-reference-heading='1']") ?? null;
}


export default function FormatterEditorCore({
    onBack, onFinish, content,
    bibliography, initialDocTitle, studentName, instructorName, institutionName, courseInfo, subjectCode, essayDate,
    citations = [], formatStyle = "mla",
    onReformat,
    canReformat = false,
    getSnapshotRef,
    insertBibEntryRef,
    octoHighlightRef,
    octoJumpRef,
    abstract,
    keywords,
    panelInsets,
}: EditorViewProps) {
    // CSS transition for toolbar padding (matches panel slide animation)
    const insetTransition = panelInsets?.animated
        ? "padding-left 0.4s cubic-bezier(0.4,0,0.2,1), padding-right 0.4s cubic-bezier(0.4,0,0.2,1)"
        : "none";
    // 16px base padding (replaces the px-4 the inline style overrides) + panel overlay width
    const insetStyle = {
        paddingLeft:  (panelInsets?.left  ?? 0) + 16,
        paddingRight: (panelInsets?.right ?? 0) + 16,
        transition:   insetTransition,
    };
    // Combine parsed bibliography with any manually-added citations
    const combinedBibliography = [
        bibliography ?? "",
        citations.map((c) => c.text).join("\n\n"),
    ].filter(Boolean).join("\n\n");

    const org: OrganizerState = {
        writingMode: "ghostciter",
        generatedEssay: content,
        generatedBibliography: combinedBibliography,
        finalEssayTitle: initialDocTitle ?? "",
        citationStyle: formatStyle,
        studentName: studentName ?? "",
        instructorName: instructorName ?? "",
        institutionName: institutionName ?? "",
        courseInfo: courseInfo ?? "",
        subjectCode: subjectCode ?? "",
        essayDate: essayDate ?? "",
        abstract: abstract ?? "",
        keywords: keywords ?? "",
    } as unknown as OrganizerState;
    // Tracks which style pill the user has selected in the toolbar
    const [selectedStyle, setSelectedStyle] = useState<FormatStyleId>(formatStyle);

    // Grammar check — always on, no toggle
    const grammarOn = true;
    const [grammarLoading, setGrammarLoading] = useState(false);
    const [grammarTip, setGrammarTip] = useState<{ x: number; y: number; msg: string; fix: string } | null>(null);
    const grammarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep selectedStyle in sync when parent re-mounts with a new formatStyle
    useEffect(() => { setSelectedStyle(formatStyle); }, [formatStyle]);

    const [isMobileLayout, setIsMobileLayout] = useState(false);
    const [mobileViewportWidth, setMobileViewportWidth] = useState(816);
    const [keyboardInset, setKeyboardInset] = useState(0);
    const [pagesTabOpen, setPagesTabOpen] = useState(false);

    const formattedDoc = FormatterService.formatFromOrganizer(org);

    useEffect(() => {
        const syncLayout = () => {
            const nextIsMobile = window.innerWidth < 768;
            const nextWidth = nextIsMobile
                ? Math.max(320, Math.floor(window.visualViewport?.width || window.innerWidth))
                : 816;
            setIsMobileLayout(nextIsMobile);
            setMobileViewportWidth(nextWidth);
        };

        syncLayout();
        window.addEventListener("resize", syncLayout);
        window.visualViewport?.addEventListener("resize", syncLayout);
        return () => {
            window.removeEventListener("resize", syncLayout);
            window.visualViewport?.removeEventListener("resize", syncLayout);
        };
    }, []);

    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        const syncKeyboardInset = () => {
            const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
            setKeyboardInset(inset);
        };

        syncKeyboardInset();
        viewport.addEventListener("resize", syncKeyboardInset);
        viewport.addEventListener("scroll", syncKeyboardInset);
        return () => {
            viewport.removeEventListener("resize", syncKeyboardInset);
            viewport.removeEventListener("scroll", syncKeyboardInset);
        };
    }, []);

    const pageWidth = isMobileLayout ? mobileViewportWidth : 816;
    const pageHeight = isMobileLayout ? 1056 : 1056;
    const pagePadding = isMobileLayout ? 28 : 96;

    const sideMarginPct = Math.max(0, Math.min(45, ((formattedDoc.profile.marginInch * 96) / pageWidth) * 100));

    const initialText = formattedDoc.content || "";
    const legacyParsedPages = (initialText || "")
        .split(/\f+/)
        .map((page) => page.replace(/^\n+|\n+$/g, ""))
        .filter(Boolean);
    const fallbackPages: FormatterPage[] = (legacyParsedPages.length > 0 ? legacyParsedPages : [initialText])
        .map((content) => ({ content }));
    const structuredPages = formattedDoc.pages && formattedDoc.pages.length > 0
        ? formattedDoc.pages
        : fallbackPages;

    const initialPageHtmls = structuredPages.map((page) => {
        const raw = page.content || "";
        if (!raw.trim()) return "<br/>";
        const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
        return looksLikeHtml ? raw : raw.replace(/\n/g, "<br/>");
    });
    const initialPageList: DocPage[] = initialPageHtmls.map((_, index) => ({
        id: index + 1,
        title: `Page ${index + 1}`,
    }));
    const initialPageContentMap = initialPageHtmls.reduce<Record<number, string>>((acc, html, index) => {
        acc[index + 1] = html;
        return acc;
    }, {});
    const initialPageFormatMap = structuredPages.reduce<Record<number, PageFormatMeta>>((acc, page, index) => {
        const id = index + 1;
        acc[id] = {
            textAlign: page.textAlign,
            centerVertically: page.centerVertically,
            showPageNumber: page.showPageNumber,
            lineHeight: page.lineHeight,
        };
        return acc;
    }, {});

    const [docTitle, setDocTitle] = useState(org.finalEssayTitle || "Untitled document");
    const [textStyle, setTextStyle] = useState("p");
    const [fontFamily, setFontFamily] = useState(formattedDoc.profile.defaultFont || "Arial");
    const [baseFontSizePt] = useState(formattedDoc.profile.defaultFontSize ?? 12);
    const [lineHeight] = useState(formattedDoc.profile.lineHeight || 1.5);
    const [zoom, setZoom] = useState(100);
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [pageNumberStartPage] = useState(formattedDoc.profile.pageNumberStartPage || 1);
    const [pageNumberStartNumber] = useState(formattedDoc.profile.pageNumberStartNumber || 1);

    const [pages, setPages] = useState<DocPage[]>(initialPageList);
    const [pageFormatMap, setPageFormatMap] = useState<Record<number, PageFormatMeta>>(initialPageFormatMap);
    const [activePageId, setActivePageId] = useState(initialPageList[0]?.id || 1);

    // Editor theme (light / dark) — persisted to localStorage, applied via the
    // data-theme attribute on the editor root (tokens live in theme.css).
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

    const [isHeaderEditing, setIsHeaderEditing] = useState(false);
    const [headerEditingPageId, setHeaderEditingPageId] = useState<number | null>(null);
    const [headerText, setHeaderText] = useState(formattedDoc.profile.headerText || "");
    const [showPageNumber] = useState(Boolean(formattedDoc.profile.showPageNumber));
    const [pageNumberOverrides, setPageNumberOverrides] = useState<Record<number, string>>({});

    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);

    const [leftIndent, setLeftIndent] = useState(sideMarginPct);
    const [rightIndent, setRightIndent] = useState(100 - sideMarginPct);
    const [draggingMarker, setDraggingMarker] = useState<"left" | "right" | null>(null);

    const nextPageIdRef = useRef(initialPageList.length + 1);
    const pagesRef = useRef<DocPage[]>(initialPageList);
    const rebalancePaginationFromRef = useRef<(startPageId: number) => void>(() => { });
    const selectionRangeRef = useRef<Range | null>(null);
    const pagesViewportRef = useRef<HTMLDivElement>(null);
    const pageEditableRef = useRef<HTMLDivElement>(null);
    const rulerRef = useRef<HTMLDivElement>(null);

    const editorRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const pageShellRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const headerRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const pageContentRef = useRef<Record<number, string>>(initialPageContentMap);

    // Expose bibliography-append function to parent via ref
    useEffect(() => {
        if (!insertBibEntryRef) return;
        insertBibEntryRef.current = (text: string) => {
            const lastPage = pagesRef.current[pagesRef.current.length - 1];
            if (!lastPage) return;
            const el = editorRefs.current[lastPage.id];
            if (!el) return;
            el.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(el);
            range.collapse(false);
            if (sel) { sel.removeAllRanges(); sel.addRange(range); }
            document.execCommand("insertText", false, "\n" + text);
        };
        return () => { insertBibEntryRef.current = null; };
    }, [insertBibEntryRef]);

    // Expose Octo critique highlighting to parent via refs
    useEffect(() => {
        if (!octoHighlightRef) return;
        octoHighlightRef.current = (items: OctoHighlightItem[]) => {
            let matched = 0;
            for (const page of pagesRef.current) {
                const ed = editorRefs.current[page.id];
                if (ed) removeOctoSpans(ed);
            }
            for (const item of items) {
                if (!item.quote?.trim()) continue;
                for (const page of pagesRef.current) {
                    const ed = editorRefs.current[page.id];
                    if (!ed) continue;
                    if (applyOctoHighlightToEditor(ed, item)) { matched++; break; }
                }
            }
            for (const page of pagesRef.current) {
                const ed = editorRefs.current[page.id];
                if (ed) pageContentRef.current[page.id] = ed.innerHTML;
            }
            return matched;
        };
        return () => { octoHighlightRef.current = null; };
    }, [octoHighlightRef]);

    useEffect(() => {
        if (!octoJumpRef) return;
        octoJumpRef.current = (id: string) => {
            for (const page of pagesRef.current) {
                const ed = editorRefs.current[page.id];
                const sp = ed?.querySelector(`[data-octo-id="${id}"]`) as HTMLElement | null;
                if (sp) {
                    sp.scrollIntoView({ behavior: "smooth", block: "center" });
                    // Flash the highlight so the eye lands on it
                    const original = sp.style.background;
                    sp.style.background = sp.style.borderBottomColor;
                    setTimeout(() => { sp.style.background = original; }, 650);
                    return;
                }
            }
        };
        return () => { octoJumpRef.current = null; };
    }, [octoJumpRef]);

    useEffect(() => {
        pagesRef.current = pages;
    }, [pages]);

    const snapStepPct = 100 / 16;
    const snapThresholdPct = snapStepPct * 0.35;

    const getDefaultPageNumber = useCallback((pageId: number) => {
        const idx = pages.findIndex((p) => p.id === pageId);
        const pageIndex = idx + 1;
        if (pageIndex < pageNumberStartPage) return "";
        return String(Math.max(1, pageNumberStartNumber + (pageIndex - pageNumberStartPage)));
    }, [pageNumberStartNumber, pageNumberStartPage, pages]);

    const getPageNumberLabel = useCallback((pageId: number) => {
        return pageNumberOverrides[pageId] ?? getDefaultPageNumber(pageId);
    }, [getDefaultPageNumber, pageNumberOverrides]);

    const updateStats = useCallback(() => {
        const parser = document.createElement("div");
        const allText = pages.map((p) => {
            const editor = editorRefs.current[p.id];
            return editor ? (editor.innerText || "") : (() => {
                parser.innerHTML = pageContentRef.current[p.id] || "";
                return parser.innerText || "";
            })();
        }).join("\n");

        const words = allText.split(/\s+/).filter(w => w.length > 0).length;
        setWordCount(words);
        setCharCount(allText.length);
    }, [pages]);

    const queryFormattingState = useCallback(() => {
        try {
            setIsBold(document.queryCommandState("bold"));
            setIsItalic(document.queryCommandState("italic"));
            setIsUnderline(document.queryCommandState("underline"));
        } catch {
            setIsBold(false);
            setIsItalic(false);
            setIsUnderline(false);
        }
    }, []);

    const saveSelection = useCallback(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !pageEditableRef.current) return;
        const range = sel.getRangeAt(0);
        if (!pageEditableRef.current.contains(range.commonAncestorContainer)) return;
        selectionRangeRef.current = range.cloneRange();
    }, []);

    const restoreSelection = useCallback(() => {
        const sel = window.getSelection();
        const range = selectionRangeRef.current;
        if (!sel || !range) return;
        sel.removeAllRanges();
        sel.addRange(range);
    }, []);

    const cleanupEditorArtifacts = useCallback((root: HTMLElement | null) => {
        if (!root) return;

        const unwrap = (el: HTMLElement) => {
            const parent = el.parentNode;
            if (!parent) return;
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
        };

        const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let textNode = textWalker.nextNode();
        while (textNode) {
            const t = textNode as Text;
            if (t.nodeValue?.includes("​")) {
                t.nodeValue = t.nodeValue.replace(/​/g, "");
            }
            textNode = textWalker.nextNode();
        }

        const spans = Array.from(root.querySelectorAll("span"));
        for (const span of spans) {
            const text = (span.textContent || "").replace(/​/g, "");
            const textNoTrim = text;
            const textTrim = text.trim();
            const hasChildElements = span.children.length > 0;

            if (!hasChildElements && textNoTrim.length === 0) {
                span.remove();
                continue;
            }

            if (!hasChildElements && textTrim.length === 0) {
                span.replaceWith(document.createTextNode(" "));
                continue;
            }

            if (hasChildElements) {
                const childNodes = Array.from(span.childNodes);
                const hasOnlyBreaks = childNodes.length > 0 && childNodes.every(
                    (n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === "BR"
                );
                if (hasOnlyBreaks && textTrim.length === 0) {
                    span.replaceWith(...childNodes.map((n) => n.cloneNode(true)));
                    continue;
                }
            }

            if (span.dataset.fontSizeMarker === "1") {
                span.removeAttribute("data-font-size-marker");
            }
        }

        let changed = true;
        while (changed) {
            changed = false;
            const sizedSpans = Array.from(root.querySelectorAll("span")).filter((n) => {
                return n instanceof HTMLElement && !!n.style.fontSize;
            }) as HTMLElement[];

            for (const span of sizedSpans) {
                const children = Array.from(span.childNodes);
                const meaningfulText = children.filter((n) => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim());
                const elementChildren = children.filter((n) => n.nodeType === Node.ELEMENT_NODE) as HTMLElement[];

                if (elementChildren.length > 0 && meaningfulText.length === 0) {
                    unwrap(span);
                    changed = true;
                    break;
                }

                const parent = span.parentElement;
                if (parent instanceof HTMLElement && parent.tagName === "SPAN" && parent.style.fontSize) {
                    const siblings = Array.from(parent.childNodes);
                    const otherMeaningful = siblings.filter((n) => {
                        if (n === span) return false;
                        if (n.nodeType === Node.TEXT_NODE) return !!n.textContent?.trim();
                        return true;
                    });
                    if (otherMeaningful.length === 0) {
                        unwrap(parent);
                        changed = true;
                        break;
                    }
                }
            }
        }

        root.normalize();
    }, []);

    const isEditorEffectivelyEmpty = useCallback((root: HTMLElement | null) => {
        if (!root) return true;
        const text = (root.textContent || "").replace(/​/g, "").trim();
        if (text.length > 0) return false;
        if (root.querySelector("img,video,audio,iframe,table,hr")) return false;
        return true;
    }, []);

    const moveOverflowNode = useCallback((source: HTMLElement, target: HTMLElement) => {
        const adjustSplitToWordBoundary = (text: string, keep: number) => {
            let adjustedKeep = keep;
            const leftSegment = text.slice(0, adjustedKeep);
            const rightSegment = text.slice(adjustedKeep);
            const rightBeginsWord = /^[A-Za-z0-9]/.test(rightSegment);
            const leftEndsWord = /[A-Za-z0-9]$/.test(leftSegment);
            if (rightBeginsWord && leftEndsWord) {
                const punctIdx = Math.max(
                    leftSegment.lastIndexOf(" "),
                    leftSegment.lastIndexOf("\t"),
                    leftSegment.lastIndexOf("\n"),
                    leftSegment.lastIndexOf("-")
                );
                if (punctIdx > 0) adjustedKeep = punctIdx + 1;
            }
            return Math.max(0, Math.min(adjustedKeep, text.length - 1));
        };

        if (target.childNodes.length === 1 && target.firstChild?.nodeName === "BR") {
            target.innerHTML = "";
        }

        const last = source.lastChild;
        if (!last) return false;

        if (last.nodeType === Node.TEXT_NODE) {
            const textNode = last as Text;
            const original = textNode.nodeValue || "";
            if (!original.length) {
                textNode.remove();
                return true;
            }

            let keep = 0;
            let low = 0;
            let high = original.length;

            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                textNode.nodeValue = original.slice(0, mid);
                if (source.scrollHeight > source.clientHeight + 1) {
                    high = mid - 1;
                } else {
                    keep = mid;
                    low = mid + 1;
                }
            }

            if (keep >= original.length) keep = Math.max(0, original.length - 1);
            keep = adjustSplitToWordBoundary(original, keep);

            let keepText = original.slice(0, keep);
            let movedText = original.slice(keep).replace(/^[ \t]+/, "");

            if (!movedText.length) {
                keepText = original.slice(0, Math.max(0, original.length - 1));
                movedText = original.slice(keepText.length).replace(/^[ \t]+/, "");
            }

            if (keepText.length === 0) textNode.remove();
            else textNode.nodeValue = keepText;

            target.insertBefore(document.createTextNode(movedText), target.firstChild);
            return true;
        }

        if (last instanceof HTMLElement) {
            const preserveTogether = last.dataset.keepWithNext === "1";
            if (preserveTogether) {
                target.insertBefore(last, target.firstChild);
                return true;
            }

            const fragment = last.cloneNode(false) as HTMLElement;
            // Continuation on next page should not behave like a new paragraph.
            if (fragment.style) {
                fragment.style.textIndent = "0";
                fragment.style.marginTop = "0";
            }
            let movedAny = false;

            target.insertBefore(fragment, target.firstChild);

            while (source.scrollHeight > source.clientHeight + 1 && last.lastChild) {
                const child = last.lastChild;

                if (child.nodeType === Node.TEXT_NODE) {
                    const textNode = child as Text;
                    const original = textNode.nodeValue || "";
                    if (!original.length) {
                        textNode.remove();
                        continue;
                    }

                    let keep = 0;
                    let low = 0;
                    let high = original.length;

                    while (low <= high) {
                        const mid = Math.floor((low + high) / 2);
                        textNode.nodeValue = original.slice(0, mid);
                        if (source.scrollHeight > source.clientHeight + 1) {
                            high = mid - 1;
                        } else {
                            keep = mid;
                            low = mid + 1;
                        }
                    }

                    if (keep >= original.length) keep = Math.max(0, original.length - 1);
                    keep = adjustSplitToWordBoundary(original, keep);

                    let keepText = original.slice(0, keep);
                    let movedText = original.slice(keep).replace(/^[ \t]+/, "");
                    if (!movedText.length) {
                        keepText = original.slice(0, Math.max(0, original.length - 1));
                        movedText = original.slice(keepText.length).replace(/^[ \t]+/, "");
                    }

                    if (keepText.length === 0) textNode.remove();
                    else textNode.nodeValue = keepText;

                    fragment.insertBefore(document.createTextNode(movedText), fragment.firstChild);
                    movedAny = true;
                    continue;
                }

                fragment.insertBefore(child, fragment.firstChild);
                movedAny = true;
            }

            if (!last.textContent?.trim() && last.children.length === 0) last.remove();
            if (!movedAny || (!fragment.textContent?.trim() && fragment.children.length === 0)) fragment.remove();
            return movedAny;
        }

        target.insertBefore(last, target.firstChild);
        return true;
    }, []);

    const moveUnderflowNode = useCallback((source: HTMLElement, target: HTMLElement) => {
        let first: ChildNode | null = source.firstChild;
        while (first && first.nodeType === Node.TEXT_NODE && !(first.textContent || "").trim()) {
            const next = first.nextSibling;
            first.remove();
            first = next;
        }
        if (!first) return false;

        if (first instanceof HTMLElement && first.dataset.keepWithNext === "1") {
            return false;
        }

        if (target.childNodes.length === 1 && target.firstChild?.nodeName === "BR") {
            target.innerHTML = "";
        }
        target.appendChild(first);
        return true;
    }, []);

    const moveReferenceSectionToNextPage = useCallback((source: HTMLElement, target: HTMLElement) => {
        const heading = getReferenceHeading(source);
        if (!(heading instanceof HTMLElement)) return false;
        if (getLeadingElement(source) === heading) return false;

        if (target.childNodes.length === 1 && target.firstChild?.nodeName === "BR") {
            target.innerHTML = "";
        }

        const nodesToMove: ChildNode[] = [];
        let current: ChildNode | null = heading;
        while (current) {
            nodesToMove.push(current);
            current = current.nextSibling;
        }

        for (let idx = nodesToMove.length - 1; idx >= 0; idx -= 1) {
            target.insertBefore(nodesToMove[idx], target.firstChild);
        }

        return nodesToMove.length > 0;
    }, []);

    const rebalancePaginationFrom = useCallback((startPageId: number) => {
        const startIndex = pagesRef.current.findIndex((p) => p.id === startPageId);
        if (startIndex < 0) return;

        for (let i = startIndex; i < pagesRef.current.length; i++) {
            const currentPage = pagesRef.current[i];
            const currentEditor = editorRefs.current[currentPage.id];
            if (!currentEditor) continue;

            cleanupEditorArtifacts(currentEditor);

            const referenceHeading = getReferenceHeading(currentEditor);
            if (referenceHeading instanceof HTMLElement && getLeadingElement(currentEditor) !== referenceHeading) {
                const nextPage = pagesRef.current[i + 1];
                if (!nextPage) {
                    const newId = nextPageIdRef.current++;
                    const currentMeta = pageFormatMap[currentPage.id] || {};
                    pageContentRef.current[newId] = "<br/>";
                    setPageFormatMap((prev) => ({
                        ...prev,
                        [newId]: {
                            textAlign: currentMeta.textAlign || "left",
                            centerVertically: false,
                            showPageNumber: currentMeta.showPageNumber ?? showPageNumber,
                            lineHeight: currentMeta.lineHeight || lineHeight,
                        },
                    }));
                    setPages((prev) => {
                        const next = [...prev, { id: newId, title: "Page" }]
                            .map((p, idx) => ({ ...p, title: `Page ${idx + 1}` }));
                        pagesRef.current = next;
                        return next;
                    });
                    requestAnimationFrame(() => rebalancePaginationFromRef.current(startPageId));
                    return;
                }

                const nextEditor = editorRefs.current[nextPage.id];
                if (!nextEditor) {
                    requestAnimationFrame(() => rebalancePaginationFromRef.current(startPageId));
                    return;
                }

                cleanupEditorArtifacts(nextEditor);
                moveReferenceSectionToNextPage(currentEditor, nextEditor);
                cleanupEditorArtifacts(currentEditor);
                cleanupEditorArtifacts(nextEditor);
            }

            while (currentEditor.scrollHeight > currentEditor.clientHeight + 1) {
                const nextPage = pagesRef.current[i + 1];
                if (!nextPage) {
                    const newId = nextPageIdRef.current++;
                    const currentMeta = pageFormatMap[currentPage.id] || {};
                    pageContentRef.current[newId] = "<br/>";
                    setPageFormatMap((prev) => ({
                        ...prev,
                        [newId]: {
                            textAlign: currentMeta.textAlign || "left",
                            centerVertically: false,
                            showPageNumber: currentMeta.showPageNumber ?? showPageNumber,
                            lineHeight: currentMeta.lineHeight || lineHeight,
                        },
                    }));
                    setPages((prev) => {
                        const next = [...prev, { id: newId, title: "Page" }]
                            .map((p, idx) => ({ ...p, title: `Page ${idx + 1}` }));
                        pagesRef.current = next;
                        return next;
                    });
                    requestAnimationFrame(() => rebalancePaginationFromRef.current(startPageId));
                    return;
                }

                const nextEditor = editorRefs.current[nextPage.id];
                if (!nextEditor) {
                    requestAnimationFrame(() => rebalancePaginationFromRef.current(startPageId));
                    return;
                }

                cleanupEditorArtifacts(nextEditor);
                const moved = moveOverflowNode(currentEditor, nextEditor);
                cleanupEditorArtifacts(currentEditor);
                cleanupEditorArtifacts(nextEditor);
                if (moved && document.activeElement === currentEditor) {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0 && currentEditor.contains(sel.anchorNode)) {
                        nextEditor.focus({ preventScroll: true });
                        const nextRange = document.createRange();
                        nextRange.selectNodeContents(nextEditor);
                        nextRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(nextRange);
                        selectionRangeRef.current = nextRange.cloneRange();
                        setActivePageId(nextPage.id);
                    }
                }
                if (!moved) break;
            }
        }

        // Backfill content to avoid gaps/blank pages when text shrinks.
        for (let i = startIndex; i < pagesRef.current.length - 1; i++) {
            const currentPage = pagesRef.current[i];
            const nextPage = pagesRef.current[i + 1];
            const currentEditor = editorRefs.current[currentPage.id];
            const nextEditor = editorRefs.current[nextPage.id];
            if (!currentEditor || !nextEditor) continue;

            cleanupEditorArtifacts(currentEditor);
            cleanupEditorArtifacts(nextEditor);

            while (!isEditorEffectivelyEmpty(nextEditor) && currentEditor.scrollHeight < currentEditor.clientHeight - 2) {
                if (isReferenceSectionStart(nextEditor)) break;
                const moved = moveUnderflowNode(nextEditor, currentEditor);
                cleanupEditorArtifacts(currentEditor);
                cleanupEditorArtifacts(nextEditor);
                if (!moved) break;
                if (currentEditor.scrollHeight > currentEditor.clientHeight + 1) {
                    // The pulled-up block doesn't fully fit — split it like Word:
                    // keep the lines that fit, push only the remainder back down.
                    const split = moveOverflowNode(currentEditor, nextEditor);
                    cleanupEditorArtifacts(currentEditor);
                    cleanupEditorArtifacts(nextEditor);
                    if (!split || currentEditor.scrollHeight > currentEditor.clientHeight + 1) {
                        // Couldn't split (e.g. keep-with-next block) — push whole back
                        const last = currentEditor.lastChild;
                        if (last) nextEditor.insertBefore(last, nextEditor.firstChild);
                        cleanupEditorArtifacts(currentEditor);
                        cleanupEditorArtifacts(nextEditor);
                    }
                    break;
                }
            }
        }

        // Trim trailing empty pages (keep at least one page).
        const removablePageIds: number[] = [];
        for (let i = pagesRef.current.length - 1; i >= 1; i--) {
            const page = pagesRef.current[i];
            const editor = editorRefs.current[page.id];
            if (!editor || isEditorEffectivelyEmpty(editor)) removablePageIds.push(page.id);
            else break;
        }
        if (removablePageIds.length > 0) {
            setPages((prev) => {
                const next = prev
                    .filter((p) => !removablePageIds.includes(p.id))
                    .map((p, idx) => ({ ...p, title: `Page ${idx + 1}` }));
                pagesRef.current = next;
                return next;
            });
            setPageFormatMap((prev) => {
                const next: Record<number, PageFormatMeta> = {};
                for (const [k, v] of Object.entries(prev)) {
                    const id = Number(k);
                    if (!removablePageIds.includes(id)) next[id] = v;
                }
                return next;
            });
            setPageNumberOverrides((prev) => {
                const next: Record<number, string> = {};
                for (const [k, v] of Object.entries(prev)) {
                    const id = Number(k);
                    if (!removablePageIds.includes(id)) next[id] = v;
                }
                return next;
            });
            for (const id of removablePageIds) {
                delete pageContentRef.current[id];
                delete editorRefs.current[id];
                delete pageShellRefs.current[id];
                delete headerRefs.current[id];
            }
            if (removablePageIds.includes(activePageId)) {
                const fallback = pagesRef.current[pagesRef.current.length - 1]?.id;
                if (fallback) setActivePageId(fallback);
            }
        }

        for (const page of pagesRef.current) {
            const editor = editorRefs.current[page.id];
            if (editor) pageContentRef.current[page.id] = editor.innerHTML || "<br/>";
        }
        updateStats();
    }, [activePageId, cleanupEditorArtifacts, isEditorEffectivelyEmpty, lineHeight, moveOverflowNode, moveReferenceSectionToNextPage, moveUnderflowNode, pageFormatMap, showPageNumber, updateStats]);

    useEffect(() => {
        rebalancePaginationFromRef.current = rebalancePaginationFrom;
    }, [rebalancePaginationFrom]);

    useEffect(() => {
        const firstId = pagesRef.current[0]?.id;
        if (!firstId) return;
        const raf = window.requestAnimationFrame(() => {
            rebalancePaginationFromRef.current(firstId);
        });
        return () => window.cancelAnimationFrame(raf);
    }, [pageWidth, zoom, leftIndent, rightIndent, pages.length]);

    const execCommand = useCallback((cmd: string, value?: string) => {
        // Restore the user's last in-editor selection, focus the page that
        // actually holds it, THEN run the command — execCommand only affects
        // document.activeElement, so without focusing the contentEditable the
        // command runs against nothing and the toolbar appears dead.
        const savedRange = selectionRangeRef.current?.cloneRange() ?? null;

        const targetPageId = savedRange
            ? Number(
                Object.entries(editorRefs.current).find(([, el]) =>
                    el?.contains(savedRange.commonAncestorContainer)
                )?.[0] ?? activePageId
            )
            : activePageId;

        const editor = editorRefs.current[targetPageId];
        if (!editor) return;

        editor.focus({ preventScroll: true });

        if (savedRange) {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(savedRange);
        }

        document.execCommand(cmd, false, value);

        pageContentRef.current[targetPageId] = editor.innerHTML || "<br/>";
        setActivePageId(targetPageId);
        saveSelection();
        queryFormattingState();
        updateStats();
    }, [activePageId, queryFormattingState, saveSelection, updateStats]);

    const applyFontSizeToSelection = useCallback((size: number) => {
        const safe = Math.max(1, Math.min(254, Math.round(size)));
        const root = editorRefs.current[activePageId];
        if (!root) return;
        const legacySize = (LEGACY_FONT_SIZE_PT.reduce((bestIdx, pt, idx) => {
            const best = LEGACY_FONT_SIZE_PT[bestIdx];
            return Math.abs(pt - safe) < Math.abs(best - safe) ? idx : bestIdx;
        }, 0) + 1);

        const preservedRange = selectionRangeRef.current?.cloneRange() ?? null;
        root.focus({ preventScroll: true });
        if (preservedRange) selectionRangeRef.current = preservedRange;
        restoreSelection();

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const activeRange = sel.getRangeAt(0);
        if (!root.contains(activeRange.commonAncestorContainer)) return;

        document.execCommand("styleWithCSS", false, "false");
        document.execCommand("fontSize", false, String(legacySize));

        const legacyTags = Array.from(root.querySelectorAll(`font[size="${legacySize}"]`));
        for (const tag of legacyTags) {
            const span = document.createElement("span");
            span.style.fontSize = `${safe}pt`;
            while (tag.firstChild) span.appendChild(tag.firstChild);
            tag.replaceWith(span);
        }

        const cssSized = Array.from(root.querySelectorAll("span[style*='font-size']"));
        for (const span of cssSized) {
            const style = span.getAttribute("style") || "";
            if (/xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large/i.test(style)) {
                (span as HTMLElement).style.fontSize = `${safe}pt`;
            }
        }

        cleanupEditorArtifacts(root);

        const html = editorRefs.current[activePageId]?.innerHTML || "<br/>";
        pageContentRef.current[activePageId] = html;
        updateStats();
        saveSelection();
        queryFormattingState();
    }, [activePageId, cleanupEditorArtifacts, queryFormattingState, restoreSelection, saveSelection, updateStats]);

    const applyTextPreset = useCallback((presetKey: keyof typeof TEXT_STYLE_PRESETS) => {
        const preset = TEXT_STYLE_PRESETS[presetKey];
        execCommand("formatBlock", preset.block);
        applyFontSizeToSelection(preset.size);
        const boldNow = document.queryCommandState("bold");
        if (preset.bold && !boldNow) execCommand("bold");
        if (!preset.bold && boldNow) execCommand("bold");
        setTextStyle(presetKey);
    }, [applyFontSizeToSelection, execCommand]);

    const activateHeaderEditing = useCallback((pageId: number) => {
        setIsHeaderEditing(true);
        setHeaderEditingPageId(pageId);
        requestAnimationFrame(() => {
            const headerEl = headerRefs.current[pageId];
            if (!headerEl) return;
            if (headerEl.innerText !== headerText) headerEl.innerText = headerText;
            headerEl.focus();
            const sel = window.getSelection();
            if (!sel) return;
            const range = document.createRange();
            range.selectNodeContents(headerEl);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            saveSelection();
        });
    }, [headerText, saveSelection]);


    const scrollToPage = useCallback((id: number) => {
        setIsHeaderEditing(false);
        setHeaderEditingPageId(null);
        setActivePageId(id);
        pageShellRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    const handlePageInput = useCallback((pageId: number) => {
        cleanupEditorArtifacts(editorRefs.current[pageId] || null);
        const html = editorRefs.current[pageId]?.innerHTML || "<br/>";
        pageContentRef.current[pageId] = html;
        rebalancePaginationFrom(pageId);
        saveSelection();
    }, [cleanupEditorArtifacts, rebalancePaginationFrom, saveSelection]);

    /* ── Cross-page caret merge (Word-style Backspace/Delete at page edges) ── */
    const isCaretAtBoundary = (el: HTMLElement, edge: "start" | "end"): boolean => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
        const r = sel.getRangeAt(0);
        if (!el.contains(r.startContainer)) return false;
        const probe = r.cloneRange();
        probe.selectNodeContents(el);
        if (edge === "start") probe.setEnd(r.startContainer, r.startOffset);
        else probe.setStart(r.startContainer, r.startOffset);
        return probe.toString().replace(/[​\s]/g, "") === "";
    };

    // Joins the first block of `pageId` into the last block of the previous
    // page (paragraph join), places the caret at the junction, and rebalances.
    const mergePageIntoPrevious = useCallback((pageId: number): boolean => {
        const idx = pagesRef.current.findIndex((p) => p.id === pageId);
        if (idx <= 0) return false;
        const prevPage = pagesRef.current[idx - 1];
        const prevEd = editorRefs.current[prevPage.id];
        const curEd = editorRefs.current[pageId];
        if (!prevEd || !curEd) return false;

        let firstBlock: ChildNode | null = curEd.firstChild;
        while (firstBlock && (
            (firstBlock.nodeType === Node.TEXT_NODE && !(firstBlock.textContent || "").trim())
            || firstBlock.nodeName === "BR"
        )) {
            firstBlock = firstBlock.nextSibling;
        }
        if (!firstBlock) return false;
        // Never pull a references heading out of its own page
        if (firstBlock instanceof HTMLElement && firstBlock.dataset.keepWithNext === "1") return false;

        let lastBlock: ChildNode | null = prevEd.lastChild;
        while (lastBlock && lastBlock.nodeType === Node.TEXT_NODE && !(lastBlock.textContent || "").trim()) {
            lastBlock = lastBlock.previousSibling;
        }

        const sel = window.getSelection();
        const range = document.createRange();

        if (lastBlock instanceof HTMLElement && lastBlock.nodeName !== "BR" && firstBlock instanceof HTMLElement) {
            const junction = lastBlock.childNodes.length;
            while (firstBlock.firstChild) lastBlock.appendChild(firstBlock.firstChild);
            firstBlock.remove();
            range.setStart(lastBlock, Math.min(junction, lastBlock.childNodes.length));
        } else {
            if (prevEd.childNodes.length === 1 && prevEd.firstChild?.nodeName === "BR") prevEd.innerHTML = "";
            prevEd.appendChild(firstBlock);
            range.setStart(prevEd, Math.max(0, prevEd.childNodes.length - 1));
        }
        range.collapse(true);

        prevEd.focus({ preventScroll: true });
        sel?.removeAllRanges();
        sel?.addRange(range);
        selectionRangeRef.current = range.cloneRange();

        pageContentRef.current[prevPage.id] = prevEd.innerHTML;
        pageContentRef.current[pageId] = curEd.innerHTML || "<br/>";
        setActivePageId(prevPage.id);
        rebalancePaginationFrom(prevPage.id);
        saveSelection();
        return true;
    }, [rebalancePaginationFrom, saveSelection]);

    const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>, pageId: number) => {
        if (e.key === "Tab") {
            e.preventDefault();
            document.execCommand(
                "insertHTML",
                false,
                '<span data-tab-stop="1" style="display:inline-block;width:0.5in;"></span>'
            );
            handlePageInput(pageId);
            return;
        }

        const editor = editorRefs.current[pageId];
        if (!editor) return;

        if (e.key === "Backspace" && isCaretAtBoundary(editor, "start")) {
            const idx = pagesRef.current.findIndex((p) => p.id === pageId);
            if (idx > 0) {
                e.preventDefault();
                mergePageIntoPrevious(pageId);
            }
            return;
        }

        if (e.key === "Delete" && isCaretAtBoundary(editor, "end")) {
            const idx = pagesRef.current.findIndex((p) => p.id === pageId);
            const nextPage = pagesRef.current[idx + 1];
            if (nextPage) {
                e.preventDefault();
                mergePageIntoPrevious(nextPage.id);
            }
        }
    }, [handlePageInput, mergePageIntoPrevious]);

    // ── Grammar check ──────────────────────────────────────────────────────────
    const runGrammarCheck = useCallback(async (pageId: number) => {
        const el = editorRefs.current[pageId];
        if (!el) return;
        // Build text WITH block-boundary newlines — must match offset index
        const { text } = buildTextAndIndex(el);
        if (text.trim().length < 8) { removeGrammarSpans(el); return; }
        setGrammarLoading(true);
        try {
            const res = await fetch("/api/grammar/check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: text.slice(0, 5000), language: "en-US" }),
            });
            if (!res.ok) return;
            const data = (await res.json()) as { matches?: GMatch[] };
            // Filter out pure style suggestions — keep spelling + grammar
            const relevant = (data.matches ?? []).filter(m => m.rule.issueType !== "style");
            applyGrammarHighlights(el, relevant);
        } catch { /* network error — silently ignore */ }
        finally { setGrammarLoading(false); }
    }, []);

    // Clear all grammar spans from every page
    const clearAllGrammarSpans = useCallback(() => {
        for (const el of Object.values(editorRefs.current)) {
            if (el) removeGrammarSpans(el);
        }
    }, []);

    // Keep a stable ref to runGrammarCheck for use inside handlePageInput-level events
    const runGrammarCheckRef = useRef(runGrammarCheck);
    useEffect(() => { runGrammarCheckRef.current = runGrammarCheck; }, [runGrammarCheck]);

    // Add grammar-check debounce to the page input flow (grammarOn aware)
    const scheduleGrammarCheck = useCallback((pageId: number) => {
        if (!grammarOn) return;
        if (grammarTimerRef.current) clearTimeout(grammarTimerRef.current);
        grammarTimerRef.current = setTimeout(() => void runGrammarCheckRef.current(pageId), 2000);
    }, [grammarOn]);

    const buildExportSnapshot = useCallback((): ExportDocumentSnapshot => {
        const parser = document.createElement("div");
        const pagesSnapshot = pages.map((page, idx) => {
            const rawHtml = editorRefs.current[page.id]?.innerHTML || pageContentRef.current[page.id] || "";
            // Strip grammar-error spans so they don't appear in exports/citations
            const htmlClean = (() => {
                const tmp = document.createElement("div");
                tmp.innerHTML = rawHtml;
                removeGrammarSpans(tmp);
                removeOctoSpans(tmp);
                return tmp.innerHTML;
            })();
            const html = htmlClean;
            const pageMeta = pageFormatMap[page.id] || {};
            parser.innerHTML = html;
            const plainText = parser.innerText.replace(/\n{3,}/g, "\n\n").trim();
            return {
                id: page.id,
                title: page.title || `Page ${idx + 1}`,
                html,
                plainText,
                textAlign: pageMeta.textAlign,
                centerVertically: pageMeta.centerVertically,
                showPageNumber: pageMeta.showPageNumber ?? showPageNumber,
                lineHeight: pageMeta.lineHeight || lineHeight,
            };
        });

        return {
            title: docTitle.trim() || "Untitled document",
            pages: pagesSnapshot,
            profile: {
                defaultFont: fontFamily,
                lineHeight,
                marginInch: formattedDoc.profile.marginInch || 1,
                headerText: headerText.trim(),
                showPageNumber,
                pageNumberStartPage,
                pageNumberStartNumber,
            },
            generatedAt: new Date().toISOString(),
        };
    }, [
        docTitle,
        fontFamily,
        formattedDoc.profile.marginInch,
        headerText,
        lineHeight,
        pageFormatMap,
        pageNumberStartNumber,
        pageNumberStartPage,
        pages,
        showPageNumber,
    ]);

    const handleExport = useCallback(() => {
        const snapshot = buildExportSnapshot();
        onFinish?.(snapshot);
    }, [buildExportSnapshot, onFinish]);

    // Expose buildExportSnapshot to parent via ref (for left-panel humanize)
    useEffect(() => {
        if (!getSnapshotRef) return;
        getSnapshotRef.current = buildExportSnapshot;
        return () => { getSnapshotRef.current = null; };
    }, [getSnapshotRef, buildExportSnapshot]);

    // Grammar check runs automatically on mount for the active page
    useEffect(() => {
        void runGrammarCheck(activePageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        updateStats();
    }, [updateStats]);

    useEffect(() => {
        for (const page of pages) {
            const editor = editorRefs.current[page.id];
            if (!editor) continue;
            cleanupEditorArtifacts(editor);
            pageContentRef.current[page.id] = editor.innerHTML || "<br/>";
        }
    }, [cleanupEditorArtifacts, pages]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                const parser = document.createElement("div");
                // Cmd/Ctrl+S — no-op in standalone formatter flow (snapshot is built on export)
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [buildExportSnapshot, pages]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onBack();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onBack]);

    useEffect(() => {
        const onSelectionChange = () => {
            saveSelection();
            queryFormattingState();
        };
        document.addEventListener("selectionchange", onSelectionChange);
        return () => document.removeEventListener("selectionchange", onSelectionChange);
    }, [queryFormattingState, saveSelection]);

    useEffect(() => {
        if (!draggingMarker) return;
        const snapToRuler = (pct: number) => {
            const nearest = Math.round(pct / snapStepPct) * snapStepPct;
            if (Math.abs(nearest - pct) <= snapThresholdPct) return nearest;
            return pct;
        };
        const onMove = (e: MouseEvent) => {
            const ruler = rulerRef.current;
            if (!ruler) return;
            const rect = ruler.getBoundingClientRect();
            const rawPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const pct = snapToRuler(rawPct);
            if (draggingMarker === "left") setLeftIndent(Math.min(pct, rightIndent - 5));
            else setRightIndent(Math.max(pct, leftIndent + 5));
        };
        const onUp = () => setDraggingMarker(null);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [draggingMarker, leftIndent, rightIndent, snapStepPct, snapThresholdPct]);

    useEffect(() => {
        const viewport = pagesViewportRef.current;
        if (!viewport) return;

        let raf = 0;
        const updateActiveByScroll = () => {
            raf = 0;
            const anchorY = viewport.scrollTop + viewport.clientHeight * 0.28;
            let nearestId = activePageId;
            let nearestDistance = Number.POSITIVE_INFINITY;

            for (const page of pages) {
                const el = pageShellRefs.current[page.id];
                if (!el) continue;
                const distance = Math.abs(el.offsetTop - anchorY);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestId = page.id;
                }
            }

            if (nearestId !== activePageId) setActivePageId(nearestId);
        };

        const onScroll = () => {
            if (raf) return;
            raf = window.requestAnimationFrame(updateActiveByScroll);
        };

        viewport.addEventListener("scroll", onScroll, { passive: true });
        updateActiveByScroll();
        return () => {
            viewport.removeEventListener("scroll", onScroll);
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [activePageId, pages]);

    const renderMobilePage = (page: DocPage) => {
        const pageMeta = pageFormatMap[page.id] || {};
        const pageNumberText = getPageNumberLabel(page.id);
        const hasMlaRunningHead = formatStyle.toUpperCase() === "MLA";
        const headerEditing = isHeaderEditing && headerEditingPageId === page.id;
        const pageShowNumber = pageMeta.showPageNumber ?? showPageNumber;
        const pageTextAlign = pageMeta.textAlign || "left";
        const pageLineHeight = pageMeta.lineHeight || lineHeight;
        const pageCentered = Boolean(pageMeta.centerVertically);
        const editorFontSize = 11 * (zoom / 100);
        const headerFontSize = 10 * (zoom / 100);

        return (
            <div
                key={page.id}
                ref={(el) => { pageShellRefs.current[page.id] = el; }}
                className={mobileStyles.editorMobilePageShell}
                style={{
                    width: `${pageWidth * (zoom / 100)}px`,
                    height: `${pageHeight * (zoom / 100)}px`,
                }}
            >
                <div
                    className={mobileStyles.editorMobilePageInner}
                    style={{
                        paddingTop: `${pagePadding * (zoom / 100)}px`,
                        paddingBottom: `${pagePadding * (zoom / 100)}px`,
                        paddingLeft: `${(leftIndent / 100) * pageWidth * (zoom / 100)}px`,
                        paddingRight: `${((100 - rightIndent) / 100) * pageWidth * (zoom / 100)}px`,
                    }}
                >
                    <div
                        className={`${mobileStyles.editorMobileHeaderBlock} ${headerEditing ? mobileStyles.editorMobileHeaderEditing : ""}`}
                        onDoubleClick={() => activateHeaderEditing(page.id)}
                    >
                        {!headerEditing && (
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => activateHeaderEditing(page.id)}
                                className={mobileStyles.editorMobileHeaderButton}
                            >
                                {hasMlaRunningHead ? (
                                    <div className={mobileStyles.editorMobileHeaderRowRight}>
                                        <span
                                            className={mobileStyles.editorMobileHeaderText}
                                            style={{
                                                fontFamily: headerText.trim() ? fontFamily : "'Poppins', sans-serif",
                                                fontSize: `${headerFontSize}pt`,
                                            }}
                                        >
                                            {headerText.trim() || "Double-click to edit header"}
                                        </span>
                                        {pageShowNumber && pageNumberText && (
                                            <input
                                                value={pageNumberText}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setPageNumberOverrides((prev) => {
                                                        const next = { ...prev };
                                                        if (!val.trim()) delete next[page.id];
                                                        else next[page.id] = val;
                                                        return next;
                                                    });
                                                }}
                                                className={mobileStyles.editorMobileHeaderNumber}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <div className={mobileStyles.editorMobileHeaderRow}>
                                        <span
                                            className={mobileStyles.editorMobileHeaderText}
                                            style={{
                                                fontFamily: headerText.trim() ? fontFamily : "'Poppins', sans-serif",
                                                fontSize: `${headerFontSize}pt`,
                                            }}
                                        >
                                            {headerText.trim() || "Double-click to edit header"}
                                        </span>
                                        {pageShowNumber && pageNumberText && (
                                            <input
                                                value={pageNumberText}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setPageNumberOverrides((prev) => {
                                                        const next = { ...prev };
                                                        if (!val.trim()) delete next[page.id];
                                                        else next[page.id] = val;
                                                        return next;
                                                    });
                                                }}
                                                className={mobileStyles.editorMobileHeaderNumber}
                                            />
                                        )}
                                    </div>
                                )}
                            </button>
                        )}

                        {headerEditing && (
                            <div className={mobileStyles.editorMobileHeaderEdit}>
                                <div className={mobileStyles.editorMobileHeaderEditTop}>
                                    <span className={mobileStyles.editorMobileHeaderLabel}>Header</span>
                                    <div className={mobileStyles.editorMobileHeaderEditActions}>
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setPageFormatMap((prev) => {
                                                    const current = prev[page.id] || {};
                                                    const base = current.showPageNumber ?? showPageNumber;
                                                    return {
                                                        ...prev,
                                                        [page.id]: {
                                                            ...current,
                                                            showPageNumber: !base,
                                                        },
                                                    };
                                                });
                                            }}
                                            className={`${mobileStyles.editorMobileHeaderAction} ${pageShowNumber ? mobileStyles.editorMobileHeaderActionActive : ""}`}
                                        >
                                            {pageShowNumber ? "Page # on" : "Add page #"}
                                        </button>
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => { setIsHeaderEditing(false); setHeaderEditingPageId(null); }}
                                            className={mobileStyles.editorMobileHeaderAction}
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                                <div className={`${mobileStyles.editorMobileHeaderEditRow} ${hasMlaRunningHead ? mobileStyles.editorMobileHeaderEditRowRight : ""}`}>
                                    <div
                                        ref={(el) => { headerRefs.current[page.id] = el; }}
                                        contentEditable
                                        suppressContentEditableWarning
                                        onInput={() => setHeaderText(headerRefs.current[page.id]?.innerText || "")}
                                        onFocus={() => saveSelection()}
                                        onMouseUp={() => saveSelection()}
                                        onKeyUp={() => saveSelection()}
                                        className={`${mobileStyles.editorMobileHeaderEditInput} ${hasMlaRunningHead ? mobileStyles.editorMobileHeaderEditInputRight : ""}`}
                                        style={{
                                            fontSize: `${headerFontSize}pt`,
                                            lineHeight: "1.3",
                                            fontFamily,
                                            color: "#111827",
                                        }}
                                    />
                                    {pageShowNumber && pageNumberText && (
                                        <input
                                            value={pageNumberText}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setPageNumberOverrides((prev) => {
                                                    const next = { ...prev };
                                                    if (!val.trim()) delete next[page.id];
                                                    else next[page.id] = val;
                                                    return next;
                                                });
                                            }}
                                            className={mobileStyles.editorMobileHeaderNumber}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div
                        ref={(el) => {
                            editorRefs.current[page.id] = el;
                            if (el && el.dataset.hydrated !== "1") {
                                el.innerHTML = pageContentRef.current[page.id] || "<br/>";
                                el.dataset.hydrated = "1";
                            }
                        }}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={() => { handlePageInput(page.id); scheduleGrammarCheck(page.id); }}
                        onKeyDown={(e) => handleEditorKeyDown(e, page.id)}
                        onKeyUp={() => { queryFormattingState(); saveSelection(); }}
                        onMouseUp={() => { queryFormattingState(); saveSelection(); }}
                        onFocus={() => {
                            setIsHeaderEditing(false);
                            setHeaderEditingPageId(null);
                            setActivePageId(page.id);
                            saveSelection();
                        }}
                        className={mobileStyles.editorMobilePageBody}
                        style={{
                            fontFamily,
                            fontSize: `${editorFontSize}pt`,
                            lineHeight: String(pageLineHeight),
                            color: "#1f1f1f",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            textAlign: pageTextAlign,
                            display: pageCentered ? "flex" : "block",
                            flexDirection: pageCentered ? "column" : undefined,
                            justifyContent: pageCentered ? "center" : undefined,
                        }}
                    />
                </div>
            </div>
        );
    };

    if (isMobileLayout) {
        return (
            <div
                data-theme={theme}
                className={`relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--ed-bg)] ${mobileStyles.editorMobileRoot}`}
                style={{ fontFamily: "'Poppins', sans-serif" }}
            >
                <div
                    ref={pagesViewportRef}
                    className={mobileStyles.editorMobileScrollViewport}
                    style={{
                        paddingBottom: `calc(${keyboardInset + 196}px + env(safe-area-inset-bottom))`,
                    }}
                >
                    <div className={mobileStyles.editorMobileStickyChrome}>
                        <div className={mobileStyles.editorMobileTopBar}>
                            <div className={mobileStyles.editorMobileTopBarPrimary}>
                                <div className={mobileStyles.editorMobileDocIcon} title="Document">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                        <rect x="3" y="3" width="18" height="18" rx="2" fill="#ea4335" />
                                        <path d="M7 8h10M7 12h7M7 16h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                </div>

                                <input
                                    value={docTitle}
                                    onChange={(e) => setDocTitle(e.target.value)}
                                    className={mobileStyles.editorMobileTitleInput}
                                    spellCheck={false}
                                />

                                <button
                                    onClick={handleExport}
                                    className={mobileStyles.editorMobileExportButton}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    Export
                                </button>
                            </div>

                            <div className={mobileStyles.editorMobileTopBarSecondary}>
                                <TbIcon title="Undo (⌘Z)" onClick={() => execCommand("undo")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h14a4 4 0 0 1 0 8H9" /><polyline points="7 14 3 10 7 6" /></svg></TbIcon>
                                <TbIcon title="Redo (⌘Y)" onClick={() => execCommand("redo")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H7a4 4 0 0 0 0 8h8" /><polyline points="17 14 21 10 17 6" /></svg></TbIcon>
                                <ToolbarDropdown
                                    value={fontFamily}
                                    widthClass={mobileStyles.editorMobileFontSelect}
                                    options={["Arial", "Times New Roman", "Georgia", "Verdana", "Courier New", "Trebuchet MS"].map((f) => ({ label: f, value: f }))}
                                    onSelect={(value) => {
                                        const font = String(value);
                                        setFontFamily(font);
                                        execCommand("fontName", font);
                                    }}
                                />
                            </div>
                        </div>

                        <div className={mobileStyles.editorMobileRulerBar}>
                            <div
                                ref={rulerRef}
                                className={mobileStyles.editorMobileRuler}
                                style={{ width: `${pageWidth * (zoom / 100)}px` }}
                            >
                                <div className={mobileStyles.editorMobileRulerScale}>
                                    {Array.from({ length: 17 }, (_, i) => (
                                        <div key={i} className={mobileStyles.editorMobileRulerTick} style={{ left: `${(i / 16) * 100}%` }}>
                                            <div className={mobileStyles.editorMobileRulerTickLine} />
                                            {i % 2 === 0 && <span className={mobileStyles.editorMobileRulerTickLabel}>{i / 2}</span>}
                                        </div>
                                    ))}
                                    <div
                                        className={mobileStyles.editorMobileRulerMarker}
                                        style={{ left: `${leftIndent}%` }}
                                        onMouseDown={(e) => { e.preventDefault(); setDraggingMarker("left"); }}
                                    >
                                        <div className={mobileStyles.editorMobileRulerTriangle} />
                                    </div>
                                    <div
                                        className={mobileStyles.editorMobileRulerMarker}
                                        style={{ left: `${rightIndent}%` }}
                                        onMouseDown={(e) => { e.preventDefault(); setDraggingMarker("right"); }}
                                    >
                                        <div className={mobileStyles.editorMobileRulerTriangle} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div ref={pageEditableRef} className={mobileStyles.editorMobilePageStack}>
                        {pages.map(renderMobilePage)}
                    </div>
                </div>

                <div className={mobileStyles.editorMobileDock} style={{ bottom: `${keyboardInset}px` }}>
                    <div className={mobileStyles.editorMobileToolbar}>
                        <TbIcon active={isBold} onClick={() => execCommand("bold")} title="Bold"><span className={mobileStyles.editorMobileToolbarText}>B</span></TbIcon>
                        <TbIcon active={isItalic} onClick={() => execCommand("italic")} title="Italic"><span className={`${mobileStyles.editorMobileToolbarText} italic`}>I</span></TbIcon>
                        <TbIcon active={isUnderline} onClick={() => execCommand("underline")} title="Underline"><span className={`${mobileStyles.editorMobileToolbarText} underline`}>U</span></TbIcon>
                        <TbIcon title="Align left" onClick={() => execCommand("justifyLeft")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" /></svg></TbIcon>
                        <TbIcon title="Align center" onClick={() => execCommand("justifyCenter")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="18" y1="18" x2="6" y2="18" /></svg></TbIcon>
                        <TbIcon title="Align right" onClick={() => execCommand("justifyRight")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" /></svg></TbIcon>
                    </div>

                    <button
                        type="button"
                        onClick={() => setPagesTabOpen((prev) => !prev)}
                        className={mobileStyles.editorMobilePagesToggle}
                    >
                        Pages
                        <span className={mobileStyles.editorMobilePagesToggleCount}>{pages.length}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polyline points={pagesTabOpen ? "6 15 12 9 18 15" : "6 9 12 15 18 9"} />
                        </svg>
                    </button>

                    <div className={`${mobileStyles.editorMobilePagesPanel} ${pagesTabOpen ? mobileStyles.editorMobilePagesPanelOpen : ""}`}>
                        <div className={mobileStyles.editorMobilePagesChips}>
                            {pages.map((page) => {
                                const isActive = page.id === activePageId;
                                return (
                                    <button
                                        key={page.id}
                                        type="button"
                                        onClick={() => scrollToPage(page.id)}
                                        className={`${mobileStyles.editorMobilePageChip} ${isActive ? mobileStyles.editorMobilePageChipActive : ""}`}
                                    >
                                        {page.title}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            data-theme={theme}
            className="flex h-full min-h-0 flex-col bg-[var(--ed-bg)]"
            style={{ fontFamily: "'Poppins', sans-serif" }}
            onMouseMove={(e) => {
                if (!grammarOn) return;
                const target = e.target as HTMLElement;
                const span = target.closest("[data-ge]") as HTMLElement | null;
                if (span) {
                    setGrammarTip({ x: e.clientX, y: e.clientY, msg: span.getAttribute("data-gm") ?? "", fix: span.getAttribute("data-gf") ?? "" });
                } else {
                    setGrammarTip(null);
                }
            }}
            onMouseLeave={() => setGrammarTip(null)}
        >
            <div className="flex h-[48px] items-center gap-2 bg-[var(--ed-bg-bar)] px-4" style={insetStyle}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full" title="Document">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#ea4335" /><path d="M7 8h10M7 12h7M7 16h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </div>

                <input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="h-[28px] min-w-0 flex-1 rounded-[4px] border border-transparent bg-transparent px-2 text-[18px] font-normal text-[var(--ed-text)] outline-none transition hover:border-[var(--ed-border-strong)] focus:border-[#ea4335]"
                    spellCheck={false}
                />

                <div className="flex-1" />

                <button
                    onClick={handleExport}
                    className="flex h-9 items-center gap-2 rounded-full bg-[#ea4335] px-5 text-[14px] font-medium text-white shadow-sm transition hover:bg-[#d33426] hover:shadow-md"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    {onFinish ? "Finish" : "Export"}
                </button>
            </div>

            {/* ── Format Style pill bar + Format Document button ── */}
            <div className="mt-1 flex h-[34px] flex-shrink-0 items-center gap-2 border-b border-[var(--ed-border)] bg-[var(--ed-bg-subbar)] px-3" style={insetStyle}>
                {/* Style pills — scroll if needed */}
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                    <span className="mr-1 flex-shrink-0 text-[8.5px] font-semibold uppercase tracking-widest text-[var(--ed-text-label)]">Style</span>
                    {EDITOR_FORMAT_STYLES.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setSelectedStyle(s.id)}
                            className="flex-shrink-0 rounded-full px-3 py-[3px] text-[10px] font-semibold transition active:scale-[0.95]"
                            style={selectedStyle === s.id
                                ? { background: s.color, color: "#fff" }
                                : { background: "var(--ed-bg-pill)", color: "var(--ed-text-faint)" }}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
                {/* Format Document — always visible on right */}
                {onReformat && (
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onReformat(selectedStyle)}
                        disabled={!canReformat}
                        className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[#ea4335] px-3 py-[4px] text-[10px] font-semibold text-white transition hover:bg-[#dc2626] active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 4v5h5"/><path d="M20 20v-5h-5"/><path d="M4 9a9 9 0 0 1 15-3.8M20 15a9 9 0 0 1-15 3.8"/></svg>
                        Format
                    </button>
                )}
            </div>

            <div className="flex h-[40px] flex-shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--ed-border)] bg-[var(--ed-bg-toolbar)] px-3 text-[var(--ed-text)]" style={insetStyle}>
                <TbIcon title="Undo (⌘Z)" onClick={() => execCommand("undo")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h14a4 4 0 0 1 0 8H9" /><polyline points="7 14 3 10 7 6" /></svg></TbIcon>
                <TbIcon title="Redo (⌘Y)" onClick={() => execCommand("redo")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H7a4 4 0 0 0 0 8h8" /><polyline points="17 14 21 10 17 6" /></svg></TbIcon>
                <TbSep />

                <ToolbarDropdown
                    value={zoom}
                    onSelect={(value) => setZoom(Number(value))}
                    widthClass="w-[74px]"
                    options={[50, 75, 90, 100, 110, 125, 150, 200].map((z) => ({ label: `${z}%`, value: z }))}
                />
                <TbSep />

                <ToolbarDropdown
                    value={textStyle}
                    widthClass="w-[130px]"
                    options={Object.entries(TEXT_STYLE_PRESETS).map(([key, preset]) => ({ label: preset.label, value: key }))}
                    onSelect={(value) => {
                        const val = String(value) as keyof typeof TEXT_STYLE_PRESETS;
                        applyTextPreset(val);
                    }}
                />
                <TbSep />

                <ToolbarDropdown
                    value={fontFamily}
                    widthClass="w-[130px]"
                    options={["Arial", "Times New Roman", "Georgia", "Verdana", "Courier New", "Trebuchet MS"].map((f) => ({ label: f, value: f }))}
                    onSelect={(value) => {
                        const font = String(value);
                        setFontFamily(font);
                        execCommand("fontName", font);
                    }}
                />
                <TbIcon active={isBold} onClick={() => execCommand("bold")} title="Bold (⌘B)"><span className="text-[16px] font-bold">B</span></TbIcon>
                <TbIcon active={isItalic} onClick={() => execCommand("italic")} title="Italic (⌘I)"><span className="text-[16px] italic">I</span></TbIcon>
                <TbIcon active={isUnderline} onClick={() => execCommand("underline")} title="Underline (⌘U)"><span className="text-[16px] underline">U</span></TbIcon>
                <TbSep />

                <TbIcon title="Align left" onClick={() => execCommand("justifyLeft")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" /></svg></TbIcon>
                <TbIcon title="Align center" onClick={() => execCommand("justifyCenter")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="10" x2="6" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="18" y1="18" x2="6" y2="18" /></svg></TbIcon>
                <TbIcon title="Align right" onClick={() => execCommand("justifyRight")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" /></svg></TbIcon>
                <TbIcon title="Justify" onClick={() => execCommand("justifyFull")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" /></svg></TbIcon>
                <TbSep />

                <TbIcon title="Bulleted list" onClick={() => execCommand("insertUnorderedList")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3" cy="6" r="1" fill="currentColor" /><circle cx="3" cy="12" r="1" fill="currentColor" /><circle cx="3" cy="18" r="1" fill="currentColor" /></svg></TbIcon>
                <TbIcon title="Numbered list" onClick={() => execCommand("insertOrderedList")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><text x="2" y="8" fontSize="8" fill="currentColor" fontFamily="Arial">1</text><text x="2" y="14" fontSize="8" fill="currentColor" fontFamily="Arial">2</text><text x="2" y="20" fontSize="8" fill="currentColor" fontFamily="Arial">3</text></svg></TbIcon>
                <TbSep />

                <TbIcon title="Decrease indent" onClick={() => execCommand("outdent")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="7 8 3 12 7 16" /><line x1="21" y1="12" x2="11" y2="12" /><line x1="21" y1="6" x2="11" y2="6" /><line x1="21" y1="18" x2="11" y2="18" /></svg></TbIcon>
                <TbIcon title="Increase indent" onClick={() => execCommand("indent")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 8 7 12 3 16" /><line x1="21" y1="12" x2="11" y2="12" /><line x1="21" y1="6" x2="11" y2="6" /><line x1="21" y1="18" x2="11" y2="18" /></svg></TbIcon>
                <TbSep />

                <TbIcon title="Clear formatting" onClick={() => execCommand("removeFormat")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 21 4-9" /><path d="M3 3h12l-3 7" /><line x1="1" y1="1" x2="23" y2="23" /></svg></TbIcon>
                {/* Grammar loading indicator (always-on, no toggle) */}
                {grammarLoading && (
                    <div className="ml-1 flex items-center gap-1 text-[10px] text-[var(--ed-text-faint)]">
                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" opacity=".2"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                    </div>
                )}
                <div className="ml-auto flex items-center">
                    <TbSep />
                    <ThemeToggle theme={theme} onToggle={toggleTheme} />
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[var(--ed-bg-canvas)]">
                <div ref={pagesViewportRef} className="flex min-h-0 flex-1 flex-col overflow-auto" style={insetStyle}>
                    <div className="sticky top-0 z-20 flex justify-center bg-[var(--ed-bg-canvas)] px-6 pb-2 pt-3">
                        <div
                            ref={rulerRef}
                            className="flex h-[20px] items-end rounded-b-[8px] border-b border-[var(--ed-border)] bg-[var(--ed-bg-toolbar)] select-none"
                            style={{ width: `${pageWidth * (zoom / 100)}px` }}
                        >
                            <div className="relative h-3 w-full">
                                {Array.from({ length: 17 }, (_, i) => (
                                    <div key={i} className="absolute bottom-0 flex flex-col items-center" style={{ left: `${(i / 16) * 100}%` }}>
                                        <div className="h-2 w-px bg-[#4b5563]" />
                                        {i % 2 === 0 && <span className="mt-[-2px] text-[8px] text-[var(--ed-text-muted)]">{i / 2}</span>}
                                    </div>
                                ))}
                                <div
                                    className="absolute bottom-0 z-10 -translate-x-1/2 cursor-col-resize"
                                    style={{ left: `${leftIndent}%` }}
                                    onMouseDown={(e) => { e.preventDefault(); setDraggingMarker("left"); }}
                                >
                                    <div className="h-0 w-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#ea4335] hover:border-b-[#c62828]" />
                                </div>
                                <div
                                    className="absolute bottom-0 z-10 -translate-x-1/2 cursor-col-resize"
                                    style={{ left: `${rightIndent}%` }}
                                    onMouseDown={(e) => { e.preventDefault(); setDraggingMarker("right"); }}
                                >
                                    <div className="h-0 w-0 border-l-[5px] border-r-[5px] border-b-[6px] border-l-transparent border-r-transparent border-b-[#ea4335] hover:border-b-[#c62828]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div ref={pageEditableRef} className="mx-auto my-6 flex flex-col gap-6">
                        {pages.map((page) => {
                            const pageMeta = pageFormatMap[page.id] || {};
                            const pageNumberText = getPageNumberLabel(page.id);
                            const hasMlaRunningHead = formatStyle.toUpperCase() === "MLA";
                            const headerEditing = isHeaderEditing && headerEditingPageId === page.id;
                            const pageShowNumber = pageMeta.showPageNumber ?? showPageNumber;
                            const pageTextAlign = pageMeta.textAlign || "left";
                            const pageLineHeight = pageMeta.lineHeight || lineHeight;
                            const pageCentered = Boolean(pageMeta.centerVertically);
                            return (
                                <div
                                    key={page.id}
                                    ref={(el) => { pageShellRefs.current[page.id] = el; }}
                                    className="relative flex overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)]"
                                    style={{
                                        width: `${pageWidth * (zoom / 100)}px`,
                                        height: `${pageHeight * (zoom / 100)}px`,
                                    }}
                                >
                                    <div
                                        className="flex h-full w-full flex-col"
                                        style={{
                                        paddingTop: `${pagePadding * (zoom / 100)}px`,
                                        paddingBottom: `${pagePadding * (zoom / 100)}px`,
                                        paddingLeft: `${(leftIndent / 100) * pageWidth * (zoom / 100)}px`,
                                        paddingRight: `${((100 - rightIndent) / 100) * pageWidth * (zoom / 100)}px`,
                                        }}
                                    >
                                        <div className={`relative mb-4 border-b-2 border-solid transition ${headerEditing ? "border-[#c5ccd6]" : "border-[#d7dde6]"}`} onDoubleClick={() => activateHeaderEditing(page.id)}>
                                        {!headerEditing && (
                                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => activateHeaderEditing(page.id)} className="w-full py-1 text-left">
                                                {hasMlaRunningHead ? (
                                                    <div className="flex justify-end gap-2 text-right">
                                                        <span
                                                            className={`min-h-[24px] text-[12px] ${headerText.trim() ? "text-[#111827]" : "text-[#9098a5]"}`}
                                                            style={{ fontFamily: headerText.trim() ? fontFamily : "'Poppins', sans-serif", fontSize: `${11 * (zoom / 100)}pt` }}
                                                        >
                                                            {headerText.trim() || "Double-click to edit header"}
                                                        </span>
                                                        {pageShowNumber && pageNumberText && (
                                                            <input
                                                                value={pageNumberText}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setPageNumberOverrides((prev) => {
                                                                        const next = { ...prev };
                                                                        if (!val.trim()) delete next[page.id];
                                                                        else next[page.id] = val;
                                                                        return next;
                                                                    });
                                                                }}
                                                                className="w-[34px] border-none bg-transparent text-right text-[12px] font-medium text-[#111827] outline-none"
                                                            />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span
                                                            className={`min-h-[24px] flex-1 text-[12px] ${headerText.trim() ? "text-[#111827]" : "text-[#9098a5]"}`}
                                                            style={{ fontFamily: headerText.trim() ? fontFamily : "'Poppins', sans-serif", fontSize: `${11 * (zoom / 100)}pt` }}
                                                        >
                                                            {headerText.trim() || "Double-click to edit header"}
                                                        </span>
                                                        {pageShowNumber && pageNumberText && (
                                                            <input
                                                                value={pageNumberText}
                                                                onMouseDown={(e) => e.stopPropagation()}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setPageNumberOverrides((prev) => {
                                                                        const next = { ...prev };
                                                                        if (!val.trim()) delete next[page.id];
                                                                        else next[page.id] = val;
                                                                        return next;
                                                                    });
                                                                }}
                                                                className="w-[34px] border-none bg-transparent text-right text-[12px] font-medium text-[#374151] outline-none"
                                                            />
                                                        )}
                                                    </div>
                                                )}
                                            </button>
                                        )}

                                        {headerEditing && (
                                            <div className="pb-1">
                                                <div className="mb-1 flex items-center justify-between text-[11px] text-[#6b7280]">
                                                    <span className="font-medium">Header</span>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onClick={() => {
                                                                setPageFormatMap((prev) => {
                                                                    const current = prev[page.id] || {};
                                                                    const base = current.showPageNumber ?? showPageNumber;
                                                                    return {
                                                                        ...prev,
                                                                        [page.id]: {
                                                                            ...current,
                                                                            showPageNumber: !base,
                                                                        },
                                                                    };
                                                                });
                                                            }}
                                                            className={`rounded-[6px] px-2 py-0.5 ${pageShowNumber ? "bg-[#e8f0fe] text-[#174ea6]" : "bg-[#f1f3f4] text-[#4b5563]"}`}
                                                        >
                                                            {pageShowNumber ? "Page # on" : "Add page #"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onClick={() => { setIsHeaderEditing(false); setHeaderEditingPageId(null); }}
                                                            className="rounded-[6px] bg-[#f1f3f4] px-2 py-0.5 text-[#4b5563]"
                                                        >
                                                            Close
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className={`flex gap-2 ${hasMlaRunningHead ? "justify-end" : "items-center justify-between"}`}>
                                                    <div
                                                        ref={(el) => { headerRefs.current[page.id] = el; }}
                                                        contentEditable
                                                        suppressContentEditableWarning
                                                        onInput={() => setHeaderText(headerRefs.current[page.id]?.innerText || "")}
                                                        onFocus={() => saveSelection()}
                                                        onMouseUp={() => saveSelection()}
                                                        onKeyUp={() => saveSelection()}
                                                        className={`min-h-[24px] text-[#111827] outline-none ${hasMlaRunningHead ? "min-w-[120px] text-right" : "flex-1"}`}
                                                        style={{ fontSize: `${11 * (zoom / 100)}pt`, lineHeight: "1.3", fontFamily, color: "#111827" }}
                                                    />
                                                    {pageShowNumber && pageNumberText && (
                                                        <input
                                                            value={pageNumberText}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setPageNumberOverrides((prev) => {
                                                                    const next = { ...prev };
                                                                    if (!val.trim()) delete next[page.id];
                                                                    else next[page.id] = val;
                                                                    return next;
                                                                });
                                                            }}
                                                            className="w-[34px] border-none bg-transparent text-right text-[12px] font-medium text-[#374151] outline-none"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        </div>

                                        <div
                                            ref={(el) => {
                                                editorRefs.current[page.id] = el;
                                                if (el && el.dataset.hydrated !== "1") {
                                                    el.innerHTML = pageContentRef.current[page.id] || "<br/>";
                                                    el.dataset.hydrated = "1";
                                                }
                                            }}
                                            contentEditable
                                            suppressContentEditableWarning
                                            onInput={() => { handlePageInput(page.id); scheduleGrammarCheck(page.id); }}
                                            onKeyDown={(e) => handleEditorKeyDown(e, page.id)}
                                            onKeyUp={() => { queryFormattingState(); saveSelection(); }}
                                            onMouseUp={() => { queryFormattingState(); saveSelection(); }}
                                            onFocus={() => {
                                                setIsHeaderEditing(false);
                                                setHeaderEditingPageId(null);
                                                setActivePageId(page.id);
                                                saveSelection();
                                            }}
                                            className="min-h-0 w-full flex-1 overflow-hidden outline-none"
                                            style={{
                                                fontFamily,
                                                fontSize: `${baseFontSizePt * (zoom / 100)}pt`,
                                                lineHeight: String(pageLineHeight),
                                                color: "#1f1f1f",
                                                whiteSpace: "pre-wrap",
                                                wordBreak: "break-word",
                                                textAlign: pageTextAlign,
                                                display: pageCentered ? "flex" : "block",
                                                flexDirection: pageCentered ? "column" : undefined,
                                                justifyContent: pageCentered ? "center" : undefined,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex h-[28px] flex-shrink-0 items-center justify-between border-t border-[var(--ed-border)] bg-[var(--ed-bg-bar)] px-4 text-[12px] text-[var(--ed-status-text)]" style={insetStyle}>
                <div className="flex items-center gap-4">
                    <span>{wordCount} words</span>
                    <span>{charCount} characters</span>
                    <span className="text-[var(--ed-status-text)]">|</span>
                    <span>Editing</span>
                </div>
                <div className="flex items-center gap-4">
                    <span>Zoom: {zoom}%</span>
                </div>
            </div>

            {/* ── Grammar tooltip ── */}
            {grammarTip && (() => {
                // Keep tooltip within viewport — flip up if near bottom
                const TIP_W = 268;
                const TIP_H = grammarTip.fix ? 68 : 44;
                const GAP = 14;
                const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
                const vh = typeof window !== "undefined" ? window.innerHeight : 800;
                const left = Math.min(grammarTip.x + GAP, vw - TIP_W - 8);
                const top = grammarTip.y + GAP + TIP_H > vh
                    ? grammarTip.y - TIP_H - GAP   // flip above cursor
                    : grammarTip.y + GAP;           // default: below cursor
                return (
                    <div className="pointer-events-none fixed z-[9999]" style={{ left, top }}>
                        <div className="rounded-xl border border-[#ef4444]/30 bg-[#1a1e27] px-3 py-2 shadow-2xl shadow-black/60"
                            style={{ width: TIP_W, animation: "dict-in 0.18s ease-out both" }}>
                            <p className="text-[11.5px] leading-snug text-[#e2e8f0]">{grammarTip.msg}</p>
                            {grammarTip.fix && (
                                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#4ade80]">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                    {grammarTip.fix}
                                </p>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
