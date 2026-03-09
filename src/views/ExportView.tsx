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
            {/* ── Top Bar ── */}
            <div className="shrink-0 border-b border-white/8 bg-[#0c0c0c]">
                <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-6 py-4 lg:px-10">
                    <div className="flex items-center gap-3">
                        <span className="text-[1.3rem] font-bold tracking-tight text-red-500">Export</span>
                        <span className="hidden rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.2em] text-neutral-500 sm:inline">
                            Final Suite
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-full bg-red-500 px-4 py-2 text-[0.72rem] font-bold text-black transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {activeDownload === "pdf" ? "Exporting..." : "Download PDF"}
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadTxt}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.72rem] font-semibold text-neutral-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {activeDownload === "txt" ? "Exporting..." : "TXT"}
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadDocx}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-full border border-[#f5c15f]/25 bg-[#f5c15f]/10 px-4 py-2 text-[0.72rem] font-semibold text-[#f5c15f] transition hover:bg-[#f5c15f]/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {activeDownload === "docx" ? "Exporting..." : "DOCX"}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Document Info + Stats ── */}
            <div className="shrink-0 border-b border-white/6 bg-white/[0.015]">
                <div className="mx-auto flex w-full max-w-[1600px] items-center gap-6 px-6 py-3 lg:px-10">
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-[1.05rem] font-bold tracking-tight text-white">{title}</h2>
                        <p className="mt-0.5 text-[0.68rem] text-neutral-500">
                            Your final editor draft locked into a clean export package
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                        {[
                            { label: "Pages", value: String(fileCount) },
                            { label: "Words", value: totalWords.toLocaleString() },
                            { label: "Characters", value: totalCharacters.toLocaleString() },
                            { label: "Font", value: profile?.defaultFont || "Arial" },
                        ].map((stat) => (
                            <div key={stat.label} className="hidden text-center sm:block">
                                <div className="text-[0.52rem] font-bold uppercase tracking-[0.2em] text-neutral-600">{stat.label}</div>
                                <div className="mt-0.5 text-[0.88rem] font-bold tabular-nums text-white">{stat.value}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-[1600px] px-6 py-6 lg:px-10">
                    {error ? (
                        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[0.74rem] text-red-300">
                            {error}
                        </div>
                    ) : null}

                    {pages.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-20 text-center">
                            <div className="text-[1.2rem] font-bold text-white">No export document is ready yet</div>
                            <p className="mt-2 text-[0.78rem] text-neutral-500">
                                Return to the editor, finalize your document, and export again.
                            </p>
                            <button
                                type="button"
                                onClick={onBack}
                                className="mt-5 rounded-full bg-red-500 px-5 py-2 text-[0.72rem] font-bold text-black transition hover:bg-red-400"
                            >
                                Back to Editor
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Section header */}
                            <div className="flex items-baseline justify-between">
                                <div>
                                    <h3 className="text-[1.1rem] font-bold tracking-tight text-white">Live Preview</h3>
                                    <p className="mt-0.5 text-[0.72rem] text-neutral-500">PDF uses these rendered pages directly for the closest layout match</p>
                                </div>
                                <span className="text-[0.65rem] font-semibold text-neutral-600">{pages.length} {pages.length === 1 ? "page" : "pages"}</span>
                            </div>

                            {pages.map((page, index) => {
                                const pageNumberLabel = getPageNumberLabel(index, page.showPageNumber);
                                return (
                                    <div key={page.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:p-5">
                                        <div className="mb-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-[0.6rem] font-bold text-neutral-500">
                                                    {index + 1}
                                                </span>
                                                <span className="text-[0.72rem] font-semibold text-neutral-400">{page.title}</span>
                                            </div>
                                            <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-[0.58rem] font-semibold text-neutral-500">
                                                Sheet {index + 1}
                                            </span>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <div
                                                ref={(node) => {
                                                    pageRefs.current[index] = node;
                                                }}
                                                className="relative mx-auto bg-white text-[#111827] shadow-[0_20px_60px_rgba(0,0,0,0.3)]"
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

                            {/* Bottom action bar */}
                            <div className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/[0.02] px-5 py-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={onBack}
                                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[0.72rem] font-semibold text-neutral-300 transition hover:text-white"
                                    >
                                        ← Back to Editor
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onNext("export")}
                                        className="rounded-full border border-white/8 bg-transparent px-4 py-2 text-[0.72rem] font-semibold text-neutral-500 transition hover:text-neutral-300"
                                    >
                                        Stay Here
                                    </button>
                                </div>
                                <p className="hidden text-[0.62rem] text-neutral-600 sm:block">
                                    © 2026 Boardwalk Labs LLC · Octopilot AI Export Suite
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
