"use client";

import { useState } from "react";
import { AutomationStepId } from "@/components/StepperHeader";
import { MajorIcon, majorTypes } from "@/lib/majorConstants";
import { Organizer } from "@/services/OrganizerService";

// ─── Essay type descriptions (short summaries for each) ───
const essayDescriptions: Record<string, string> = {
    "Literary Analysis": "In-depth examination of literary elements, themes, and techniques",
    "Critical Essay": "Analytical evaluation of texts, artworks, or cultural phenomena",
    "Rhetorical Analysis": "Examination of persuasive techniques and argumentative strategies",
    "Thematic Essay": "Exploration of recurring themes across literary or artistic works",
    "Reflective Essay": "Personal reflection on experiences, learning, and growth",
    "Personal Narrative": "Storytelling that conveys personal experiences and insights",
    "Art Critique": "Formal evaluation and interpretation of visual artworks",
    "Film/Media Analysis": "Critical examination of film, television, and media content",
    "Lab Report": "Structured documentation of scientific experiments and findings",
    "Research Paper": "In-depth academic investigation presenting original findings",
    "Literature Review": "Comprehensive survey of existing research on a topic",
    "Data Interpretation Essay": "Analysis and explanation of scientific or statistical data",
    "Experimental Analysis": "Detailed evaluation of experimental methods and results",
    "Field Report": "Documentation of observations from fieldwork or site visits",
    "Scientific Reflection": "Personal reflection on scientific methods and discoveries",
    "Theoretical Explanation Essay": "Explanation and analysis of mathematical theories",
    "Step-By-Step Proof Analysis": "Detailed walkthrough of mathematical proofs and logic",
    "Algorithm Breakdown": "Systematic analysis of algorithms and computational processes",
    "Mathematical Modeling Write-Up": "Documentation of mathematical models and applications",
    "Data Analysis Report": "Statistical analysis and interpretation of datasets",
    "Problem-Solving Reflection": "Reflection on mathematical problem-solving approaches",
    "Case Study Report": "Detailed analysis of a specific case in clinical context",
    "Evidence-Based Practice Essay (EBP)": "Analysis grounded in current clinical evidence",
    "Literature Review (Medical)": "Survey of medical research on a health topic",
    "SOAP Note": "Structured clinical documentation format",
    "Patient Reflection Essay": "Reflective writing on patient care experiences",
    "Health Policy Brief": "Concise analysis of health policy issues and recommendations",
    "Clinical Observation Write-Up": "Documentation of clinical observations and findings",
    "Case Study Analysis": "In-depth examination of a specific case or phenomenon",
    "Policy Brief": "Concise summary and analysis of policy issues",
    "Field Observation Report": "Systematic documentation of field observations",
    "Interview-Based Reflection": "Analysis and reflection based on interview data",
    "Cultural Comparison Essay": "Comparative analysis of cultural practices and values",
    "Position Paper": "Argumentative paper presenting and defending a position",
    "Business Case Study": "Analysis of business scenarios, decisions, and outcomes",
    "Executive Summary": "Concise overview of a business report or proposal",
    "Market Research Report": "Analysis of market trends, competitors, and opportunities",
    "Business Proposal": "Formal proposal for a business initiative or project",
    "Strategic Plan Analysis": "Evaluation of organizational strategies and planning",
    "Professional Memo": "Formal business communication document",
    "SWOT/PESTEL Report": "Strategic analysis using SWOT or PESTEL frameworks",
    "Policy Analysis": "Systematic evaluation of public policy options and outcomes",
    "Legal Brief": "Formal written argument presented to a court or tribunal",
    "Argumentative Essay (Legal/Policy Focus)": "Evidence-based argument on legal or policy topics",
    "Legal Position Paper": "Formal statement of legal position on an issue",
    "Government Report/Bill Review": "Analysis and review of legislation or government reports",
    "Ethical Analysis": "Examination of ethical dimensions and moral reasoning",
    "Comparative Law Essay": "Comparison of legal systems, laws, or judicial approaches",
    "Technical Report": "Formal documentation of technical processes and findings",
    "Design Proposal": "Detailed proposal for an engineering or design project",
    "Research Write-Up (Engineering Focus)": "Documentation of engineering research and findings",
    "Engineering Analysis": "Systematic analysis of engineering problems and solutions",
    "Project Documentation": "Comprehensive documentation of project lifecycle",
    "System Design Document": "Detailed specification of system architecture and design",
    "Engineering Case Study": "Analysis of engineering projects, failures, or innovations",
    "Visual Analysis": "Critical examination of visual design elements and principles",
    "Design Rationale Essay": "Explanation and justification of design decisions",
    "Media Critique": "Critical evaluation of media content and messaging",
    "Design Process Documentation": "Documentation of the design thinking process",
    "User Experience Analysis": "Evaluation of user interactions and experience design",
    "Communication Strategy": "Planning and analysis of communication approaches",
    "Portfolio Write-Up": "Reflective documentation accompanying creative portfolios",
    "Sustainability Report": "Assessment of sustainability practices and impact",
    "Environmental Proposal": "Proposal for environmental initiatives or solutions",
    "Land Use Case Study": "Analysis of land use planning and decision-making",
    "Environmental Impact Analysis": "Assessment of environmental effects of projects",
    "Agricultural Research Report": "Documentation of agricultural research findings",
    "Conservation Strategy": "Planning document for conservation initiatives",
    "Field Study Documentation": "Comprehensive documentation of field research",
    "Cultural Comparison Essay (Global)": "Comparative analysis across cultural contexts",
    "Historical Argument Essay": "Evidence-based argument on historical topics",
    "Post-Colonial Analysis": "Critical examination through post-colonial theoretical lens",
    "Global Issues Analysis": "Analysis of global challenges and international dynamics",
    "Cultural Impact Study": "Assessment of cultural influences and their effects",
    "Regional Analysis Report": "Systematic analysis of regional characteristics",
    "Cross-Cultural Research": "Research comparing practices across cultures",
    "Synthesis Essay": "Integration of multiple sources into a cohesive argument",
    "Mixed-Method Research Paper": "Research combining qualitative and quantitative methods",
    "Expository Essay": "Clear explanation and analysis of a topic or concept",
    "Interdisciplinary Analysis": "Analysis drawing from multiple academic disciplines",
    "Thematic Integration": "Synthesis of themes across different fields of study",
    "Cross-Field Study": "Investigation spanning multiple academic disciplines",
    "Multidisciplinary Report": "Comprehensive report incorporating multiple fields",
    "Literary Analysis Essay": "Detailed analysis of literary works and techniques",
    "Argumentative Essay": "Evidence-based essay arguing a specific position",
    "Rhetorical Analysis Essay": "Analysis of rhetorical strategies in texts",
    "Comparative Literature Essay": "Comparison of literary works across traditions",
    "Narrative Essay": "Story-driven essay conveying meaning through narrative",
    "Research Paper (Literature)": "Academic research focused on literary topics",
    "Critical Theory Application": "Application of critical theory to texts or phenomena",
    "Compare & Contrast Essay": "Systematic comparison of two or more subjects",
    "Descriptive Essay": "Vivid, detailed description of a subject or experience",
    "Reflective Essay (General)": "Personal reflection on experiences and learning",
    "Research Paper (General)": "General academic research paper on any topic",
    "Custom": "Define your own essay type and requirements",
};

