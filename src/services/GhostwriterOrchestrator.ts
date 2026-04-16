import { Organizer, SourceData, ExportDocumentSnapshot } from "./OrganizerService";
import { FileReadService } from "./FileReadService";
import { HeinService } from "./HeinService";
import { LilyService } from "./LilyService";
import { AlvinService, AlvinSearchResult } from "./AlvinService";
import { ScraperService } from "./ScraperService";
import { ZulyService } from "./ZulyService";
import { LucasService } from "./LucasService";
import { FormatterService } from "./FormatterService";
import { HumanizerService } from "./HumanizerService";
import { FormatterPage } from "./FormatterTypes";
import { fetchWithUserAuthorization } from "./authenticatedFetch";
import { GhostwriterRunState, GhostwriterToolCall, GhostwriterQuestionField } from "@/lib/ghostwriterTypes";

export type GhostwriterDraftInput = {
    prompt: string;
    attachments: File[];
};

export type GhostwriterDraftSettings = {
    wordCount: number;
    citationStyle: string;
};

export type GhostwriterFormatAnswers = {
    finalEssayTitle: string;
    studentName: string;
    instructorName: string;
    institutionName: string;
    courseInfo: string;
    subjectCode: string;
    essayDate: string;
};

export type GhostwriterAnalysisSummary = {
    essayTopic: string;
    essayType: string;
    scope: string;
    structure: string;
    analysis: string;
};

function detectCitationStyle(prompt: string): string {
    const text = prompt.toLowerCase();
    if (text.includes("apa")) return "APA";
    if (text.includes("mla")) return "MLA";
    if (text.includes("chicago")) return "Chicago";
    if (text.includes("harvard")) return "Harvard";
    if (text.includes("ieee")) return "IEEE";
    if (text.includes("no citation") || text.includes("without citation")) return "None";
    return "";
}

