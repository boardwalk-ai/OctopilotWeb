import { NextRequest } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { encodeSseFrame } from "@/server/slides/agent/events";
import { runSlidesAgent } from "@/server/slides/agent/loop";
import { createDeckRun, emit, finishRun, subscribe } from "@/server/slides/agent/runs";
import { SLIDES_TOOLS } from "@/server/slides/agent/tools/index";

export const dynamic = "force-dynamic";

const KEEPALIVE_INTERVAL_MS = 15_000;

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let body: { instruction?: string; deckId?: string } | null = null;
  try {
    body = (await request.json()) as { instruction?: string; deckId?: string };
  } catch {
    body = null;
  }

  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return new Response(JSON.stringify({ error: "instruction is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authToken = "authorization" in auth ? auth.authorization : "";
  const run = createDeckRun({
    userId: "authed",
    instruction,
    deckId: body?.deckId,
    authToken,
  });

  // Start the driver in the background. Any failures are surfaced as `error`
  // events, then the run is finalized.
  void (async () => {
    try {
      await runSlidesAgent({
        run,
        tools: SLIDES_TOOLS,
        instruction,
      });
    } catch (err) {
      emit(run, { type: "error", message: err instanceof Error ? err.message : String(err) });
      finishRun(run, "error");
    }
  })();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Prologue: expose runId so the client can answer ask_user.
      safeEnqueue(
        encodeSseFrame({
          type: "workflow_step",
          stepId: "run_id",
          status: "done",
          detail: run.runId,
        }),
      );

      const unsubscribe = subscribe(run, (event) => {
        safeEnqueue(encodeSseFrame(event));
        if (event.type === "workflow_complete" || event.type === "error") {
          setTimeout(() => {
            if (closed) return;
            closed = true;
            try {
              controller.close();
            } catch {
              // ignore
            }
          }, 50);
        }
      });

      const keepalive = setInterval(() => {
        safeEnqueue(`: keep-alive ${Date.now()}\n\n`);
      }, KEEPALIVE_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
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

