"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AutomationStepId } from "@/components/StepperHeader";
import { AccountStateService } from "@/services/AccountStateService";
import { AuthService } from "@/services/AuthService";
import { FileReadService } from "@/services/FileReadService";
import { Organizer } from "@/services/OrganizerService";
import { HeinService } from "@/services/HeinService";
import { RubricParserService } from "@/services/RubricParserService";
import { TestService } from "@/services/TestService";
import styles from "./InstructionsViewMobile.module.css";

interface InstructionsViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

const MAX_FILES = 3;

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

function isImageFile(file: File): boolean {
    return FileReadService.isImageFile(file);
}

function isPdfFile(file: File): boolean {
    return FileReadService.isPdfFile(file);
}

function getFileIcon(file: File) {
    if (isImageFile(file)) {
        return (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
            </svg>
        );
    }
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    );
}

export default function InstructionsView({ onBack, onNext }: InstructionsViewProps) {
    const [instructions, setInstructions] = useState(() => Organizer.get().instructionTextInput);
    const [imperfectMode, setImperfectMode] = useState(() => Organizer.get().imperfectModeEnabled);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [rubricFile, setRubricFile] = useState<File | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accountPlan, setAccountPlan] = useState<string | null>(() => AccountStateService.read()?.plan ?? null);
    const [greeting] = useState(getGreeting);
    const [userName, setUserName] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const rubricInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isSubscriber = !!accountPlan && /(pro|premium)/i.test(accountPlan) && !/guest/i.test(accountPlan);
    const canSubmit = (instructions.trim().length > 0 || uploadedFiles.length > 0) && !isAnalyzing;

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
        el.style.height = "0px";
        el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    }, [instructions]);

    const handleFilesAdded = (incoming: File[]) => {
        setError(null);
        const combined = [...uploadedFiles];
        for (const file of incoming) {
            if (combined.length >= MAX_FILES) {
                setError(`You can attach up to ${MAX_FILES} files.`);
                break;
            }
            const validationError = FileReadService.validateFile(file);
            if (validationError) { setError(validationError); continue; }
            const isDup = combined.some((f) => f.name === file.name && f.size === file.size);
            if (!isDup) combined.push(file);
        }
        setUploadedFiles(combined);
    };

    const removeFile = (index: number) => {
        setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleRubricFile = (file: File | null) => {
        setError(null);
        if (!file) { setRubricFile(null); return; }
        const err = FileReadService.validateFile(file);
        if (err) { setError(err); return; }
        setRubricFile(file);
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setError(null);
        setIsAnalyzing(true);
        try {
            const trimmedInstructions = instructions.trim();
            const hasText = trimmedInstructions.length > 0;
            const hasFiles = uploadedFiles.length > 0;

            // Process instruction files
            const extractedTexts: string[] = [];
            const imageDataUrls: string[] = [];

            for (const file of uploadedFiles) {
                if (isImageFile(file)) {
                    const dataUrl = await FileReadService.toDataUrl(file);
                    imageDataUrls.push(dataUrl);
                } else if (isPdfFile(file)) {
                    const text = await FileReadService.extractText(file);
                    if (text.trim()) extractedTexts.push(`Uploaded File (${file.name}):\n${text.trim()}`);
                } else {
                    try {
                        const text = await FileReadService.extractText(file);
                        if (text.trim()) extractedTexts.push(`Uploaded File (${file.name}):\n${text.trim()}`);
                    } catch { /* skip */ }
                }
            }

            const combinedInstructions = [
                hasText ? trimmedInstructions : "",
                ...extractedTexts,
            ].filter(Boolean).join("\n\n");

            const fileNames = uploadedFiles.map((f) => f.name);
            const source: "text" | "document" | "text+document" =
                hasText && hasFiles ? "text+document" : hasFiles ? "document" : "text";

            Organizer.set({
                instructionTextInput: trimmedInstructions,
                instructions: combinedInstructions,
                uploadedFileName: fileNames[0] ?? null,
                instructionFileName: fileNames[0] ?? null,
                instructionFileNames: fileNames,
                instructionFileExtractedText: extractedTexts.join("\n\n"),
                instructionImageDataUrls: imageDataUrls,
                instructionSource: source,
                imperfectModeEnabled: isSubscriber ? imperfectMode : false,
                rubricFileName: rubricFile?.name ?? null,
                rubricCriteria: null, // will be populated by parallel call
            });

            // Fire Hein + RubricParser in parallel
            const [heinResult, rubricResult] = await Promise.allSettled([
                HeinService.analyze(),
                rubricFile ? RubricParserService.parse(rubricFile) : Promise.resolve(null),
            ]);

            if (heinResult.status === "rejected") {
                throw heinResult.reason instanceof Error ? heinResult.reason : new Error("Analysis failed");
            }

            // Save rubric criteria if parsing succeeded (non-blocking — failure just means no rubric data)
            if (rubricResult.status === "fulfilled" && rubricResult.value) {
                Organizer.set({ rubricCriteria: rubricResult.value });
            } else if (rubricResult.status === "rejected") {
                console.warn("[InstructionsView] Rubric parsing failed (non-fatal):", rubricResult.reason);
            }

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
                        rows={1}
                        className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-white placeholder-white/25 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ maxHeight: "320px", overflowY: "hidden" }}
                    />

                    {/* Instruction file pills */}
                    {uploadedFiles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {uploadedFiles.map((file, idx) => (
                                <div
                                    key={`${file.name}-${file.size}-${idx}`}
                                    className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5 max-w-[200px]"
                                >
                                    <span className="shrink-0 text-red-400">{getFileIcon(file)}</span>
                                    <span className="truncate text-[12px] text-red-300 leading-none" title={file.name}>
                                        {file.name}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeFile(idx)}
                                        disabled={isAnalyzing}
                                        className="shrink-0 ml-0.5 text-white/25 transition hover:text-white/60 disabled:cursor-not-allowed"
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 6 6 18M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Rubric file pill */}
                    {rubricFile && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            <div className="flex items-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/[0.07] px-2.5 py-1.5 max-w-[220px]">
                                {/* Upload icon */}
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-violet-400">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/70 leading-none">Rubric</span>
                                <span className="truncate text-[12px] text-violet-300 leading-none" title={rubricFile.name}>
                                    {rubricFile.name}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setRubricFile(null)}
                                    disabled={isAnalyzing}
                                    className="shrink-0 ml-0.5 text-white/25 transition hover:text-white/60 disabled:cursor-not-allowed"
                                >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Bottom action row */}
                    <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {/* Attach instruction file */}
                            <button
                                type="button"
                                disabled={isAnalyzing || uploadedFiles.length >= MAX_FILES}
                                onClick={() => fileInputRef.current?.click()}
                                title={uploadedFiles.length >= MAX_FILES ? `Max ${MAX_FILES} files` : "Attach document or image"}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                </svg>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={FileReadService.getAcceptedTypes()}
                                multiple
                                className="hidden"
                                disabled={isAnalyzing}
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        handleFilesAdded(Array.from(e.target.files));
                                    }
                                    e.target.value = "";
                                }}
                            />

                            {/* Attach rubric */}
                            <button
                                type="button"
                                disabled={isAnalyzing}
                                onClick={() => rubricInputRef.current?.click()}
                                title={rubricFile ? `Rubric: ${rubricFile.name}` : "Attach rubric document"}
                                className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition ${
                                    rubricFile
                                        ? "text-violet-400 hover:bg-violet-500/10"
                                        : "text-white/30 hover:bg-white/[0.06] hover:text-white/60"
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                Rubric
                            </button>
                            <input
                                ref={rubricInputRef}
                                type="file"
                                accept={FileReadService.getAcceptedTypes()}
                                className="hidden"
                                disabled={isAnalyzing}
                                onChange={(e) => {
                                    handleRubricFile(e.target.files?.[0] ?? null);
                                    e.target.value = "";
                                }}
                            />

                            {/* File count badge */}
                            {uploadedFiles.length > 0 && (
                                <span className="text-[11px] text-white/30 tabular-nums">
                                    {uploadedFiles.length}/{MAX_FILES}
                                </span>
                            )}

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
                    Press <kbd className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-white/30">Enter</kbd> to analyze · <kbd className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-white/30">Shift+Enter</kbd> for new line · Up to {MAX_FILES} files
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
