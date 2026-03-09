"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import AnimatedBackground from "@/components/AnimatedBackground";
import { useOrganizer } from "@/hooks/useOrganizer";
import { TrackerService } from "@/services/TrackerService";

interface ExportViewProps {
    onBack: () => void;
    onRestart: () => void;
}

const PAGE_WIDTH_PX = 816;
const PAGE_HEIGHT_PX = 1056;
const DEFAULT_MARGIN_PX = 96;

const CREW = [
    { role: "Founder & CEO", name: "Mr. Hein Htet", accent: "from-red-500/60 to-red-300/10" },
    { role: "Chief Product Officer", name: "Mrs. Su Pyae", accent: "from-amber-400/60 to-amber-300/10" },
    { role: "Lead Engineer & CTO", name: "Lucas D. Marshall", subtitle: "Kaung Myat San", accent: "from-sky-400/60 to-sky-300/10", image: "/CTO.JPG" },
    { role: "Chief Financial Officer", name: "Mr. Myat Hein Htet", accent: "from-emerald-400/60 to-emerald-300/10" },
    { role: "Graphics", name: "Mr. Hein Htet Aung", subtitle: "Spoonie Soy", accent: "from-fuchsia-400/60 to-fuchsia-300/10" },
    { role: "Graphics", name: "Michael", accent: "from-violet-400/60 to-violet-300/10" },
    { role: "Manager", name: "Lily", accent: "from-orange-400/60 to-orange-300/10" },
];

