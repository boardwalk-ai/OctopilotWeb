"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { Organizer } from "@/services/OrganizerService";
import { LucasService } from "@/services/LucasService";

interface GenerationViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export default function GenerationView({ onBack, onNext }: GenerationViewProps) {
    const org = useOrganizer();
    const [streamedText, setStreamedText] = useState("");
    const [isGenerating, setIsGenerating] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasStarted = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll when new text streams in
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [streamedText]);

    // Calculate progress
    // Assume average word count based on words added vs target
    const targetWords = org.wordCount === "Custom" ? 1500 : (org.wordCount || 1000);
    const currentWords = streamedText.split(/\s+/).filter(w => w.length > 0).length;
    let progressPercent = Math.min(Math.round((currentWords / targetWords) * 100), 99);

    // Smooth progress clamping so it never hits 100% until DONE
    if (progressPercent > 99 && isGenerating) progressPercent = 99;
    if (!isGenerating && !error) progressPercent = 100;

    useEffect(() => {
        if (hasStarted.current) return;
        hasStarted.current = true;

        const startGeneration = async () => {
            if (org.isTestMode) {
                // Mock Streaming
                const mockText = org.generatedEssay || "Mock essay generated...";
                let currentStr = "";
                const chars = mockText.split('');

                let i = 0;
                const interval = setInterval(() => {
                    currentStr += chars[i];
                    setStreamedText(currentStr);
                    i++;
                    if (i >= chars.length) {
                        clearInterval(interval);
                        setIsGenerating(false);
                        setTimeout(() => onNext("preview"), 1000);
                    }
                }, 5); // 5ms per char approx 
                return;
            }

            try {
                const finalRawOutput = await LucasService.generate((chunkText) => {
                    let pureText = chunkText;
                    pureText = pureText.replace(/^[\s\S]*?"essay_content"\s*:\s*"/i, "");
                    pureText = pureText.replace(/\\n/g, "\n");
                    pureText = pureText.replace(/\\"/g, '"');

                    const bibloIndex = pureText.indexOf('",\n  "bibliography":');
                    if (bibloIndex !== -1) {
                        pureText = pureText.substring(0, bibloIndex);
                    }
                    setStreamedText(pureText);
                });

                let cleanOutput = finalRawOutput.trim();
                if (cleanOutput.startsWith("```")) {
                    cleanOutput = cleanOutput.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
                }

                try {
                    const parsed = JSON.parse(cleanOutput);
                    Organizer.set({
                        generatedEssay: parsed.essay_content || "",
                        generatedBibliography: parsed.bibliography || "",
                    });
                    setIsGenerating(false);

                    setTimeout(() => {
                        onNext("preview");
                    }, 1000);
                } catch {
                    setError("Failed to parse the generated essay. Model did not return valid JSON.");
                    setIsGenerating(false);
                }
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "An unknown error occurred during generation.");
                setIsGenerating(false);
            }
        };

        startGeneration();
    }, [onNext, org.isTestMode, org.generatedEssay]);

    return (
        <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col items-center overflow-hidden px-10 pb-8 pt-20">

            {/* Pulsing Logo */}
            <div className="relative mb-8 flex h-24 w-24 items-center justify-center">
                <div className={`absolute inset-0 rounded-full bg-red-500/20 blur-[50px] transition-all duration-1000 ${isGenerating ? 'animate-pulse scale-150 opacity-100' : 'scale-100 opacity-0'}`} />
                <Image
                    src="/OCTOPILOT.png"
                    alt="Octopilot Logo"
                    width={68}
                    height={68}
                    className={`relative z-10 rounded-full drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-transform duration-[3000ms] ${isGenerating ? 'scale-110' : 'scale-100'}`}
                />
            </div>

            {/* Title */}
            <h1 className="mb-2 text-center text-[32px] font-bold tracking-tight text-white">
                {error ? "Generation Failed" : isGenerating ? "Crafting Your Essay" : "Generation Complete"}
            </h1>
            <p className="mb-7 text-center text-[16px] text-white/50">
                {error
                    ? "We encountered an issue while writing your essay."
                    : isGenerating
                        ? `Lucas is analyzing your ${org.manualSources.filter(s => s.status === "scraped").length} sources and writing...`
                        : "Preparing your preview..."}
            </p>

            {/* Progress Bar */}
            <div className="mb-7 w-full max-w-xl">
                <div className="flex justify-between text-[13px] font-bold text-white/60 mb-3">
                    <span>{progressPercent}% Complete</span>
                    <span>{currentWords} / {targetWords} words</span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                        className="absolute h-full rounded-full bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                        style={{
                            width: `${progressPercent}%`,
                            transition: 'width 0.4s ease-out'
                        }}
                    >
                        {isGenerating && (
                            <div className="absolute top-0 right-0 bottom-0 w-[100px] animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                        )}
                    </div>
                </div>
            </div>

            {/* Streaming UI Box (No border, no bg, just text) */}
            <div className="relative mb-4 -mt-2 w-full max-w-[1000px] flex-1 overflow-hidden">
                {/* Read Only Stream with 3D Perspective */}
                <div
                    ref={scrollRef}
                    className="relative z-10 mx-auto h-full min-h-[300px] w-full overflow-y-auto px-10 text-[17px] leading-[1.95] text-white/80 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] origin-bottom"
                    style={{
                        whiteSpace: 'pre-wrap',
                        userSelect: 'none',
                        transform: 'perspective(300px) rotateX(35deg)',
                        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 70%, transparent 100%)',
                        maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 70%, transparent 100%)'
                    }}
                >
                    {error ? (
                        <div className="text-red-400 text-center py-10">
                            <p className="font-bold mb-2">Error Details:</p>
                            <p className="font-mono text-sm">{error}</p>
                            <button
                                onClick={onBack}
                                className="mt-6 rounded-full bg-white/10 px-6 py-2 text-sm font-bold text-white transition hover:bg-white/20"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        streamedText || <span className="animate-pulse text-white/30">Initializing neural pathways...</span>
                    )}

                    {isGenerating && !error && streamedText && (
                        <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-red-500" />
                    )}
                </div>
            </div>

            {/* Add global tailwind animation specifically for the shimmer if needed, or use inline */}
            <style jsx global>{`
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
                .animate-shimmer {
                    animation: shimmer 1.5s infinite;
                }
            `}</style>
        </div>
    );
}
