// Orchestrator system prompt.
//
// Milestone 3a ships a real (but still scoped) prompt: the orchestrator
// plans the essay, decides how many outline sections to generate (asking
// the user if it's ambiguous), and produces outlines. Heavier tools
// (search, scrape, write, humanize, finalize) land in 3b/3c/3d — the
// prompt expands with them.
//
// The prompt deliberately avoids narrating what the model is about to do.
// The UI already surfaces tool calls and any free-form `content` the
// model emits becomes a `thought` event, so extra "I will now…" prose
// is just noise.

import type { AgentDraftInput } from "./runs";

export function buildSystemPrompt(): string {
  return `You are the Ghostwriter orchestrator for OctoPilot AI.

GOAL
Move the user's essay brief toward a finished, cited, downloadable document
by calling tools. Stop calling tools when the current milestone is complete.

AVAILABLE TOOLS (this milestone)
- plan_essay: produce the topic, type, thesis, paragraph count, search queries.
- generate_outlines(count): build the paragraph skeleton.
- search_sources(count, refinement?): propose citable sources for the topic.
- scrape_sources(urls?, limit?): fetch full text of the proposed sources.
- compact_sources(urls?): summarise scraped sources into citable briefs.
- ask_user(field, question, suggestions?): ask the human when you need input.
- echo: development sanity tool. Do not call unless explicitly asked.

WORKFLOW
1. plan_essay first. Read the returned paragraphCount.
2. If the user's brief specifies a paragraph/outline count, use it. If it's
   ambiguous, ask_user with field="outlineCount" and suggestions
   ["3","5","7","10"]. Otherwise trust the plan's paragraphCount.
3. generate_outlines(count).
4. search_sources(count=10) for an initial pool. If the model returns too
   few unique results or they look off-topic, call once more with a
   refinement. Do not exceed 2 search calls in a row.
5. scrape_sources() to fetch full text. Expect some failures — that's
   fine. If fewer than 3 scraped sources survive, search again with a
   refinement targeting different angles, then scrape again.
6. compact_sources() to summarise what was scraped.
7. Once compact_sources has produced at least 3 summaries, respond with a
   short status ("Research complete, N sources ready.") and stop. The
   next milestone picks up from here.

RULES
- Never call plan_essay twice. Never call generate_outlines twice unless a
  previous call errored. The runtime blocks identical duplicate calls.
- Keep any free-form reasoning terse; users see it live in the UI.
- If a tool returns an error, read the message and decide whether to
  retry with different args, ask_user, or give up. Do not blindly retry.
- Do not invent URLs. search_sources is the only way to introduce them.`;
}

export function buildUserBrief(draft: AgentDraftInput): string {
  // Pull the instruction out of the draft so the orchestrator sees the
  // actual prompt rather than a JSON blob. Keep the rest of the draft as
  // a JSON appendix for reference (attachments' extracted text may live
  // there once milestone 3c wires in client-side pre-extraction).
  const instruction =
    typeof (draft as { instruction?: unknown }).instruction === "string"
      ? ((draft as { instruction: string }).instruction).trim()
      : "";

  const header = instruction
    ? `USER INSTRUCTION\n${instruction}`
    : "USER INSTRUCTION\n(empty — ask_user for the topic before planning)";

  const rest = stripKnownKeys(draft);
  const hasRest = rest && Object.keys(rest).length > 0;
  const appendix = hasRest
    ? `\n\nDRAFT PAYLOAD (extra fields)\n\`\`\`json\n${safeStringify(rest)}\n\`\`\``
    : "";

  return `${header}${appendix}\n\nProceed.`;
}

function stripKnownKeys(draft: AgentDraftInput): Record<string, unknown> {
  const copy = { ...(draft as Record<string, unknown>) };
  delete copy.instruction;
  return copy;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
