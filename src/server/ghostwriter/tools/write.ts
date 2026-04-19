// `write_essay` tool — streams the full essay draft from the Lucas prompt
// and parses the final JSON into ctx.essay + ctx.bibliography.
//
// Streaming matters for UX: the client renders tokens as they arrive in an
// `essay_delta` event, same as the legacy pipeline's `onEssayChunk` hook.
// When the OpenRouter stream closes, we parse the accumulated content as
// JSON with keys `essay_content` and `bibliography` (Lucas's contract) and
// write them to context.
//
// Requires: ctx.essayTopic, ctx.essayType, ctx.outlines (>= 3), and
// ctx.compactedSources. Draft settings (wordCount, citationStyle) are
// pulled from ctx.draftSettings — the orchestrator must ask_user for them
// before calling this tool.

import fs from "fs";
import path from "path";
import { getOpenRouterConfig } from "@/server/backendConfig";
import type { Tool } from "@/server/ghostwriter/agent/tools";
import { emit } from "@/server/ghostwriter/agent/runs";
import { parseJsonLoose } from "@/server/ghostwriter/shared/openrouter";
import { deductCredits, creditsFromWords } from "@/server/ghostwriter/shared/credits";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type WriteArgs = {
  // Free-form guidance for the writer (e.g. "lean more historical",
  // "avoid first person"). Optional; the prompt builds fine without it.
  notes?: string;
};

type WriteResult = {
  wordCount: number;
  bibliographyLength: number;
};

type OpenRouterStreamDelta = {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
};

export const writeEssayTool: Tool<WriteArgs, WriteResult> = {
  name: "write_essay",
  description:
    "Draft the full essay by streaming the Lucas writer. Reads outlines, compacted sources, wordCount, and citationStyle from context. Streams tokens to the client as `essay_delta` events. On completion, writes parsed essay + bibliography back to context. Call this AFTER compact_sources and AFTER you have wordCount + citationStyle.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      notes: {
        type: "string",
        description:
          "Optional writer guidance (tone, angle, framing). Leave empty if the outlines and sources already convey the requirements.",
      },
    },
  },
  // The full draft can take a couple of minutes on longer essays.
  timeoutMs: 300_000,
  stepTitle: () => "Writing the essay",
  async execute(args, { run }) {
    const ctx = run.context;

    if (!ctx.essayTopic) throw new Error("write_essay: essayTopic is missing — call plan_essay first.");
    if (ctx.outlines.length < 3) throw new Error("write_essay: need at least 3 outlines — call generate_outlines first.");
    if (ctx.compactedSources.length < 1)
      throw new Error("write_essay: no compacted sources — run compact_sources first.");
    if (!ctx.draftSettings.wordCount)
      throw new Error("write_essay: wordCount is missing — ask_user(field=\"wordCount\") first.");
    if (!ctx.draftSettings.citationStyle)
      throw new Error("write_essay: citationStyle is missing — ask_user(field=\"citationStyle\") first.");

    const { apiKey, model } = await getOpenRouterConfig("primary");
    const systemPrompt = loadLucasPrompt();

    const outlinesString = ctx.outlines
      .map((o, idx) => `Outline ${idx + 1} (${o.type}): ${o.title} - ${o.description}`)
      .join("\n");

    const sourcesString = ctx.compactedSources
      .map((s, idx) =>
        [
          `source ${idx + 1}:`,
          `kind: web`,
          `title: ${s.title || ""}`,
          `Publisher: ${s.publisher || ""}`,
          `Author: ${s.author || ""}`,
          `Year: ${s.publishedYear || ""}`,
          `Content(compacted): ${s.summary || ""}`,
        ].join("\n"),
      )
      .join("\n\n");

    const tone = ctx.draftSettings.tone || "academic";
    const keywords = ctx.draftSettings.keywords || "None";
    const writingStyleBlock = `
Imperfect Mode: OFF
Ignore any user-style imitation instructions and write in the normal Octopilot academic standard.
`;

    const userMessage = [
      `Word Count: ${ctx.draftSettings.wordCount}`,
      `Essay Topic: ${ctx.essayTopic}`,
      `Essay Type: ${ctx.essayType || "Essay"}`,
      `Writing Tone: ${tone}`,
      `Citation Format: ${ctx.draftSettings.citationStyle}`,
      `Keywords: ${keywords}`,
      writingStyleBlock,
      "",
      `Outlines (${ctx.outlines.length} paragraphs):`,
      outlinesString,
      "",
      "Sources:",
      sourcesString,
      args.notes ? `\nOrchestrator notes:\n${args.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

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
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.4,
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`write_essay: OpenRouter ${response.status} ${text}`);
    }
    if (!response.body) throw new Error("write_essay: no response body from OpenRouter");

    // Accumulate the raw JSON string Lucas produces, emitting every delta
    // as an essay_delta so the UI renders the draft live.
    const accumulated = await consumeSseStream(response.body, (chunk) => {
      emit(run, { type: "essay_delta", chunk });
    });

    const parsed = tryParseLucasOutput(accumulated);
    if (!parsed.essay_content) {
      throw new Error(
        `write_essay: Lucas output did not contain essay_content. Got ${accumulated.length} chars.`,
      );
    }

    ctx.essay = parsed.essay_content;
    ctx.bibliography = parsed.bibliography || "";

    emit(run, {
      type: "context_update",
      patch: { essay: ctx.essay, bibliography: ctx.bibliography },
    });

    // Deduct word credits based on the user's requested word count (not AI
    // output length), matching the legacy GenerationView pattern.
    const requestedWords = ctx.draftSettings.wordCount ?? 0;
    if (requestedWords > 0 && run.authToken) {
      await deductCredits(
        run.authToken,
        "word",
        creditsFromWords(requestedWords),
        `${run.id}:word`,
      ).catch((err: unknown) => {
        // Credit errors are non-fatal for the essay — the run continues and
        // the error is surfaced as a step_error so the UI can display it.
        emit(run, {
          type: "step_error",
          id: `${run.id}-credits-word`,
          error: err instanceof Error ? err.message : "Word credit deduction failed.",
          retryable: false,
        });
      });
    }

    const wordCount = ctx.essay.split(/\s+/).filter(Boolean).length;
    return {
      wordCount,
      bibliographyLength: ctx.bibliography.length,
    };
  },
};

// ─── helpers ───────────────────────────────────────────────────────────────

// Consume an OpenRouter SSE stream, invoking `onChunk` for every content
// delta and returning the concatenated content string. Lines have the form
//   data: {"choices":[{"delta":{"content":"..."}}]}
//   data: [DONE]
// Non-data lines (keep-alive comments) are ignored.
async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split on blank lines — each SSE frame is terminated by \n\n.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let parsed: OpenRouterStreamDelta;
      try {
        parsed = JSON.parse(payload) as OpenRouterStreamDelta;
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) {
        accumulated += delta;
        onChunk(delta);
      }
    }
  }

  return accumulated;
}

function tryParseLucasOutput(raw: string): { essay_content?: string; bibliography?: string } {
  try {
    const parsed = parseJsonLoose(raw);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        essay_content: typeof obj.essay_content === "string" ? obj.essay_content : undefined,
        bibliography: typeof obj.bibliography === "string" ? obj.bibliography : undefined,
      };
    }
  } catch {
    // fall through
  }
  return {};
}

function loadLucasPrompt(): string {
  const agentFile = path.resolve(process.cwd(), "agents/lucas.md");
  return fs.readFileSync(agentFile, "utf-8");
}
