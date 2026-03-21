"use client";

import { useState } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import styles from "./MajorSelectionViewMobile.module.css";

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
        <div className={`flex h-full min-h-full w-full flex-1 flex-col px-6 pt-32 pb-0 lg:px-10 2xl:px-14 ${styles.majorShell}`}>
            {/* Title */}
            <h1 className={`mb-2 text-[36px] font-bold text-white ${styles.majorTitle}`}>Select Your Major</h1>
            <p className={`mb-6 text-[16px] text-white/50 ${styles.majorSubtitle}`}>
                Choose your academic discipline to get started
            </p>

            {/* Search bar */}
            <div className={`relative mb-6 w-full ${styles.majorSearchWrap}`}>
                <svg
                    className={`absolute left-4 top-1/2 -translate-y-1/2 text-white/30 ${styles.majorSearchIcon}`}
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
                    className={`w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] py-3 pl-12 pr-4 text-[14px] text-white placeholder-white/25 outline-none transition focus:border-white/15 focus:bg-white/[0.05] ${styles.majorSearchInput}`}
                />
            </div>

            {/* Scrollable Cards Grid */}
            <div className={`flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-2 -mx-4 ${styles.majorListViewport}`}>
                <div className={`grid grid-cols-4 gap-4 ${styles.majorGrid}`}>
                    {filtered.map((major) => {
                        const originalIndex = majors.indexOf(major);
                        const isSelected = selected === originalIndex;

                        return (
                            <button
                                key={major.name}
                                onClick={() => setSelected(originalIndex)}
                                className={`flex flex-col items-start rounded-2xl border p-5 text-left transition-all duration-200 hover:scale-[1.02] ${styles.majorCard} ${isSelected
                                    ? "border-red-500/50 bg-red-500/[0.06]"
                                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]"
                                    }`}
                            >
                                <div className={`mb-4 ${styles.majorCardIcon}`}>
                                    <div className={styles.majorCardIconBox}>
                                        <MajorIcon type={major.iconType} />
                                    </div>
                                </div>
                                <div className={styles.majorCardCopy}>
                                    <h3 className={`mb-1 text-[15px] font-bold leading-tight text-white ${styles.majorCardTitle}`}>
                                        {major.name}
                                    </h3>
                                    <p className={`text-[12px] font-medium text-white/40 ${styles.majorCardStyle}`}>{major.style}</p>
                                </div>
                                <div className={`${styles.majorCardIndicator} ${isSelected ? styles.majorCardIndicatorActive : ""}`}>
                                    <div className={styles.majorCardIndicatorDot} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className={`flex items-center justify-between gap-4 py-5 ${styles.majorFooter}`}>
                <button
                    onClick={onBack}
                    className={`ml-20 flex min-w-[148px] items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-7 py-3.5 text-[14px] font-semibold text-white/70 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white md:ml-24 ${styles.majorBackButton}`}
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
                    className={`flex min-w-[250px] max-w-[440px] items-center justify-center gap-2 rounded-full px-9 py-3.5 text-[14px] font-semibold transition-all duration-200 ${styles.majorContinueButton} ${selected !== null
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
