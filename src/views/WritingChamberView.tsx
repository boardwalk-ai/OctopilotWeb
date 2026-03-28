"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { CitationTemplateService } from "@/services/CitationTemplateService";
import { CreditDeductionError, CreditService } from "@/services/CreditService";
import { InTextCitationService } from "@/services/InTextCitationService";
import { Organizer, SourceData } from "@/services/OrganizerService";
import { SpoonieService } from "@/services/SpoonieService";
import { SuService } from "@/services/SuService";
import mobileStyles from "./WritingChamberViewMobile.module.css";

interface WritingChamberViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

interface ChamberSection {
    id: string;
    type: string;
    title: string;
    description: string;
}

interface SourceThread extends SourceData {
    index: number;
}

type AssistantItemType = "idea" | "answer";

interface AssistantItem {
    id: string;
    type: AssistantItemType;
    text: string;
}

interface SummaryInsights {
    done: string[];
    suggestions: string[];
}

type ResolvedCitation = {
    sourceIndex: number;
    citation: string;
    source: SourceData;
};

type SectionTypeOption = "Introduction" | "Body Paragraph" | "Conclusion";

type DialogState =
    | { type: "confirm-clear"; title: string; message: string }
    | { type: "source-in-use"; title: string; message: string }
    | { type: "info"; title: string; message: string };

const SOURCE_COLOR_POOL = [
    { border: "#35b6ff", soft: "rgba(53, 182, 255, 0.14)", text: "#7dd3fc" },
    { border: "#32d375", soft: "rgba(50, 211, 117, 0.14)", text: "#86efac" },
    { border: "#f6b02d", soft: "rgba(246, 176, 45, 0.14)", text: "#fcd34d" },
    { border: "#bf7bff", soft: "rgba(191, 123, 255, 0.14)", text: "#d8b4fe" },
    { border: "#ff6b6b", soft: "rgba(255, 107, 107, 0.14)", text: "#fda4af" },
];

const SOURCE_PICKER_COLORS = [
    ...SOURCE_COLOR_POOL,
    { border: "#4ade80", soft: "rgba(74, 222, 128, 0.14)", text: "#bbf7d0" },
    { border: "#fb7185", soft: "rgba(251, 113, 133, 0.14)", text: "#fecdd3" },
];

const TYPE_BADGE: Record<string, string> = {
    introduction: "bg-[#0f2237] text-[#8dc8ff] border border-[#1a3c5f]",
    "body paragraph": "bg-[#2b1212] text-[#ffadad] border border-[#472121]",
    conclusion: "bg-[#302512] text-[#ffdca1] border border-[#554118]",
};

const INSIGHTS_MIN_HEIGHT = 140;
const INSIGHTS_MAX_HEIGHT = 460;
const ZWSP = "\u200B";

function normalizeHexColor(value: string): string {
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
        const [, r, g, b] = trimmed;
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return "#35b6ff";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const normalized = normalizeHexColor(hex);
    return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16),
    };
}

function buildPaletteFromHex(border: string) {
    const normalized = normalizeHexColor(border);
    const { r, g, b } = hexToRgb(normalized);
    const text = `rgb(${Math.round(r + (255 - r) * 0.28)}, ${Math.round(g + (255 - g) * 0.28)}, ${Math.round(b + (255 - b) * 0.28)})`;
    return {
        border: normalized,
        soft: `rgba(${r}, ${g}, ${b}, 0.16)`,
        text,
    };
}

function escapeHtml(text: string): string {
    return (text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function wordsFromHtml(html: string): number {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.innerText || "")
        .replace(/\u200B/g, "")
        .split(/\s+/)
        .filter(Boolean).length;
}

function toPlainText(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.innerText || "").replace(/\u200B/g, "").trim();
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function isCaretAtTokenEnd(token: Element, range: Range): boolean {
    try {
        const afterCaret = range.cloneRange();
        afterCaret.selectNodeContents(token);
        afterCaret.setStart(range.startContainer, range.startOffset);
        if (afterCaret.toString().length === 0) return true;
    } catch {
        // fallback below
    }

    const endRange = document.createRange();
    endRange.selectNodeContents(token);
    endRange.collapse(false);
    if (range.startContainer === endRange.startContainer && range.startOffset === endRange.startOffset) return true;
    if (range.startContainer === token && range.startOffset === token.childNodes.length) return true;
    return false;
}

function getCaretOffsetInToken(token: Element, range: Range): number {
    try {
        const beforeCaret = range.cloneRange();
        beforeCaret.selectNodeContents(token);
        beforeCaret.setEnd(range.startContainer, range.startOffset);
        return beforeCaret.toString().length;
    } catch {
        return -1;
    }
}

function getActiveTokenFromRange(range: Range): Element | null {
    const container = range.startContainer;
    const baseElement = container.nodeType === Node.ELEMENT_NODE
        ? container as Element
        : container.parentElement;
    const direct = baseElement?.closest("[data-source-token='1']");
    if (direct) return direct;

    // Safari sometimes reports the caret on the editor element at child boundary.
    if (container.nodeType === Node.ELEMENT_NODE) {
        const el = container as Element;
        const idx = range.startOffset;
        if (idx > 0) {
            const prev = el.childNodes[idx - 1];
            if (prev && prev.nodeType === Node.ELEMENT_NODE && (prev as Element).matches("[data-source-token='1']")) {
                return prev as Element;
            }
        }
    }
    return null;
}

function placeCaretAfterNode(node: Node, selection: Selection): void {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}

function buildSourceTokenHtml(params: {
    quote?: string;
    citation?: string;
    sourceIndex: number;
    border: string;
    soft: string;
    text: string;
}): string {
    const quote = (params.quote || "").trim();
    const citation = (params.citation || "").trim();
    const content = [quote, citation].filter(Boolean).join(" ");
    if (!content) return "";

    return `<span data-source-token="1" data-source-index="${params.sourceIndex}" style="display:inline;background:${params.soft};border:1px solid ${params.border};border-radius:8px;padding:1px 6px;color:${params.text};font-weight:600;box-decoration-break:clone;-webkit-box-decoration-break:clone;line-height:1.6;">${escapeHtml(content)}</span><span data-source-gap="1">${ZWSP}</span>`;
}

function buildInitialSections(org: ReturnType<typeof useOrganizer>): ChamberSection[] {
    const selected = org.selectedOutlines || [];
    const fromSelected = selected.length > 0
        ? selected.map((o) => ({
            id: o.id,
            type: o.type || "Body Paragraph",
            title: o.title || "Untitled Section",
            description: o.description || "",
        }))
        : [];

    if (fromSelected.length > 0) return fromSelected;

    const visible = (org.outlines || [])
        .filter((o) => o.selected && !o.hidden)
        .map((o) => ({
            id: o.id,
            type: o.type || "Body Paragraph",
            title: o.title || "Untitled Section",
            description: o.description || "",
        }));
    if (visible.length > 0) return visible;

    return [{
        id: "manual-introduction",
        type: "Introduction",
        title: "Introduction",
        description: "Start the essay from here.",
    }];
}

function buildSectionMap<T>(sections: ChamberSection[], factory: () => T): Record<string, T> {
    return sections.reduce<Record<string, T>>((acc, section) => {
        acc[section.id] = factory();
        return acc;
    }, {});
}

function MaterialDeleteIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1ZM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7Z" />
        </svg>
    );
}

function MaterialSparkleIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="m12 2 1.8 4.7L18.5 8l-4.7 1.3L12 14l-1.8-4.7L5.5 8l4.7-1.3L12 2Zm7 11 1 2.5L22.5 17 20 18l-1 2.5L18 18l-2.5-1.5L18 15l1-2.5ZM5 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" />
        </svg>
    );
}

function EditIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm17.71-10.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z" />
        </svg>
    );
}

function getStoredCitation(source: SourceData): string {
    return source.citationPreview
        || source.pdfMeta?.citationPreview
        || source.imageMeta?.citationPreview
        || source.fieldworkMeta?.citationPreview
        || "";
}

function parseAuthors(author: string | undefined): Array<{ firstName: string; lastName: string }> {
    return (author || "")
        .split(/;| and |&/i)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
            if (chunk.includes(",")) {
                const [lastName, firstName] = chunk.split(",").map((part) => part.trim());
                return { firstName: firstName || "", lastName: lastName || "" };
            }
            const tokens = chunk.split(/\s+/).filter(Boolean);
            return {
                firstName: tokens.slice(0, -1).join(" "),
                lastName: tokens[tokens.length - 1] || "",
            };
        })
        .filter((authorItem) => authorItem.firstName || authorItem.lastName);
}

function buildAccordionState(sections: ChamberSection[], expandedId: string): Record<string, boolean> {
    const openId = expandedId || sections[0]?.id || "";
    return sections.reduce<Record<string, boolean>>((acc, section) => {
        acc[section.id] = section.id !== openId;
        return acc;
    }, {});
}