// ─── Per-major essay types data ───
interface MajorEssayData {
    citation: string;
    types: string[];
}

const majorEssayTypes: MajorEssayData[] = [
    // 0: Humanities & Arts
    { citation: "MLA", types: ["Literary Analysis", "Critical Essay", "Rhetorical Analysis", "Thematic Essay", "Reflective Essay", "Personal Narrative", "Art Critique", "Film/Media Analysis", "Custom"] },
    // 1: Sciences
    { citation: "APA", types: ["Lab Report", "Research Paper", "Literature Review", "Data Interpretation Essay", "Experimental Analysis", "Field Report", "Scientific Reflection", "Custom"] },
    // 2: Mathematics & Technology
    { citation: "APA", types: ["Theoretical Explanation Essay", "Step-By-Step Proof Analysis", "Algorithm Breakdown", "Mathematical Modeling Write-Up", "Data Analysis Report", "Problem-Solving Reflection", "Custom"] },
    // 3: Health & Medical
    { citation: "APA", types: ["Case Study Report", "Evidence-Based Practice Essay (EBP)", "Literature Review (Medical)", "SOAP Note", "Patient Reflection Essay", "Health Policy Brief", "Clinical Observation Write-Up", "Custom"] },
    // 4: Social Sciences
    { citation: "APA", types: ["Research Paper", "Case Study Analysis", "Policy Brief", "Field Observation Report", "Interview-Based Reflection", "Cultural Comparison Essay", "Position Paper", "Custom"] },
    // 5: Business & Professional Studies
    { citation: "APA", types: ["Business Case Study", "Executive Summary", "Market Research Report", "Business Proposal", "Strategic Plan Analysis", "Professional Memo", "SWOT/PESTEL Report", "Custom"] },
    // 6: Law, Policy & Government
    { citation: "Chicago", types: ["Policy Analysis", "Legal Brief", "Argumentative Essay (Legal/Policy Focus)", "Legal Position Paper", "Government Report/Bill Review", "Ethical Analysis", "Comparative Law Essay", "Custom"] },
    // 7: Engineering & Applied Sciences
    { citation: "IEEE", types: ["Technical Report", "Design Proposal", "Research Write-Up (Engineering Focus)", "Engineering Analysis", "Project Documentation", "System Design Document", "Engineering Case Study", "Custom"] },
    // 8: Design & Communication
    { citation: "MLA", types: ["Visual Analysis", "Design Rationale Essay", "Media Critique", "Design Process Documentation", "User Experience Analysis", "Communication Strategy", "Portfolio Write-Up", "Custom"] },
    // 9: Agriculture & Environmental Fields
    { citation: "APA", types: ["Sustainability Report", "Environmental Proposal", "Land Use Case Study", "Environmental Impact Analysis", "Agricultural Research Report", "Conservation Strategy", "Field Study Documentation", "Custom"] },
    // 10: Global, Cultural & Area Studies
    { citation: "MLA", types: ["Cultural Comparison Essay", "Historical Argument Essay", "Post-Colonial Analysis", "Global Issues Analysis", "Cultural Impact Study", "Regional Analysis Report", "Cross-Cultural Research", "Custom"] },
    // 11: Interdisciplinary/Liberal Studies
    { citation: "MLA", types: ["Synthesis Essay", "Mixed-Method Research Paper", "Expository Essay", "Interdisciplinary Analysis", "Thematic Integration", "Cross-Field Study", "Multidisciplinary Report", "Custom"] },
    // 12: English Studies
    { citation: "MLA", types: ["Literary Analysis Essay", "Argumentative Essay", "Rhetorical Analysis Essay", "Comparative Literature Essay", "Narrative Essay", "Research Paper (Literature)", "Critical Theory Application", "Custom"] },
    // 13: Undeclared/General Studies
    { citation: "APA", types: ["Argumentative Essay", "Compare & Contrast Essay", "Narrative Essay", "Descriptive Essay", "Expository Essay", "Reflective Essay", "Research Paper (General)", "Custom"] },
];

