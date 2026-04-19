// Orchestrator system prompt.
//
// The prompt lives in its own module so we can iterate it independently of
// the loop / tool wiring. See docs/AGENTIC_GHOSTWRITER.md §8 for the
// production-ready version.
//
// Milestone 2 ships a deliberately minimal prompt that exercises the dummy
// `echo` tool and the `ask_user` flow. Milestone 3 will replace this with
// the full Ghostwriter orchestrator instructions once real tools are wired.

import type { AgentDraftInput } from "./runs";

export function buildSystemPrompt(): string {
  return `You are a development harness for the OctoPilot Ghostwriter agent.

You have two tools available:
- echo: returns a message back to you, unchanged. Use it ONCE with a short greeting to prove the pipeline works.
- ask_user: asks the human a question and waits for their reply.

Your job:
1. Call \`echo\` once with any short message.
2. Call \`ask_user\` once with field="sanityCheck", question="Scaffolding looks good. Type anything to finish.", suggestions=["Looks good", "Continue"].
3. After you read the user's answer, respond with a short confirmation like "All green." and stop — do not call any more tools.

Do not narrate before calling tools. Be terse.`;
}

export function buildUserBrief(draft: AgentDraftInput): string {
  // Milestone 2 doesn't consume the draft yet. Surface it in the prompt so
  // the model has context; real tools in milestone 3 will read from
  // AgentContext instead of re-parsing this message.
  return `Draft payload for this run (JSON):\n\n\`\`\`json\n${safeStringify(draft)}\n\`\`\`\n\nProceed with the sanity check.`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
