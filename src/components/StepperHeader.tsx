"use client";

import { useEffect, useRef, useState } from "react";

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

export const automationStepSequence: Array<{ id: AutomationStepId; label: string }> = [
  { id: "writing-style", label: "Writing Style" },
  { id: "major-selection", label: "Major Selection" },
  { id: "essay-type", label: "Essay Type" },
  { id: "instructions", label: "Instructions" },
  { id: "outlines", label: "Outlines" },
  { id: "configuration", label: "Configuration" },
  { id: "format", label: "Format" },
  { id: "generation", label: "Generation" },
  { id: "preview", label: "Preview" },
  { id: "humanizer", label: "Humanizer" },
  { id: "editor", label: "Editor" },
  { id: "export", label: "Export" },
];

interface StepperHeaderProps {
  currentStepId: AutomationStepId;
  skipFormat?: boolean;
  skipWritingStyle?: boolean;
  className?: string;
  writingMode?: "automation" | "manual" | "ghostwriter" | "octopilotslides";
  progressOnly?: boolean;
}

export function getVisibleAutomationSteps(options?: {
  skipFormat?: boolean;
  skipWritingStyle?: boolean;
  writingMode?: "automation" | "manual" | "ghostwriter" | "octopilotslides";
}): Array<{ id: AutomationStepId; label: string }> {
  const skipFormat = options?.skipFormat ?? false;
  const skipWritingStyle = options?.skipWritingStyle ?? false;
  const writingMode = options?.writingMode ?? "automation";

  return automationStepSequence
    .filter((step) => !(skipWritingStyle && step.id === "writing-style"))
    .filter((step) => !(skipFormat && step.id === "format"))
    .map((step) => ({
      ...step,
      label: writingMode === "manual" && step.id === "generation" ? "Writing Chamber" : step.label,
    }));
}

export default function StepperHeader({
  currentStepId,
  skipFormat = false,
  skipWritingStyle = false,
  className = "",
  writingMode = "automation",
  progressOnly = false,
}: StepperHeaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [offset, setOffset] = useState(0);
  const hasInitialized = useRef(false);
  const [enableTransition, setEnableTransition] = useState(false);

  const displaySteps = getVisibleAutomationSteps({ skipFormat, skipWritingStyle, writingMode });
  const currentStepIndex = Math.max(0, displaySteps.findIndex((step) => step.id === currentStepId));
  const displayStepsKey = displaySteps.map((step) => step.label).join("|");

  useEffect(() => {
    const container = containerRef.current;
    const activeEl = stepRefs.current[currentStepIndex];
    if (!container || !activeEl) return;

    requestAnimationFrame(() => {
      const containerWidth = container.offsetWidth;
      const activeLeft = activeEl.offsetLeft;
      const activeWidth = activeEl.offsetWidth;
      const activeCenterX = activeLeft + activeWidth / 2;

      setOffset(containerWidth / 2 - activeCenterX);

      if (!hasInitialized.current) {
        hasInitialized.current = true;
        requestAnimationFrame(() => {
          setEnableTransition(true);
        });
      }
    });
  }, [currentStepIndex, displayStepsKey]);

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-30 ${progressOnly ? "border-b-0 bg-transparent backdrop-blur-none" : "border-b border-white/[0.06] bg-[#0d0d0d] backdrop-blur-md"} ${className}`}
    >
      {!progressOnly && (
        <div className="flex flex-col items-center justify-center overflow-hidden py-2.5">
          <div ref={containerRef} className="relative w-full overflow-hidden">
            <div
              className="flex w-max items-center"
              style={{
                transform: `translateX(${offset}px)`,
                transition: enableTransition
                  ? "transform 1.4s cubic-bezier(0.16, 1, 0.3, 1)"
                  : "none",
                willChange: "transform",
              }}
            >
              {displaySteps.map((step, index) => {
                const isCurrent = index === currentStepIndex;
                const isPast = index < currentStepIndex;
                const isLast = index === displaySteps.length - 1;
                const isArrowLit = index < currentStepIndex;

                return (
                  <span key={step.id} className="flex shrink-0 items-center">
                    <span
                      ref={(el) => {
                        stepRefs.current[index] = el;
                      }}
                      className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wider md:text-[11px]"
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
                      {step.label}
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

          <div
            className="mt-1 text-[9px] uppercase tracking-[0.15em]"
            style={{
              color: "rgba(255,255,255,0.28)",
              transition: "color 1s ease",
            }}
          >
            Writing Mode: {writingMode === "manual" ? "Manual" : writingMode === "ghostwriter" ? "Ghostwriter" : "Automation"}
          </div>
        </div>
      )}

      <div className={`relative h-[3px] w-full bg-white/[0.04] ${progressOnly ? "border-b-0" : ""}`}>
        <div
          className="absolute top-0 left-0 h-full rounded-r-full bg-red-500"
          style={{
            width: `${((currentStepIndex + 1) / displaySteps.length) * 100}%`,
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
