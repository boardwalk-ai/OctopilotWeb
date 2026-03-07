import { Organizer } from "./OrganizerService";

export class LucasService {
    static async generate(onChunk: (text: string) => void): Promise<string> {
        const state = Organizer.get();

        const res = await fetch("/api/lucas/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                organizerState: state,
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
                    } catch {
                        // Incomplete JSON chunk, ignore for now
                    }
                }
            }
        }

        return fullContent;
    }
}
