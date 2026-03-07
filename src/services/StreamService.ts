import { AuthService } from "./AuthService";

type StreamEvent = {
  type: string;
  data: string | null;
};

type StreamHandlers = {
  onEvent: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
};

const STREAM_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

export class StreamService {
  static async connect(handlers: StreamHandlers): Promise<() => void> {
    const token = await AuthService.getIdToken();
    if (!token) {
      throw new Error("Missing auth token for stream connection.");
    }

    const controller = new AbortController();
    const response = await fetch(`${STREAM_BASE_URL}/api/v1/stream`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to connect to stream: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const consume = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          let boundaryIndex = buffer.indexOf("\n\n");
          while (boundaryIndex !== -1) {
            const rawChunk = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);

            rawChunk
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.startsWith("data:"))
              .forEach((line) => {
                const payload = line.slice(5).trim();
                if (!payload || payload === "heartbeat") {
                  return;
                }

                const separatorIndex = payload.indexOf("|");
                if (separatorIndex === -1) {
                  handlers.onEvent({ type: payload, data: null });
                  return;
                }

                handlers.onEvent({
                  type: payload.slice(0, separatorIndex),
                  data: payload.slice(separatorIndex + 1),
                });
              });

            boundaryIndex = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          handlers.onError?.(error instanceof Error ? error : new Error("Stream connection failed."));
        }
      }
    };

    void consume();

    return () => {
      controller.abort();
      void reader.cancel().catch(() => undefined);
    };
  }
}
