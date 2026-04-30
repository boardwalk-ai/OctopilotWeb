// `evaluate_sources` tool — asks a secondary model whether the compacted
// sources are sufficient to support the essay. Returns a structured
// verdict so the orchestrator can decide whether to search again.
//
// Called after compact_sources and before write_essay. If `sufficient`
// is false, the orchestrator should search with a new refinement query
// and scrape + compact again (capped at 2 extra search rounds).

import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";

type EvaluateArgs = {
  notes?: string;
};

type EvaluateResult = {
  sufficient: boolean;
  quality: "good" | "fair" | "poor";
  gaps: string[];
  recommendation: string;
};

export const evaluateSourcesTool: Tool<EvaluateArgs, EvaluateResult> = {
  name: "evaluate_sources",
  description:
    "Judge whether the compacted sources are sufficient to write a well-cited essay on this topic. Returns sufficient (bool), quality, gaps, and a recommendation. If not sufficient, the orchestrator should search again with a refinement before calling write_essay.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      notes: {
        type: "string",
        description: "Optional additional context about what kinds of sources are needed.",
      },
    },
  },
  stepTitle: () => "Evaluating source quality",
  async execute(args, { run }) {
    const ctx = run.context;
    if (ctx.compactedSources.length === 0) {
      throw new Error("evaluate_sources: no compacted sources — run compact_sources first.");
    }

    const { apiKey, model } = await getOpenRouterConfig("secondary");

    const sourceSummaries = ctx.compactedSources
      .map((s, i) => `Source ${i + 1}: ${s.title || "(no title)"}\n${s.summary || ""}`)
      .join("\n\n");

    const outlineTitles = ctx.outlines.map((o) => `- ${o.type}: ${o.title}`).join("\n");

    const systemPrompt = `You are a research quality evaluator for OctoPilot AI. You assess whether a set of academic sources is sufficient to write a well-supported essay.

Respond ONLY with valid JSON in this shape:
{
  "sufficient": true | false,
  "quality": "good" | "fair" | "poor",
  "gaps": ["list of missing topics or perspectives"],
  "recommendation": "one sentence on what to search for if not sufficient"
}`;

    const userMessage = [
      `Essay topic: ${ctx.essayTopic || "unknown"}`,
      `Essay type: ${ctx.essayType || "Essay"}`,
      `Required paragraphs:\n${outlineTitles}`,
      args.notes ? `Notes: ${args.notes}` : "",
      `\nCompacted sources (${ctx.compactedSources.length} total):\n${sourceSummaries}`,
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await callJson({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      jsonMode: true,
    });

    const parsed = (parseJsonLoose(raw) ?? {}) as Partial<EvaluateResult>;

    return {
      sufficient: parsed.sufficient ?? ctx.compactedSources.length >= 3,
      quality: parsed.quality ?? "fair",
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : "",
    };
  },
};
