import { applyElementRemove } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";

export const remove_element: Tool<{
  slideId: string;
  elementId: string;
}> = {
  name: "remove_element",
  description: "Remove an element from a slide by id.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["slideId", "elementId"],
    properties: {
      slideId: { type: "string" },
      elementId: { type: "string" },
    },
  },
  async execute(args, ctx) {
    ctx.run.state = applyElementRemove(ctx.run.state, args.slideId, args.elementId);
    const slide = ctx.run.state.slides.find((s) => s.id === args.slideId);
    if (slide) emit(ctx.run, { type: "slide_designed", id: slide.id, spec: slide });
    return { ok: true };
  },
  stepTitle: (args) => `Remove ${args.elementId}`,
};

