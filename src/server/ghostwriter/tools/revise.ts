// `revise_paragraph` tool — rewrites a single paragraph in ctx.essay to
// fix a specific critique issue without changing the rest of the essay.
//
// The orchestrator loops: critique_essay → revise_paragraph (per major issue)
// → critique_essay again, capped at AGENT_LIMITS.MAX_REVISION_ROUNDS total
// revision rounds.
//
// Reads: ctx.essay, ctx.outlines, ctx.compactedSources
// Writes: ctx.essay (patches one paragraph), ctx.revisionRounds++

import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import { emit } from "@/server/ghostwriter/agent/runs";
import { callJson } from "@/server/ghostwriter/shared/openrouter";
import { AGENT_LIMITS } from "@/server/ghostwriter/agent/limits";

type ReviseArgs = {
  paragraphIndex: number;
  issue: string;
};

type ReviseResult = {
  paragraphIndex: number;
  revisionRounds: number;
};

export const reviseParagraphTool: Tool<ReviseArgs, ReviseResult> = {
  name: "revise_paragraph",
  description:
    "Rewrite one paragraph in the essay to fix a specific critique issue. paragraphIndex is 0-based (matches the essay's \\n\\n-separated paragraphs and the outline array). issue is the description of what to fix. Only call this after critique_essay.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["paragraphIndex", "issue"],
    properties: {
      paragraphIndex: {
        type: "number",
        description: "0-based index of the paragraph to revise (matches outline order).",
      },
      issue: {
        type: "string",
        description: "The specific issue to fix, as returned by critique_essay.",
      },
    },
  },
  timeoutMs: 90_000,
  stepTitle: (args) => `Revising paragraph ${(args as ReviseArgs).paragraphIndex + 1}`,
  async execute(args, { run }) {
    const ctx = run.context;

    if (!ctx.essay?.trim()) {
      throw new Error("revise_paragraph: essay is missing — run write_essay first.");
    }
    if (ctx.revisionRounds >= AGENT_LIMITS.MAX_REVISION_ROUNDS) {
      throw new Error(
        `revise_paragraph: revision cap reached (${AGENT_LIMITS.MAX_REVISION_ROUNDS} rounds). Accept the current draft.`,
      );
    }

    const paragraphs = ctx.essay.split(/\n{2,}/);
    const { paragraphIndex } = args;

    if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
      throw new Error(
        `revise_paragraph: paragraphIndex ${paragraphIndex} is out of range (essay has ${paragraphs.length} paragraphs).`,
      );
    }

    const outline = ctx.outlines[paragraphIndex];
    const sourceBriefs = ctx.compactedSources
      .slice(0, 5)
      .map((s, i) => `Source ${i + 1}: ${s.title || ""}\n${s.summary || ""}`)
      .join("\n\n");

    const { apiKey, model } = await getOpenRouterConfig("primary");

    const systemPrompt = `You are an academic essay editor for OctoPilot AI.

You will receive one paragraph from an essay along with a critique issue and the paragraph's intended purpose. Rewrite ONLY that paragraph to fix the issue.

Rules:
- Keep the same approximate length unless the issue is about length.
- Maintain the academic tone and citation style of the original.
- Do NOT add headings, labels, or paragraph markers.
- Respond with ONLY the revised paragraph text — no commentary.`;

    const userMessage = [
      `Essay topic: ${ctx.essayTopic || "unknown"}`,
      `Citation style: ${ctx.draftSettings.citationStyle || "unknown"}`,
      outline ? `Paragraph purpose: ${outline.type} — ${outline.title}: ${outline.description}` : "",
      `\nCritique issue to fix: ${args.issue}`,
      `\nCurrent paragraph:\n${paragraphs[paragraphIndex]}`,
      sourceBriefs ? `\nAvailable sources (for evidence):\n${sourceBriefs}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const revised = await callJson({
      apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      jsonMode: false,
    });

    // Splice the revised paragraph back into the essay
    const revisedText = revised.trim();
    paragraphs[paragraphIndex] = revisedText;
    ctx.essay = paragraphs.join("\n\n");
    ctx.revisionRounds += 1;

    // Clear the resolved critique issue from the list
    ctx.critiqueIssues = ctx.critiqueIssues.filter(
      (issue) => issue.paragraphIndex !== paragraphIndex,
    );

    emit(run, {
      type: "context_update",
      patch: {
        essay: ctx.essay,
        revisionRounds: ctx.revisionRounds,
        critiqueIssues: ctx.critiqueIssues,
      },
    });

    return { paragraphIndex, revisionRounds: ctx.revisionRounds };
  },
};
