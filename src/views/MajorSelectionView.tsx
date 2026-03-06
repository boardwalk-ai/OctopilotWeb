"use client";

import { useState } from "react";
import { AutomationStepId } from "@/components/StepperHeader";

interface MajorSelectionViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
    onSelectMajor: (majorIndex: number) => void;
}

import { MajorIcon, majorTypes as majors } from "@/lib/majorConstants";

export default function MajorSelectionView({ onBack, onNext, onSelectMajor }: MajorSelectionViewProps) {
    const [selected, setSelected] = useState<number | null>(null);
    const [search, setSearch] = useState("");

    const filtered = majors.filter(
        (m) =>
            m.name.toLowerCase().includes(search.toLowerCase()) ||
            m.style.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex w-full flex-1 flex-col px-6 pt-32 pb-0 lg:px-10 2xl:px-14">
            {/* Title */}
            <h1 className="mb-2 text-[36px] font-bold text-white">Select Your Major</h1>
            <p className="mb-6 text-[16px] text-white/50">
                Choose your academic discipline to get started
            </p>

            {/* Search bar */}
            <div className="relative mb-6 w-full">
                <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                    type="text"
                    placeholder="Search majors..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] py-3 pl-12 pr-4 text-[14px] text-white placeholder-white/25 outline-none transition focus:border-white/15 focus:bg-white/[0.05]"
                />
            </div>

            {/* Scrollable Cards Grid */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 -mx-4" style={{ maxHeight: "calc(100vh - 380px)" }}>
                <div className="grid grid-cols-4 gap-4">
                    {filtered.map((major) => {
                        const originalIndex = majors.indexOf(major);
                        const isSelected = selected === originalIndex;

                        return (
                            <button
                                key={major.name}
                                onClick={() => setSelected(originalIndex)}
                                className={`flex flex-col items-start rounded-2xl border p-5 text-left transition-all duration-200 hover:scale-[1.02] ${isSelected
                                    ? "border-red-500/50 bg-red-500/[0.06]"
                                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]"
                                    }`}
                                style={{ minHeight: "140px" }}
                            >
                                <div className="mb-4">
                                    <MajorIcon type={major.iconType} />
                                </div>
                                <h3 className="mb-1 text-[15px] font-bold leading-tight text-white">
                                    {major.name}
                                </h3>
                                <p className="text-[12px] font-medium text-white/40">{major.style}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="flex items-center gap-3 py-5">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-6 py-3 text-[14px] font-semibold text-white/60 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                    Back
                </button>

                <button
                    onClick={() => {
                        if (selected !== null) {
                            onSelectMajor(selected);
                            onNext("essay-type");
                        }
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition-all duration-200 ${selected !== null
                        ? "bg-red-500 text-white shadow-[0_0_24px_rgba(239,68,68,0.3)] hover:bg-red-400"
                        : "bg-white/[0.04] text-white/30 cursor-not-allowed"
                        }`}
                    disabled={selected === null}
                >
                    Continue
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
