// GET /api/ghostwriter/run?runId=...
//
// Server-Sent Events stream for a live agent run. The client opens this with
// `new EventSource(...)` and consumes events defined in
// `src/server/ghostwriter/agent/events.ts`. The run itself is driven by a
// background task started from `/api/ghostwriter/start`; this route is a
// pure pipe from the runs event bus to the client.
//
// Keep-alive comments (`:\n\n`) are sent every 15s so proxies and load
// balancers don't drop idle connections during long waits (e.g. while the
// agent is paused on `ask_user`).

import { NextRequest } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { encodeSseFrame } from "@/server/ghostwriter/agent/events";
import { getRun, subscribe } from "@/server/ghostwriter/agent/runs";

// Disable Next's response caching for SSE — the stream must be flushed live.
export const dynamic = "force-dynamic";

const KEEPALIVE_INTERVAL_MS = 15_000;

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return new Response(JSON.stringify({ error: "runId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const run = getRun(runId);
  if (!run) {
    return new Response(JSON.stringify({ error: "Run not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller closed underneath us (client disconnected). Swallow.
          closed = true;
        }
      };

      // Drain buffered events and then forward live events as they arrive.
      const unsubscribe = subscribe(run, (event) => {
        safeEnqueue(encodeSseFrame(event));
        if (event.type === "done" || event.type === "fatal") {
          // Give the client a tick to process the terminal event, then close.
          setTimeout(() => {
            if (closed) return;
            closed = true;
            try {
              controller.close();
            } catch {
              // Already closed.
            }
          }, 50);
        }
      });

      // SSE keep-alive. Comments (lines starting with `:`) are ignored by the
      // EventSource parser but reset idle-connection timers on proxies.
      const keepalive = setInterval(() => {
        safeEnqueue(`: keep-alive ${Date.now()}\n\n`);
      }, KEEPALIVE_INTERVAL_MS);

      // Abort path: the client closed the tab / navigated away.
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
