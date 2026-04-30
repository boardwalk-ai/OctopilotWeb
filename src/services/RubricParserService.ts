import { FileReadService } from "./FileReadService";
import { fetchWithUserAuthorization } from "./authenticatedFetch";
import type { RubricCriterion } from "./OrganizerService";

export class RubricParserService {
    /**
     * Parse a rubric file (image or PDF) into structured criteria.
     * Images are sent as vision content; PDFs are text-extracted first.
     */
    static async parse(file: File): Promise<RubricCriterion[]> {
        let text = "";
        let imageDataUrl = "";

        if (FileReadService.isImageFile(file)) {
            imageDataUrl = await FileReadService.toDataUrl(file);
        } else {
            text = await FileReadService.extractText(file);
        }

        const res = await fetchWithUserAuthorization("/api/rubric/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, imageDataUrl }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({})) as { error?: string };
            throw new Error(err.error || `Rubric parsing failed: ${res.status}`);
        }

        const data = await res.json() as { criteria?: RubricCriterion[] };
        return data.criteria ?? [];
    }
}
