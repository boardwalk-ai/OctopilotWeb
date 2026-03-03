export interface ScrapeResult {
    title?: string;
    author?: string;
    publishedYear?: string;
    publisher?: string;
    fullContent?: string;
}

export class ScraperService {
    /**
     * Sends a URL to the Octopilot API to extract its article content.
     */
    static async scrape(url: string): Promise<ScrapeResult> {
        const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`, {
            method: "GET"
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`Scraper failed: ${res.status} ${errText}`);
        }

        const data = await res.json();
        const ref = data?.references?.[0];

        if (!ref) {
            throw new Error("Scraper returned no references array for this URL.");
        }

        return {
            title: ref.title || undefined,
            fullContent: ref.rawContent || undefined,
            publisher: ref.source || undefined,
            // the returned schema doesn't reliably have author/year, it provides 'citation' string.
        };
    }
}
