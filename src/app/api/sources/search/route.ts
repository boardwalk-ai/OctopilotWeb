// POST /api/sources/search
//
// Streams validated sources one-by-one as Server-Sent Events.
// Used by auto mode (GhostwriterOrchestrator) and manual mode (ConfigurationView).
// Ghostwriter keeps its own agentic tools — this route is NOT used there.
//
// SSE event shapes:
//   { type: "source", source: GoodSource }   — one per scraped source
//   { type: "done",   count: number }         — stream finished
//   { type: "error",  message: string }       — fatal error

import { NextRequest } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { searchAndScrape, type GoodSource } from "@/server/sources/searchAndScrape";

export const maxDuration = 120; // seconds — Vercel / Next.js route timeout

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let essayTopic: string;
  let outlines: Array<{ type?: string; title: string; description?: string }>;
  let targetCount: number;

  try {
    const body = (await request.json()) as {
      essayTopic?: string;
      outlines?: unknown;
      targetCount?: number;
    };
    essayTopic = (body.essayTopic || "").trim();
    outlines = Array.isArray(body.outlines)
      ? (body.outlines as Array<{ type?: string; title: string; description?: string }>)
      : [];
    targetCount = Math.max(5, Math.min(30, Number(body.targetCount) || 12));
  } catch {
    return new Response('{"error":"Invalid JSON body"}', {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!essayTopic) {
    return new Response('{"error":"essayTopic is required"}', {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { apiKey, model } = await getOpenRouterConfig("source_search");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let count = 0;
      try {
        await searchAndScrape({
          essayTopic,
          outlines,
          targetCount,
          apiKey,
          model,
          onSource: (source: GoodSource) => {
            count++;
            emit({ type: "source", source });
          },
        });
        emit({ type: "done", count });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Source search failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering so events flow immediately
    },
  });
}
