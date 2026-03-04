import { Organizer } from "./OrganizerService";
import { TestService } from "./TestService";

interface BackendKeyResponse {
    openrouter_api_key: string;
    brave_api_key: string;
    primary_model: string;
    secondary_model: string;
    source_search_model?: string;
}

export interface JasmineSearchResult {
    website_URL: string;
    Title: string;
    Author: string;
    "Published Year": string;
    Publisher: string;
}

export class JasmineService {
    private static async callSearchWithRetry(payload: object): Promise<Response> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetch("/api/jasmine/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (res.ok) return res;

                const maybeRetryable = res.status >= 500 || res.status === 429;
                if (!maybeRetryable || attempt === 1) return res;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error("Jasmine search request failed");
                if (attempt === 1) throw lastError;
            }

            await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }

        throw lastError || new Error("Jasmine search request failed");
    }

    /**
     * Fetch a random active OpenRouter API key + the current source search model
     */
    static async fetchConfig(): Promise<{ apiKey: string; model: string }> {
        // Fetch the API keys from the public endpoint
        // and the full admin settings (via our local proxy to avoid CORS) in parallel
        const [keysRes, settingsRes] = await Promise.all([
            fetch("https://api.octopilotai.com/api/v1/settings/keys"),
            fetch("/api/settings")
        ]);

        if (!keysRes.ok) throw new Error("Failed to fetch API keys from backend");
        if (!settingsRes.ok) throw new Error("Failed to fetch admin settings from proxy");

        const keysData: BackendKeyResponse = await keysRes.json();
        const settingsData: { key: string; value: string }[] = await settingsRes.json();

        if (!keysData.openrouter_api_key) {
            throw new Error("No active OpenRouter key available in the pool");
        }

        // Find the source_search_model from admin settings
        const sourceModelSetting = settingsData.find(s => s.key === "source_search_model");
        const targetModel = sourceModelSetting?.value || keysData.secondary_model;

        console.log("[Jasmine] source_search_model from DB:", sourceModelSetting?.value);
        console.log("[Jasmine] Using model:", targetModel);

        if (!targetModel) {
            throw new Error("No source_search_model or secondary model configured in backend settings");
        }

        return {
            apiKey: keysData.openrouter_api_key,
            model: targetModel,
        };
    }

    /**
     * Ask Jasmine to find academic sources based on the essay topic and outlines.
     */
    static async searchSources(targetCount: number): Promise<JasmineSearchResult[]> {
        if (TestService.isActive) {
            const mocks = await TestService.getSources();
            return mocks as unknown as JasmineSearchResult[];
        }

        const state = Organizer.get();

        if (!state.essayTopic) {
            throw new Error("Essay Topic is missing. Cannot search for sources without a topic.");
        }

        const { apiKey, model } = await JasmineService.fetchConfig();

        const payload = {
            targetCount,
            essayTopic: state.essayTopic,
            outlines: state.selectedOutlines.length > 0 ? state.selectedOutlines : state.outlines,
            apiKey,
            model,
        };
        const res = await JasmineService.callSearchWithRetry(payload);

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Jasmine search failed: ${res.status}`);
        }

        const results: JasmineSearchResult[] = await res.json();
        return results;
    }
}
