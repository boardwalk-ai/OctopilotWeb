import type { SlideElement } from "@/types/slides";
import { applyElementAdd, normalizeSlideElement } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";

export const add_element: Tool<{
  slideId: string;
  element: SlideElement;
}> = {
  name: "add_element",
  description: "Add a new element to a slide.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["slideId", "element"],
    properties: {
      slideId: { type: "string" },
      element: { type: "object" },
    },
  },
  async execute(args, ctx) {
    const normalized = normalizeSlideElement(args.element, {
      theme: ctx.run.state.theme ?? null,
      idPrefix: args.slideId,
    });
    if (!normalized) {
      return { ok: false, error: "Invalid element payload (missing or unknown type)." };
    }
    ctx.run.state = applyElementAdd(ctx.run.state, args.slideId, normalized);
    const slide = ctx.run.state.slides.find((s) => s.id === args.slideId);
    if (slide) emit(ctx.run, { type: "slide_designed", id: slide.id, spec: slide });
    return { ok: true, element: normalized };
  },
  stepTitle: () => "Add element",
};

