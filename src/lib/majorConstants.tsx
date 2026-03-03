export const MajorIcon = ({ type }: { type: string }) => {
    const cls = "text-red-500";
    switch (type) {
        case "humanities":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                </svg>
            );
        case "sciences":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <ellipse cx="12" cy="12" rx="10" ry="4" />
                    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
                    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
                </svg>
            );
        case "math":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <text x="2" y="20" fontSize="18" fontWeight="bold" fontStyle="italic" fontFamily="serif" fill="currentColor">f(x)</text>
                </svg>
            );
        case "health":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
            );
        case "social":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="12" width="4" height="9" rx="0.5" />
                    <rect x="10" y="7" width="4" height="14" rx="0.5" />
                    <rect x="17" y="3" width="4" height="18" rx="0.5" />
                </svg>
            );
        case "business":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                    <path d="M12 12h.01" />
                </svg>
            );
        case "law":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 10 4-6 4 6" /><path d="M3 10h8" /><circle cx="7" cy="14" r="4" />
                    <path d="m13 10 4-6 4 6" /><path d="M13 10h8" /><circle cx="17" cy="14" r="4" />
                    <path d="M12 20v-10" />
                </svg>
            );
        case "engineering":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
            );
        case "design":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="13.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="10.5" r="2.5" /><circle cx="8.5" cy="7.5" r="2.5" /><circle cx="6.5" cy="12.5" r="2.5" />
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12a10 10 0 0 0 5.012 8.662" />
                    <path d="M16 16a2 2 0 0 1-4 0c0-1.105.895-4 2-4s2 2.895 2 4z" />
                </svg>
            );
        case "agriculture":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" />
                    <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
                    <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
                </svg>
            );
        case "global":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                    <path d="M2 12h20" />
                </svg>
            );
        case "interdisciplinary":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                    <path d="M8 7h6" /><path d="M8 11h8" /><path d="M8 15h4" />
                </svg>
            );
        case "english":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
                </svg>
            );
        case "undeclared":
            return (
                <svg className={cls} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5" />
                </svg>
            );
        default:
            return null;
    }
};

export const majorTypes = [
    { name: "Humanities & Arts", style: "Analytical / Critical", iconType: "humanities" },
    { name: "Sciences (Natural & Physical)", style: "Objective / Scientific", iconType: "sciences" },
    { name: "Mathematics & Technology", style: "Technical / Clear", iconType: "math" },
    { name: "Health & Medical", style: "Clinical / Evidence-based", iconType: "health" },
    { name: "Social Sciences", style: "Formal / Academic", iconType: "social" },
    { name: "Business & Professional Studies", style: "Professional / Executive", iconType: "business" },
    { name: "Law, Policy & Government", style: "Persuasive / Legal", iconType: "law" },
    { name: "Engineering & Applied Sciences", style: "Technical / Concise", iconType: "engineering" },
    { name: "Design & Communication", style: "Reflective / Creative", iconType: "design" },
    { name: "Agriculture & Environmental Fields", style: "Scientific / Clear", iconType: "agriculture" },
    { name: "Global, Cultural & Area Studies", style: "Contextual / Analytical", iconType: "global" },
    { name: "Interdisciplinary / Liberal Studies", style: "Adaptive / Mixed", iconType: "interdisciplinary" },
    { name: "English Studies", style: "Literary / Analytical", iconType: "english" },
    { name: "Undeclared / General Studies", style: "Neutral / Balanced", iconType: "undeclared" },
];
