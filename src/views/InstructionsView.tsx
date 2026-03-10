"use client";

import React, { useRef, useState } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import { AccountStateService } from "@/services/AccountStateService";
import { FileReadService } from "@/services/FileReadService";
import { Organizer } from "@/services/OrganizerService";
import { HeinService } from "@/services/HeinService";
import { TestService } from "@/services/TestService";

interface InstructionsViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export default function InstructionsView({ onBack, onNext }: InstructionsViewProps) {
    const [instructions, setInstructions] = useState(() => Organizer.get().instructionTextInput);
    const [imperfectMode, setImperfectMode] = useState(() => Organizer.get().imperfectModeEnabled);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accountPlan, setAccountPlan] = useState<string | null>(() => AccountStateService.read()?.plan ?? null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isSubscriber = !!accountPlan && /(pro|premium)/i.test(accountPlan) && !/guest/i.test(accountPlan);

    // Test Mode Autofill
    React.useEffect(() => {
        if (TestService.isActive) {
            setInstructions(TestService.getInstructions());
        }
    }, []);

    React.useEffect(() => {
        return AccountStateService.subscribe((snapshot) => {
            setAccountPlan(snapshot?.plan ?? null);
        });
    }, []);

    React.useEffect(() => {
        if (!isSubscriber && imperfectMode) {
            setImperfectMode(false);
        }
    }, [imperfectMode, isSubscriber]);

    const canRead = instructions.trim().length > 0 || uploadedFile !== null;

    const handleFileChange = (file: File | null) => {
        setError(null);
        if (!file) {
            setUploadedFile(null);
            return;
        }

        const validationError = FileReadService.validateFile(file);
        if (validationError) {
            setUploadedFile(null);
            setError(validationError);
            return;
        }

        setUploadedFile(file);
    };

    const handleRead = async () => {
        if (!canRead || isAnalyzing) return;

        setError(null);
        setIsAnalyzing(true);

        try {
            const trimmedInstructions = instructions.trim();
            const hasText = trimmedInstructions.length > 0;
            const hasDocument = uploadedFile !== null;
            const extractedFileText = uploadedFile ? await FileReadService.extractText(uploadedFile) : "";
            const combinedInstructions = [
                hasText ? trimmedInstructions : "",
                extractedFileText
                    ? `Uploaded File (${uploadedFile?.name || "document"}):\n${extractedFileText}`
                    : "",
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

    return (
        <div className="flex min-h-full w-full flex-col px-6 pt-32 pb-[100px] lg:px-10 2xl:px-14">
            {/* Title row with Imperfect Mode toggle */}
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-[36px] font-bold text-white">
                        Give us your assignment instructions
                    </h1>
                    <p className="mt-1 text-[16px] text-white/50">
                        Provide your assignment details so we can create the perfect essay outline
                    </p>
                </div>

                {/* Imperfect Mode Toggle */}
                <button
                    onClick={() => {
                        if (!isAnalyzing && isSubscriber) {
                            setImperfectMode(!imperfectMode);
                        }
                    }}
                    disabled={isAnalyzing || !isSubscriber}
                    className={`ml-6 mt-1 flex shrink-0 items-center gap-3 rounded-full border px-5 py-3 text-left transition-all duration-300 ${imperfectMode
                        ? "border-red-500/60 bg-red-500/[0.12]"
                        : "border-red-500/30 bg-red-500/[0.04] hover:border-red-500/50 hover:bg-red-500/[0.08]"
                        }`}
                >
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="block text-[14px] font-bold text-white">Imperfect Mode</span>
                            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
                                Only Subscribers
                            </span>
                        </div>
                        <span className="block text-[12px] text-white/40">Feed writing styles into AI</span>
                    </div>
                    {/* Toggle switch */}
                    <div className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors duration-300 ${imperfectMode ? "bg-red-500" : "bg-white/15"}`}>
                        <div className={`absolute top-[3px] h-[16px] w-[16px] rounded-full bg-white shadow-md transition-transform duration-300 ${imperfectMode ? "translate-x-[21px]" : "translate-x-[3px]"}`} />
                    </div>
                </button>
            </div>

            {/* Content — fills remaining space, no scroll */}
            <div className="flex flex-1 flex-col gap-0">
                {/* Textarea */}
                <textarea
                    value={instructions}
                    disabled={isAnalyzing}
                    onChange={(e) => {
                        setInstructions(e.target.value);
                        Organizer.set({ instructionTextInput: e.target.value });
                    }}
                    placeholder="Type your assignment instructions here..."
                    className="min-h-[140px] flex-[2] w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-[15px] leading-relaxed text-white placeholder-white/25 outline-none transition focus:border-white/15 focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                />

                {/* "or" divider */}
                <div className="flex items-center justify-center py-4">
                    <span className="text-[14px] font-medium text-white/30">or</span>
                </div>

                {/* Upload area */}
                <div
                    onClick={() => {
                        if (!isAnalyzing) {
                            fileInputRef.current?.click();
                        }
                    }}
                    className={`flex flex-[2] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 transition-all duration-200 ${uploadedFile
                        ? "border-red-500/30 bg-red-500/[0.04]"
                        : "border-white/[0.08] bg-white/[0.01] hover:border-white/15 hover:bg-white/[0.03]"
                        } ${isAnalyzing ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={FileReadService.getAcceptedTypes()}
                        className="hidden"
                        disabled={isAnalyzing}
                        onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            handleFileChange(file);
                        }}
                    />
                    {/* Upload icon */}
                    <svg
                        className="mb-3 text-red-500"
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="M12 18v-6" />
                        <path d="m9 15 3-3 3 3" />
                    </svg>
                    {uploadedFile ? (
                        <>
                            <p className="text-[15px] font-semibold text-red-400">
                                {uploadedFile.name}
                            </p>
                            <p className="mt-1 text-[13px] text-white/40">
                                Click to change file
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-[15px] font-semibold text-white">
                                Upload your instruction document
                            </p>
                            <p className="mt-1 text-[13px] text-white/40">
                                One file only. {FileReadService.getSupportedTypeLabel()}
                            </p>
                        </>
                    )}
                </div>

            </div>

            {/* Fixed Bottom Action Bar — Back + Read */}
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[#0a0a0a]/95 px-5 backdrop-blur-md">
                <div className="flex w-full items-center justify-between gap-4 py-5">
                    <button
                        onClick={onBack}
                        disabled={isAnalyzing}
                        className="ml-20 flex min-w-[148px] items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-7 py-3.5 text-[14px] font-semibold text-white/70 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 md:ml-24"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back
                    </button>

                    <button
                        onClick={handleRead}
                        disabled={isAnalyzing || (!instructions.trim() && !uploadedFile)}
                        className={`group relative flex min-w-[250px] max-w-[460px] items-center justify-center gap-2 overflow-hidden rounded-full px-9 py-3.5 text-[14px] font-semibold transition-all duration-300 ${isAnalyzing || (!instructions.trim() && !uploadedFile)
                            ? "bg-white/[0.04] text-white/30 cursor-not-allowed"
                            : "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:bg-red-400"
                            }`}
                    >
                        {isAnalyzing ? (
                            <div className="flex items-center gap-2">
                                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                <span>Reading instructions...</span>
                            </div>
                        ) : (
                            <>
                                <span>Read</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                </svg>
                            </>
                        )}
                        {!isAnalyzing && (instructions.trim() || uploadedFile) && (
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out" />
                        )}
                    </button>
                    {error && (
                        <div className="absolute bottom-full left-1/2 mb-4 -translate-x-1/2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-[13px] text-red-400">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
