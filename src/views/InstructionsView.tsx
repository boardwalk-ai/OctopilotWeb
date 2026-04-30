"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AutomationStepId } from "@/components/StepperHeader";
import { AccountStateService } from "@/services/AccountStateService";
import { AuthService } from "@/services/AuthService";
import { FileReadService } from "@/services/FileReadService";
import { Organizer } from "@/services/OrganizerService";
import { HeinService } from "@/services/HeinService";
import { TestService } from "@/services/TestService";
import styles from "./InstructionsViewMobile.module.css";

interface InstructionsViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

const GREETINGS = [
    "What are we writing today",
    "What's the assignment",
    "Let's craft something great",
    "Ready when you are",
    "Tell me about your essay",
    "What would you like to write",
    "Hey, what are we working on",
    "Drop your instructions below",
    "What's on the syllabus today",
    "Let's get started",
];

function getGreeting(): string {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

export default function InstructionsView({ onBack, onNext }: InstructionsViewProps) {
    const [instructions, setInstructions] = useState(() => Organizer.get().instructionTextInput);
    const [imperfectMode, setImperfectMode] = useState(() => Organizer.get().imperfectModeEnabled);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accountPlan, setAccountPlan] = useState<string | null>(() => AccountStateService.read()?.plan ?? null);
    const [greeting] = useState(getGreeting);
    const [userName, setUserName] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isSubscriber = !!accountPlan && /(pro|premium)/i.test(accountPlan) && !/guest/i.test(accountPlan);
    const canSubmit = (instructions.trim().length > 0 || uploadedFile !== null) && !isAnalyzing;

    useEffect(() => {
        const user = AuthService.getCurrentUser();
        if (user?.displayName) {
            setUserName(user.displayName.split(" ")[0]);
        }
    }, []);

    useEffect(() => {
        if (TestService.isActive) setInstructions(TestService.getInstructions());
    }, []);

    useEffect(() => {
        return AccountStateService.subscribe((snapshot) => {
            setAccountPlan(snapshot?.plan ?? null);
        });
    }, []);

    useEffect(() => {
        if (!isSubscriber && imperfectMode) setImperfectMode(false);
    }, [imperfectMode, isSubscriber]);

    // Auto-grow textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    }, [instructions]);

    const handleFileChange = (file: File | null) => {
        setError(null);
        if (!file) { setUploadedFile(null); return; }
        const validationError = FileReadService.validateFile(file);
        if (validationError) { setUploadedFile(null); setError(validationError); return; }
        setUploadedFile(file);
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setError(null);
        setIsAnalyzing(true);
        try {
            const trimmedInstructions = instructions.trim();
            const hasText = trimmedInstructions.length > 0;
            const hasDocument = uploadedFile !== null;
            const extractedFileText = uploadedFile ? await FileReadService.extractText(uploadedFile) : "";
            const combinedInstructions = [
                hasText ? trimmedInstructions : "",
                extractedFileText ? `Uploaded File (${uploadedFile?.name || "document"}):\n${extractedFileText}` : "",
            ].filter(Boolean).join("\n\n");

            Organizer.set({
                instructionTextInput: trimmedInstructions,
                instructions: combinedInstructions,
                uploadedFileName: uploadedFile?.name || null,
                instructionFileName: uploadedFile?.name || null,
                instructionFileExtractedText: extractedFileText,
                instructionSource: hasText && hasDocument ? "text+document" : hasDocument ? "document" : "text",
                imperfectModeEnabled: isSubscriber ? imperfectMode : false,
            });

            await HeinService.analyze();
            onNext("outlines");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analysis failed");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
        }
    };

    return (
        <div className={`flex min-h-full w-full flex-col items-center justify-center px-4 pb-8 ${styles.instructionsShell}`}
            style={{ paddingTop: "calc(4.5rem + 48px)" }}
        >
            {/* Center column */}
            <div className="flex w-full max-w-2xl flex-col items-center gap-8">

                {/* Logo + Greeting */}
                <div className="flex flex-col items-center gap-4 text-center">
                    <Image
                        src="/OCTOPILOT.png"
                        alt="Octopilot"
                        width={56}
                        height={56}
                        className="opacity-90"
                    />
                    <h1 className="text-[28px] font-semibold tracking-tight text-white md:text-[32px]">
                        {greeting}
                        {userName && (
                            <span className="text-red-400">, {userName}</span>
                        )}
                        ?
                    </h1>
                </div>

                {/* Input card */}
                <div className="w-full rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur-sm">
                    <textarea
                        ref={textareaRef}
                        value={instructions}
                        disabled={isAnalyzing}
                        onChange={(e) => {
                            setInstructions(e.target.value);
                            Organizer.set({ instructionTextInput: e.target.value });
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Paste your assignment instructions, essay topic, or anything you need help writing…"
                        rows={4}
                        className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-white placeholder-white/25 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ minHeight: "96px", maxHeight: "320px" }}
                    />

                    {/* Attached file pill */}
                    {uploadedFile && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-400">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span className="flex-1 truncate text-[13px] text-red-300">{uploadedFile.name}</span>
                            <button
                                type="button"
                                onClick={() => setUploadedFile(null)}
                                className="text-white/30 transition hover:text-white/60"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6 6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {/* Bottom action row */}
                    <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {/* Attach file */}
                            <button
                                type="button"
                                disabled={isAnalyzing}
                                onClick={() => fileInputRef.current?.click()}
                                title="Attach document"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-not-allowed"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                </svg>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={FileReadService.getAcceptedTypes()}
                                className="hidden"
                                disabled={isAnalyzing}
                                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                            />

                            {/* Imperfect Mode pill */}
                            <button
                                type="button"
                                disabled={isAnalyzing || !isSubscriber}
                                onClick={() => { if (!isAnalyzing && isSubscriber) setImperfectMode(!imperfectMode); }}
                                title={isSubscriber ? "Toggle Imperfect Mode" : "Subscribers only"}
                                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${
                                    imperfectMode
                                        ? "border-red-500/50 bg-red-500/10 text-red-400"
                                        : isSubscriber
                                            ? "border-white/10 bg-transparent text-white/30 hover:border-white/20 hover:text-white/50"
                                            : "border-white/[0.05] bg-transparent text-white/15 cursor-not-allowed"
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${imperfectMode ? "bg-red-400" : "bg-white/20"}`} />
                                Imperfect Mode
                                {!isSubscriber && (
                                    <span className="ml-0.5 text-[9px] uppercase tracking-wider text-amber-400/60">Pro</span>
                                )}
                            </button>
                        </div>

                        {/* Send button */}
                        <button
                            type="button"
                            onClick={() => void handleSubmit()}
                            disabled={!canSubmit}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 ${
                                canSubmit
                                    ? "bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)] hover:bg-red-400"
                                    : "bg-white/[0.06] text-white/20 cursor-not-allowed"
                            }`}
                        >
                            {isAnalyzing ? (
                                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 19V5M5 12l7-7 7 7" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>

                {/* Hint */}
                <p className="text-center text-[12px] text-white/20">
                    Press <kbd className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-white/30">Enter</kbd> to analyze · <kbd className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-white/30">Shift+Enter</kbd> for new line
                </p>

                {/* Error */}
                {error && (
                    <div className="w-full rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-400">
                        {error}
                    </div>
                )}
            </div>

            {/* Back button — bottom left */}
            <button
                onClick={onBack}
                disabled={isAnalyzing}
                className="fixed bottom-6 left-6 flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-[13px] font-medium text-white/40 transition hover:border-white/15 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                </svg>
                Back
            </button>
        </div>
    );
}
