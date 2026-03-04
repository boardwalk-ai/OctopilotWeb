"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { CitationTemplateService } from "@/services/CitationTemplateService";
import { InTextCitationService } from "@/services/InTextCitationService";
import { Organizer, SourceData } from "@/services/OrganizerService";
import { SuService } from "@/services/SuService";

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

type DialogState =
    | { type: "confirm-clear"; title: string; message: string }
    | { type: "info"; title: string; message: string };

const SOURCE_COLOR_POOL = [
    { border: "#35b6ff", soft: "rgba(53, 182, 255, 0.14)", text: "#7dd3fc" },
    { border: "#32d375", soft: "rgba(50, 211, 117, 0.14)", text: "#86efac" },
    { border: "#f6b02d", soft: "rgba(246, 176, 45, 0.14)", text: "#fcd34d" },
    { border: "#bf7bff", soft: "rgba(191, 123, 255, 0.14)", text: "#d8b4fe" },
    { border: "#ff6b6b", soft: "rgba(255, 107, 107, 0.14)", text: "#fda4af" },
];

const TYPE_BADGE: Record<string, string> = {
    introduction: "bg-[#0f2237] text-[#8dc8ff] border border-[#1a3c5f]",
    "body paragraph": "bg-[#2b1212] text-[#ffadad] border border-[#472121]",
    conclusion: "bg-[#302512] text-[#ffdca1] border border-[#554118]",
};

const INSIGHTS_MIN_HEIGHT = 140;
const INSIGHTS_MAX_HEIGHT = 460;

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
        .split(/\s+/)
        .filter(Boolean).length;
}

