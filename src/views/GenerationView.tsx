"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { CreditService } from "@/services/CreditService";
import { Organizer } from "@/services/OrganizerService";
import { LucasService } from "@/services/LucasService";
import styles from "./GenerationViewMobile.module.css";

interface GenerationViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export default function GenerationView({ onBack, onNext }: GenerationViewProps) {
    const org = useOrganizer();
    const [streamedText, setStreamedText] = useState("");
    const [isGenerating, setIsGenerating] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [crawlOffset, setCrawlOffset] = useState(0);
    const hasStarted = useRef(false);
    const hasNavigated = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const crawlContentRef = useRef<HTMLDivElement>(null);
    const targetTextRef = useRef("");
    const flushTimerRef = useRef<number | null>(null);

    const extractGenerationResult = (raw: string): { essay_content: string; bibliography: string } | null => {
        let cleanOutput = raw.trim();
        if (cleanOutput.startsWith("```")) {
            cleanOutput = cleanOutput.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
        }

        const firstBrace = cleanOutput.indexOf("{");
        const lastBrace = cleanOutput.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const candidate = cleanOutput.slice(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(candidate) as { essay_content: string; bibliography: string };
            } catch {
                // fallback below
            }
        }

        const essayMatch = cleanOutput.match(/"essay_content"\s*:\s*"([\s\S]*?)"\s*,\s*"bibliography"/);
        const bibliographyMatch = cleanOutput.match(/"bibliography"\s*:\s*"([\s\S]*?)"\s*\}?$/);
        if (!essayMatch) {
            return null;
        }

        const decode = (value: string) =>
            value
                .replace(/\\"/g, "\"")
                .replace(/\\n/g, "\n")
                .replace(/\\\\/g, "\\");

        return {
            essay_content: decode(essayMatch[1]).trim(),
            bibliography: bibliographyMatch ? decode(bibliographyMatch[1]).trim() : "",
        };
    };

    const queueDisplayedText = (nextText: string) => {
        targetTextRef.current = nextText;
        if (flushTimerRef.current !== null) return;

        flushTimerRef.current = window.setInterval(() => {
            setStreamedText((current) => {
                const target = targetTextRef.current;
                if (current === target) {
                    if (flushTimerRef.current !== null) {
                        window.clearInterval(flushTimerRef.current);
                        flushTimerRef.current = null;
                    }
                    return current;
                }

                const remaining = target.length - current.length;
                const step = remaining > 240 ? 44 : remaining > 120 ? 28 : remaining > 60 ? 18 : remaining > 24 ? 10 : 4;
                return target.slice(0, current.length + step);
            });
        }, 24);
    };

    useEffect(() => {
        const viewport = scrollRef.current;
        const content = crawlContentRef.current;
        if (!viewport || !content) return;

        const viewportHeight = viewport.clientHeight;
        const contentHeight = content.scrollHeight;
        if (viewportHeight <= 0 || contentHeight <= 0) return;

        const visibleFloor = viewportHeight * 0.56;
        const nextOffset = Math.max(0, contentHeight - visibleFloor);
        setCrawlOffset(nextOffset);
    }, [streamedText]);

    // Calculate progress
    // Assume average word count based on words added vs target
    const targetWords = org.wordCount === "Custom" ? 1500 : (org.wordCount || 1000);
    const currentWords = streamedText.split(/\s+/).filter(w => w.length > 0).length;
    const isStreamSettled = streamedText === targetTextRef.current;
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
                targetTextRef.current = mockText;
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
                await CreditService.ensureSufficientWordCreditsForWords(targetWords);
                const finalRawOutput = await LucasService.generate((chunkText) => {
                    let pureText = chunkText;
                    pureText = pureText.replace(/^[\s\S]*?"essay_content"\s*:\s*"/i, "");
                    pureText = pureText.replace(/\\n/g, "\n");
                    pureText = pureText.replace(/\\"/g, '"');

                    const bibloIndex = pureText.indexOf('",\n  "bibliography":');
                    if (bibloIndex !== -1) {
                        pureText = pureText.substring(0, bibloIndex);
                    }
                    queueDisplayedText(pureText);
                });

                const parsed = extractGenerationResult(finalRawOutput);
                if (!parsed) {
                    setError("Failed to parse the generated essay. Model did not return valid JSON.");
                    setIsGenerating(false);
                    return;
                }

                if (!org.isTestMode) {
                    await CreditService.deductWordCreditsForWords(targetWords, {
                        idempotencyKey: CreditService.createDeductionKey(`generation:${targetWords}`),
                    });
                }
                Organizer.set({
                    generatedEssay: parsed.essay_content || "",
                    generatedBibliography: parsed.bibliography || "",
                });
                setIsGenerating(false);
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "An unknown error occurred during generation.");
                setIsGenerating(false);
            }
        };

        startGeneration();
    }, [onNext, org.isTestMode, org.generatedEssay, targetWords]);

    useEffect(() => {
        return () => {
            if (flushTimerRef.current !== null) {
                window.clearInterval(flushTimerRef.current);
                flushTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (isGenerating || error || hasNavigated.current || !isStreamSettled) {
            return;
        }

        hasNavigated.current = true;
        const timer = window.setTimeout(() => {
            onNext("preview");
        }, 900);

        return () => window.clearTimeout(timer);
    }, [error, isGenerating, isStreamSettled, onNext]);

    return (
        <div className={`flex h-full w-full flex-col items-center overflow-hidden px-6 pb-8 pt-20 lg:px-10 2xl:px-14 ${styles.generationShell}`}>

            <div className={`w-full ${styles.generationIntro}`}>
                {/* Pulsing Logo */}
                <div className={`relative mb-8 flex h-24 w-24 items-center justify-center ${styles.generationLogoWrap}`}>
                    <div className={`absolute inset-0 rounded-full bg-red-500/20 blur-[50px] transition-all duration-1000 ${isGenerating ? 'animate-pulse scale-150 opacity-100' : 'scale-100 opacity-0'}`} />
                    <Image
                        src="/OCTOPILOT.png"
                        alt="Octopilot Logo"
                        width={68}
                        height={68}
                        className={`relative z-10 rounded-full drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-transform duration-[3000ms] ${isGenerating ? 'scale-110' : 'scale-100'} ${styles.generationLogo}`}
                    />
                </div>

                {/* Title */}
                <h1 className={`mb-2 text-center text-[32px] font-bold tracking-tight text-white ${styles.generationTitle}`}>
                    {error ? "Generation Failed" : isGenerating ? "Crafting Your Essay" : "Generation Complete"}
                </h1>
                <p className={`mb-7 text-center text-[16px] text-white/50 ${styles.generationSubtitle}`}>
                    {error
                        ? "We encountered an issue while writing your essay."
                        : isGenerating
                            ? `Lucas is analyzing your ${org.manualSources.filter(s => s.status === "scraped").length} sources and writing...`
                            : "Preparing your preview..."}
                </p>

                {/* Progress Bar */}
                <div className={`mb-7 w-full max-w-xl ${styles.generationProgress}`}>
                    <div className={`mb-3 flex justify-between text-[13px] font-bold text-white/60 ${styles.generationProgressMeta}`}>
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
            </div>

            {/* Streaming UI Box */}
            <div className={`relative mb-4 w-full flex-1 overflow-hidden ${styles.generationStreamWrap}`}>
                <div
                    ref={scrollRef}
                    className={`relative z-10 mx-auto w-full text-white/80 ${styles.generationStream}`}
                    style={{
                        perspective: "900px",
                    }}
                >
                    <div
                        ref={crawlContentRef}
                        className={styles.generationStreamContent}
                        style={{
                            transform: `perspective(980px) rotateX(34deg) translateY(-${crawlOffset}px)`,
                        }}
                    >
                        {error ? (
                            <div className="py-10 text-center text-red-400">
                                <p className="mb-2 font-bold">Error Details:</p>
                                <p className="font-mono text-sm">{error}</p>
                                <button
                                    onClick={onBack}
                                    className="mt-6 rounded-full bg-white/10 px-6 py-2 text-sm font-bold text-white transition hover:bg-white/20"
                                >
                                    Try Again
                                </button>
                            </div>
                        ) : !isGenerating ? (
                            <div className="py-10 text-center">
                                <p className="mb-3 text-white/60">Preparing your preview...</p>
                                <button
                                    onClick={() => onNext("preview")}
                                    className="rounded-full bg-white/10 px-6 py-2 text-sm font-bold text-white transition hover:bg-white/20"
                                >
                                    Continue to Preview
                                </button>
                            </div>
                        ) : (
                            streamedText || <span className="animate-pulse text-white/30">Initializing neural pathways...</span>
                        )}

                        {isGenerating && !error && streamedText && (
                            <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-red-500 align-middle" />
                        )}
                    </div>
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