function detectWordCount(prompt: string): number | null {
    const match = prompt.match(/(\d{3,4})\s*(?:words?|word count)/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHtmlFromContent(content: string) {
    return content
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
        .join("");
}

function buildExportSnapshot(title: string, citationStyle: string): ExportDocumentSnapshot {
    const formatted = FormatterService.formatFromOrganizer(Organizer.get());
    const fallbackPage: FormatterPage = {
        content: formatted.content,
        textAlign: "left",
        showPageNumber: formatted.profile.showPageNumber,
        lineHeight: formatted.profile.lineHeight,
    };

    const pages = (formatted.pages && formatted.pages.length > 0 ? formatted.pages : [fallbackPage]).map((page, index) => ({
        id: index + 1,
        title: index === 0 ? (citationStyle === "None" ? "Essay" : "Formatted Essay") : `Page ${index + 1}`,
        html: normalizeHtmlFromContent(page.content),
        plainText: page.content.trim(),
        textAlign: page.textAlign || "left",
        centerVertically: page.centerVertically,
        showPageNumber: page.showPageNumber ?? formatted.profile.showPageNumber,
        lineHeight: page.lineHeight || formatted.profile.lineHeight,
    }));

    return {
        title,
        pages,
        profile: {
            defaultFont: formatted.profile.defaultFont,
            lineHeight: formatted.profile.lineHeight,
            marginInch: formatted.profile.marginInch,
            headerText: formatted.profile.headerText,
            showPageNumber: formatted.profile.showPageNumber,
            pageNumberStartPage: formatted.profile.pageNumberStartPage || 1,
            pageNumberStartNumber: formatted.profile.pageNumberStartNumber || 1,
        },
        generatedAt: new Date().toISOString(),
    };
}

export class GhostwriterOrchestrator {
    static detectDraftSettings(prompt: string): Partial<GhostwriterDraftSettings> {
        return {
            wordCount: detectWordCount(prompt) || undefined,
            citationStyle: detectCitationStyle(prompt) || undefined,
        };
    }

    static async prepareInstructionBundle(input: GhostwriterDraftInput): Promise<string> {
        const textParts = [input.prompt.trim()].filter(Boolean);
        for (const file of input.attachments) {
            const lowerName = file.name.toLowerCase();
            let extracted = "";
            if (lowerName.endsWith(".txt") || file.type === "text/plain") {
                extracted = (await file.text()).trim();
            } else {
                extracted = (await FileReadService.extractText(file)).trim();
            }
            if (extracted) {
                textParts.push(`Attached File (${file.name}):\n${extracted}`);
            }
        }
        return textParts.join("\n\n").trim();
    }

    static async analyzeInstruction(input: GhostwriterDraftInput): Promise<GhostwriterAnalysisSummary> {
        const instructions = await this.prepareInstructionBundle(input);
        Organizer.set({
            instructions,
            instructionTextInput: input.prompt.trim(),
            uploadedFileName: input.attachments[0]?.name || null,
            instructionFileName: input.attachments[0]?.name || null,
            instructionSource: input.attachments.length > 0 && input.prompt.trim() ? "text+document" : input.attachments.length > 0 ? "document" : "text",
        });
        const result = await HeinService.analyze();
        Organizer.set({
            finalEssayTitle: result.essayTopic,
            essayType: result.essayType || Organizer.get().essayType || "Essay",
        });
        return result;
    }

    static async setupOutlines(targetCount?: number) {
        const generated = await LilyService.generate("auto");
        const sliced = targetCount ? generated.slice(0, targetCount) : generated;
        const cards = sliced.map((item, index) => ({
            id: `ghostwriter-outline-${index + 1}`,
            type: item.type,
            title: item.title,
            description: item.description,
            selected: true,
            hidden: false,
            isNew: false,
        }));
        Organizer.set({
            outlines: cards,
            selectedOutlines: cards.map((card) => ({
                id: card.id,
                type: card.type,
                title: card.title,
                description: card.description,
            })),
        });
        return cards;
    }

    /**
     * Gather sources with retry loop:
     * - Search → scrape each source individually
     * - Remove failed scrapes
     * - Loop until 5+ successful sources (max 4 rounds)
     * - Deduplicate across rounds by URL
     */
    static async gatherSourcesWithRetry(): Promise<{
        goodSources: SourceData[];
        allSearchResults: AlvinSearchResult[];
        compactedCount: number;
    }> {
        const usedUrls = new Set<string>();
        const goodSources: SourceData[] = [];
        const allSearchResults: AlvinSearchResult[] = [];
        const MAX_ROUNDS = 4;

        for (let round = 0; round < MAX_ROUNDS && goodSources.length < 5; round++) {
            const targetCount = Math.max(8, (5 - goodSources.length) * 2 + 2);
            const results = await AlvinService.searchSources(targetCount);

            // Filter duplicates
            const newResults = results.filter((r) => !usedUrls.has(r.website_URL));
            newResults.forEach((r) => usedUrls.add(r.website_URL));

            if (newResults.length === 0) break;

            // Track for sidebar display
            allSearchResults.push(...newResults);

            // Update organizer manualSources with loading placeholders
            const loadingSlots: SourceData[] = newResults.map((r) => ({
                url: r.website_URL,
                title: r.Title,
                author: r.Author,
                publishedYear: r["Published Year"],
                publisher: r.Publisher,
                status: "loading",
            }));
            Organizer.set({ manualSources: [...goodSources, ...loadingSlots] });

            // Scrape each one individually
            for (const result of newResults) {
                if (goodSources.length >= 5) break;
                try {
                    const scraped = await ScraperService.scrape(result.website_URL);
                    const source: SourceData = {
                        url: result.website_URL,
                        title: scraped.title || result.Title,
                        author: result.Author,
                        publishedYear: result["Published Year"],
                        publisher: scraped.publisher || result.Publisher,
                        fullContent: scraped.fullContent || "",
                        status: "scraped",
                    };
                    goodSources.push(source);
                } catch {
                    // Skip failed — auto-removed by not adding to goodSources
                }
                // Update organizer with current good sources
                Organizer.set({ manualSources: [...goodSources], selectedSourceCount: goodSources.length });
            }
        }

        // Compact whatever we have
        await ZulyService.compactAllSources();
        const compacted = Organizer.get().compactedSources;

        return {
            goodSources,
            allSearchResults,
            compactedCount: compacted.length,
        };
    }

    static async gatherSourceData() {
        await ZulyService.compactAllSources();
        return Organizer.get().compactedSources;
    }

    static applyDraftSettings(settings: GhostwriterDraftSettings) {
        Organizer.set({ wordCount: settings.wordCount, citationStyle: settings.citationStyle });
    }

    static async sculptEssay(onChunk: (text: string) => void): Promise<{ essay: string; bibliography: string }> {
        const raw = await LucasService.generate(onChunk);
        const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(clean) as { essay_content?: string; bibliography?: string };
        Organizer.set({
            generatedEssay: parsed.essay_content || "",
            generatedBibliography: parsed.bibliography || "",
        });
        return {
            essay: parsed.essay_content || "",
            bibliography: parsed.bibliography || "",
        };
    }

    static async humanizeEssay(provider: string): Promise<string> {
        const essay = Organizer.get().generatedEssay || "";
        if (!essay) throw new Error("No essay content to humanize.");

        if (provider === "StealthGPT") {
            return HumanizerService.stealthGPT({
                prompt: essay,
                rephrase: true,
                educationLevel: "university",
                strength: "More Stealth",
            });
        }

        // Default: UndetectableAI
        return HumanizerService.undetectableAI({
            content: essay,
            readability: "University",
            purpose: "Essay",
            strength: "More Human",
        });
    }

    static applyFormatAnswers(answers: GhostwriterFormatAnswers) {
        Organizer.set({
            finalEssayTitle: answers.finalEssayTitle,
            studentName: answers.studentName,
            instructorName: answers.instructorName,
            institutionName: answers.institutionName,
            courseInfo: answers.courseInfo,
            subjectCode: answers.subjectCode,
            essayDate: answers.essayDate,
        });
    }

    static async finalizeDocument() {
        const org = Organizer.get();
        const snapshot = buildExportSnapshot(org.finalEssayTitle || org.essayTopic || "Ghostwriter Draft", org.citationStyle);
        Organizer.set({ exportDocument: snapshot });
        return snapshot;
    }

    static async finalizeHumanizedDocument(humanizedText: string) {
        const org = Organizer.get();
        // Temporarily override the generatedEssay with humanized text for formatting
        Organizer.set({ generatedEssay: humanizedText });
        const snapshot = buildExportSnapshot(
            (org.finalEssayTitle || org.essayTopic || "Ghostwriter Draft") + " (Humanized)",
            org.citationStyle,
        );
        Organizer.set({ exportDocument: snapshot });
        return snapshot;
    }

    static async startRun(prompt: string): Promise<GhostwriterRunState> {
        const detectedSettings = GhostwriterOrchestrator.detectDraftSettings(prompt);
        const response = await fetchWithUserAuthorization("/api/ghostwriter/runs/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, detectedSettings }),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Ghostwriter run failed to start: ${response.status}`);
        }
        return response.json() as Promise<GhostwriterRunState>;
    }

    static async submitToolResult(runId: string, toolName: GhostwriterToolCall["name"], result: unknown): Promise<GhostwriterRunState> {
        const response = await fetchWithUserAuthorization(`/api/ghostwriter/runs/${runId}/tool`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolName, result }),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Ghostwriter tool submission failed: ${response.status}`);
        }
        return response.json() as Promise<GhostwriterRunState>;
    }

    static async submitAnswer(runId: string, field: GhostwriterQuestionField, value: string | number): Promise<GhostwriterRunState> {
        const response = await fetchWithUserAuthorization(`/api/ghostwriter/runs/${runId}/answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field, value }),
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Ghostwriter answer submission failed: ${response.status}`);
        }
        return response.json() as Promise<GhostwriterRunState>;
    }

    static async executeToolCall(
        toolCall: GhostwriterToolCall,
        draft: GhostwriterDraftInput,
        onEssayChunk?: (chunk: string) => void,
    ): Promise<unknown> {
        switch (toolCall.name) {
            case "analyze_instruction": {
                return GhostwriterOrchestrator.analyzeInstruction(draft);
            }
            case "generate_outlines": {
                const count = Number(toolCall.args?.count || 0) || undefined;
                const outlines = await GhostwriterOrchestrator.setupOutlines(count);
                return { count: outlines.length };
            }
            case "gather_sources": {
                const { goodSources, allSearchResults, compactedCount } = await GhostwriterOrchestrator.gatherSourcesWithRetry();
                return {
                    scrapedCount: goodSources.length,
                    compactedCount,
                    searchResults: allSearchResults,
                };
            }
            case "generate_essay": {
                const essay = await GhostwriterOrchestrator.sculptEssay(onEssayChunk ?? (() => {}));
                return { wordCount: essay.essay.split(/\s+/).filter(Boolean).length };
            }
            case "finalize_export": {
                const formatAnswers = (toolCall.args?.formatAnswers || {}) as Partial<GhostwriterFormatAnswers>;
                GhostwriterOrchestrator.applyFormatAnswers({
                    finalEssayTitle: Organizer.get().finalEssayTitle || Organizer.get().essayTopic || "Ghostwriter Draft",
                    studentName: String(formatAnswers.studentName || ""),
                    instructorName: String(formatAnswers.instructorName || ""),
                    institutionName: String(formatAnswers.institutionName || ""),
                    courseInfo: String(formatAnswers.courseInfo || ""),
                    subjectCode: String(formatAnswers.subjectCode || ""),
                    essayDate: String(formatAnswers.essayDate || ""),
                });
                const snapshot = await GhostwriterOrchestrator.finalizeDocument();
                return { title: snapshot.title, pageCount: snapshot.pages.length };
            }
            case "humanize_essay": {
                const provider = String(toolCall.args?.provider || "UndetectableAI");
                const humanized = await GhostwriterOrchestrator.humanizeEssay(provider);
                return { humanized, provider };
            }
            case "finalize_export_humanized": {
                const humanizedText = String(toolCall.args?.humanized || Organizer.get().generatedEssay || "");
                const formatAnswers = (toolCall.args?.formatAnswers || {}) as Partial<GhostwriterFormatAnswers>;
                GhostwriterOrchestrator.applyFormatAnswers({
                    finalEssayTitle: Organizer.get().finalEssayTitle || Organizer.get().essayTopic || "Ghostwriter Draft",
                    studentName: String(formatAnswers.studentName || ""),
                    instructorName: String(formatAnswers.instructorName || ""),
                    institutionName: String(formatAnswers.institutionName || ""),
                    courseInfo: String(formatAnswers.courseInfo || ""),
                    subjectCode: String(formatAnswers.subjectCode || ""),
                    essayDate: String(formatAnswers.essayDate || ""),
                });
                const snapshot = await GhostwriterOrchestrator.finalizeHumanizedDocument(humanizedText);
                return { title: snapshot.title, pageCount: snapshot.pages.length };
            }
            default:
                throw new Error(`Unknown Ghostwriter tool: ${toolCall.name}`);
        }
    }
}
