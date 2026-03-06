"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { Organizer } from "@/services/OrganizerService";
import { FormatterService } from "@/services/FormatterService";
import { FormatterPage } from "@/services/FormatterTypes";

interface EditorViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
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

type PageOutlineMap = Record<number, string[]>;

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
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-[4px] transition-colors ${disabled ? "opacity-30 cursor-not-allowed" : ""} ${active ? "bg-[#ea4335]/22 text-[#f87171]" : "text-white/85 hover:bg-[#2b313a]"}`}
    >
        {children}
    </button>
);

const TbSep = () => <div className="mx-1 h-5 w-px bg-[#3a3f47]" />;

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
                className="flex h-[28px] w-full items-center justify-between rounded-[6px] px-2 text-[13px] text-[#e5e7eb] transition hover:bg-[#2c323a]"
            >
                <span className="truncate">{active?.label}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-full z-30 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[10px] border border-[#3b4048] bg-[#171a1f] p-1 shadow-[0_12px_26px_rgba(0,0,0,0.4)]">
                        {options.map((opt) => (
                            <button
                                key={String(opt.value)}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { onSelect(opt.value); setOpen(false); }}
                                className={`flex w-full items-center justify-between rounded-[7px] px-2.5 py-1.5 text-left text-[13px] transition ${opt.value === value ? "bg-[#2b3442] text-[#93c5fd]" : "text-[#e5e7eb] hover:bg-[#242932]"}`}
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

/* ─── Color Picker Popover ─── */
const ColorPicker = ({ colors, activeColor, onSelect, onClose }: { colors: string[]; activeColor: string; onSelect: (c: string) => void; onClose: () => void }) => (
    <>
        <div className="fixed inset-0 z-30" onClick={onClose} />
        <div className="absolute top-full left-1/2 z-40 mt-2 w-[196px] -translate-x-1/2 rounded-xl border border-[#3b4048] bg-[#171a1f] p-2.5 shadow-[0_14px_28px_rgba(0,0,0,0.45)]">
            <div className="grid grid-cols-5 gap-2">
                {colors.map(c => (
                    <button
                        key={c}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { onSelect(c); onClose(); }}
                        className={`h-7 w-7 rounded-full border-2 transition hover:scale-110 ${activeColor === c ? "border-[#ea4335] ring-2 ring-[#ea4335]/30" : "border-[#4b5563]"}`}
                        style={{ background: c === "transparent" ? "conic-gradient(from 45deg, #edf2fa 0 25%, #ffffff 0 50%, #edf2fa 0 75%, #ffffff 0)" : c }}
                    />
                ))}
            </div>
        </div>
    </>
);

const TEXT_COLORS = ["#1f1f1f", "#ea4335", "#fbbc04", "#34a853", "#4285f4", "#9334e6", "#e91e63", "#ff6d00", "#795548", "#607d8b"];
const HIGHLIGHT_COLORS = ["transparent", "#fce4ec", "#fff9c4", "#e8f5e9", "#e3f2fd", "#f3e5f5", "#fff3e0", "#fbe9e7", "#f5f5f5", "#cfd8dc"];
const FONT_SIZE_TEMPLATES = [4, 6, 8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 60, 120, 126, 200, 246, 254];
const LEGACY_FONT_SIZE_PT = [8, 10, 12, 14, 18, 24, 36];

function buildPageOutlineLines(text: string): string[] {
    const normalized = text
        .replace(/\r/g, "")
        .split(/\n{2,}/)
        .map((chunk) => chunk.replace(/\s+/g, " ").trim())
        .filter(Boolean);

    const paragraphLike = normalized.length > 0
        ? normalized
        : text
            .split(/\n+/)
            .map((line) => line.replace(/\s+/g, " ").trim())
            .filter(Boolean);

    return paragraphLike
        .slice(0, 6)
        .map((line) => (line.length > 42 ? `${line.slice(0, 42).trimEnd()}...` : line));
}

export default function EditorView({ onBack, onNext }: EditorViewProps) {
    const org = useOrganizer();

    const pageWidth = 816;
    const pageHeight = 1056;
    const pagePadding = 96;

    const formattedDoc = FormatterService.formatFromOrganizer(org);

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

    const initialPlainText = initialPageHtmls
        .map((html) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
        .join("\n");
    const initialLines = initialPlainText.split("\n").filter(l => l.trim().length > 0);
    const initialHeadings = initialLines.filter(l => l.trim().length < 60 && l.trim().length > 3).slice(0, 8);

    const [docTitle, setDocTitle] = useState(org.finalEssayTitle || "Untitled document");
    const [textStyle, setTextStyle] = useState("p");
    const [fontSize, setFontSize] = useState(12);
    const [fontSizeInput, setFontSizeInput] = useState("12");
    const [isFontSizeMixed, setIsFontSizeMixed] = useState(false);
    const [fontFamily, setFontFamily] = useState(formattedDoc.profile.defaultFont || "Arial");
    const [lineHeight] = useState(formattedDoc.profile.lineHeight || 1.5);
    const [zoom, setZoom] = useState(100);
    const [wordCount, setWordCount] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [pageNumberStartPage] = useState(formattedDoc.profile.pageNumberStartPage || 1);
    const [pageNumberStartNumber] = useState(formattedDoc.profile.pageNumberStartNumber || 1);

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [pages, setPages] = useState<DocPage[]>(initialPageList);
    const [pageFormatMap, setPageFormatMap] = useState<Record<number, PageFormatMeta>>(initialPageFormatMap);
    const [activePageId, setActivePageId] = useState(initialPageList[0]?.id || 1);
    const [isHeaderEditing, setIsHeaderEditing] = useState(false);
    const [headerEditingPageId, setHeaderEditingPageId] = useState<number | null>(null);
    const [headerText, setHeaderText] = useState(formattedDoc.profile.headerText || "");
    const [showPageNumber] = useState(Boolean(formattedDoc.profile.showPageNumber));
    const [pageNumberOverrides, setPageNumberOverrides] = useState<Record<number, string>>({});
    const [headings, setHeadings] = useState<string[]>(initialHeadings);
    const [pageOutlineMap, setPageOutlineMap] = useState<PageOutlineMap>(() => initialPageHtmls.reduce<PageOutlineMap>((acc, html, index) => {
        const plainText = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
        acc[index + 1] = buildPageOutlineLines(plainText);
        return acc;
    }, {}));

    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);

    const [showTextColorPicker, setShowTextColorPicker] = useState(false);
    const [showHighlightPicker, setShowHighlightPicker] = useState(false);
    const [activeTextColor, setActiveTextColor] = useState("#1f1f1f");
    const [activeHighlight, setActiveHighlight] = useState("transparent");

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
        const nextPreviewMap: PageOutlineMap = {};
        const allText = pages.map((p) => {
            const editor = editorRefs.current[p.id];
            const pageText = editor ? (editor.innerText || "") : (() => {
                parser.innerHTML = pageContentRef.current[p.id] || "";
                return parser.innerText || "";
            })();
            nextPreviewMap[p.id] = buildPageOutlineLines(pageText);
            return pageText;
        }).join("\n");

        const words = allText.split(/\s+/).filter(w => w.length > 0).length;
        setWordCount(words);
        setCharCount(allText.length);
        setPageOutlineMap(nextPreviewMap);

        const lines = allText.split("\n").filter(l => l.trim().length > 0);
        const extracted = lines.filter(l => l.trim().length < 60 && l.trim().length > 3).slice(0, 8);
        setHeadings(extracted);
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

    const readFontSizePt = useCallback((el: Element | null) => {
        if (!el) return null;
        const px = parseFloat(window.getComputedStyle(el).fontSize || "16");
        if (!Number.isFinite(px)) return null;
        const zoomScale = zoom / 100 || 1;
        return Math.max(1, Math.round(((px / zoomScale) * 72) / 96));
    }, [zoom]);

    const updateFontSizeFromSelection = useCallback(() => {
        const sel = window.getSelection();
        const root = pageEditableRef.current;
        if (!sel || sel.rangeCount === 0 || !root) return;
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) return;

        const sizes = new Set<number>();
        const addSizeFromNode = (node: Node | null) => {
            if (!node) return;
            const el = node instanceof Element ? node : node.parentElement;
            const size = readFontSizePt(el);
            if (size) sizes.add(size);
        };

        if (range.collapsed) {
            addSizeFromNode(sel.anchorNode);
        } else {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            while (node) {
                if (range.intersectsNode(node) && node.textContent?.trim()) addSizeFromNode(node);
                node = walker.nextNode();
            }
            if (sizes.size === 0) addSizeFromNode(sel.anchorNode);
        }

        if (sizes.size > 1) {
            setIsFontSizeMixed(true);
            setFontSizeInput("--");
            return;
        }

        const only = sizes.values().next().value as number | undefined;
        if (only && Number.isFinite(only)) {
            setIsFontSizeMixed(false);
            setFontSize(only);
            setFontSizeInput(String(only));
        }
    }, [readFontSizePt]);

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
            if (t.nodeValue?.includes("\u200b")) {
                t.nodeValue = t.nodeValue.replace(/\u200b/g, "");
            }
            textNode = textWalker.nextNode();
        }

        const spans = Array.from(root.querySelectorAll("span"));
        for (const span of spans) {
            const text = (span.textContent || "").replace(/\u200b/g, "");
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
        const text = (root.textContent || "").replace(/\u200b/g, "").trim();
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

    const rebalancePaginationFrom = useCallback((startPageId: number) => {
        const startIndex = pagesRef.current.findIndex((p) => p.id === startPageId);
        if (startIndex < 0) return;

        for (let i = startIndex; i < pagesRef.current.length; i++) {
            const currentPage = pagesRef.current[i];
            const currentEditor = editorRefs.current[currentPage.id];
            if (!currentEditor) continue;

            cleanupEditorArtifacts(currentEditor);

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
                const moved = moveUnderflowNode(nextEditor, currentEditor);
                cleanupEditorArtifacts(currentEditor);
                cleanupEditorArtifacts(nextEditor);
                if (!moved) break;
                if (currentEditor.scrollHeight > currentEditor.clientHeight + 1) {
                    const last = currentEditor.lastChild;
                    if (last) nextEditor.insertBefore(last, nextEditor.firstChild);
                    cleanupEditorArtifacts(currentEditor);
                    cleanupEditorArtifacts(nextEditor);
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
    }, [activePageId, cleanupEditorArtifacts, isEditorEffectivelyEmpty, lineHeight, moveOverflowNode, moveUnderflowNode, pageFormatMap, showPageNumber, updateStats]);

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
    }, [zoom, leftIndent, rightIndent, pages.length]);

    const captureSelectionBeforeToolbarAction = useCallback(() => {
        saveSelection();
    }, [saveSelection]);

    const execCommand = useCallback((cmd: string, value?: string) => {
        restoreSelection();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            editorRefs.current[activePageId]?.focus();
        }
        document.execCommand(cmd, false, value);
        saveSelection();
        queryFormattingState();
    }, [activePageId, queryFormattingState, restoreSelection, saveSelection]);

    const applyColor = useCallback((command: "foreColor" | "hiliteColor", color: string) => {
        restoreSelection();
        editorRefs.current[activePageId]?.focus();
        document.execCommand("styleWithCSS", false, "true");
        if (command === "hiliteColor") {
            const ok = document.execCommand("hiliteColor", false, color);
            if (!ok) document.execCommand("backColor", false, color);
        } else {
            document.execCommand("foreColor", false, color);
        }
        saveSelection();
        queryFormattingState();
    }, [activePageId, queryFormattingState, restoreSelection, saveSelection]);

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
        setFontSize(safe);
        setFontSizeInput(String(safe));
        setIsFontSizeMixed(false);
        queryFormattingState();
        updateFontSizeFromSelection();
    }, [activePageId, cleanupEditorArtifacts, queryFormattingState, restoreSelection, saveSelection, updateFontSizeFromSelection, updateStats]);

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

    const addPage = useCallback(() => {
        const newId = nextPageIdRef.current++;
        const activeMeta = pageFormatMap[activePageId] || {};
        pageContentRef.current[newId] = "<br/>";
        setPageFormatMap((prev) => ({
            ...prev,
            [newId]: {
                textAlign: activeMeta.textAlign || "left",
                centerVertically: false,
                showPageNumber: activeMeta.showPageNumber ?? showPageNumber,
                lineHeight: activeMeta.lineHeight || lineHeight,
            },
        }));
        setPages((prev) => {
            const next = [...prev, { id: newId, title: "Page" }];
            const mapped = next.map((p, i) => ({ ...p, title: `Page ${i + 1}` }));
            pagesRef.current = mapped;
            return mapped;
        });
        setActivePageId(newId);
        setIsHeaderEditing(false);
        setHeaderEditingPageId(null);
        requestAnimationFrame(() => {
            pageShellRefs.current[newId]?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }, [activePageId, lineHeight, pageFormatMap, showPageNumber]);

    const deletePage = useCallback((id: number) => {
        if (pages.length <= 1) return;
        const page = pages.find((p) => p.id === id);
        if (!page) return;
        const ok = window.confirm(`Delete ${page.title}?`);
        if (!ok) return;

        const nextPages = pages.filter((p) => p.id !== id).map((p, i) => ({ ...p, title: `Page ${i + 1}` }));
        const nextOverrides: Record<number, string> = { ...pageNumberOverrides };
        delete nextOverrides[id];

        delete pageContentRef.current[id];
        delete editorRefs.current[id];
        delete pageShellRefs.current[id];
        delete headerRefs.current[id];
        setPageFormatMap((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });

        setPages(nextPages);
        pagesRef.current = nextPages;
        setPageNumberOverrides(nextOverrides);

        if (activePageId === id && nextPages[0]) {
            setActivePageId(nextPages[0].id);
            requestAnimationFrame(() => {
                pageShellRefs.current[nextPages[0].id]?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        }
    }, [activePageId, pageNumberOverrides, pages]);

    const scrollToPage = useCallback((id: number) => {
        setIsHeaderEditing(false);
        setHeaderEditingPageId(null);
        setActivePageId(id);
        pageShellRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    const locateParagraphOnPage = useCallback((pageId: number, snippet: string) => {
        setIsHeaderEditing(false);
        setHeaderEditingPageId(null);
        setActivePageId(pageId);
        pageShellRefs.current[pageId]?.scrollIntoView({ behavior: "smooth", block: "start" });

        window.setTimeout(() => {
            const editor = editorRefs.current[pageId];
            if (!editor) return;

            const normalizedSnippet = snippet.replace(/\.\.\.$/, "").trim().toLowerCase();
            const blockCandidates = Array.from(editor.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote"))
                .filter((node) => (node.textContent || "").replace(/\s+/g, " ").trim().length > 0);

            const matchedBlock = blockCandidates.find((node) => (
                (node.textContent || "").replace(/\s+/g, " ").trim().toLowerCase().includes(normalizedSnippet)
            ));

            if (matchedBlock instanceof HTMLElement) {
                matchedBlock.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }

            editor.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 180);
    }, []);

    const handlePageInput = useCallback((pageId: number) => {
        cleanupEditorArtifacts(editorRefs.current[pageId] || null);
        const html = editorRefs.current[pageId]?.innerHTML || "<br/>";
        pageContentRef.current[pageId] = html;
        rebalancePaginationFrom(pageId);
        saveSelection();
    }, [cleanupEditorArtifacts, rebalancePaginationFrom, saveSelection]);

    const handleExport = useCallback(() => {
        const parser = document.createElement("div");
        const allPagesText = pages.map((page, idx) => {
            const html = editorRefs.current[page.id]?.innerHTML || pageContentRef.current[page.id] || "";
            parser.innerHTML = html;
            return `Page ${idx + 1}\n${parser.innerText.trim()}`;
        }).join("\n\n");
        Organizer.set({
            generatedEssay: allPagesText,
            finalEssayTitle: docTitle.trim() || "Untitled document",
        });
        onNext("export");
    }, [docTitle, onNext, pages]);

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
                const allPagesText = pages.map((page) => {
                    const html = editorRefs.current[page.id]?.innerHTML || pageContentRef.current[page.id] || "";
                    parser.innerHTML = html;
                    return parser.innerText.trim();
                }).join("\n\n");
                Organizer.set({
                    generatedEssay: allPagesText,
                    finalEssayTitle: docTitle.trim() || "Untitled document",
                });
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [docTitle, pages]);

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
            updateFontSizeFromSelection();
        };
        document.addEventListener("selectionchange", onSelectionChange);
        return () => document.removeEventListener("selectionchange", onSelectionChange);
    }, [queryFormattingState, saveSelection, updateFontSizeFromSelection]);

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
        return () => {
            viewport.removeEventListener("scroll", onScroll);
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [activePageId, pages]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#0f1115]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            <div className="flex h-[48px] items-center gap-2 bg-[#161a20] px-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full" title="Document">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#ea4335" /><path d="M7 8h10M7 12h7M7 16h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </div>

                <input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="h-[28px] min-w-0 flex-1 rounded-[4px] border border-transparent bg-transparent px-2 text-[18px] font-normal text-[#f3f4f6] outline-none transition hover:border-[#3b4048] focus:border-[#ea4335]"
                    spellCheck={false}
                />

                <div className="flex-1" />

                <button
                    onClick={handleExport}
                    className="flex h-9 items-center gap-2 rounded-full bg-[#ea4335] px-5 text-[14px] font-medium text-white shadow-sm transition hover:bg-[#d33426] hover:shadow-md"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Export
                </button>
            </div>

            <div className="mx-3 mt-1 flex h-[40px] flex-shrink-0 items-center gap-0.5 rounded-t-[8px] border-b border-[#2f353f] bg-[#1b2028] px-3 text-[#f3f4f6]">
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
                <TbSep />

                <div className="flex items-center gap-0.5">
                    <button
                        onMouseDown={(e) => { e.preventDefault(); captureSelectionBeforeToolbarAction(); }}
                        onClick={() => {
                        const current = Number(fontSizeInput);
                        const base = Number.isFinite(current) ? current : fontSize;
                        applyFontSizeToSelection(Math.max(1, base - 1));
                    }}
                        className="flex h-[28px] w-[22px] items-center justify-center rounded-[4px] text-white/85 hover:bg-[#2b313a]"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                    <input
                        value={fontSizeInput}
                        onMouseDown={() => captureSelectionBeforeToolbarAction()}
                        list="font-size-templates"
                        onChange={(e) => {
                            const next = e.target.value.replace(/[^\d]/g, "");
                            setFontSizeInput(next || (isFontSizeMixed ? "--" : ""));
                            if (next) setIsFontSizeMixed(false);
                        }}
                        onFocus={() => {
                            captureSelectionBeforeToolbarAction();
                            if (isFontSizeMixed) setFontSizeInput("");
                        }}
                        onBlur={() => {
                            const n = Number(fontSizeInput);
                            if (Number.isFinite(n) && n > 0) {
                                applyFontSizeToSelection(n);
                            } else if (isFontSizeMixed) {
                                setFontSizeInput("--");
                            } else {
                                setFontSizeInput(String(fontSize));
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                captureSelectionBeforeToolbarAction();
                                const n = Number(fontSizeInput);
                                if (Number.isFinite(n) && n > 0) applyFontSizeToSelection(n);
                            }
                        }}
                        className="h-[28px] w-[44px] rounded-[4px] border border-[#3b4048] bg-[#11151b] text-center text-[13px] text-[#f3f4f6] outline-none focus:border-[#ea4335]"
                    />
                    <datalist id="font-size-templates">
                        {FONT_SIZE_TEMPLATES.map((size) => (
                            <option key={size} value={size} />
                        ))}
                    </datalist>
                    <button
                        onMouseDown={(e) => { e.preventDefault(); captureSelectionBeforeToolbarAction(); }}
                        onClick={() => {
                        const current = Number(fontSizeInput);
                        const base = Number.isFinite(current) ? current : fontSize;
                        applyFontSizeToSelection(base + 1);
                    }}
                        className="flex h-[28px] w-[22px] items-center justify-center rounded-[4px] text-white/85 hover:bg-[#2b313a]"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </button>
                </div>
                <TbSep />

                <TbIcon active={isBold} onClick={() => execCommand("bold")} title="Bold (⌘B)"><span className="text-[16px] font-bold">B</span></TbIcon>
                <TbIcon active={isItalic} onClick={() => execCommand("italic")} title="Italic (⌘I)"><span className="text-[16px] italic">I</span></TbIcon>
                <TbIcon active={isUnderline} onClick={() => execCommand("underline")} title="Underline (⌘U)"><span className="text-[16px] underline">U</span></TbIcon>

                <div className="relative">
                    <TbIcon title="Text color" onClick={() => {
                        setShowHighlightPicker(false);
                        setShowTextColorPicker((prev) => !prev);
                    }}>
                        <div className="flex flex-col items-center">
                            <span className="text-[16px] font-medium" style={{ color: activeTextColor }}>A</span>
                            <div className="mt-[-4px] h-[3px] w-[14px] rounded-full" style={{ backgroundColor: activeTextColor }} />
                        </div>
                    </TbIcon>
                    {showTextColorPicker && (
                        <ColorPicker
                            colors={TEXT_COLORS}
                            activeColor={activeTextColor}
                            onSelect={(c) => { setActiveTextColor(c); applyColor("foreColor", c); }}
                            onClose={() => setShowTextColorPicker(false)}
                        />
                    )}
                </div>

                <div className="relative">
                    <TbIcon title="Highlight color" onClick={() => {
                        setShowTextColorPicker(false);
                        setShowHighlightPicker((prev) => !prev);
                    }}>
                        <div className="flex flex-col items-center">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                            <div className="mt-[-2px] h-[3px] w-[14px] rounded-full" style={{ backgroundColor: activeHighlight === "transparent" ? "#fbbc04" : activeHighlight }} />
                        </div>
                    </TbIcon>
                    {showHighlightPicker && (
                        <ColorPicker
                            colors={HIGHLIGHT_COLORS}
                            activeColor={activeHighlight}
                            onSelect={(c) => { setActiveHighlight(c); applyColor("hiliteColor", c); }}
                            onClose={() => setShowHighlightPicker(false)}
                        />
                    )}
                </div>
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
            </div>

            <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#11151b]">
                <div className={`relative flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-[#2f353f] bg-[#171b22] transition-[width] duration-300 ease-out ${sidebarOpen ? "w-[220px]" : "w-0"}`}>
                    <div className={`flex h-full min-h-0 flex-col transition-opacity duration-200 ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}>
                        <div className="flex items-center justify-between border-b border-[#2f353f] px-3 py-2">
                            <button onClick={() => setSidebarOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[#2a3039]">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                            </button>
                        </div>
                        <div className="flex items-center justify-between border-b border-[#2f353f] px-3 py-2">
                            <span className="text-[13px] font-medium text-[#e5e7eb]">Document pages</span>
                            <button onClick={addPage} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[#2a3039]" title="Add page">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <div className="mx-2 mt-2 flex flex-col gap-3 pb-4">
                                {pages.map((page) => {
                                    const isActive = page.id === activePageId;
                                    const previewLines = pageOutlineMap[page.id] || [];
                                    return (
                                        <div
                                            key={page.id}
                                            onClick={() => scrollToPage(page.id)}
                                            className={`cursor-pointer rounded-[18px] border px-4 py-3 text-left transition ${isActive ? "border-[#ea4335]/25 bg-[#ea4335]/16" : "border-transparent bg-transparent hover:border-white/5 hover:bg-[#262d37]"}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0"><rect x="3" y="3" width="18" height="18" rx="2" fill={isActive ? "#ea4335" : "#9ca3af"} /><path d="M7 8h10M7 12h7M7 16h10" stroke="white" strokeWidth="1.3" strokeLinecap="round" /></svg>
                                                <span className={`text-[13px] font-medium ${isActive ? "text-[#f87171]" : "text-[#cbd5e1]"}`}>{page.title}</span>
                                                <div className="flex-1" />
                                                <button
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}
                                                    className={`flex h-5 w-5 items-center justify-center rounded-full ${isActive ? "hover:bg-[#ea4335]/22" : "hover:bg-[#2f3742]"}`}
                                                    title={pages.length <= 1 ? "Cannot delete the only page" : `Delete ${page.title}`}
                                                    disabled={pages.length <= 1}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isActive ? "#f87171" : "#94a3b8"} strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                                                </button>
                                            </div>

                                            <div className="ml-[23px] mt-3 border-l border-white/10 pl-4">
                                                <div className="space-y-2.5">
                                                    {previewLines.length > 0 ? (
                                                        previewLines.map((line, lineIndex) => (
                                                            <button
                                                                key={`${page.id}-preview-${lineIndex}`}
                                                                type="button"
                                                                onMouseDown={(e) => e.preventDefault()}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    locateParagraphOnPage(page.id, line);
                                                                }}
                                                                className={`group flex w-full items-start gap-2 text-left transition ${isActive ? "" : ""}`}
                                                            >
                                                                <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full transition ${isActive ? "bg-[#ff8a80]" : "bg-[#8ea0bb] group-hover:bg-[#d6deea]"}`} />
                                                                <span className={`line-clamp-2 text-[11px] leading-4 transition ${isActive ? "text-white/88" : "text-[#a9b4c7] group-hover:text-[#e2e8f0]"}`}>
                                                                    {line}
                                                                </span>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="flex items-start gap-2">
                                                            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#64748b]" />
                                                            <span className="truncate text-[11px] italic leading-4 text-[#64748b]">No content yet</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-2 px-4 pb-4">
                            {headings.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                    {headings.map((h, i) => (
                                        <span key={i} className="truncate text-[12px] text-[#94a3b8] transition hover:text-[#e5e7eb]">{h}</span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[12px] italic text-[#94a3b8]">Headings you add to the document will appear here.</p>
                            )}
                        </div>
                        </div>
                    </div>
                </div>

                {!sidebarOpen && (
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#1f252e] shadow-md transition hover:bg-[#2a313b]"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                )}

                <div ref={pagesViewportRef} className="flex min-h-0 flex-1 flex-col overflow-auto">
                    <div className="sticky top-0 z-20 flex justify-center bg-[#11151b] px-6 pb-2 pt-3">
                        <div
                            ref={rulerRef}
                            className="flex h-[20px] items-end rounded-b-[8px] border-b border-[#2f353f] bg-[#1b2028] select-none"
                            style={{ width: `${pageWidth * (zoom / 100)}px` }}
                        >
                            <div className="relative h-3 w-full">
                                {Array.from({ length: 17 }, (_, i) => (
                                    <div key={i} className="absolute bottom-0 flex flex-col items-center" style={{ left: `${(i / 16) * 100}%` }}>
                                        <div className="h-2 w-px bg-[#4b5563]" />
                                        {i % 2 === 0 && <span className="mt-[-2px] text-[8px] text-[#94a3b8]">{i / 2}</span>}
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
                                                <div className="flex items-center justify-between gap-2">
                                                    <div
                                                        ref={(el) => { headerRefs.current[page.id] = el; }}
                                                        contentEditable
                                                        suppressContentEditableWarning
                                                        onInput={() => setHeaderText(headerRefs.current[page.id]?.innerText || "")}
                                                        onFocus={() => saveSelection()}
                                                        onMouseUp={() => saveSelection()}
                                                        onKeyUp={() => saveSelection()}
                                                        className="min-h-[24px] flex-1 text-[#111827] outline-none"
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
                                            onInput={() => handlePageInput(page.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Tab") {
                                                    e.preventDefault();
                                                    document.execCommand(
                                                        "insertHTML",
                                                        false,
                                                        '<span data-tab-stop="1" style="display:inline-block;width:0.5in;"></span>'
                                                    );
                                                    handlePageInput(page.id);
                                                }
                                            }}
                                            onKeyUp={() => { queryFormattingState(); saveSelection(); }}
                                            onMouseUp={() => { queryFormattingState(); saveSelection(); }}
                                            onFocus={() => {
                                                setIsHeaderEditing(false);
                                                setHeaderEditingPageId(null);
                                                setActivePageId(page.id);
                                                updateFontSizeFromSelection();
                                                saveSelection();
                                            }}
                                            className="min-h-0 w-full flex-1 overflow-hidden outline-none"
                                            style={{
                                                fontFamily,
                                                fontSize: `${12 * (zoom / 100)}pt`,
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

            <div className="flex h-[28px] flex-shrink-0 items-center justify-between border-t border-[#2f353f] bg-[#161a20] px-4 text-[12px] text-[#cbd5e1]">
                <div className="flex items-center gap-4">
                    <span>{wordCount} words</span>
                    <span>{charCount} characters</span>
                    <span className="text-[#b0b0b0]">|</span>
                    <span>Editing</span>
                </div>
                <div className="flex items-center gap-4">
                    <span>Zoom: {zoom}%</span>
                </div>
            </div>
        </div>
    );
}
