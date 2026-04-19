// `ask_user` tool — the one special case in the registry.
//
// Unlike every other tool, `ask_user` doesn't return a value from its
// `execute` function. The agent loop detects the `isUserQuestion` flag,
// emits a `question` SSE event, and parks on `waitForAnswer(field)` until
// the client POSTs `/api/ghostwriter/answer`. The resolved value is then
// inserted as the tool result so the orchestrator can read the user's
// response in its next turn.
//
// The `execute` defined here is therefore a no-op; it exists only to keep
// the Tool contract uniform. The loop never actually calls it.

import type { Tool } from "@/server/ghostwriter/agent/tools";

export type AskUserArgs = {
  field: string;
  question: string;
  suggestions?: string[];
  inputType?: "text" | "number" | "select";
};

export const askUserTool: Tool<AskUserArgs, { answer: unknown }> = {
  name: "ask_user",
  description:
    "Ask the human user a question and wait for their typed reply. Use this whenever you need information the draft doesn't contain (word count, citation style, humanization preference, etc.). Keep the question short and concrete. Provide `suggestions` for common answers when you can.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["field", "question"],
    properties: {
      field: {
        type: "string",
        description:
          "Stable identifier for this question (e.g. \"wordCount\", \"citationStyle\"). The client uses it to route the answer back. Reuse canonical names — don't invent new ones for the same concept.",
      },
      question: {
        type: "string",
        description: "The question text shown to the user.",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional list of quick-reply chips. The user may pick one or type their own answer.",
      },
      inputType: {
        type: "string",
        enum: ["text", "number", "select"],
        description: "Hint for the UI about how to render the input.",
      },
    },
  },
  isUserQuestion: true,
  stepTitle: (args) => `Asking: ${args.field}`,
  // Intentional no-op. The loop dispatches this tool through the event bus,
  // not by invoking `execute`.
  async execute() {
    throw new Error("ask_user.execute should never be called directly");
  },
};
