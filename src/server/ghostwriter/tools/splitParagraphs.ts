// `split_paragraphs` tool — the AI humanizer merges all paragraphs into one
// continuous block. This tool uses a secondary model to restore the paragraph
// boundaries using the essay's outline as a structural guide, without changing
// any wording.
//
// Reads: ctx.humanizedContent, ctx.outlines
// Writes: ctx.humanizedContent (rejoined with \n\n paragraph breaks)

import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import { emit } from "@/server/ghostwriter/agent/runs";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import type { OutlineItem } from "@/server/ghostwriter/agent/context";

type SplitArgs = Record<string, never>;

type SplitResult = {
  paragraphCount: number;
};

type ParagraphItem = {
  type?: string;
  text?: string;
};

function buildSystemPrompt(outlines: OutlineItem[]): string {
  const total = outlines.length;
  return `You are a paragraph-splitting agent for OctoPilot AI.

You will receive an academic essay that was recently passed through an AI-humanizer. The humanizer merged every paragraph into one block of continuous text. Your job is to split that text back into exactly ${total} paragraphs that match the intended structure — without changing any wording.

Hard rules:
- Preserve EVERY sentence and EVERY word from the input, in the exact same order. Do NOT rewrite, paraphrase, or reorder.
- Do NOT add any new sentences, transitions, headings, or section titles.
- Only decide where one paragraph ends and the next begins.
- The final output must have exactly ${total} paragraphs matching the provided structure (Introduction → Body Paragraphs → Conclusion).
- If the input obviously contains a References / Bibliography / Works Cited section at the end, leave it attached to the final Conclusion paragraph — do not split citations.

Respond with ONLY valid JSON — no markdown, no commentary — in this exact shape:
{
  "paragraphs": [
    { "type": "Introduction" | "Body Paragraph" | "Conclusion", "text": "..." }
  ]
}`;
}

function buildUserMessage(humanizedText: string, outlines: OutlineItem[]): string {
  const plan = outlines
    .map((o, i) => `${i + 1}. ${o.type} — ${o.title}`)
    .join("\n");
  return `Target paragraph structure (in order):
${plan}

Essay text (merged into one block by the humanizer):
${humanizedText}

Split the text into exactly ${outlines.length} paragraphs matching the structure above. Preserve all wording verbatim.`;
}

export const splitParagraphsTool: Tool<SplitArgs, SplitResult> = {
  name: "split_paragraphs",
  description:
    "Restore paragraph breaks in the humanized essay. The humanizer collapses all paragraphs into one block — this tool uses the outline structure to re-split it without changing any wording. Call this AFTER humanize_essay.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  timeoutMs: 90_000,
  stepTitle: () => "Splitting paragraphs",
  async execute(_args, { run }) {
    const ctx = run.context;
    if (!ctx.humanizedContent?.trim()) {
      throw new Error("split_paragraphs: humanizedContent is missing — run humanize_essay first.");
    }
    if (ctx.outlines.length < 2) {
      throw new Error("split_paragraphs: need at least 2 outlines to split paragraphs.");
    }

    const { apiKey, model } = await getOpenRouterConfig("secondary");

    const messages = [
      { role: "system" as const, content: buildSystemPrompt(ctx.outlines) },
      { role: "user" as const, content: buildUserMessage(ctx.humanizedContent, ctx.outlines) },
    ];

    const rawString = await callJson({
      apiKey,
      model,
      messages,
      temperature: 0.2,
      jsonMode: true,
    });

    const parsed = (parseJsonLoose(rawString) ?? {}) as { paragraphs?: ParagraphItem[] };
    const paragraphs = (parsed.paragraphs || [])
      .map((p) => String(p.text || "").trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      throw new Error("split_paragraphs: model returned no paragraphs.");
    }

    const rejoined = paragraphs.join("\n\n");
    ctx.humanizedContent = rejoined;

    emit(run, {
      type: "context_update",
      patch: { humanizedContent: rejoined },
    });

    return { paragraphCount: paragraphs.length };
  },
};