export default function WritingChamberView({ onNext }: WritingChamberViewProps) {
    const org = useOrganizer();
    const sourceStyleBadge = (org.citationStyle || "None").trim() || "None";

    const initialSections = useMemo(() => buildInitialSections(org), [org]);

    const [sections, setSections] = useState<ChamberSection[]>(initialSections);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [activeSectionId, setActiveSectionId] = useState<string>(initialSections[0]?.id || "");
    const [sectionHtml, setSectionHtml] = useState<Record<string, string>>(() => buildSectionMap(initialSections, () => ""));

    const [assistantQuestionBySection, setAssistantQuestionBySection] = useState<Record<string, string>>(() => buildSectionMap(initialSections, () => ""));
    const [assistantItemsBySection, setAssistantItemsBySection] = useState<Record<string, AssistantItem[]>>(() => buildSectionMap(initialSections, () => []));
    const [assistantLoadingBySection, setAssistantLoadingBySection] = useState<Record<string, boolean>>({});

    const [sourceModal, setSourceModal] = useState<SourceThread | null>(null);
    const [inTextCitationMap, setInTextCitationMap] = useState<Record<number, string>>({});

    const [isSourcesCollapsed, setIsSourcesCollapsed] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia("(max-width: 767px)").matches;
    });
    const [isMobileViewport, setIsMobileViewport] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia("(max-width: 767px)").matches;
    });

    const [summaryInsights, setSummaryInsights] = useState<SummaryInsights | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [isInsightsOpen, setIsInsightsOpen] = useState(false);
    const [insightsHeight, setInsightsHeight] = useState(220);
    const [isDraggingInsights, setIsDraggingInsights] = useState(false);
    const [isPreparingPreview, setIsPreparingPreview] = useState(false);
    const dragStartRef = useRef<{ y: number; height: number }>({ y: 0, height: 220 });
    const insightsPointerRef = useRef<{ pointerId: number | null; moved: boolean }>({ pointerId: null, moved: false });

    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [isClientMounted, setIsClientMounted] = useState(false);
    const [showAddSectionModal, setShowAddSectionModal] = useState(false);
    const [newSectionTitle, setNewSectionTitle] = useState("");
    const [newSectionType, setNewSectionType] = useState<SectionTypeOption>("Body Paragraph");
    const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
    const [switchMenuSectionId, setSwitchMenuSectionId] = useState<string | null>(null);
    const [swapFlashSectionIds, setSwapFlashSectionIds] = useState<string[]>([]);
    const [sourcePalettes, setSourcePalettes] = useState<Record<number, typeof SOURCE_COLOR_POOL[number]>>({});

    const editorRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const rangeRefs = useRef<Record<string, Range | null>>({});
    const sourceContentRef = useRef<HTMLDivElement>(null);
    const switchMenuRef = useRef<HTMLDivElement>(null);
    const assistantActionLockRef = useRef<Record<string, boolean>>({});
    const summaryLockRef = useRef(false);
    const mobileDefaultsAppliedRef = useRef(false);

    const sourceThreads = useMemo<SourceThread[]>(() => {
        return org.manualSources
            .map((source, index) => ({ ...source, index }))
            .filter((source) => source.url?.trim() || source.fullContent?.trim() || source.title?.trim());
    }, [org.manualSources]);

    useEffect(() => {
        setSourcePalettes((prev) => {
            const next: Record<number, typeof SOURCE_COLOR_POOL[number]> = {};
            sourceThreads.forEach((source) => {
                next[source.index] = prev[source.index] || SOURCE_PICKER_COLORS[source.index % SOURCE_PICKER_COLORS.length];
            });
            return next;
        });
    }, [sourceThreads]);

    useEffect(() => {
        if (!switchMenuSectionId) return;
        const close = (event: MouseEvent) => {
            if (switchMenuRef.current && !switchMenuRef.current.contains(event.target as Node)) {
                setSwitchMenuSectionId(null);
            }
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [switchMenuSectionId]);

    useEffect(() => {
        sections.forEach((section) => {
            const editor = editorRefs.current[section.id];
            if (!editor) return;
            editor.querySelectorAll<HTMLElement>("[data-source-token='1'][data-source-index]").forEach((token) => {
                const sourceIndex = Number(token.dataset.sourceIndex || "-1");
                const palette = sourcePalettes[sourceIndex];
                if (!palette) return;
                token.style.background = palette.soft;
                token.style.borderColor = palette.border;
                token.style.color = palette.text;
            });
        });
    }, [sectionHtml, sections, sourcePalettes]);

    const targetWords = org.wordCount === "Custom" ? 1500 : (org.wordCount || 1000);
    const sectionWordCounts = useMemo(() => {
        return sections.reduce<Record<string, number>>((acc, section) => {
            acc[section.id] = wordsFromHtml(sectionHtml[section.id] || "");
            return acc;
        }, {});
    }, [sectionHtml, sections]);
    const totalWords = useMemo(() => Object.values(sectionWordCounts).reduce((sum, n) => sum + n, 0), [sectionWordCounts]);
    const progressDeg = Math.round(clamp(totalWords / Math.max(1, targetWords), 0, 1) * 360);
    const canContinueToPreview = totalWords >= 200;

    const activeSection = useMemo(() => sections.find((s) => s.id === activeSectionId) || sections[0], [activeSectionId, sections]);

    useEffect(() => {
        setAssistantItemsBySection((prev) => {
            const next = { ...prev };
            for (const section of sections) {
                if (!next[section.id]) next[section.id] = [];
            }
            return next;
        });
        setAssistantQuestionBySection((prev) => {
            const next = { ...prev };
            for (const section of sections) {
                if (typeof next[section.id] !== "string") next[section.id] = "";
            }
            return next;
        });
    }, [sections]);

    useEffect(() => {
        setIsClientMounted(true);
        const target = Math.round(window.innerHeight * 0.25);
        setInsightsHeight(clamp(target, INSIGHTS_MIN_HEIGHT, INSIGHTS_MAX_HEIGHT));

        const media = window.matchMedia("(max-width: 767px)");
        const syncViewport = () => setIsMobileViewport(media.matches);
        syncViewport();
        media.addEventListener("change", syncViewport);
        return () => media.removeEventListener("change", syncViewport);
    }, []);

    useEffect(() => {
        if (!isMobileViewport) {
            mobileDefaultsAppliedRef.current = false;
            return;
        }
        if (mobileDefaultsAppliedRef.current) return;

        mobileDefaultsAppliedRef.current = true;
        setCollapsed(buildAccordionState(sections, activeSectionId || sections[0]?.id || ""));
        setIsSourcesCollapsed(true);
    }, [activeSectionId, isMobileViewport, sections]);

    useEffect(() => {
        if (!isDraggingInsights) return;

        const onMove = (event: PointerEvent) => {
            if (insightsPointerRef.current.pointerId !== null && event.pointerId !== insightsPointerRef.current.pointerId) return;
            const delta = dragStartRef.current.y - event.clientY;
            if (Math.abs(delta) > 3) {
                insightsPointerRef.current.moved = true;
            }
            const next = clamp(dragStartRef.current.height + delta, INSIGHTS_MIN_HEIGHT, INSIGHTS_MAX_HEIGHT);
            setInsightsHeight(next);
        };

        const onUp = (event: PointerEvent) => {
            if (insightsPointerRef.current.pointerId !== null && event.pointerId !== insightsPointerRef.current.pointerId) return;
            const shouldToggle = !insightsPointerRef.current.moved;
            insightsPointerRef.current = { pointerId: null, moved: false };
            setIsDraggingInsights(false);
            if (shouldToggle) {
                setIsInsightsOpen((prev) => !prev);
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
    }, [isDraggingInsights]);

    useEffect(() => {
        let canceled = false;

        const hydrateInTextCitations = async () => {
            if (sourceThreads.length === 0) {
                if (!canceled) setInTextCitationMap({});
                return;
            }

            const citationInput = sourceThreads.map((source) => ({
                url: source.url,
                title: source.title,
                author: source.author,
                publishedYear: source.publishedYear,
                publisher: source.publisher,
                fullContent: source.fullContent,
                status: source.status,
            })) as SourceData[];

            const generated = await InTextCitationService.buildForSources(citationInput, org.citationStyle);
            if (canceled) return;

            const mapped: Record<number, string> = {};
            sourceThreads.forEach((source, orderIndex) => {
                mapped[source.index] = generated[orderIndex]
                    || CitationTemplateService.formatInText(org.citationStyle, source, source.index + 1);
            });
            setInTextCitationMap(mapped);
        };

        hydrateInTextCitations().catch((error) => {
            console.warn("[WritingChamber] Failed to hydrate in-text citations", error);
            if (canceled) return;
            const fallback: Record<number, string> = {};
            sourceThreads.forEach((source) => {
                fallback[source.index] = CitationTemplateService.formatInText(org.citationStyle, source, source.index + 1);
            });
            setInTextCitationMap(fallback);
        });

        return () => {
            canceled = true;
        };
    }, [org.citationStyle, sourceThreads]);

    const syncSectionFromDom = useCallback((sectionId: string) => {
        const editor = editorRefs.current[sectionId];
        if (!editor) return;
        setSectionHtml((prev) => ({ ...prev, [sectionId]: editor.innerHTML || "" }));
    }, []);

    const expandSection = useCallback((sectionId: string) => {
        if (!sectionId) return;
        setCollapsed((prev) => {
            if (!isMobileViewport) {
                if (prev[sectionId] === false) return prev;
                return { ...prev, [sectionId]: false };
            }

            const next = buildAccordionState(sections, sectionId);
            const changed = sections.some((section) => Boolean(prev[section.id]) !== next[section.id]);
            return changed ? next : prev;
        });
    }, [isMobileViewport, sections]);

    const focusSection = useCallback((sectionId: string, options?: { expand?: boolean }) => {
        setActiveSectionId(sectionId);
        if (options?.expand) {
            expandSection(sectionId);
        }
    }, [expandSection]);

    const handleSectionHeaderClick = useCallback((event: React.MouseEvent<HTMLDivElement>, sectionId: string) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, textarea, a, label, [contenteditable='true']")) return;

        if (!isMobileViewport) {
            setActiveSectionId(sectionId);
            return;
        }

        setActiveSectionId(sectionId);
        setCollapsed((prev) => {
            if (prev[sectionId]) {
                return buildAccordionState(sections, sectionId);
            }
            return { ...buildAccordionState(sections, sectionId), [sectionId]: true };
        });
    }, [isMobileViewport, sections]);

    const saveSelection = useCallback((sectionId: string) => {
        const editor = editorRefs.current[sectionId];
        const sel = window.getSelection();
        if (!editor || !sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return;
        rangeRefs.current[sectionId] = range.cloneRange();
    }, []);

    const restoreSelection = useCallback((sectionId: string) => {
        const editor = editorRefs.current[sectionId];
        const sel = window.getSelection();
        const range = rangeRefs.current[sectionId];
        if (!editor || !sel) return;
        sel.removeAllRanges();
        if (range && editor.contains(range.commonAncestorContainer)) {
            sel.addRange(range);
            return;
        }
        const fallbackRange = document.createRange();
        fallbackRange.selectNodeContents(editor);
        fallbackRange.collapse(false);
        sel.addRange(fallbackRange);
        rangeRefs.current[sectionId] = fallbackRange;
    }, []);

    const handleEditorPaste = useCallback((sectionId: string, event: React.ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();

        const plain = (event.clipboardData?.getData("text/plain") || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");

        if (!plain) return;

        const editor = editorRefs.current[sectionId];
        if (!editor) return;

        editor.focus({ preventScroll: true });
        restoreSelection(sectionId);

        const inserted = document.execCommand("insertText", false, plain);
        if (!inserted) {
            const html = escapeHtml(plain).replace(/\n/g, "<br>");
            document.execCommand("insertHTML", false, html);
        }

        syncSectionFromDom(sectionId);
        saveSelection(sectionId);
    }, [restoreSelection, saveSelection, syncSectionFromDom]);

    const handleEditorKeyDown = useCallback((sectionId: string, event: React.KeyboardEvent<HTMLDivElement>) => {
        const isArrowExit = event.key === "ArrowRight";
        const isEnterExit = event.key === "Enter";
        const isSpaceExit = event.key === " " || event.key === "Spacebar" || event.code === "Space";
        if (!isArrowExit && !isSpaceExit && !isEnterExit) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;

        const activeRange = selection.getRangeAt(0);
        const token = getActiveTokenFromRange(activeRange);
        if (!token) return;

        const tokenLength = (token.textContent || "").length;
        const caretOffset = getCaretOffsetInToken(token, activeRange);
        const atTokenEnd = isCaretAtTokenEnd(token, activeRange) || (caretOffset >= tokenLength - 1 && tokenLength > 0);
        if (!atTokenEnd) return;

        event.preventDefault();
        const parent = token.parentNode;
        if (!parent) return;

        if (isSpaceExit) {
            const spacer = document.createTextNode(" ");
            if (token.nextSibling) {
                parent.insertBefore(spacer, token.nextSibling);
            } else {
                parent.appendChild(spacer);
            }
            placeCaretAfterNode(spacer, selection);
            syncSectionFromDom(sectionId);
        } else if (isEnterExit) {
            const br = document.createElement("br");
            if (token.nextSibling) {
                parent.insertBefore(br, token.nextSibling);
            } else {
                parent.appendChild(br);
            }
            const spacer = document.createTextNode("");
            if (br.nextSibling) {
                parent.insertBefore(spacer, br.nextSibling);
            } else {
                parent.appendChild(spacer);
            }
            placeCaretAfterNode(spacer, selection);
            syncSectionFromDom(sectionId);
        } else {
            placeCaretAfterNode(token, selection);
        }

        saveSelection(sectionId);
    }, [saveSelection, syncSectionFromDom]);

    const handleEditorBeforeInput = useCallback((sectionId: string, event: React.FormEvent<HTMLDivElement>) => {
        const native = event.nativeEvent as InputEvent;
        if (!native) return;

        const isInsertSpace = native.inputType === "insertText" && native.data === " ";
        const isInsertEnter = native.inputType === "insertParagraph" || native.inputType === "insertLineBreak";
        if (!isInsertSpace && !isInsertEnter) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
        const activeRange = selection.getRangeAt(0);
        const token = getActiveTokenFromRange(activeRange);
        if (!token) return;
        if (!isCaretAtTokenEnd(token, activeRange)) return;

        native.preventDefault();
        const parent = token.parentNode;
        if (!parent) return;

        if (isInsertSpace) {
            const spacer = document.createTextNode(" ");
            if (token.nextSibling) parent.insertBefore(spacer, token.nextSibling);
            else parent.appendChild(spacer);
            placeCaretAfterNode(spacer, selection);
        } else {
            const br = document.createElement("br");
            if (token.nextSibling) parent.insertBefore(br, token.nextSibling);
            else parent.appendChild(br);
            placeCaretAfterNode(br, selection);
        }

        syncSectionFromDom(sectionId);
        saveSelection(sectionId);
    }, [saveSelection, syncSectionFromDom]);

    const getCitationForSource = useCallback((source: SourceThread): string => {
        return inTextCitationMap[source.index]
            || CitationTemplateService.formatInText(org.citationStyle, source, source.index + 1);
    }, [inTextCitationMap, org.citationStyle]);

    const insertHtmlToActiveSection = useCallback((html: string) => {
        if (!activeSectionId) return;
        const editor = editorRefs.current[activeSectionId];
        if (!editor) return;

        expandSection(activeSectionId);
        editor.focus({ preventScroll: true });
        restoreSelection(activeSectionId);
        document.execCommand("insertHTML", false, html);
        syncSectionFromDom(activeSectionId);
        saveSelection(activeSectionId);
    }, [activeSectionId, expandSection, restoreSelection, saveSelection, syncSectionFromDom]);

    const openSourceModal = useCallback((source: SourceThread) => {
        setSourceModal(source);
    }, []);

    const closeSourceModal = useCallback(() => {
        setSourceModal(null);
    }, []);

    const getSelectedModalText = useCallback(() => {
        const container = sourceContentRef.current;
        const sel = window.getSelection();
        if (!container || !sel || sel.rangeCount === 0) return "";
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return "";
        return sel.toString().trim();
    }, []);

    const insertFromModalSelection = useCallback(() => {
        if (!sourceModal || !activeSectionId) return;
        const palette = sourcePalettes[sourceModal.index] || SOURCE_PICKER_COLORS[sourceModal.index % SOURCE_PICKER_COLORS.length];
        const selected = getSelectedModalText();
        const quote = selected || (sourceModal.fullContent || sourceModal.title || "").slice(0, 260).trim();
        if (!quote) return;

        const citation = getCitationForSource(sourceModal);
        const tokenHtml = buildSourceTokenHtml({
            quote,
            citation,
            sourceIndex: sourceModal.index,
            border: palette.border,
            soft: palette.soft,
            text: palette.text,
        });
        insertHtmlToActiveSection(tokenHtml);
        closeSourceModal();
    }, [activeSectionId, closeSourceModal, getCitationForSource, getSelectedModalText, insertHtmlToActiveSection, sourceModal, sourcePalettes]);

    const quickInsertCitation = useCallback((source: SourceThread) => {
        if (!activeSectionId) return;
        const palette = sourcePalettes[source.index] || SOURCE_PICKER_COLORS[source.index % SOURCE_PICKER_COLORS.length];
        const citation = getCitationForSource(source);
        if (!citation) return;

        const tokenHtml = buildSourceTokenHtml({
            citation,
            sourceIndex: source.index,
            border: palette.border,
            soft: palette.soft,
            text: palette.text,
        });
        insertHtmlToActiveSection(tokenHtml);
    }, [activeSectionId, getCitationForSource, insertHtmlToActiveSection, sourcePalettes]);

    const updateSectionTitle = useCallback((sectionId: string, title: string) => {
        setSections((prev) => prev.map((section) => section.id === sectionId ? { ...section, title } : section));
    }, []);

    const setSectionAssistantLoading = useCallback((sectionId: string, value: boolean) => {
        setAssistantLoadingBySection((prev) => ({ ...prev, [sectionId]: value }));
    }, []);

    const pushAssistantIdeas = useCallback((sectionId: string, ideas: string[]) => {
        const parsed = ideas.map((idea) => idea.trim()).filter(Boolean);
        if (!parsed.length) return;
        setAssistantItemsBySection((prev) => ({
            ...prev,
            [sectionId]: [
                ...(prev[sectionId] || []),
                ...parsed.map((idea) => ({
                    id: `idea-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    type: "idea" as const,
                    text: idea,
                })),
            ],
        }));
    }, []);

    const upsertAssistantAnswer = useCallback((sectionId: string, answer: string) => {
        const clean = answer.trim();
        if (!clean) return;
        setAssistantItemsBySection((prev) => {
            const existing = prev[sectionId] || [];
            const withoutAnswer = existing.filter((item) => item.type !== "answer");
            return {
                ...prev,
                [sectionId]: [
                    { id: `answer-${Date.now()}`, type: "answer", text: clean },
                    ...withoutAnswer,
                ],
            };
        });
    }, []);

    const removeAssistantItem = useCallback((sectionId: string, itemId: string) => {
        setAssistantItemsBySection((prev) => ({
            ...prev,
            [sectionId]: (prev[sectionId] || []).filter((item) => item.id !== itemId),
        }));
    }, []);

    const handleMoreIdeas = useCallback(async (section: ChamberSection) => {
        const sectionId = section.id;
        if (assistantActionLockRef.current[sectionId]) return;
        assistantActionLockRef.current[sectionId] = true;
        setSectionAssistantLoading(sectionId, true);
        try {
            if (!org.isTestMode) {
                await CreditService.ensureSufficientCredits("source", 5);
            }
            const ideas = await SuService.generateMoreIdeas({
                essayTopic: org.essayTopic || org.finalEssayTitle || "Untitled Essay",
                sectionType: section.type,
                sectionTitle: section.title || "Untitled Section",
                currentDraft: toPlainText(sectionHtml[sectionId] || ""),
                citationStyle: org.citationStyle,
            });
            if (!org.isTestMode) {
                await CreditService.deductSourceCredits(5, {
                    idempotencyKey: CreditService.createDeductionKey("manual:more-ideas"),
                });
            }
            pushAssistantIdeas(sectionId, ideas);
            const nextManualMoreIdeasState = Organizer.get();
            Organizer.set({
                manualMoreIdeasCount: nextManualMoreIdeasState.manualMoreIdeasCount + 1,
                manualMoreIdeasBulletCount: nextManualMoreIdeasState.manualMoreIdeasBulletCount + ideas.length,
            });
        } catch (error) {
            console.error("[WritingChamber] More ideas failed", error);
            if (error instanceof CreditDeductionError) {
                setDialog({
                    type: "info",
                    title: "More Ideas Unavailable",
                    message: error.message,
                });
            } else {
                pushAssistantIdeas(sectionId, ["Su could not generate suggestions right now. Try again."]);
            }
        } finally {
            assistantActionLockRef.current[sectionId] = false;
            setSectionAssistantLoading(sectionId, false);
        }
    }, [org.citationStyle, org.essayTopic, org.finalEssayTitle, org.isTestMode, pushAssistantIdeas, sectionHtml, setSectionAssistantLoading]);

    const handleAskQuestion = useCallback(async (section: ChamberSection) => {
        const sectionId = section.id;
        if (assistantActionLockRef.current[sectionId]) return;
        const question = (assistantQuestionBySection[sectionId] || "").trim();
        if (!question) return;

        assistantActionLockRef.current[sectionId] = true;
        setSectionAssistantLoading(sectionId, true);
        try {
            if (!org.isTestMode) {
                await CreditService.ensureSufficientCredits("source", 1);
            }
            const answer = await SuService.askQuestion({
                essayTopic: org.essayTopic || org.finalEssayTitle || "Untitled Essay",
                sectionType: section.type,
                sectionTitle: section.title || "Untitled Section",
                question,
                currentDraft: toPlainText(sectionHtml[sectionId] || ""),
                citationStyle: org.citationStyle,
            });
            if (!org.isTestMode) {
                await CreditService.deductSourceCredits(1, {
                    idempotencyKey: CreditService.createDeductionKey("manual:ask"),
                });
            }
            upsertAssistantAnswer(sectionId, answer);
            const nextManualAskState = Organizer.get();
            Organizer.set({
                manualAskCount: nextManualAskState.manualAskCount + 1,
            });
            setAssistantQuestionBySection((prev) => ({ ...prev, [sectionId]: "" }));
        } catch (error) {
            console.error("[WritingChamber] Ask failed", error);
            if (error instanceof CreditDeductionError) {
                setDialog({
                    type: "info",
                    title: "Ask Unavailable",
                    message: error.message,
                });
            } else {
                upsertAssistantAnswer(sectionId, "Su could not answer right now. Please try again.");
            }
        } finally {
            assistantActionLockRef.current[sectionId] = false;
            setSectionAssistantLoading(sectionId, false);
        }
    }, [assistantQuestionBySection, org.citationStyle, org.essayTopic, org.finalEssayTitle, org.isTestMode, sectionHtml, setSectionAssistantLoading, upsertAssistantAnswer]);

    const openAddSectionModal = useCallback(() => {
        setNewSectionTitle("");
        setNewSectionType("Body Paragraph");
        setShowAddSectionModal(true);
    }, []);

    const swapSectionsById = useCallback((sectionIdA: string, sectionIdB: string) => {
        if (sectionIdA === sectionIdB) return;
        setSections((prev) => {
            const firstIndex = prev.findIndex((section) => section.id === sectionIdA);
            const secondIndex = prev.findIndex((section) => section.id === sectionIdB);
            if (firstIndex < 0 || secondIndex < 0) return prev;
            if (prev[firstIndex].type !== prev[secondIndex].type) return prev;
            const next = [...prev];
            [next[firstIndex], next[secondIndex]] = [next[secondIndex], next[firstIndex]];
            return next;
        });
        setSwapFlashSectionIds([sectionIdA, sectionIdB]);
        setSwitchMenuSectionId(null);
        window.setTimeout(() => setSwapFlashSectionIds([]), 450);
    }, []);

    const createSection = useCallback(() => {
        const finalTitle = newSectionTitle.trim() || `${newSectionType} ${sections.filter((section) => section.type === newSectionType).length + 1}`;
        const newId = `manual-${Date.now()}-${sections.length + 1}`;
        const nextSection: ChamberSection = {
            id: newId,
            type: newSectionType,
            title: finalTitle,
            description: "New writing section",
        };

        let nextSections = sections;
        setSections((prev) => {
            const next = [...prev];
            const sameTypeIndices = next.reduce<number[]>((acc, section, index) => {
                if (section.type === newSectionType) acc.push(index);
                return acc;
            }, []);
            const insertAt = sameTypeIndices.length > 0 ? sameTypeIndices[sameTypeIndices.length - 1] + 1 : next.length;
            next.splice(insertAt, 0, nextSection);
            nextSections = next;
            return next;
        });
        setSectionHtml((prev) => ({ ...prev, [newId]: "" }));
        setCollapsed((prev) => (
            isMobileViewport
                ? buildAccordionState(nextSections, newId)
                : { ...prev, [newId]: false }
        ));
        setAssistantQuestionBySection((prev) => ({ ...prev, [newId]: "" }));
        setAssistantItemsBySection((prev) => ({ ...prev, [newId]: [] }));
        setActiveSectionId(newId);
        setShowAddSectionModal(false);
    }, [isMobileViewport, newSectionTitle, newSectionType, sections]);

    const updateSourcePalette = useCallback((sourceIndex: number, border: string) => {
        setSourcePalettes((prev) => ({ ...prev, [sourceIndex]: buildPaletteFromHex(border) }));
    }, []);

    const deleteSection = useCallback((sectionId: string) => {
        if (sections.length <= 1) return;
        const nextSections = sections.filter((section) => section.id !== sectionId);
        const fallbackSectionId = activeSectionId === sectionId
            ? (nextSections[0]?.id || "")
            : (activeSectionId || nextSections[0]?.id || "");

        setSections(nextSections);

        setSectionHtml((prev) => {
            const next = { ...prev };
            delete next[sectionId];
            return next;
        });
        setCollapsed((prev) => {
            if (isMobileViewport) {
                return nextSections.length > 0 ? buildAccordionState(nextSections, fallbackSectionId) : {};
            }

            const next = { ...prev };
            delete next[sectionId];
            return next;
        });
        setAssistantQuestionBySection((prev) => {
            const next = { ...prev };
            delete next[sectionId];
            return next;
        });
        setAssistantItemsBySection((prev) => {
            const next = { ...prev };
            delete next[sectionId];
            return next;
        });

        if (fallbackSectionId) {
            setActiveSectionId(fallbackSectionId);
        }
    }, [activeSectionId, isMobileViewport, sections]);

    const toggleSectionCollapse = useCallback((sectionId: string) => {
        setCollapsed((prev) => {
            if (!isMobileViewport) {
                return { ...prev, [sectionId]: !prev[sectionId] };
            }

            if (prev[sectionId]) {
                return buildAccordionState(sections, sectionId);
            }

            return { ...buildAccordionState(sections, sectionId), [sectionId]: true };
        });
        setActiveSectionId(sectionId);
    }, [isMobileViewport, sections]);

    const syncAllEditors = useCallback(() => {
        sections.forEach((section) => syncSectionFromDom(section.id));
    }, [sections, syncSectionFromDom]);

    const isSourceReferenced = useCallback((sourceIndex: number) => {
        return sections.some((section) => {
            const html = sectionHtml[section.id] || "";
            return html.includes(`data-source-index="${sourceIndex}"`);
        });
    }, [sectionHtml, sections]);

    const deleteSourceThread = useCallback((source: SourceThread) => {
        if (isSourceReferenced(source.index)) {
            setDialog({
                type: "source-in-use",
                title: "Source In Use",
                message: "This source is already used in the writing area. Remove its highlighted citations first.",
            });
            return;
        }

        Organizer.set({
            manualSources: org.manualSources.map((item, index) => (
                index === source.index ? { url: "", status: "empty" as const } : item
            )),
        });

        setInTextCitationMap((prev) => {
            const next = { ...prev };
            delete next[source.index];
            return next;
        });
        setSourcePalettes((prev) => {
            const next = { ...prev };
            delete next[source.index];
            return next;
        });

        if (sourceModal?.index === source.index) {
            setSourceModal(null);
        }
    }, [isSourceReferenced, org.manualSources, sourceModal]);

    const ensurePreviewCitations = useCallback(async (): Promise<ResolvedCitation[]> => {
        const activeSources = org.manualSources
            .map((source, sourceIndex) => ({ source, sourceIndex }))
            .filter(({ source }) => source.status === "scraped" || Boolean(source.fullContent?.trim()));

        const resolved = await Promise.all(activeSources.map(async ({ source, sourceIndex }) => {
            const existingCitation = getStoredCitation(source).trim();
            if (existingCitation) {
                return { sourceIndex, citation: existingCitation, source };
            }

            try {
                let citation = "";
                if (source.manualSourceType === "fieldwork" && source.fieldworkMeta) {
                    citation = await SpoonieService.generateFieldworkCitation({
                        citationStyle: org.citationStyle,
                        researchType: source.fieldworkMeta.researchType,
                        title: source.fieldworkMeta.title,
                        dateConducted: source.fieldworkMeta.dateConducted,
                        researcherName: source.fieldworkMeta.researcherName,
                        location: source.fieldworkMeta.location,
                        participants: source.fieldworkMeta.participants,
                        methodSummary: source.fieldworkMeta.methodSummary,
                        keyFindings: source.fieldworkMeta.keyFindings,
                        notes: source.fieldworkMeta.notes,
                        customFields: source.fieldworkMeta.customFields,
                    });
                } else {
                    const documentTitle = source.manualSourceType === "pdf"
                        ? (source.pdfMeta?.documentTitle || source.title || "Untitled Source")
                        : source.manualSourceType === "image"
                            ? (source.imageMeta?.citationKind === "journal"
                                ? (source.imageMeta?.citationData.articleTitle || source.title || "Untitled Source")
                                : (source.imageMeta?.citationData.title || source.title || "Untitled Source"))
                            : (source.title || "Untitled Source");

                    const publicationYear = source.manualSourceType === "pdf"
                        ? (source.pdfMeta?.publicationYear || source.publishedYear || "n.d.")
                        : source.manualSourceType === "image"
                            ? (source.imageMeta?.citationData.publicationYear || source.publishedYear || "n.d.")
                            : (source.publishedYear || "n.d.");

                    const authors = source.manualSourceType === "pdf"
                        ? (source.pdfMeta?.authors || []).map((author) => ({ firstName: author.firstName, lastName: author.lastName }))
                        : source.manualSourceType === "image"
                            ? (source.imageMeta?.citationData.contributors || []).map((author) => ({ firstName: author.firstName, lastName: author.lastName }))
                            : parseAuthors(source.author);

                    citation = await SpoonieService.generateCitation({
                        citationStyle: org.citationStyle,
                        documentTitle,
                        publicationYear,
                        authors: authors.length ? authors : [{ firstName: "", lastName: source.author?.trim() || "Unknown" }],
                        journalName: source.manualSourceType === "pdf"
                            ? (source.pdfMeta?.journalName || "")
                            : source.manualSourceType === "image"
                                ? (source.imageMeta?.citationData.journalTitle || "")
                                : "",
                        publisher: source.manualSourceType === "pdf"
                            ? (source.pdfMeta?.publisher || source.publisher || "")
                            : source.manualSourceType === "image"
                                ? (source.imageMeta?.citationData.publisher || source.publisher || "")
                                : (source.publisher || ""),
                        volume: source.manualSourceType === "pdf"
                            ? (source.pdfMeta?.volume || "")
                            : source.manualSourceType === "image"
                                ? (source.imageMeta?.citationData.volume || "")
                                : "",
                        issue: source.manualSourceType === "pdf"
                            ? (source.pdfMeta?.issue || "")
                            : source.manualSourceType === "image"
                                ? (source.imageMeta?.citationData.issue || "")
                                : "",
                        edition: source.manualSourceType === "pdf" ? (source.pdfMeta?.edition || "") : "",
                        pageRange: source.manualSourceType === "pdf"
                            ? `${source.pdfMeta?.startPage || 1}-${source.pdfMeta?.endPage || 1}`
                            : source.manualSourceType === "image"
                                ? (source.imageMeta?.citationData.pageRange || "")
                                : "",
                    });
                }

                return { sourceIndex, citation: citation.trim(), source };
            } catch (error) {
                console.warn("[WritingChamber] Spoonie citation fallback", sourceIndex, error);
                return {
                    sourceIndex,
                    citation: CitationTemplateService.formatReference(org.citationStyle, source, sourceIndex + 1),
                    source,
                };
            }
        }));

        Organizer.set({
            manualSources: org.manualSources.map((source, sourceIndex) => {
                const match = resolved.find((entry) => entry.sourceIndex === sourceIndex);
                if (!match) return source;
                return {
                    ...source,
                    citationPreview: match.citation,
                    pdfMeta: source.pdfMeta ? { ...source.pdfMeta, citationPreview: match.citation } : source.pdfMeta,
                    imageMeta: source.imageMeta ? { ...source.imageMeta, citationPreview: match.citation } : source.imageMeta,
                    fieldworkMeta: source.fieldworkMeta ? { ...source.fieldworkMeta, citationPreview: match.citation } : source.fieldworkMeta,
                };
            }),
        });

        return resolved;
    }, [org.citationStyle, org.manualSources]);

    const continueToPreview = useCallback(async () => {
        if (!canContinueToPreview) return;
        setIsPreparingPreview(true);
        syncAllEditors();

        const essayParts = sections
            .map((section) => toPlainText(sectionHtml[section.id] || ""))
            .filter(Boolean);
        const generatedEssay = essayParts.join("\n\n");

        try {
            const resolvedCitations = await ensurePreviewCitations();
            const bibliographyLines = resolvedCitations
                .map((entry) => entry.citation.trim())
                .filter(Boolean);

            Organizer.set({
                generatedEssay,
                generatedBibliography: bibliographyLines.length > 0
                    ? bibliographyLines.join("\n")
                    : org.generatedBibliography,
            });
            onNext("preview");
        } finally {
            setIsPreparingPreview(false);
        }
    }, [canContinueToPreview, ensurePreviewCitations, onNext, org.generatedBibliography, sectionHtml, sections, syncAllEditors]);

    const handleSummaryClick = useCallback(async () => {
        if (summaryLockRef.current) return;

        if (summaryInsights) {
            setDialog({
                type: "info",
                title: "AI Insights Already Available",
                message: "AI insights တွေ ရှိနေသေးပါတယ်။ အရင် Delete လုပ်ပြီးမှ Summary ကို ပြန် run ပေးပါ။",
            });
            return;
        }

        syncAllEditors();

        const writtenBySection = sections
            .map((section) => ({
                title: section.title,
                body: toPlainText(sectionHtml[section.id] || ""),
            }))
            .filter((entry) => entry.body.trim().length > 0);

        const writtenEssay = writtenBySection.map((entry) => entry.body).join("\n\n");
        if (!writtenEssay.trim()) {
            setIsInsightsOpen(true);
            return;
        }

        setSummaryLoading(true);
        summaryLockRef.current = true;
        try {
            const requiredWordCredits = CreditService.creditsFromWords(CreditService.countWords(writtenEssay));
            if (!org.isTestMode) {
                await CreditService.ensureSufficientCredits("word", requiredWordCredits);
            }
            const summary = await SuService.summarizeProgress({
                essayTitle: org.finalEssayTitle || org.essayTopic || "Untitled Essay",
                outlineTitles: sections.map((section) => section.title.trim()).filter(Boolean),
                writtenEssay,
            });
            if (!org.isTestMode) {
                await CreditService.deduct("word", requiredWordCredits, {
                    idempotencyKey: CreditService.createDeductionKey(`manual:summary:${requiredWordCredits}`),
                });
            }
            setSummaryInsights(summary);
            const nextManualSummaryState = Organizer.get();
            Organizer.set({
                manualSummaryCount: nextManualSummaryState.manualSummaryCount + 1,
            });
            setIsInsightsOpen(true);
        } catch (error) {
            console.error("[WritingChamber] Summary failed", error);
            setDialog({
                type: "info",
                title: error instanceof CreditDeductionError ? "Summary Unavailable" : "Summary Failed",
                message: error instanceof CreditDeductionError
                    ? error.message
                    : "Su summary ကို မရနိုင်သေးပါ။ ခဏနေရင် ပြန်စမ်းပါ။",
            });
        } finally {
            summaryLockRef.current = false;
            setSummaryLoading(false);
        }
    }, [org.essayTopic, org.finalEssayTitle, org.isTestMode, sectionHtml, sections, summaryInsights, syncAllEditors]);

    const requestClearInsights = useCallback(() => {
        setDialog({
            type: "confirm-clear",
            title: "Delete AI Insights?",
            message: "Are you sure you want to delete current AI insights?",
        });
    }, []);

    const confirmDialog = useCallback(() => {
        if (!dialog) return;
        if (dialog.type === "confirm-clear") {
            setSummaryInsights(null);
        }
        setDialog(null);
    }, [dialog]);

    const startInsightsDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        if (!isInsightsOpen) {
            setIsInsightsOpen(true);
        }
        insightsPointerRef.current = { pointerId: event.pointerId, moved: false };
        dragStartRef.current = { y: event.clientY, height: insightsHeight };
        setIsDraggingInsights(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
    }, [insightsHeight, isInsightsOpen]);

    const continueButton = (
        <button
            onClick={continueToPreview}
            disabled={!canContinueToPreview || isPreparingPreview}
            className={`fixed bottom-4 right-4 z-[95] inline-flex items-center gap-3 rounded-full border px-6 py-3.5 text-[14px] font-bold shadow-[0_16px_40px_rgba(0,0,0,0.42)] transition ${canContinueToPreview && !isPreparingPreview ? "border-[#d55a4f] bg-[#b5473f] text-white hover:bg-[#ca544a]" : "cursor-not-allowed border-white/10 bg-[#26282d] text-white/35"} ${mobileStyles.wcContinueBtn} ${isMobileViewport && !isSourcesCollapsed ? mobileStyles.wcContinueBtnHidden : ""}`}
        >
            <span>{isPreparingPreview ? "Preparing Preview" : "Continue to Preview"}</span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${canContinueToPreview && !isPreparingPreview ? "bg-black/15 text-white" : "bg-black/20 text-white/35"}`}>
                {isPreparingPreview ? "…" : "→"}
            </span>
        </button>
    );
    return (
        <div className="relative flex h-full min-h-0 flex-col bg-[#080808]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            <div className={`relative flex h-[68px] items-center justify-between border-b border-white/10 bg-[#0a0a0a] px-5 ${mobileStyles.wcHeader}`}>
                <button
                    onClick={openAddSectionModal}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff5a52] text-[24px] font-medium text-white shadow-[0_4px_12px_rgba(255,90,82,0.4)] transition hover:bg-[#ff736b]"
                    title="Add section"
                >
                    +
                </button>

                <div className={`pointer-events-none absolute left-1/2 top-1/2 flex w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col items-center px-4 ${mobileStyles.wcHeaderTitle}`}>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff5a52]">Writing Chamber</div>
                    <label className="pointer-events-auto mt-0.5 flex min-w-0 w-full max-w-[520px] items-center gap-2 rounded-full border border-white/10 bg-[#111318] px-3 py-1.5 text-white/80 transition hover:border-white/20">
                        <span className="text-[#f0c84a]">
                            <EditIcon />
                        </span>
                        <input
                            value={org.finalEssayTitle || ""}
                            onChange={(event) => Organizer.set({ finalEssayTitle: event.target.value })}
                            placeholder="Untitled Essay"
                            className={`min-w-0 flex-1 bg-transparent text-center text-[15px] font-bold text-[#f4f4f5] outline-none placeholder:text-white/35 ${mobileStyles.wcHeaderTitleInput}`}
                        />
                    </label>
                </div>

                <div className={`ml-auto flex items-center gap-2.5 ${mobileStyles.wcHeaderRight}`}>
                    <button
                        onClick={handleSummaryClick}
                        disabled={summaryLoading}
                        className={`rounded-full border border-[#7b6a2a] bg-[#2c260f] px-4 py-2 text-[12px] font-bold text-[#ffe57d] transition hover:bg-[#3a3112] disabled:opacity-50 ${mobileStyles.wcSummaryButton}`}
                    >
                        {summaryLoading ? "Summarizing..." : "Summary"}
                    </button>

                    <div className="flex items-center gap-2">
                        <div className={`relative h-[60px] w-[60px] ${mobileStyles.wcWordCountCircle}`}>
                            <div
                                className="absolute inset-0 rounded-full opacity-80 animate-[spin_8s_linear_infinite]"
                                style={{
                                    background: "conic-gradient(from 180deg, #ff3d6e, #ff9f1a, #ffe45c, #56ccf2, #9b5cff, #ff3d6e)",
                                }}
                            />
                            <div className="absolute inset-[3px] rounded-full bg-[#0d1117]" />
                            <div
                                className="absolute inset-[3px] rounded-full"
                                style={{
                                    background: `conic-gradient(#ff5b57 0deg ${progressDeg}deg, rgba(255,255,255,0.12) ${progressDeg}deg 360deg)`,
                                    WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 7px), #000 0)",
                                    mask: "radial-gradient(farthest-side, transparent calc(100% - 7px), #000 0)",
                                }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center text-[20px] font-black text-white">{totalWords}</div>
                        </div>
                        <div className={`text-[12px] font-semibold text-white/55 ${mobileStyles.wcWordCountLabel}`}>of {targetWords} words</div>
                    </div>
                </div>
            </div>

            {!canContinueToPreview && (
                <div className={`flex justify-center border-b border-white/10 bg-[#0b0b0c] px-5 py-2 ${mobileStyles.wcWarningBanner}`}>
                    <div className="text-center text-[12px] font-semibold text-[#f1c26f]">
                        Write at least 200 words to continue to Preview.
                    </div>
                </div>
            )}

            <div className={`flex min-h-0 flex-1 ${mobileStyles.wcMainLayout}`}>
              <div className={`contents ${mobileStyles.wcContentRow}`}>
                <div
                    className={`flex min-w-0 flex-1 flex-col border-r border-white/10 bg-[#070707] ${mobileStyles.wcWritingColumn} ${isMobileViewport && !isSourcesCollapsed ? mobileStyles.wcWritingColumnCompact : ""}`}
                    style={isMobileViewport ? { flex: "none", width: isSourcesCollapsed ? "calc(100% - 2.6rem)" : "3.5rem", transition: "width 0.32s cubic-bezier(0.4,0,0.2,1)" } : undefined}
                >
                    <div className={`flex-1 overflow-y-auto px-4 pb-4 pt-3 ${mobileStyles.wcScrollViewport} ${isMobileViewport && !isSourcesCollapsed ? mobileStyles.wcScrollViewportCompact : ""}`}>
                      {isMobileViewport && !isSourcesCollapsed ? (
                        <div className="flex flex-col gap-1">
                            {sections.map((section, index) => {
                                const isActive = section.id === activeSectionId;
                                const typeKey = section.type.toLowerCase();
                                const badgeColor = typeKey === "introduction" ? "#8dc8ff" : typeKey === "conclusion" ? "#ffdca1" : "#ffadad";
                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => {
                                            focusSection(section.id, { expand: true });
                                            setIsSourcesCollapsed(true);
                                        }}
                                        className={`flex h-8 items-center justify-center rounded-lg text-[11px] font-black transition ${isActive ? "bg-[#ff5a52] text-white shadow-[0_0_8px_rgba(255,90,82,0.3)]" : "bg-white/[0.06] text-white/60 hover:bg-white/10"}`}
                                    >
                                        {index + 1}
                                    </button>
                                );
                            })}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                            {sections.map((section, index) => {
                                const isCollapsed = Boolean(collapsed[section.id]);
                                const isActive = section.id === activeSectionId;
                                const typeKey = section.type.toLowerCase();
                                const words = sectionWordCounts[section.id] || 0;
                                const assistantItems = assistantItemsBySection[section.id] || [];
                                const isLoadingAssistant = Boolean(assistantLoadingBySection[section.id]);

                                return (
                                    <div
                                        key={section.id}
                                        draggable={!isMobileViewport}
                                        onDragStart={() => setDraggedSectionId(section.id)}
                                        onDragEnd={() => setDraggedSectionId(null)}
                                        onDragOver={(event) => {
                                            if (isMobileViewport) return;
                                            if (draggedSectionId && draggedSectionId !== section.id) {
                                                const draggedSection = sections.find((item) => item.id === draggedSectionId);
                                                if (draggedSection?.type === section.type) event.preventDefault();
                                            }
                                        }}
                                        onDrop={() => {
                                            if (isMobileViewport) return;
                                            if (!draggedSectionId || draggedSectionId === section.id) return;
                                            swapSectionsById(draggedSectionId, section.id);
                                            setDraggedSectionId(null);
                                        }}
                                        className={`overflow-hidden rounded-2xl border transition-all duration-300 ${isActive ? "border-[#ff5a52] shadow-[inset_0_0_0_1px_rgba(255,90,82,0.35)]" : "border-white/15"} ${swapFlashSectionIds.includes(section.id) ? "scale-[1.01] ring-1 ring-[#ff8f89]/60" : ""} ${mobileStyles.wcSectionCard}`}
                                        data-collapsed={isCollapsed ? "true" : "false"}
                                    >
                                        <div
                                            className={`flex items-center gap-3 border-b border-white/10 bg-[#0a0a0a] px-4 py-2.5 ${mobileStyles.wcSectionHeader}`}
                                            onClick={(event) => handleSectionHeaderClick(event, section.id)}
                                        >
                                            <button
                                                type="button"
                                                className={`cursor-grab rounded-full p-1 text-[21px] font-black leading-none text-white/45 transition hover:bg-white/5 hover:text-white/70 ${mobileStyles.wcSectionDragHandle}`}
                                                title="Drag card to reorder within the same paragraph type"
                                            >
                                                ≡
                                            </button>
                                            <span className={`px-1 text-[16px] font-black text-white ${mobileStyles.wcSectionIndex}`}>{index + 1}</span>

                                            <span className={`rounded-full px-3.5 py-1 text-[9px] font-black uppercase tracking-wider ${TYPE_BADGE[typeKey] || "border border-[#4f3517] bg-[#33230f] text-[#f4c37a]"} ${mobileStyles.wcSectionBadge}`}>
                                                {section.type}
                                            </span>

                                            <input
                                                value={section.title}
                                                onFocus={() => focusSection(section.id, { expand: isMobileViewport })}
                                                onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                                                placeholder="Section title"
                                                className={`h-8 min-w-0 max-w-[860px] flex-1 rounded-full border border-white/15 bg-[#111217] px-3 text-[13px] font-semibold text-[#f8fafc] outline-none transition focus:border-white/35 ${mobileStyles.wcSectionTitleInput}`}
                                            />

                                            <div className={`flex items-center gap-1 rounded-full border border-[#695d1c] bg-[#282109] px-2.5 py-1 text-[#ffe35a] ${mobileStyles.wcSectionSparkle}`}>
                                                <EditIcon />
                                                <MaterialSparkleIcon />
                                            </div>

                                            <button
                                                onClick={() => handleMoreIdeas(section)}
                                                disabled={isLoadingAssistant}
                                                className={`rounded-full bg-[#332e10] px-4 py-1.5 text-[11px] font-bold text-[#ffe35a] disabled:opacity-45 ${mobileStyles.wcSectionMoreIdeas}`}
                                            >
                                                {isLoadingAssistant ? "Thinking..." : "More ideas"}
                                            </button>

                                            <div className={`ml-auto flex items-center gap-2.5 ${mobileStyles.wcSectionActions}`}>
                                                <button
                                                    onClick={() => deleteSection(section.id)}
                                                        className={`mr-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#ff5a52] text-white hover:bg-[#ff736b] ${mobileStyles.wcSectionDeleteBtn}`}
                                                    title={sections.length <= 1 ? "At least one section is required" : "Delete section"}
                                                    disabled={sections.length <= 1}
                                                >
                                                    <MaterialDeleteIcon />
                                                </button>

                                                <div className="relative" ref={switchMenuSectionId === section.id ? switchMenuRef : undefined}>
                                                    <button
                                                        onClick={() => setSwitchMenuSectionId((prev) => prev === section.id ? null : section.id)}
                                                        className={`flex h-8 w-8 items-center justify-center rounded-full bg-[#151922] text-white/75 hover:bg-[#242832] ${mobileStyles.wcSectionSwitchBtn}`}
                                                        title="Switch with another section of the same type"
                                                    >
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="m8 7 4-4 4 4" />
                                                            <path d="M12 3v13" />
                                                            <path d="m16 17-4 4-4-4" />
                                                            <path d="M12 21V8" />
                                                        </svg>
                                                    </button>
                                                    {switchMenuSectionId === section.id && (
                                                        <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[130px] rounded-xl border border-white/10 bg-[#0f1319] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                                                            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">Switch to:</div>
                                                            {sections
                                                                .filter((candidate) => candidate.type === section.type && candidate.id !== section.id)
                                                                .map((candidate) => {
                                                                    const candidateIndex = sections.findIndex((item) => item.id === candidate.id);
                                                                    return (
                                                                        <button
                                                                            key={candidate.id}
                                                                            onClick={() => swapSectionsById(section.id, candidate.id)}
                                                                            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-white/80 transition hover:bg-white/[0.06]"
                                                                        >
                                                                            {candidateIndex + 1}
                                                                        </button>
                                                                    );
                                                                })}
                                                        </div>
                                                    )}
                                                </div>

                                                <span className={`min-w-[70px] text-right text-[12px] font-semibold text-white/55 ${mobileStyles.wcSectionWordCount}`}>{words} words</span>

                                                <button
                                                    onClick={() => toggleSectionCollapse(section.id)}
                                                    className={`flex h-7 w-7 items-center justify-center rounded-full bg-[#1a1d23] text-[12px] text-white/80 hover:bg-[#242832] ${mobileStyles.wcSectionCollapseBtn}`}
                                                >
                                                    {isCollapsed ? "⌄" : "⌃"}
                                                </button>
                                            </div>
                                        </div>

                                        <div
                                            className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
                                            style={{
                                                maxHeight: isCollapsed ? 0 : 900,
                                                opacity: isCollapsed ? 0 : 1,
                                            }}
                                        >
                                            <div className={`grid min-h-[360px] grid-cols-[280px_minmax(0,1fr)] ${mobileStyles.wcEditorGrid}`}>
                                                <div className={`rounded-bl-2xl border-r border-white/10 bg-[#0a0a0a] p-4 ${mobileStyles.wcAssistantSidebar}`}>
                                                    <div className="mb-2 text-[11px] font-semibold tracking-wide text-[#ffe35a]">AI Writing Assistant</div>
                                                    <div className="mb-2.5 flex items-center gap-2">
                                                        <input
                                                            placeholder="Ask a question"
                                                            value={assistantQuestionBySection[section.id] || ""}
                                                            onChange={(e) => setAssistantQuestionBySection((prev) => ({ ...prev, [section.id]: e.target.value }))}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") {
                                                                    e.preventDefault();
                                                                    handleAskQuestion(section);
                                                                }
                                                            }}
                                                            className="h-9 min-w-0 flex-1 rounded-full border border-[#5b5220] bg-[#121317] px-3.5 text-[12px] font-medium text-white/80 placeholder-white/35 outline-none focus:border-[#ffe35a]/60"
                                                        />
                                                        <button
                                                            onClick={() => handleAskQuestion(section)}
                                                            disabled={isLoadingAssistant}
                                                            className="h-9 min-w-[60px] flex-shrink-0 rounded-full border border-[#6e6321] bg-[#2f2a0a] px-3.5 text-[12px] font-bold text-[#f5db6d] hover:bg-[#3a340d] disabled:opacity-45"
                                                        >
                                                            Ask
                                                        </button>
                                                    </div>
                                                    <div className="mt-2 h-px w-full bg-white/10" />

                                                    <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1">
                                                        {assistantItems.length === 0 && !isLoadingAssistant && (
                                                            <div className="text-center text-[14px] font-medium text-white/20">No suggestions yet</div>
                                                        )}

                                                        {isLoadingAssistant && (
                                                            <div className="rounded-xl border border-white/10 bg-[#101216] px-3 py-2 text-[12px] text-white/70">
                                                                Su is thinking...
                                                            </div>
                                                        )}

                                                        {assistantItems.map((item) => (
                                                            <div
                                                                key={item.id}
                                                                className={`group flex items-start gap-2 rounded-xl border px-2.5 py-2 ${item.type === "answer" ? "border-[#3563ff66] bg-[#14203d66]" : "border-white/10 bg-[#101216]"}`}
                                                            >
                                                                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${item.type === "answer" ? "bg-[#89a8ff]" : "bg-[#ffe35a]"}`} />
                                                                <p className="flex-1 text-[12px] leading-[1.45] text-white/85">
                                                                    {item.type === "answer" ? `Answer: ${item.text}` : item.text}
                                                                </p>
                                                                <button
                                                                    onClick={() => removeAssistantItem(section.id, item.id)}
                                                                    className="rounded-full px-1.5 py-0.5 text-[12px] font-bold text-white/45 transition hover:bg-white/10 hover:text-white/85"
                                                                    title="Delete"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className={`rounded-br-2xl bg-[#090909] p-4 ${mobileStyles.wcWritingArea}`}>
                                                    <div className="mb-2 text-[12px] font-semibold text-[#b3b8c2]">Writing Area</div>
                                                    <div
                                                        className={`relative rounded-xl border ${isActive ? "border-white/35 bg-[#35393f]" : "border-white/15 bg-[#32353a]"}`}
                                                        onClick={() => focusSection(section.id, { expand: isMobileViewport })}
                                                    >
                                                        <div
                                                            ref={(el) => {
                                                                editorRefs.current[section.id] = el;
                                                                if (el && el.dataset.hydrated !== "1") {
                                                                    el.innerHTML = sectionHtml[section.id] || "";
                                                                    el.dataset.hydrated = "1";
                                                                }
                                                            }}
                                                            contentEditable
                                                            suppressContentEditableWarning
                                                            onFocus={() => {
                                                                focusSection(section.id, { expand: isMobileViewport });
                                                                saveSelection(section.id);
                                                            }}
                                                            onInput={() => syncSectionFromDom(section.id)}
                                                            onBeforeInput={(e) => handleEditorBeforeInput(section.id, e)}
                                                            onKeyUp={() => saveSelection(section.id)}
                                                            onKeyDown={(e) => handleEditorKeyDown(section.id, e)}
                                                            onMouseUp={() => saveSelection(section.id)}
                                                            onPaste={(e) => handleEditorPaste(section.id, e)}
                                                            className="min-h-[260px] p-4 text-[12px] leading-[1.55] text-[#eef1f6] outline-none"
                                                        />
                                                        {!toPlainText(sectionHtml[section.id] || "") && (
                                                            <div className="pointer-events-none absolute left-4 top-4 text-[12px] font-medium text-white/35">
                                                                Start writing your {section.type.toLowerCase()} here...
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                      )}
                    </div>

                    {!isMobileViewport && (
                    <div className={`border-t border-white/10 bg-[#090909] ${mobileStyles.wcInsightsBar}`}>
                        <div className="relative h-12">
                            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
                            <button
                                onPointerDown={startInsightsDrag}
                                style={{ touchAction: "none" }}
                                className={`group absolute left-1/2 top-1/2 z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#121317] shadow-[0_8px_18px_rgba(0,0,0,0.35)] transition hover:bg-[#1a1d24] ${mobileStyles.wcInsightsToggle}`}
                                title="Drag or click"
                            >
                                <span className="pointer-events-none flex items-center justify-center text-white">
                                    <svg
                                        viewBox="0 0 48 48"
                                        className={`h-6 w-6 transition-transform duration-200 ${isInsightsOpen ? "rotate-180" : ""}`}
                                        fill="none"
                                        aria-hidden="true"
                                    >
                                        <path d="M8 31 L24 17 L40 31" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M8 43 L24 29 L40 43" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                            </button>
                        </div>

                        <div
                            className={`overflow-hidden transition-[height] ease-in-out ${isDraggingInsights ? "duration-0" : "duration-300"} ${mobileStyles.wcInsightsPanel}`}
                            style={{ height: isInsightsOpen ? insightsHeight : 0 }}
                        >
                            <div className="h-full border-t border-white/10 px-4 py-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="text-[12px] font-semibold text-white/70">AI Insights (Su)</div>
                                    <button
                                        onClick={requestClearInsights}
                                        className="flex items-center gap-1 rounded-full border border-white/15 bg-[#11151c] px-3 py-1 text-[11px] font-semibold text-white/75 transition hover:bg-[#1b212b]"
                                    >
                                        <MaterialDeleteIcon />
                                        <span>Delete</span>
                                    </button>
                                </div>

                                <div className="-mt-1 mb-4 text-center text-[13px] font-black uppercase tracking-[0.34em] text-[#ff5a52]">SUMMARY</div>

                                {!summaryInsights && !summaryLoading && (
                                    <div className="flex h-[calc(100%-30px)] items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#0d1117] px-4 text-center text-[13px] text-white/45">
                                        Ai insights? Su returned Nothing .... To get AI insights, summarize your essay at the top.
                                    </div>
                                )}

                                {summaryLoading && (
                                    <div className="flex h-[calc(100%-30px)] items-center justify-center rounded-xl border border-white/15 bg-[#0d1117] text-[13px] text-white/70">
                                        Su is summarizing your writing progress...
                                    </div>
                                )}

                                {summaryInsights && !summaryLoading && (
                                        <div className={`grid h-[calc(100%-30px)] grid-cols-2 gap-3 ${mobileStyles.wcInsightsGrid}`}>
                                        <div className="overflow-y-auto rounded-xl border border-[#2b4f88] bg-[#0f182a] p-3">
                                            <div className="mb-2 text-[12px] font-bold text-[#9bc9ff]">What is done</div>
                                            <div className="space-y-2">
                                                {summaryInsights.done.length === 0 && (
                                                    <div className="text-[12px] text-white/55">No completed points detected yet.</div>
                                                )}
                                                {summaryInsights.done.map((item, idx) => (
                                                    <div key={`done-${idx}`} className="flex gap-2 rounded-lg border border-white/10 bg-[#121e34] px-2.5 py-2 text-[12px] text-white/85">
                                                        <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[#7ec3ff]" />
                                                        <span>{item}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="overflow-y-auto rounded-xl border border-[#5a4d1e] bg-[#201b0e] p-3">
                                            <div className="mb-2 text-[12px] font-bold text-[#ffe47e]">Suggestions</div>
                                            <div className="space-y-2">
                                                {summaryInsights.suggestions.length === 0 && (
                                                    <div className="text-[12px] text-white/55">No new suggestions yet.</div>
                                                )}
                                                {summaryInsights.suggestions.map((item, idx) => (
                                                    <div key={`sug-${idx}`} className="flex gap-2 rounded-lg border border-white/10 bg-[#2b250f] px-2.5 py-2 text-[12px] text-white/85">
                                                        <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[#ffe35a]" />
                                                        <span>{item}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    )}

                    {!isMobileViewport && (
                    <div className={`flex h-[50px] items-center border-t border-white/10 bg-[#0a0a0a] px-4 text-[13px] text-white/65 ${mobileStyles.wcSectionCountBar}`}>
                        {sections.length} sections
                    </div>
                    )}
                </div>

                <div
                    className={`relative flex flex-col border-l border-white/10 bg-[#070707] transition-[width] duration-300 ease-in-out ${isSourcesCollapsed ? "w-[56px]" : "w-[320px]"} ${mobileStyles.wcSourcesPanel} ${isSourcesCollapsed ? "" : mobileStyles.wcSourcesPanelOpen}`}
                    style={isMobileViewport ? { flex: "none", width: isSourcesCollapsed ? "2.6rem" : "calc(100% - 3.5rem)", transition: "width 0.32s cubic-bezier(0.4,0,0.2,1)" } : undefined}
                >
                    <button
                        type="button"
                        onClick={() => setIsSourcesCollapsed((prev) => !prev)}
                        className={`absolute -left-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/20 bg-[#131820] px-2.5 py-1.5 text-[11px] font-black text-white/90 shadow-[0_8px_18px_rgba(0,0,0,0.35)] ${mobileStyles.wcSourcesToggleBtn}`}
                        title={isSourcesCollapsed ? "Expand sources panel" : "Collapse sources panel"}
                        data-open={!isSourcesCollapsed ? "true" : "false"}
                    >
                        {isMobileViewport ? null : (isSourcesCollapsed ? "◀" : "▶")}
                    </button>

                    {isSourcesCollapsed ? (
                        <div className={`flex h-full items-center justify-center ${mobileStyles.wcSourcesPanelCollapsed}`}>
                            {isMobileViewport ? (
                                <>
                                    <div className="flex shrink-0 flex-col items-center gap-1.5 pt-2 pb-1">
                                        {sourceThreads.map((source) => {
                                            const p = sourcePalettes[source.index] || SOURCE_PICKER_COLORS[source.index % SOURCE_PICKER_COLORS.length];
                                            return (
                                                <div
                                                    key={source.index}
                                                    className="flex h-[1.25rem] w-[1.25rem] shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                                                    style={{ backgroundColor: p.border }}
                                                >
                                                    {source.index + 1}
                                                </div>
                                            );
                                        })}
                                        {sourceThreads.length === 0 && (
                                            <span className="text-[8px] font-medium text-white/40">0</span>
                                        )}
                                    </div>
                                    <span className="-rotate-180 mt-1 text-[8px] font-semibold tracking-[0.14em] text-white/35 [writing-mode:vertical-rl]">SOURCES</span>
                                </>
                            ) : (
                                <span className="-rotate-180 text-[11px] font-semibold tracking-[0.16em] text-white/60 [writing-mode:vertical-rl]">SOURCES</span>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
                                <h3 className="text-[20px] font-bold text-white">Sources</h3>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full border border-white/20 bg-[#11151d] px-3 py-1 text-[10px] font-bold text-[#9bc9ff]">{sourceStyleBadge}</span>
                                    {isMobileViewport && (
                                        <button
                                            type="button"
                                            onClick={() => setIsSourcesCollapsed(true)}
                                            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-[#181d27] text-[15px] font-bold text-white/80 transition hover:bg-[#252c38]"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={`flex-1 overflow-y-auto p-2.5 ${mobileStyles.wcSourcesContent}`}>
                                <div className="flex flex-col gap-2.5">
                                    {sourceThreads.map((source) => {
                                        const palette = sourcePalettes[source.index] || SOURCE_PICKER_COLORS[source.index % SOURCE_PICKER_COLORS.length];
                                        const citation = getCitationForSource(source);
                                        const snippet = (source.fullContent || "").replace(/\s+/g, " ").slice(0, 110);

                                        return (
                                            <div
                                                key={`${source.index}-${source.url}`}
                                                className={`cursor-pointer rounded-xl border p-2.5 transition hover:bg-[#121212] ${mobileStyles.wcSourceCard}`}
                                                style={{ borderColor: `${palette.border}66`, backgroundColor: palette.soft }}
                                                onClick={() => openSourceModal(source)}
                                            >
                                                <div className="mb-2 flex items-start gap-2">
                                                    <label
                                                        className="relative flex h-4 w-4 shrink-0 cursor-pointer overflow-hidden rounded-full border border-white/30"
                                                        style={{ backgroundColor: palette.border }}
                                                        title="Change source highlight color"
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        <input
                                                            type="color"
                                                            value={palette.border}
                                                            onChange={(event) => updateSourcePalette(source.index, event.target.value)}
                                                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                        />
                                                    </label>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="truncate text-[15px] font-bold text-white">{source.title || "Untitled Source"}</h4>
                                                        <p className="mt-1 text-[12px] text-white/70">
                                                            {source.author || "Unknown author"} ({source.publishedYear || "n.d."})
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            deleteSourceThread(source);
                                                        }}
                                                        disabled={isSourceReferenced(source.index)}
                                                        title={isSourceReferenced(source.index) ? "This source is used in the writing area" : "Delete source"}
                                                        className={`flex h-6 w-6 items-center justify-center rounded-full border text-[14px] font-bold transition ${isSourceReferenced(source.index) ? "cursor-not-allowed border-white/10 bg-white/5 text-white/25" : "border-white/15 bg-[#101418] text-white/75 hover:bg-[#1b2028] hover:text-white"}`}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                                {snippet && <p className="mt-2 line-clamp-2 text-[11px] text-white/45">{snippet}</p>}

                                                <div className="mt-2.5 flex items-center justify-between rounded-full border border-white/10 bg-[#101418] px-3 py-1.5">
                                                    <span className="text-[13px] font-semibold" style={{ color: palette.text }}>
                                                        {citation || "No in-text citation"}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            quickInsertCitation(source);
                                                        }}
                                                        className="text-[11px] font-bold text-white/80 hover:text-white"
                                                    >
                                                        Insert
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {sourceThreads.length === 0 && (
                                        <div className="rounded-xl border border-white/10 bg-[#121212] p-3 text-[14px] text-white/45">
                                            No sources found. Add sources in Configuration step.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
              </div>

              {isMobileViewport && (
                <div className={`border-t border-white/10 bg-[#090909] ${mobileStyles.wcInsightsBar}`}>
                    <div className="relative h-12">
                        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
                        <button
                            onPointerDown={startInsightsDrag}
                            style={{ touchAction: "none" }}
                            className={`group absolute left-1/2 top-1/2 z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#121317] shadow-[0_8px_18px_rgba(0,0,0,0.35)] transition hover:bg-[#1a1d24] ${mobileStyles.wcInsightsToggle}`}
                            title="Drag or click"
                        >
                            <span className="pointer-events-none flex items-center justify-center text-white">
                                <svg
                                    viewBox="0 0 48 48"
                                    className={`h-6 w-6 transition-transform duration-200 ${isInsightsOpen ? "rotate-180" : ""}`}
                                    fill="none"
                                    aria-hidden="true"
                                >
                                    <path d="M8 31 L24 17 L40 31" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M8 43 L24 29 L40 43" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                        </button>
                    </div>

                    <div
                        className={`overflow-hidden transition-[height] ease-in-out ${isDraggingInsights ? "duration-0" : "duration-300"} ${mobileStyles.wcInsightsPanel}`}
                        style={{ height: isInsightsOpen ? insightsHeight : 0 }}
                    >
                        <div className="h-full border-t border-white/10 px-4 py-3">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="text-[12px] font-semibold text-white/70">AI Insights (Su)</div>
                                <button
                                    onClick={requestClearInsights}
                                    className="flex items-center gap-1 rounded-full border border-white/15 bg-[#11151c] px-3 py-1 text-[11px] font-semibold text-white/75 transition hover:bg-[#1b212b]"
                                >
                                    <MaterialDeleteIcon />
                                    <span>Delete</span>
                                </button>
                            </div>

                            <div className="-mt-1 mb-4 text-center text-[13px] font-black uppercase tracking-[0.34em] text-[#ff5a52]">SUMMARY</div>

                            {!summaryInsights && !summaryLoading && (
                                <div className="flex h-[calc(100%-30px)] items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#0d1117] px-4 text-center text-[13px] text-white/45">
                                    Ai insights? Su returned Nothing .... To get AI insights, summarize your essay at the top.
                                </div>
                            )}

                            {summaryLoading && (
                                <div className="flex h-[calc(100%-30px)] items-center justify-center rounded-xl border border-white/15 bg-[#0d1117] text-[13px] text-white/70">
                                    Su is summarizing your writing progress...
                                </div>
                            )}

                            {summaryInsights && !summaryLoading && (
                                <div className={`grid h-[calc(100%-30px)] grid-cols-2 gap-3 ${mobileStyles.wcInsightsGrid}`}>
                                    <div className="overflow-y-auto rounded-xl border border-[#2b4f88] bg-[#0f182a] p-3">
                                        <div className="mb-2 text-[12px] font-bold text-[#9bc9ff]">What is done</div>
                                        <div className="space-y-2">
                                            {summaryInsights.done.length === 0 && (
                                                <div className="text-[12px] text-white/55">No completed points detected yet.</div>
                                            )}
                                            {summaryInsights.done.map((item, idx) => (
                                                <div key={`done-${idx}`} className="flex gap-2 rounded-lg border border-white/10 bg-[#121e34] px-2.5 py-2 text-[12px] text-white/85">
                                                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[#7ec3ff]" />
                                                    <span>{item}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="overflow-y-auto rounded-xl border border-[#5a4d1e] bg-[#201b0e] p-3">
                                        <div className="mb-2 text-[12px] font-bold text-[#ffe47e]">Suggestions</div>
                                        <div className="space-y-2">
                                            {summaryInsights.suggestions.length === 0 && (
                                                <div className="text-[12px] text-white/55">No new suggestions yet.</div>
                                            )}
                                            {summaryInsights.suggestions.map((item, idx) => (
                                                <div key={`sug-${idx}`} className="flex gap-2 rounded-lg border border-white/10 bg-[#2b250f] px-2.5 py-2 text-[12px] text-white/85">
                                                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-[#ffe35a]" />
                                                    <span>{item}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
              )}

              {isMobileViewport && (
                <div className={`flex h-[50px] items-center border-t border-white/10 bg-[#0a0a0a] px-4 text-[13px] text-white/65 ${mobileStyles.wcSectionCountBar}`}>
                    {sections.length} sections
                </div>
              )}
            </div>

            {isClientMounted && (isMobileViewport ? continueButton : createPortal(continueButton, document.body))}

            {sourceModal && (
                <div className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm ${mobileStyles.wcSourceModalOverlay}`}>
                    <div className={`flex h-[78vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#090909] ${mobileStyles.wcSourceModal}`}>
                        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
                            <div className="min-w-0">
                                <h3 className="text-[24px] font-bold uppercase text-white">{sourceModal.title || "Untitled Source"}</h3>
                                <p className="mt-1 text-[14px] text-white/70">
                                    {sourceModal.author || "Unknown"} ({sourceModal.publishedYear || "n.d."})
                                </p>
                                {sourceModal.url && (
                                    <a
                                        href={sourceModal.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-1 block truncate text-[14px] text-[#62b3ff] underline"
                                    >
                                        {sourceModal.url}
                                    </a>
                                )}
                            </div>
                            <button
                                onClick={closeSourceModal}
                                className="ml-4 rounded-full bg-white/15 px-3 py-1.5 text-[20px] font-bold text-white"
                            >
                                ×
                            </button>
                        </div>

                        <div className="border-b border-white/10 px-5 py-2.5 text-[20px] font-semibold text-[#ffe35a]">
                            Highlight to Add to Paragraph
                        </div>

                        <div className="flex items-center justify-between border-b border-white/10 bg-[#11151d] px-5 py-2">
                            <span className="text-[13px] text-white/60">In-text citation template</span>
                            <span className="rounded-full bg-[#122031] px-3 py-1 text-[13px] font-semibold text-[#7dd3fc]">
                                {getCitationForSource(sourceModal) || "N/A"}
                            </span>
                        </div>

                        <div
                            ref={sourceContentRef}
                            className="flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-[1.55] text-[#dbeafe] selection:bg-[#4f82ff]/60"
                        >
                            {sourceModal.fullContent || "No full content available for this source."}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
                            <div className="text-[14px] text-white/55">
                                Active section: <span className="text-white/85">{activeSection?.title || "None"}</span>
                            </div>
                            <button
                                onClick={insertFromModalSelection}
                                disabled={!activeSection?.id}
                                className={`rounded-xl px-5 py-2 text-[14px] font-semibold ${activeSection?.id ? "bg-[#cfd5df] text-[#1a2433] hover:bg-white" : "cursor-not-allowed bg-white/15 text-white/40"}`}
                            >
                                Insert with Citation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddSectionModal && (
                <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
                    <div className={`w-full max-w-[460px] rounded-2xl border border-white/15 bg-[#0f1218] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${mobileStyles.wcAddSectionModal}`}>
                        <div className="text-[20px] font-bold text-white">Add Paragraph</div>
                        <div className="mt-2 text-[14px] text-white/60">Create a new paragraph box and place it within the matching type group.</div>

                        <div className="mt-5 space-y-4">
                            <label className="block">
                                <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/50">Title</div>
                                <input
                                    value={newSectionTitle}
                                    onChange={(event) => setNewSectionTitle(event.target.value)}
                                    placeholder="Enter paragraph title"
                                    className="h-11 w-full rounded-xl border border-white/15 bg-[#12161d] px-3 text-[14px] font-semibold text-white outline-none focus:border-white/30"
                                />
                            </label>

                            <label className="block">
                                <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/50">Type</div>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["Introduction", "Body Paragraph", "Conclusion"] as SectionTypeOption[]).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setNewSectionType(option)}
                                            className={`rounded-xl px-3 py-2 text-[12px] font-bold transition ${newSectionType === option ? "bg-[#ff5a52] text-white" : "border border-white/15 bg-[#12161d] text-white/70 hover:bg-[#1a1f28]"}`}
                                        >
                                            {option === "Body Paragraph" ? "Body" : option}
                                        </button>
                                    ))}
                                </div>
                            </label>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => setShowAddSectionModal(false)}
                                className="rounded-lg border border-white/15 bg-[#181c24] px-4 py-2 text-[13px] font-semibold text-white/80 hover:bg-[#212633]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createSection}
                                className="rounded-lg bg-[#b3473f] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#cc544a]"
                            >
                                Add Section
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {dialog && (
                <div className={`fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 ${mobileStyles.wcDialogOverlay}`}>
                    {dialog.type === "source-in-use" ? (
                        <div className="w-full max-w-[460px] rounded-[28px] border border-[#6c4b20] bg-[radial-gradient(circle_at_top,rgba(120,82,22,0.22),rgba(11,14,20,0.98)_58%)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#8d6329] bg-[#2b1f0b] text-[#ffd36d] shadow-[0_10px_26px_rgba(0,0,0,0.35)]">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 9v4" />
                                    <path d="M12 17h.01" />
                                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                                </svg>
                            </div>
                            <div className="mt-4 text-center text-[21px] font-bold text-white">{dialog.title}</div>
                            <div className="mt-2 text-center text-[14px] leading-6 text-white/70">{dialog.message}</div>
                            <div className="mt-5 rounded-2xl border border-[#5e4724] bg-[#17120c] px-4 py-3 text-[12px] text-[#f1cf88]">
                                Delete ကိုလုပ်မယ်ဆိုရင် paragraph box ထဲက source highlight / citation token ကိုအရင်ဖျက်ရမယ်။
                            </div>
                            <div className="mt-6 flex justify-center">
                                <button
                                    onClick={() => setDialog(null)}
                                    className="rounded-full border border-[#8b6227] bg-[#3a2910] px-6 py-2.5 text-[13px] font-bold text-[#ffe08b] transition hover:bg-[#4a3414]"
                                >
                                    Got it
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full max-w-[440px] rounded-2xl border border-white/15 bg-[#0f1218] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                            <div className="text-[18px] font-bold text-white">{dialog.title}</div>
                            <div className="mt-2 text-[14px] text-white/70">{dialog.message}</div>

                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    onClick={() => setDialog(null)}
                                    className="rounded-lg border border-white/15 bg-[#181c24] px-4 py-2 text-[13px] font-semibold text-white/80 hover:bg-[#212633]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDialog}
                                    className="rounded-lg bg-[#b3473f] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#cc544a]"
                                >
                                    {dialog.type === "confirm-clear" ? "Yes, Delete" : "OK"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
