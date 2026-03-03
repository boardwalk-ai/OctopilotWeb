import { Organizer } from "./OrganizerService";

interface BackendKeyResponse {
    openrouter_api_key: string;
    primary_model: string;
}

export class LucasService {
    /**
     * Fetch the API key + primary model from the backend.
     */
    static async fetchConfig(): Promise<{ apiKey: string; model: string }> {
        const res = await fetch("https://api.octopilotai.com/api/v1/settings/keys");
        if (!res.ok) throw new Error("Failed to fetch API configuration");
        const data: BackendKeyResponse = await res.json();

        if (!data.openrouter_api_key || !data.primary_model) {
            throw new Error("Missing API key or primary model");
        }

        return { apiKey: data.openrouter_api_key, model: data.primary_model };
    }

    /**
     * Starts the generation process, streaming the response chunks back.
     * @param onChunk Callback fired with the newest appended raw text chunk
     */
    static async generate(onChunk: (text: string) => void): Promise<string> {
        const { apiKey, model } = await LucasService.fetchConfig();
        const state = Organizer.get();

        const res = await fetch("/api/lucas/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                organizerState: state,
                apiKey,
                model,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Lucas generate failed: ${res.status} ${errText}`);
        }

        if (!res.body) {
            throw new Error("No response body returned from stream");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // OpenRouter SSE format: "data: {...}\n\n"
            const lines = chunk.split("\n");
            for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    try {
                        const parsed = JSON.parse(line.slice(6));
                        const token = parsed.choices?.[0]?.delta?.content || "";
                        if (token) {
                            fullContent += token;
                            onChunk(fullContent);
                        }
                    } catch (e) {
                        // Incomplete JSON chunk, ignore for now
                    }
                }
            }
        }

        return fullContent;
    }
}
