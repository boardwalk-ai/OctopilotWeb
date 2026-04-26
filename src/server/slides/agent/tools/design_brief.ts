import { getOpenRouterConfig } from "@/server/backendConfig";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import {
  BRAND_PRESETS,
  type BrandFamily,
  type DesignArchetype,
  type DesignBrief,
  type DeckTheme,
} from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";

/**
 * Stage 1 of the 3-stage design pipeline.
 *
 * Decides high-level creative direction BEFORE positioning math kicks in.
 * Cheap call (~300 tokens out, ~1500 in) that anchors the per-slide design.
 *
 * Output is consumed by design_slide as a structured brief.
 */
export const design_brief: Tool<{
  id: string;
  position: number;
  totalSlides: number;
  topic: string;
  content: { title: string; bullets: string[] };
  archetypeHint?: DesignArchetype;
  deckTheme?: DeckTheme;
}> = {
  name: "design_brief",
  description:
    "Stage 1 of design: decide brand family, focal element, layout sketch, visual motif, and one risky creative choice for a slide. Run BEFORE design_slide.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["id", "position", "totalSlides", "topic", "content"],
    properties: {
      id: { type: "string" },
      position: { type: "number" },
      totalSlides: { type: "number" },
      topic: { type: "string" },
      archetypeHint: { type: "string" },
      deckTheme: { type: "object" },
      content: {
        type: "object",
        additionalProperties: false,
        required: ["title", "bullets"],
        properties: {
          title: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  async execute(args, ctx) {
    const theme = args.deckTheme ?? ctx.run.state.theme;
    const previousArchetype = ctx.run.state.lastArchetype;
    const lockedBrand = ctx.run.state.brandFamily;
    const lockedMotif = ctx.run.state.visualMotif;

    const brandList = BRAND_PRESETS.map(
      (p) => `  ${p.family} — ${p.name} (${p.inspiration}). Motif: ${p.visualMotif}`,
    ).join("\n");

    const system = `You are a senior creative director. Before any positioning math,
you decide the SOUL of a slide in 4–5 short fields.

Output ONLY valid JSON matching this exact shape:
{
  "brandFamily": one of [${BRAND_PRESETS.map((p) => `"${p.family}"`).join(", ")}],
  "archetype": one of ["THE_HERO","THE_TENSION","THE_BREATH","THE_EDITORIAL","THE_TYPOGRAPHIC","THE_DATA_HERO","THE_LAYER","THE_GRID"],
  "focalElement": "ONE sentence describing the single most important element (e.g. 'The number 300,000+ at 140pt, gold')",
  "designIntent": "ONE sentence: what should the viewer FEEL?",
  "visualMotif": "ONE distinctive element repeated across ALL slides in this deck (e.g. 'thin gold hairlines under section labels')",
  "layoutSketch": "2 sentences describing element placement zones",
  "riskyChoice": "ONE bold/unexpected creative decision for this slide",
  "visualElement": one of ["stat","image","icon","shape","ghost-text","chart"]
}

═══════════════════════════════════════════════════
BRAND FAMILIES (pick one)
═══════════════════════════════════════════════════
${brandList}

═══════════════════════════════════════════════════
DECK CONTEXT
═══════════════════════════════════════════════════
${lockedBrand ? `Brand family is LOCKED to "${lockedBrand}" — use it.` : "First slide: pick the brand family that fits the deck topic."}
${lockedMotif ? `Visual motif is LOCKED to: "${lockedMotif}" — repeat it.` : "First slide: invent the visual motif. It MUST work for every slide in the deck."}

═══════════════════════════════════════════════════
NON-NEGOTIABLES
═══════════════════════════════════════════════════
- archetype MUST differ from previous slide${previousArchetype ? ` (was: ${previousArchetype})` : ""}.
- visualElement MUST be present — text-only slides are forbidden.
- riskyChoice should genuinely break a "safe" rule (asymmetry, oversized type, hard color block, etc.). Generic = bad.
- focalElement names ONE thing, not five.

DO NOT include any text outside the JSON object.`;

    const user = [
      `Deck topic: ${args.topic}`,
      `Slide ${args.position}/${args.totalSlides} (id: ${args.id})`,
      `Title: ${args.content.title}`,
      `Bullets: ${args.content.bullets.join(" | ") || "(none)"}`,
      args.archetypeHint ? `Archetype hint: ${args.archetypeHint}` : "",
      theme ? `Theme: ${theme.name} — bg ${theme.palette.background}, primary ${theme.palette.primary}` : "No theme yet.",
      "",
      "Return the JSON brief.",
    ]
      .filter(Boolean)
      .join("\n");

    let brief: DesignBrief | null = null;

    try {
      const { apiKey, model } = await getOpenRouterConfig("primary");
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
        brief = normalizeBrief(parsed as Record<string, unknown>, args.archetypeHint);
      }
    } catch {
      // fallback below
    }

    if (!brief) {
      brief = fallbackBrief(args.position, args.totalSlides, args.archetypeHint, previousArchetype);
    }

    // Lock deck-wide decisions on the FIRST brief.
    if (!ctx.run.state.brandFamily) ctx.run.state.brandFamily = brief.brandFamily;
    if (!ctx.run.state.visualMotif) ctx.run.state.visualMotif = brief.visualMotif;

    emit(ctx.run, {
      type: "workflow_step",
      stepId: `brief-${args.id}`,
      status: "done",
      detail: `${brief.archetype} · ${brief.focalElement}`,
    });

    return brief;
  },
  stepTitle: (args) => `Brief ${args.id}`,
};

function normalizeBrief(raw: Record<string, unknown>, hintArch?: DesignArchetype): DesignBrief {
  const ALLOWED_ARCH: DesignArchetype[] = [
    "THE_HERO", "THE_TENSION", "THE_BREATH", "THE_EDITORIAL",
    "THE_TYPOGRAPHIC", "THE_DATA_HERO", "THE_LAYER", "THE_GRID",
  ];
  const ALLOWED_VIS = ["stat", "image", "icon", "shape", "ghost-text", "chart"] as const;
  type Vis = (typeof ALLOWED_VIS)[number];

  const brandFamily = (BRAND_PRESETS.some((p) => p.family === raw.brandFamily)
    ? raw.brandFamily
    : "editorial-magazine") as BrandFamily;
  const archetype = (ALLOWED_ARCH.includes(raw.archetype as DesignArchetype)
    ? raw.archetype
    : hintArch ?? "THE_EDITORIAL") as DesignArchetype;
  const visualElement = (ALLOWED_VIS.includes(raw.visualElement as Vis)
    ? raw.visualElement
    : "ghost-text") as Vis;

  return {
    brandFamily,
    archetype,
    focalElement: typeof raw.focalElement === "string" ? raw.focalElement : "Title",
    designIntent: typeof raw.designIntent === "string" ? raw.designIntent : "Communicate clearly",
    visualMotif: typeof raw.visualMotif === "string" ? raw.visualMotif : "Thin hairline rules",
    layoutSketch: typeof raw.layoutSketch === "string" ? raw.layoutSketch : "Title left, content right",
    riskyChoice: typeof raw.riskyChoice === "string" ? raw.riskyChoice : "Asymmetric anchoring",
    visualElement,
  };
}

function fallbackBrief(
  position: number,
  totalSlides: number,
  hintArch?: DesignArchetype,
  previousArchetype?: DesignArchetype,
): DesignBrief {
  const isFirst = position === 1;
  const isLast = position === totalSlides;
  let archetype: DesignArchetype = hintArch ?? "THE_EDITORIAL";
  if (previousArchetype === archetype) {
    // Pick something different
    archetype = previousArchetype === "THE_EDITORIAL" ? "THE_DATA_HERO" : "THE_EDITORIAL";
  }
  if (isFirst) archetype = "THE_HERO";
  if (isLast) archetype = "THE_HERO";

  return {
    brandFamily: "editorial-magazine",
    archetype,
    focalElement: "The slide title at hero scale",
    designIntent: "Convey the core idea with quiet confidence",
    visualMotif: "Huge ghost typography behind text",
    layoutSketch: "Title left-anchored at upper-mid. Body content below. Ghost text bleeds behind.",
    riskyChoice: "Asymmetric anchoring — title bottom-left instead of center",
    visualElement: "ghost-text",
  };
}
