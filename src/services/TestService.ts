import { Organizer } from "./OrganizerService";

export const TestService = {
    get isActive() {
        return Organizer.get().isTestMode;
    },

    // 1. Instructions View Mock
    getInstructions: () => "Write a comprehensive essay detailing the architectural evolution of Bagan from the 9th to 13th centuries. Discuss the transition from Pyu influences to the distinct Pagan style, referencing specific monuments like the Ananda Temple.",
    getUploadedFileName: () => "Assignment_Prompt.pdf",

    // 2. Luna Service Mock (Analysis)
    getAnalysis: async () => {
        return {
            topic: "The Architectural Evolution of Bagan",
            essay_type: "Historical Analysis",
            scope: "9th to 13th centuries, architectural transition, structural synthesis",
            structure: "Chronological and thematic tracking of temple designs"
        };
    },

    // 3. Aurora Service Mock (Outlines)
    getOutlines: async () => {
        return [
            { title: "Historical Context", description: "The rise of the Pagan Empire and early Pyu influences.", type: "Introduction" },
            { title: "The Transition Phase", description: "Shift from solid stupas to hollow gu-style temples.", type: "Body" },
            { title: "Masterpieces of Bagan", description: "In-depth look at Ananda Temple and Shwezigon Pagoda.", type: "Body" },
            { title: "Engineering and Artistry", description: "Stucco carvings, interior murals, and brick construction.", type: "Body" },
            { title: "Legacy and Conservation", description: "Modern significance, UNESCO status, and preservation challenges.", type: "Conclusion" }
        ];
    },

    // 4. Configuration View Mock
    getConfiguration: () => ({
        wordCount: 1500,
        citationStyle: "APA",
        tone: "Formal Academic",
        sourcesTab: "Octopilot Search",
        aiSearchKeywords: "Bagan architecture, Pagan Empire temples, Ananda Temple history",
        keywords: "pagoda, stupa, murals, stucco, UNESCO"
    }),

    // 5. Jasmine Service Mock (Search)
    getSources: async () => {
        return [
            { url: "https://example.com/bagan-history", title: "History of Bagan", author: "Dr. Thant Myint-U", publisher: "Myanmar Historical Society", year: "2023", status: "scraped", fullContent: "Bagan was the capital of the Pagan Kingdom..." },
            { url: "https://example.com/ananda", title: "Ananda Temple Architecture", author: "Jane Doe", publisher: "Asian Art Review", year: "2021", status: "scraped", fullContent: "The Ananda Temple, built in 1105 AD..." },
            { url: "https://example.com/conservation", title: "Preserving Bagan", author: "John Smith", publisher: "Heritage Journal", year: "2019", status: "scraped", fullContent: "Conservation efforts in Bagan have faced..." }
        ];
    },

    // 6. Format View Mock
    getFormat: () => ({
        finalEssayTitle: "Stones of Devotion: The Architectural Evolution of Bagan",
        studentName: "John Doe",
        instructorName: "Prof. Alan Turing",
        institutionName: "University of Tech",
        courseInfo: "History of Southeast Asia",
        subjectCode: "HIS301",
        essayDate: "October 24, 2026",
    }),

    // 7. Generation View Mock (Lucas output)  - streamed in UI directly
    getGeneratedEssay: () => "Across the sun-drenched plains of central Myanmar, thousands of weathered brick temples and gilded pagodas rise majestically toward the horizon, marking the ancient city of Bagan. As the former capital of the Pagan Kingdom from the 9th to 13th centuries, this sprawling archaeological site represents not only a zenith of Southeast Asian architectural achievement but also a profound spiritual legacy that continues to resonate today.\n\nThe rise of Bagan as a formidable regional power began in the mid-9th century under King Anawrahta, who is credited with unifying early Myanmar and solidifying Theravada Buddhism as the state religion. Driven by a desire to accrue spiritual merit, successive rulers commissioned the construction of over 10,000 religious structures. Today, sitting at a roadside stall sharing a simple plate of chicken and rice with local families, one gains a perspective no guidebook can offer.\n\nBagan’s architectural landscape showcases a sophisticated evolution of religious design. Iconic structures like the Ananda Temple highlight the transition from solid stupas to hollow gu-style temples. As the afternoon heat softens into golden twilight, viewing the temples from above in a hot air balloon reveals the staggering density of stupas dotting the landscape like an architectural forest.\n\nBagan remains a monumental testament to ingenuity and spiritual devotion. Beyond the pagoda walls, the human element of Bagan proves equally compelling.",
    getGeneratedBibliography: () => "Myint-U, T. (2023). History of Bagan. Myanmar Historical Society.\nDoe, J. (2021). Ananda Temple Architecture. Asian Art Review.\nSmith, J. (2019). Preserving Bagan. Heritage Journal.",
};