interface EssayTypeViewProps {
    selectedMajor: number;
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

export default function EssayTypeView({ selectedMajor, onBack, onNext }: EssayTypeViewProps) {
    const [selected, setSelected] = useState<number | null>(null);
    const [search, setSearch] = useState("");

    const majorData = majorEssayTypes[selectedMajor] || majorEssayTypes[0];
    const majorInfo = majorTypes[selectedMajor] || majorTypes[0];

    const filtered = majorData.types.filter((t) =>
        t.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex w-full flex-1 flex-col px-6 pt-32 pb-0 lg:px-10 2xl:px-14">
            {/* Title */}
            <h1 className="mb-2 text-[36px] font-bold text-white">Select Essay Type</h1>
            <div className="mb-6 flex items-center gap-2.5 text-[15px]">
                <div className="flex h-5 w-5 items-center justify-center">
                    <MajorIcon type={majorInfo.iconType} />
                </div>
                <span className="font-bold text-white tracking-wide">{majorInfo.name}</span>
                <span className="text-white/30 px-1">·</span>
                <span className="text-white/60">{majorData.citation} Citation</span>
                <span
                    className="ml-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-400"
                    style={{
                        animation: "recommendedGlow 2s ease-in-out infinite",
                    }}
                >
                    Recommended
                </span>
            </div>

            {/* Inline keyframes for glow animation */}
            <style dangerouslySetInnerHTML={{
                __html: `
              @keyframes recommendedGlow {
                0%, 100% {
                  box-shadow: 0 0 4px rgba(239, 68, 68, 0.2);
                  opacity: 0.85;
                }
                50% {
                  box-shadow: 0 0 14px rgba(239, 68, 68, 0.5), 0 0 6px rgba(239, 68, 68, 0.3);
                  opacity: 1;
                }
              }
            ` }} />

            {/* Search bar */}
            <div className="relative mb-5 w-full">
                <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                    type="text"
                    placeholder="Search essay types..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] py-3 pl-12 pr-4 text-[14px] text-white placeholder-white/25 outline-none transition focus:border-white/15 focus:bg-white/[0.05]"
                />
            </div>

            {/* Scrollable Essay Type List */}
            <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 380px)" }}>
                <div className="flex flex-col gap-3">
                    {filtered.map((essayType) => {
                        const originalIndex = majorData.types.indexOf(essayType);
                        const isSelected = selected === originalIndex;
                        const desc = essayDescriptions[essayType] || "Custom essay type — define your own parameters";

                        return (
                            <button
                                key={essayType}
                                onClick={() => setSelected(originalIndex)}
                                className={`flex w-full items-center justify-between rounded-2xl border px-6 py-5 text-left transition-all duration-200 ${isSelected
                                    ? "border-red-500/40 bg-red-500/[0.06]"
                                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]"
                                    }`}
                            >
                                <div className="flex-1">
                                    <h3 className="text-[16px] font-bold text-white">{essayType}</h3>
                                    <p className="mt-1 text-[13px] text-white/40">{desc}</p>
                                </div>
                                <svg
                                    className={`ml-4 shrink-0 transition-transform duration-300 ${isSelected ? "rotate-180 text-red-500" : "text-white/20"}`}
                                    width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                >
                                    <path d="m6 9 6 6 6-6" />
                                </svg>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="flex items-center gap-3 py-5">
                <button
                    onClick={onBack}
                    className="flex min-w-[132px] items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-6 py-3 text-[14px] font-semibold text-white/60 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                    Back
                </button>

                <button
                    onClick={() => {
                        if (selected !== null) {
                            Organizer.set({ essayType: majorData.types[selected] });
                            onNext("instructions");
                        }
                    }}
                    className={`flex w-full max-w-[440px] items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold transition-all duration-200 ${selected !== null
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
