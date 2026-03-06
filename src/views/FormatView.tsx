"use client";

import React, { useState } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { Organizer } from "@/services/OrganizerService";
import { TestService } from "@/services/TestService";

interface FormatViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export default function FormatView({ onBack, onNext }: FormatViewProps) {
    const org = useOrganizer();

    const [finalEssayTitle, setFinalEssayTitle] = useState(org.finalEssayTitle);
    const [studentName, setStudentName] = useState(org.studentName);
    const [instructorName, setInstructorName] = useState(org.instructorName);
    const [institutionName, setInstitutionName] = useState(org.institutionName);
    const [courseInfo, setCourseInfo] = useState(org.courseInfo);
    const [subjectCode, setSubjectCode] = useState(org.subjectCode);

    // Date state — default to current date
    const now = new Date();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const [month, setMonth] = useState(org.essayDate ? org.essayDate.split(" ")[0] : months[now.getMonth()]);
    const [day, setDay] = useState(org.essayDate ? parseInt(org.essayDate.split(" ")[1]) : now.getDate());
    const [year, setYear] = useState(org.essayDate ? parseInt(org.essayDate.split(" ")[2]) : now.getFullYear());

    // Test Mode Autofill
    React.useEffect(() => {
        if (TestService.isActive) {
            const mockFormat = TestService.getFormat();
            setFinalEssayTitle(mockFormat.finalEssayTitle);
            setStudentName(mockFormat.studentName);
            setInstructorName(mockFormat.instructorName);
            setInstitutionName(mockFormat.institutionName);
            setCourseInfo(mockFormat.courseInfo);
            setSubjectCode(mockFormat.subjectCode);
            setMonth(mockFormat.essayDate.split(" ")[0]);
            setDay(parseInt(mockFormat.essayDate.split(" ")[1]));
            setYear(parseInt(mockFormat.essayDate.split(" ")[2]));
        }
    }, []);

    const citationStyle = org.citationStyle;
    const isAPA = citationStyle === "APA";
    const isMLA = citationStyle === "MLA";

    const handleContinue = () => {
        Organizer.set({
            finalEssayTitle,
            studentName,
            instructorName,
            institutionName,
            courseInfo,
            subjectCode,
            essayDate: `${month} ${day} ${year}`,
        });
        onNext("generation");
    };

    const inputClass =
        "w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] py-4 px-5 text-[14px] text-white outline-none placeholder-white/30 transition hover:bg-white/[0.03] focus:border-red-500/50";

    const labelClass = "mb-2 text-[14px] font-bold text-white/90";
    const requiredDot = <span className="text-red-500 ml-1">*</span>;

    // Custom select styling
    const selectClass =
        "appearance-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none transition hover:bg-white/[0.05] focus:border-red-500/50 cursor-pointer";

    return (
        <div className="mx-auto flex w-full max-w-[1480px] flex-col px-6 pt-32 pb-[140px] lg:px-10">
            {/* Header */}
            <div className="mb-10">
                <h1 className="mb-2 text-[42px] font-bold tracking-tight text-white">Format Your Essay</h1>
                <p className="mb-6 text-[20px] font-medium text-red-500">
                    Set up the formatting for your {org.essayType || "Custom"}
                </p>

                <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <path d="M12 17h.01" />
                        </svg>
                    </div>
                    <span className="text-[18px] font-bold text-red-500">
                        {org.majorName || "Undeclared / General Studies"}
                    </span>
                    <span className="text-[18px] font-bold text-white/50">•</span>
                    <span className="text-[18px] font-bold text-white">
                        {citationStyle} {isAPA ? "7th Edition" : isMLA ? "9th Edition" : ""}
                    </span>
                </div>
            </div>

            {/* Format Section Title */}
            <div className="mb-8">
                <h2 className="mb-1 text-[22px] font-bold text-white">
                    {citationStyle} Format Information
                </h2>
                <p className="text-[14px] text-white/50">
                    Please provide the following details for proper {citationStyle} formatting
                </p>
            </div>

            {/* Final Essay Title */}
            <div className="mb-6">
                <label className={labelClass}>Essay Title {requiredDot}</label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Your essay title"
                        value={finalEssayTitle}
                        onChange={(e) => setFinalEssayTitle(e.target.value)}
                        className={`${inputClass} pl-12`}
                    />
                </div>
            </div>

            {/* Student Name */}
            <div className="mb-6">
                <label className={labelClass}>Student Name {requiredDot}</label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Your full name"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        className={`${inputClass} pl-12`}
                    />
                </div>
            </div>

            {/* Instructor Name */}
            <div className="mb-6">
                <label className={labelClass}>Instructor Name</label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Your instructor's name"
                        value={instructorName}
                        onChange={(e) => setInstructorName(e.target.value)}
                        className={`${inputClass} pl-12`}
                    />
                </div>
            </div>

            {/* Institution (APA only) */}
            {isAPA && (
                <div className="mb-6">
                    <label className={labelClass}>Institution</label>
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9h1" /><path d="M9 13h1" /><path d="M9 17h1" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Your institution name"
                            value={institutionName}
                            onChange={(e) => setInstitutionName(e.target.value)}
                            className={`${inputClass} pl-12`}
                        />
                    </div>
                </div>
            )}

            {/* Course Information */}
            <div className="mb-6">
                <label className={labelClass}>Course Information {requiredDot}</label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Course name and number"
                        value={courseInfo}
                        onChange={(e) => setCourseInfo(e.target.value)}
                        className={`${inputClass} pl-12`}
                    />
                </div>
            </div>

            {/* Subject Code (MLA only) */}
            {isMLA && (
                <div className="mb-6">
                    <label className={labelClass}>Subject Code</label>
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="e.g. ENG101"
                            value={subjectCode}
                            onChange={(e) => setSubjectCode(e.target.value)}
                            className={`${inputClass} pl-12`}
                        />
                    </div>
                </div>
            )}

            {/* Date */}
            <div className="mb-6">
                <label className={labelClass}>Date</label>
                <div className="relative flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] py-4 px-5">
                    <div className="text-white/30">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
                        </svg>
                    </div>
                    {/* Month */}
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {/* Day */}
                    <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={selectClass}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                    {/* Year */}
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
                        {Array.from({ length: 10 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Fixed Bottom bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[#0a0a0a]/95 px-6 backdrop-blur-md lg:px-10">
                <div className="mx-auto flex w-full items-center justify-between py-5 gap-4">
                    <button
                        onClick={onBack}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.02] py-4 text-[15px] font-bold text-white/80 transition-all duration-200 hover:bg-white/[0.06]"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Back
                    </button>

                    <button
                        onClick={handleContinue}
                        className="group flex flex-[2] items-center justify-center gap-2 overflow-hidden relative rounded-xl bg-red-500 py-4 text-[15px] font-bold text-white shadow-[0_0_20px_rgba(239,68,68,0.25)] transition hover:bg-red-400"
                    >
                        Generate Essay
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                            <path d="m9 18 6-6-6-6" />
                        </svg>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out" />
                    </button>
                </div>
            </div>
        </div>
    );
}
