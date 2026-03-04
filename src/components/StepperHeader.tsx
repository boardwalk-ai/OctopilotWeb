"use client";

import { useRef, useEffect, useState } from "react";

export const automationSteps = [
    "Writing Style",
    "Major Selection",
    "Essay Type",
    "Instructions",
    "Outlines",
    "Configuration",
    "Format",
    "Generation",
    "Preview",
    "Humanizer",
    "Editor",
    "Export",
];

export type AutomationStepId =
    | "writing-style"
    | "major-selection"
    | "essay-type"
    | "instructions"
    | "outlines"
    | "configuration"
    | "format"
    | "generation"
    | "preview"
    | "humanizer"
    | "editor"
    | "export";

interface StepperHeaderProps {
    currentStepIndex: number;
    skipFormat?: boolean;
    className?: string;
    writingMode?: "automation" | "manual";
    progressOnly?: boolean;
}

export default function StepperHeader({
    currentStepIndex,
    skipFormat = false,
    className = "",
    writingMode = "automation",
    progressOnly = false,
}: StepperHeaderProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const stepRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const [offset, setOffset] = useState(0);
    const hasInitialized = useRef(false);
    const [enableTransition, setEnableTransition] = useState(false);

    // Filter out "Format" when skipFormat is true
    const baseSteps = skipFormat
        ? automationSteps.filter(s => s !== "Format")
        : automationSteps;
    const displaySteps = baseSteps.map((step) =>
        writingMode === "manual" && step === "Generation" ? "Writing Chamber" : step
    );
    const displayStepsKey = displaySteps.join("|");

    // Adjust the current step index if Format is removed and index is past it
    const adjustedIndex = skipFormat && currentStepIndex > 5
        ? currentStepIndex - 1
        : currentStepIndex;

    // Calculate the translateX needed to center the active step
    useEffect(() => {
        const container = containerRef.current;
        const activeEl = stepRefs.current[adjustedIndex];
        if (!container || !activeEl) return;

        // Wait a tick for layout
        requestAnimationFrame(() => {
            const containerWidth = container.offsetWidth;
            const activeLeft = activeEl.offsetLeft;
            const activeWidth = activeEl.offsetWidth;
            const activeCenterX = activeLeft + activeWidth / 2;

            setOffset(containerWidth / 2 - activeCenterX);

            // After the first (instant) positioning, enable transitions for future changes
            if (!hasInitialized.current) {
                hasInitialized.current = true;
                // Enable transitions after a brief delay so the initial position is painted first
                requestAnimationFrame(() => {
                    setEnableTransition(true);
                });
            }
        });
    }, [adjustedIndex, displayStepsKey]);

    return (
        <div
            className={`fixed top-16 left-0 right-0 z-30 ${progressOnly ? "border-b-0 bg-transparent backdrop-blur-none" : "border-b border-white/[0.06] bg-[#0d0d0d] backdrop-blur-md"} ${className}`}
        >
            {!progressOnly && (
                <div className="flex flex-col items-center justify-center overflow-hidden py-2.5">
                    {/* Container for the sliding strip */}
                    <div ref={containerRef} className="relative w-full overflow-hidden">
                        <div
                            className="flex items-center w-max"
                            style={{
                                transform: `translateX(${offset}px)`,
                                transition: enableTransition
                                    ? "transform 1.4s cubic-bezier(0.16, 1, 0.3, 1)"
                                    : "none",
                                willChange: "transform",
                            }}
                        >
                            {displaySteps.map((step, index) => {
                                const isCurrent = index === adjustedIndex;
                                const isPast = index < adjustedIndex;
                                const isLast = index === displaySteps.length - 1;
                                const isArrowLit = index < adjustedIndex;

                                return (
                                    <span
                                        key={step}
                                        className="flex shrink-0 items-center"
                                    >
                                        <span
                                            ref={(el) => { stepRefs.current[index] = el; }}
                                            className="whitespace-nowrap font-bold uppercase tracking-wider md:text-[11px] text-[10.5px]"
                                            style={{
                                                color: isCurrent
                                                    ? "#ef4444"
                                                    : isPast
                                                        ? "rgba(239, 68, 68, 0.45)"
                                                        : "rgba(255, 255, 255, 0.16)",
                                                transform: isCurrent ? "scale(1.1)" : "scale(1)",
                                                transition: "color 1.4s cubic-bezier(0.16, 1, 0.3, 1), transform 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
                                                willChange: "color, transform",
                                            }}
                                        >
                                            {step}
                                        </span>
                                        {!isLast && (
                                            <span
                                                className="mx-2 text-[8px] font-bold"
                                                style={{
                                                    color: isArrowLit
                                                        ? "rgba(239, 68, 68, 0.35)"
                                                        : "rgba(255, 255, 255, 0.06)",
                                                    transition: "color 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
                                                }}
                                            >
                                                {">>>"}
                                            </span>
                                        )}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* Sub label */}
                    <div
                        className="mt-1 text-[9px] uppercase tracking-[0.15em]"
                        style={{
                            color: "rgba(255,255,255,0.28)",
                            transition: "color 1s ease",
                        }}
                    >
                        Writing Mode: {writingMode === "manual" ? "Manual" : "Automation"}
                    </div>
                </div>
            )}

            {/* YouTube-style progress bar */}
            <div className={`relative w-full h-[3px] bg-white/[0.04] ${progressOnly ? "border-b-0" : ""}`}>
                <div
                    className="absolute top-0 left-0 h-full rounded-r-full bg-red-500"
                    style={{
                        width: `${((adjustedIndex + 1) / displaySteps.length) * 100}%`,
                        transition: enableTransition
                            ? "width 1.4s cubic-bezier(0.16, 1, 0.3, 1)"
                            : "none",
                        boxShadow: "0 0 8px rgba(239, 68, 68, 0.5), 0 0 2px rgba(239, 68, 68, 0.8)",
                    }}
                />
            </div>
        </div>
    );
}
