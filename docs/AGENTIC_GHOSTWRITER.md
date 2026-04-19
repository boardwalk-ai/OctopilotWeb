# Agentic Ghostwriter — Rewrite Plan

> Status: **design / not implemented**
> Target: replace the current hardcoded 13-step pipeline in `src/server/ghostwriter/engine.ts` with an LLM-orchestrated agent loop.
> Author: migration plan drafted 2026-04-19.

---

## 1. Why

Today's Ghostwriter is a pseudo-agent: a hardcoded finite-state machine where every step, transition, and tool call is decided in code. The LLM is only used inside individual sub-tasks (outline generation, essay drafting, paragraph splitting), never as the orchestrator.

Limitations of the current design:

- **No dynamic planning.** Every essay goes through the same 13 steps regardless of topic, length, or type.
- **No self-correction.** There is no critic → revise loop. The essay the writer produces is the essay that ships.
- **No adaptive research.** Sources are gathered once; there's no "these sources are weak, search again" behavior.
- **Error recovery is string-matched.** `isRetryableError()` greps the error message. No reasoning about *why* something failed.
- **Tools are not tools.** They're switch-case branches in `engine.ts`, not capabilities the model can choose from.

We want to move to a true agent loop while keeping UX predictable (step tracker, streaming, user questions) and keeping cost bounded.

---

## 2. Target architecture

```
┌─────────────── Agent loop (server) ───────────────┐
│  while !done && steps < MAX_STEPS:                 │
│    response = openrouter.chat(                     │
│      messages,                                     │
│      tools=[...all tools],                         │
│      stream=true,                                  │
│    )                                               │
│    stream `thought` events to client as deltas     │
│    if finish_reason === "stop": done               │
│    for tc in response.tool_calls:                  │
│      emit step_start                               │
│      result = await dispatch(tc)                   │
│      emit step_done / step_error                   │
│      messages.push(tool_result(tc.id, result))     │
└────────────────────────────────────────────────────┘
```

The LLM is the orchestrator. `engine.ts` becomes a thin dispatcher.

### Model selection

Orchestrator requires strong tool-use. Use **primary** (Claude Sonnet class). Leaf sub-agents that don't need reasoning (paragraph split, outline generation) use **secondary** (Gemini Flash class).

Current config lives in the admin-backed DB: `getOpenRouterConfig("primary" | "secondary" | "source_search")` in `src/server/backendConfig.ts`.

---

## 3. File tree

```
src/server/ghostwriter/
  agent/
    loop.ts              ← agent loop (core)
    tools.ts             ← tool registry + JSON schemas
    systemPrompt.ts      ← orchestrator prompt
    events.ts            ← SSE event types
    context.ts           ← AgentContext (state, pause/resume)
    runs.ts              ← in-memory AgentRun store
    cost.ts              ← token → USD estimation
  tools/
    plan.ts              ← plan_essay          (planner sub-agent)
    outlines.ts          ← generate_outlines   (wraps Lily)
    search.ts            ← search_sources     (Brave)
    evaluate.ts          ← evaluate_sources   (NEW critic)
    scrape.ts            ← scrape_sources
    write.ts             ← write_paragraph    (per-paragraph drafting)
    critique.ts          ← critique_essay     (NEW critic)
    revise.ts            ← revise_paragraph   (NEW)
    humanize.ts          ← humanize_essay
    split.ts             ← split_paragraphs
    ask.ts               ← ask_user           (pause/resume)
    finalize.ts          ← finalize_export
  engine.ts              ← legacy (kept behind flag for rollback)

src/app/api/ghostwriter/
  start/route.ts         ← NEW: POST draft → returns runId
  run/route.ts           ← NEW: SSE stream by runId
  answer/route.ts        ← NEW: POST answers back to paused runs
  split-paragraphs/route.ts (kept; used by split.ts tool)

src/services/
  GhostwriterAgentClient.ts  ← NEW: SSE client + question handling
  GhostwriterOrchestrator.ts ← legacy (behind flag)

src/views/
  GhostwriterWorkflowView.tsx ← renders dynamic timeline from events

docs/
  AGENTIC_GHOSTWRITER.md   ← this file
```

---

## 4. Tool registry

```ts
// src/server/ghostwriter/agent/tools.ts
export type Tool<A = any, R = any> = {
  name: string;
  description: string;        // LLM reads this to decide when to call
  parameters: JSONSchema;
  execute: (args: A, ctx: AgentContext) => Promise<R>;
  stepTitle: (args: A) => string;   // for the UI timeline
  parallelSafe?: boolean;
  timeoutMs?: number;
};
```

Minimum tool set:

