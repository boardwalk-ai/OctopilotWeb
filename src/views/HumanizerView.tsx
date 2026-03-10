"use client";

import { useEffect, useRef, useState } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { CreditService } from "@/services/CreditService";
import { Organizer } from "@/services/OrganizerService";
import { HumanizerService } from "@/services/HumanizerService";

interface HumanizerViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

type HumanizerOption = "stealthgpt" | "undetectable";

const CustomSelect = ({
    options,
    value,
    onChange,
    disabled,
    engine
}: {
    options: string[],
    value: string,
    onChange: (val: string) => void,
    disabled: boolean,
    engine: "stealthgpt" | "undetectable"
}) => {
    const [isOpen, setIsOpen] = useState(false);

    // Using blue highlight for options to exactly match the provided design
    const highlightBg = "bg-[#2563eb]";
    const ringColor = engine === "stealthgpt" ? "ring-[#a855f7]/50" : "ring-[#3b82f6]/50";

    return (
        <div className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={`w-full flex items-center justify-between rounded-[8px] border border-white/10 bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] px-3 py-2.5 text-[14px] font-medium text-white shadow-inner transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/20'} ${isOpen && !disabled ? `ring-2 ${ringColor} border-transparent` : ''}`}
            >
                {value}
                <div className="flex flex-col items-center justify-center gap-[2px] opacity-60">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m18 15-6-6-6 6" /></svg>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m6 9 6 6 6-6" /></svg>
                </div>
            </button>
            {isOpen && !disabled && (
                <>
                    <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
                    <div className="absolute top-full mt-1.5 w-full z-20 overflow-hidden rounded-[8px] border border-white/10 bg-[#222222] shadow-[0_10px_40px_rgba(0,0,0,0.8)] py-1">
                        {options.map((opt) => (
                            <div
                                key={opt}
                                onClick={(e) => { e.stopPropagation(); onChange(opt); setIsOpen(false); }}
                                className={`cursor-pointer px-3 py-2 text-[13px] font-medium transition-colors flex items-center gap-2 ${value === opt ? `${highlightBg} text-white` : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                            >
                                <div className="w-4 flex justify-center">
                                    {value === opt && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                                </div>
                                <span>{opt}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default function HumanizerView({ onBack, onNext }: HumanizerViewProps) {
    const org = useOrganizer();
    const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

    // Core States
    const [selectedAIEngine, setSelectedAIEngine] = useState<HumanizerOption>("undetectable");
    const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
    const [textEditable, setTextEditable] = useState(org.generatedEssay || "");
    const [isHumanizing, setIsHumanizing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
    const isHumanizingRef = useRef(false);

    // StealthGPT States
    const [stealthParams, setStealthParams] = useState({
        educationLevel: "Standard",
        strength: "Medium",
        detector: "GPTZero",
        rephrase: false
    });

    // Undetectable AI States
    const [undetectableParams, setUndetectableParams] = useState({
        readability: "University",
        purpose: "Essay",
        strength: "More Human"
    });

    const handleHumanize = async () => {
        if (isHumanizingRef.current) return;
        if (!textEditable.trim()) return;
        isHumanizingRef.current = true;
        setIsHumanizing(true);
        setError(null);

        try {
            const beforeWordCount = CreditService.countWords(textEditable);
            if (!org.isTestMode) {
                const selectedWords = typeof org.wordCount === "number" ? org.wordCount : CreditService.countWords(textEditable);
                await CreditService.ensureSufficientHumanizerCreditsForWords(selectedWords);
            }

            let resultText = "";
            if (selectedAIEngine === "stealthgpt") {
                resultText = await HumanizerService.stealthGPT({
                    prompt: textEditable,
                    rephrase: stealthParams.rephrase,
                    educationLevel: stealthParams.educationLevel,
                    strength: stealthParams.strength,
                    detector: stealthParams.detector
                });
            } else {
                resultText = await HumanizerService.undetectableAI({
                    content: textEditable,
                    readability: undetectableParams.readability,
                    purpose: undetectableParams.purpose,
                    strength: undetectableParams.strength
                });
            }

            if (!org.isTestMode) {
                const selectedWords = typeof org.wordCount === "number" ? org.wordCount : CreditService.countWords(textEditable);
                await CreditService.deductHumanizerCreditsForWords(selectedWords, {
                    idempotencyKey: CreditService.createDeductionKey(`humanizer:${selectedWords}`),
                });
            }

            setTextEditable(resultText);
            Organizer.set({
                generatedEssay: resultText,
                isHumanized: true,
                humanizeBeforeWordCount: beforeWordCount,
                humanizeAfterWordCount: CreditService.countWords(resultText),
            });
        } catch (err: unknown) {
            console.error("Humanizing Error:", err);
            setError(err instanceof Error ? err.message : "Failed to humanize text.");
        } finally {
            isHumanizingRef.current = false;
            setIsHumanizing(false);
        }
    };

    const handleGoToEditor = () => {
        if (!disclaimerAccepted) return;
        Organizer.set({ generatedEssay: textEditable });
        onNext("editor");
    };

    const handleSelectAll = () => {
        const area = textAreaRef.current;
        if (!area) return;
        area.focus();
        area.select();
        setClipboardNotice("All text selected.");
    };

    const handleCopy = async () => {
        if (!textEditable.trim()) return;

        try {
            await navigator.clipboard.writeText(textEditable);
            setClipboardNotice("Essay copied to clipboard.");
        } catch {
            const area = textAreaRef.current;
            if (!area) return;
            area.focus();
            area.select();
            document.execCommand("copy");
            setClipboardNotice("Essay copied to clipboard.");
        }
    };

    useEffect(() => {
        if (!clipboardNotice) return undefined;
        const timer = window.setTimeout(() => setClipboardNotice(null), 2200);
        return () => window.clearTimeout(timer);
    }, [clipboardNotice]);

    return (
        <div className="flex w-full flex-col px-6 pt-32 pb-8 min-h-full relative lg:px-10 2xl:px-14">

            {/* Absolute Spinner Overlay */}
            {isHumanizing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,4,6,0.82)] backdrop-blur-xl">
                    <div className="relative w-full max-w-[520px] overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,24,0.96),rgba(8,8,10,0.98))] px-8 py-9 shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                        <div className="pointer-events-none absolute -top-20 right-[-10%] h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" />
                        <div className="pointer-events-none absolute -bottom-24 left-[-5%] h-44 w-44 rounded-full bg-red-500/10 blur-3xl" />

                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                            <div className="relative flex h-14 w-14 items-center justify-center">
                                <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-white border-r-blue-400/80" />
                                <div className="absolute inset-[8px] rounded-full bg-white/[0.03]" />
                                <svg className="relative h-5 w-5 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                    <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z" />
                                </svg>
                            </div>
                        </div>

                        <div className="mt-7 text-center">
                            <h2 className="text-[26px] font-bold tracking-tight text-white">
                                {selectedAIEngine === "stealthgpt" ? "StealthGPT" : "Undetectable AI"} is refining your draft
                            </h2>
                            <p className="mx-auto mt-3 max-w-[360px] text-[14px] leading-6 text-white/58">
                                Reworking sentence flow, smoothing phrasing, and pushing the essay toward a more natural human voice.
                            </p>
                        </div>

                        <div className="mt-7 rounded-full border border-white/10 bg-white/[0.03] p-1">
                            <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]">
                                <div className="h-full w-1/2 animate-[pulse_1.8s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-400 via-white to-red-400" />
                            </div>
                        </div>

                        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                            Processing
                        </div>
                    </div>
                </div>
            )}

            {/* Header section */}
            <div className="flex w-full items-start justify-between mb-2">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-[14px] font-bold text-white/50 transition hover:text-white"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    Back to home
                </button>

                <div className="flex flex-col items-end">
                    <button
                        onClick={handleGoToEditor}
                        disabled={!disclaimerAccepted}
                        className={`flex flex-col items-center gap-2 text-[14px] font-bold transition ${disclaimerAccepted ? 'text-white hover:text-red-400' : 'text-white/20 cursor-not-allowed'}`}
                    >
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </div>
                        Go to Editor
                    </button>
                </div>
            </div>

            {/* Umbrella Title */}
            <div className="flex flex-col items-center justify-center mb-10">
                <svg className="h-12 w-12 text-red-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12A10 10 0 0 0 2 12" /><path d="M12 12v10" /><path d="M12 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /><path d="M2 12h20" /><path d="M12 2A10 10 0 0 0 2 12" /><path d="M12 2A10 10 0 0 1 22 12" /></svg>
                <h1 className="text-[36px] font-black tracking-wider text-red-500 uppercase mb-2">
                    Humanizer Umbrella
                </h1>
                <p className="text-[18px] text-white/60 mb-6">
                    Make your essay undetectable by AI detection tools
                </p>
                <div className="flex items-center gap-3 text-[14px] font-bold text-white/50">
                    Current Humanizer:
                    <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-white">
                        <div className={`h-2 w-2 rounded-full ${selectedAIEngine === "stealthgpt" ? "bg-red-500" : "bg-blue-500"}`} />
                        {selectedAIEngine === "stealthgpt" ? "StealthGPT" : "Undetectable AI"}
                    </span>
                </div>
            </div>

            {/* Disclaimer Box */}
            <div className="mb-8 w-full rounded-[20px] border border-white/[0.08] bg-[#0f0f0f] p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500">
                        <span className="text-white font-black text-sm">!</span>
                    </div>
                    <h2 className="text-[18px] font-bold text-white">Important Disclaimer</h2>
                </div>
                <p className="text-[14px] leading-relaxed text-white/60 mb-6 font-medium">
                    By using this AI humanizer, you acknowledge that the generated content is for educational purposes only. Please ensure compliance with your institution&apos;s academic integrity policies.
                </p>
                <div className="flex items-center gap-4 border-t border-white/[0.05] pt-4">
                    <span className="text-[15px] font-bold text-white">I understand and accept these terms</span>
                    <button
                        onClick={() => setDisclaimerAccepted(!disclaimerAccepted)}
                        className={`relative flex h-6 w-12 cursor-pointer items-center rounded-full transition-colors ${disclaimerAccepted ? 'bg-red-500' : 'bg-white/20'}`}
                    >
                        <div className={`absolute h-5 w-5 rounded-full bg-white transition-transform ${disclaimerAccepted ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>

            {/* Engine Settings Container */}
            <div className="mb-8 w-full rounded-[20px] border border-white/[0.08] bg-[#0a0a0a] p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500"><path d="m15.5 8.5-7 7M15.5 15.5l-7-7" /><circle cx="12" cy="12" r="10" /></svg>
                    <h2 className="text-[20px] font-bold text-white">AI Humanizer</h2>
                </div>
                <p className="text-[14px] text-white/40 mb-8 font-medium">Select a humanizer and configure its settings</p>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

                    {/* Undetectable AI Card */}
                    <div
                        onClick={() => setSelectedAIEngine("undetectable")}
                        className={`cursor-pointer rounded-[20px] border-2 p-6 transition-all ${selectedAIEngine === "undetectable" ? "border-blue-500 bg-white/[0.02]" : "border-white/[0.04] bg-transparent opacity-50 hover:opacity-80"}`}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-3 w-3 rounded-full bg-[#3b82f6]" />
                            <h3 className="text-[18px] font-bold text-white">Undetectable AI</h3>
                            <span className="rounded-full bg-orange-500/20 px-3 py-1 text-[11px] font-bold text-orange-400">Recommended</span>
                        </div>

                        <div className="flex flex-col gap-5">
                            <div>
                                <label className="mb-2 block text-[13px] font-bold text-white/80">Readability</label>
                                <CustomSelect
                                    engine="undetectable"
                                    disabled={selectedAIEngine !== "undetectable"}
                                    value={undetectableParams.readability}
                                    onChange={(val) => setUndetectableParams({ ...undetectableParams, readability: val })}
                                    options={["High School", "University", "Doctorate"]}
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[13px] font-bold text-white/80">Purpose</label>
                                <CustomSelect
                                    engine="undetectable"
                                    disabled={selectedAIEngine !== "undetectable"}
                                    value={undetectableParams.purpose}
                                    onChange={(val) => setUndetectableParams({ ...undetectableParams, purpose: val })}
                                    options={["Essay", "Article", "Marketing"]}
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[13px] font-bold text-white/80">Strength</label>
                                <CustomSelect
                                    engine="undetectable"
                                    disabled={selectedAIEngine !== "undetectable"}
                                    value={undetectableParams.strength}
                                    onChange={(val) => setUndetectableParams({ ...undetectableParams, strength: val })}
                                    options={["Quality", "Balance", "More Human"]}
                                />
                            </div>
                        </div>
                    </div>

                    {/* StealthGPT Card */}
                    <div
                        onClick={() => setSelectedAIEngine("stealthgpt")}
                        className={`cursor-pointer rounded-[20px] border-2 p-6 transition-all ${selectedAIEngine === "stealthgpt" ? "border-[#a855f7] bg-white/[0.02]" : "border-white/[0.04] bg-transparent opacity-50 hover:opacity-80"}`}
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-3 w-3 rounded-full bg-[#a855f7]" />
                            <h3 className="text-[18px] font-bold text-white">StealthGPT</h3>
                        </div>

                        <div className="flex flex-col gap-5">
                            <div>
                                <label className="mb-2 block text-[13px] font-bold text-white/80">Education Level</label>
                                <CustomSelect
                                    engine="stealthgpt"
                                    disabled={selectedAIEngine !== "stealthgpt"}
                                    value={stealthParams.educationLevel}
                                    onChange={(val) => setStealthParams({ ...stealthParams, educationLevel: val })}
                                    options={["Standard", "High School", "College", "PHD"]}
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[13px] font-bold text-white/80">Strength</label>
                                <CustomSelect
                                    engine="stealthgpt"
                                    disabled={selectedAIEngine !== "stealthgpt"}
                                    value={stealthParams.strength}
                                    onChange={(val) => setStealthParams({ ...stealthParams, strength: val })}
                                    options={["Low", "Medium", "High"]}
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-[13px] font-bold text-white/80">Detector</label>
                                <CustomSelect
                                    engine="stealthgpt"
                                    disabled={selectedAIEngine !== "stealthgpt"}
                                    value={stealthParams.detector}
                                    onChange={(val) => setStealthParams({ ...stealthParams, detector: val })}
                                    options={["Turnitin", "GPTZero"]}
                                />
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <label className="text-[13px] font-bold text-white/80">Rephrase</label>
                                <button
                                    disabled={selectedAIEngine !== "stealthgpt"}
                                    onClick={(e) => { e.stopPropagation(); setStealthParams({ ...stealthParams, rephrase: !stealthParams.rephrase }) }}
                                    className={`relative flex h-6 w-12 items-center rounded-full transition-colors ${stealthParams.rephrase ? 'bg-orange-500' : 'bg-white/20'}`}
                                >
                                    <div className={`absolute h-5 w-5 rounded-full bg-white transition-transform ${stealthParams.rephrase ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-8 w-full rounded-xl bg-red-500/10 p-4 border border-red-500/20 text-red-500 font-bold text-[14px]">
                    ⚠️ {error}
                </div>
            )}

            {/* Essay Editor Section */}
            <div className={`mb-12 w-full rounded-[24px] border border-white/[0.08] bg-[#0a0a0a] p-8 shadow-sm transition-all duration-300 ${selectedAIEngine === "stealthgpt" ? 'shadow-[0_0_40px_rgba(168,85,247,0.1)]' : 'shadow-[0_0_40px_rgba(59,130,246,0.1)]'}`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        <div>
                            <h2 className="text-[18px] font-bold text-white tracking-tight">Essay Content</h2>
                            <p className="text-[14px] text-white/50">Edit and refine your essay content</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[20px] font-black text-white">{textEditable.split(/\s+/).filter(w => w.length > 0).length}</span>
                        <span className="text-[12px] font-bold text-white/40 uppercase tracking-widest">words</span>
                    </div>
                </div>

                <div className="mb-6 rounded-xl border border-[#ca8a04]/30 bg-[#ca8a04]/10 p-4 flex gap-3 text-[#eab308]">
                    <span className="font-bold">⚠️</span>
                    <p className="text-[13px] font-medium">Essay content generated by AI may contain unwanted metacommentary texts. Please edit and remove these lines before you humanize, to get the best quality humanizing experience</p>
                </div>

                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={handleHumanize}
                        className={`flex items-center gap-2 rounded-full px-8 py-3 text-[14px] font-bold text-white transition-all shadow-lg ${selectedAIEngine === "stealthgpt" ? 'bg-gradient-to-r from-purple-600 to-purple-800 hover:shadow-purple-500/50' : 'bg-gradient-to-r from-blue-600 to-blue-800 hover:shadow-blue-500/50'}`}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" /></svg>
                        Humanize Essay
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="rounded-full border border-white/20 bg-transparent px-6 py-2 text-[13px] font-bold text-white/70 hover:bg-white/5 hover:text-white"
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleCopy()}
                            className="rounded-full border border-white/20 bg-transparent px-6 py-2 text-[13px] font-bold text-white/70 hover:bg-white/5 hover:text-white"
                        >
                            Copy
                        </button>
                    </div>
                </div>

                {clipboardNotice && (
                    <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[13px] font-semibold text-emerald-300">
                        {clipboardNotice}
                    </div>
                )}

                <div className={`w-full rounded-[24px] border border-white/10 p-6 bg-black transition-all duration-500 ${selectedAIEngine === "stealthgpt" ? 'shadow-[inset_0_0_30px_rgba(168,85,247,0.15)] focus-within:border-purple-500/50' : 'shadow-[inset_0_0_30px_rgba(59,130,246,0.15)] focus-within:border-blue-500/50'}`}>
                    <textarea
                        ref={textAreaRef}
                        value={textEditable}
                        onChange={(e) => setTextEditable(e.target.value)}
                        className="w-full min-h-[400px] bg-transparent text-[16px] leading-[1.8] text-white/90 outline-none resize-none"
                    />
                </div>
            </div>

            <div className="mt-auto pt-6 pb-2 flex items-center gap-2 text-[13px] font-medium text-white/40 justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                On the next page, Editor View, you can see a preview of your submission-ready essay.
            </div>

        </div>
    );
}
