import { getOpenRouterConfig } from "@/server/backendConfig";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import type { Tool } from "../tools";
import { emit } from "../runs";

export const write_slide: Tool<{
  id: string;
  topic: string;
  position: number;
  totalSlides?: number;
  sources?: Array<{ title: string; url: string; snippet?: string }>;
}> = {
  name: "write_slide",
  description: "Write slide content (title, bullets, optional speaker notes) for a given slide id.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["id", "topic", "position"],
    properties: {
      id: { type: "string" },
      topic: { type: "string" },
      position: { type: "number" },
      totalSlides: { type: "number" },
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

    const sources = Array.isArray(args.sources) ? args.sources : [];
    const sourceText =
      sources.length > 0
        ? sources
            .slice(0, 6)
            .map((s) => `- ${s.title} (${s.url})${s.snippet ? `: ${s.snippet}` : ""}`)
            .join("\n")
        : "";

    const system = [
      "You write concise slide content for a presentation.",
      "Return JSON only with keys: title (string), bullets (string[]), speakerNotes (string, optional).",
      "Rules:",
      "- Bullets: 3–5 max, each short (<= 12 words).",
      "- Make each bullet specific; avoid fluff.",
      "- Do not include markdown.",
    ].join("\n");

    const user = [
      `Deck topic / instruction: ${args.topic}`,
      `Slide: ${args.id} (position ${args.position}${args.totalSlides ? ` of ${args.totalSlides}` : ""})`,
      sourceText ? `Sources:\n${sourceText}` : "No sources provided (use general knowledge).",
      "",
      "Write the best possible content for THIS slide in the deck narrative.",
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
        temperature: 0.4,
        jsonMode: true,
      });
      const parsed = parseJsonLoose(raw);
      if (parsed && typeof parsed === "object") {
        const o = parsed as Record<string, unknown>;
        if (typeof o.title === "string" && Array.isArray(o.bullets)) {
          payload = {
            title: String(o.title),
            bullets: (o.bullets as unknown[]).map(String).filter(Boolean).slice(0, 6),
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
        bullets: [
          "Key point one",
          "Key point two",
          "Key point three",
        ],
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

