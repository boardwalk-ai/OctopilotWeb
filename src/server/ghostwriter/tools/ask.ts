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
  options?: Array<{ label: string; value: string }>;
  suggestions?: string[];
  inputType?: "text" | "number" | "select";
  allowCustom?: boolean;
};

export const askUserTool: Tool<AskUserArgs, { answer: unknown }> = {
  name: "ask_user",
  description:
    "Ask the human user a question and wait for their typed reply. Use this whenever you need information the draft doesn't contain (word count, citation style, humanization preference, etc.). Keep the question short and concrete. Prefer `options` (label/value pairs) for select-style questions; provide 3-7 items and avoid copying template wording.",
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
      options: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "value"],
          properties: {
            label: { type: "string", description: "Human-friendly label shown in the UI." },
            value: { type: "string", description: "Stable value submitted back to the agent." },
          },
        },
        description:
          "Preferred list of structured choices. Use this for select-style questions (citationStyle, humanizerChoice, paragraphSplitChoice) and when you want nicer labels (e.g. '800 words').",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional list of quick-reply chips. The user may pick one or type their own answer.",
      },
      inputType: {
        type: "string",
        enum: ["text", "number", "select", "multiselect", "sourceReview"],
        description: "Hint for the UI. Use \"multiselect\" for essayFocus. Use \"sourceReview\" to show the scraped source review panel — sources are auto-injected from context, no need to pass them manually.",
      },
      allowCustom: {
        type: "boolean",
        description:
          "If true, the UI will allow a custom typed answer in addition to options/chips. Default true for text/number questions.",
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
