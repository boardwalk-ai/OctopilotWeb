import type { Tool } from "../tools";

export const ask_user: Tool<{
  question: string;
  field: string;
  inputType: "text" | "choice" | "number";
  suggestions?: string[];
}> = {
  name: "ask_user",
  description: "Ask the user a question required to continue the deck workflow.",
  isUserQuestion: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["question", "field", "inputType"],
    properties: {
      question: { type: "string" },
      field: { type: "string" },
      inputType: { type: "string", enum: ["text", "choice", "number"] },
      suggestions: { type: "array", items: { type: "string" } },
    },
  },
  async execute() {
    // Special-cased in the loop.
    return { ok: true };
  },
  stepTitle: (args) => `Ask: ${args.field}`,
};

