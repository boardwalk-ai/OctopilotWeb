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
- ask_user(field, question, suggestions?): ask the human when you need input
  (e.g. their preferred outline count if the brief doesn't specify one).
- echo: development sanity tool. Do not call unless explicitly asked.

WORKFLOW
1. Call plan_essay first. Read the returned paragraphCount.
2. If the user's brief clearly specifies a paragraph/outline count, use it
   directly. If not, ask_user with field="outlineCount" and a few
   suggestions (["3","5","7","10"]). Otherwise trust the plan's suggested
   paragraphCount.
3. Call generate_outlines with the chosen count.
4. Once outlines exist, respond with a short confirmation (one sentence)
   and stop. Do not call any more tools — the next milestone picks up from
   here.

RULES
- Never call plan_essay twice. Never call generate_outlines twice unless a
  previous call errored. The runtime blocks duplicate calls.
- Keep any free-form reasoning terse; users see it live in the UI.
- If a tool returns an error, read the message and decide whether to retry
  with different args, ask_user, or give up. Do not blindly retry.`;
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
