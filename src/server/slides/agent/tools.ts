import type { DeckRun } from "./runs";

export type ToolContext = {
  run: DeckRun;
};

export type ToolParametersSchema = Record<string, unknown>;

export type Tool<Args = Record<string, unknown>, Result = unknown> = {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  execute: (args: Args, ctx: ToolContext) => Promise<Result>;
  stepTitle: (args: Args) => string;
  isUserQuestion?: boolean;
  timeoutMs?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;

export function toOpenRouterToolSpec(tool: Tool) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

