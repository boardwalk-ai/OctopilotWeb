"use client";

import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";

interface ExportViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

const PAGE_WIDTH_PX = 816;
const PAGE_HEIGHT_PX = 1056;
const DEFAULT_MARGIN_PX = 96;

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

export default function ExportView({ onBack, onNext }: ExportViewProps) {
    const org = useOrganizer();
    const exportDocument = org.exportDocument;
    const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
    const [activeDownload, setActiveDownload] = useState<"pdf" | "txt" | "docx" | null>(null);
    const [error, setError] = useState("");

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

    const handleDownloadPdf = async () => {
        if (!exportDocument || pages.length === 0) return;
        setError("");
        setActiveDownload("pdf");
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

            pdf.save(makeFileName(title, "pdf"));
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
        try {
            const body = pages
                .map((page, index) => `Page ${index + 1}\n\n${page.plainText.trim()}`)
                .join("\n\n----------------------------------------\n\n");
            downloadBlob(new Blob([body], { type: "text/plain;charset=utf-8" }), makeFileName(title, "txt"));
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
            downloadBlob(blob, makeFileName(title, "docx"));
        } catch (downloadError) {
            setError(downloadError instanceof Error ? downloadError.message : "DOCX export failed.");
        } finally {
            setActiveDownload(null);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0a0a0a]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.22),transparent_45%),linear-gradient(180deg,rgba(15,15,18,0.96),rgba(10,10,10,0.92))]">
                <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-6 py-8 lg:px-10 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.45em] text-red-300/75">
                            Final Export Suite
                        </p>
                        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                            Publish the version you actually want to send.
                        </h1>
                        <p className="mt-4 max-w-2xl text-base leading-8 text-white/60">
                            Your final editor draft is locked into a clean export package. Download a layout-preserving PDF,
                            a plain-text copy for LMS uploads, or a DOCX handoff for last-mile editing.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[700px]">
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-[28px] border border-red-400/35 bg-red-500 px-6 py-5 text-left text-white shadow-[0_22px_80px_rgba(239,68,68,0.22)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[11px] uppercase tracking-[0.35em] text-white/70">Primary</div>
                            <div className="mt-2 text-2xl font-semibold">Download PDF</div>
                            <div className="mt-2 text-sm leading-6 text-white/75">
                                Keeps your editor layout, spacing, headers, and page rhythm intact.
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={handleDownloadTxt}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-[28px] border border-white/12 bg-white/5 px-6 py-5 text-left text-white transition hover:border-white/20 hover:bg-white/7 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[11px] uppercase tracking-[0.35em] text-white/45">Utility</div>
                            <div className="mt-2 text-2xl font-semibold">Download TXT</div>
                            <div className="mt-2 text-sm leading-6 text-white/60">
                                Lightweight backup for portals, archives, and raw content checks.
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={handleDownloadDocx}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-[28px] border border-[#f5c15f]/25 bg-[linear-gradient(180deg,rgba(245,193,95,0.1),rgba(255,255,255,0.03))] px-6 py-5 text-left text-white transition hover:border-[#f5c15f]/45 hover:bg-[linear-gradient(180deg,rgba(245,193,95,0.15),rgba(255,255,255,0.05))] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[11px] uppercase tracking-[0.35em] text-[#f5c15f]/75">Optional</div>
                            <div className="mt-2 text-2xl font-semibold">Download DOCX</div>
                            <div className="mt-2 text-sm leading-6 text-white/60">
                                Structured text export with page breaks for Word-based revision passes.
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-8 overflow-hidden px-6 py-6 lg:px-10 xl:flex-row">
                <aside className="flex w-full shrink-0 flex-col gap-5 xl:w-[360px]">
                    <div className="rounded-[30px] border border-white/8 bg-white/[0.03] p-6">
                        <div className="text-[11px] uppercase tracking-[0.35em] text-white/40">Document</div>
                        <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Pages</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{fileCount}</div>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Words</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{totalWords}</div>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Characters</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{totalCharacters}</div>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
                                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">Font</div>
                                <div className="mt-2 text-lg font-semibold text-white">{profile?.defaultFont || "Arial"}</div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[30px] border border-red-500/12 bg-[linear-gradient(180deg,rgba(64,11,11,0.7),rgba(14,14,14,0.9))] p-6">
                        <div className="text-[11px] uppercase tracking-[0.35em] text-red-300/70">Ready To Submit</div>
                        <p className="mt-4 text-sm leading-7 text-white/75">
                            Octopilot AI prepares your final draft for real-world handoff. Preserve formatting, retain page
                            structure, and keep a clean text fallback in the same pass.
                        </p>
                        <div className="mt-5 rounded-2xl border border-white/8 bg-black/25 p-4 text-sm leading-7 text-white/60">
                            Octopilot AI
                            <br />
                            Boardwalk Labs LLC
                            <br />
                            Academic workflow export suite
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex-1 rounded-[22px] border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white/80 transition hover:bg-white/8 hover:text-white"
                        >
                            Back to Editor
                        </button>
                        <button
                            type="button"
                            onClick={() => onNext("export")}
                            className="rounded-[22px] border border-white/10 bg-transparent px-5 py-4 text-sm font-semibold text-white/40 transition hover:border-white/20 hover:text-white/70"
                        >
                            Stay Here
                        </button>
                    </div>

                    {error ? (
                        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {error}
                        </div>
                    ) : null}
                </aside>

                <section className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="rounded-[30px] border border-white/8 bg-white/[0.025] p-4 sm:p-6">
                        <div className="mb-6 flex flex-col gap-2 border-b border-white/8 pb-5 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.35em] text-white/35">Live Preview</div>
                                <h3 className="mt-2 text-2xl font-semibold text-white">Final exported pages</h3>
                            </div>
                            <div className="text-sm leading-7 text-white/45">
                                PDF uses these rendered pages directly for the closest layout match.
                            </div>
                        </div>

                        {pages.length === 0 ? (
                            <div className="rounded-[26px] border border-dashed border-white/10 bg-black/20 px-6 py-16 text-center">
                                <div className="text-2xl font-semibold text-white">No export document is ready yet.</div>
                                <div className="mt-3 text-sm leading-7 text-white/50">
                                    Return to the editor, finalize your document, and export again.
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {pages.map((page, index) => {
                                    const pageNumberLabel = getPageNumberLabel(index, page.showPageNumber);
                                    return (
                                        <div key={page.id} className="rounded-[28px] border border-white/8 bg-black/20 p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:p-5">
                                            <div className="mb-4 flex items-center justify-between px-1">
                                                <div>
                                                    <div className="text-[11px] uppercase tracking-[0.32em] text-white/30">
                                                        {page.title}
                                                    </div>
                                                    <div className="mt-1 text-sm text-white/55">
                                                        Editor snapshot ready for export
                                                    </div>
                                                </div>
                                                <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/40">
                                                    Sheet {index + 1}
                                                </div>
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

                        <div className="mt-8 rounded-[26px] border border-white/8 bg-[linear-gradient(90deg,rgba(255,255,255,0.02),rgba(239,68,68,0.08),rgba(255,255,255,0.02))] px-6 py-5 text-sm leading-7 text-white/55">
                            Copyright 2026 Boardwalk Labs LLC. Octopilot AI export documents are generated from the final
                            editor state captured in your current browser session.
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
