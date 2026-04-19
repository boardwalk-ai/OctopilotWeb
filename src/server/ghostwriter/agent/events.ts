// AgentEvent — the streaming protocol between the agent loop (server) and the
// Ghostwriter UI (client). Every runtime signal the UI needs to render a live
// timeline, thinking panel, or question modal flows through this union.
//
// Transport: Server-Sent Events. Each event is encoded as one
//   `data: <json>\n\n`
// frame by the `/api/ghostwriter/run` route.

import type { ExportDocumentSnapshot } from "@/services/OrganizerService";

export type AgentEvent =
  // Streaming reasoning from the orchestrator model. Partial deltas — the UI
  // appends them to a live "thinking" panel.
  | { type: "thought"; text: string }

  // Lifecycle of a single tool call. `id` is a client-stable nanoid so
  // progress/done/error can reference the same entry in the timeline.
  | { type: "step_start"; id: string; title: string; tool: string; args?: unknown }
  | { type: "step_progress"; id: string; detail: string }
  | { type: "step_done"; id: string; summary?: string }
  | { type: "step_error"; id: string; error: string; retryable: boolean }

  // The orchestrator called the `ask_user` tool. The run is paused until
  // `POST /api/ghostwriter/answer` resolves the matching field.
  | {
      type: "question";
      field: string;
      question: string;
      suggestions?: string[];
      inputType?: "text" | "number" | "select";
    }

  // Partial context mirror so the client can render intermediate artifacts
  // (outlines, source list, streaming essay) without re-fetching.
  | { type: "context_update"; patch: Record<string, unknown> }

  // Streaming writer output. Emitted for every raw token the Lucas / writer
  // sub-agent produces so the UI can render the essay as it's drafted.
  // `chunk` is a raw model delta (not JSON) — the tool that owns the stream
  // is responsible for parsing the complete output into essay + bibliography
  // when the stream closes.
  | { type: "essay_delta"; chunk: string }

  // Terminal events.
  | { type: "done"; exportDoc: ExportDocumentSnapshot | null }
  | { type: "fatal"; error: string };

export type AgentEventType = AgentEvent["type"];

// Encode an event as an SSE frame. Keep the leading `data:` and the double
// newline — omitting either breaks the `EventSource` parser in browsers.
export function encodeSseFrame(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
