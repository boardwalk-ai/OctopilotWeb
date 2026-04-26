import { getOpenRouterConfig } from "@/server/backendConfig";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import type { DeckTheme, DesignArchetype, DesignVoice, SlideSpec, SlideElement } from "@/types/slides";
import { applySlideUpsert, normalizeSlideSpec } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";
import { buildDesignerSystemPrompt } from "../systemPrompt";

export const design_slide: Tool<{
  id: string;
  position: number;
  totalSlides?: number;
  deckTheme?: DeckTheme;
  designVoice?: DesignVoice;
  archetype?: DesignArchetype;
  designIntent?: string;
  content: { title: string; bullets: string[]; speakerNotes?: string };
}> = {
  name: "design_slide",
  description: "Design a SlideSpec (layout, background, elements) for a given slide's content.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["id", "position", "content"],
    properties: {
      id: { type: "string" },
      position: { type: "number" },
      totalSlides: { type: "number" },
      deckTheme: { type: "object" },
      designVoice: { type: "string" },
      archetype: { type: "string" },
      designIntent: { type: "string" },
      content: {
        type: "object",
        additionalProperties: false,
        required: ["title", "bullets"],
        properties: {
          title: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          speakerNotes: { type: "string" },
        },
      },
    },
  },
  async execute(args, ctx) {
    const theme = args.deckTheme ?? ctx.run.state.theme;
    const voice = args.designVoice ?? ctx.run.state.designVoice;

    // Try LLM-based design first (Phase 1 goal), with a deterministic fallback.
    let spec: SlideSpec | null = null;

    try {
      const { apiKey, model } = await getOpenRouterConfig("primary");

      const system = buildDesignerSystemPrompt({
        deckTheme: theme,
        designVoice: voice,
        totalSlides: args.totalSlides,
        previousArchetype: undefined, // TODO: pass from run state once tracked
      });

      const user = [
        `SLIDE: ${args.id}  |  Position ${args.position}${args.totalSlides ? ` of ${args.totalSlides}` : ""}`,
        `Archetype: ${args.archetype ?? "your call — choose the most impactful one"}`,
        `Design intent: ${args.designIntent ?? "make the viewer feel something before they read anything"}`,
        "",
        `TITLE: ${args.content.title}`,
        args.content.bullets.length > 0
          ? `CONTENT:\n${args.content.bullets.map((b) => `  • ${b}`).join("\n")}`
          : "",
        args.content.speakerNotes ? `SPEAKER NOTES: ${args.content.speakerNotes}` : "",
        "",
        "Return the SlideSpec JSON. No markdown. No explanation. Just the object.",
      ].filter(Boolean).join("\n");

      const raw = await callJson({
        apiKey,
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        jsonMode: true,
      });

      const parsed = parseJsonLoose(raw);
      if (parsed && typeof parsed === "object") {
        spec = normalizeSlideSpec(parsed, { id: args.id, position: args.position }, { theme });
      }
    } catch {
      // fallback below
    }

    if (!spec) {
      const t = theme ?? {
        name: "fallback",
        palette: {
          background: "#0a0f1e",
          surface: "#111827",
          primary: "#38bdf8",
          secondary: "#e2e8f0",
          text: "#f1f5f9",
          textMuted: "#94a3b8",
          border: "#1e293b",
        },
        typography: {
          heading: { web: "Inter", pptx: "Calibri", weight: 800 },
          body: { web: "Inter", pptx: "Calibri", weight: 400 },
        },
      } satisfies DeckTheme;

      const elements: SlideElement[] = [
        {
          id: `${args.id}_title`,
          type: "text",
          variant: "title",
          content: args.content.title,
          position: { x: 8, y: 10, w: 84, h: 18 },
          style: {
            fontFamily: t.typography.heading.web,
            fontSize: 60,
            fontWeight: 800,
            color: t.palette.text,
            align: "left",
            opacity: 1,
          },
        },
        {
          id: `${args.id}_body_1`,
          type: "text",
          variant: "body",
          content: args.content.bullets.map((b) => `• ${b}`).join("\n"),
          position: { x: 8, y: 32, w: 60, h: 55 },
          style: {
            fontFamily: t.typography.body.web,
            fontSize: 20,
            fontWeight: 400,
            color: t.palette.textMuted,
            align: "left",
            opacity: 1,
            lineHeight: 1.3,
          },
        },
        {
          id: `${args.id}_shape_accent`,
          type: "shape",
          shape: "rectangle",
          position: { x: 8, y: 28, w: 18, h: 1.2 },
          style: { fill: t.palette.primary, opacity: 1, cornerRadius: 2 },
        },
      ];

      spec = {
        id: args.id,
        position: args.position,
        layout: "free",
        archetype: args.archetype ?? "THE_EDITORIAL",
        designIntent: args.designIntent ?? "Clear hierarchy: title then bullets.",
        background: { type: "solid", color: t.palette.background },
        elements,
        speakerNotes: args.content.speakerNotes,
      };
    }

    ctx.run.state = applySlideUpsert(ctx.run.state, spec);
    emit(ctx.run, { type: "slide_designed", id: args.id, spec });
    return spec;
  },
  stepTitle: (args) => `Design ${args.id}`,
};

