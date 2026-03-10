import { AutomationStepId } from "@/components/StepperHeader";
import { Organizer } from "@/services/OrganizerService";
import { FileReadService } from "@/services/FileReadService";
import { ZulyService } from "@/services/ZulyService";
import { useState } from "react";

interface WritingStyleViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export default function WritingStyleView({ onNext }: WritingStyleViewProps) {
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(Organizer.get().writingStyleFileName);
    const [isReading, setIsReading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (file: File | null) => {
        setError(null);
        if (!file) {
            setUploadedFile(null);
            setUploadedFileName(null);
            Organizer.set({
                writingStyleStatus: "not_started",
                writingStyleFileName: null,
                writingStyleExtractedText: "",
                writingStyleProfile: null,
            });
            return;
        }

        const validationError = FileReadService.validateFile(file);
        if (validationError) {
            setUploadedFile(null);
            setUploadedFileName(null);
            setError(validationError);
            return;
        }

        setUploadedFile(file);
        setUploadedFileName(file.name);
        Organizer.set({
            writingStyleStatus: "uploaded",
            writingStyleFileName: file.name,
        });
    };

    const handleLearn = async () => {
        if (!uploadedFile || isReading) {
            return;
        }

        setError(null);
        setIsReading(true);
        Organizer.set({
            writingStyleStatus: "reading",
            writingStyleFileName: uploadedFile.name,
        });

        try {
            const extractedText = await FileReadService.extractText(uploadedFile);
            const profile = await ZulyService.analyzeWritingStyle(uploadedFile.name, extractedText);

            Organizer.set({
                writingStyleStatus: "analyzed",
                writingStyleFileName: uploadedFile.name,
                writingStyleExtractedText: extractedText,
                writingStyleProfile: profile,
            });
            onNext("major-selection");
        } catch (readError) {
            Organizer.set({
                writingStyleStatus: "uploaded",
                writingStyleFileName: uploadedFile.name,
            });
            setError(readError instanceof Error ? readError.message : "Could not read the uploaded file.");
        } finally {
            setIsReading(false);
        }
    };

    return (
        <div className="flex w-full flex-1 flex-col items-center px-6 pt-36 lg:px-10 2xl:px-14">
            <div className="flex w-full max-w-[1240px] flex-col items-center">
                <h1 className="mb-3 text-center text-[40px] font-bold text-white">Let us know your writing style</h1>
                <p className="mb-14 text-center text-[17px] font-medium text-white/80">
                    Upload a sample of your writing so we can understand your unique style
                </p>

                {/* Upload Box */}
                <label className={`flex w-full flex-col items-center justify-center rounded-[24px] border border-white/[0.04] bg-white/[0.02] py-20 transition-colors ${isReading ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-white/[0.03]"}`}>
                    <input
                        type="file"
                        accept={FileReadService.getAcceptedTypes()}
                        className="hidden"
                        disabled={isReading}
                        onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            handleFileChange(file);
                        }}
                    />
                    <div className="mb-6 flex">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                    </div>

                    <h3 className="mb-2 text-[19px] font-bold text-white">Import one writing sample here</h3>
                    <p className="text-[15px] font-medium text-white/50">
                        {uploadedFileName ? uploadedFileName : `Browse one ${FileReadService.getSupportedTypeLabel()} file`}
                    </p>
                </label>
                <p className="mt-4 text-[13px] font-medium text-white/38">Only one file is allowed. One image or one PDF.</p>
                {error ? (
                    <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-300">
                        {error}
                    </div>
                ) : null}

                {/* Let us learn — red pill button */}
                <button
                    type="button"
                    disabled={!uploadedFile || isReading}
                    onClick={() => void handleLearn()}
                    className="mt-8 flex w-full max-w-[1380px] items-center justify-center gap-2.5 rounded-full bg-red-500 px-8 py-3.5 text-[14px] font-semibold text-white shadow-[0_0_24px_rgba(239,68,68,0.3)] transition-all duration-200 hover:bg-red-400 hover:shadow-[0_0_32px_rgba(239,68,68,0.4)] disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30 disabled:shadow-none"
                >
                    {isReading ? (
                        <>
                            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            Zuly is reading...
                        </>
                    ) : (
                        <>
                            Let us learn
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                                <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                                <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
                            </svg>
                        </>
                    )}
                </button>

                <button
                    disabled={isReading}
                    onClick={() => {
                        Organizer.set({
                            writingStyleStatus: "skipped",
                            writingStyleFileName: null,
                            writingStyleExtractedText: "",
                            writingStyleProfile: null,
                        });
                        onNext("major-selection");
                    }}
                    className="mt-6 text-[15px] font-semibold text-white/50 underline transition hover:text-white disabled:cursor-not-allowed disabled:text-white/20"
                >
                    Skip this step
                </button>
            </div>
        </div>
    );
}
