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
        const res = await fetch("/api/humanize/stealthgpt", {
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
        const res = await fetch("/api/humanize/undetectable", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Undetectable AI failed: ${res.status}`);
        }

        const data = await res.json();

        // Undetectable AI might return the ID in `documentId` or the actual `output` if it's synchronous.
        // If it's asynchronous and returns an ID, we'd need to poll.
        // Assuming synchronous output exists in `output` or `status: 'success'` based on common wrappers.
        if (data.status === "success" && data.documentId && !data.output) {
            // Polling logic for undetectable if it is strictly async
            return await this.pollUndetectableDocument(data.documentId);
        }

        return data.output || "Humanized content not found.";
    }

    private static async pollUndetectableDocument(id: string): Promise<string> {
        // Mock polling logic for now, undetectable API uses api.undetectable.ai/document
        // Assuming the proxy returns the text. We might need to implement a document polling proxy endpoint.
        const res = await fetch("/api/humanize/undetectable/document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });

        if (!res.ok) throw new Error("Failed to fetch humanized document.");
        const data = await res.json();
        return data.output;
    }
}
