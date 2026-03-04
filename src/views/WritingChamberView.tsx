"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { CitationTemplateService } from "@/services/CitationTemplateService";
import { Organizer, SourceData } from "@/services/OrganizerService";

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

const SOURCE_COLOR_POOL = [
    { border: "#35b6ff", soft: "rgba(53, 182, 255, 0.14)", text: "#7dd3fc" },
    { border: "#32d375", soft: "rgba(50, 211, 117, 0.14)", text: "#86efac" },
    { border: "#f6b02d", soft: "rgba(246, 176, 45, 0.14)", text: "#fcd34d" },
    { border: "#bf7bff", soft: "rgba(191, 123, 255, 0.14)", text: "#d8b4fe" },
    { border: "#ff6b6b", soft: "rgba(255, 107, 107, 0.14)", text: "#fda4af" },
];

const TYPE_BADGE: Record<string, string> = {
    introduction: "bg-[#0b335f] text-[#6ec8ff]",
    "body paragraph": "bg-[#4b1616] text-[#ff8f8f]",
    conclusion: "bg-[#56380f] text-[#ffd38a]",
};

function escapeHtml(text: string): string {
    return (text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
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

export default function WritingChamberView({ onBack, onNext }: WritingChamberViewProps) {
    const org = useOrganizer();

    const initialSections = useMemo(() => buildInitialSections(org), [org]);
    const [sections, setSections] = useState<ChamberSection[]>(initialSections);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [activeSectionId, setActiveSectionId] = useState<string>(initialSections[0]?.id || "");
    const [sectionHtml, setSectionHtml] = useState<Record<string, string>>(() => (
        initialSections.reduce<Record<string, string>>((acc, section) => {
            acc[section.id] = "";
            return acc;
        }, {})
    ));
    const [sourceModal, setSourceModal] = useState<SourceThread | null>(null);
    const [usedSourceIndices, setUsedSourceIndices] = useState<number[]>([]);

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

    const activeSection = useMemo(() => sections.find((s) => s.id === activeSectionId) || sections[0], [activeSectionId, sections]);

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

    const insertHtmlToActiveSection = useCallback((html: string, sourceIndex: number) => {
        if (!activeSectionId) return;
        const editor = editorRefs.current[activeSectionId];
        if (!editor) return;

        setCollapsed((prev) => ({ ...prev, [activeSectionId]: false }));
        setActiveSectionId(activeSectionId);
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
        const citation = CitationTemplateService.formatInText(org.citationStyle, sourceModal, sourceModal.index + 1);
        const quoteHtml = `<span style="background:${palette.soft};border:1px solid ${palette.border};border-radius:6px;padding:1px 4px;color:${palette.text};">${escapeHtml(quote)}</span>`;
        const citationHtml = citation
            ? `<span style="color:${palette.text};font-weight:600;"> ${escapeHtml(citation)}</span>`
            : "";
        insertHtmlToActiveSection(`${quoteHtml}${citationHtml} `, sourceModal.index);
        closeSourceModal();
    }, [activeSectionId, closeSourceModal, getSelectedModalText, insertHtmlToActiveSection, org.citationStyle, sourceModal]);

    const quickInsertCitation = useCallback((source: SourceThread) => {
        if (!activeSectionId) return;
        const palette = SOURCE_COLOR_POOL[source.index % SOURCE_COLOR_POOL.length];
        const citation = CitationTemplateService.formatInText(org.citationStyle, source, source.index + 1);
        if (!citation) return;
        insertHtmlToActiveSection(
            `<span style="background:${palette.soft};border:1px solid ${palette.border};border-radius:999px;padding:1px 8px;color:${palette.text};font-weight:600;">${escapeHtml(citation)}</span> `,
            source.index
        );
    }, [activeSectionId, insertHtmlToActiveSection, org.citationStyle]);

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
        if (activeSectionId === sectionId) {
            const fallback = sections.find((s) => s.id !== sectionId);
            if (fallback) setActiveSectionId(fallback.id);
        }
    }, [activeSectionId, sections]);

    const toggleSectionCollapse = useCallback((sectionId: string) => {
        setCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
    }, []);

    const continueToPreview = useCallback(() => {
        for (const section of sections) syncSectionFromDom(section.id);
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
    }, [onNext, org.citationStyle, org.generatedBibliography, sectionHtml, sections, sourceThreads, syncSectionFromDom, usedSourceIndices]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#0b1118]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            <div className="flex h-[72px] items-center border-b border-[#1f2b3d] px-6">
                <button
                    onClick={onBack}
                    className="mr-3 flex h-9 items-center gap-1.5 rounded-full border border-[#2b3a54] bg-[#0c121b] px-4 text-[13px] font-bold text-[#f4f4f5] transition hover:bg-[#1a2433]"
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
                    <div className="mt-0.5 truncate text-[20px] font-bold text-[#f4f4f5]">{org.finalEssayTitle || "Untitled Essay"}</div>
                </div>

                <div className="ml-4 flex items-center gap-3">
                    <button className="rounded-full bg-[#4a4216] px-4 py-1.5 text-[13px] font-bold text-[#ffe35a] hover:bg-[#5c511b]">Summary</button>
                    <div className="flex items-center gap-1.5 rounded-full border border-[#1f2b3d] bg-[#0c121b] px-4 py-1.5 text-right">
                        <div className="text-[19px] font-bold leading-none text-white">{totalWords}</div>
                        <div className="text-[11px] font-semibold text-white/50 pt-0.5">of {targetWords} words</div>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col border-r border-[#1f2b3d]">
                    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
                        <div className="flex flex-col gap-3">
                            {sections.map((section, index) => {
                                const isCollapsed = Boolean(collapsed[section.id]);
                                const isActive = section.id === activeSectionId;
                                const typeKey = section.type.toLowerCase();
                                const words = sectionWordCounts[section.id] || 0;

                                return (
                                    <div
                                        key={section.id}
                                        className={`rounded-2xl border transition overflow-hidden ${isActive ? "border-[#ff5a52] shadow-[0_0_0_1px_rgba(255,90,82,1)]" : "border-[#213045]"}`}
                                    >
                                        <div className="flex items-center gap-3 border-b border-[#1f2b3d] px-5 py-3.5 bg-[#0b1118]">
                                            <button className="text-[18px] font-bold text-[#445b7d]">≡</button>
                                            <span className="text-[19px] font-black text-white px-1">{index + 1}</span>
                                            <span className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${TYPE_BADGE[typeKey] || "bg-[#33230f] text-[#f4c37a]"}`}>
                                                {section.type}
                                            </span>
                                            <h3 className="truncate ml-1 text-[18px] font-bold tracking-tight text-[#f8fafc]">{section.title}</h3>
                                            <button className="rounded-full bg-[#332e10] px-4 py-1 text-[11px] font-bold text-[#ffe35a]">More ideas</button>
                                            <div className="ml-auto flex items-center gap-3.5">
                                                <button
                                                    onClick={() => deleteSection(section.id)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff5a52] text-[13px] text-white hover:bg-[#ff736b]"
                                                    title={sections.length <= 1 ? "At least one section is required" : "Delete section"}
                                                    disabled={sections.length <= 1}
                                                >
                                                    🗑
                                                </button>
                                                <span className="text-[13px] font-bold text-white/50">{words} words</span>
                                                <button
                                                    onClick={() => toggleSectionCollapse(section.id)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1c2838] text-[12px] text-white/80 hover:bg-[#2b3a54]"
                                                >
                                                    {isCollapsed ? "⌄" : "⌃"}
                                                </button>
                                            </div>
                                        </div>

                                        {!isCollapsed && (
                                            <div className="grid grid-cols-[280px_minmax(0,1fr)]">
                                                <div className="border-r border-[#1f2b3d] bg-[#0c121b] p-5">
                                                    <div className="mb-3 text-[18px] font-black tracking-wide text-[#ffe35a]">AI Writing Assistant</div>
                                                    <div className="relative mb-2.5 flex">
                                                        <input
                                                            placeholder="Ask a question"
                                                            className="h-10 w-full rounded-xl border border-[#4a4216] bg-transparent pl-4 pr-12 text-[14px] font-medium text-white/80 placeholder-white/30 outline-none focus:border-[#ffe35a]/50"
                                                        />
                                                    </div>
                                                    <div className="mt-8 text-center text-[15px] font-medium text-white/20">
                                                        No suggestions yet
                                                    </div>
                                                </div>

                                                <div className="bg-[#0b1118] p-5">
                                                    <div className="mb-2.5 text-[14px] font-bold text-[#a1b3cd]">Writing Area</div>
                                                    <div
                                                        className={`relative rounded-xl border ${isActive ? "border-[#4a6ba5] bg-[#0d1624]" : "border-[#1f2b3d] bg-[#0c121b]"}`}
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
                                                            onMouseUp={() => saveSelection(section.id)}
                                                            className="min-h-[160px] p-4 text-[15px] leading-[1.6] text-[#dbeafe] outline-none"
                                                        />
                                                        {!toPlainText(sectionHtml[section.id] || "") && (
                                                            <div className="pointer-events-none absolute left-4 top-4 text-[14px] font-medium text-white/25">
                                                                Start writing your {section.type.toLowerCase()} here...
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex h-[56px] items-center justify-between border-t border-[#1f2b3d] bg-[#0c131d] px-4">
                        <div className="text-[13px] text-white/65">{sections.length} sections</div>
                        <button
                            onClick={continueToPreview}
                            className="rounded-xl bg-[#a43e37] px-5 py-2 text-[14px] font-semibold text-white transition hover:bg-[#be4a42]"
                        >
                            Continue to Preview →
                        </button>
                    </div>
                </div>

                <div className="flex w-[320px] flex-col bg-[#0c1118]">
                    <div className="flex items-center justify-between border-b border-[#1f2b3d] px-3.5 py-2.5">
                        <h3 className="text-[22px] font-bold text-white">Sources</h3>
                        <span className="rounded-full bg-[#10335a] px-2.5 py-1 text-[11px] font-bold text-[#63b3ff]">{org.citationStyle}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2.5">
                        <div className="flex flex-col gap-2.5">
                            {sourceThreads.map((source) => {
                                const palette = SOURCE_COLOR_POOL[source.index % SOURCE_COLOR_POOL.length];
                                const citation = CitationTemplateService.formatInText(org.citationStyle, source, source.index + 1);
                                const snippet = (source.fullContent || "").replace(/\s+/g, " ").slice(0, 110);
                                return (
                                    <div
                                        key={`${source.index}-${source.url}`}
                                        className="cursor-pointer rounded-xl border p-2.5 transition hover:bg-[#121927]"
                                        style={{ borderColor: `${palette.border}66`, backgroundColor: palette.soft }}
                                        onClick={() => openSourceModal(source)}
                                    >
                                        <h4 className="truncate text-[15px] font-bold text-white">{source.title || "Untitled Source"}</h4>
                                        <p className="mt-1 text-[12px] text-white/70">
                                            {source.author || "Unknown author"} ({source.publishedYear || "n.d."})
                                        </p>
                                        {snippet && <p className="mt-2 line-clamp-2 text-[11px] text-white/45">{snippet}</p>}

                                        <div className="mt-2.5 flex items-center justify-between rounded-lg border border-white/10 bg-[#0f1724] px-2.5 py-1.5">
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
                                <div className="rounded-xl border border-[#1f2b3d] bg-[#0f1520] p-3 text-[14px] text-white/45">
                                    No sources found. Add sources in Configuration step.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {sourceModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                    <div className="flex h-[78vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-[#2b3a54] bg-[#090f16]">
                        <div className="flex items-start justify-between border-b border-[#1f2b3d] px-5 py-4">
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

                        <div className="border-b border-[#1f2b3d] px-5 py-2.5 text-[20px] font-semibold text-[#ffe35a]">
                            Highlight to Add to Paragraph
                        </div>

                        <div className="flex items-center justify-between border-b border-[#1f2b3d] bg-[#0d1520] px-5 py-2">
                            <span className="text-[13px] text-white/60">In-text citation template</span>
                            <span className="rounded-full bg-[#122031] px-3 py-1 text-[13px] font-semibold text-[#7dd3fc]">
                                {CitationTemplateService.formatInText(org.citationStyle, sourceModal, sourceModal.index + 1) || "N/A"}
                            </span>
                        </div>

                        <div
                            ref={sourceContentRef}
                            className="flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-[1.55] text-[#dbeafe] selection:bg-[#4f82ff]/60"
                        >
                            {sourceModal.fullContent || "No full content available for this source."}
                        </div>

                        <div className="flex items-center justify-between border-t border-[#1f2b3d] px-5 py-3">
                            <div className="text-[14px] text-white/55">
                                Active section: <span className="text-white/85">{activeSection?.title || "None"}</span>
                            </div>
                            <button
                                onClick={insertFromModalSelection}
                                disabled={!activeSection?.id}
                                className={`rounded-xl px-5 py-2 text-[14px] font-semibold ${activeSection?.id ? "bg-[#cfd5df] text-[#1a2433] hover:bg-white" : "bg-white/15 text-white/40 cursor-not-allowed"}`}
                            >
                                Insert with Citation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
