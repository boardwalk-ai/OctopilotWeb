import { Organizer } from "./OrganizerService";
import { fetchWithUserAuthorization } from "./authenticatedFetch";

export class LucasService {
    static async generate(onChunk: (text: string) => void): Promise<string> {
        const state = Organizer.get();

        const res = await fetchWithUserAuthorization("/api/lucas/generate", {
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
        let buffer = "";

        const processLine = (line: string) => {
            if (!line.startsWith("data: ") || line === "data: [DONE]") {
                return;
            }

            try {
                const parsed = JSON.parse(line.slice(6));
                const token = parsed.choices?.[0]?.delta?.content || "";
                if (token) {
                    fullContent += token;
                    onChunk(fullContent);
                }
            } catch {
                // Wait for more buffered data if this event is incomplete.
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                buffer += decoder.decode();
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            let boundaryIndex = buffer.indexOf("\n\n");
            while (boundaryIndex !== -1) {
                const rawEvent = buffer.slice(0, boundaryIndex);
                buffer = buffer.slice(boundaryIndex + 2);

                for (const line of rawEvent.split("\n")) {
                    processLine(line.trim());
                }

                boundaryIndex = buffer.indexOf("\n\n");
            }
        }

        if (buffer.trim()) {
            for (const line of buffer.split("\n")) {
                processLine(line.trim());
            }
        }

        return fullContent;
    }
}
