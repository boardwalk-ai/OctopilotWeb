import type { DeckTheme } from "@/types/slides";
import { getThemeByName } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";

export const update_deck_theme: Tool<{
  deckId: string;
  theme: string | DeckTheme;
}> = {
  name: "update_deck_theme",
  description: "Set or change the deck theme (named built-in theme or full DeckTheme object).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["deckId", "theme"],
    properties: {
      deckId: { type: "string" },
      theme: {
        anyOf: [{ type: "string" }, { type: "object" }],
      },
    },
  },
  async execute(args, ctx) {
    const theme =
      typeof args.theme === "string"
        ? (getThemeByName(args.theme) ?? null)
        : (args.theme as DeckTheme);

    if (!theme) {
      return { ok: false, error: `Unknown theme: ${String(args.theme)}` };
    }

    ctx.run.state.deckId = args.deckId || ctx.run.state.deckId;
    ctx.run.state.theme = theme;
    emit(ctx.run, { type: "theme_set", theme });

    return { ok: true, theme };
  },
  stepTitle: () => "Set deck theme",
};

