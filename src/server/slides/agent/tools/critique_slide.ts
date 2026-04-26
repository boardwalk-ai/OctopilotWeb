import { getOpenRouterConfig } from "@/server/backendConfig";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import type { SlideSpec } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";

/**
 * Stage 3 of the 3-stage design pipeline.
 *
 * Reviews a SlideSpec like a senior designer would review a junior's work.
 * Returns a score and specific issues. The orchestrator uses this to decide
 * whether to call design_slide again with revision notes.
 *
 * Cheap (~200 tokens out, ~1500 in). Runs once per slide.
 */
export const critique_slide: Tool<{
  spec: SlideSpec;
}> = {
  name: "critique_slide",
  description:
    "Stage 3 of design: review a SlideSpec for design quality. Returns score 1-10 and specific issues. Run AFTER design_slide. If shouldRevise=true, call design_slide again with the issues as revisionNotes.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["spec"],
    properties: {
      spec: { type: "object" },
    },
  },
  async execute(args, ctx) {
    const spec = args.spec as SlideSpec | undefined;
    if (!spec || typeof spec !== "object") {
      return { score: 5, issues: ["No slide to review."], shouldRevise: false };
    }

    const summary = summarizeSpec(spec);

    const system = `You are a senior design critic with 15 years at Pentagram, IDEO, and Apple.
You review slides like a junior designer's portfolio review — direct, specific, no flattery.

Score 1–10 (be honest):
  9–10: world-class, would publish in a design book
  7–8:  solid pro work, ready to ship
  5–6:  competent but generic, feels like a template
  3–4:  amateur, fundamental problems
  1–2:  broken / unreadable / off-brief

Output ONLY this JSON shape:
{
  "score": 1-10 integer,
  "issues": [array of short specific complaints, max 5],
  "wins": [array of what's working, max 3],
  "shouldRevise": boolean (true if score < 7 OR any critical issue)
}

═══════════════════════════════════════════════════
WHAT TO CHECK (in this order)
═══════════════════════════════════════════════════

1. FOCAL POINT — Can you identify it in <2 seconds? If not, score ≤ 5.
2. TEXT VISIBILITY — Any text element with y+h > 100 or x+w > 100? Critical issue.
3. LAYOUT — Is everything centered? AI-template tell. Drop 2 points.
4. ACCENT COLOR — Used more than once? Drop 2 points.
5. TYPOGRAPHY — More than 3 font sizes? Drop 1 point.
6. ARCHETYPE FIT — Does the visual treatment match the archetype's signature?
7. VISUAL ELEMENT — Is there a non-text element (shape/icon/ghost-text/image)? If text-only, drop 3 points.
8. WHITESPACE — Cramped or accidental empty zones? Drop 1 point.
9. UNEXPECTED CHOICE — Is there ONE bold creative move? If everything is safe, drop 1 point.
10. ELEMENT COUNT — More than 8 elements? Probably too busy. Drop 1 point.

═══════════════════════════════════════════════════
KNOWN AI TELLS — FLAG THESE AS ISSUES
═══════════════════════════════════════════════════

❌ Thin accent line directly under the title (classic AI cliché)
❌ Eyebrow text + huge title + tiny subtitle formula on every slide
❌ Centered title with bullets below (template pattern)
❌ Generic "supporting text" that says nothing
❌ Ghost text that doesn't relate to the slide topic
❌ Same archetype as previous slide

DO NOT be polite. Specific complaints only. No "could be improved" — say WHAT exactly.`;

    const user = [
      `Slide: ${spec.id} (position ${spec.position})`,
      `Archetype: ${spec.archetype}`,
      `Design intent: ${spec.designIntent}`,
      "",
      "Element summary:",
      summary,
      "",
      "Review this slide. Return the JSON.",
    ].join("\n");

    let critique: { score: number; issues: string[]; wins: string[]; shouldRevise: boolean } | null = null;

    try {
      const { apiKey, model } = await getOpenRouterConfig("primary");
      const raw = await callJson({
        apiKey,
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,  // critic should be consistent, not creative
        jsonMode: true,
      });
      const parsed = parseJsonLoose(raw);
      if (parsed && typeof parsed === "object") {
        const o = parsed as Record<string, unknown>;
        const score = typeof o.score === "number" ? Math.max(1, Math.min(10, Math.round(o.score))) : 6;
        critique = {
          score,
          issues: Array.isArray(o.issues) ? (o.issues as unknown[]).map(String).slice(0, 5) : [],
          wins:   Array.isArray(o.wins)   ? (o.wins   as unknown[]).map(String).slice(0, 3) : [],
          shouldRevise: typeof o.shouldRevise === "boolean" ? o.shouldRevise : score < 7,
        };
      }
    } catch {
      // Skip critique on error — don't block the pipeline.
    }

    if (!critique) {
      critique = { score: 7, issues: [], wins: [], shouldRevise: false };
    }

    emit(ctx.run, {
      type: "workflow_step",
      stepId: `critique-${spec.id}`,
      status: "done",
      detail: `${critique.score}/10` + (critique.shouldRevise ? " · revising" : ""),
    });

    return critique;
  },
  stepTitle: (args) => `Critique ${(args.spec as SlideSpec | undefined)?.id ?? "slide"}`,
};

function summarizeSpec(spec: SlideSpec): string {
  const lines: string[] = [
    `Background: ${spec.background.type === "solid" ? spec.background.color : spec.background.type}`,
    `Element count: ${spec.elements.length}`,
  ];
  for (const el of spec.elements) {
    const pos = el.position;
    const bounds = `[x:${pos.x.toFixed(0)} y:${pos.y.toFixed(0)} w:${pos.w.toFixed(0)} h:${pos.h.toFixed(0)}]`;
    if (el.type === "text") {
      const len = el.content.length;
      const fontSize = el.style?.fontSize ?? "?";
      const weight = el.style?.fontWeight ?? "?";
      lines.push(`  TEXT (${el.variant}) ${bounds} ${fontSize}pt w${weight} — "${el.content.slice(0, 50)}${len > 50 ? "…" : ""}"`);
    } else if (el.type === "shape") {
      lines.push(`  SHAPE (${el.shape}) ${bounds} fill:${el.style?.fill ?? "?"} opacity:${el.style?.opacity ?? 1}`);
    } else if (el.type === "icon") {
      lines.push(`  ICON (${el.name}) ${bounds} color:${el.style?.color ?? "?"}`);
    } else if (el.type === "image") {
      lines.push(`  IMAGE ${bounds}`);
    }
  }
  return lines.join("\n");
}
