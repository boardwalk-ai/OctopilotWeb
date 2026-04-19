// `echo` tool — proof-of-life capability for milestone 2.
//
// The orchestrator model can call this with any payload; the loop returns it
// verbatim wrapped in `{ echoed: ... }`. We use it to confirm that the full
// round-trip works:
//
//   system prompt → model picks a tool → loop dispatches → result reaches
//   model → model produces a final answer → stream closes with `done`.
//
// Once real tools are ported in milestone 3, this file stays as an
// integration-test fixture but is removed from the production registry.

import type { Tool } from "@/server/ghostwriter/agent/tools";

type EchoArgs = {
  message: string;
};

type EchoResult = {
  echoed: string;
  receivedAt: string;
};

export const echoTool: Tool<EchoArgs, EchoResult> = {
  name: "echo",
  description:
    "Development-only sanity check. Returns the provided message back to you unchanged. Call this once with a short greeting when you want to verify the tool-dispatch pipeline is working, then stop.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: {
      message: {
        type: "string",
        description: "The string to echo back.",
      },
    },
  },
  stepTitle: (args) => `Echoing: ${truncate(args.message, 40)}`,
  async execute(args) {
    return {
      echoed: args.message,
      receivedAt: new Date().toISOString(),
    };
  },
};

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
