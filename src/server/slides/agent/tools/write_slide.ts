import { getOpenRouterConfig } from "@/server/backendConfig";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import type { DesignArchetype } from "@/types/slides";
import type { Tool } from "../tools";
import { emit } from "../runs";

/**
 * Writes content for a single slide.
 *
 * Now archetype-aware: shapes content to match the visual archetype that
 * design_brief / design_slide will use. THE_DATA_HERO needs ONE big stat,
 * THE_TYPOGRAPHIC needs ONE punchy quote, THE_GRID needs 3-4 short labels,
 * etc. — not the same 5-bullet template every time.
 *
 * Also receives narrative context (previous slide titles + deck topic) so
 * each slide builds on the last instead of repeating it.
 */
export const write_slide: Tool<{
  id: string;
  position: number;
  totalSlides: number;
  topic: string;
  archetypeHint?: DesignArchetype;
  slidePurpose?: string;        // e.g. "Open with the hook", "Show the problem"
  previousTitles?: string[];    // narrative continuity
  sources?: Array<{ title: string; url: string; snippet?: string }>;
}> = {
  name: "write_slide",
  description:
    "Write content for ONE slide, shaped to its archetype and the deck narrative. THE_DATA_HERO → big stat. THE_TYPOGRAPHIC → one quote. Etc.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["id", "position", "totalSlides", "topic"],
    properties: {
      id: { type: "string" },
      position: { type: "number" },
      totalSlides: { type: "number" },
      topic: { type: "string" },
      archetypeHint: { type: "string" },
      slidePurpose: { type: "string" },
      previousTitles: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url"],
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            snippet: { type: "string" },
          },
        },
      },
    },
  },
  async execute(args, ctx) {
    const { apiKey, model } = await getOpenRouterConfig("primary");

    const arch = args.archetypeHint ?? "THE_EDITORIAL";
    const sources = Array.isArray(args.sources) ? args.sources : [];
    const sourceText =
      sources.length > 0
        ? sources
            .slice(0, 6)
            .map((s) => `- ${s.title} (${s.url})${s.snippet ? `: ${s.snippet}` : ""}`)
            .join("\n")
        : "";

    const previousNarrative = (args.previousTitles ?? []).length > 0
      ? args.previousTitles!.map((t, i) => `  ${i + 1}. ${t}`).join("\n")
      : "(this is the first content slide)";

    const system = `You are a senior copywriter who writes for elite presentation decks.
Apple keynotes. McKinsey strategy. YC pitch demo days.

You DO NOT write generic AI prose. You write SPECIFIC content with REAL details.
- "Both ventures tackle problems others deemed unsolvable" ← BAD (generic)
- "SpaceX dropped launch costs from $54,500/kg to $1,500/kg in 14 years" ← GOOD (specific)

Output ONLY this JSON shape:
{
  "title": string,
  "bullets": string[],
  "speakerNotes": string
}

═══════════════════════════════════════════════════
ARCHETYPE-AWARE CONTENT SHAPING (this is critical)
═══════════════════════════════════════════════════

The slide will be designed as: ${arch}

Shape your content to match:

THE_HERO         → title is the WHOLE message. 1-3 words preferred. bullets = [], or 1 short tagline.
THE_DATA_HERO    → title = ONE big number/stat ("300,000+", "$2.4M", "94%"). bullets = [1 short descriptor sentence].
THE_TYPOGRAPHIC  → title = ONE punchy quote or manifesto line. bullets = [attribution / 1 line context].
THE_TENSION     → title = the conflict ("Old way vs new way"). bullets = [2 sharp contrasts: "1985 → today"].
THE_BREATH       → title = ONE thoughtful sentence. bullets = []. Less is more.
THE_GRID         → title = section header. bullets = 3 OR 4 short labels (max 6 words each).
THE_LAYER        → title = headline + subhead idea. bullets = [2-3 supporting points, 8-12 words each].
THE_EDITORIAL    → title = magazine-style headline. bullets = [3 specific facts/stories with concrete details].

═══════════════════════════════════════════════════
QUALITY RULES
═══════════════════════════════════════════════════

- Specific over generic. Numbers over adjectives. Names over "people".
- No filler: "various", "many", "some", "important" → cut these.
- Bullets are NOT sentences. They are punchy fragments.
- If a bullet starts with "Both", "All", "Many" → rewrite with specifics.
- Title must NOT be a question unless the slide is a hook.
- Speaker notes: 1-2 sentences a presenter would actually say out loud.

═══════════════════════════════════════════════════
NARRATIVE CONTINUITY
═══════════════════════════════════════════════════

Previous slide titles in this deck:
${previousNarrative}

This slide is position ${args.position} of ${args.totalSlides}. Don't repeat what was said.
Build on it. Each slide should make the next one inevitable.

${args.slidePurpose ? `Slide purpose: ${args.slidePurpose}` : ""}`;

    const user = [
      `Deck topic: ${args.topic}`,
      `Slide ${args.id} (${args.position}/${args.totalSlides}) — archetype: ${arch}`,
      "",
      sourceText ? `Sources:\n${sourceText}` : "No sources — use specific factual knowledge.",
      "",
      "Write the content. Specific. Concrete. Real.",
    ].join("\n");

    let payload: { title: string; bullets: string[]; speakerNotes?: string } | null = null;
    try {
      const raw = await callJson({
        apiKey,
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.55,
        jsonMode: true,
      });
      const parsed = parseJsonLoose(raw);
      if (parsed && typeof parsed === "object") {
        const o = parsed as Record<string, unknown>;
        if (typeof o.title === "string" && Array.isArray(o.bullets)) {
          payload = {
            title: String(o.title),
            bullets: (o.bullets as unknown[]).map(String).filter(Boolean).slice(0, 5),
            speakerNotes: typeof o.speakerNotes === "string" ? o.speakerNotes : undefined,
          };
        }
      }
    } catch {
      // fall back
    }

    if (!payload) {
      payload = {
        title: `Slide ${args.position}`,
        bullets: ["Key point one", "Key point two", "Key point three"],
        speakerNotes: "Draft speaker notes.",
      };
    }

    emit(ctx.run, {
      type: "slide_written",
      id: args.id,
      title: payload.title,
      bullets: payload.bullets,
      speakerNotes: payload.speakerNotes,
    });

    return payload;
  },
  stepTitle: (args) => `Write ${args.id}`,
};
