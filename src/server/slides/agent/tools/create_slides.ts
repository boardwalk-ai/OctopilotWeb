import type { SlideSpec } from "@/types/slides";
import { applySlideUpsert } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";

export const create_slides: Tool<{
  count: number;
  titles?: string[];
}> = {
  name: "create_slides",
  description: "Scaffold a blank deck with N slides and stable slide ids.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["count"],
    properties: {
      count: { type: "number", minimum: 1, maximum: 15 },
      titles: { type: "array", items: { type: "string" } },
    },
  },
  async execute(args, ctx) {
    const count = Math.max(1, Math.min(15, Math.floor(args.count || 1)));
    const titles = Array.isArray(args.titles) ? args.titles : [];

    for (let i = 1; i <= count; i++) {
      const id = `slide_${String(i).padStart(3, "0")}`;

      const blank: SlideSpec = {
        id,
        position: i,
        layout: "blank",
        archetype: "THE_BREATH",
        designIntent: "Placeholder scaffold slide.",
        background: { type: "solid", color: ctx.run.state.theme?.palette.background ?? "#0a0f1e" },
        elements:
          titles[i - 1]
            ? [
                {
                  id: `${id}_title`,
                  type: "text",
                  variant: "title",
                  content: titles[i - 1]!,
                  position: { x: 8, y: 10, w: 84, h: 20 },
                  style: {
                    fontFamily: ctx.run.state.theme?.typography.heading.web ?? "Inter",
                    fontSize: 54,
                    fontWeight: 800,
                    color: ctx.run.state.theme?.palette.text ?? "#f1f5f9",
                    align: "left",
                    opacity: 1,
                  },
                },
              ]
            : [],
      };

      ctx.run.state = applySlideUpsert(ctx.run.state, blank);
      emit(ctx.run, { type: "slide_created", id, position: i });
    }

    return {
      slides: ctx.run.state.slides.map((s) => ({ id: s.id, position: s.position })),
    };
  },
  stepTitle: (args) => `Create ${args.count} slides`,
};

