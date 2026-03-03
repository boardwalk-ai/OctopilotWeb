"use client";

import { useState } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { Organizer } from "@/services/OrganizerService";

interface PreviewViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export default function PreviewView({ onBack, onNext }: PreviewViewProps) {
    const org = useOrganizer();
    const [isEditing, setIsEditing] = useState(false);
    const [editableText, setEditableText] = useState(org.generatedEssay);

    // Calculate dynamic stats
    const paragraphCount = org.selectedOutlines.length;
    const activeSources = org.manualSources.filter(s => s.status === "scraped" || s.fullContent);
    const referencesCount = activeSources.length;

    // Keyword highlighter
    const keywordList = org.keywords
        ? org.keywords.split(',').map(k => k.trim()).filter(Boolean)
        : [];

    const renderHighlightedText = (text: string) => {
        if (!text) return "No content generated.";
        if (keywordList.length === 0) return text;

        // Create a regex that safely matches any of the keywords case-insensitively
        const escapedKeywords = keywordList.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');

        // Split text by keywords and wrap matches in a glowing span
        const parts = text.split(regex);
        return parts.map((part, i) => {
            const isMatch = keywordList.some(k => k.toLowerCase() === part.toLowerCase());
            if (isMatch) {
                return (
                    <span
                        key={i}
                        className="animate-glow-flicker font-bold text-yellow-300 px-1"
                    >
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    // Helper to render a stat card
    const StatCard = ({ icon, label, value, tooltip = false }: { icon: React.ReactNode, label: string, value: string, tooltip?: boolean }) => (
        <div className="flex flex-col justify-center rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5 shadow-sm transition hover:bg-white/[0.04] relative">
            <div className="flex items-center gap-2 mb-3">
                <div className="text-[#3b82f6]/70">
                    {icon}
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">{label}</span>
                {tooltip && (
                    <div className="absolute right-4 top-4 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[10px] text-white/40 hover:bg-white/10">
                        ?
                    </div>
                )}
            </div>
            <span className="text-[16px] font-medium text-white/90 truncate">{value || "-"}</span>
        </div>
    );

    return (
        <div className="mx-auto flex w-full flex-col px-10 pt-32 pb-[140px] max-w-[1200px]">

            {/* Header */}
            <div className="mb-10 flex items-center justify-between">
                <div>
                    <h1 className="mb-2 text-[32px] font-bold tracking-tight text-white">Essay Details</h1>
                    <p className="text-[16px] text-white/50">Comprehensive overview of your academic paper</p>
                </div>
                {/* Continue Button Top Right (from reference image) */}
                <button
                    onClick={() => onNext("humanizer")}
                    className="rounded-xl bg-red-500 px-8 py-3.5 text-[15px] font-bold text-white shadow-[0_0_20px_rgba(239,68,68,0.25)] transition hover:bg-red-400"
                >
                    Continue
                </button>
            </div>

            {/* Details Grid */}
            <div className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Essay Title"
                    value={org.finalEssayTitle || org.essayTopic || "Untitled"}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>}
                />
                <StatCard
                    label="Citation Format"
                    value={org.citationStyle}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                />
                <StatCard
                    label="Major"
                    value={org.majorName || "Undeclared / General Studies"}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>}
                />
                <StatCard
                    label="Essay Type"
                    value={org.essayType || "Custom"}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>}
                />

                <StatCard
                    label="Imperfect Mode"
                    value="Disabled"
                    tooltip
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
                />
                <StatCard
                    label="Outlines Used"
                    value={paragraphCount.toString()}
                    tooltip
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>}
                />
                <StatCard
                    label="Writing Tone"
                    value={org.tone}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>}
                />
                <StatCard
                    label="Word Count"
                    value={org.wordCount.toString()}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>}
                />

