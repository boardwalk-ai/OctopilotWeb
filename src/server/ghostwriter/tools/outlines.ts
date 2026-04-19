// `generate_outlines` tool — produces the paragraph skeleton.
//
// Mirrors the legacy Lily "auto" mode: exactly `count` outlines shaped as
// 1 Introduction → (count - 2) Body Paragraphs → 1 Conclusion. The legacy
// `/api/lily/generate` route still exists and is used by the old engine;
// this tool intentionally re-implements the OpenRouter call against the
// secondary model instead of proxying through that route, so the agent
// doesn't need to thread bearer tokens for internal self-calls. If the
// two implementations drift, the legacy route is the source of truth
// until it's retired at milestone 8.

import { randomUUID } from "crypto";
import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import type { OutlineItem, OutlineType } from "@/server/ghostwriter/agent/context";
import { emit } from "@/server/ghostwriter/agent/runs";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type OutlineArgs = {
  // Total paragraph count (1 intro + N body + 1 conclusion).
  count: number;
};

type OutlineResult = {
  outlines: OutlineItem[];
};

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

function buildSystemPrompt(total: number): string {
  const bodyCount = Math.max(1, total - 2);
  return `You are Lily, an academic outline generation agent for OctoPilot AI.
Respond with ONLY valid JSON — no markdown, no explanation, no extra text.

Each outline item must have:
- "type": exactly one of "Introduction", "Body Paragraph", or "Conclusion"
- "title": a specific, descriptive title for this section
- "description": 2-3 sentences describing what this section should cover

Generate exactly ${total} outline items in this order:
1. One Introduction
2. ${bodyCount} Body Paragraph${bodyCount === 1 ? "" : "s"} (each covering a distinct aspect)
${total}. One Conclusion

The ${total} items must consist of exactly 1 Introduction, ${bodyCount} Body Paragraph${bodyCount === 1 ? "" : "s"}, and 1 Conclusion — in that order.

Respond in this JSON shape:
{
  "outlines": [
    { "type": "...", "title": "...", "description": "..." }
  ]
}`;
}

export const generateOutlinesTool: Tool<OutlineArgs, OutlineResult> = {
  name: "generate_outlines",
  description:
    "Generate a paragraph outline for the essay: 1 Introduction + (count-2) Body Paragraphs + 1 Conclusion, in that order. Requires plan_essay to have run first (topic + plan are read from run context). Pass the user's preferred count.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["count"],
    properties: {
      count: {
        type: "integer",
        minimum: 3,
        maximum: 20,
        description:
          "Total paragraph count including introduction and conclusion. Typical essays use 5; longer research pieces use 7-10.",
      },
    },
  },
  stepTitle: (args) => `Building ${args.count} outlines`,
  async execute(args, { run }) {
    const total = clampInt(Number(args.count), 3, 20, 5);
    const ctx = run.context;
    if (!ctx.essayTopic) {
      throw new Error(
        "generate_outlines: call plan_essay first (essayTopic is missing from context).",
      );
    }

    const { apiKey, model } = await getOpenRouterConfig("secondary");

    const planBlock = ctx.plan
      ? [
          `Thesis: ${ctx.plan.thesis}`,
          `Paragraph count: ${ctx.plan.paragraphCount}`,
          ctx.plan.notes ? `Planner notes: ${ctx.plan.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "(no plan — use topic and type alone)";

    const userMessage = [
      `Essay Topic: ${ctx.essayTopic}`,
      `Essay Type: ${ctx.essayType || "Essay"}`,
      "",
      "Plan:",
      planBlock,
      "",
      "User Instruction:",
      ctx.instruction,
    ].join("\n");

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://octopilotai.com",
        "X-Title": "OctoPilot AI",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildSystemPrompt(total) },
          { role: "user", content: userMessage },
        ],
        temperature: 0.5,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`generate_outlines: OpenRouter ${response.status} ${text}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    if (data.error) throw new Error(`generate_outlines: ${data.error.message || "error"}`);

    const content = data.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(content);
    const raw = Array.isArray(parsed?.outlines) ? (parsed.outlines as unknown[]) : [];

    const outlines: OutlineItem[] = raw.map((item) => {
      const obj = item as { type?: string; title?: string; description?: string };
      return {
        id: `outline-${randomUUID()}`,
        type: normaliseType(obj.type),
        title: String(obj.title || "").trim(),
        description: String(obj.description || "").trim(),
      };
    });

    if (outlines.length === 0) {
      throw new Error("generate_outlines: model returned no outlines");
    }

    ctx.outlines = outlines;
    emit(run, { type: "context_update", patch: { outlines } });

    return { outlines };
  },
};

function normaliseType(raw: string | undefined): OutlineType {
  const v = (raw || "").trim().toLowerCase();
  if (v === "introduction") return "Introduction";
  if (v === "conclusion") return "Conclusion";
  return "Body Paragraph";
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