| Tool | Purpose | Sub-agent model |
|---|---|---|
| `plan_essay` | Decide structure, paragraph count, search strategy, whether humanization is expected | primary |
| `generate_outlines` | Produce N outlines (1 intro + N-2 body + 1 conclusion) | secondary (Lily) |
| `search_sources` | Brave search; can be called multiple times with refined queries | - |
| `evaluate_sources` | Judge sufficiency; returns `{ sufficient: bool, missing: string[] }` | secondary |
| `scrape_sources` | Fetch full content of approved sources | - |
| `write_paragraph` | Draft ONE paragraph from its outline + assigned sources | primary |
| `critique_essay` | Return list of issues (thesis weak, para 3 off-topic, etc.) | primary |
| `revise_paragraph` | Rewrite one paragraph based on a critique issue | primary |
| `ask_user` | Pause and ask a typed question with optional suggestions | - |
| `humanize_essay` | Call StealthGPT / UndetectableAI | - |
| `split_paragraphs` | Re-split merged humanizer output using outline structure | secondary |
| `finalize_export` | Build the `ExportDocumentSnapshot` for download | - |

---

## 5. Agent context (shared state)

```ts
// src/server/ghostwriter/agent/context.ts
export type AgentContext = {
  draft: GhostwriterDraftInput;
  plan?: EssayPlan;
  outlines: OutlineItem[];
  searchResults: SearchResult[];
  scrapedSources: ScrapedSource[];
  paragraphs: Map<string, DraftedParagraph>;  // outlineId → paragraph
  critiqueIssues: CritiqueIssue[];
  revisionRounds: number;
  draftSettings?: GhostwriterDraftSettings;
  formatAnswers: Partial<GhostwriterFormatAnswers>;
  humanizedContent?: string;
  humanizerProvider?: "StealthGPT" | "UndetectableAI";
  exportDoc?: ExportDocumentSnapshot;
};
```

Tools mutate `ctx` via their return value; the loop patches it and emits a `context_update` event so the client mirrors state.

---

## 6. Pause / resume semantics

**`ask_user` is a special tool.** When the LLM calls it:

1. Loop emits a `question` SSE event (field, question, suggestions).
2. Loop awaits `run.waitForAnswer(field)` — a promise resolved by the `POST /api/ghostwriter/answer` route.
3. When the answer arrives, it's inserted as the tool result and the loop continues.

### Persistence

**Iteration 1 — in-memory store** (`runs.ts`). If the server restarts mid-run, the run is lost. Acceptable for MVP.

**Iteration 2 — DB-persisted runs.** Each tool call snapshots `ctx` and `messages[]` to Postgres. `POST /answer` can load cold runs from disk and resume. Deferred.

---

## 7. SSE event protocol

```ts
export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "step_start"; id: string; title: string; tool: string; args?: any }
  | { type: "step_progress"; id: string; detail: string }
  | { type: "step_done"; id: string; summary?: string }
  | { type: "step_error"; id: string; error: string; retryable: boolean }
  | { type: "question"; field: string; question: string; suggestions: string[] }
  | { type: "context_update"; patch: Partial<AgentContext> }
  | { type: "done"; exportDoc: ExportDocumentSnapshot }
  | { type: "fatal"; error: string };
```

Transport: `text/event-stream`. Each event is one `data: <json>\n\n` frame.

### Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ghostwriter/start` | Create run, return `{ runId }` |
| GET  | `/api/ghostwriter/run?runId=…` | SSE stream of events |
| POST | `/api/ghostwriter/answer` | `{ runId, field, value }` — resume paused run |
| POST | `/api/ghostwriter/cancel` | `{ runId }` — abort run |

---

## 8. System prompt (orchestrator)

```
You are the Ghostwriter orchestrator for OctoPilot AI.

GOAL
Deliver a finished, well-cited, downloadable essay that matches the user's brief.

You have tools. Call them to make progress. When the essay is delivered
(finalize_export has run with a valid snapshot), stop calling tools.

GUIDELINES (adapt per task; not a strict script)
- Start with plan_essay to decide structure.
- generate_outlines according to the plan.
- Loop search_sources → evaluate_sources. If sources are weak, refine the
  query and search again. Don't scrape until sources are approved.
- scrape_sources once sources are confirmed.
- ask_user for any draft settings the brief didn't provide (word count,
  citation style, etc.).
- write_paragraph per outline. You may call these in parallel.
- critique_essay. If issues exist, revise_paragraph for each, then
  re-critique. Cap at 3 revision rounds.
- ask_user about humanization preference.
- humanize_essay if requested. For StealthGPT output, call split_paragraphs.
- finalize_export.

RULES
- If a tool returns an error, reason about it. Retry with different args
  only if the error looks retryable. Otherwise ask_user or abort.
- Never repeat the same tool call with identical args — that's a bug.
- Keep your reasoning terse. Users see it live.
- You don't need to narrate what you're about to do. Just call the tool.
```

