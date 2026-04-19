// Safety rails for the agent loop. Centralised so every tool and every
// milestone reads the same numbers. See docs/AGENTIC_GHOSTWRITER.md §9.
//
// These are deliberately conservative for milestone 2. Tune them once real
// tools are wired and we have production telemetry on typical step counts
// and latency.

export const AGENT_LIMITS = {
  // Hard ceiling on tool-call iterations per run. Trips → `fatal`.
  MAX_STEPS: 40,

  // Default per-tool timeout. Tools can override via `timeoutMs`.
  DEFAULT_TOOL_TIMEOUT_MS: 60_000,

  // `ask_user` can legitimately wait a long time (user went to lunch).
  ASK_USER_TIMEOUT_MS: 30 * 60 * 1000,

  // Window in which an identical (name, argsHash) tool call is rejected as a
  // duplicate. Protects against the model looping on a cached response.
  DEDUP_WINDOW_MS: 5_000,
};
