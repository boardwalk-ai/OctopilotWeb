"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { Organizer } from "@/services/OrganizerService";
import { AuroraService, OutlineItem } from "@/services/AuroraService";

interface OutlinesViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

// ─── Extended outline with local UI state ───
interface OutlineCard extends OutlineItem {
    id: string;
    selected: boolean;
    hidden: boolean;
    isNew: boolean;
}

type FilterTab = "All" | "Introduction" | "Body Paragraph" | "Conclusion";

const TYPE_ORDER: Record<string, number> = { Introduction: 0, "Body Paragraph": 1, Conclusion: 2 };

function sortOutlines(cards: OutlineCard[]): OutlineCard[] {
    return [...cards].sort((a, b) => (TYPE_ORDER[a.type] ?? 1) - (TYPE_ORDER[b.type] ?? 1));
}

let idCounter = 0;
function makeId() { return `outline-${++idCounter}-${Date.now()}`; }

export default function OutlinesView({ onBack, onNext }: OutlinesViewProps) {
    const org = useOrganizer();
    const [outlines, setOutlines] = useState<OutlineCard[]>(() =>
        (org.outlines ?? []).map((o) => ({
            ...o,
            type: o.type as OutlineItem["type"],
        }))
    );
    const [filter, setFilter] = useState<FilterTab>("All");
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync outlines back to Organizer whenever they change
    const isInitialMount = useRef(true);
    useEffect(() => {
        if (isInitialMount.current) { isInitialMount.current = false; return; }
        Organizer.set({ outlines });
    }, [outlines]);

    // Build My Way modal
    const [showBuildModal, setShowBuildModal] = useState(false);
    const [buildTitle, setBuildTitle] = useState("");
    const [buildType, setBuildType] = useState<"Introduction" | "Body Paragraph" | "Conclusion">("Introduction");

    // Confirm modal
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // One Paragraph Only dropdown
    const [showParagraphDropdown, setShowParagraphDropdown] = useState(false);

    // Hidden outlines toggle
    const [showHidden, setShowHidden] = useState(false);

    // Edit modal
    const [editingCard, setEditingCard] = useState<OutlineCard | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDescription, setEditDescription] = useState("");

    // ─── Insert new outlines with "New" tag ───
    const insertOutlines = useCallback((items: OutlineItem[]) => {
        const newCards: OutlineCard[] = items.map((item) => ({
            ...item,
            id: makeId(),
            selected: false,
            hidden: false,
            isNew: true,
        }));

        setOutlines((prev) => sortOutlines([...newCards, ...prev]));

        // Remove "New" tag after 15 seconds
        const ids = newCards.map((c) => c.id);
        setTimeout(() => {
            setOutlines((prev) =>
                prev.map((c) => (ids.includes(c.id) ? { ...c, isNew: false } : c))
            );
        }, 15000);
    }, []);

    // ─── Auto Outline ───
    const handleAutoOutline = async () => {
        setError(null);
        setIsGenerating(true);
        try {
            const items = await AuroraService.generate("auto");
            insertOutlines(items);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Generation failed");
        } finally {
            setIsGenerating(false);
        }
    };

    // ─── Build My Way ───
    const handleBuildMyWay = async () => {
        if (!buildTitle.trim()) return;
        setShowBuildModal(false);
        setError(null);
        setIsGenerating(true);
        try {
            const items = await AuroraService.generate("build", buildType, buildTitle.trim());
            insertOutlines(items);
            setBuildTitle("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Generation failed");
        } finally {
            setIsGenerating(false);
        }
    };

    // ─── One Paragraph Only ───
    const handleSingleParagraph = async (type: "Introduction" | "Body Paragraph" | "Conclusion") => {
        setShowParagraphDropdown(false);
        setError(null);
        setIsGenerating(true);
        try {
            const items = await AuroraService.generate("single", type);
            insertOutlines(items);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Generation failed");
        } finally {
            setIsGenerating(false);
        }
    };

    // ─── Card actions ───
    const toggleSelect = (id: string) =>
        setOutlines((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));

    const toggleHide = (id: string) =>
        setOutlines((prev) => prev.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)));

    const deleteOutline = (id: string) =>
        setOutlines((prev) => prev.filter((c) => c.id !== id));

    const openEdit = (card: OutlineCard) => {
        setEditTitle(card.title);
        setEditDescription(card.description);
        setEditingCard(card);
    };

    const saveEdit = () => {
        if (!editingCard) return;
        setOutlines((prev) =>
            prev.map((c) =>
                c.id === editingCard.id
                    ? { ...c, title: editTitle.trim(), description: editDescription.trim() }
                    : c
            )
        );
        setEditingCard(null);
    };

    // ─── Filtering ───
    const hiddenOutlines = outlines.filter((c) => c.hidden);
    const activeOutlines = outlines.filter((c) => !c.hidden);

    const visibleOutlines = activeOutlines.filter((c) => {
        if (filter !== "All" && c.type !== filter) return false;
        return true;
    });

    const counts = {
        All: activeOutlines.length,
        Introduction: activeOutlines.filter((c) => c.type === "Introduction").length,
        "Body Paragraph": activeOutlines.filter((c) => c.type === "Body Paragraph").length,
        Conclusion: activeOutlines.filter((c) => c.type === "Conclusion").length,
    };

    // Close dropdown on click outside
    useEffect(() => {
        if (!showParagraphDropdown) return;
        const close = () => setShowParagraphDropdown(false);
        setTimeout(() => document.addEventListener("click", close), 0);
        return () => document.removeEventListener("click", close);
    }, [showParagraphDropdown]);

    return (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col px-10 pt-32 pb-[100px]">
            {/* ─── Assignment Analysis ─── */}
            <div className="mb-10">
                {/* Centered title & subtitle */}
                <h1 className="text-center text-[32px] font-bold text-white">Your Assignment Analysis</h1>
                <p className="mt-2 text-center text-[15px] text-white/40">
                    We&apos;ve analyzed your instructions and created custom outlines
                </p>

                {/* "According to your instructions" */}
                <p className="mt-8 text-[15px] font-bold text-white">
                    According to your instructions, here&apos;s what we know:
                </p>

                {/* Analysis quote box */}
                <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-5">
                    <p className="text-[14px] leading-relaxed text-white/60">
                        {org.analysis || <span className="italic text-white/25">Analysis pending...</span>}
                    </p>
                </div>

                {/* Field rows */}
                <div className="mt-6 space-y-4">
                    <div className="flex items-baseline gap-4">
                        <span className="w-[110px] shrink-0 text-[14px] font-bold text-red-500">Essay Topic:</span>
                        <span className="text-[14px] text-white/80">{org.essayTopic || "—"}</span>
                    </div>
                    <div className="flex items-baseline gap-4">
                        <span className="w-[110px] shrink-0 text-[14px] font-bold text-red-500">Essay Type:</span>
                        <span className="text-[14px] text-white/80">{org.analyzedEssayType || "—"}</span>
                    </div>
                    <div className="flex items-baseline gap-4">
                        <span className="w-[110px] shrink-0 text-[14px] font-bold text-red-500">Scope:</span>
                        <span className="text-[14px] text-white/80">{org.scope || "—"}</span>
                    </div>
                    <div className="flex items-baseline gap-4">
                        <span className="w-[110px] shrink-0 text-[14px] font-bold text-red-500">Structure:</span>
                        <span className="text-[14px] text-white/80">{org.structure || "—"}</span>
                    </div>
                </div>
            </div>

            {/* Filter by Section label */}
            <h3 className="mb-3 text-[16px] font-bold text-white">Filter by Section</h3>

            {/* Filter tabs */}
            <div className="mb-4 flex items-center gap-1">
                {(["All", "Introduction", "Body Paragraph", "Conclusion"] as FilterTab[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setFilter(tab)}
                        className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all duration-200 ${filter === tab
                            ? "bg-red-500 text-white"
                            : "text-white/40 hover:bg-white/[0.04] hover:text-white/60"
                            }`}
                    >
                        {tab} ({counts[tab]})
                    </button>
                ))}
            </div>

            {/* ─── Hidden Outlines Collapsible ─── */}
            {hiddenOutlines.length > 0 && (
                <div className="mb-6">
                    <button
                        onClick={() => setShowHidden(!showHidden)}
                        className="flex items-center gap-2 text-[14px] font-semibold text-white/70 transition hover:text-white"
                    >
                        <svg
                            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            className={`transition-transform duration-200 ${showHidden ? "rotate-90" : ""}`}
                        >
                            <path d="m9 18 6-6-6-6" />
                        </svg>
                        Hidden Outlines ({hiddenOutlines.length})
                    </button>

                    {showHidden && (
                        <div className="mt-3 space-y-3">
                            {hiddenOutlines.map((card) => {
                                const badgeColor =
                                    card.type === "Introduction"
                                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                                        : card.type === "Conclusion"
                                            ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                                            : "bg-red-500/15 text-red-400 border-red-500/25";
                                return (
                                    <div
                                        key={card.id}
                                        className="relative rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 pl-14 opacity-60"
                                    >
                                        {/* Checkbox */}
                                        <div className="absolute left-4 top-5 flex h-5 w-5 items-center justify-center rounded border border-white/10">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-white/15">
                                                <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                                                <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                                                <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
                                            </svg>
                                        </div>
                                        {/* Drag handle */}
                                        <div className="absolute left-10 top-5 text-white/15">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                                <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                                                <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                                                <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
                                            </svg>
                                        </div>
                                        {/* Top row */}
                                        <div className="mb-2 flex items-center gap-2">
                                            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${badgeColor}`}>
                                                {card.type}
                                            </span>
                                            <div className="ml-auto flex items-center gap-1">
                                                {/* Edit */}
                                                <button onClick={() => openEdit(card)} className="rounded-lg p-1.5 text-white/25 transition hover:bg-white/[0.06] hover:text-white/60">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                                    </svg>
                                                </button>
                                                {/* Reveal */}
                                                <button onClick={() => toggleHide(card.id)} className="rounded-lg p-1.5 text-white/25 transition hover:bg-white/[0.06] hover:text-white/60">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                                    </svg>
                                                </button>
                                                {/* Delete */}
                                                <button onClick={() => deleteOutline(card.id)} className="rounded-lg p-1.5 text-red-400/40 transition hover:bg-red-500/[0.06] hover:text-red-400">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        <h3 className="mb-1.5 text-[15px] font-bold text-white">{card.title}</h3>
                                        <p className="text-[13px] leading-relaxed text-white/50">{card.description}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Header row + action buttons */}
            <div className="mb-1 flex flex-wrap items-center gap-3">
                <h2 className="mr-auto text-[24px] font-bold text-white">
                    We generated outlines for you
                </h2>

                {/* Build My Way */}
                <button
                    onClick={() => setShowBuildModal(true)}
                    disabled={isGenerating}
                    className="flex items-center gap-2 rounded-full bg-red-500 px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_0_20px_rgba(239,68,68,0.25)] transition-all duration-200 hover:bg-red-400"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                        <path d="M20 4 8.12 15.88" /><path d="M14.47 14.48 20 20" /><path d="M8.12 8.12 12 12" />
                    </svg>
                    Build My Way
                </button>

                {/* Auto Outline */}
                <button
                    onClick={handleAutoOutline}
                    disabled={isGenerating}
                    className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-[13px] font-semibold text-white/70 transition-all duration-200 hover:border-white/15 hover:text-white"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                    </svg>
                    Auto Outline
                </button>

                {/* One Paragraph Only */}
                <div className="relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowParagraphDropdown(!showParagraphDropdown); }}
                        disabled={isGenerating}
                        className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/[0.04] px-5 py-2.5 text-[13px] font-semibold text-red-400 transition-all duration-200 hover:border-red-500/50"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <circle cx="12" cy="12" r="5" />
                        </svg>
                        One Paragraph Only
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>

                    {showParagraphDropdown && (
                        <div className="absolute right-0 top-full z-50 mt-2 w-[180px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a] shadow-2xl">
                            {(["Introduction", "Body Paragraph", "Conclusion"] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={(e) => { e.stopPropagation(); handleSingleParagraph(t); }}
                                    className="flex w-full px-4 py-2.5 text-left text-[13px] text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Subheading */}
            <div className="mb-4 flex items-center justify-between">
                <p className="text-[13px] text-white/40">Select and reorder the outlines you want to use:</p>
                {outlines.length > 0 && (
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[12px] font-medium text-white/50">
                        {outlines.length} outlines available
                    </span>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-[13px] text-red-400">
                    {error}
                </div>
            )}

            {/* Loading */}
            {isGenerating && (
                <div className="mb-4 flex items-center justify-center gap-2 py-8 text-[14px] text-white/40">
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Aurora is generating outlines...
                </div>
            )}

            {/* Outline cards */}
            <div className="pb-2">
                {visibleOutlines.length === 0 && !isGenerating ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <svg className="mb-4 text-white/15" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <circle cx="11" cy="15" r="3" /><path d="m13.5 17.5 2 2" />
                        </svg>
                        <p className="text-[15px] font-semibold text-white/40">No outlines yet</p>
                        <p className="mt-1 text-[13px] text-white/25">Generate some outlines to get started</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visibleOutlines.map((card, idx) => {
                            const orderIdx = outlines.indexOf(card) + 1;
                            const badgeColor =
                                card.type === "Introduction"
                                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                                    : card.type === "Conclusion"
                                        ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                                        : "bg-red-500/15 text-red-400 border-red-500/25";

                            return (
                                <div
                                    key={card.id}
                                    className={`relative rounded-2xl border p-5 pl-14 transition-all duration-200 ${card.hidden ? "opacity-40" : ""
                                        } ${card.selected
                                            ? "border-red-500/30 bg-red-500/[0.04]"
                                            : "border-white/[0.06] bg-white/[0.015] hover:border-white/10"
                                        }`}
                                >
                                    {/* Checkbox */}
                                    <button
                                        onClick={() => toggleSelect(card.id)}
                                        className="absolute left-4 top-5 flex h-5 w-5 items-center justify-center rounded border border-white/20 transition hover:border-white/40"
                                    >
                                        {card.selected && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M20 6 9 17l-5-5" />
                                            </svg>
                                        )}
                                    </button>

                                    {/* Drag handle */}
                                    <div className="absolute left-10 top-5 text-white/15">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                            <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                                            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                                            <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
                                        </svg>
                                    </div>

                                    {/* Top row: badge + actions */}
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${badgeColor}`}>
                                            {card.type}
                                        </span>
                                        {card.isNew && (
                                            <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                                                New
                                            </span>
                                        )}

                                        <div className="ml-auto flex items-center gap-1">
                                            {/* Edit */}
                                            <button onClick={() => openEdit(card)} className="rounded-lg p-1.5 text-white/25 transition hover:bg-white/[0.06] hover:text-white/60">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                                </svg>
                                            </button>
                                            {/* Hide */}
                                            <button onClick={() => toggleHide(card.id)} className="rounded-lg p-1.5 text-white/25 transition hover:bg-white/[0.06] hover:text-white/60">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                                                </svg>
                                            </button>
                                            {/* Delete */}
                                            <button onClick={() => deleteOutline(card.id)} className="rounded-lg p-1.5 text-red-400/40 transition hover:bg-red-500/[0.06] hover:text-red-400">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                            {/* Order */}
                                            <span className="ml-1 text-[12px] text-white/25">Order: {orderIdx}</span>
                                        </div>
                                    </div>

                                    {/* Title */}
                                    <h3 className="mb-1.5 text-[15px] font-bold text-white">{card.title}</h3>

                                    {/* Description */}
                                    <p className="text-[13px] leading-relaxed text-white/50">{card.description}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Fixed Bottom bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[#0a0a0a]/95 px-5 backdrop-blur-md">
                <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between py-5">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-6 py-3 text-[14px] font-semibold text-white/60 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back
                    </button>

                    <button
                        onClick={() => setShowConfirmModal(true)}
                        disabled={!outlines.some((c) => c.selected && !c.hidden)}
                        className={`group relative flex items-center gap-2 overflow-hidden rounded-full px-6 py-3 text-[14px] font-semibold transition-all duration-300 ${outlines.some((c) => c.selected && !c.hidden)
                            ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.25)] hover:bg-red-400"
                            : "border border-white/[0.1] bg-white/[0.04] text-white/30 cursor-not-allowed"
                            }`}
                    >
                        Continue
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 18 6-6-6-6" />
                        </svg>
                        {outlines.some((c) => c.selected && !c.hidden) && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out" />
                        )}
                    </button>
                </div>
            </div>

            {/* ─── Confirm Outline Modal ─── */}
            {showConfirmModal && (() => {
                const selected = outlines.filter((c) => c.selected && !c.hidden);
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm sm:p-6">
                        <div className="relative flex w-full max-w-[560px] max-h-[70vh] flex-col rounded-3xl border border-white/[0.08] bg-[#141414] shadow-2xl">
                            {/* Header */}
                            <div className="flex shrink-0 items-start justify-between p-8 pb-4">
                                <div>
                                    <h3 className="text-[22px] font-bold text-white">Confirm Outline</h3>
                                    <p className="mt-1 text-[13px] text-white/40">{selected.length} sections selected</p>
                                </div>
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-400"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Scrollable list of selected outlines */}
                            <div className="scrollbar-hide flex-1 overflow-y-auto px-8 pb-4 space-y-3">
                                {selected.map((card) => {
                                    const badgeColor =
                                        card.type === "Introduction"
                                            ? "bg-red-500 text-white"
                                            : card.type === "Conclusion"
                                                ? "bg-orange-500 text-white"
                                                : "bg-red-500 text-white";
                                    return (
                                        <div
                                            key={card.id}
                                            className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5"
                                        >
                                            <span className={`mb-2 inline-block rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
                                                {card.type}
                                            </span>
                                            <h4 className="mb-1.5 text-[15px] font-bold text-white">{card.title}</h4>
                                            <p className="text-[13px] leading-relaxed text-white/50">{card.description}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 p-8 pt-4">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-6 py-3 text-[14px] font-semibold text-white/50 transition hover:bg-white/[0.06]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        Organizer.set({ selectedOutlines: selected });
                                        setShowConfirmModal(false);
                                        onNext("configuration");
                                    }}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-[14px] font-semibold text-white transition hover:bg-red-400"
                                >
                                    Proceed to Writing
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                        <circle cx="12" cy="12" r="5" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ─── Edit Outline Modal ─── */}
            {editingCard && (() => {
                const badgeColor =
                    editingCard.type === "Introduction"
                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                        : editingCard.type === "Conclusion"
                            ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                            : "bg-red-500/15 text-red-400 border-red-500/25";
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="relative w-full max-w-[520px] rounded-3xl border border-white/[0.08] bg-[#141414] p-8 shadow-2xl">
                            {/* Close */}
                            <button
                                onClick={() => setEditingCard(null)}
                                className="absolute right-4 top-4 rounded-full p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                </svg>
                            </button>

                            <h3 className="mb-3 text-[20px] font-bold text-white">Edit Outline</h3>
                            <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${badgeColor}`}>
                                {editingCard.type}
                            </span>

                            {/* Title */}
                            <label className="mt-5 mb-2 block text-[13px] font-semibold text-white/70">Title</label>
                            <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="mb-4 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder-white/25 outline-none transition focus:border-white/15"
                            />

                            {/* Content */}
                            <label className="mb-2 block text-[13px] font-semibold text-white/70">Content</label>
                            <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                rows={5}
                                className="mb-6 w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] leading-relaxed text-white placeholder-white/25 outline-none transition focus:border-white/15"
                            />

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setEditingCard(null)}
                                    className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-[14px] font-semibold text-white/50 transition hover:bg-white/[0.06]"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveEdit}
                                    disabled={!editTitle.trim()}
                                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition ${editTitle.trim()
                                        ? "bg-red-500 text-white hover:bg-red-400"
                                        : "bg-white/[0.04] text-white/30 cursor-not-allowed"
                                        }`}
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ─── Build My Way Modal ─── */}
            {showBuildModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="relative w-full max-w-[520px] rounded-3xl border border-white/[0.08] bg-[#141414] p-8 shadow-2xl">
                        {/* Close */}
                        <button
                            onClick={() => setShowBuildModal(false)}
                            className="absolute right-4 top-4 rounded-full p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white/60"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                            </svg>
                        </button>

                        {/* Icon */}
                        <div className="mb-4 flex justify-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                                </svg>
                            </div>
                        </div>

                        <h3 className="mb-1 text-center text-[20px] font-bold text-white">Build My Way</h3>
                        <p className="mb-6 text-center text-[13px] text-white/40">Design a personalized outline structure</p>

                        {/* Title input */}
                        <label className="mb-2 block text-[13px] font-semibold text-white/70">Outline Title</label>
                        <input
                            type="text"
                            value={buildTitle}
                            onChange={(e) => setBuildTitle(e.target.value)}
                            placeholder="Enter your outline title..."
                            className="mb-5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder-white/25 outline-none transition focus:border-white/15"
                        />

                        {/* Type selector */}
                        <label className="mb-2 block text-[13px] font-semibold text-white/70">Outline Type</label>
                        <div className="mb-6 space-y-2">
                            {([
                                { type: "Introduction" as const, desc: "Hook, background, and thesis statement", icon: "📖" },
                                { type: "Body Paragraph" as const, desc: "Main argument with evidence and analysis", icon: "≡" },
                                { type: "Conclusion" as const, desc: "Summary and final thoughts", icon: "⊕" },
                            ]).map(({ type, desc, icon }) => (
                                <button
                                    key={type}
                                    onClick={() => setBuildType(type)}
                                    className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${buildType === type
                                        ? "border-red-500/40 bg-red-500/[0.06]"
                                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
                                        }`}
                                >
                                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg text-[16px] ${buildType === type ? "bg-red-500/20" : "bg-white/[0.06]"
                                        }`}>
                                        {icon}
                                    </div>
                                    <div className="flex-1">
                                        <span className="block text-[14px] font-semibold text-white">{type}</span>
                                        <span className="block text-[12px] text-white/40">{desc}</span>
                                    </div>
                                    <div className={`h-5 w-5 rounded-full border-2 transition ${buildType === type ? "border-red-500 bg-red-500" : "border-white/20"
                                        }`}>
                                        {buildType === type && (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-[-1px] mt-[-1px]">
                                                <path d="M20 6 9 17l-5-5" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowBuildModal(false)}
                                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-[14px] font-semibold text-white/50 transition hover:bg-white/[0.06]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBuildMyWay}
                                disabled={!buildTitle.trim()}
                                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition ${buildTitle.trim()
                                    ? "bg-red-500 text-white hover:bg-red-400"
                                    : "bg-white/[0.04] text-white/30 cursor-not-allowed"
                                    }`}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                    <circle cx="12" cy="12" r="5" />
                                </svg>
                                Generate Outline
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
