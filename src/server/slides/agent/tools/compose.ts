import type { Tool } from "../tools";
import { emit } from "../runs";

export const compose: Tool<{
  deckId: string;
  slides: Array<{ id: string }>;
}> = {
  name: "compose",
  description: "Finalize the deck run and produce an export snapshot marker (Phase 1 placeholder).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["deckId", "slides"],
    properties: {
      deckId: { type: "string" },
      slides: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
  },
  async execute(args, ctx) {
    ctx.run.state.deckId = args.deckId || ctx.run.state.deckId;
    ctx.run.state.exportSnapshot = {
      deckId: ctx.run.state.deckId,
      slideCount: ctx.run.state.slides.length,
      exportedAt: Date.now(),
    };

    emit(ctx.run, { type: "workflow_complete", deckId: ctx.run.state.deckId });

    return { exportSnapshot: ctx.run.state.exportSnapshot };
  },
  stepTitle: () => "Compose deck",
};

