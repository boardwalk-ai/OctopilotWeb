// OrganizerService — in-memory state store for the automation pipeline.
// Holds user selections (major, essay type, instructions) so they can be
// passed to agents like Luna without server persistence.

export interface SourceData {
    url: string;
    title?: string;
    author?: string;
    publishedYear?: string;
    publisher?: string;
    fullContent?: string;
    status: "empty" | "loading" | "scraped" | "failed";
    manualSourceType?: "pdf" | "image" | "url";
    pdfMeta?: {
        fileName: string;
        pageCount: number;
        startPage: number;
        endPage: number;
        pages: string[];
        authors: Array<{ firstName: string; lastName: string }>;
        documentTitle: string;
        publicationYear: string;
        journalName: string;
        publisher: string;
        volume: string;
        issue: string;
        edition: string;
        citationPreview: string;
    };
}

export interface CompactedSource {
    sourceIndex: number;
    url: string;
    title?: string;
    author?: string;
    publishedYear?: string;
    publisher?: string;
    compactedContent: string;
}

export interface OrganizerState {
    writingMode: "automation" | "manual";
    majorIndex: number | null;
    majorName: string;
    essayType: string;
    instructions: string;
    uploadedFileName: string | null;

    // Luna output (filled after analysis)
    analysis: string;
    essayTopic: string;
    analyzedEssayType: string;
    scope: string;
    structure: string;

    // Aurora output (outline cards)
    outlines: Array<{
        id: string;
        type: string;
        title: string;
        description: string;
        selected: boolean;
        hidden: boolean;
        isNew: boolean;
    }>;

    // Selected outlines (saved when user clicks Continue)
    selectedOutlines: Array<{
        id: string;
        type: string;
        title: string;
        description: string;
    }>;

    // Configuration selections
    wordCount: number | "Custom";
    citationStyle: string;
    tone: string;
    sourcesTab: string;
    aiSearchKeywords: string;
    manualSources: SourceData[];
    keywords: string;

    // Scarlet output
    compactedSources: CompactedSource[];

    // Format page fields
    finalEssayTitle: string;
    studentName: string;
    instructorName: string;
    institutionName: string;
    courseInfo: string;
    subjectCode: string;
    essayDate: string;

    // Lucas output
    generatedEssay: string;
    generatedBibliography: string;

    // Test mode flag
    isTestMode: boolean;
}

const defaultState: OrganizerState = {
    writingMode: "automation",
    majorIndex: null,
    majorName: "",
    essayType: "",
    instructions: "",
    uploadedFileName: null,
    analysis: "",
    essayTopic: "",
    analyzedEssayType: "",
    scope: "",
    structure: "",
    outlines: [],
    selectedOutlines: [],
    wordCount: 1000,
    citationStyle: "APA",
    tone: "Formal Academic",
    sourcesTab: "Octopilot Search",
    aiSearchKeywords: "",
    manualSources: [
        { url: "", status: "empty" },
        { url: "", status: "empty" },
        { url: "", status: "empty" },
        { url: "", status: "empty" },
        { url: "", status: "empty" },
    ],
    keywords: "",
    compactedSources: [],
    finalEssayTitle: "",
    studentName: "",
    instructorName: "",
    institutionName: "",
    courseInfo: "",
    subjectCode: "",
    essayDate: "",
    generatedEssay: "",
    generatedBibliography: "",
    isTestMode: false,
};

// Singleton — lives in memory for the lifetime of the browser tab
let state: OrganizerState = { ...defaultState };
const listeners: Set<() => void> = new Set();

export const Organizer = {
    get: (): Readonly<OrganizerState> => state,

    set: (updates: Partial<OrganizerState>) => {
        state = { ...state, ...updates };
        listeners.forEach((fn) => fn());
    },

    reset: () => {
        state = { ...defaultState };
        listeners.forEach((fn) => fn());
    },

    subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },

    setTestData: () => {
        state = {
            ...defaultState,
            writingMode: "automation",
            isTestMode: true,
            essayTopic: "The Architectural Evolution of Bagan",
            wordCount: 500,
            citationStyle: "APA",
            keywords: "pagoda, chicken, rice, hot air balloon",
            selectedOutlines: [
                { id: "1", type: "Introduction", title: "Historical Context", description: "Rise of the Pagan Empire" },
                { id: "2", type: "Body", title: "Architectural Synthesis", description: "Mon and Indian influences" }
            ],
            manualSources: [
                {
                    url: "https://example.com/bagan-history",
                    status: "scraped",
                    title: "History of Bagan",
                    author: "Dr. Thant Myint-U",
                    publisher: "Myanmar Historical Society",
                    fullContent: "Bagan is an ancient city located in the Mandalay Region of Myanmar."
                },
                ...defaultState.manualSources.slice(1)
            ],
            essayDate: "October 24, 2023",
            generatedEssay: "Across the sun-drenched plains of central Myanmar, thousands of weathered brick temples and gilded pagodas rise majestically toward the horizon, marking the ancient city of Bagan. As the former capital of the Pagan Kingdom from the 9th to 13th centuries, this sprawling archaeological site represents not only a zenith of Southeast Asian architectural achievement but also a profound spiritual legacy that continues to resonate today.\n\nThe rise of Bagan as a formidable regional power began in the mid-9th century under King Anawrahta, who is credited with unifying early Myanmar and solidifying Theravada Buddhism as the state religion. Driven by a desire to accrue spiritual merit, successive rulers commissioned the construction of over 10,000 religious structures. Today, sitting at a roadside stall sharing a simple plate of chicken and rice with local families, one gains a perspective no guidebook can offer.\n\nBagan’s architectural landscape showcases a sophisticated evolution of religious design. Iconic structures like the Ananda Temple highlight the transition from solid stupas to hollow gu-style temples. As the afternoon heat softens into golden twilight, viewing the temples from above in a hot air balloon reveals the staggering density of stupas dotting the landscape like an architectural forest.\n\nBagan remains a monumental testament to ingenuity and spiritual devotion. Beyond the pagoda walls, the human element of Bagan proves equally compelling.",
            generatedBibliography: "Myint-U, T. (2023). History of Bagan. Myanmar Historical Society.\nSmith, A. (2021). Temples of Myanmar. Architectural Press."
        };
        listeners.forEach((fn) => fn());
    },
};
