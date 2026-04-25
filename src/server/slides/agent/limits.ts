// Safety rails for the Slides agent loop.
// Kept parallel to Ghostwriter's AGENT_LIMITS so we can reuse the same loop shape.

export const SLIDES_AGENT_LIMITS = {
  // Hard ceiling on orchestrator iterations per run.
  MAX_STEPS: 30,

  // Conservative cost guard. (Can be adjusted once we observe real usage.)
  MAX_COST_USD: 2.5,

  // Token pricing estimate for guardrails (USD per 1M tokens).
  COST_PER_1M_INPUT_TOKENS: 3.0,
  COST_PER_1M_OUTPUT_TOKENS: 15.0,

  // Default per-tool timeout.
  DEFAULT_TOOL_TIMEOUT_MS: 60_000,

  // `ask_user` can wait for a while.
  ASK_USER_TIMEOUT_MS: 30 * 60 * 1000,

  // Duplicate tool call window (name + args) guard.
  DEDUP_WINDOW_MS: 5_000,
};

