import { getOpenRouterConfig } from "@/server/backendConfig";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import type {
  DeckTheme, DesignArchetype, DesignVoice, SlideSpec, SlideElement, DesignBrief, BrandFamily,
} from "@/types/slides";
import { applySlideUpsert, normalizeSlideSpec, getBrandPreset } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";
import { buildDesignerSystemPrompt } from "../systemPrompt";

/**
 * Stage 2 of the 3-stage design pipeline.
 *
 * Consumes:
 *  - design_brief output (Stage 1) for high-level creative direction
 *  - critique_slide issues (Stage 3 feedback) for revision passes
 *
 * Produces a full SlideSpec JSON.
 */
export const design_slide: Tool<{
  id: string;
  position: number;
  totalSlides?: number;
  deckTheme?: DeckTheme;
  designVoice?: DesignVoice;
  archetype?: DesignArchetype;
  designIntent?: string;
  brief?: DesignBrief;             // from design_brief
  revisionNotes?: string[];        // from critique_slide if revising
  content: { title: string; bullets: string[]; speakerNotes?: string };
}> = {
  name: "design_slide",
  description:
    "Stage 2 of design: produce the full SlideSpec JSON for a slide. Pass the brief from design_brief in the 'brief' field. If revising after critique_slide, pass critique issues as revisionNotes.",
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
      brief: { type: "object" },
      revisionNotes: { type: "array", items: { type: "string" } },
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
    const previousArchetype = ctx.run.state.lastArchetype;
    const brief = args.brief;

    let spec: SlideSpec | null = null;

    try {
      const { apiKey, model } = await getOpenRouterConfig("primary");

      const system = buildDesignerSystemPrompt({
        deckTheme: theme,
        designVoice: voice,
        totalSlides: args.totalSlides,
        previousArchetype,
      });

      const user = buildUserPrompt(args, brief, ctx.run.state.brandFamily, ctx.run.state.visualMotif);

      const raw = await callJson({
        apiKey,
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.85,
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
      spec = buildFallbackSpec(args, theme);
    }

    // Track the archetype so design_brief on the next slide knows what to avoid.
    ctx.run.state.lastArchetype = spec.archetype as DesignArchetype;

    ctx.run.state = applySlideUpsert(ctx.run.state, spec);
    emit(ctx.run, { type: "slide_designed", id: args.id, spec });
    return spec;
  },
  stepTitle: (args) => `Design ${args.id}`,
};

function buildUserPrompt(
  args: Parameters<typeof design_slide.execute>[0],
  brief?: DesignBrief,
  brandFamily?: BrandFamily,
  visualMotif?: string,
): string {
  const lines: string[] = [];

  lines.push(`SLIDE: ${args.id}  |  Position ${args.position}${args.totalSlides ? ` of ${args.totalSlides}` : ""}`);
  lines.push("");

  if (brief) {
    lines.push("═══ DESIGN BRIEF (from Stage 1 — follow this) ═══");
    lines.push(`Brand family:    ${brief.brandFamily}`);
    const preset = getBrandPreset(brief.brandFamily);
    if (preset) lines.push(`  → ${preset.layoutPersonality}`);
    lines.push(`Archetype:       ${brief.archetype}`);
    lines.push(`Focal element:   ${brief.focalElement}`);
    lines.push(`Design intent:   ${brief.designIntent}`);
    lines.push(`Visual motif:    ${brief.visualMotif}`);
    lines.push(`Layout sketch:   ${brief.layoutSketch}`);
    lines.push(`Risky choice:    ${brief.riskyChoice}`);
    lines.push(`Visual element:  ${brief.visualElement} (MUST be present)`);
    lines.push("");
  } else {
    lines.push(`Archetype: ${args.archetype ?? "your call — choose the most impactful"}`);
    lines.push(`Design intent: ${args.designIntent ?? "make the viewer feel something"}`);
    if (brandFamily) lines.push(`Brand family: ${brandFamily}`);
    if (visualMotif) lines.push(`Visual motif (deck-wide, repeat it): ${visualMotif}`);
    lines.push("");
  }

  lines.push(`TITLE: ${args.content.title}`);
  if (args.content.bullets.length > 0) {
    lines.push(`CONTENT:\n${args.content.bullets.map((b) => `  • ${b}`).join("\n")}`);
  }
  if (args.content.speakerNotes) {
    lines.push(`SPEAKER NOTES: ${args.content.speakerNotes}`);
  }
  lines.push("");

  if (args.revisionNotes && args.revisionNotes.length > 0) {
    lines.push("═══ REVISION REQUIRED — fix these issues from the critic ═══");
    args.revisionNotes.forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));
    lines.push("");
    lines.push("This is your second attempt. Push harder.");
    lines.push("");
  }

  lines.push("Return the SlideSpec JSON. No markdown. No explanation. Just the object.");

  return lines.join("\n");
}

function buildFallbackSpec(
  args: Parameters<typeof design_slide.execute>[0],
  theme: DeckTheme | undefined,
): SlideSpec {
  const t = theme ?? {
    name: "fallback",
    palette: {
      background: "#0a0f1e", surface: "#111827", primary: "#38bdf8",
      secondary: "#e2e8f0", text: "#f1f5f9", textMuted: "#94a3b8", border: "#1e293b",
    },
    typography: {
      heading: { web: "Inter", pptx: "Calibri", weight: 800 as const },
      body:    { web: "Inter", pptx: "Calibri", weight: 400 as const },
    },
  } satisfies DeckTheme;

  const elements: SlideElement[] = [
    {
      id: `${args.id}_title`,
      type: "text", variant: "title",
      content: args.content.title,
      position: { x: 8, y: 14, w: 84, h: 22 },
      style: {
        fontFamily: t.typography.heading.web,
        fontSize: 56, fontWeight: 800,
        color: t.palette.text, align: "left", opacity: 1,
      },
    },
    {
      id: `${args.id}_body_1`,
      type: "text", variant: "body",
      content: args.content.bullets.map((b) => `• ${b}`).join("\n"),
      position: { x: 8, y: 40, w: 70, h: 45 },
      style: {
        fontFamily: t.typography.body.web,
        fontSize: 18, fontWeight: 400,
        color: t.palette.textMuted, align: "left", opacity: 0.75, lineHeight: 1.65,
      },
    },
  ];

  return {
    id: args.id,
    position: args.position,
    layout: "free",
    archetype: args.archetype ?? "THE_EDITORIAL",
    designIntent: args.designIntent ?? "Clear hierarchy: title then content.",
    background: { type: "solid", color: t.palette.background },
    elements,
    speakerNotes: args.content.speakerNotes,
  };
}
