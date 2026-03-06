import { AutomationStepId } from "@/components/StepperHeader";

interface WritingStyleViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export default function WritingStyleView({ onNext }: WritingStyleViewProps) {
    return (
        <div className="flex w-full flex-1 flex-col items-center px-6 pt-36 lg:px-10 2xl:px-14">
            <h1 className="mb-3 text-center text-[40px] font-bold text-white">Let us know your writing style</h1>
            <p className="mb-14 text-center text-[17px] font-medium text-white/80">
                Upload a sample of your writing so we can understand your unique style
            </p>

            {/* Upload Box */}
            <div className="flex w-full flex-col items-center justify-center rounded-[24px] border border-white/[0.04] bg-white/[0.02] py-20 transition-colors hover:bg-white/[0.03]">
                <div className="mb-6 flex">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                </div>

                <h3 className="mb-2 text-[19px] font-bold text-white">Import your written essay in PDF format here</h3>
                <p className="text-[15px] font-medium text-white/50">Browse or drag and drop your PDF file</p>
            </div>

            {/* Let us learn — red pill button */}
            <button className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-full bg-red-500 px-8 py-3.5 text-[14px] font-semibold text-white shadow-[0_0_24px_rgba(239,68,68,0.3)] transition-all duration-200 hover:bg-red-400 hover:shadow-[0_0_32px_rgba(239,68,68,0.4)]">
                Let us learn
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
                </svg>
            </button>

            <button
                onClick={() => onNext("major-selection")}
                className="mt-6 text-[15px] font-semibold text-white/50 underline transition hover:text-white"
            >
                Skip this step
            </button>
        </div>
    );
}
