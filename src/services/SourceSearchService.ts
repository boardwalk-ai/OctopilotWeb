// Client-side consumer for the /api/sources/search SSE endpoint.
//
// Calls onSource for every source that arrives from the stream so callers
// can animate results one-by-one without waiting for the whole batch.

import { fetchWithUserAuthorization } from "./authenticatedFetch";

export type SearchedSource = {
  url: string;
  title: string;
  author?: string;
  publishedYear?: string;
  publisher?: string;
  outlineIndex?: number;
  fullContent: string;
};

export type SearchSourcesParams = {
  essayTopic: string;
  outlines: Array<{ type?: string; title: string; description?: string }>;
  targetCount?: number;
  /** Called immediately when each source is validated and scraped server-side. */
  onSource: (source: SearchedSource) => void;
};

/**
 * Stream source search results from the server. Resolves when the stream ends.
 * Rejects on auth failures or fatal server errors.
 */
export async function searchSourcesStreaming({
  essayTopic,
  outlines,
  targetCount = 12,
  onSource,
}: SearchSourcesParams): Promise<void> {
  const response = await fetchWithUserAuthorization("/api/sources/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ essayTopic, outlines, targetCount }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Source search failed: ${response.status} ${text}`);
  }

  if (!response.body) throw new Error("No response body from source search");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines.
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;

      let event: { type: string; source?: SearchedSource; message?: string };
      try {
        event = JSON.parse(line.slice(6)) as typeof event;
      } catch {
        continue; // Malformed line — skip.
      }

      if (event.type === "source" && event.source) {
        onSource(event.source);
      } else if (event.type === "error" && event.message) {
        throw new Error(event.message);
      }
      // "done" events are just informational — nothing to do.
    }
  }
}
