// `critique_essay` tool — asks the primary model to review the full essay
// draft and return a structured list of issues. The orchestrator uses this
// to decide whether to run revise_paragraph on specific sections.
//
// Reads: ctx.essay, ctx.outlines
// Writes: ctx.critiqueIssues (replaces previous round)
//
// The orchestrator should cap revision rounds at AGENT_LIMITS.MAX_REVISION_ROUNDS.

import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import { emit } from "@/server/ghostwriter/agent/runs";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import type { CritiqueIssue } from "@/server/ghostwriter/agent/context";

type CritiqueArgs = {
  notes?: string;
};

type CritiqueResult = {
  overallScore: number;
  issueCount: number;
  majorIssues: number;
  ready: boolean;
};

export const critiqueEssayTool: Tool<CritiqueArgs, CritiqueResult> = {
  name: "critique_essay",
  description:
    "Review the drafted essay for thesis strength, paragraph coherence, evidence quality, and citation completeness. Returns structured issues with paragraph indices. Call after write_essay. If issues exist, revise_paragraph fixes them one at a time.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      notes: {
        type: "string",
        description: "Optional focus areas (e.g. 'check evidence density', 'focus on argument flow').",
      },
    },
  },
  stepTitle: () => "Critiquing the draft",
  async execute(args, { run }) {
    const ctx = run.context;
    if (!ctx.essay?.trim()) {
      throw new Error("critique_essay: essay is missing — run write_essay first.");
    }

    const { apiKey, model } = await getOpenRouterConfig("primary");

    const paragraphs = ctx.essay.split(/\n{2,}/).filter(Boolean);
    const numberedEssay = paragraphs
      .map((p, i) => `[${i}] ${p}`)
      .join("\n\n");

    const outlineContext = ctx.outlines
      .map((o, i) => `[${i}] ${o.type} — ${o.title}: ${o.description}`)
      .join("\n");

    const systemPrompt = `You are an academic essay critic for OctoPilot AI.

Review the essay and identify weaknesses. Each paragraph is prefixed with [index].

Issue types: "thesis" | "evidence" | "clarity" | "citations" | "length" | "structure"
Severity: "major" (must fix) | "minor" (nice to fix)

Respond ONLY with valid JSON:
{
  "overallScore": 1-10,
  "issues": [
    { "paragraphIndex": 0, "type": "thesis", "description": "...", "severity": "major" }
  ],
  "ready": true | false
}

"ready" is true when the essay is publication-quality with no major issues.`;

    const userMessage = [
      `Topic: ${ctx.essayTopic || "unknown"}`,
      `Citation style: ${ctx.draftSettings.citationStyle || "unknown"}`,
      args.notes ? `Focus: ${args.notes}` : "",
      `\nOutline structure:\n${outlineContext}`,
      `\nEssay (paragraphs numbered by index):\n${numberedEssay}`,
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
      temperature: 0.3,
      jsonMode: true,
    });

    const parsed = (parseJsonLoose(raw) ?? {}) as {
      overallScore?: number;
      issues?: Partial<CritiqueIssue>[];
      ready?: boolean;
    };

    const issues: CritiqueIssue[] = (parsed.issues ?? [])
      .filter((i) => typeof i.paragraphIndex === "number")
      .map((i) => ({
        paragraphIndex: Number(i.paragraphIndex),
        type: (i.type as CritiqueIssue["type"]) || "clarity",
        description: String(i.description || ""),
        severity: i.severity === "major" ? "major" : "minor",
      }));

    ctx.critiqueIssues = issues;

    emit(run, {
      type: "context_update",
      patch: { critiqueIssues: issues },
    });

    const majorIssues = issues.filter((i) => i.severity === "major").length;

    return {
      overallScore: parsed.overallScore ?? 7,
      issueCount: issues.length,
      majorIssues,
      ready: parsed.ready ?? majorIssues === 0,
    };
  },
};
