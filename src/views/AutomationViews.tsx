import { AutomationStepId, automationStepSequence } from "@/components/StepperHeader";

interface PlaceholderViewProps {
    step: AutomationStepId;
    index: number;
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export function PlaceholderView({ step, index, onBack, onNext }: PlaceholderViewProps) {
    const stepName = automationStepSequence[index]?.label || step;

    return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pt-36">
            <h1 className="mb-6 text-3xl font-bold text-white">{stepName}</h1>
            <p className="mb-10 text-white/50">This view has not been implemented yet.</p>

            <div className="flex gap-4">
                <button
                    onClick={onBack}
                    className="rounded-full border border-white/20 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                    Go Back
                </button>

                {index < automationStepSequence.length - 1 && (
                    <button
                        onClick={() => {
                            const nextStepMaps: Record<number, AutomationStepId> = {
                                1: "essay-type",
                                2: "instructions",
                                3: "outlines",
                                4: "configuration",
                                5: "format",
                                6: "generation",
                                7: "preview",
                                8: "humanizer",
                                9: "editor",
                            };
                            onNext(nextStepMaps[index]);
                        }}
                        className="rounded-full bg-red-600 px-8 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(239,68,68,0.25)] transition hover:bg-red-500"
                    >
                        Continue Next Step
                    </button>
                )}
            </div>
        </div>
    );
}
