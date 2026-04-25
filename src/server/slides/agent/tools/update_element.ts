import { applyElementPatch } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";

export const update_element: Tool<{
  slideId: string;
  elementId: string;
  changes: Record<string, unknown>;
}> = {
  name: "update_element",
  description: "Update a single element's style/properties by id within a slide.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["slideId", "elementId", "changes"],
    properties: {
      slideId: { type: "string" },
      elementId: { type: "string" },
      changes: { type: "object" },
    },
  },
  async execute(args, ctx) {
    ctx.run.state = applyElementPatch(ctx.run.state, args.slideId, args.elementId, args.changes as never);
    emit(ctx.run, { type: "element_updated", slideId: args.slideId, elementId: args.elementId, changes: args.changes as never });
    return { ok: true };
  },
  stepTitle: (args) => `Update ${args.elementId}`,
};

