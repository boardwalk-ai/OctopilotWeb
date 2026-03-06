import { Organizer } from "./OrganizerService";
import { buildOctoRuntimeContext } from "@/lib/octoContext";

interface BackendKeyResponse {
    openrouter_api_key: string;
    secondary_model: string;
}

interface OctoResponse {
    answer: string;
}

export class OctoService {
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

    static async ask(question: string, currentPage: string): Promise<string> {
        const { apiKey, model } = await OctoService.fetchConfig();
        const organizer = Organizer.get();
        const runtimeContext = buildOctoRuntimeContext(currentPage, organizer);

        const res = await fetch("/api/octo/assist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question,
                currentPage,
                runtimeContext,
                apiKey,
                model,
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
