import { Organizer, SourceData, CompactedSource } from "./OrganizerService";
import { TestService } from "./TestService";

interface BackendKeyResponse {
    openrouter_api_key: string;
    secondary_model: string;
}

type CompactionInput = {
    sourceTitle: string;
    fullContent: string;
    sourceType: "search" | "pdf" | "image" | "fieldwork" | "manual";
};

export class ScarletService {
    /**
     * Fetch the API key + secondary model from the backend.
     */
    static async fetchConfig(): Promise<{ apiKey: string; model: string }> {
        const res = await fetch("https://api.octopilotai.com/api/v1/settings/keys");
        if (!res.ok) throw new Error("Failed to fetch API configuration");
        const data: BackendKeyResponse = await res.json();

        if (!data.openrouter_api_key || !data.secondary_model) {
            throw new Error("Missing API key or secondary model");
        }

        return { apiKey: data.openrouter_api_key, model: data.secondary_model };
    }

    /**
     * Compact a single source's full content via the Scarlet API route.
     */
    static async compactSource(
        source: SourceData,
        sourceIndex: number,
        apiKey: string,
        model: string
    ): Promise<CompactedSource> {
        const compactionInput = ScarletService.buildCompactionInput(source);
        const res = await fetch("/api/scarlet/compact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fullContent: compactionInput.fullContent,
                sourceTitle: compactionInput.sourceTitle,
                sourceType: compactionInput.sourceType,
                apiKey,
                model,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Scarlet compact failed: ${res.status}`);
        }

        const result = await res.json();

        return {
            sourceIndex,
            url: source.url,
            title: source.title,
            author: source.author,
            publishedYear: source.publishedYear,
            publisher: source.publisher,
            compactedContent: result.compacted_content || "",
        };
    }

    static buildCompactionInput(source: SourceData): CompactionInput {
        if (source.manualSourceType === "pdf") {
            const pageRange = source.pdfMeta ? `${source.pdfMeta.startPage}-${source.pdfMeta.endPage}` : "Unknown";
            const pageText = source.pdfMeta?.pages?.slice(
                Math.max(0, (source.pdfMeta.startPage || 1) - 1),
                source.pdfMeta?.endPage || source.pdfMeta?.pages?.length || undefined
            ).join("\n\n") || source.fullContent || "";

            return {
                sourceTitle: source.pdfMeta?.documentTitle || source.title || "PDF Source",
                sourceType: "pdf",
                fullContent: [
                    "Source Type: PDF excerpt",
                    `Document Title: ${source.pdfMeta?.documentTitle || source.title || "Unknown"}`,
                    `Author(s): ${source.author || "Unknown"}`,
                    `Publication Year: ${source.pdfMeta?.publicationYear || source.publishedYear || "Unknown"}`,
                    `Publisher / Journal: ${source.pdfMeta?.journalName || source.pdfMeta?.publisher || source.publisher || "Unknown"}`,
                    `Selected Pages: ${pageRange}`,
                    "Selected Text:",
                    pageText,
                ].join("\n"),
            };
        }

        if (source.manualSourceType === "image") {
            return {
                sourceTitle: source.imageMeta?.sourceLabel || source.title || "Image OCR Source",
                sourceType: "image",
                fullContent: [
                    "Source Type: Image OCR source",
                    `Source Label: ${source.imageMeta?.sourceLabel || source.title || "Unknown"}`,
                    `Citation Type: ${source.imageMeta?.citationKind || "Unknown"}`,
                    `Image Count: ${source.imageMeta?.imageCount || 0}`,
                    `Author / Contributor: ${source.author || "Unknown"}`,
                    `Publication Year: ${source.publishedYear || "Unknown"}`,
                    "Confirmed OCR Text:",
                    source.imageMeta?.finalSnippet || source.fullContent || "",
                ].join("\n"),
            };
        }

        if (source.manualSourceType === "fieldwork" && source.fieldworkMeta) {
            const customFieldLines = Object.entries(source.fieldworkMeta.customFields || {})
                .filter(([, value]) => Boolean((value || "").trim()))
                .map(([key, value]) => `${key}: ${value}`);

            return {
                sourceTitle: source.fieldworkMeta.title || source.title || "Fieldwork Entry",
                sourceType: "fieldwork",
                fullContent: [
                    "Source Type: Primary fieldwork entry",
                    `Research Type: ${source.fieldworkMeta.researchType || "Unknown"}`,
                    `Title / Topic: ${source.fieldworkMeta.title || source.title || "Unknown"}`,
                    `Date Conducted: ${source.fieldworkMeta.dateConducted || source.publishedYear || "Unknown"}`,
                    `Researcher / Recorder: ${source.fieldworkMeta.researcherName || source.author || "Unknown"}`,
                    `Location: ${source.fieldworkMeta.location || "Unknown"}`,
                    `Participants / Subjects: ${source.fieldworkMeta.participants || "Unknown"}`,
                    ...customFieldLines,
                    "Method Summary:",
                    source.fieldworkMeta.methodSummary || "",
                    "Key Findings:",
                    source.fieldworkMeta.keyFindings || "",
                    "Notes:",
                    source.fieldworkMeta.notes || "",
                ].join("\n"),
            };
        }

        return {
            sourceTitle: source.title || "Source",
            sourceType: source.manualSourceType === "url" || !source.manualSourceType ? "search" : "manual",
            fullContent: [
                source.manualSourceType ? `Source Type: ${source.manualSourceType}` : "Source Type: Search / web source",
                source.fullContent || "",
            ].join("\n\n"),
        };
    }

    /**
     * Run Scarlet on all scraped sources in the background.
     * Updates Organizer.compactedSources as each completes.
     */
    static async compactAllSources(): Promise<void> {
        if (TestService.isActive) {
            Organizer.set({
                compactedSources: [{
                    sourceIndex: 0,
                    url: "mock-url",
                    title: "Mock Compacted",
                    author: "Tester",
                    publishedYear: "2026",
                    publisher: "Test Mode",
                    compactedContent: "This is a mock compacted source content."
                }]
            });
            return;
        }

        const state = Organizer.get();
        const scrapedSources = state.manualSources
            .map((s, i) => ({ source: s, index: i }))
            .filter(({ source }) => source.status === "scraped" && source.fullContent);

        if (scrapedSources.length === 0) {
            console.log("[Scarlet] No scraped sources to compact.");
            return;
        }

        console.log(`[Scarlet] Compacting ${scrapedSources.length} sources...`);

        const { apiKey, model } = await ScarletService.fetchConfig();

        const results: CompactedSource[] = [];

        // Process sources one at a time to avoid rate limits
        for (const { source, index } of scrapedSources) {
            try {
                console.log(`[Scarlet] Compacting source ${index}: ${source.title || source.url}`);
                const compacted = await ScarletService.compactSource(source, index, apiKey, model);
                results.push(compacted);

                // Update Organizer progressively
                Organizer.set({ compactedSources: [...results] });
            } catch (err) {
                console.error(`[Scarlet] Failed to compact source ${index}:`, err);
            }
        }

        console.log(`[Scarlet] Done. Compacted ${results.length}/${scrapedSources.length} sources.`);
    }
}
