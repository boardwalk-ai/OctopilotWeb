import { fetchWithUserAuthorization } from "./authenticatedFetch";

export interface StealthGPTParams {
    prompt: string;
    rephrase: boolean;
    educationLevel?: string;
    strength?: string;
    detector?: string;
}

export interface UndetectableParams {
    content: string;
    readability: string;
    purpose: string;
    strength: string;
}

export class HumanizerService {
    static async stealthGPT(params: StealthGPTParams): Promise<string> {
        const res = await fetchWithUserAuthorization("/api/humanize/stealthgpt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `StealthGPT failed: ${res.status}`);
        }

        const data = await res.json();
        // The API returns the result in data.result
        return data.result || "";
    }

    static async undetectableAI(params: UndetectableParams): Promise<string> {
        const res = await fetchWithUserAuthorization("/api/humanize/undetectable", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Undetectable AI failed: ${res.status}`);
        }

        const data = await res.json();

        if (typeof data.output === "string" && data.output.trim()) {
            return data.output;
        }

        const documentId = data.documentId || data.id;
        if (documentId) {
            return await this.pollUndetectableDocument(documentId);
        }

        throw new Error("Undetectable AI did not return a document id.");
    }

    private static async pollUndetectableDocument(id: string): Promise<string> {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            if (attempt > 0) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }

            const res = await fetchWithUserAuthorization("/api/humanize/undetectable/document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });

            if (!res.ok) {
                if (attempt === 7) {
                    throw new Error("Failed to fetch humanized document.");
                }
                continue;
            }

            const data = await res.json();
            if (typeof data.output === "string" && data.output.trim()) {
                return data.output;
            }
        }

        throw new Error("Undetectable AI is still processing. Please try again.");
    }
}
