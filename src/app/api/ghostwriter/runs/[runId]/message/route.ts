// POST /api/ghostwriter/runs/[runId]/message
//
// Delivers a free-form user chat message to a running agent loop.
// Unlike the /answer route (which resolves a specific ask_user field),
// this feeds the conversational message queue so the AI can reply naturally.

import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { getRun, deliverUserMessage, emit } from "@/server/ghostwriter/agent/runs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  const { runId } = await context.params;
  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
  if (run.finished) {
    return NextResponse.json({ error: "Run has already finished." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  // Echo back to the SSE stream so the UI can render the user bubble without
  // waiting for a round-trip.
  emit(run, { type: "user_message", text });

  deliverUserMessage(run, text);
  return NextResponse.json({ ok: true });
}
