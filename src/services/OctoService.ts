import { Organizer } from "./OrganizerService";
import { buildOctoRuntimeContext } from "@/lib/octoContext";

interface OctoResponse {
    answer: string;
}

export class OctoService {
    static async ask(question: string, currentPage: string): Promise<string> {
        const organizer = Organizer.get();
        const runtimeContext = buildOctoRuntimeContext(currentPage, organizer);

        const res = await fetch("/api/octo/assist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question,
                currentPage,
                runtimeContext,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Octo assist failed: ${res.status}`);
        }

        const data: OctoResponse = await res.json();
        return String(data.answer || "").trim();
    }
}