function makeFileName(title: string, ext: string) {
    const safe = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `${safe || "octopilot-export"}.${ext}`;
}

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportView({ onBack, onRestart }: ExportViewProps) {
    const org = useOrganizer();
    const exportDocument = org.exportDocument;
    const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
    const finaleScrollRef = useRef<HTMLDivElement | null>(null);
    const finaleAnimationRef = useRef<number | null>(null);
    const [activeDownload, setActiveDownload] = useState<"pdf" | "txt" | "docx" | null>(null);
    const [error, setError] = useState("");
    const [showFinale, setShowFinale] = useState(false);
    const [isFinaleAutoScrollEnabled, setIsFinaleAutoScrollEnabled] = useState(true);

    const title = exportDocument?.title || org.finalEssayTitle || "Untitled document";
    const pages = exportDocument?.pages || [];
    const profile = exportDocument?.profile;
    const fileCount = pages.length;
    const totalWords = pages.reduce((sum, page) => {
        const words = page.plainText.trim().split(/\s+/).filter(Boolean).length;
        return sum + words;
    }, 0);
    const totalCharacters = pages.reduce((sum, page) => sum + page.plainText.length, 0);
    const marginPx = Math.round((profile?.marginInch || 1) * 96) || DEFAULT_MARGIN_PX;

    const getPageNumberLabel = (pageIndex: number, showPageNumber?: boolean) => {
        if (!profile || !(showPageNumber ?? profile.showPageNumber)) return "";
        const pagePosition = pageIndex + 1;
        if (pagePosition < profile.pageNumberStartPage) return "";
        return String(Math.max(1, profile.pageNumberStartNumber + (pagePosition - profile.pageNumberStartPage)));
    };

    const emotionalCopy = useMemo(() => {
        const lineOne = "Thanks for using Octopilot AI.";
        const lineTwo = "This page is where your final draft stops being a file and starts becoming a memory.";
        const lineThree = "Every paragraph here was carried by long nights, stubborn ideas, and a crew that kept building until the work felt worthy of your name.";
        return [lineOne, lineTwo, lineThree];
    }, []);

    useEffect(() => {
        if (!showFinale || !isFinaleAutoScrollEnabled) return undefined;

        const container = finaleScrollRef.current;
        if (!container) return undefined;

        let start: number | null = null;
        const initialScrollTop = 0;
        const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
        const duration = Math.max(16000, maxScroll * 12);

        container.scrollTo({ top: 0, behavior: "auto" });

        const animate = (timestamp: number) => {
            if (!finaleScrollRef.current || !isFinaleAutoScrollEnabled) return;
            if (start === null) start = timestamp;
            const elapsed = timestamp - start;
            const progress = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            finaleScrollRef.current.scrollTop = initialScrollTop + maxScroll * eased;

            if (progress < 1) {
                finaleAnimationRef.current = window.requestAnimationFrame(animate);
            } else {
                finaleAnimationRef.current = null;
            }
        };

        finaleAnimationRef.current = window.requestAnimationFrame(animate);

        return () => {
            if (finaleAnimationRef.current !== null) {
                window.cancelAnimationFrame(finaleAnimationRef.current);
                finaleAnimationRef.current = null;
            }
        };
    }, [isFinaleAutoScrollEnabled, showFinale]);

    const handleFinaleManualOverride = () => {
        setIsFinaleAutoScrollEnabled(false);
        if (finaleAnimationRef.current !== null) {
            window.cancelAnimationFrame(finaleAnimationRef.current);
            finaleAnimationRef.current = null;
        }
        finaleScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleDownloadPdf = async () => {
        if (!exportDocument || pages.length === 0) return;
        setError("");
        setActiveDownload("pdf");
        const fileName = makeFileName(title, "pdf");
        try {
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "px",
                format: [PAGE_WIDTH_PX, PAGE_HEIGHT_PX],
                compress: true,
            });

            for (let index = 0; index < pages.length; index += 1) {
                const node = pageRefs.current[index];
                if (!node) throw new Error("Missing export preview page.");
                const canvas = await html2canvas(node, {
                    scale: 2,
                    backgroundColor: "#ffffff",
                    useCORS: true,
                    logging: false,
                });
                const image = canvas.toDataURL("image/png");
                if (index > 0) pdf.addPage([PAGE_WIDTH_PX, PAGE_HEIGHT_PX], "portrait");
                pdf.addImage(image, "PNG", 0, 0, PAGE_WIDTH_PX, PAGE_HEIGHT_PX, undefined, "FAST");
            }

            pdf.save(fileName);
            await TrackerService.trackDownload({ type: "pdf", fileName, pageCount: pages.length });
            window.setTimeout(() => {
                setIsFinaleAutoScrollEnabled(true);
                setShowFinale(true);
            }, 240);
        } catch (downloadError) {
            setError(downloadError instanceof Error ? downloadError.message : "PDF export failed.");
        } finally {
            setActiveDownload(null);
        }
    };

    const handleDownloadTxt = () => {
        if (!exportDocument || pages.length === 0) return;
        setError("");
        setActiveDownload("txt");
        const fileName = makeFileName(title, "txt");
        try {
            const body = pages
                .map((page, index) => `Page ${index + 1}\n\n${page.plainText.trim()}`)
                .join("\n\n----------------------------------------\n\n");
            downloadBlob(new Blob([body], { type: "text/plain;charset=utf-8" }), fileName);
            void TrackerService.trackDownload({ type: "txt", fileName, pageCount: pages.length });
        } catch (downloadError) {
            setError(downloadError instanceof Error ? downloadError.message : "TXT export failed.");
        } finally {
            setActiveDownload(null);
        }
    };

    const handleDownloadDocx = async () => {
        if (!exportDocument || pages.length === 0) return;
        setError("");
        setActiveDownload("docx");
        const fileName = makeFileName(title, "docx");
        try {
            const sections = pages.map((page, index) => {
                const paragraphs = page.plainText
                    .split(/\n{2,}/)
                    .map((chunk) => chunk.replace(/\n/g, " ").trim())
                    .filter(Boolean)
                    .map((chunk) => new Paragraph({
                        children: [new TextRun(chunk)],
                        spacing: { after: 220, line: Math.round((page.lineHeight || profile?.lineHeight || 1.5) * 240) },
                        alignment:
                            page.textAlign === "center" ? AlignmentType.CENTER :
                                page.textAlign === "right" ? AlignmentType.RIGHT :
                                    page.textAlign === "justify" ? AlignmentType.JUSTIFIED :
                                        AlignmentType.LEFT,
                    }));

                return {
                    properties: {},
                    children: [
                        ...(index === 0 ? [new Paragraph({
                            text: title,
                            heading: HeadingLevel.TITLE,
                            spacing: { after: 320 },
                            alignment: AlignmentType.CENTER,
                        })] : []),
                        ...paragraphs,
                    ],
                };
            });

            const doc = new Document({
                creator: "Octopilot AI",
                title,
                description: "Exported final essay from Octopilot Editor",
                sections,
            });
            const blob = await Packer.toBlob(doc);
            downloadBlob(blob, fileName);
            await TrackerService.trackDownload({ type: "docx", fileName, pageCount: pages.length });
        } catch (downloadError) {
            setError(downloadError instanceof Error ? downloadError.message : "DOCX export failed.");
        } finally {
            setActiveDownload(null);
        }
    };

    if (showFinale) {
        return (
            <div className="relative flex h-screen overflow-hidden bg-[#060606]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <AnimatedBackground />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.22),transparent_28%),radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_35%),linear-gradient(180deg,rgba(8,8,8,0.1),rgba(8,8,8,0.94))]" />

                <button
                    type="button"
                    onClick={handleFinaleManualOverride}
                    className="absolute bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full border border-white/14 bg-black/45 text-white/80 shadow-[0_18px_50px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:border-white/24 hover:bg-black/62 hover:text-white"
                    title="Back to top"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5" />
                        <path d="m5 12 7-7 7 7" />
                    </svg>
                </button>

                <div ref={finaleScrollRef} className="relative z-10 mx-auto flex h-full w-full max-w-[1650px] flex-col overflow-y-auto px-6 py-8 lg:px-10">
                    <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col items-center justify-between">
                        <section className="flex w-full flex-1 shrink-0 flex-col items-center justify-center pt-6 text-center">
                            <div className="mb-8">
                                <Image
                                    src="/OCTOPILOT.png"
                                    alt="Octopilot AI"
                                    width={132}
                                    height={132}
                                    className="mx-auto drop-shadow-[0_0_55px_rgba(239,68,68,0.22)]"
                                />
                            </div>
                            <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-full border border-red-400/30 bg-red-500/14 shadow-[0_0_80px_rgba(239,68,68,0.28)]">
                                <div className="h-10 w-10 rounded-full border-2 border-red-300/80 bg-white/90 shadow-[0_0_30px_rgba(255,255,255,0.22)]" />
                            </div>

                            <p className="text-[11px] font-semibold uppercase tracking-[0.5em] text-red-300/65">
                                Export Complete
                            </p>
                            <h1 className="mt-5 max-w-5xl text-5xl font-semibold tracking-tight text-white sm:text-6xl xl:text-7xl">
                                The story leaves Octopilot now,
                                <span className="block text-red-400">but a piece of us goes with it.</span>
                            </h1>

                            <div className="mt-8 max-w-4xl space-y-4 text-lg leading-9 text-white/62 sm:text-xl">
                                {emotionalCopy.map((line) => (
                                    <p key={line}>{line}</p>
                                ))}
                            </div>

                            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsFinaleAutoScrollEnabled(false);
                                        setShowFinale(false);
                                    }}
                                    className="rounded-full border border-white/12 bg-white/6 px-8 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white/82 transition hover:border-white/22 hover:bg-white/10 hover:text-white"
                                >
                                    Download Another
                                </button>
                                <button
                                    type="button"
                                    onClick={onRestart}
                                    className="rounded-full border border-red-400/40 bg-red-500 px-8 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-white shadow-[0_18px_70px_rgba(239,68,68,0.25)] transition hover:bg-red-400"
                                >
                                    Start New Adventure
                                </button>
                            </div>
                        </section>

                        <section className="relative mb-4 mt-10 w-full shrink-0 max-w-[1420px] overflow-hidden rounded-[42px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-5 py-8 backdrop-blur-xl sm:px-8 xl:px-12">
                            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-red-400/55 to-transparent" />
                            <div className="mb-8 flex flex-col items-center text-center">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.5em] text-white/34">
                                    Meet Our Crew
                                </p>
                                <p className="mt-4 max-w-3xl text-base leading-8 text-white/52">
                                    The people below poured patience, obsession, design instinct, and impossible hours into
                                    the machine that just helped you finish something that matters.
                                </p>
                            </div>

                            <div
                                className="relative mt-8 flex min-h-[220px] w-full items-center overflow-hidden"
                                style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}
                            >
                                {/* Inject keyframes directly into the DOM */}
                                <div dangerouslySetInnerHTML={{
                                    __html: `<style>
                                    @keyframes crewMarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
                                </style>` }} />

                                <div
                                    className="flex items-center gap-10 sm:gap-16"
                                    style={{ width: "max-content", animation: "crewMarquee 120s linear infinite", willChange: "transform" }}
                                >
                                    {[...CREW, ...CREW, ...CREW, ...CREW].map((member, index) => (
                                        <div key={`crew-${member.name}-${index}`} className="flex shrink-0 items-center gap-10 sm:gap-16">
                                            <div className="flex w-[220px] flex-col items-center justify-center text-center">
                                                <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${member.accent} p-[1px]`}>
                                                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#120f0f] text-lg font-semibold text-white">
                                                        {member.image ? (
                                                            <Image
                                                                src={member.image}
                                                                alt={member.name}
                                                                fill
                                                                sizes="64px"
                                                                className="object-cover"
                                                            />
                                                        ) : (
                                                            member.name.charAt(0)
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">
                                                    {member.role}
                                                </div>
                                                <div className="mt-2 text-base font-medium text-white/90">
                                                    {member.name}
                                                </div>
                                                {member.subtitle ? (
                                                    <div className="mt-1 text-xs text-white/30">{member.subtitle}</div>
                                                ) : null}
                                            </div>
                                            {/* Vertical Divider Line */}
                                            <div className="h-20 w-px shrink-0 bg-white-[0.08] bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-8 text-center text-sm leading-8 text-white/44">
                                Copyright 2026 Boardwalk Labs LLC. Octopilot AI was built to help hard work feel seen.
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0a0a0a]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            <div className="shrink-0 border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.18),transparent_50%),linear-gradient(180deg,rgba(12,12,14,0.98),rgba(10,10,10,0.95))]">
                <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-7 lg:px-10 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-2xl">
                        <p className="text-[0.58rem] font-bold uppercase tracking-[0.4em] text-red-400/70">
                            Final Export Suite
                        </p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                            Publish the version you actually want to send.
                        </h1>
                        <p className="mt-3 text-[0.84rem] leading-relaxed text-neutral-400">
                            Export the last editor draft as a polished file. PDF keeps the visual rhythm intact. TXT and DOCX
                            stay here when you need utility copies, but PDF is the handoff this page was built for.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[660px]">
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-2xl border border-red-400/30 bg-red-500 p-5 text-left text-white shadow-[0_16px_60px_rgba(239,68,68,0.2)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[0.55rem] font-bold uppercase tracking-[0.3em] text-white/60">Primary</div>
                            <div className="mt-2 text-xl font-bold">{activeDownload === "pdf" ? "Exporting..." : "Download PDF"}</div>
                            <div className="mt-2 text-[0.72rem] leading-relaxed text-white/70">
                                Layout-preserving output. When this finishes, the final thank-you screen takes over.
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={handleDownloadTxt}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left text-white transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[0.55rem] font-bold uppercase tracking-[0.3em] text-neutral-500">Utility</div>
                            <div className="mt-2 text-xl font-bold">{activeDownload === "txt" ? "Exporting..." : "Download TXT"}</div>
                            <div className="mt-2 text-[0.72rem] leading-relaxed text-neutral-500">
                                Raw text fallback for LMS uploads, archive copies, and low-friction backups.
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={handleDownloadDocx}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-2xl border border-[#f5c15f]/20 bg-[linear-gradient(180deg,rgba(245,193,95,0.08),rgba(255,255,255,0.02))] p-5 text-left text-white transition hover:border-[#f5c15f]/40 hover:bg-[linear-gradient(180deg,rgba(245,193,95,0.13),rgba(255,255,255,0.04))] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[0.55rem] font-bold uppercase tracking-[0.3em] text-[#f5c15f]/70">Optional</div>
                            <div className="mt-2 text-xl font-bold">{activeDownload === "docx" ? "Exporting..." : "Download DOCX"}</div>
                            <div className="mt-2 text-[0.72rem] leading-relaxed text-neutral-500">
                                Editable handoff for Word-based revision passes and institutional workflows.
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-6 overflow-hidden px-6 py-5 lg:px-10 xl:flex-row">
                <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
                        <p className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-neutral-500">Document</p>
                        <h2 className="mt-2 text-lg font-bold tracking-tight text-white">{title}</h2>
                        <div className="mt-4 grid grid-cols-2 gap-2.5">
                            {[
                                { label: "Pages", value: String(fileCount) },
                                { label: "Words", value: totalWords.toLocaleString() },
                                { label: "Characters", value: totalCharacters.toLocaleString() },
                                { label: "Font", value: profile?.defaultFont || "Arial" },
                            ].map((stat) => (
                                <div key={stat.label} className="rounded-xl border border-white/6 bg-black/30 px-3.5 py-3">
                                    <div className="text-[0.5rem] font-bold uppercase tracking-[0.2em] text-neutral-600">{stat.label}</div>
                                    <div className="mt-1 text-lg font-bold tabular-nums text-white">{stat.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-red-500/12 bg-[linear-gradient(180deg,rgba(50,10,10,0.6),rgba(14,14,14,0.9))] p-5">
                        <p className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-red-400/60">Ready To Submit</p>
                        <p className="mt-3 text-[0.76rem] leading-[1.65] text-neutral-400">
                            When the PDF lands, this workspace fades out and the goodbye page takes over. It is meant to feel
                            final, grateful, and bigger than a plain download confirmation.
                        </p>
                        <div className="mt-4 rounded-xl border border-white/6 bg-black/30 px-4 py-3 text-[0.72rem] leading-relaxed text-neutral-500">
                            Octopilot AI · Boardwalk Labs LLC
                            <br />
                            Academic workflow export suite
                        </div>
                    </div>

                    <div className="flex gap-2.5">
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[0.76rem] font-semibold text-neutral-300 transition hover:bg-white/8 hover:text-white"
                        >
                            ← Back to Editor
                        </button>
                    </div>

                    {error ? (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[0.74rem] text-red-300">
                            {error}
                        </div>
                    ) : null}
                </aside>

                <section className="min-h-0 flex-1 overflow-y-auto">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:p-5">
                        <div className="mb-5 flex items-baseline justify-between border-b border-white/6 pb-4">
                            <div>
                                <h3 className="text-[1.05rem] font-bold tracking-tight text-white">Live Preview</h3>
                                <p className="mt-0.5 text-[0.68rem] text-neutral-500">
                                    PDF uses these rendered pages directly for the closest layout match
                                </p>
                            </div>
                            <span className="text-[0.62rem] font-semibold text-neutral-600">
                                {pages.length} {pages.length === 1 ? "page" : "pages"}
                            </span>
                        </div>

                        {pages.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-6 py-16 text-center">
                                <div className="text-xl font-bold text-white">No export document is ready yet</div>
                                <p className="mt-2 text-[0.78rem] text-neutral-500">
                                    Return to the editor, finalize your document, and export again.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {pages.map((page, index) => {
                                    const pageNumberLabel = getPageNumberLabel(index, page.showPageNumber);
                                    return (
                                        <div key={page.id} className="rounded-2xl border border-white/8 bg-black/20 p-4 sm:p-5">
                                            <div className="mb-3 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-[0.6rem] font-bold text-neutral-500">
                                                        {index + 1}
                                                    </span>
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">{page.title}</p>
                                                        <p className="text-[0.68rem] text-neutral-500">Editor snapshot ready for export</p>
                                                    </div>
                                                </div>
                                                <span className="rounded-full border border-white/10 px-3 py-1 text-[0.62rem] font-semibold text-neutral-500">
                                                    Sheet {index + 1}
                                                </span>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <div
                                                    ref={(node) => {
                                                        pageRefs.current[index] = node;
                                                    }}
                                                    className="relative mx-auto bg-white text-[#111827] shadow-[0_30px_80px_rgba(0,0,0,0.25)]"
                                                    style={{
                                                        width: `${PAGE_WIDTH_PX}px`,
                                                        minHeight: `${PAGE_HEIGHT_PX}px`,
                                                        paddingTop: `${marginPx}px`,
                                                        paddingRight: `${marginPx}px`,
                                                        paddingBottom: `${marginPx}px`,
                                                        paddingLeft: `${marginPx}px`,
                                                        fontFamily: profile?.defaultFont || "Arial",
                                                    }}
                                                >
                                                    {profile?.headerText ? (
                                                        <div
                                                            className="absolute left-0 right-0 top-0 flex items-center justify-between px-8 text-[11pt] text-[#111827]"
                                                            style={{ height: `${Math.max(34, marginPx - 20)}px` }}
                                                        >
                                                            <span>{profile.headerText}</span>
                                                            {pageNumberLabel ? <span>{pageNumberLabel}</span> : null}
                                                        </div>
                                                    ) : pageNumberLabel ? (
                                                        <div
                                                            className="absolute right-8 top-0 flex items-center text-[11pt] text-[#111827]"
                                                            style={{ height: `${Math.max(34, marginPx - 20)}px` }}
                                                        >
                                                            <span>{pageNumberLabel}</span>
                                                        </div>
                                                    ) : null}

                                                    <div
                                                        className={`${page.centerVertically ? "flex min-h-full flex-col justify-center" : ""} prose prose-neutral max-w-none`}
                                                        style={{
                                                            textAlign: page.textAlign || "left",
                                                            lineHeight: String(page.lineHeight || profile?.lineHeight || 1.5),
                                                        }}
                                                        dangerouslySetInnerHTML={{ __html: page.html }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
