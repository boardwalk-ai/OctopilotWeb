import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { getRun, subscribe, type OctoSlidesEvent } from "@/server/octoslides/runs";

export const dynamic = "force-dynamic";

/** Server-sent events for one run: replays everything so far, then streams live. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      const unsubscribe = subscribe(run, (event: OctoSlidesEvent) => {
        // Stays open after "complete": the user can keep editing the deck.
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const keepalive = setInterval(() => send(`: keep-alive\n\n`), 15_000);
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
