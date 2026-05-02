export interface ScrapeResult {
    title?: string;
    author?: string;
    publishedYear?: string;
    publisher?: string;
    fullContent?: string;
}

// v2 API wraps results in a references array.
type UpstreamReference = {
    title?: string;
    source?: string;
    publisher?: string;
    authors?: string[];
    publicationYear?: number | null;
    rawContent?: string;  // v2.0 name
    fullContent?: string; // v1 back-compat name
};

type UpstreamResponse = {
    // v2 shape
    references?: UpstreamReference[];
    // v1 flat shape
    title?: string;
    publisher?: string;
    fullContent?: string;
};

const SCRAPE_TIMEOUT_MS = 15_000;

export class ScraperService {
    /**
     * Sends a URL to the Octopilot API to extract its article content.
     * Handles both v1 (flat) and v2 (references array) response formats,
     * with a 15-second per-URL timeout.
     */
    static async scrape(url: string): Promise<ScrapeResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

        let res: Response;
        try {
            res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`, {
                method: "GET",
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`Scraper failed: ${res.status} ${errText}`);
        }

        const data = (await res.json()) as UpstreamResponse;

        // v2: references array takes priority.
        if (Array.isArray(data.references) && data.references.length > 0) {
            const ref = data.references[0];
            return {
                title: ref.title || undefined,
                // rawContent is the v2.0 field; fall back to fullContent for older endpoints.
                fullContent: ref.rawContent || ref.fullContent || undefined,
                publisher: ref.publisher || ref.source || undefined,
            };
        }

        // v1: flat response — use top-level fields.
        if (data.fullContent) {
            return {
                title: data.title || undefined,
                fullContent: data.fullContent,
                publisher: data.publisher || undefined,
            };
        }

        throw new Error("Scraper returned no usable content for this URL.");
    }
}
