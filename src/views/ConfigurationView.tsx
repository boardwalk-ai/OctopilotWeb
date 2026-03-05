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
import { SpoonieAuthorInput, SpoonieFieldworkCitationInput, SpoonieService } from "@/services/SpoonieService";
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
    sourceIndex: number;
    source: SourceData;
    fileName: string;
    pageCount: number;
    pageRange: string;
    citation: string;
};

type PdfModalMode = "create" | "view" | "edit";
type ImageModalMode = "create" | "view" | "edit";

type ImageCitationContributor = {
    firstName: string;
    middleName: string;
    lastName: string;
    suffix: string;
};

type ImageSourceThread = {
    id: string;
    sourceIndex: number;
    source: SourceData;
    sourceLabel: string;
    imageCount: number;
    finalSnippet: string;
    citation: string;
};

type FieldworkModalMode = "create" | "view" | "edit";
type FieldworkResearchType =
    | "survey"
    | "interview"
    | "observation"
    | "lab_experiment"
    | "case_study"
    | "content_analysis"
    | "action_research"
    | "fieldwork_project"
    | "creative_based_research";

type FieldworkFieldKey =
    | "sampleSize"
    | "toolUsed"
    | "audience"
    | "interviewee"
    | "interviewMode"
    | "interviewContext"
    | "observedSubject"
    | "observationSetting"
    | "observationDuration"
    | "variables"
    | "materials"
    | "caseSubject"
    | "caseOrganization"
    | "contentType"
    | "contentCorpus"
    | "actionCycle"
    | "intervention"
    | "siteName"
    | "communityPartner"
    | "creativeMedium"
    | "artifactTitle";

type FieldworkFormState = {
    researchType: FieldworkResearchType;
    title: string;
    dateConducted: string;
    researcherName: string;
    location: string;
    participants: string;
    methodSummary: string;
    keyFindings: string;
    notes: string;
    sampleSize: string;
    toolUsed: string;
    audience: string;
    interviewee: string;
    interviewMode: string;
    interviewContext: string;
    observedSubject: string;
    observationSetting: string;
    observationDuration: string;
    variables: string;
    materials: string;
    caseSubject: string;
    caseOrganization: string;
    contentType: string;
    contentCorpus: string;
    actionCycle: string;
    intervention: string;
    siteName: string;
    communityPartner: string;
    creativeMedium: string;
    artifactTitle: string;
};

type FieldworkSourceThread = {
    id: string;
    sourceIndex: number;
    source: SourceData;
    title: string;
    researchType: string;
    dateConducted: string;
    citation: string;
};

type FieldworkTypeOption = {
    id: FieldworkResearchType;
    label: string;
    desc: string;
    fields: Array<{ key: FieldworkFieldKey; label: string; placeholder: string }>;
};

const FIELDWORK_TYPE_OPTIONS: FieldworkTypeOption[] = [
    {
        id: "survey",
        label: "Survey",
        desc: "Google Forms, questionnaires, structured polls",
        fields: [
            { key: "toolUsed", label: "Survey Tool", placeholder: "Google Forms, paper form, Typeform..." },
            { key: "sampleSize", label: "Sample Size", placeholder: "e.g. 42 respondents" },
            { key: "audience", label: "Target Audience", placeholder: "Who completed the survey?" },
        ],
    },
    {
        id: "interview",
        label: "Interview",
        desc: "In-person, phone, or email conversations",
        fields: [
            { key: "interviewee", label: "Interviewee", placeholder: "Name or role of interviewee" },
            { key: "interviewMode", label: "Interview Mode", placeholder: "In person, Zoom, phone..." },
            { key: "interviewContext", label: "Interview Context", placeholder: "Why this person was interviewed" },
        ],
    },
    {
        id: "observation",
        label: "Observation",
        desc: "Watching actions in real contexts",
        fields: [
            { key: "observedSubject", label: "Observed Subject", placeholder: "Who or what did you observe?" },
            { key: "observationSetting", label: "Observation Setting", placeholder: "Classroom, street market, lab..." },
            { key: "observationDuration", label: "Observation Duration", placeholder: "e.g. 2 hours" },
        ],
    },
    {
        id: "lab_experiment",
        label: "Lab Experiment",
        desc: "Scientific testing with variables",
        fields: [
            { key: "variables", label: "Variables", placeholder: "Independent and dependent variables" },
            { key: "materials", label: "Materials / Equipment", placeholder: "Tools, software, or materials used" },
            { key: "toolUsed", label: "Protocol / Tool", placeholder: "Experiment protocol or measuring tool" },
        ],
    },
    {
        id: "case_study",
        label: "Case Study",
        desc: "Deep dive into one subject",
        fields: [
            { key: "caseSubject", label: "Case Subject", placeholder: "Person, company, event, or issue" },
            { key: "caseOrganization", label: "Organization / Context", placeholder: "Institution or context" },
            { key: "audience", label: "Study Scope", placeholder: "Scope or boundary of the case" },
        ],
    },
    {
        id: "content_analysis",
        label: "Content Analysis",
        desc: "Study of media, ads, or documents",
        fields: [
            { key: "contentType", label: "Content Type", placeholder: "Ads, tweets, newspaper articles..." },
            { key: "contentCorpus", label: "Corpus / Dataset", placeholder: "What set of materials was analyzed?" },
            { key: "toolUsed", label: "Coding Method", placeholder: "Coding framework or method" },
        ],
    },
    {
        id: "action_research",
        label: "Action Research",
        desc: "Plan → Act → Observe → Reflect cycles",
        fields: [
            { key: "actionCycle", label: "Action Cycle", placeholder: "Cycle or phase completed" },
            { key: "intervention", label: "Intervention", placeholder: "What action was introduced?" },
            { key: "siteName", label: "Site / Setting", placeholder: "School, team, workshop..." },
        ],
    },
    {
        id: "fieldwork_project",
        label: "Fieldwork Project",
        desc: "Community engagement + data collection",
        fields: [
            { key: "siteName", label: "Site Name", placeholder: "Field site, village, district..." },
            { key: "communityPartner", label: "Community Partner", placeholder: "Partner organization or group" },
            { key: "toolUsed", label: "Collection Method", placeholder: "Notes, recordings, mapping..." },
        ],
    },
    {
        id: "creative_based_research",
        label: "Creative-Based Research",
        desc: "Films, scripts, or design with reflection",
        fields: [
            { key: "creativeMedium", label: "Creative Medium", placeholder: "Film, storyboard, prototype..." },
            { key: "artifactTitle", label: "Artifact / Output", placeholder: "Title of the creative output" },
            { key: "audience", label: "Reflection Focus", placeholder: "What insight did the creative work explore?" },
        ],
    },
];

