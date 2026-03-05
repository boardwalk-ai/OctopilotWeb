"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AutomationStepId } from "@/components/StepperHeader";
import { useOrganizer } from "@/hooks/useOrganizer";
import { Organizer, SourceData } from "@/services/OrganizerService";
import { CitationTemplateService } from "@/services/CitationTemplateService";
import { JasmineService } from "@/services/JasmineService";
import { ScraperService } from "@/services/ScraperService";
import { ScarletService } from "@/services/ScarletService";
import { SpoonieAuthorInput, SpoonieService } from "@/services/SpoonieService";
import { TestService } from "@/services/TestService";

interface ConfigurationViewProps {
    onBack: () => void;
    onNext: (step: AutomationStepId) => void;
}

type JasmineSourceMeta = {
    Title?: string;
    Author?: string;
    "Published Year"?: string;
    Publisher?: string;
};

const WORD_COUNTS = [500, 750, 1000, 1500, 2000, 2500, 3000, "Custom"] as const;

type CitationStyleDef = { name: string; desc: string; comingSoon?: boolean };
const CITATION_STYLES: CitationStyleDef[] = [
    { name: "None", desc: "No Citation Format" },
    { name: "APA", desc: "American Psychological Association" },
    { name: "MLA", desc: "Modern Language Association" },
    { name: "Chicago", desc: "Chicago Manual of Style" },
    { name: "Harvard", desc: "Harvard Referencing System" },
    { name: "IEEE", desc: "Institute of Electrical Engineers" },
];

const TONE_OPTIONS = [
    "Formal Academic",
    "Analytical",
    "Critical",
    "Persuasive",
    "Technical",
    "Objective",
    "Professional"
];

const SOURCE_TABS = ["Octopilot Search", "Use My Source", "Fieldwork Mode"];

type PdfExtractResponse = {
    fileName: string;
    pageCount: number;
    pages: string[];
};

type UploadedPdfSource = {
    id: string;
    fileName: string;
    pageCount: number;
    pageRange: string;
    citation: string;
};

