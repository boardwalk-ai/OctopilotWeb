import type { AgentEvent } from "@/server/ghostwriter/agent/events";
import { fetchWithUserAuthorization } from "./authenticatedFetch";

type StartPayload = {
  instruction: string;
  detectedSettings?: {
    wordCount?: number;
    citationStyle?: string;
  };
};

type StartResponse = {
  runId: string;
  mode: "dummy" | "agentic";
};

function drainFrames(buffer: string, onEvent: (event: AgentEvent) => void): string {
  let pending = buffer;
  let splitIndex = pending.indexOf("\n\n");

  while (splitIndex !== -1) {
    const frame = pending.slice(0, splitIndex);
    pending = pending.slice(splitIndex + 2);

    const payload = frame
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");

    if (payload) {
      onEvent(JSON.parse(payload) as AgentEvent);
    }

    splitIndex = pending.indexOf("\n\n");
  }

  return pending;
}

export class GhostwriterAgentClient {
  static async start(payload: StartPayload, mode?: "agentic" | "dummy"): Promise<StartResponse> {
    const query = mode ? `?mode=${mode}` : "";
    const response = await fetchWithUserAuthorization(`/api/ghostwriter/start${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft: {
          instruction: payload.instruction,
          detectedSettings: payload.detectedSettings,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Ghostwriter agent failed to start: ${response.status}`);
    }

    return response.json() as Promise<StartResponse>;
  }

  static async connect(runId: string, onEvent: (event: AgentEvent) => void): Promise<() => void> {
    const controller = new AbortController();
    const response = await fetchWithUserAuthorization(`/api/ghostwriter/run?runId=${encodeURIComponent(runId)}`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ghostwriter stream failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    void (async () => {
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = drainFrames(buffer, onEvent);
      }
    })().catch((error) => {
      if (!controller.signal.aborted) {
        console.error("[GhostwriterAgentClient] Stream failed", error);
      }
    });

    return () => {
      controller.abort();
      void reader.cancel().catch(() => undefined);
    };
  }

  static async answer(runId: string, field: string, value: unknown): Promise<void> {
    const response = await fetchWithUserAuthorization("/api/ghostwriter/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, field, value }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Ghostwriter answer failed: ${response.status}`);
    }
  }
}
