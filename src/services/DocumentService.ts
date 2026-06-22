import { fetchWithUserAuthorization } from "./authenticatedFetch";

/** Thrown by create() when the user is at their saved-document quota. */
export class DocumentLimitError extends Error {
    limit: number;
    constructor(message: string, limit: number) {
        super(message);
        this.name = "DocumentLimitError";
        this.limit = limit;
    }
}

export interface DocumentSummary {
    id: string;
    title: string;
    format_style: string;
    word_count: number;
    preview: string;
    created_at: string;
    updated_at: string;
}

export interface DocumentDetail extends DocumentSummary {
    state: unknown;
}

export interface DocumentPayload {
    title: string;
    format_style: string;
    word_count: number;
    preview: string;
    state: unknown;
    sources?: { source_ref?: string; title?: string; url?: string; content?: string }[];
    outlines?: {
        outline_ref?: string;
        type?: string;
        title?: string;
        bullets?: { text?: string; sub?: { text?: string }[] }[];
    }[];
}

/** Client for the Save Deck documents API (Firebase-token authed). */
export const DocumentService = {
    async list(): Promise<{ documents: DocumentSummary[]; limit: number }> {
        const res = await fetchWithUserAuthorization("/api/documents");
        if (!res.ok) throw new Error("Failed to load documents.");
        const data = (await res.json()) as { documents?: DocumentSummary[]; limit?: number };
        return { documents: data.documents ?? [], limit: data.limit ?? 10 };
    },

    async create(payload: DocumentPayload): Promise<string> {
        const res = await fetchWithUserAuthorization("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (res.status === 403) {
            const d = (await res.json().catch(() => ({}))) as { message?: string; limit?: number };
            throw new DocumentLimitError(d.message || "Saved-document limit reached.", d.limit ?? 10);
        }
        if (!res.ok) throw new Error("Failed to create document.");
        const data = (await res.json()) as { id: string };
        return data.id;
    },

    async save(id: string, payload: DocumentPayload): Promise<void> {
        const res = await fetchWithUserAuthorization(`/api/documents/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to save document.");
    },

    async load(id: string): Promise<DocumentDetail> {
        const res = await fetchWithUserAuthorization(`/api/documents/${id}`);
        if (!res.ok) throw new Error("Failed to load document.");
        const data = (await res.json()) as { document: DocumentDetail };
        return data.document;
    },

    async remove(id: string): Promise<void> {
        const res = await fetchWithUserAuthorization(`/api/documents/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete document.");
    },
};
