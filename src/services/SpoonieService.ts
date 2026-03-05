interface BackendKeyResponse {
    openrouter_api_key: string;
    secondary_model: string;
}

interface SpoonieResponse {
    citation?: string;
    extracted_text?: string;
}

export interface SpoonieAuthorInput {
    firstName: string;
    lastName: string;
}

export interface SpoonieCitationInput {
    citationStyle: string;
    documentTitle: string;
    publicationYear: string;
    authors: SpoonieAuthorInput[];
    journalName?: string;
    publisher?: string;
    volume?: string;
    issue?: string;
    edition?: string;
    pageRange?: string;
}

export interface SpoonieOcrInput {
    imageDataUrl: string;
}

export interface SpoonieFieldworkCitationInput {
    citationStyle: string;
    researchType: string;
    title: string;
    dateConducted: string;
    researcherName: string;
    location: string;
    participants: string;
    methodSummary: string;
    keyFindings: string;
    notes: string;
    customFields: Record<string, string>;
}

export class SpoonieService {
    static async fetchConfig(): Promise<{ apiKey: string; model: string }> {
        const res = await fetch("https://api.octopilotai.com/api/v1/settings/keys");
        if (!res.ok) throw new Error("Failed to fetch API configuration from backend");
        const data: BackendKeyResponse = await res.json();

        if (!data.openrouter_api_key) {
            throw new Error("No active OpenRouter key available in the pool");
        }
        if (!data.secondary_model) {
            throw new Error("No secondary model configured in backend settings");
        }

        return {
            apiKey: data.openrouter_api_key,
            model: data.secondary_model,
        };
    }

    static async generateCitation(input: SpoonieCitationInput): Promise<string> {
        const { apiKey, model } = await SpoonieService.fetchConfig();
        const res = await fetch("/api/spoonie/citation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task: "CITATION_PREVIEW", input, apiKey, model }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Spoonie citation failed: ${res.status}`);
        }

        const data: SpoonieResponse = await res.json();
        const citation = String(data.citation || "").trim();
        if (!citation) {
            throw new Error("Spoonie returned empty citation");
        }
        return citation;
    }

    static async extractImageText(input: SpoonieOcrInput): Promise<string> {
        const { apiKey, model } = await SpoonieService.fetchConfig();
        const res = await fetch("/api/spoonie/citation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task: "OCR_EXTRACT", input, apiKey, model }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Spoonie OCR failed: ${res.status}`);
        }

        const data: SpoonieResponse = await res.json();
        const extractedText = String(data.extracted_text || "").trim();
        if (!extractedText) {
            throw new Error("Spoonie returned empty extracted text");
        }
        return extractedText;
    }

    static async generateFieldworkCitation(input: SpoonieFieldworkCitationInput): Promise<string> {
        const { apiKey, model } = await SpoonieService.fetchConfig();
        const res = await fetch("/api/spoonie/citation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task: "FIELDWORK_CITATION", input, apiKey, model }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Spoonie fieldwork citation failed: ${res.status}`);
        }

        const data: SpoonieResponse = await res.json();
        const citation = String(data.citation || "").trim();
        if (!citation) {
            throw new Error("Spoonie returned empty fieldwork citation");
        }
        return citation;
    }
}
