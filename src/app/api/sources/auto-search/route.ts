// POST /api/sources/auto-search
//
// Two-step source search for the Formatter Source tab:
//   Step 1 — Secondary model reads the full essay draft and generates a
//             focused academic search query.
//   Step 2 — Perplexity Sonar (via searchAndScrape) finds + validates sources.
//
// SSE events:
//   { type: "status",  message: string }   — progress text
//   { type: "query",   query:   string }   — the AI-generated search query
//   { type: "source",  source:  GoodSource } — one validated source
//   { type: "done",    count:   number }   — finished
//   { type: "error",   message: string }   — fatal error

import { NextRequest } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { searchAndScrape, type GoodSource } from "@/server/sources/searchAndScrape";

export const maxDuration = 120;

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const ANALYZE_PROMPT = `You are a research query generator for an academic essay tool.

Given a student's essay draft, generate a single focused search query (under 80 characters) that will find the most relevant academic and credible web sources to support the essay's main arguments.

Analyze the essay and focus on:
- The central thesis or main topic
- Specific claims or arguments that need citations
- Academic terminology relevant to the subject area

Return ONLY the search query text. No explanations. No quotes. No markdown. No punctuation at the end.`;

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let essayContent: string;
  try {
    const body = (await request.json()) as { essayContent?: string };
    essayContent = (body.essayContent ?? "").trim().slice(0, 8000);
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (essayContent.length < 50) {
    return Response.json({ error: "Essay is too short. Write more before searching." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* controller already closed */ }
      };

      try {
        // ── Step 1: Secondary model → generate search query ──────────────────
        emit({ type: "status", message: "Reading your essay…" });

        const { apiKey: secondaryKey, model: secondaryModel } = await getOpenRouterConfig("secondary");

        const analyzeRes = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secondaryKey}`,
            "HTTP-Referer": "https://octopilotai.com",
            "X-Title": "OctoPilot AI",
          },
          body: JSON.stringify({
            model: secondaryModel,
            messages: [
              { role: "system", content: ANALYZE_PROMPT },
              { role: "user", content: `Essay draft:\n\n${essayContent}` },
            ],
            temperature: 0.25,
            max_tokens: 120,
          }),
        });

        if (!analyzeRes.ok) {
          throw new Error(`Essay analysis failed (${analyzeRes.status}).`);
        }

        const analyzeJson = await analyzeRes.json() as {
          choices?: { message?: { content?: string } }[];
        };
        const searchQuery = analyzeJson.choices?.[0]?.message?.content?.trim() ?? "";

        if (!searchQuery) {
          throw new Error("AI could not determine a search query from your essay.");
        }

        emit({ type: "query", query: searchQuery });
        emit({ type: "status", message: "Searching for sources…" });

        // ── Step 2: Perplexity Sonar → find + scrape sources ─────────────────
        const { apiKey: searchKey, model: searchModel } = await getOpenRouterConfig("source_search");

        let count = 0;
        await searchAndScrape({
          essayTopic: searchQuery,
          outlines: [],
          targetCount: 6,
          apiKey: searchKey,
          model: searchModel,
          onSource: (source: GoodSource) => {
            count++;
            emit({ type: "source", source });
          },
        });

        emit({ type: "done", count });

      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Auto-search failed.",
        });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
