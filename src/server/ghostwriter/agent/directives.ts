import { getOpenRouterConfig } from "@/server/backendConfig";
import type { AgentContext } from "./context";
import { callJson, parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";

type DirectiveDecision = {
  disabledTools: string[];
  notes?: string;
};

const DISABLABLE_TOOLS = [
  "critique_essay",
  "revise_paragraph",
  "humanize_essay",
  "split_paragraphs",
  "finalize_export_humanized",
  "search_sources",
  "scrape_sources",
  "compact_sources",
] as const;

function buildCompactStateSummary(ctx: AgentContext): string {
  return [
    `essayTopic=${ctx.essayTopic || ""}`,
    `essayType=${ctx.essayType || ""}`,
    `outlines=${ctx.outlines.length}`,
    `searchResults=${ctx.searchResults.length}`,
    `scrapedSources=${ctx.scrapedSources.length}`,
    `compactedSources=${ctx.compactedSources.length}`,
    `hasEssay=${ctx.essay ? "yes" : "no"}`,
    `exportReady=${ctx.exportReady ? "yes" : "no"}`,
    `humanizeChoice=${ctx.humanizeChoice || ""}`,
  ].join("\n");
}

export async function classifyUserDirective(args: {
  directive: string;
  context: AgentContext;
}): Promise<DirectiveDecision> {
  const directive = args.directive.trim();
  if (!directive) {
    return { disabledTools: [], notes: "" };
  }

  // Cheap heuristic: explicit “don’t X” patterns.
  const lowered = directive.toLowerCase();
  const disabledTools = new Set<string>();
  const maybeDisable = (tool: string, patterns: string[]) => {
    if (patterns.some((p) => lowered.includes(p))) disabledTools.add(tool);
  };
  maybeDisable("critique_essay", ["no critique", "don't critique", "skip critique", "stop critique", "no review"]);
  maybeDisable("revise_paragraph", ["no revision", "don't revise", "skip revision", "stop revis"]);
  maybeDisable("humanize_essay", ["no humanize", "don't humanize", "skip humanize", "no stealthgpt", "no undetectable"]);

  // If we have a clear hit, return without spending tokens.
  if (disabledTools.size > 0) {
    return { disabledTools: Array.from(disabledTools), notes: directive };
  }

  const { apiKey, model } = await getOpenRouterConfig("secondary");

  const system = `You are a router that converts a user's mid-run directive into tool disable overrides.
Return ONLY JSON in this shape:
{
  "disabledTools": string[],  // subset of the allowlist below
  "notes": string            // short note to the orchestrator
}

Allowlist of disablable tools:
${JSON.stringify(DISABLABLE_TOOLS)}

Rules:
- Only disable a tool if the user clearly requests skipping it or a whole phase.
- Prefer disabling critique_essay/revise_paragraph/humanize_* when user says to stop quality checks or humanization.
- If unsure, return an empty disabledTools array and keep notes as the user's message.`;

  const user = `USER_DIRECTIVE:\n${directive}\n\nCURRENT_STATE:\n${buildCompactStateSummary(args.context)}`;

  const content = await callJson({
    apiKey,
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
  });

  const parsed = parseJsonLoose(content);
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const rawDisabled = Array.isArray(obj.disabledTools) ? obj.disabledTools : [];
  const cleaned = rawDisabled
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v && (DISABLABLE_TOOLS as readonly string[]).includes(v));

  const notes = typeof obj.notes === "string" ? obj.notes : directive;

  return {
    disabledTools: Array.from(new Set(cleaned)),
    notes,
  };
}

