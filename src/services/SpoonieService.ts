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
    static async generateCitation(input: SpoonieCitationInput): Promise<string> {
        const res = await fetch("/api/spoonie/citation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task: "CITATION_PREVIEW", input }),
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
        const res = await fetch("/api/spoonie/citation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task: "OCR_EXTRACT", input }),
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
        const res = await fetch("/api/spoonie/citation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task: "FIELDWORK_CITATION", input }),
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