---

## 9. Safety guards

```ts
export const AGENT_LIMITS = {
  MAX_STEPS: 40,
  MAX_COST_USD: 0.75,
  MAX_PARALLEL_TOOLS: 4,
  MAX_REVISION_ROUNDS: 3,
  DEFAULT_TOOL_TIMEOUT_MS: 60_000,
  HUMANIZE_TIMEOUT_MS: 180_000,
  DEDUP_WINDOW_MS: 5_000,         // block identical (name, argsHash) pair
  ASK_USER_TIMEOUT_MS: 30 * 60 * 1000,  // 30 min
};
```

If any limit trips, emit `fatal` and stop.

---

## 10. Client-side changes

### `GhostwriterAgentClient.ts`

```ts
export class GhostwriterAgentClient {
  async start(draft: GhostwriterDraftInput): Promise<string> {
    const res = await fetchWithUserAuthorization("/api/ghostwriter/start", {
      method: "POST",
      body: JSON.stringify({ draft }),
    });
    return (await res.json()).runId;
  }

  connect(runId: string, onEvent: (e: AgentEvent) => void): () => void {
    const es = new EventSource(`/api/ghostwriter/run?runId=${runId}`);
    es.onmessage = (ev) => onEvent(JSON.parse(ev.data));
    return () => es.close();
  }

  async answer(runId: string, field: string, value: unknown) {
    await fetchWithUserAuthorization("/api/ghostwriter/answer", {
      method: "POST",
      body: JSON.stringify({ runId, field, value }),
    });
  }
}
```

### `GhostwriterWorkflowView.tsx`

Drop `INITIAL_STEPS`. Build the step list dynamically from `step_start / step_done / step_error` events. Keep the existing UI chrome (cards, mini-editor, download flow) — only the step-tracker source-of-truth changes.

A new "thinking panel" shows the streaming `thought` events (truncated, auto-scroll). This replaces the "progress spinner + hardcoded detail text" feel with a visibly-reasoning agent.

---

## 11. Migration strategy

Env flag:
```
GHOSTWRITER_MODE=agentic | legacy   (default: legacy until agentic is green)
```

Both paths live side-by-side. View checks the flag and wires to the appropriate client. Each release, we progressively enable `agentic` for more users.

---

## 12. Implementation order

Concrete commit-sized milestones. Each one should leave `main` green.

1. **Types + routes scaffolding.** `AgentEvent`, empty `start` / `run` / `answer` routes, dummy SSE stream. No LLM yet.
2. **Agent loop skeleton.** OpenRouter tool-use call wired; one dummy tool (`echo`) proves round-trip streaming of `thought` + `step_*` events.
3. **Port legacy tools** (no new critic tools yet). One-to-one behavior parity with the 13-step pipeline: plan → outlines → search → scrape → write → humanize → split → finalize + ask_user. Gate behind `GHOSTWRITER_MODE=agentic`.
4. **Client rewrite.** New `GhostwriterAgentClient`, dynamic timeline, thinking panel. Legacy view stays for `legacy` mode.
5. **Add critic tools.** `evaluate_sources`, `critique_essay`, `revise_paragraph`. This is where agentic starts beating legacy.
6. **Prompt tuning + real-run iteration.** Collect transcripts, tweak system prompt.
7. **Safety guards.** Cost/step caps, dedup, timeouts, cancel route.
8. **Default flip.** `GHOSTWRITER_MODE=agentic` becomes default. Legacy stays behind the flag for two releases.
9. **Delete legacy.** Remove `engine.ts`, `GhostwriterOrchestrator.ts` (legacy parts), and hardcoded steps.

---

## 13. Open questions

- **Parallel tool calls.** OpenRouter supports parallel tool calls but not all models honor it. Need to test Sonnet vs Gemini behavior before relying on parallel `write_paragraph`.
- **Run persistence.** In-memory is fine for MVP but means ops can't restart the server mid-essay. Revisit after iteration 1.
- **Cost estimation.** Model prices change. Pull from a small `modelCosts.ts` table and let admins override via DB.
- **Humanizer re-integration.** The humanizer is an external API with its own retry profile; wrap it so the agent can see typed errors (credit exhausted, rate limited, server error) rather than opaque strings.
- **Backward compat for existing runs.** Legacy runs in flight during deploy — do we drain or force-cancel? Likely drain with a deploy gate.

---

## 14. Non-goals

- Writing a generic agent framework. We use OpenRouter's native tool-use; no LangGraph / Mastra dependency.
- Giving the agent filesystem or shell access. Tool set is fixed.
- Multi-turn chat with the user outside of `ask_user`. The agent runs to completion; it is not a conversation.