                <StatCard
                    label="Paragraph Count"
                    value={paragraphCount.toString()}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="21" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="3" y2="18" /></svg>}
                />
                <StatCard
                    label="References Count"
                    value={referencesCount.toString()}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>}
                />
                <StatCard
                    label="Author"
                    value="Lucas"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
                />
                <StatCard
                    label="Institution"
                    value={org.institutionName || "-"}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9h1" /><path d="M9 13h1" /><path d="M9 17h1" /></svg>}
                />

                <StatCard
                    label="Instructor"
                    value={org.instructorName || "-"}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>}
                />
                <StatCard
                    label="Date"
                    value={org.essayDate || "-"}
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                />
            </div>

            {/* Essay Content Section */}
            <div className="mb-12">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[26px] font-bold text-white tracking-tight">Essay Content</h2>
                    <button
                        onClick={() => {
                            if (isEditing) {
                                Organizer.set({ generatedEssay: editableText });
                            }
                            setIsEditing(!isEditing);
                        }}
                        className={`rounded-full px-6 py-2 text-[13px] font-bold transition ${isEditing ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-[#eab308] text-black hover:bg-[#ca8a04]'}`}
                    >
                        {isEditing ? "Save Changes" : "Edit Text"}
                    </button>
                </div>

                <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8 shadow-sm">
                    {isEditing ? (
                        <textarea
                            value={editableText}
                            onChange={(e) => setEditableText(e.target.value)}
                            className="w-full min-h-[400px] bg-transparent text-[16px] leading-[1.8] text-white outline-none resize-none"
                        />
                    ) : (
                        <div
                            className="text-[16px] leading-[1.8] text-white/90 whitespace-pre-wrap"
                        >
                            {renderHighlightedText(editableText)}
                        </div>
                    )}
                </div>
            </div>

            {/* References Section */}
            <div>
                <h2 className="text-[20px] font-bold text-white mb-6">References</h2>
                <div className="flex flex-col gap-4">
                    {/* First put the formatted bibliography at top if it exists, styling it like a block */}
                    {org.generatedBibliography && (
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 mb-4">
                            <h3 className="text-[14px] font-bold text-white/50 uppercase tracking-widest mb-4">Formatted Bibliography</h3>
                            <div className="text-[14px] leading-relaxed text-white/80 whitespace-pre-wrap pl-4 border-l-2 border-red-500/50">
                                {org.generatedBibliography}
                            </div>
                        </div>
                    )}

                    {/* Then loop individual source cards matching the prototype */}
                    {activeSources.map((source, idx) => (
                        <div key={idx} className="relative flex flex-col rounded-2xl border border-white/[0.08] bg-[#0d0d0d] p-5 shadow-sm">
                            <div className="flex items-start gap-4">
                                <span className="text-[16px] font-bold text-white/40">[{idx + 1}]</span>
                                <div className="flex flex-col gap-1 w-full">
                                    <h3 className="text-[15px] font-bold text-white">
                                        {source.title || "Unknown Document"}
                                    </h3>
                                    <p className="text-[13px] text-white/60">
                                        Authors: {source.author || "Unknown"}
                                    </p>
                                    {source.publisher && (
                                        <p className="text-[13px] text-white/60">
                                            {source.publisher}
                                        </p>
                                    )}
                                    <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[13px] font-bold text-red-500 hover:text-red-400 mt-1 truncate max-w-full"
                                    >
                                        {source.url}
                                    </a>
                                    <p className="text-[11px] text-white/30 mt-2">
                                        Cached: {org.essayDate || "Today"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}

                    {activeSources.length === 0 && (
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-center text-white/50 text-[14px]">
                            No references attached to this essay.
                        </div>
                    )}
                </div>
            </div>

            <style jsx global>{`
                @keyframes glowFlicker {
                    0%, 100% { 
                        opacity: 1; 
                        text-shadow: 0 0 4px rgba(253, 224, 71, 0.5), 0 0 12px rgba(253, 224, 71, 0.3); 
                    }
                    50% { 
                        opacity: 0.85; 
                        text-shadow: 0 0 10px rgba(253, 224, 71, 0.8), 0 0 20px rgba(253, 224, 71, 0.5); 
                    }
                }
                .animate-glow-flicker {
                    animation: glowFlicker 4s ease-in-out infinite alternate;
                }
            `}</style>
        </div>
    );
}
