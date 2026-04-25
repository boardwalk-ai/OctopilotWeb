import type { SlidesSSEEvent } from "@/types/slides";
import { fetchWithUserAuthorization } from "./authenticatedFetch";

function drainFrames(buffer: string, onEvent: (event: SlidesSSEEvent) => void): string {
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

    if (payload && !payload.startsWith("keep-alive")) {
      onEvent(JSON.parse(payload) as SlidesSSEEvent);
    }

    splitIndex = pending.indexOf("\n\n");
  }

  return pending;
}

export class SlidesAgentClient {
  static async start(
    payload: { instruction: string; deckId?: string },
    onEvent: (event: SlidesSSEEvent) => void,
  ): Promise<{ close: () => void; getRunId: () => string }> {
    const controller = new AbortController();

    const response = await fetchWithUserAuthorization("/api/slides/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Slides agent failed to start: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let runId = "";

    void (async () => {
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = drainFrames(buffer, (ev) => {
          if (
            ev.type === "workflow_step" &&
            ev.stepId === "run_id" &&
            ev.status === "done" &&
            typeof ev.detail === "string"
          ) {
            runId = ev.detail;
          }
          onEvent(ev);
        });
      }
    })().catch((error) => {
      if (!controller.signal.aborted) {
        console.error("[SlidesAgentClient] Stream failed", error);
      }
    });

    return {
      getRunId: () => runId,
      close: () => {
        controller.abort();
        void reader.cancel().catch(() => undefined);
      },
    };
  }

  static async answer(runId: string, field: string, value: unknown): Promise<void> {
    const response = await fetchWithUserAuthorization("/api/slides/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, field, value }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Slides answer failed: ${response.status}`);
    }
  }
}

