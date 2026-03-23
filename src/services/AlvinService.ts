import { Organizer } from "./OrganizerService";
import { TestService } from "./TestService";
import { fetchWithUserAuthorization } from "./authenticatedFetch";

export interface AlvinSearchResult {
    website_URL: string;
    Title: string;
    Author: string;
    "Published Year": string;
    Publisher: string;
}

export class AlvinService {
    private static async callSearchWithRetry(payload: object): Promise<Response> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetchWithUserAuthorization("/api/alvin/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (res.ok) return res;

                const maybeRetryable = res.status >= 500 || res.status === 429;
                if (!maybeRetryable || attempt === 1) return res;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error("Alvin search request failed");
                if (attempt === 1) throw lastError;
            }

            await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }

        throw lastError || new Error("Alvin search request failed");
    }

    static async searchSources(targetCount: number): Promise<AlvinSearchResult[]> {
        if (TestService.isActive) {
            const mocks = await TestService.getSources();
            return mocks as unknown as AlvinSearchResult[];
        }

        const state = Organizer.get();

        if (!state.essayTopic) {
            throw new Error("Essay Topic is missing. Cannot search for sources without a topic.");
        }

        const payload = {
            targetCount,
            essayTopic: state.essayTopic,
            outlines: state.selectedOutlines.length > 0 ? state.selectedOutlines : state.outlines,
        };
        const res = await AlvinService.callSearchWithRetry(payload);

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Alvin search failed: ${res.status}`);
        }

        const results: AlvinSearchResult[] = await res.json();
        return results;
    }
}