export default function ConfigurationView({ onBack, onNext }: ConfigurationViewProps) {
    const org = useOrganizer();

    const [wordCount, setWordCount] = useState<number | "Custom">(org.wordCount);
    const [citationStyle, setCitationStyle] = useState(org.citationStyle);
    const [tone, setTone] = useState(org.tone);
    const [isToneDropdownOpen, setIsToneDropdownOpen] = useState(false);
    const [sourcesTab, setSourcesTab] = useState(org.sourcesTab);
    const [aiSearchKeywords, setAiSearchKeywords] = useState(org.aiSearchKeywords);

    // Test Mode Autofill
    useEffect(() => {
        if (TestService.isActive) {
            const mockData = TestService.getConfiguration();
            setWordCount(mockData.wordCount as number | "Custom");
            setCitationStyle(mockData.citationStyle);
            setTone(mockData.tone);
            setSourcesTab(mockData.sourcesTab);
            setAiSearchKeywords(mockData.aiSearchKeywords);
        }
    }, []);

    // Default 5 empty inputs
    const initSources = org.manualSources.length >= 5 ? org.manualSources : [
        { url: "", status: "empty" },
        { url: "", status: "empty" },
        { url: "", status: "empty" },
        { url: "", status: "empty" },
        { url: "", status: "empty" }
    ] as SourceData[];
    const [manualSources, setManualSources] = useState<SourceData[]>(initSources);

    const [specifyKeywords, setSpecifyKeywords] = useState(org.keywords.length > 0);
    const [keywordsText, setKeywordsText] = useState(org.keywords);

    // Jasmine & Scraper UI States
    const [isSearching, setIsSearching] = useState(false);

    // Scrape Failed Queue
    const [failedScrapesQueue, setFailedScrapesQueue] = useState<SourceData[]>([]);
    const [showFailedModal, setShowFailedModal] = useState(false);
    const [currentFailedSource, setCurrentFailedSource] = useState<SourceData | null>(null);

    // Source Details Modal
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedSourceDetail, setSelectedSourceDetail] = useState<SourceData | null>(null);
    const [detailPage, setDetailPage] = useState(0);

    // Use My Source - PDF flow
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const [isPdfUploading, setIsPdfUploading] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [pdfStep, setPdfStep] = useState<1 | 2>(1);
    const [pdfData, setPdfData] = useState<PdfExtractResponse | null>(null);
    const [pdfStartPage, setPdfStartPage] = useState(1);
    const [pdfEndPage, setPdfEndPage] = useState(1);
    const [pdfReviewPage, setPdfReviewPage] = useState(1);
    const [pdfAuthors, setPdfAuthors] = useState<SpoonieAuthorInput[]>([{ firstName: "", lastName: "" }]);
    const [pdfDocumentTitle, setPdfDocumentTitle] = useState("");
    const [pdfPublicationYear, setPdfPublicationYear] = useState("");
    const [pdfJournalName, setPdfJournalName] = useState("");
    const [pdfPublisher, setPdfPublisher] = useState("");
    const [pdfVolume, setPdfVolume] = useState("");
    const [pdfIssue, setPdfIssue] = useState("");
    const [pdfEdition, setPdfEdition] = useState("");
    const [pdfCitationPreview, setPdfCitationPreview] = useState("");
    const [isCitationLoading, setIsCitationLoading] = useState(false);
    const [citationError, setCitationError] = useState("");
    const [canUsePortal, setCanUsePortal] = useState(false);

    const isInitialMount = useRef(true);
    const toneDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setCanUsePortal(true);
    }, []);

    const renderModal = useCallback(
        (node: React.ReactNode) => (canUsePortal ? createPortal(node, document.body) : null),
        [canUsePortal]
    );

    // Close dropdown on click outside
    useEffect(() => {
        if (!isToneDropdownOpen) return;
        const close = (e: MouseEvent) => {
            if (toneDropdownRef.current && !toneDropdownRef.current.contains(e.target as Node)) {
                setIsToneDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [isToneDropdownOpen]);

    // Handle Scrape Failure Queue Presentation
    useEffect(() => {
        if (failedScrapesQueue.length > 0 && !showFailedModal) {
            setCurrentFailedSource(failedScrapesQueue[0]);
            setShowFailedModal(true);
        }
    }, [failedScrapesQueue, showFailedModal]);

    useEffect(() => {
        if (isInitialMount.current) { isInitialMount.current = false; return; }
        Organizer.set({
            wordCount,
            citationStyle,
            tone,
            sourcesTab,
            aiSearchKeywords,
            manualSources,
            keywords: specifyKeywords ? keywordsText : "",
        });
    }, [wordCount, citationStyle, tone, sourcesTab, aiSearchKeywords, manualSources, specifyKeywords, keywordsText]);

    const selectedPdfTexts = useMemo(() => {
        if (!pdfData) return [];
        return pdfData.pages.slice(pdfStartPage - 1, pdfEndPage);
    }, [pdfData, pdfEndPage, pdfStartPage]);

    const selectedPdfContent = useMemo(() => selectedPdfTexts.join("\n\n"), [selectedPdfTexts]);

    const pdfAuthorString = useMemo(() => {
        return pdfAuthors
            .map((author) => {
                const first = author.firstName.trim();
                const last = author.lastName.trim();
                if (!first && !last) return "";
                if (last && first) return `${last}, ${first}`;
                return last || first;
            })
            .filter(Boolean)
            .join("; ");
    }, [pdfAuthors]);

    const hasRequiredCitationInfo = Boolean(
        pdfDocumentTitle.trim() &&
        pdfPublicationYear.trim() &&
        (pdfJournalName.trim() || pdfPublisher.trim())
    );

    const uploadedPdfSources = useMemo<UploadedPdfSource[]>(() => {
        return manualSources
            .filter((src) => src.url.startsWith("pdf://"))
            .map((src, idx) => ({
                id: `${src.url}-${idx}`,
                fileName: decodeURIComponent(src.url.replace(/^pdf:\/\//, "").split("#")[0] || "Document.pdf"),
                pageCount: 0,
                pageRange: src.url.split("#pages=")[1] || "N/A",
                citation: CitationTemplateService.formatReference(citationStyle, src, idx + 1),
            }));
    }, [citationStyle, manualSources]);

    const fallbackPdfCitation = useCallback(() => {
        const fallbackSource: SourceData = {
            url: "",
            status: "scraped",
            title: pdfDocumentTitle.trim() || "Untitled Document",
            author: pdfAuthorString || "Unknown",
            publishedYear: pdfPublicationYear.trim() || "n.d.",
            publisher: pdfJournalName.trim() || pdfPublisher.trim() || "Unknown Publisher",
            fullContent: selectedPdfContent,
        };
        return CitationTemplateService.formatReference(citationStyle, fallbackSource, 1);
    }, [citationStyle, pdfAuthorString, pdfDocumentTitle, pdfJournalName, pdfPublicationYear, pdfPublisher, selectedPdfContent]);

    const resetPdfFlow = () => {
        setShowPdfModal(false);
        setPdfStep(1);
        setPdfData(null);
        setPdfStartPage(1);
        setPdfEndPage(1);
        setPdfReviewPage(1);
        setPdfAuthors([{ firstName: "", lastName: "" }]);
        setPdfDocumentTitle("");
        setPdfPublicationYear("");
        setPdfJournalName("");
        setPdfPublisher("");
        setPdfVolume("");
        setPdfIssue("");
        setPdfEdition("");
        setPdfCitationPreview("");
        setCitationError("");
        setIsCitationLoading(false);
    };

    const openPdfPicker = () => {
        pdfInputRef.current?.click();
    };

    const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!/\.pdf$/i.test(file.name) && !(file.type || "").toLowerCase().includes("pdf")) {
            alert("Please select a valid PDF file.");
            return;
        }

        setIsPdfUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/pdf/extract", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to extract PDF");
            }

            const parsed: PdfExtractResponse = await res.json();
            const maxPage = Math.max(1, parsed.pageCount || parsed.pages.length || 1);
            const defaultTitle = parsed.fileName.replace(/\.pdf$/i, "");

            setPdfData({
                fileName: parsed.fileName,
                pageCount: maxPage,
                pages: parsed.pages || [],
            });
            setPdfStartPage(1);
            setPdfEndPage(maxPage);
            setPdfReviewPage(1);
            setPdfStep(1);
            setPdfAuthors([{ firstName: "", lastName: "" }]);
            setPdfDocumentTitle(defaultTitle);
            setPdfPublicationYear("");
            setPdfJournalName("");
            setPdfPublisher("");
            setPdfVolume("");
            setPdfIssue("");
            setPdfEdition("");
            setPdfCitationPreview("");
            setCitationError("");
            setShowPdfModal(true);
        } catch (error) {
            console.error("[Use My Source] PDF upload failed:", error);
            alert(error instanceof Error ? error.message : "Failed to process PDF");
        } finally {
            setIsPdfUploading(false);
            event.target.value = "";
        }
    };

    const addPdfAuthorRow = () => {
        setPdfAuthors((prev) => [...prev, { firstName: "", lastName: "" }]);
    };

    const updatePdfAuthor = (index: number, field: keyof SpoonieAuthorInput, value: string) => {
        setPdfAuthors((prev) => prev.map((author, idx) => idx === index ? { ...author, [field]: value } : author));
    };

    const goToPdfReview = () => {
        if (!hasRequiredCitationInfo) {
            alert("Document Title + Publication Year + (Journal Name or Publisher) are required.");
            return;
        }
        setPdfStep(2);
        setPdfReviewPage(1);
    };

    const savePdfAsSource = () => {
        if (!pdfData) return;

        const pageRange = `${pdfStartPage}-${pdfEndPage}`;
        const source: SourceData = {
            url: `pdf://${encodeURIComponent(pdfData.fileName)}#pages=${pageRange}`,
            status: "scraped",
            title: pdfDocumentTitle.trim() || pdfData.fileName.replace(/\.pdf$/i, ""),
            author: pdfAuthorString || "Unknown",
            publishedYear: pdfPublicationYear.trim(),
            publisher: [pdfJournalName.trim(), pdfPublisher.trim()].filter(Boolean).join(" • "),
            fullContent: selectedPdfContent,
        };

        setManualSources((prev) => {
            const next = [...prev];
            const emptyIdx = next.findIndex((item) => item.url.trim() === "");
            if (emptyIdx >= 0) next[emptyIdx] = source;
            else next.push(source);
            return next;
        });

        resetPdfFlow();
    };

    useEffect(() => {
        if (!pdfData) return;
        const max = Math.max(1, pdfData.pageCount);
        setPdfStartPage((prev) => Math.max(1, Math.min(prev, max)));
        setPdfEndPage((prev) => Math.max(1, Math.min(prev, max)));
    }, [pdfData]);

    useEffect(() => {
        if (pdfStartPage > pdfEndPage) {
            setPdfEndPage(pdfStartPage);
        }
    }, [pdfStartPage, pdfEndPage]);

    useEffect(() => {
        if (!showPdfModal) return;
        setPdfCitationPreview("");
        setCitationError("");
    }, [
        citationStyle,
        pdfAuthors,
        pdfDocumentTitle,
        pdfPublicationYear,
        pdfJournalName,
        pdfPublisher,
        pdfVolume,
        pdfIssue,
        pdfEdition,
        pdfStartPage,
        pdfEndPage,
        showPdfModal,
    ]);

    const handleAskSpoonie = async () => {
        if (!showPdfModal || !pdfData) return;
        if (!hasRequiredCitationInfo) {
            setPdfCitationPreview("");
            setCitationError("Document Title + Publication Year + (Journal Name or Publisher) are required.");
            return;
        }

        setIsCitationLoading(true);
        setCitationError("");
        try {
            const citation = await SpoonieService.generateCitation({
                citationStyle,
                documentTitle: pdfDocumentTitle.trim(),
                publicationYear: pdfPublicationYear.trim(),
                authors: pdfAuthors,
                journalName: pdfJournalName.trim(),
                publisher: pdfPublisher.trim(),
                volume: pdfVolume.trim(),
                issue: pdfIssue.trim(),
                edition: pdfEdition.trim(),
                pageRange: `${pdfStartPage}-${pdfEndPage}`,
            });
            setPdfCitationPreview(citation);
        } catch (error) {
            console.warn("[Spoonie] Citation preview failed:", error);
            setCitationError("Could not generate citation from Spoonie. Showing template fallback.");
            setPdfCitationPreview(fallbackPdfCitation());
        } finally {
            setIsCitationLoading(false);
        }
    };

    const handleAddSource = () => {
        setManualSources([...manualSources, { url: "", status: "empty" }]);
    };

    const updateSourceUrl = (index: number, val: string) => {
        const newSrc = [...manualSources];
        newSrc[index] = { ...newSrc[index], url: val };
        setManualSources(newSrc);
    };

    // --- Search & Scrape Logic ---
    const triggerScrape = async (index: number, url: string, jasmineMeta?: JasmineSourceMeta) => {
        try {
            const scrapeData = await ScraperService.scrape(url);

            setManualSources(prev => {
                const next = [...prev];
                next[index] = {
                    ...next[index],
                    title: scrapeData.title || jasmineMeta?.Title,
                    author: scrapeData.author || jasmineMeta?.Author,
                    publishedYear: scrapeData.publishedYear || jasmineMeta?.["Published Year"],
                    publisher: scrapeData.publisher || jasmineMeta?.Publisher,
                    fullContent: scrapeData.fullContent,
                    status: "scraped"
                };
                return next;
            });
        } catch {
            console.error("Scrape failed for URL:", url);
            setManualSources(prev => {
                const next = [...prev];
                const failedSrc: SourceData = {
                    ...next[index],
                    title: jasmineMeta?.Title || "",
                    author: jasmineMeta?.Author || "",
                    publishedYear: jasmineMeta?.["Published Year"] || "",
                    publisher: jasmineMeta?.Publisher || "",
                    status: "failed"
                };
                next[index] = failedSrc;

                // Queue the failure for manual correction
                setFailedScrapesQueue(q => [...q, failedSrc]);
                return next;
            });
        }
    };

    const handleJasmineSearch = async () => {
        const emptyIndices = manualSources
            .map((src, idx) => (src.url.trim() === "" ? idx : -1))
            .filter((idx) => idx !== -1);

        if (emptyIndices.length === 0) {
            alert("No empty source boxes available. Please clear some links or add a new box first.");
            return;
        }

        setIsSearching(true);
        try {
            const results = await JasmineService.searchSources(emptyIndices.length);

            // Populate boxes with loading status immediately
            const newSources = [...manualSources];
            results.forEach((res, i) => {
                if (i < emptyIndices.length) {
                    const mappedIdx = emptyIndices[i];
                    newSources[mappedIdx] = {
                        ...newSources[mappedIdx],
                        url: res.website_URL,
                        status: "loading"
                    };
                }
            });
            setManualSources(newSources);

            // Fire fire-and-forget background scrapes
            results.forEach((res, i) => {
                if (i < emptyIndices.length) {
                    const mappedIdx = emptyIndices[i];
                    triggerScrape(mappedIdx, res.website_URL, res);
                }
            });
        } catch (err: unknown) {
            console.error(err);
            const message = err instanceof Error ? err.message : "Unknown error";
            alert("Jasmine failed to search: " + message);
        } finally {
            setIsSearching(false);
        }
    };

    // Manual source save helper for the failure modal
    const saveManualSource = (correctedSource: SourceData) => {
        // Overwrite the failed block in the main array
        setManualSources(prev => prev.map(s => s.url === correctedSource.url ? { ...correctedSource, status: "scraped" } : s));
        // Pop the queue
        setFailedScrapesQueue(q => q.slice(1));
        setShowFailedModal(false);
    };

    const removeManualSource = (url: string) => {
        // Clear the URL and status
        setManualSources(prev => prev.map(s => s.url === url ? { url: "", status: "empty" } : s));
        // Pop the queue
        setFailedScrapesQueue(q => q.slice(1));
        setShowFailedModal(false);
    };

    return (
        <div className="mx-auto flex w-full flex-col px-10 pt-32 pb-[140px]">
            {/* Header */}
            <div className="mb-10">
                <h1 className="mb-2 text-[42px] font-bold tracking-tight text-white">Customize Your Essay</h1>
                <p className="mb-6 text-[20px] font-medium text-red-500">Fine-tune the parameters for your Custom</p>

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
                    <span className="text-[18px] font-bold text-white">{org.essayType || "Custom"}</span>
                </div>
            </div>

            {/* Word Count */}
            <div className="mb-10">
                <h2 className="mb-1 text-[18px] font-bold text-white">Word Count</h2>
                <p className="mb-4 text-[13px] text-white/60">The number of words you want your essay to be</p>
                <div className="grid grid-cols-4 gap-4">
                    {WORD_COUNTS.map((wc) => (
                        <button
                            key={wc}
                            onClick={() => setWordCount(wc)}
                            className={`flex flex-col items-center justify-center rounded-2xl py-5 transition-all duration-200 ${wordCount === wc
                                ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                                : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/10"
                                }`}
                        >
                            <span className={`text-[24px] font-bold ${wordCount === wc ? "text-white" : "text-white"}`}>
                                {wc}
                            </span>
                            {wc !== "Custom" && (
                                <span className={`text-[12px] opacity-80 ${wordCount === wc ? "text-white" : "text-white/50"}`}>
                                    words
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Citation Style */}
            <div className="mb-10">
                <h2 className="mb-1 text-[18px] font-bold text-white">Citation Style</h2>
                <p className="mb-4 text-[13px] text-white/60">The citation style you want to use for your essay</p>
                <div className="grid grid-cols-3 gap-4">
                    {CITATION_STYLES.map((style) => (
                        <button
                            key={style.name}
                            disabled={style.comingSoon}
                            onClick={() => !style.comingSoon && setCitationStyle(style.name)}
                            className={`relative flex flex-col items-center justify-center rounded-2xl py-5 transition-all duration-200 ${citationStyle === style.name
                                ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                                : style.comingSoon
                                    ? "bg-white/[0.01] border border-white/[0.02] cursor-not-allowed opacity-40"
                                    : "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/10"
                                }`}
                        >
                            {style.comingSoon && (
                                <div className="absolute top-2 right-2 rounded-full bg-blue-500 px-2 py-0.5 text-[9px] font-bold text-white tracking-wider">
                                    Coming Soon
                                </div>
                            )}
                            <span className={`text-[18px] font-bold ${citationStyle === style.name ? "text-white" : style.comingSoon ? "text-white/50" : "text-white"}`}>
                                {style.name}
                            </span>
                            <span className={`text-[11px] mt-1 ${citationStyle === style.name ? "text-white/90" : "text-white/40"}`}>
                                {style.desc}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Tone */}
            <div className="mb-10">
                <h2 className="mb-1 text-[18px] font-bold text-white">Tone</h2>
                <p className="mb-4 text-[13px] text-white/60">The tone you want to use for your essay</p>
                <div className="relative" ref={toneDropdownRef}>
                    <button
                        onClick={() => setIsToneDropdownOpen(!isToneDropdownOpen)}
                        className={`flex w-full items-center justify-between rounded-2xl border bg-white/[0.02] px-5 py-4 text-[15px] font-medium text-white outline-none transition-colors hover:border-white/15 ${isToneDropdownOpen ? "border-red-500/50" : "border-white/[0.08]"
                            }`}
                    >
                        {tone}
                        <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className={`text-white/30 transition-transform duration-200 ${isToneDropdownOpen ? "rotate-180" : ""}`}
                        >
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>

                    {/* Custom Dropdown Menu */}
                    {isToneDropdownOpen && (
                        <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414] shadow-2xl">
                            <div className="flex max-h-[300px] flex-col overflow-y-auto py-2">
                                {TONE_OPTIONS.map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => {
                                            setTone(t);
                                            setIsToneDropdownOpen(false);
                                        }}
                                        className={`flex items-center justify-between px-5 py-3 text-left text-[14px] transition-colors ${tone === t
                                            ? "bg-blue-600/90 font-medium text-white"
                                            : "text-white hover:bg-white/[0.04]"
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {tone === t && (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M20 6 9 17l-5-5" />
                                                </svg>
                                            )}
                                            {t}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sources */}
            <div className="mb-10">
                <h2 className="mb-1 text-[18px] font-bold text-white">Sources</h2>
                <p className="mb-4 text-[13px] text-white/60">
                    You can either bring your own URL or let our AI find sources for you. Make sure all URLs(even the URLs I found) can be previewed before proceeding to next step.
                </p>

                {/* Tabs */}
                <div className="flex w-full mb-6">
                    {SOURCE_TABS.map((tab, i) => (
                        <button
                            key={tab}
                            onClick={() => setSourcesTab(tab)}
                            className={`flex-1 flex flex-col items-center justify-center py-4 rounded-xl transition-all duration-200 ${sourcesTab === tab
                                ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                                : "hover:bg-white/[0.04] text-white/60 hover:text-white"
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                {i === 0 && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
                                        <path d="m9 10 2 2" /> <path d="m11 12 2 2" /> <path d="m13 10-2 2" />
                                    </svg>
                                )}
                                {i === 1 && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" /> <line x1="16" y1="13" x2="8" y2="13" /> <line x1="16" y1="17" x2="8" y2="17" />
                                    </svg>
                                )}
                                {i === 2 && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="6" /> <circle cx="12" cy="12" r="2" />
                                    </svg>
                                )}
                                <span className={`text-[14px] font-bold ${sourcesTab === tab ? "text-white" : ""}`}>{tab}</span>
                            </div>
                            <span className={`text-[11px] ${sourcesTab === tab ? "text-white/80" : "text-white/40"}`}>
                                0 sources
                            </span>
                        </button>
                    ))}
                </div>

                {/* Octopilot Search content */}
                {sourcesTab === "Octopilot Search" && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 self-end mb-2">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Enter keywords to search..."
                                    value={aiSearchKeywords}
                                    onChange={(e) => setAiSearchKeywords(e.target.value)}
                                    className="w-[300px] rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-4 pr-10 text-[13px] text-white outline-none placeholder-white/30 focus:border-white/20"
                                />
                                <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-white/10 p-1 text-white hover:bg-white/20">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8" /> <path d="m21 21-4.3-4.3" />
                                    </svg>
                                </button>
                            </div>
                            <button onClick={handleJasmineSearch} className="flex flex-col items-center justify-center rounded-xl bg-red-400 px-6 py-2 text-white shadow-[0_0_15px_rgba(248,113,113,0.3)] transition hover:bg-red-300 disabled:opacity-50">
                                <span className="flex items-center gap-1 text-[13px] font-bold">
                                    ✨ Let AI find sources
                                </span>
                                <span className="text-[9px] opacity-80">free searches remaining: 2</span>
                            </button>
                        </div>

                        {/* Dynamic Inputs */}
                        {manualSources.map((source, idx) => (
                            <div key={idx} className="relative w-full">
                                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
                                    {source.status === "loading" ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-red-500" />
                                    ) : source.status === "scraped" ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 6 9 17l-5-5" />
                                        </svg>
                                    ) : source.status === "failed" ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                        </svg>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    placeholder="Enter source URL or reference..."
                                    value={source.url}
                                    onChange={(e) => updateSourceUrl(idx, e.target.value)}
                                    className={`w-full rounded-2xl border bg-white/[0.02] py-4 pl-11 pr-14 text-[14px] text-white outline-none placeholder-white/30 transition hover:bg-white/[0.03] focus:border-white/20 ${source.status === 'failed' ? 'border-red-500/50' : 'border-white/[0.08]'}`}
                                />

                                {source.status === "scraped" && (
                                    <button
                                        onClick={() => { setSelectedSourceDetail(source); setDetailPage(0); setShowDetailsModal(true); }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] bg-white/[0.02] text-white/40 hover:bg-white/10 hover:text-white"
                                        title="View Source Details"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="11" cy="11" r="8" /> <path d="m21 21-4.3-4.3" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ))}

                        <button onClick={handleAddSource} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.01] py-4 text-[14px] font-semibold text-white/60 transition hover:border-white/20 hover:bg-white/[0.03] hover:text-white">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-red-500">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 5v14" /><path d="M5 12h14" />
                                </svg>
                            </div>
                            Add another source
                        </button>
                    </div>
                )}

                {/* Use My Source content */}
                {sourcesTab === "Use My Source" && (
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                        <h3 className="text-[22px] font-bold text-white">Use My Source</h3>
                        <p className="mt-2 max-w-3xl text-[14px] text-white/70">
                            Upload primary research artifacts and reuse them as supporting material.
                        </p>

                        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                            <button
                                onClick={openPdfPicker}
                                disabled={isPdfUploading}
                                className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3.5 text-[16px] font-bold text-white shadow-[0_0_20px_rgba(239,68,68,0.28)] transition hover:bg-red-400 disabled:opacity-60"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                {isPdfUploading ? "Reading PDF..." : "Upload PDF"}
                            </button>
                            <button
                                disabled
                                className="cursor-not-allowed rounded-full border border-white/20 bg-white/[0.04] px-6 py-3.5 text-[16px] font-bold text-white/50"
                            >
                                Upload Images
                            </button>
                        </div>
                        <p className="mt-4 text-center text-[13px] text-white/45">
                            We only support single PDF upload for now.
                        </p>

                        <input
                            ref={pdfInputRef}
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={handlePdfUpload}
                            className="hidden"
                        />

                        {uploadedPdfSources.length > 0 && (
                            <div className="mt-8 space-y-3">
                                <h4 className="text-[16px] font-bold text-white/90">Added PDF Sources</h4>
                                {uploadedPdfSources.map((pdf) => (
                                    <div key={pdf.id} className="rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
                                        <div className="text-[14px] font-semibold text-white">{pdf.fileName}</div>
                                        <div className="mt-1 text-[12px] text-white/60">Pages: {pdf.pageRange}</div>
                                        <div className="mt-2 text-[12px] text-white/80">{pdf.citation}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {sourcesTab === "Fieldwork Mode" && (
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
                        <h3 className="text-[22px] font-bold text-white">Fieldwork Mode</h3>
                        <p className="mt-2 text-[14px] text-white/60">Coming soon.</p>
                    </div>
                )}
            </div>

            {/* Keywords Toggle */}
            <div className="mb-6 flex flex-col pt-4">
                <h2 className="mb-4 text-[16px] font-bold text-white">Do you want to specify keywords to be included in your essay?</h2>
                <div className="flex gap-4">
                    <button
                        onClick={() => setSpecifyKeywords(true)}
                        className={`flex flex-1 items-center justify-center gap-3 rounded-2xl py-4 font-bold transition-all duration-200 ${specifyKeywords
                            ? "bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                            : "bg-white/[0.03] border border-white/[0.06] text-white/60 hover:bg-white/[0.05]"
                            }`}
                    >
                        {specifyKeywords && (
                            <div className="h-3 w-3 rounded-full bg-white" />
                        )}
                        Yes
                    </button>
                    <button
                        onClick={() => setSpecifyKeywords(false)}
                        className={`flex flex-1 items-center justify-center gap-3 rounded-2xl py-4 font-bold transition-all duration-200 ${!specifyKeywords
                            ? "bg-[#332222] border border-red-500/30 text-white"
                            : "bg-white/[0.03] border border-white/[0.06] text-white/60 hover:bg-white/[0.05]"
                            }`}
                    >
                        {!specifyKeywords && (
                            <div className="h-3 w-3 rounded-full bg-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                        )}
                        No
                    </button>
                </div>
            </div>

            {/* Keyword Input Box (visible when Yes) */}
            {specifyKeywords && (
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="Enter keywords separated by commas (e.g. AI, machine learning, neural networks)"
                        value={keywordsText}
                        onChange={(e) => setKeywordsText(e.target.value)}
                        className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] py-4 px-5 text-[14px] text-white outline-none placeholder-white/30 transition hover:bg-white/[0.03] focus:border-red-500/50"
                    />
                </div>
            )}

            {/* Fixed Bottom bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[#0a0a0a]/95 px-10 backdrop-blur-md">
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
                        onClick={() => {
                            // Save all config to Organizer
                            Organizer.set({
                                wordCount,
                                citationStyle,
                                tone,
                                sourcesTab,
                                aiSearchKeywords,
                                manualSources,
                                keywords: specifyKeywords ? keywordsText : "",
                            });

                            // Kick off Scarlet in background
                            ScarletService.compactAllSources().catch(err =>
                                console.error("[Scarlet] Background compaction error:", err)
                            );

                            // Skip Format page if citation is "None"
                            if (citationStyle === "None") {
                                onNext("generation");
                            } else {
                                onNext("format");
                            }
                        }}
                        className="group flex flex-[2] items-center justify-center gap-2 overflow-hidden relative rounded-xl bg-red-500 py-4 text-[15px] font-bold text-white shadow-[0_0_20px_rgba(239,68,68,0.25)] transition hover:bg-red-400"
                    >
                        Continue
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                            <path d="m9 18 6-6-6-6" />
                        </svg>
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out" />
                    </button>
                </div>
            </div>

            {/* ---> MODALS <--- */}

            {/* Use My Source PDF Modal */}
            {showPdfModal && pdfData && renderModal(
                <div className="fixed inset-0 z-[2147483640] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                    <div className="flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/[0.1] bg-[#101015] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                        <div className="flex items-center justify-between border-b border-white/[0.08] px-8 py-5">
                            <div>
                                <div className="text-[24px] font-bold text-white">{pdfData.fileName}</div>
                                <div className="text-[12px] text-white/50">{pdfData.pageCount} pages • {citationStyle}</div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className={`flex items-center gap-2 text-[13px] font-semibold ${pdfStep === 1 ? "text-white" : "text-white/35"}`}>
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] ${pdfStep === 1 ? "bg-red-500 text-white" : "bg-white/10 text-white/50"}`}>1</span>
                                    Citation Info
                                </div>
                                <div className="text-white/30">›</div>
                                <div className={`flex items-center gap-2 text-[13px] font-semibold ${pdfStep === 2 ? "text-white" : "text-white/35"}`}>
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] ${pdfStep === 2 ? "bg-red-500 text-white" : "bg-white/10 text-white/50"}`}>2</span>
                                    Review & Edit
                                </div>
                            </div>
                            <button
                                onClick={resetPdfFlow}
                                className="rounded-full bg-white/[0.08] p-2 text-white/60 hover:bg-white/[0.16] hover:text-white"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
                            {pdfStep === 1 ? (
                                <div className="space-y-5">
                                    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                        <h4 className="text-[18px] font-bold text-white">Page Selection</h4>
                                        <p className="mt-1 text-[14px] text-white/60">Select the page range you want to cite from this PDF.</p>
                                        <div className="mt-4 grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="mb-2 block text-[13px] text-white/70">Start Page</label>
                                                <div className="relative">
                                                    <select
                                                        value={pdfStartPage}
                                                        onChange={(e) => setPdfStartPage(Number(e.target.value))}
                                                        className="w-full appearance-none rounded-xl border border-white/[0.16] bg-[#171b24] px-4 py-3 pr-10 text-[14px] font-medium text-white outline-none transition focus:border-red-400/70"
                                                    >
                                                        {Array.from({ length: pdfData.pageCount }, (_, idx) => idx + 1).map((page) => (
                                                            <option key={`start-${page}`} value={page}>Page {page}</option>
                                                        ))}
                                                    </select>
                                                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/55" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="m6 9 6 6 6-6" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-[13px] text-white/70">End Page</label>
                                                <div className="relative">
                                                    <select
                                                        value={pdfEndPage}
                                                        onChange={(e) => setPdfEndPage(Number(e.target.value))}
                                                        className="w-full appearance-none rounded-xl border border-white/[0.16] bg-[#171b24] px-4 py-3 pr-10 text-[14px] font-medium text-white outline-none transition focus:border-red-400/70"
                                                    >
                                                        {Array.from({ length: pdfData.pageCount }, (_, idx) => idx + 1)
                                                            .filter((page) => page >= pdfStartPage)
                                                            .map((page) => (
                                                                <option key={`end-${page}`} value={page}>Page {page}</option>
                                                            ))}
                                                    </select>
                                                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/55" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="m6 9 6 6 6-6" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                        <h4 className="text-[18px] font-bold text-white">Authors</h4>
                                        <div className="mt-4 space-y-3">
                                            {pdfAuthors.map((author, idx) => (
                                                <div key={`author-${idx}`} className="grid grid-cols-2 gap-3">
                                                    <input
                                                        placeholder="First Name"
                                                        value={author.firstName}
                                                        onChange={(e) => updatePdfAuthor(idx, "firstName", e.target.value)}
                                                        className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                    />
                                                    <input
                                                        placeholder="Last Name"
                                                        value={author.lastName}
                                                        onChange={(e) => updatePdfAuthor(idx, "lastName", e.target.value)}
                                                        className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={addPdfAuthorRow}
                                            className="mt-3 inline-flex items-center gap-2 text-[14px] font-semibold text-red-400 hover:text-red-300"
                                        >
                                            <span className="text-[18px] leading-none">+</span>
                                            Add another author
                                        </button>
                                    </section>

                                    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                        <h4 className="text-[18px] font-bold text-white">Required Information</h4>
                                        <div className="mt-4 space-y-3">
                                            <div>
                                                <label className="mb-1 block text-[13px] text-white/70">Document Title *</label>
                                                <input
                                                    value={pdfDocumentTitle}
                                                    onChange={(e) => setPdfDocumentTitle(e.target.value)}
                                                    placeholder="Enter the title of the document"
                                                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[13px] text-white/70">Publication Year *</label>
                                                <input
                                                    value={pdfPublicationYear}
                                                    onChange={(e) => setPdfPublicationYear(e.target.value)}
                                                    placeholder="e.g. 2024"
                                                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[13px] text-white/70">Journal Name</label>
                                                <input
                                                    value={pdfJournalName}
                                                    onChange={(e) => setPdfJournalName(e.target.value)}
                                                    placeholder="Enter journal name (if applicable)"
                                                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[13px] text-white/70">Publisher</label>
                                                <input
                                                    value={pdfPublisher}
                                                    onChange={(e) => setPdfPublisher(e.target.value)}
                                                    placeholder="Enter publisher name (if applicable)"
                                                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                />
                                            </div>
                                            {!pdfJournalName.trim() && !pdfPublisher.trim() && (
                                                <p className="text-[12px] text-red-300">Journal Name or Publisher is required.</p>
                                            )}
                                        </div>
                                    </section>

                                    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                        <h4 className="text-[18px] font-bold text-white">Optional Information</h4>
                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <input
                                                value={pdfVolume}
                                                onChange={(e) => setPdfVolume(e.target.value)}
                                                placeholder="Volume"
                                                className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                            />
                                            <input
                                                value={pdfIssue}
                                                onChange={(e) => setPdfIssue(e.target.value)}
                                                placeholder="Issue"
                                                className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                            />
                                            <input
                                                value={pdfEdition}
                                                onChange={(e) => setPdfEdition(e.target.value)}
                                                placeholder="Edition"
                                                className="col-span-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                            />
                                        </div>
                                    </section>

                                    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <h4 className="text-[18px] font-bold text-white">Citation Preview</h4>
                                            <button
                                                onClick={handleAskSpoonie}
                                                disabled={isCitationLoading}
                                                className="inline-flex items-center gap-2 rounded-full border border-[#c9ad3a]/50 bg-[#5a4f16]/55 px-3.5 py-1.5 text-[12px] font-semibold text-[#f6e08a] transition hover:bg-[#6e611a]/65 disabled:opacity-60"
                                            >
                                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#f6e08a]/50 bg-black/35 text-[10px] text-[#f6e08a]">
                                                    icon
                                                </span>
                                                Ask Spoonie
                                            </button>
                                        </div>
                                        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[15px] text-white">
                                            {isCitationLoading ? "Spoonie is generating citation..." : (pdfCitationPreview || "Click Ask Spoonie to generate preview.")}
                                        </div>
                                        {citationError && (
                                            <p className="mt-2 text-[12px] text-yellow-200">{citationError}</p>
                                        )}
                                    </section>
                                </div>
                            ) : (
                                <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px] gap-5">
                                    <section className="min-h-0 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <h4 className="text-[18px] font-bold text-white">Extracted Text</h4>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setPdfReviewPage((prev) => Math.max(1, prev - 1))}
                                                    disabled={pdfReviewPage <= 1}
                                                    className="rounded-full bg-white/[0.08] px-3 py-1 text-sm text-white disabled:opacity-35"
                                                >
                                                    ‹
                                                </button>
                                                <span className="text-[13px] text-white/70">
                                                    Page {pdfStartPage + pdfReviewPage - 1} of {pdfEndPage}
                                                </span>
                                                <button
                                                    onClick={() => setPdfReviewPage((prev) => Math.min(selectedPdfTexts.length, prev + 1))}
                                                    disabled={pdfReviewPage >= selectedPdfTexts.length}
                                                    className="rounded-full bg-white/[0.08] px-3 py-1 text-sm text-white disabled:opacity-35"
                                                >
                                                    ›
                                                </button>
                                            </div>
                                        </div>
                                        <div className="h-[58vh] overflow-y-auto rounded-xl border border-white/[0.08] bg-black/25 p-3 text-[13px] leading-relaxed text-white/90">
                                            {selectedPdfTexts[pdfReviewPage - 1] || "No text extracted for this page."}
                                        </div>
                                    </section>

                                    <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
                                        <h4 className="text-[18px] font-bold text-white">Generated Citation</h4>
                                        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-[14px] text-white">
                                            {isCitationLoading ? "Generating..." : (pdfCitationPreview || "No citation yet")}
                                        </div>
                                        <div className="mt-4 grid grid-cols-[90px_1fr] gap-x-2 gap-y-2 text-[12px] text-white/75">
                                            <span className="text-white/45">Title</span><span>{pdfDocumentTitle || "—"}</span>
                                            <span className="text-white/45">Author(s)</span><span>{pdfAuthorString || "—"}</span>
                                            <span className="text-white/45">Year</span><span>{pdfPublicationYear || "—"}</span>
                                            <span className="text-white/45">Publisher</span><span>{pdfJournalName || pdfPublisher || "—"}</span>
                                            <span className="text-white/45">Pages</span><span>{pdfStartPage}-{pdfEndPage}</span>
                                        </div>
                                    </section>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/[0.08] bg-black/25 px-8 py-4">
                            <button
                                onClick={() => {
                                    if (pdfStep === 1) resetPdfFlow();
                                    else setPdfStep(1);
                                }}
                                className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-7 py-2.5 text-[14px] font-semibold text-white/80 hover:bg-white/[0.06]"
                            >
                                {pdfStep === 1 ? "Cancel" : "Back"}
                            </button>

                            {pdfStep === 1 ? (
                                <button
                                    onClick={goToPdfReview}
                                    className="rounded-xl bg-red-500 px-8 py-2.5 text-[14px] font-bold text-white shadow-[0_0_18px_rgba(239,68,68,0.25)] hover:bg-red-400"
                                >
                                    Next
                                </button>
                            ) : (
                                <button
                                    onClick={savePdfAsSource}
                                    className="rounded-xl bg-red-500 px-8 py-2.5 text-[14px] font-bold text-white shadow-[0_0_18px_rgba(239,68,68,0.25)] hover:bg-red-400"
                                >
                                    Save as Source
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Jasmine Searching Modal */}
            {isSearching && renderModal(
                <div className="fixed inset-0 z-[2147483640] flex items-center justify-center pt-[10vh] bg-black/60 p-4 backdrop-blur-sm">
                    <div className="flex w-full max-w-sm flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#121212] p-8 text-center shadow-2xl">
                        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-red-500"></div>
                        <h3 className="mb-2 text-xl font-bold text-white">Jasmine is Searching...</h3>
                        <p className="text-sm text-white/50">Finding credible academic sources for your essay.</p>
                    </div>
                </div>
            )}

            {/* Scrape Failure Manual Override Modal */}
            {showFailedModal && currentFailedSource && renderModal(
                <div className="fixed inset-0 z-[2147483640] flex items-center justify-center pt-[10vh] bg-black/70 p-4 backdrop-blur-md">
                    <div className="flex w-full max-w-2xl flex-col rounded-3xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden">
                        <div className="bg-red-500/10 border-b border-red-500/20 px-8 py-5">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                Scrape Failed
                            </h3>
                            <p className="mt-1 text-sm text-red-100/60">We tried our best getting information from the following source:</p>
                            <p className="mt-1 text-sm text-red-400 break-all">{currentFailedSource.url}</p>
                            <p className="mt-2 text-sm text-white/80 font-medium">You can still manually define your source content.</p>
                        </div>

                        <div className="p-8 flex flex-col gap-4 overflow-y-auto max-h-[45vh]">
                            <input type="text" placeholder="Title" value={currentFailedSource.title || ""} onChange={e => setCurrentFailedSource({ ...currentFailedSource, title: e.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] py-3 px-4 text-[14px] text-white outline-none focus:border-white/20" />
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Author" value={currentFailedSource.author || ""} onChange={e => setCurrentFailedSource({ ...currentFailedSource, author: e.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] py-3 px-4 text-[14px] text-white outline-none focus:border-white/20" />
                                <input type="text" placeholder="Published Year" value={currentFailedSource.publishedYear || ""} onChange={e => setCurrentFailedSource({ ...currentFailedSource, publishedYear: e.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] py-3 px-4 text-[14px] text-white outline-none focus:border-white/20" />
                            </div>
                            <input type="text" placeholder="Publisher" value={currentFailedSource.publisher || ""} onChange={e => setCurrentFailedSource({ ...currentFailedSource, publisher: e.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] py-3 px-4 text-[14px] text-white outline-none focus:border-white/20" />
                            <textarea placeholder="Paste full content of the source here..." value={currentFailedSource.fullContent || ""} onChange={e => setCurrentFailedSource({ ...currentFailedSource, fullContent: e.target.value })} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] py-3 px-4 text-[14px] text-white outline-none focus:border-white/20 min-h-[150px] resize-y" />
                        </div>

                        <div className="flex gap-4 px-8 py-5 border-t border-white/[0.06] bg-black/20">
                            <button onClick={() => removeManualSource(currentFailedSource.url)} className="flex-1 rounded-xl border border-white/[0.08] bg-transparent py-3 text-sm font-bold text-white hover:bg-white/[0.05]">Remove this source</button>
                            <button onClick={() => saveManualSource(currentFailedSource)} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Source Details Modal */}
            {showDetailsModal && selectedSourceDetail && renderModal(
                <div className="fixed inset-0 z-[2147483640] flex items-center justify-center pt-[10vh] bg-black/70 p-4 backdrop-blur-md">
                    <div className="flex w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-[#141414] shadow-2xl overflow-hidden max-h-[75vh]">
                        <div className="border-b border-white/[0.06] px-8 py-5 flex justify-between items-center bg-black/20">
                            <h3 className="text-xl font-bold text-white">Source Data</h3>
                            <button onClick={() => setShowDetailsModal(false)} className="text-white/40 hover:text-white">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto">
                            <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                                <div><span className="text-white/40 block mb-1">Title</span><span className="text-white font-medium">{selectedSourceDetail.title || "—"}</span></div>
                                <div><span className="text-white/40 block mb-1">Author</span><span className="text-white font-medium">{selectedSourceDetail.author || "—"}</span></div>
                                <div><span className="text-white/40 block mb-1">Publisher</span><span className="text-white font-medium">{selectedSourceDetail.publisher || "—"}</span></div>
                                <div><span className="text-white/40 block mb-1">Published Year</span><span className="text-white font-medium">{selectedSourceDetail.publishedYear || "—"}</span></div>
                                <div className="col-span-2"><span className="text-white/40 block mb-1">URL</span><a href={selectedSourceDetail.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">{selectedSourceDetail.url}</a></div>
                            </div>

                            <div className="border-t border-white/[0.06] pt-6">
                                <span className="text-white/40 block mb-3 text-sm">Full Content snippet (Preview)</span>
                                <div className="text-[13px] leading-relaxed text-white/70 whitespace-pre-wrap bg-white/[0.02] p-4 rounded-xl border border-white/[0.03]">
                                    {selectedSourceDetail.fullContent
                                        ? selectedSourceDetail.fullContent.slice(detailPage * 1000, (detailPage + 1) * 1000) + (selectedSourceDetail.fullContent.length > (detailPage + 1) * 1000 ? "..." : "")
                                        : "No extracted content available."}
                                </div>

                                {/* Pagination Controls */}
                                {selectedSourceDetail.fullContent && selectedSourceDetail.fullContent.length > 1000 && (
                                    <div className="flex items-center justify-between mt-4">
                                        <button disabled={detailPage === 0} onClick={() => setDetailPage(p => p - 1)} className="px-3 py-1 text-xs rounded bg-white/10 text-white disabled:opacity-30">Previous</button>
                                        <span className="text-xs text-white/50">Page {detailPage + 1} of {Math.ceil(selectedSourceDetail.fullContent.length / 1000)}</span>
                                        <button disabled={(detailPage + 1) * 1000 >= selectedSourceDetail.fullContent.length} onClick={() => setDetailPage(p => p + 1)} className="px-3 py-1 text-xs rounded bg-white/10 text-white disabled:opacity-30">Next</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