function toPlainText(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.innerText || "").trim();
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function isCaretAtTokenEnd(token: Element, range: Range): boolean {
    try {
        const beforeCaret = range.cloneRange();
        beforeCaret.selectNodeContents(token);
        beforeCaret.setEnd(range.startContainer, range.startOffset);

        const currentOffset = beforeCaret.toString().length;
        const tokenLength = (token.textContent || "").length;
        if (currentOffset >= tokenLength) return true;
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

function buildSourceTokenHtml(params: {
    quote?: string;
    citation?: string;
    border: string;
    soft: string;
    text: string;
}): string {
    const quote = (params.quote || "").trim();
    const citation = (params.citation || "").trim();
    const content = [quote, citation].filter(Boolean).join(" ");
    if (!content) return "";

    return `<span data-source-token="1" style="display:inline;background:${params.soft};border:1px solid ${params.border};border-radius:8px;padding:1px 6px;color:${params.text};font-weight:600;box-decoration-break:clone;-webkit-box-decoration-break:clone;line-height:1.6;">${escapeHtml(content)}</span> `;
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

export default function WritingChamberView({ onBack, onNext }: WritingChamberViewProps) {
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
    const [usedSourceIndices, setUsedSourceIndices] = useState<number[]>([]);
    const [inTextCitationMap, setInTextCitationMap] = useState<Record<number, string>>({});

    const [isSourcesCollapsed, setIsSourcesCollapsed] = useState(false);

    const [summaryInsights, setSummaryInsights] = useState<SummaryInsights | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [isInsightsOpen, setIsInsightsOpen] = useState(false);
    const [insightsHeight, setInsightsHeight] = useState(220);
    const [isDraggingInsights, setIsDraggingInsights] = useState(false);
    const dragStartRef = useRef<{ y: number; height: number }>({ y: 0, height: 220 });

    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [isClientMounted, setIsClientMounted] = useState(false);

    const editorRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const rangeRefs = useRef<Record<string, Range | null>>({});
    const sourceContentRef = useRef<HTMLDivElement>(null);

    const sourceThreads = useMemo<SourceThread[]>(() => {
        return org.manualSources
            .map((source, index) => ({ ...source, index }))
            .filter((source) => source.url?.trim() || source.fullContent?.trim() || source.title?.trim());
    }, [org.manualSources]);

    const targetWords = org.wordCount === "Custom" ? 1500 : (org.wordCount || 1000);
    const sectionWordCounts = useMemo(() => {
        return sections.reduce<Record<string, number>>((acc, section) => {
            acc[section.id] = wordsFromHtml(sectionHtml[section.id] || "");
            return acc;
        }, {});
    }, [sectionHtml, sections]);
    const totalWords = useMemo(() => Object.values(sectionWordCounts).reduce((sum, n) => sum + n, 0), [sectionWordCounts]);
    const progressDeg = Math.round(clamp(totalWords / Math.max(1, targetWords), 0, 1) * 360);

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
    }, []);

    useEffect(() => {
        if (!isDraggingInsights) return;

        const onMove = (event: MouseEvent) => {
            const delta = dragStartRef.current.y - event.clientY;
            const next = clamp(dragStartRef.current.height + delta, INSIGHTS_MIN_HEIGHT, INSIGHTS_MAX_HEIGHT);
            setInsightsHeight(next);
        };

        const onUp = () => {
            setIsDraggingInsights(false);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
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
        const isSpaceExit = event.key === " " || event.key === "Spacebar";
        if (!isArrowExit && !isSpaceExit) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;

        const activeRange = selection.getRangeAt(0);
        const container = activeRange.startContainer;
        const baseElement = container.nodeType === Node.ELEMENT_NODE
            ? container as Element
            : container.parentElement;
        const token = baseElement?.closest("[data-source-token='1']");
        if (!token) return;
        if (!isCaretAtTokenEnd(token, activeRange)) return;

        event.preventDefault();
        const afterToken = document.createRange();
        afterToken.setStartAfter(token);
        afterToken.collapse(true);
        selection.removeAllRanges();
        selection.addRange(afterToken);

        if (isSpaceExit) {
            const inserted = document.execCommand("insertText", false, " ");
            if (!inserted) {
                const textNode = document.createTextNode(" ");
                afterToken.insertNode(textNode);
                const nextRange = document.createRange();
                nextRange.setStartAfter(textNode);
                nextRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(nextRange);
            }
            syncSectionFromDom(sectionId);
        }

        saveSelection(sectionId);
    }, [saveSelection, syncSectionFromDom]);

    const getCitationForSource = useCallback((source: SourceThread): string => {
        return inTextCitationMap[source.index]
            || CitationTemplateService.formatInText(org.citationStyle, source, source.index + 1);
    }, [inTextCitationMap, org.citationStyle]);

    const insertHtmlToActiveSection = useCallback((html: string, sourceIndex: number) => {
        if (!activeSectionId) return;
        const editor = editorRefs.current[activeSectionId];
        if (!editor) return;

        setCollapsed((prev) => ({ ...prev, [activeSectionId]: false }));
        editor.focus({ preventScroll: true });
        restoreSelection(activeSectionId);
        document.execCommand("insertHTML", false, html);
        syncSectionFromDom(activeSectionId);
        saveSelection(activeSectionId);
        setUsedSourceIndices((prev) => prev.includes(sourceIndex) ? prev : [...prev, sourceIndex]);
    }, [activeSectionId, restoreSelection, saveSelection, syncSectionFromDom]);

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
        const palette = SOURCE_COLOR_POOL[sourceModal.index % SOURCE_COLOR_POOL.length];
        const selected = getSelectedModalText();
        const quote = selected || (sourceModal.fullContent || sourceModal.title || "").slice(0, 260).trim();
        if (!quote) return;

        const citation = getCitationForSource(sourceModal);
        const tokenHtml = buildSourceTokenHtml({
            quote,
            citation,
            border: palette.border,
            soft: palette.soft,
            text: palette.text,
        });
        insertHtmlToActiveSection(tokenHtml, sourceModal.index);
        closeSourceModal();
    }, [activeSectionId, closeSourceModal, getCitationForSource, getSelectedModalText, insertHtmlToActiveSection, sourceModal]);

    const quickInsertCitation = useCallback((source: SourceThread) => {
        if (!activeSectionId) return;
        const palette = SOURCE_COLOR_POOL[source.index % SOURCE_COLOR_POOL.length];
        const citation = getCitationForSource(source);
        if (!citation) return;

        const tokenHtml = buildSourceTokenHtml({
            citation,
            border: palette.border,
            soft: palette.soft,
            text: palette.text,
        });
        insertHtmlToActiveSection(tokenHtml, source.index);
    }, [activeSectionId, getCitationForSource, insertHtmlToActiveSection]);

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
        setSectionAssistantLoading(sectionId, true);
        try {
            const ideas = await SuService.generateMoreIdeas({
                essayTopic: org.essayTopic || org.finalEssayTitle || "Untitled Essay",
                sectionType: section.type,
                sectionTitle: section.title || "Untitled Section",
                currentDraft: toPlainText(sectionHtml[sectionId] || ""),
                citationStyle: org.citationStyle,
            });
            pushAssistantIdeas(sectionId, ideas);
        } catch (error) {
            console.error("[WritingChamber] More ideas failed", error);
            pushAssistantIdeas(sectionId, ["Su could not generate suggestions right now. Try again."]);
        } finally {
            setSectionAssistantLoading(sectionId, false);
        }
    }, [org.citationStyle, org.essayTopic, org.finalEssayTitle, pushAssistantIdeas, sectionHtml, setSectionAssistantLoading]);

    const handleAskQuestion = useCallback(async (section: ChamberSection) => {
        const sectionId = section.id;
        const question = (assistantQuestionBySection[sectionId] || "").trim();
        if (!question) return;

        setSectionAssistantLoading(sectionId, true);
        try {
            const answer = await SuService.askQuestion({
                essayTopic: org.essayTopic || org.finalEssayTitle || "Untitled Essay",
                sectionType: section.type,
                sectionTitle: section.title || "Untitled Section",
                question,
                currentDraft: toPlainText(sectionHtml[sectionId] || ""),
                citationStyle: org.citationStyle,
            });
            upsertAssistantAnswer(sectionId, answer);
            setAssistantQuestionBySection((prev) => ({ ...prev, [sectionId]: "" }));
        } catch (error) {
            console.error("[WritingChamber] Ask failed", error);
            upsertAssistantAnswer(sectionId, "Su could not answer right now. Please try again.");
        } finally {
            setSectionAssistantLoading(sectionId, false);
        }
    }, [assistantQuestionBySection, org.citationStyle, org.essayTopic, org.finalEssayTitle, sectionHtml, setSectionAssistantLoading, upsertAssistantAnswer]);

    const addSection = useCallback(() => {
        const newId = `manual-${Date.now()}-${sections.length + 1}`;
        const nextSection: ChamberSection = {
            id: newId,
            type: "Body Paragraph",
            title: `New Section ${sections.length + 1}`,
            description: "New writing section",
        };
        setSections((prev) => [...prev, nextSection]);
        setSectionHtml((prev) => ({ ...prev, [newId]: "" }));
        setCollapsed((prev) => ({ ...prev, [newId]: false }));
        setAssistantQuestionBySection((prev) => ({ ...prev, [newId]: "" }));
        setAssistantItemsBySection((prev) => ({ ...prev, [newId]: [] }));
        setActiveSectionId(newId);
    }, [sections.length]);

    const deleteSection = useCallback((sectionId: string) => {
        if (sections.length <= 1) return;
        setSections((prev) => prev.filter((section) => section.id !== sectionId));

        setSectionHtml((prev) => {
            const next = { ...prev };
            delete next[sectionId];
            return next;
        });
        setCollapsed((prev) => {
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

        if (activeSectionId === sectionId) {
            const fallback = sections.find((s) => s.id !== sectionId);
            if (fallback) setActiveSectionId(fallback.id);
        }
    }, [activeSectionId, sections]);

    const toggleSectionCollapse = useCallback((sectionId: string) => {
        setCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
    }, []);

    const syncAllEditors = useCallback(() => {
        sections.forEach((section) => syncSectionFromDom(section.id));
    }, [sections, syncSectionFromDom]);

    const continueToPreview = useCallback(() => {
        syncAllEditors();

        const essayParts = sections
            .map((section) => toPlainText(sectionHtml[section.id] || ""))
            .filter(Boolean);
        const generatedEssay = essayParts.join("\n\n");

        const bibliographyLines = usedSourceIndices
            .map((idx) => sourceThreads.find((s) => s.index === idx))
            .filter((s): s is SourceThread => Boolean(s))
            .map((source, i) => CitationTemplateService.formatReference(org.citationStyle, source, i + 1))
            .filter(Boolean);

        Organizer.set({
            generatedEssay,
            generatedBibliography: bibliographyLines.length > 0
                ? bibliographyLines.join("\n")
                : org.generatedBibliography,
        });
        onNext("preview");
    }, [onNext, org.citationStyle, org.generatedBibliography, sectionHtml, sections, sourceThreads, syncAllEditors, usedSourceIndices]);

    const handleSummaryClick = useCallback(async () => {
        if (summaryLoading) return;

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
        try {
            const summary = await SuService.summarizeProgress({
                essayTitle: org.finalEssayTitle || org.essayTopic || "Untitled Essay",
                outlineTitles: sections.map((section) => section.title.trim()).filter(Boolean),
                writtenEssay,
            });
            setSummaryInsights(summary);
            setIsInsightsOpen(true);
        } catch (error) {
            console.error("[WritingChamber] Summary failed", error);
            setDialog({
                type: "info",
                title: "Summary Failed",
                message: "Su summary ကို မရနိုင်သေးပါ။ ခဏနေရင် ပြန်စမ်းပါ။",
            });
        } finally {
            setSummaryLoading(false);
        }
    }, [org.essayTopic, org.finalEssayTitle, sectionHtml, sections, summaryInsights, summaryLoading, syncAllEditors]);

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

    const startInsightsDrag = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        if (!isInsightsOpen) {
            setIsInsightsOpen(true);
        }
        dragStartRef.current = { y: event.clientY, height: insightsHeight };
        setIsDraggingInsights(true);
        event.preventDefault();
    }, [insightsHeight, isInsightsOpen]);

    const continueButton = (
        <button
            onClick={continueToPreview}
            className="fixed bottom-4 right-4 z-[95] rounded-xl bg-[#a43e37] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition hover:bg-[#be4a42]"
        >
            Continue to Preview →
        </button>
    );
    return (
        <div className="relative flex h-full min-h-0 flex-col bg-[#080808]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            <div className="flex h-[68px] items-center border-b border-white/10 bg-[#0a0a0a] px-5">
                <button
                    onClick={onBack}
                    className="mr-3 flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-[#121317] px-4 text-[13px] font-bold text-[#f4f4f5] transition hover:bg-[#1f2127]"
                >
                    <span className="text-[14px] font-black">{"<"}</span>
                    <span>Back</span>
                </button>

                <button
                    onClick={addSection}
                    className="mr-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#ff5a52] text-[24px] font-medium text-white shadow-[0_4px_12px_rgba(255,90,82,0.4)] transition hover:bg-[#ff736b]"
                    title="Add section"
                >
                    +
                </button>

                <div className="flex min-w-0 flex-1 flex-col items-center">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff5a52]">Writing Chamber</div>
                    <div className="mt-0.5 truncate text-[15px] font-bold text-[#f4f4f5]">{org.finalEssayTitle || "Untitled Essay"}</div>
                </div>

                <div className="ml-3 flex items-center gap-2.5">
                    <button
                        onClick={handleSummaryClick}
                        disabled={summaryLoading}
                        className="rounded-full border border-[#7b6a2a] bg-[#2c260f] px-4 py-2 text-[12px] font-bold text-[#ffe57d] transition hover:bg-[#3a3112] disabled:opacity-50"
                    >
                        {summaryLoading ? "Summarizing..." : "Summary"}
                    </button>

                    <div className="flex items-center gap-2">
                        <div className="relative h-[60px] w-[60px]">
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
                        <div className="text-[12px] font-semibold text-white/55">of {targetWords} words</div>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col border-r border-white/10 bg-[#070707]">
                    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
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
                                        className={`overflow-hidden rounded-2xl border transition ${isActive ? "border-[#ff5a52] shadow-[inset_0_0_0_1px_rgba(255,90,82,0.35)]" : "border-white/15"}`}
                                    >
                                        <div className="flex items-center gap-3 border-b border-white/10 bg-[#0a0a0a] px-4 py-2.5">
                                            <button className="text-[15px] font-bold text-white/35">≡</button>
                                            <span className="px-1 text-[16px] font-black text-white">{index + 1}</span>

                                            <span className={`rounded-full px-3.5 py-1 text-[9px] font-black uppercase tracking-wider ${TYPE_BADGE[typeKey] || "border border-[#4f3517] bg-[#33230f] text-[#f4c37a]"}`}>
                                                {section.type}
                                            </span>

                                            <input
                                                value={section.title}
                                                onFocus={() => setActiveSectionId(section.id)}
                                                onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                                                placeholder="Section title"
                                                className="h-8 min-w-0 flex-1 rounded-full border border-white/15 bg-[#111217] px-3 text-[13px] font-semibold text-[#f8fafc] outline-none transition focus:border-white/35"
                                            />

                                            <button
                                                onClick={() => handleMoreIdeas(section)}
                                                disabled={isLoadingAssistant}
                                                className="rounded-full bg-[#332e10] px-3.5 py-1 text-[10px] font-bold text-[#ffe35a] disabled:opacity-45"
                                            >
                                                {isLoadingAssistant ? "Thinking..." : "More ideas"}
                                            </button>

                                            <div className="ml-auto flex items-center gap-2.5">
                                                <button
                                                    onClick={() => deleteSection(section.id)}
                                                    className="mr-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#ff5a52] text-white hover:bg-[#ff736b]"
                                                    title={sections.length <= 1 ? "At least one section is required" : "Delete section"}
                                                    disabled={sections.length <= 1}
                                                >
                                                    <MaterialDeleteIcon />
                                                </button>

                                                <span className="min-w-[70px] text-right text-[12px] font-semibold text-white/55">{words} words</span>

                                                <button
                                                    onClick={() => toggleSectionCollapse(section.id)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1a1d23] text-[12px] text-white/80 hover:bg-[#242832]"
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
                                            <div className="grid min-h-[360px] grid-cols-[280px_minmax(0,1fr)]">
                                                <div className="rounded-bl-2xl border-r border-white/10 bg-[#0a0a0a] p-4">
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

                                                <div className="rounded-br-2xl bg-[#090909] p-4">
                                                    <div className="mb-2 text-[12px] font-semibold text-[#b3b8c2]">Writing Area</div>
                                                    <div
                                                        className={`relative rounded-xl border ${isActive ? "border-white/35 bg-[#35393f]" : "border-white/15 bg-[#32353a]"}`}
                                                        onClick={() => setActiveSectionId(section.id)}
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
                                                                setActiveSectionId(section.id);
                                                                saveSelection(section.id);
                                                            }}
                                                            onInput={() => syncSectionFromDom(section.id)}
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
                    </div>

                    <div className="border-t border-white/10 bg-[#090909]">
                        <div className="relative h-12">
                            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
                            <button
                                onClick={() => setIsInsightsOpen((prev) => !prev)}
                                onMouseDown={startInsightsDrag}
                                className="group absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/25 bg-[#121317] p-2.5 shadow-[0_8px_18px_rgba(0,0,0,0.35)] transition hover:bg-[#1a1d24]"
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
                            className="overflow-hidden transition-[height] duration-300 ease-in-out"
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
                                    <div className="grid h-[calc(100%-30px)] grid-cols-2 gap-3">
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

                    <div className="flex h-[50px] items-center border-t border-white/10 bg-[#0a0a0a] px-4 text-[13px] text-white/65">
                        {sections.length} sections
                    </div>
                </div>

                <div className={`relative flex flex-col border-l border-white/10 bg-[#070707] transition-[width] duration-300 ease-in-out ${isSourcesCollapsed ? "w-[56px]" : "w-[320px]"}`}>
                    <button
                        onClick={() => setIsSourcesCollapsed((prev) => !prev)}
                        className="absolute -left-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/20 bg-[#131820] px-2.5 py-1.5 text-[11px] font-black text-white/90 shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
                        title={isSourcesCollapsed ? "Expand sources panel" : "Collapse sources panel"}
                    >
                        {isSourcesCollapsed ? "◀" : "▶"}
                    </button>

                    {isSourcesCollapsed ? (
                        <div className="flex h-full items-center justify-center">
                            <span className="-rotate-180 text-[11px] font-semibold tracking-[0.16em] text-white/60 [writing-mode:vertical-rl]">SOURCES</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
                                <h3 className="text-[20px] font-bold text-white">Sources</h3>
                                <span className="rounded-full border border-white/20 bg-[#11151d] px-3 py-1 text-[10px] font-bold text-[#9bc9ff]">{sourceStyleBadge}</span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2.5">
                                <div className="flex flex-col gap-2.5">
                                    {sourceThreads.map((source) => {
                                        const palette = SOURCE_COLOR_POOL[source.index % SOURCE_COLOR_POOL.length];
                                        const citation = getCitationForSource(source);
                                        const snippet = (source.fullContent || "").replace(/\s+/g, " ").slice(0, 110);

                                        return (
                                            <div
                                                key={`${source.index}-${source.url}`}
                                                className="cursor-pointer rounded-xl border p-2.5 transition hover:bg-[#121212]"
                                                style={{ borderColor: `${palette.border}66`, backgroundColor: palette.soft }}
                                                onClick={() => openSourceModal(source)}
                                            >
                                                <h4 className="truncate text-[15px] font-bold text-white">{source.title || "Untitled Source"}</h4>
                                                <p className="mt-1 text-[12px] text-white/70">
                                                    {source.author || "Unknown author"} ({source.publishedYear || "n.d."})
                                                </p>
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

            {isClientMounted && createPortal(continueButton, document.body)}

            {sourceModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                    <div className="flex h-[78vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#090909]">
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

            {dialog && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
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
                </div>
            )}
        </div>
    );
}
