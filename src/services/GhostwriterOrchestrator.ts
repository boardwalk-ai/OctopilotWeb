import { Organizer, SourceData, ExportDocumentSnapshot } from "./OrganizerService";
import { FileReadService } from "./FileReadService";
import { HeinService } from "./HeinService";
import { LilyService } from "./LilyService";
import { AlvinService, AlvinSearchResult } from "./AlvinService";
import { ScraperService } from "./ScraperService";
import { ZulyService } from "./ZulyService";
import { LucasService } from "./LucasService";
import { FormatterService } from "./FormatterService";
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

    static async setupOutlines() {
        const generated = await LilyService.generate("auto");
        const cards = generated.map((item, index) => ({
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

    static async searchSources(targetCount = 4): Promise<AlvinSearchResult[]> {
        return AlvinService.searchSources(targetCount);
    }

    static async scrapeSources(results: AlvinSearchResult[]) {
        const nextSources: SourceData[] = results.map((result) => ({
            url: result.website_URL,
            title: result.Title,
            author: result.Author,
            publishedYear: result["Published Year"],
            publisher: result.Publisher,
            status: "loading",
        }));

        while (nextSources.length < 5) {
            nextSources.push({ url: "", status: "empty" });
        }

        Organizer.set({
            manualSources: nextSources,
            selectedSourceCount: results.length,
        });

        for (let index = 0; index < results.length; index += 1) {
            const result = results[index];
            try {
                const scraped = await ScraperService.scrape(result.website_URL);
                nextSources[index] = {
                    ...nextSources[index],
                    title: scraped.title || result.Title,
                    author: result.Author,
                    publishedYear: result["Published Year"],
                    publisher: scraped.publisher || result.Publisher,
                    fullContent: scraped.fullContent || "",
                    status: "scraped",
                };
            } catch {
                nextSources[index] = {
                    ...nextSources[index],
                    status: "failed",
                };
            }

            Organizer.set({
                manualSources: [...nextSources],
            });
        }

        return nextSources.filter((source) => source.status === "scraped");
    }

    static async gatherSourceData() {
        await ZulyService.compactAllSources();
        return Organizer.get().compactedSources;
    }

    static applyDraftSettings(settings: GhostwriterDraftSettings) {
        Organizer.set({
            wordCount: settings.wordCount,
            citationStyle: settings.citationStyle,
        });
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
        Organizer.set({
            exportDocument: snapshot,
        });
        return snapshot;
    }

    static async startRun(prompt: string): Promise<GhostwriterRunState> {
        const detectedSettings = GhostwriterOrchestrator.detectDraftSettings(prompt);
        const response = await fetchWithUserAuthorization("/api/ghostwriter/runs/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt,
                detectedSettings,
            }),
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
            body: JSON.stringify({
                toolName,
                result,
            }),
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
            body: JSON.stringify({
                field,
                value,
            }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || `Ghostwriter answer submission failed: ${response.status}`);
        }

        return response.json() as Promise<GhostwriterRunState>;
    }

    static async executeToolCall(toolCall: GhostwriterToolCall, draft: GhostwriterDraftInput): Promise<unknown> {
        switch (toolCall.name) {
            case "analyze_instruction": {
                const analysis = await GhostwriterOrchestrator.analyzeInstruction(draft);
                return analysis;
            }
            case "generate_outlines": {
                const outlines = await GhostwriterOrchestrator.setupOutlines();
                return { count: outlines.length };
            }
            case "search_sources": {
                const targetCount = Number(toolCall.args?.targetCount || 4);
                const sources = await GhostwriterOrchestrator.searchSources(targetCount);
                return { sources };
            }
            case "scrape_sources": {
                const sources = (toolCall.args?.sources || []) as AlvinSearchResult[];
                const scraped = await GhostwriterOrchestrator.scrapeSources(sources);
                return { scrapedCount: scraped.length };
            }
            case "compact_sources": {
                const compacted = await GhostwriterOrchestrator.gatherSourceData();
                return { compactedCount: compacted.length };
            }
            case "generate_essay": {
                const essay = await GhostwriterOrchestrator.sculptEssay(() => {
                    // Run silently. The orchestrator owns progress now.
                });
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
                return {
                    title: snapshot.title,
                    pageCount: snapshot.pages.length,
                };
            }
            default:
                throw new Error(`Unknown Ghostwriter tool: ${toolCall.name}`);
        }
    }
}
