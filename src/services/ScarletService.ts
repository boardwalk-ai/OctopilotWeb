import { Organizer, SourceData, CompactedSource } from "./OrganizerService";
import { TestService } from "./TestService";

interface BackendKeyResponse {
    openrouter_api_key: string;
    secondary_model: string;
}

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
        const res = await fetch("/api/scarlet/compact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fullContent: source.fullContent,
                sourceTitle: source.title || "",
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
