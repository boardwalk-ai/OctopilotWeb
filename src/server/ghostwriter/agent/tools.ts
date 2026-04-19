// Tool registry for the Ghostwriter agent.
//
// A `Tool` is the server-side contract between the orchestrator model and a
// concrete capability (search the web, draft a paragraph, ask the user…).
// The agent loop in `loop.ts` iterates the registry, ships their JSON-Schema
// definitions to OpenRouter as `tools`, dispatches calls by name, and wires
// the result back into the chat history.
//
// Milestone 2 ships two tools:
//   - `echo`     — proof-of-life: the model calls it, the loop returns the
//                  payload verbatim. Validates round-trip streaming.
//   - `ask_user` — pauses the run on a typed question; resumed by
//                  `/api/ghostwriter/answer`. Treated specially in the loop
//                  because it talks to the event bus rather than returning
//                  data directly.

import type { AgentRun } from "./runs";

export type ToolContext = {
  run: AgentRun;
};

// JSON Schema Draft-7 subset — enough to describe OpenRouter tool params.
// Kept as `Record<string, unknown>` to dodge the deep type gymnastics; the
// orchestrator model is the actual validator.
export type ToolParametersSchema = Record<string, unknown>;

export type Tool<Args = Record<string, unknown>, Result = unknown> = {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  execute: (args: Args, ctx: ToolContext) => Promise<Result>;
  // Human-readable title for the UI timeline. Receives the parsed args so
  // tools like `search_sources` can render the query string.
  stepTitle: (args: Args) => string;
  // `ask_user` is dispatched through the event bus rather than `execute`.
  // The loop checks this flag and diverts.
  isUserQuestion?: boolean;
  // Cap on a single invocation. Defaults to AGENT_LIMITS.DEFAULT_TOOL_TIMEOUT_MS.
  timeoutMs?: number;
};

// Heterogeneous registry alias. Each tool has its own Args/Result generics;
// the registry has to accept them all. `any` is the standard escape hatch
// for this pattern — the loop safely narrows at the call site by parsing
// arguments from JSON and treating the result as unknown.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;

// Convert our Tool shape to the OpenAI / OpenRouter `tools[]` wire format.
// Exported so the loop can pass it straight to `fetch`.
export function toOpenRouterToolSpec(tool: Tool) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