const EMPTY_FIELDWORK_FORM: FieldworkFormState = {
    researchType: "survey",
    title: "",
    dateConducted: "",
    researcherName: "",
    location: "",
    participants: "",
    methodSummary: "",
    keyFindings: "",
    notes: "",
    sampleSize: "",
    toolUsed: "",
    audience: "",
    interviewee: "",
    interviewMode: "",
    interviewContext: "",
    observedSubject: "",
    observationSetting: "",
    observationDuration: "",
    variables: "",
    materials: "",
    caseSubject: "",
    caseOrganization: "",
    contentType: "",
    contentCorpus: "",
    actionCycle: "",
    intervention: "",
    siteName: "",
    communityPartner: "",
    creativeMedium: "",
    artifactTitle: "",
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
    const [pdfModalMode, setPdfModalMode] = useState<PdfModalMode>("create");
    const [activePdfSourceIndex, setActivePdfSourceIndex] = useState<number | null>(null);
    const [pdfStep, setPdfStep] = useState<1 | 2>(1);
    const [pdfData, setPdfData] = useState<PdfExtractResponse | null>(null);
    const [pdfPages, setPdfPages] = useState<string[]>([]);
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
    const [isStartPageDropdownOpen, setIsStartPageDropdownOpen] = useState(false);
    const [isEndPageDropdownOpen, setIsEndPageDropdownOpen] = useState(false);
    const [sourceUploadHoverHint, setSourceUploadHoverHint] = useState<"" | "pdf" | "images">("");
    // Use My Source - Image OCR flow
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [showImageModal, setShowImageModal] = useState(false);
    const [imageModalMode, setImageModalMode] = useState<ImageModalMode>("create");
    const [activeImageSourceIndex, setActiveImageSourceIndex] = useState<number | null>(null);
    const [imageStep, setImageStep] = useState<1 | 2 | 3>(1);
    const [imageFiles, setImageFiles] = useState<Array<{ name: string; src: string }>>([]);
    const [imageTotalCount, setImageTotalCount] = useState(0);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [imageBufferText, setImageBufferText] = useState("");
    const [imageFinalSnippet, setImageFinalSnippet] = useState("");
    const [imageConfirmedSnippets, setImageConfirmedSnippets] = useState<string[]>([]);
    const [imageZoom, setImageZoom] = useState(1);
    const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
    const [isImagePanning, setIsImagePanning] = useState(false);
    const [isScanningImage, setIsScanningImage] = useState(false);
    const [imageCitationKind, setImageCitationKind] = useState<"book" | "journal">("book");
    const [imageCitationContributors, setImageCitationContributors] = useState<ImageCitationContributor[]>([
        { firstName: "", middleName: "", lastName: "", suffix: "" },
    ]);
    const [imageCitationTitle, setImageCitationTitle] = useState("");
    const [imageCitationArticleTitle, setImageCitationArticleTitle] = useState("");
    const [imageCitationJournalTitle, setImageCitationJournalTitle] = useState("");
    const [imageCitationPublicationYear, setImageCitationPublicationYear] = useState("");
    const [imageCitationPublisher, setImageCitationPublisher] = useState("");
    const [imageCitationVolume, setImageCitationVolume] = useState("");
    const [imageCitationIssue, setImageCitationIssue] = useState("");
    const [imageCitationPageRange, setImageCitationPageRange] = useState("");
    const [imageCitationPreview, setImageCitationPreview] = useState("");
    const [imageCitationError, setImageCitationError] = useState("");
    const [isImageCitationLoading, setIsImageCitationLoading] = useState(false);
    const [imageSourceLabel, setImageSourceLabel] = useState("");
    const [showFieldworkModal, setShowFieldworkModal] = useState(false);
    const [fieldworkModalMode, setFieldworkModalMode] = useState<FieldworkModalMode>("create");
    const [activeFieldworkSourceIndex, setActiveFieldworkSourceIndex] = useState<number | null>(null);
    const [fieldworkForm, setFieldworkForm] = useState<FieldworkFormState>(EMPTY_FIELDWORK_FORM);
    const [fieldworkCitationPreview, setFieldworkCitationPreview] = useState("");
    const [fieldworkCitationError, setFieldworkCitationError] = useState("");
    const [isSavingFieldwork, setIsSavingFieldwork] = useState(false);
    const [canUsePortal, setCanUsePortal] = useState(false);

    const isInitialMount = useRef(true);
    const toneDropdownRef = useRef<HTMLDivElement>(null);
    const pageDropdownRef = useRef<HTMLDivElement>(null);
    const imagePanStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
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

    useEffect(() => {
        if (!isStartPageDropdownOpen && !isEndPageDropdownOpen) return;
        const close = (e: MouseEvent) => {
            if (pageDropdownRef.current && !pageDropdownRef.current.contains(e.target as Node)) {
                setIsStartPageDropdownOpen(false);
                setIsEndPageDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [isEndPageDropdownOpen, isStartPageDropdownOpen]);

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
        if (!pdfPages.length) return [];
        return pdfPages.slice(pdfStartPage - 1, pdfEndPage);
    }, [pdfEndPage, pdfPages, pdfStartPage]);

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
            .map((src, sourceIndex) => ({ src, sourceIndex }))
            .filter(({ src }) => src.manualSourceType === "pdf" || src.url.startsWith("pdf://"))
            .map(({ src, sourceIndex }, idx) => {
                const fileName = src.pdfMeta?.fileName
                    || decodeURIComponent(src.url.replace(/^pdf:\/\//, "").split("#")[0] || "Document.pdf");
                const pageRange = src.pdfMeta
                    ? `${src.pdfMeta.startPage}-${src.pdfMeta.endPage}`
                    : (src.url.split("#pages=")[1] || "N/A");
                return {
                    id: `${src.url}-${sourceIndex}`,
                    sourceIndex,
                    source: src,
                    fileName,
                    pageCount: src.pdfMeta?.pageCount || 0,
                    pageRange,
                    citation: src.pdfMeta?.citationPreview || CitationTemplateService.formatReference(citationStyle, src, idx + 1),
                };
            });
    }, [citationStyle, manualSources]);

    const searchSourceEntries = useMemo(() => {
        return manualSources
            .map((source, sourceIndex) => ({ source, sourceIndex }))
            .filter(({ source }) => source.manualSourceType !== "pdf" && source.manualSourceType !== "image" && source.manualSourceType !== "fieldwork");
    }, [manualSources]);

    const imageSourceThreads = useMemo<ImageSourceThread[]>(() => {
        return manualSources
            .map((source, sourceIndex) => ({ source, sourceIndex }))
            .filter(({ source }) => source.manualSourceType === "image")
            .map(({ source, sourceIndex }) => {
                const sourceLabel = source.imageMeta?.sourceLabel || source.title || `Image Source ${sourceIndex + 1}`;
                const finalSnippet = source.imageMeta?.finalSnippet || source.fullContent || "";
                return {
                    id: `${source.url}-${sourceIndex}`,
                    sourceIndex,
                    source,
                    sourceLabel,
                    imageCount: source.imageMeta?.imageCount || 0,
                    finalSnippet,
                    citation: source.imageMeta?.citationPreview || CitationTemplateService.formatReference(citationStyle, source, sourceIndex + 1),
                };
            });
    }, [citationStyle, manualSources]);

    const fieldworkSourceThreads = useMemo<FieldworkSourceThread[]>(() => {
        return manualSources
            .map((source, sourceIndex) => ({ source, sourceIndex }))
            .filter(({ source }) => source.manualSourceType === "fieldwork")
            .map(({ source, sourceIndex }) => ({
                id: `${source.url}-${sourceIndex}`,
                sourceIndex,
                source,
                title: source.fieldworkMeta?.title || source.title || `Fieldwork Entry ${sourceIndex + 1}`,
                researchType: FIELDWORK_TYPE_OPTIONS.find((option) => option.id === source.fieldworkMeta?.researchType)?.label || "Fieldwork",
                dateConducted: source.fieldworkMeta?.dateConducted || source.publishedYear || "",
                citation: source.fieldworkMeta?.citationPreview || CitationTemplateService.formatReference(citationStyle, source, sourceIndex + 1),
            }));
    }, [citationStyle, manualSources]);

    const sourceCountByTab = useMemo(() => ({
        "Octopilot Search": searchSourceEntries.filter(({ source }) => source.url.trim().length > 0).length,
        "Use My Source": uploadedPdfSources.length + imageSourceThreads.length,
        "Fieldwork Mode": fieldworkSourceThreads.length,
    }), [fieldworkSourceThreads.length, imageSourceThreads.length, searchSourceEntries, uploadedPdfSources.length]);

    const activeFieldworkType = useMemo(
        () => FIELDWORK_TYPE_OPTIONS.find((option) => option.id === fieldworkForm.researchType) || FIELDWORK_TYPE_OPTIONS[0],
        [fieldworkForm.researchType]
    );

    const canMoveToImageCitation = useMemo(() => imageFinalSnippet.trim().length > 0, [imageFinalSnippet]);
    const imageCurrentSrc = imageFiles[activeImageIndex]?.src || "";

    useEffect(() => {
        setImageZoom(1);
        setImagePan({ x: 0, y: 0 });
        setIsImagePanning(false);
    }, [activeImageIndex, imageCurrentSrc, showImageModal]);

    const beginImagePan = (event: React.MouseEvent<HTMLDivElement>) => {
        if (imageZoom <= 1 || !imageCurrentSrc) return;
        event.preventDefault();
        imagePanStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            panX: imagePan.x,
            panY: imagePan.y,
        };
        setIsImagePanning(true);
    };

    const moveImagePan = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isImagePanning || imageZoom <= 1) return;
        const deltaX = event.clientX - imagePanStartRef.current.x;
        const deltaY = event.clientY - imagePanStartRef.current.y;
        const limit = ((imageZoom - 1) * 420) / 2;
        setImagePan({
            x: Math.max(-limit, Math.min(limit, imagePanStartRef.current.panX + deltaX)),
            y: Math.max(-limit, Math.min(limit, imagePanStartRef.current.panY + deltaY)),
        });
    };

    const endImagePan = () => {
        setIsImagePanning(false);
    };

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
        setPdfModalMode("create");
        setActivePdfSourceIndex(null);
        setPdfStep(1);
        setPdfData(null);
        setPdfPages([]);
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

    const openExistingPdfSource = (source: SourceData, sourceIndex: number, mode: PdfModalMode) => {
        const urlFileName = decodeURIComponent(source.url.replace(/^pdf:\/\//, "").split("#")[0] || "Document.pdf");
        const parsedRange = source.url.match(/#pages=(\d+)-(\d+)/);
        const fallbackStart = parsedRange ? Number(parsedRange[1]) : 1;
        const fallbackEnd = parsedRange ? Number(parsedRange[2]) : fallbackStart;
        const meta = source.pdfMeta;
        const pages = (meta?.pages && meta.pages.length > 0)
            ? meta.pages
            : [source.fullContent || ""];
        const pageCount = meta?.pageCount || Math.max(fallbackEnd, pages.length || 1);

        setPdfData({
            fileName: meta?.fileName || urlFileName,
            pageCount,
            pages,
        });
        setPdfPages(pages);
        setPdfModalMode(mode);
        setActivePdfSourceIndex(sourceIndex);
        setPdfStep(1);
        setPdfStartPage(meta?.startPage || fallbackStart);
        setPdfEndPage(meta?.endPage || Math.max(fallbackEnd, fallbackStart));
        setPdfReviewPage(1);
        setPdfAuthors(meta?.authors?.length ? meta.authors : [{ firstName: "", lastName: "" }]);
        setPdfDocumentTitle(meta?.documentTitle || source.title || urlFileName.replace(/\.pdf$/i, ""));
        setPdfPublicationYear(meta?.publicationYear || source.publishedYear || "");
        setPdfJournalName(meta?.journalName || "");
        setPdfPublisher(meta?.publisher || source.publisher || "");
        setPdfVolume(meta?.volume || "");
        setPdfIssue(meta?.issue || "");
        setPdfEdition(meta?.edition || "");
        setPdfCitationPreview(meta?.citationPreview || CitationTemplateService.formatReference(citationStyle, source, 1));
        setCitationError("");
        setShowPdfModal(true);
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
            setPdfPages(parsed.pages || []);
            setPdfModalMode("create");
            setActivePdfSourceIndex(null);
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
        if (pdfModalMode === "view") {
            setPdfStep(2);
            setPdfReviewPage(1);
            return;
        }
        if (!hasRequiredCitationInfo) {
            alert("Document Title + Publication Year + (Journal Name or Publisher) are required.");
            return;
        }
        setPdfStep(2);
        setPdfReviewPage(1);
        // Auto-trigger Spoonie when user enters review step so citation panel is populated.
        void handleAskSpoonie();
    };

    const updatePdfPageText = (absolutePage: number, value: string) => {
        setPdfPages((prev) => prev.map((pageText, idx) => (idx === absolutePage - 1 ? value : pageText)));
    };

    const savePdfAsSource = () => {
        if (!pdfData) return;

        const pageRange = `${pdfStartPage}-${pdfEndPage}`;
        const publisherValue = [pdfJournalName.trim(), pdfPublisher.trim()].filter(Boolean).join(" • ");
        const finalCitation = pdfCitationPreview || fallbackPdfCitation();
        const source: SourceData = {
            url: `pdf://${encodeURIComponent(pdfData.fileName)}#pages=${pageRange}`,
            status: "scraped",
            manualSourceType: "pdf",
            title: pdfDocumentTitle.trim() || pdfData.fileName.replace(/\.pdf$/i, ""),
            author: pdfAuthorString || "Unknown",
            publishedYear: pdfPublicationYear.trim(),
            publisher: publisherValue,
            fullContent: selectedPdfContent,
            pdfMeta: {
                fileName: pdfData.fileName,
                pageCount: pdfData.pageCount,
                startPage: pdfStartPage,
                endPage: pdfEndPage,
                pages: pdfPages,
                authors: pdfAuthors,
                documentTitle: pdfDocumentTitle.trim(),
                publicationYear: pdfPublicationYear.trim(),
                journalName: pdfJournalName.trim(),
                publisher: pdfPublisher.trim(),
                volume: pdfVolume.trim(),
                issue: pdfIssue.trim(),
                edition: pdfEdition.trim(),
                citationPreview: finalCitation,
            },
        };

        setManualSources((prev) => {
            const next = [...prev];
            if (activePdfSourceIndex !== null && activePdfSourceIndex >= 0 && activePdfSourceIndex < next.length) {
                next[activePdfSourceIndex] = source;
            } else {
                next.push(source);
            }
            return next;
        });

        resetPdfFlow();
    };

    const removePdfSource = (sourceIndex: number) => {
        setManualSources((prev) => prev.filter((_, idx) => idx !== sourceIndex));
    };

    const resetImageFlow = () => {
        setShowImageModal(false);
        setImageModalMode("create");
        setActiveImageSourceIndex(null);
        setImageStep(1);
        setImageFiles([]);
        setImageTotalCount(0);
        setActiveImageIndex(0);
        setImageBufferText("");
        setImageFinalSnippet("");
        setImageConfirmedSnippets([]);
        setIsScanningImage(false);
        setImageCitationKind("book");
        setImageCitationContributors([{ firstName: "", middleName: "", lastName: "", suffix: "" }]);
        setImageCitationTitle("");
        setImageCitationArticleTitle("");
        setImageCitationJournalTitle("");
        setImageCitationPublicationYear("");
        setImageCitationPublisher("");
        setImageCitationVolume("");
        setImageCitationIssue("");
        setImageCitationPageRange("");
        setImageCitationPreview("");
        setImageCitationError("");
        setIsImageCitationLoading(false);
        setImageSourceLabel("");
    };

    const openImagePicker = () => imageInputRef.current?.click();

    const onImageFilesPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
        if (!files.length) return;
        const items = await Promise.all(
            files.map(async (file) => ({
                name: file.name,
                src: await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ""));
                    reader.onerror = () => reject(new Error("Failed to read image"));
                    reader.readAsDataURL(file);
                }),
            }))
        );
        setImageFiles(items);
        setImageTotalCount(items.length);
        setImageSourceLabel(items[0].name.replace(/\.[^.]+$/, ""));
        setImageModalMode("create");
        setActiveImageSourceIndex(null);
        setImageStep(1);
        setActiveImageIndex(0);
        setImageConfirmedSnippets([]);
        setShowImageModal(true);
        event.target.value = "";
    };

    const addMoreImagesToFlow = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
        if (!files.length) return;
        const items = await Promise.all(
            files.map(async (file) => ({
                name: file.name,
                src: await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ""));
                    reader.onerror = () => reject(new Error("Failed to read image"));
                    reader.readAsDataURL(file);
                }),
            }))
        );
        setImageFiles((prev) => [...prev, ...items]);
        setImageTotalCount((prev) => prev + items.length);
        event.target.value = "";
    };

    const scanActiveImageRegion = async () => {
        if (!imageCurrentSrc) return;
        setIsScanningImage(true);
        try {
            const text = await SpoonieService.extractImageText({
                imageDataUrl: imageCurrentSrc,
            });
            if (!text.trim()) return;
            setImageBufferText((prev) => (prev.trim() ? `${prev.trim()}\n\n${text.trim()}` : text.trim()));
        } catch (error) {
            alert(error instanceof Error ? error.message : "OCR failed");
        } finally {
            setIsScanningImage(false);
        }
    };

    const confirmImageBuffer = () => {
        const cleaned = imageBufferText.trim();
        if (!cleaned) return;
        setImageConfirmedSnippets((prev) => [...prev, cleaned]);
        setImageFinalSnippet((prev) => (prev.trim() ? `${prev.trim()}\n\n${cleaned}` : cleaned));
        setImageBufferText("");
        // Expire current image after confirmation and auto focus next remaining image.
        setImageFiles((prev) => {
            if (!prev.length) return prev;
            const next = prev.filter((_, idx) => idx !== activeImageIndex);
            const nextIndex = Math.min(activeImageIndex, Math.max(0, next.length - 1));
            setActiveImageIndex(nextIndex);
            return next;
        });
    };

    const addImageContributor = () => {
        setImageCitationContributors((prev) => [...prev, { firstName: "", middleName: "", lastName: "", suffix: "" }]);
    };

    const updateImageContributor = (index: number, field: keyof ImageCitationContributor, value: string) => {
        setImageCitationContributors((prev) =>
            prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
        );
    };

    const buildImageCitationBySpoonie = async () => {
        if (!imageFinalSnippet.trim()) {
            setImageCitationError("Final snippet is empty.");
            return;
        }
        setIsImageCitationLoading(true);
        setImageCitationError("");
        try {
            const citation = await SpoonieService.generateCitation({
                citationStyle,
                documentTitle: imageCitationKind === "book"
                    ? (imageCitationTitle.trim() || imageSourceLabel || "Untitled")
                    : (imageCitationArticleTitle.trim() || imageSourceLabel || "Untitled"),
                publicationYear: imageCitationPublicationYear.trim() || "n.d.",
                authors: imageCitationContributors.map((c) => ({ firstName: c.firstName, lastName: c.lastName })),
                journalName: imageCitationKind === "journal" ? imageCitationJournalTitle.trim() : "",
                publisher: imageCitationPublisher.trim(),
                volume: imageCitationVolume.trim(),
                issue: imageCitationIssue.trim(),
                pageRange: imageCitationPageRange.trim(),
            });
            setImageCitationPreview(citation);
        } catch (error) {
            setImageCitationError(error instanceof Error ? error.message : "Could not build citation.");
            const fallback: SourceData = {
                url: "",
                status: "scraped",
                title: imageCitationKind === "book"
                    ? (imageCitationTitle || imageSourceLabel || "Untitled")
                    : (imageCitationArticleTitle || imageSourceLabel || "Untitled"),
                author: imageCitationContributors
                    .map((c) => [c.lastName, c.firstName].filter(Boolean).join(", "))
                    .filter(Boolean)
                    .join("; "),
                publishedYear: imageCitationPublicationYear || "n.d.",
                publisher: imageCitationKind === "journal"
                    ? (imageCitationJournalTitle || imageCitationPublisher || "Unknown")
                    : (imageCitationPublisher || "Unknown"),
                fullContent: imageFinalSnippet,
            };
            setImageCitationPreview(CitationTemplateService.formatReference(citationStyle, fallback, 1));
        } finally {
            setIsImageCitationLoading(false);
        }
    };

    const openExistingImageSource = (source: SourceData, sourceIndex: number, mode: ImageModalMode) => {
        const meta = source.imageMeta;
        setImageModalMode(mode);
        setActiveImageSourceIndex(sourceIndex);
        setShowImageModal(true);
        setImageStep(1);
        setImageFiles((meta?.snippets || []).map((_, idx) => ({ name: `Scanned image ${idx + 1}`, src: "" })));
        setImageTotalCount(meta?.imageCount || meta?.snippets?.length || 0);
        setActiveImageIndex(0);
        setImageBufferText("");
        setImageFinalSnippet(meta?.finalSnippet || source.fullContent || "");
        setImageConfirmedSnippets(meta?.snippets || []);
        setImageCitationKind(meta?.citationKind || "book");
        setImageCitationContributors(
            meta?.citationData.contributors?.length
                ? meta.citationData.contributors
                : [{ firstName: "", middleName: "", lastName: "", suffix: "" }]
        );
        setImageCitationTitle(meta?.citationData.title || source.title || "");
        setImageCitationArticleTitle(meta?.citationData.articleTitle || source.title || "");
        setImageCitationJournalTitle(meta?.citationData.journalTitle || "");
        setImageCitationPublicationYear(meta?.citationData.publicationYear || source.publishedYear || "");
        setImageCitationPublisher(meta?.citationData.publisher || source.publisher || "");
        setImageCitationVolume(meta?.citationData.volume || "");
        setImageCitationIssue(meta?.citationData.issue || "");
        setImageCitationPageRange(meta?.citationData.pageRange || "");
        setImageCitationPreview(meta?.citationPreview || CitationTemplateService.formatReference(citationStyle, source, 1));
        setImageSourceLabel(meta?.sourceLabel || source.title || `Image Source ${sourceIndex + 1}`);
    };

    const removeImageSource = (sourceIndex: number) => {
        setManualSources((prev) => prev.filter((_, idx) => idx !== sourceIndex));
    };

    const saveImageAsSource = () => {
        if (!imageFinalSnippet.trim()) {
            alert("Final snippet is empty.");
            return;
        }
        const source: SourceData = {
            url: `image://${encodeURIComponent(imageSourceLabel || `image-source-${Date.now()}`)}`,
            status: "scraped",
            manualSourceType: "image",
            title: imageSourceLabel || "Image OCR Source",
            author: imageCitationContributors
                .map((c) => [c.lastName, c.firstName].filter(Boolean).join(", "))
                .filter(Boolean)
                .join("; "),
            publishedYear: imageCitationPublicationYear,
            publisher: imageCitationKind === "journal"
                ? (imageCitationJournalTitle || imageCitationPublisher)
                : imageCitationPublisher,
            fullContent: imageFinalSnippet,
            imageMeta: {
                sourceLabel: imageSourceLabel || "Image OCR Source",
                imageCount: imageTotalCount,
                snippets: imageConfirmedSnippets,
                finalSnippet: imageFinalSnippet,
                citationKind: imageCitationKind,
                citationData: {
                    contributors: imageCitationContributors,
                    title: imageCitationTitle,
                    articleTitle: imageCitationArticleTitle,
                    journalTitle: imageCitationJournalTitle,
                    publicationYear: imageCitationPublicationYear,
                    publisher: imageCitationPublisher,
                    volume: imageCitationVolume,
                    issue: imageCitationIssue,
                    pageRange: imageCitationPageRange,
                },
                citationPreview: imageCitationPreview,
            },
        };

        setManualSources((prev) => {
            const next = [...prev];
            if (activeImageSourceIndex !== null && activeImageSourceIndex >= 0 && activeImageSourceIndex < next.length) {
                next[activeImageSourceIndex] = source;
            } else {
                next.push(source);
            }
            return next;
        });
        resetImageFlow();
    };

    const updateFieldworkForm = <K extends keyof FieldworkFormState>(key: K, value: FieldworkFormState[K]) => {
        setFieldworkForm((prev) => ({ ...prev, [key]: value }));
    };

    const resetFieldworkFlow = () => {
        setShowFieldworkModal(false);
        setFieldworkModalMode("create");
        setActiveFieldworkSourceIndex(null);
        setFieldworkForm(EMPTY_FIELDWORK_FORM);
        setFieldworkCitationPreview("");
        setFieldworkCitationError("");
        setIsSavingFieldwork(false);
    };

    const openNewFieldworkEntry = () => {
        setFieldworkModalMode("create");
        setActiveFieldworkSourceIndex(null);
        setFieldworkForm(EMPTY_FIELDWORK_FORM);
        setFieldworkCitationPreview("");
        setFieldworkCitationError("");
        setShowFieldworkModal(true);
    };

    const openExistingFieldworkSource = (source: SourceData, sourceIndex: number, mode: FieldworkModalMode) => {
        setFieldworkModalMode(mode);
        setActiveFieldworkSourceIndex(sourceIndex);
        setFieldworkForm({
            ...EMPTY_FIELDWORK_FORM,
            researchType: (source.fieldworkMeta?.researchType as FieldworkResearchType) || "survey",
            title: source.fieldworkMeta?.title || source.title || "",
            dateConducted: source.fieldworkMeta?.dateConducted || "",
            researcherName: source.fieldworkMeta?.researcherName || source.author || "",
            location: source.fieldworkMeta?.location || "",
            participants: source.fieldworkMeta?.participants || "",
            methodSummary: source.fieldworkMeta?.methodSummary || "",
            keyFindings: source.fieldworkMeta?.keyFindings || "",
            notes: source.fieldworkMeta?.notes || "",
            ...((source.fieldworkMeta?.customFields || {}) as Partial<FieldworkFormState>),
        });
        setFieldworkCitationPreview(source.fieldworkMeta?.citationPreview || CitationTemplateService.formatReference(citationStyle, source, sourceIndex + 1));
        setFieldworkCitationError("");
        setShowFieldworkModal(true);
    };

    const buildFieldworkCitationInput = (): SpoonieFieldworkCitationInput => ({
        citationStyle,
        researchType: activeFieldworkType.label,
        title: fieldworkForm.title.trim(),
        dateConducted: fieldworkForm.dateConducted,
        researcherName: fieldworkForm.researcherName.trim(),
        location: fieldworkForm.location.trim(),
        participants: fieldworkForm.participants.trim(),
        methodSummary: fieldworkForm.methodSummary.trim(),
        keyFindings: fieldworkForm.keyFindings.trim(),
        notes: fieldworkForm.notes.trim(),
        customFields: Object.fromEntries(
            activeFieldworkType.fields
                .map((field) => [field.label, fieldworkForm[field.key].trim()])
                .filter(([, value]) => Boolean(value))
        ),
    });

    const fallbackFieldworkCitation = () => {
        const year = fieldworkForm.dateConducted ? new Date(fieldworkForm.dateConducted).getFullYear() : "n.d.";
        const author = fieldworkForm.researcherName.trim() || "Unknown Researcher";
        const title = fieldworkForm.title.trim() || `${activeFieldworkType.label} Notes`;
        return `${author}. (${year}). ${title} [${activeFieldworkType.label}]. ${fieldworkForm.location.trim() || "Unpublished fieldwork notes"}.`;
    };

    const saveFieldworkEntry = async () => {
        if (fieldworkModalMode === "view") {
            resetFieldworkFlow();
            return;
        }
        if (!fieldworkForm.title.trim() || !fieldworkForm.dateConducted || !fieldworkForm.methodSummary.trim()) {
            setFieldworkCitationError("Title / topic, date conducted, and method summary are required.");
            return;
        }

        setIsSavingFieldwork(true);
        setFieldworkCitationError("");

        let citation = fieldworkCitationPreview;
        try {
            citation = await SpoonieService.generateFieldworkCitation(buildFieldworkCitationInput());
            setFieldworkCitationPreview(citation);
        } catch (error) {
            citation = fallbackFieldworkCitation();
            setFieldworkCitationPreview(citation);
            setFieldworkCitationError(error instanceof Error ? error.message : "Could not generate fieldwork citation. Using fallback.");
        }

        const source: SourceData = {
            url: `fieldwork://${encodeURIComponent(fieldworkForm.title.trim() || `fieldwork-${Date.now()}`)}`,
            status: "scraped",
            manualSourceType: "fieldwork",
            title: fieldworkForm.title.trim() || "Untitled Fieldwork Entry",
            author: fieldworkForm.researcherName.trim() || "Unknown Researcher",
            publishedYear: fieldworkForm.dateConducted,
            publisher: fieldworkForm.location.trim() || activeFieldworkType.label,
            fullContent: [fieldworkForm.methodSummary.trim(), fieldworkForm.keyFindings.trim(), fieldworkForm.notes.trim()].filter(Boolean).join("\n\n"),
            fieldworkMeta: {
                researchType: fieldworkForm.researchType,
                title: fieldworkForm.title.trim(),
                dateConducted: fieldworkForm.dateConducted,
                researcherName: fieldworkForm.researcherName.trim(),
                location: fieldworkForm.location.trim(),
                participants: fieldworkForm.participants.trim(),
                methodSummary: fieldworkForm.methodSummary.trim(),
                keyFindings: fieldworkForm.keyFindings.trim(),
                notes: fieldworkForm.notes.trim(),
                customFields: Object.fromEntries(
                    activeFieldworkType.fields
                        .map((field) => [field.key, fieldworkForm[field.key].trim()])
                        .filter(([, value]) => Boolean(value))
                ),
                citationPreview: citation,
            },
        };

        setManualSources((prev) => {
            const next = [...prev];
            if (activeFieldworkSourceIndex !== null && activeFieldworkSourceIndex >= 0 && activeFieldworkSourceIndex < next.length) {
                next[activeFieldworkSourceIndex] = source;
            } else {
                next.push(source);
            }
            return next;
        });

        resetFieldworkFlow();
    };

    const removeFieldworkSource = (sourceIndex: number) => {
        setManualSources((prev) => prev.filter((_, idx) => idx !== sourceIndex));
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
        if (pdfModalMode === "view") return;
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
                                {sourceCountByTab[tab as keyof typeof sourceCountByTab]} sources
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
                        {searchSourceEntries.map(({ source, sourceIndex }) => (
                            <div key={sourceIndex} className="relative w-full">
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
                                    onChange={(e) => updateSourceUrl(sourceIndex, e.target.value)}
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
                                onMouseEnter={() => setSourceUploadHoverHint("pdf")}
                                onMouseLeave={() => setSourceUploadHoverHint("")}
                                className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3.5 text-[16px] font-bold text-white shadow-[0_0_20px_rgba(239,68,68,0.28)] transition hover:bg-red-400 disabled:opacity-60"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                {isPdfUploading ? "Reading PDF..." : "Upload PDF"}
                            </button>
                            <div onMouseEnter={() => setSourceUploadHoverHint("images")} onMouseLeave={() => setSourceUploadHoverHint("")}>
                                <button
                                    onClick={openImagePicker}
                                    className="rounded-full border border-white/20 bg-white/[0.04] px-6 py-3.5 text-[16px] font-bold text-white/80 transition hover:bg-white/[0.08]"
                                >
                                    Upload Images
                                </button>
                            </div>
                        </div>
                        {sourceUploadHoverHint !== "" && (
                            <p className="mt-4 text-center text-[13px] text-white/45">
                                {sourceUploadHoverHint === "pdf"
                                    ? "We only support single PDF upload for now"
                                    : "We support multiple image uploads"}
                            </p>
                        )}

                        <input
                            ref={pdfInputRef}
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={handlePdfUpload}
                            className="hidden"
                        />
                        <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={onImageFilesPicked}
                            className="hidden"
                        />

                        {uploadedPdfSources.length > 0 && (
                            <div className="mt-8 space-y-3">
                                <h4 className="text-[16px] font-bold text-white/90">Added manual sources</h4>
                                {uploadedPdfSources.map((pdf) => (
                                    <div key={pdf.id} className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/35 bg-red-500/15 text-red-300">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                    <polyline points="14 2 14 8 20 8" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-[14px] font-semibold text-white">{pdf.fileName}</div>
                                                <div className="mt-1 text-[12px] text-white/60">Pages: {pdf.pageRange}</div>
                                                <div className="mt-2 line-clamp-2 text-[12px] text-white/80">{pdf.citation}</div>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <button
                                                onClick={() => openExistingPdfSource(pdf.source, pdf.sourceIndex, "view")}
                                                className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-2 text-white/80 hover:bg-white/[0.08]"
                                                title="View source"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => openExistingPdfSource(pdf.source, pdf.sourceIndex, "edit")}
                                                className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-2 text-white/80 hover:bg-white/[0.08]"
                                                title="Edit source"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 20h9" />
                                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => removePdfSource(pdf.sourceIndex)}
                                                className="rounded-lg border border-red-500/35 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20"
                                                title="Delete source"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M8 6V4h8v2" />
                                                    <path d="M19 6l-1 14H6L5 6" />
                                                    <path d="M10 11v6" />
                                                    <path d="M14 11v6" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {imageSourceThreads.length > 0 && (
                            <div className="mt-4 space-y-3">
                                {imageSourceThreads.map((img) => (
                                    <div key={img.id} className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/35 bg-blue-500/15 text-blue-300">
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                                    <circle cx="9" cy="9" r="2" />
                                                    <path d="m21 15-5-5L5 21" />
                                                </svg>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-[14px] font-semibold text-white">{img.sourceLabel}</div>
                                                <div className="mt-1 text-[12px] text-white/60">{img.imageCount} image(s)</div>
                                                <div className="mt-2 line-clamp-2 text-[12px] text-white/80">{img.citation}</div>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <button
                                                onClick={() => openExistingImageSource(img.source, img.sourceIndex, "view")}
                                                className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-2 text-white/80 hover:bg-white/[0.08]"
                                                title="View source"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => openExistingImageSource(img.source, img.sourceIndex, "edit")}
                                                className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-2 text-white/80 hover:bg-white/[0.08]"
                                                title="Edit source"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 20h9" />
                                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => removeImageSource(img.sourceIndex)}
                                                className="rounded-lg border border-red-500/35 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20"
                                                title="Delete source"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M8 6V4h8v2" />
                                                    <path d="M19 6l-1 14H6L5 6" />
                                                    <path d="M10 11v6" />
                                                    <path d="M14 11v6" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {sourcesTab === "Fieldwork Mode" && (
                    <div className="space-y-5">
                        <div>
                            <h3 className="text-[22px] font-bold text-white">Fieldwork Node</h3>
                            <p className="mt-2 text-[14px] text-white/70">
                                Log primary research like interviews, lab experiments, and surveys to use them as valid sources.
                            </p>
                        </div>

                        {fieldworkSourceThreads.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-red-500/40 bg-white/[0.02] px-8 py-16 text-center">
                                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/35 bg-red-500/10 text-red-400">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 12h18" />
                                        <path d="M12 3v18" />
                                    </svg>
                                </div>
                                <div className="text-[32px] font-bold text-white">No fieldwork logged yet</div>
                                <div className="mx-auto mt-3 max-w-xl text-[15px] leading-7 text-white/55">
                                    Add your first entry to turn real-world research into a usable source.
                                </div>
                                <button
                                    onClick={openNewFieldworkEntry}
                                    className="mt-8 inline-flex items-center gap-3 rounded-full bg-red-500 px-7 py-3.5 text-[18px] font-bold text-white shadow-[0_0_22px_rgba(239,68,68,0.28)] transition hover:bg-red-400"
                                >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">+</span>
                                    Add New Entry
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-end">
                                    <button
                                        onClick={openNewFieldworkEntry}
                                        className="inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-2.5 text-[14px] font-bold text-white hover:bg-red-400"
                                    >
                                        <span className="text-[18px] leading-none">+</span>
                                        Add New Entry
                                    </button>
                                </div>
                                {fieldworkSourceThreads.map((entry) => (
                                    <div key={entry.id} className="flex items-start justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-3">
                                                <span className="rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-red-200">
                                                    {entry.researchType}
                                                </span>
                                                <span className="text-[12px] text-white/45">{entry.dateConducted || "No date"}</span>
                                            </div>
                                            <div className="mt-3 text-[18px] font-bold text-white">{entry.title}</div>
                                            <div className="mt-2 line-clamp-2 text-[13px] leading-6 text-white/70">{entry.citation}</div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <button
                                                onClick={() => openExistingFieldworkSource(entry.source, entry.sourceIndex, "view")}
                                                className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-2 text-white/80 hover:bg-white/[0.08]"
                                                title="View entry"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => openExistingFieldworkSource(entry.source, entry.sourceIndex, "edit")}
                                                className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-2 text-white/80 hover:bg-white/[0.08]"
                                                title="Edit entry"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 20h9" />
                                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => removeFieldworkSource(entry.sourceIndex)}
                                                className="rounded-lg border border-red-500/35 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20"
                                                title="Delete entry"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M8 6V4h8v2" />
                                                    <path d="M19 6l-1 14H6L5 6" />
                                                    <path d="M10 11v6" />
                                                    <path d="M14 11v6" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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
                                        <div className="mt-4 grid grid-cols-2 gap-4" ref={pageDropdownRef}>
                                            <div>
                                                <label className="mb-2 block text-[13px] text-white/70">Start Page</label>
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        disabled={pdfModalMode === "view"}
                                                        onClick={() => {
                                                            setIsStartPageDropdownOpen((prev) => !prev);
                                                            setIsEndPageDropdownOpen(false);
                                                        }}
                                                        className={`flex w-full items-center justify-between rounded-xl border border-white/[0.16] bg-[#171b24] px-4 py-3 text-[14px] font-medium text-white outline-none transition focus:border-red-400/70 ${pdfModalMode === "view" ? "cursor-not-allowed opacity-70" : "hover:border-white/30"}`}
                                                    >
                                                        <span>Page {pdfStartPage}</span>
                                                        <svg className={`text-white/55 transition-transform ${isStartPageDropdownOpen ? "rotate-180" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="m6 9 6 6 6-6" />
                                                        </svg>
                                                    </button>
                                                    {isStartPageDropdownOpen && (
                                                        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-56 overflow-y-auto rounded-xl border border-white/[0.14] bg-[#111723] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
                                                            {Array.from({ length: pdfData.pageCount }, (_, idx) => idx + 1).map((page) => (
                                                                <button
                                                                    key={`start-${page}`}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setPdfStartPage(page);
                                                                        setIsStartPageDropdownOpen(false);
                                                                    }}
                                                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition ${pdfStartPage === page ? "bg-red-500/20 text-red-200" : "text-white/90 hover:bg-white/[0.06]"}`}
                                                                >
                                                                    <span>Page {page}</span>
                                                                    {pdfStartPage === page && <span>✓</span>}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="mb-2 block text-[13px] text-white/70">End Page</label>
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        disabled={pdfModalMode === "view"}
                                                        onClick={() => {
                                                            setIsEndPageDropdownOpen((prev) => !prev);
                                                            setIsStartPageDropdownOpen(false);
                                                        }}
                                                        className={`flex w-full items-center justify-between rounded-xl border border-white/[0.16] bg-[#171b24] px-4 py-3 text-[14px] font-medium text-white outline-none transition focus:border-red-400/70 ${pdfModalMode === "view" ? "cursor-not-allowed opacity-70" : "hover:border-white/30"}`}
                                                    >
                                                        <span>Page {pdfEndPage}</span>
                                                        <svg className={`text-white/55 transition-transform ${isEndPageDropdownOpen ? "rotate-180" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="m6 9 6 6 6-6" />
                                                        </svg>
                                                    </button>
                                                    {isEndPageDropdownOpen && (
                                                        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-56 overflow-y-auto rounded-xl border border-white/[0.14] bg-[#111723] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
                                                            {Array.from({ length: pdfData.pageCount }, (_, idx) => idx + 1)
                                                                .filter((page) => page >= pdfStartPage)
                                                                .map((page) => (
                                                                    <button
                                                                        key={`end-${page}`}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setPdfEndPage(page);
                                                                            setIsEndPageDropdownOpen(false);
                                                                        }}
                                                                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition ${pdfEndPage === page ? "bg-red-500/20 text-red-200" : "text-white/90 hover:bg-white/[0.06]"}`}
                                                                    >
                                                                        <span>Page {page}</span>
                                                                        {pdfEndPage === page && <span>✓</span>}
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    )}
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
                                                        disabled={pdfModalMode === "view"}
                                                        className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                    />
                                                    <input
                                                        placeholder="Last Name"
                                                        value={author.lastName}
                                                        onChange={(e) => updatePdfAuthor(idx, "lastName", e.target.value)}
                                                        disabled={pdfModalMode === "view"}
                                                        className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            disabled={pdfModalMode === "view"}
                                            onClick={addPdfAuthorRow}
                                            className="mt-3 inline-flex items-center gap-2 text-[14px] font-semibold text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-45"
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
                                                    disabled={pdfModalMode === "view"}
                                                    placeholder="Enter the title of the document"
                                                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[13px] text-white/70">Publication Year *</label>
                                                <input
                                                    value={pdfPublicationYear}
                                                    onChange={(e) => setPdfPublicationYear(e.target.value)}
                                                    disabled={pdfModalMode === "view"}
                                                    placeholder="e.g. 2024"
                                                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[13px] text-white/70">Journal Name</label>
                                                <input
                                                    value={pdfJournalName}
                                                    onChange={(e) => setPdfJournalName(e.target.value)}
                                                    disabled={pdfModalMode === "view"}
                                                    placeholder="Enter journal name (if applicable)"
                                                    className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[13px] text-white/70">Publisher</label>
                                                <input
                                                    value={pdfPublisher}
                                                    onChange={(e) => setPdfPublisher(e.target.value)}
                                                    disabled={pdfModalMode === "view"}
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
                                                disabled={pdfModalMode === "view"}
                                                placeholder="Volume"
                                                className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                            />
                                            <input
                                                value={pdfIssue}
                                                onChange={(e) => setPdfIssue(e.target.value)}
                                                disabled={pdfModalMode === "view"}
                                                placeholder="Issue"
                                                className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/25"
                                            />
                                            <input
                                                value={pdfEdition}
                                                onChange={(e) => setPdfEdition(e.target.value)}
                                                disabled={pdfModalMode === "view"}
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
                                                disabled={isCitationLoading || pdfModalMode === "view"}
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
                                        <textarea
                                            value={selectedPdfTexts[pdfReviewPage - 1] || ""}
                                            onChange={(e) => updatePdfPageText(pdfStartPage + pdfReviewPage - 1, e.target.value)}
                                            readOnly={pdfModalMode === "view"}
                                            className={`h-[58vh] w-full resize-none overflow-y-auto rounded-xl border border-white/[0.08] bg-black/25 p-3 text-[13px] leading-relaxed text-white/90 outline-none ${pdfModalMode === "view" ? "cursor-default" : "focus:border-white/25"}`}
                                        />
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
                                    onClick={pdfModalMode === "view" ? resetPdfFlow : savePdfAsSource}
                                    className="rounded-xl bg-red-500 px-8 py-2.5 text-[14px] font-bold text-white shadow-[0_0_18px_rgba(239,68,68,0.25)] hover:bg-red-400"
                                >
                                    {pdfModalMode === "view" ? "Close" : (pdfModalMode === "edit" ? "Update Source" : "Save as Source")}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showImageModal && renderModal(
                <div className="fixed inset-0 z-[2147483640] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
                    <div className="flex h-[90vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-3xl border border-white/[0.1] bg-[#101015] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
                            <div>
                                <div className="text-[30px] font-bold text-white">Step {imageStep}: {imageStep === 1 ? "OCR" : imageStep === 2 ? "Citation" : "Save"}</div>
                                <div className="text-[14px] text-white/60">
                                    {imageStep === 1 ? "Extract text from the selected image." : imageStep === 2 ? "Fill citation builder form." : "Review before saving source."}
                                </div>
                            </div>
                            <button onClick={resetImageFlow} className="rounded-full bg-white/[0.08] p-2 text-white/60 hover:bg-white/[0.16] hover:text-white">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                            {imageStep === 1 && (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                        <div className="mb-4 text-[16px] font-semibold text-white">Select an image to scan ({Math.max(0, imageFiles.length - activeImageIndex)} remaining)</div>
                                        <input
                                            id="add-more-images-input"
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={addMoreImagesToFlow}
                                        />

                                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                                            <div className="space-y-4">
                                                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                                                    <div className="text-[15px] font-semibold text-white">Current image</div>
                                                    <div className="mt-2 text-[13px] leading-6 text-white/55">
                                                        OCR will scan the entire image. Confirm the extracted text below, then move to citation.
                                                    </div>
                                                </div>
                                                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                                                    <div className="mb-3 flex items-center justify-between gap-3">
                                                        <div className="text-[14px] font-semibold text-white">Photos</div>
                                                        <button
                                                            onClick={() => document.getElementById("add-more-images-input")?.click()}
                                                            disabled={imageModalMode === "view"}
                                                            className="rounded-full border border-white/[0.15] bg-white/[0.05] px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/[0.1] disabled:opacity-50"
                                                        >
                                                            + Add Photos
                                                        </button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {imageFiles.map((image, idx) => (
                                                            <button
                                                                key={`${image.name}-${idx}`}
                                                            onClick={() => setActiveImageIndex(idx)}
                                                            className={`h-20 w-20 overflow-hidden rounded-xl border ${idx === activeImageIndex ? "border-red-400" : "border-white/[0.15]"}`}
                                                            >
                                                                {image.src ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img src={image.src} alt={image.name} className="h-full w-full object-cover select-none" draggable={false} />
                                                                ) : (
                                                                    <div className="flex h-full w-full items-center justify-center bg-black/30 text-[10px] text-white/40">IMG</div>
                                                                )}
                                                            </button>
                                                        ))}
                                                        {!imageFiles.length && (
                                                            <button
                                                                onClick={openImagePicker}
                                                                disabled={imageModalMode === "view"}
                                                                className="rounded-full bg-red-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-400 disabled:opacity-50"
                                                            >
                                                                Upload Images
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-3 xl:justify-self-end">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-[14px] font-semibold text-white">Image Preview</div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setImageZoom((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))))}
                                                            disabled={!imageCurrentSrc || imageZoom <= 1}
                                                            className="rounded-full border border-white/[0.15] bg-white/[0.05] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/[0.1] disabled:opacity-40"
                                                        >
                                                            -
                                                        </button>
                                                        <div className="min-w-12 text-center text-[12px] font-semibold text-white/70">{Math.round(imageZoom * 100)}%</div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setImageZoom((prev) => Math.min(3, Number((prev + 0.25).toFixed(2))))}
                                                            disabled={!imageCurrentSrc || imageZoom >= 3}
                                                            className="rounded-full border border-white/[0.15] bg-white/[0.05] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/[0.1] disabled:opacity-40"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                                <div
                                                    className={`relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/35 ${imageZoom > 1 ? (isImagePanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}`}
                                                    onMouseDown={beginImagePan}
                                                    onMouseMove={moveImagePan}
                                                    onMouseUp={endImagePan}
                                                    onMouseLeave={endImagePan}
                                                >
                                                    {imageCurrentSrc ? (
                                                        <>
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={imageCurrentSrc}
                                                                alt="OCR Source"
                                                                className="h-full w-full select-none object-contain p-3 transition-transform duration-200"
                                                                draggable={false}
                                                                onDragStart={(event) => event.preventDefault()}
                                                                style={{ transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`, transformOrigin: "center center" }}
                                                            />
                                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent px-4 py-3 text-[12px] font-medium text-white/70">
                                                                Full image OCR preview
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-[14px] text-white/50">No images uploaded yet</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                        <div>
                                            <div className="mb-2 text-[18px] font-semibold text-white">Final Snippet</div>
                                            <textarea
                                                value={imageFinalSnippet}
                                                onChange={(e) => setImageFinalSnippet(e.target.value)}
                                                readOnly={imageModalMode === "view"}
                                                className="h-52 w-full rounded-xl border border-white/[0.1] bg-black/35 p-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/20"
                                                placeholder="Confirmed text will accumulate here..."
                                            />
                                        </div>
                                        <div>
                                            <div className="mb-2 text-[18px] font-semibold text-white">Buffer Workspace</div>
                                            <textarea
                                                value={imageBufferText}
                                                onChange={(e) => setImageBufferText(e.target.value)}
                                                readOnly={imageModalMode === "view"}
                                                className="h-52 w-full rounded-xl border border-white/[0.1] bg-black/35 p-3 text-[14px] text-white outline-none placeholder-white/35 focus:border-white/20"
                                                placeholder="Selected text will appear here for editing..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {imageStep === 2 && (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                        <div className="mb-3 text-[20px] font-semibold text-white">Citation Builder</div>
                                        <label className="mb-4 block">
                                            <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-white/65">Source Label</div>
                                            <input
                                                value={imageSourceLabel}
                                                onChange={(e) => setImageSourceLabel(e.target.value)}
                                                readOnly={imageModalMode === "view"}
                                                placeholder="Source label"
                                                className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none"
                                            />
                                        </label>
                                        <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-white/65">Source Type</div>
                                        <div className="mb-3 inline-flex rounded-full border border-white/[0.12] p-1">
                                            <button
                                                onClick={() => setImageCitationKind("book")}
                                                disabled={imageModalMode === "view"}
                                                className={`rounded-full px-4 py-2 text-[14px] font-semibold ${imageCitationKind === "book" ? "bg-red-500 text-white" : "text-white/70"}`}
                                            >
                                                Book
                                            </button>
                                            <button
                                                onClick={() => setImageCitationKind("journal")}
                                                disabled={imageModalMode === "view"}
                                                className={`rounded-full px-4 py-2 text-[14px] font-semibold ${imageCitationKind === "journal" ? "bg-red-500 text-white" : "text-white/70"}`}
                                            >
                                                Printed Journal
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/65">Contributor Names</div>
                                            {imageCitationContributors.map((contributor, idx) => (
                                                <div key={`img-contributor-${idx}`} className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_140px]">
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">First Name</div>
                                                        <input value={contributor.firstName} readOnly={imageModalMode === "view"} onChange={(e) => updateImageContributor(idx, "firstName", e.target.value)} placeholder="First name" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Middle Name</div>
                                                        <input value={contributor.middleName} readOnly={imageModalMode === "view"} onChange={(e) => updateImageContributor(idx, "middleName", e.target.value)} placeholder="Middle name" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Last Name</div>
                                                        <input value={contributor.lastName} readOnly={imageModalMode === "view"} onChange={(e) => updateImageContributor(idx, "lastName", e.target.value)} placeholder="Last name" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Suffix / Title</div>
                                                        <input value={contributor.suffix} readOnly={imageModalMode === "view"} onChange={(e) => updateImageContributor(idx, "suffix", e.target.value)} placeholder="Suffix" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                </div>
                                            ))}
                                            <button disabled={imageModalMode === "view"} onClick={addImageContributor} className="text-[14px] font-semibold text-red-400 hover:text-red-300 disabled:opacity-40">+ Add another contributor</button>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                        <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-white/65">
                                            {imageCitationKind === "book" ? "Book Details" : "Journal Details"}
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                            {imageCitationKind === "book" ? (
                                                <>
                                                    <label className="block xl:col-span-2">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Book Title</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationTitle} onChange={(e) => setImageCitationTitle(e.target.value)} placeholder="Book title" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Publication Year</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationPublicationYear} onChange={(e) => setImageCitationPublicationYear(e.target.value)} placeholder="Publication year" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Publisher</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationPublisher} onChange={(e) => setImageCitationPublisher(e.target.value)} placeholder="Publisher" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                </>
                                            ) : (
                                                <>
                                                    <label className="block xl:col-span-2">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Article Title</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationArticleTitle} onChange={(e) => setImageCitationArticleTitle(e.target.value)} placeholder="Article title" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block xl:col-span-2">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Journal Title</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationJournalTitle} onChange={(e) => setImageCitationJournalTitle(e.target.value)} placeholder="Journal title" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Volume</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationVolume} onChange={(e) => setImageCitationVolume(e.target.value)} placeholder="Volume" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Issue</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationIssue} onChange={(e) => setImageCitationIssue(e.target.value)} placeholder="Issue" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Publication Year</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationPublicationYear} onChange={(e) => setImageCitationPublicationYear(e.target.value)} placeholder="Publication year" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Page Range</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationPageRange} onChange={(e) => setImageCitationPageRange(e.target.value)} placeholder="Page range" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                    <label className="block xl:col-span-2">
                                                        <div className="mb-2 text-[12px] font-medium text-white/55">Publisher</div>
                                                        <input readOnly={imageModalMode === "view"} value={imageCitationPublisher} onChange={(e) => setImageCitationPublisher(e.target.value)} placeholder="Publisher" className="w-full rounded-xl border border-red-500/35 bg-black/25 px-3 py-2 text-[14px] text-white outline-none" />
                                                    </label>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {imageStep === 3 && (
                                <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                                    <div className="text-center text-[30px] font-bold text-white">Review Before Saving</div>
                                    <div className="text-[14px] font-semibold text-white/80">Snippet</div>
                                    <textarea
                                        value={imageFinalSnippet}
                                        onChange={(e) => setImageFinalSnippet(e.target.value)}
                                        readOnly={imageModalMode === "view"}
                                        className="h-48 w-full rounded-xl border border-white/[0.1] bg-black/25 p-3 text-[14px] text-white outline-none"
                                    />
                                    <div className="text-[14px] font-semibold text-white/80">Citation ({citationStyle})</div>
                                    <textarea
                                        value={imageCitationPreview}
                                        onChange={(e) => setImageCitationPreview(e.target.value)}
                                        readOnly={imageModalMode === "view"}
                                        className="h-28 w-full rounded-xl border border-white/[0.1] bg-black/25 p-3 text-[14px] text-white outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="grid gap-4 border-t border-white/[0.08] bg-black/25 px-6 py-4 lg:grid-cols-[auto_minmax(320px,1fr)_auto] lg:items-center">
                            <div className="flex items-center gap-2 text-[14px] font-semibold">
                                <button
                                    onClick={() => setImageStep(1)}
                                    className={`rounded-full px-4 py-1.5 ${imageStep === 1 ? "bg-red-500 text-white" : "bg-white/10 text-white/60"}`}
                                >
                                    1 OCR
                                </button>
                                <span className="text-white/35">&gt;&gt;</span>
                                <button
                                    onClick={() => canMoveToImageCitation && setImageStep(2)}
                                    className={`rounded-full px-4 py-1.5 ${imageStep === 2 ? "bg-red-500 text-white" : "bg-white/10 text-white/60"}`}
                                >
                                    2 Citation
                                </button>
                                <span className="text-white/35">&gt;&gt;</span>
                                <button
                                    onClick={() => setImageStep(3)}
                                    className={`rounded-full px-4 py-1.5 ${imageStep === 3 ? "bg-red-500 text-white" : "bg-white/10 text-white/60"}`}
                                >
                                    3 Save
                                </button>
                            </div>

                            <div className="min-h-[48px] rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center">
                                {imageStep === 2 ? (
                                    isImageCitationLoading ? (
                                        <div className="text-[13px] font-semibold text-[#f6e08a]">Spoonie is generating your citation...</div>
                                    ) : imageCitationError ? (
                                        <div className="text-[12px] text-yellow-200">{imageCitationError}</div>
                                    ) : imageCitationPreview ? (
                                        <div className="mx-auto max-w-3xl text-[12px] leading-5 text-white/80">{imageCitationPreview}</div>
                                    ) : (
                                        <div className="text-[12px] text-white/45">Ask Spoonie preview will appear here.</div>
                                    )
                                ) : (
                                    <div className="text-[12px] text-white/35">Step progress and Spoonie preview area.</div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 lg:justify-end">
                                {imageStep === 1 && (
                                    <>
                                        <button
                                            onClick={scanActiveImageRegion}
                                            disabled={!imageCurrentSrc || isScanningImage || imageModalMode === "view"}
                                            className="rounded-full border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-[14px] font-semibold text-white hover:bg-white/[0.1] disabled:opacity-50"
                                        >
                                            {isScanningImage ? "Extracting..." : "Extract Text"}
                                        </button>
                                        <button
                                            onClick={confirmImageBuffer}
                                            disabled={!imageBufferText.trim() || imageModalMode === "view"}
                                            className="rounded-full bg-red-500 px-5 py-2 text-[14px] font-bold text-white hover:bg-red-400 disabled:opacity-50"
                                        >
                                            Edit & Confirm
                                        </button>
                                        <button
                                            onClick={() => setImageStep(2)}
                                            disabled={!canMoveToImageCitation}
                                            className="rounded-full bg-white/[0.12] px-5 py-2 text-[14px] font-bold text-white hover:bg-white/[0.2] disabled:opacity-40"
                                        >
                                            Citation
                                        </button>
                                    </>
                                )}
                                {imageStep === 2 && (
                                    <>
                                        <button
                                            onClick={() => setImageStep(1)}
                                            className="rounded-full border border-white/[0.12] bg-white/[0.05] px-5 py-2 text-[14px] font-semibold text-white hover:bg-white/[0.1]"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={buildImageCitationBySpoonie}
                                            disabled={isImageCitationLoading || imageModalMode === "view"}
                                            className="rounded-full border border-[#c9ad3a]/50 bg-[#5a4f16]/55 px-5 py-2 text-[14px] font-semibold text-[#f6e08a] hover:bg-[#6e611a]/65 disabled:opacity-50"
                                        >
                                            {isImageCitationLoading ? "Spoonie..." : "Ask Spoonie"}
                                        </button>
                                        <button
                                            onClick={() => setImageStep(3)}
                                            className="rounded-full bg-red-500 px-5 py-2 text-[14px] font-bold text-white hover:bg-red-400"
                                        >
                                            Review
                                        </button>
                                    </>
                                )}
                                {imageStep === 3 && (
                                    <>
                                        <button
                                            onClick={() => setImageStep(2)}
                                            className="rounded-full border border-white/[0.12] bg-white/[0.05] px-5 py-2 text-[14px] font-semibold text-white hover:bg-white/[0.1]"
                                        >
                                            Back
                                        </button>
                                        <button
                                            onClick={imageModalMode === "view" ? resetImageFlow : saveImageAsSource}
                                            className="rounded-full bg-red-500 px-6 py-2 text-[14px] font-bold text-white hover:bg-red-400"
                                        >
                                            {imageModalMode === "view" ? "Close" : imageModalMode === "edit" ? "Update Source" : "Save as Source"}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showFieldworkModal && renderModal(
                <div className="fixed inset-0 z-[2147483640] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
                    <div className="flex h-[88vh] w-full max-w-[880px] flex-col overflow-hidden rounded-3xl border border-white/[0.1] bg-[#101015] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                        <div className="flex items-start justify-between border-b border-white/[0.08] px-8 py-6">
                            <div>
                                <div className="text-[40px] font-bold text-white">{fieldworkModalMode === "edit" ? "Edit Fieldwork Entry" : fieldworkModalMode === "view" ? "View Fieldwork Entry" : "Add Fieldwork Entry"}</div>
                                <div className="mt-2 text-[15px] text-white/55">Document your primary research and let Spoonie craft the citation automatically.</div>
                            </div>
                            <button onClick={resetFieldworkFlow} className="rounded-full bg-white/[0.08] p-2 text-white/60 hover:bg-white/[0.16] hover:text-white">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
                            <div className="space-y-6">
                                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                    <div className="mb-4 text-[18px] font-bold text-white">Research Type</div>
                                    <label className="block">
                                        <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-white/60">Entry Type</div>
                                        <select
                                            value={fieldworkForm.researchType}
                                            onChange={(e) => updateFieldworkForm("researchType", e.target.value as FieldworkResearchType)}
                                            disabled={fieldworkModalMode === "view"}
                                            className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[16px] font-semibold text-white outline-none"
                                        >
                                            {FIELDWORK_TYPE_OPTIONS.map((option) => (
                                                <option key={option.id} value={option.id} className="bg-[#101015] text-white">
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className="mt-3 text-[14px] text-white/45">{activeFieldworkType.desc}</div>
                                </section>

                                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                    <div className="mb-4 text-[18px] font-bold text-white">Basic Information</div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <label className="block md:col-span-2">
                                            <div className="mb-2 text-[13px] font-semibold text-white/70">Title / Topic</div>
                                            <input value={fieldworkForm.title} onChange={(e) => updateFieldworkForm("title", e.target.value)} readOnly={fieldworkModalMode === "view"} placeholder="e.g. Social Media Influence on Productivity" className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                        </label>
                                        <label className="block">
                                            <div className="mb-2 text-[13px] font-semibold text-white/70">Date Conducted</div>
                                            <input type="date" value={fieldworkForm.dateConducted} onChange={(e) => updateFieldworkForm("dateConducted", e.target.value)} readOnly={fieldworkModalMode === "view"} className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                        </label>
                                        <label className="block">
                                            <div className="mb-2 text-[13px] font-semibold text-white/70">Researcher / Recorder</div>
                                            <input value={fieldworkForm.researcherName} onChange={(e) => updateFieldworkForm("researcherName", e.target.value)} readOnly={fieldworkModalMode === "view"} placeholder="Who conducted or documented this?" className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                        </label>
                                        <label className="block">
                                            <div className="mb-2 text-[13px] font-semibold text-white/70">Location</div>
                                            <input value={fieldworkForm.location} onChange={(e) => updateFieldworkForm("location", e.target.value)} readOnly={fieldworkModalMode === "view"} placeholder="City, site, classroom, Zoom..." className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                        </label>
                                        <label className="block">
                                            <div className="mb-2 text-[13px] font-semibold text-white/70">Participants / Subjects</div>
                                            <input value={fieldworkForm.participants} onChange={(e) => updateFieldworkForm("participants", e.target.value)} readOnly={fieldworkModalMode === "view"} placeholder="Who was involved?" className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                        </label>
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                    <div className="mb-4 text-[18px] font-bold text-white">Research Details</div>
                                    <div className="grid gap-4">
                                        <label className="block">
                                            <div className="mb-2 text-[13px] font-semibold text-white/70">Method Summary</div>
                                            <textarea value={fieldworkForm.methodSummary} onChange={(e) => updateFieldworkForm("methodSummary", e.target.value)} readOnly={fieldworkModalMode === "view"} placeholder="Describe how you conducted this research..." className="h-32 w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                        </label>
                                        <label className="block">
                                            <div className="mb-2 text-[13px] font-semibold text-white/70">Key Findings</div>
                                            <textarea value={fieldworkForm.keyFindings} onChange={(e) => updateFieldworkForm("keyFindings", e.target.value)} readOnly={fieldworkModalMode === "view"} placeholder="Main findings, observations, or outcomes..." className="h-32 w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                        </label>
                                        <div className="grid gap-4 md:grid-cols-2">
                                            {activeFieldworkType.fields.map((field) => (
                                                <label key={field.key} className="block">
                                                    <div className="mb-2 text-[13px] font-semibold text-white/70">{field.label}</div>
                                                    <input value={fieldworkForm[field.key]} onChange={(e) => updateFieldworkForm(field.key, e.target.value)} readOnly={fieldworkModalMode === "view"} placeholder={field.placeholder} className="w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                                </label>
                                            ))}
                                        </div>
                                        <label className="block">
                                            <div className="mb-2 text-[13px] font-semibold text-white/70">Notes</div>
                                            <textarea value={fieldworkForm.notes} onChange={(e) => updateFieldworkForm("notes", e.target.value)} readOnly={fieldworkModalMode === "view"} placeholder="Optional reflection or supporting notes..." className="h-28 w-full rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-[15px] text-white outline-none" />
                                        </label>
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                    <div className="mb-2 text-[18px] font-bold text-white">Citation Preview</div>
                                    <div className="rounded-2xl border border-[#c9ad3a]/25 bg-[#5a4f16]/10 px-4 py-3 text-[14px] leading-7 text-white/80">
                                        {isSavingFieldwork ? "Spoonie is generating the fieldwork citation..." : (fieldworkCitationPreview || "Citation will be generated automatically when you save this entry.")}
                                    </div>
                                    {fieldworkCitationError && <div className="mt-3 text-[12px] text-yellow-200">{fieldworkCitationError}</div>}
                                </section>
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-white/[0.08] bg-black/25 px-8 py-5">
                            <button onClick={resetFieldworkFlow} className="rounded-2xl border border-white/[0.1] bg-white/[0.03] px-8 py-3 text-[16px] font-bold text-white/85 hover:bg-white/[0.07]">
                                {fieldworkModalMode === "view" ? "Close" : "Cancel"}
                            </button>
                            <button
                                onClick={saveFieldworkEntry}
                                disabled={isSavingFieldwork}
                                className="rounded-2xl bg-red-500 px-8 py-3 text-[16px] font-bold text-white shadow-[0_0_22px_rgba(239,68,68,0.28)] hover:bg-red-400 disabled:opacity-50"
                            >
                                {fieldworkModalMode === "view" ? "Done" : isSavingFieldwork ? "Saving Entry..." : "Save Entry"}
                            </button>
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
