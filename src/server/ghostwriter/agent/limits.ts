// Safety rails for the agent loop. Centralised so every tool and every
// milestone reads the same numbers. See docs/AGENTIC_GHOSTWRITER.md §9.

export const AGENT_LIMITS = {
  // Hard ceiling on tool-call iterations per run. Trips → `fatal`.
  MAX_STEPS: 40,

  // Cost guard disabled for Ghostwriter runs at the user's request.
  MAX_COST_USD: Number.POSITIVE_INFINITY,

  // Approximate OpenRouter pricing for cost estimation. These are conservative
  // Sonnet-class rates. If the actual model is cheaper, we just stop sooner
  // than necessary — never more expensive.
  COST_PER_1M_INPUT_TOKENS: 3.0,   // USD
  COST_PER_1M_OUTPUT_TOKENS: 15.0, // USD

  // Generous safety ceiling for critique → revise loops. The prompt tells the
  // model to stop based on quality, not a visible fixed number.
  MAX_REVISION_ROUNDS: 8,

  // Default per-tool timeout. Tools can override via `timeoutMs`.
  DEFAULT_TOOL_TIMEOUT_MS: 60_000,

  // `ask_user` can legitimately wait a long time (user went to lunch).
  ASK_USER_TIMEOUT_MS: 30 * 60 * 1000,

  // Window in which an identical (name, argsHash) tool call is rejected as a
  // duplicate. Protects against the model looping on a cached response.
  DEDUP_WINDOW_MS: 5_000,
};
