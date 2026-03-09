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
            {/* ── Hero + Download Cards ── */}
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
                            Your final editor draft is locked into a clean export package. Download a layout-preserving PDF,
                            a plain-text copy for LMS uploads, or a DOCX handoff for last-mile editing.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[660px]">
                        {/* PDF */}
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-2xl border border-red-400/30 bg-red-500 p-5 text-left text-white shadow-[0_16px_60px_rgba(239,68,68,0.2)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[0.55rem] font-bold uppercase tracking-[0.3em] text-white/60">Primary</div>
                            <div className="mt-2 text-xl font-bold">{activeDownload === "pdf" ? "Exporting..." : "Download PDF"}</div>
                            <div className="mt-2 text-[0.72rem] leading-relaxed text-white/70">
                                Keeps your editor layout, spacing, headers, and page rhythm intact.
                            </div>
                        </button>

                        {/* TXT */}
                        <button
                            type="button"
                            onClick={handleDownloadTxt}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left text-white transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[0.55rem] font-bold uppercase tracking-[0.3em] text-neutral-500">Utility</div>
                            <div className="mt-2 text-xl font-bold">{activeDownload === "txt" ? "Exporting..." : "Download TXT"}</div>
                            <div className="mt-2 text-[0.72rem] leading-relaxed text-neutral-500">
                                Lightweight backup for portals, archives, and raw content checks.
                            </div>
                        </button>

                        {/* DOCX */}
                        <button
                            type="button"
                            onClick={handleDownloadDocx}
                            disabled={!exportDocument || activeDownload !== null}
                            className="rounded-2xl border border-[#f5c15f]/20 bg-[linear-gradient(180deg,rgba(245,193,95,0.08),rgba(255,255,255,0.02))] p-5 text-left text-white transition hover:border-[#f5c15f]/40 hover:bg-[linear-gradient(180deg,rgba(245,193,95,0.13),rgba(255,255,255,0.04))] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <div className="text-[0.55rem] font-bold uppercase tracking-[0.3em] text-[#f5c15f]/70">Optional</div>
                            <div className="mt-2 text-xl font-bold">{activeDownload === "docx" ? "Exporting..." : "Download DOCX"}</div>
                            <div className="mt-2 text-[0.72rem] leading-relaxed text-neutral-500">
                                Structured text export with page breaks for Word-based revision passes.
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Body: Sidebar + Preview ── */}
            <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-6 overflow-hidden px-6 py-5 lg:px-10 xl:flex-row">
                {/* Sidebar */}
                <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
                    {/* Document stats */}
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

                    {/* Ready to submit */}
                    <div className="rounded-2xl border border-red-500/12 bg-[linear-gradient(180deg,rgba(50,10,10,0.6),rgba(14,14,14,0.9))] p-5">
                        <p className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-red-400/60">Ready To Submit</p>
                        <p className="mt-3 text-[0.76rem] leading-[1.65] text-neutral-400">
                            Octopilot AI prepares your final draft for real-world handoff. Preserve formatting, retain page
                            structure, and keep a clean text fallback in the same pass.
                        </p>
                        <div className="mt-4 rounded-xl border border-white/6 bg-black/30 px-4 py-3 text-[0.72rem] leading-relaxed text-neutral-500">
                            Octopilot AI · Boardwalk Labs LLC
                            <br />
                            Academic workflow export suite
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2.5">
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[0.76rem] font-semibold text-neutral-300 transition hover:bg-white/8 hover:text-white"
                        >
                            ← Back to Editor
                        </button>
                        <button
                            type="button"
                            onClick={() => onNext("export")}
                            className="rounded-xl border border-white/8 bg-transparent px-4 py-3 text-[0.76rem] font-semibold text-neutral-500 transition hover:text-neutral-300"
                        >
                            Stay Here
                        </button>
                    </div>

                    {error ? (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[0.74rem] text-red-300">
                            {error}
                        </div>
                    ) : null}
                </aside>

                {/* Preview */}
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
                                                    className="relative mx-auto bg-white text-[#111827] shadow-[0_24px_70px_rgba(0,0,0,0.28)]"
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

                        <div className="mt-6 text-center text-[0.62rem] text-neutral-600">
                            © 2026 Boardwalk Labs LLC · Octopilot AI Export Suite
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
