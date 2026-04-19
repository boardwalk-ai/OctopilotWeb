// POST /api/ghostwriter/start
//
// Milestone 1: accepts a draft payload, allocates an AgentRun, and kicks off a
// dummy background "agent" that emits a small scripted sequence of events.
// The point of this milestone is to prove that start → SSE stream → answer →
// done round-trips cleanly before we wire in OpenRouter tool-use in milestone
// 2. See docs/AGENTIC_GHOSTWRITER.md §12.
//
// Response: `{ runId: string }`. The client then opens an EventSource against
// `/api/ghostwriter/run?runId=...` and POSTs answers to
// `/api/ghostwriter/answer`.

import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import {
  AgentRun,
  createRun,
  emit,
  finishRun,
  waitForAnswer,
} from "@/server/ghostwriter/agent/runs";

// Scripted stand-in for the real agent loop. Emits a few step_* events, asks
// one question, then finishes. Runs after the POST response returns so the
// client has time to open the SSE stream; the runs store buffers anything
// that's emitted before the subscriber connects.
async function runDummyAgent(run: AgentRun): Promise<void> {
  try {
    run.status = "running";

    emit(run, { type: "thought", text: "Spinning up dummy agent loop..." });
    emit(run, {
      type: "step_start",
      id: "dummy-1",
      title: "Analyzing draft",
      tool: "plan_essay",
    });
    await sleep(400);
    emit(run, { type: "step_done", id: "dummy-1", summary: "Plan drafted." });

    run.status = "waiting_for_user";
    emit(run, {
      type: "question",
      field: "dummyChoice",
      question: "This is the scaffolding check. Pick anything to continue.",
      suggestions: ["Option A", "Option B"],
    });

    const answer = await waitForAnswer(run, "dummyChoice", 30 * 60 * 1000);
    run.status = "running";
    emit(run, { type: "thought", text: `User picked: ${String(answer)}. Wrapping up.` });

    emit(run, {
      type: "step_start",
      id: "dummy-2",
      title: "Finalizing (dummy)",
      tool: "finalize_export",
    });
    await sleep(300);
    emit(run, { type: "step_done", id: "dummy-2" });

    emit(run, { type: "done", exportDoc: null });
    finishRun(run, "finished");
  } catch (err) {
    emit(run, {
      type: "fatal",
      error: err instanceof Error ? err.message : String(err),
    });
    finishRun(run, "error");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const draft =
    body && typeof body === "object" && "draft" in body
      ? ((body as { draft: unknown }).draft as Record<string, unknown>)
      : {};

  const run = createRun(draft);

  // Fire and forget — the agent drives itself via the runs event bus. Using
  // `void` here is deliberate: we don't want to block the HTTP response on the
  // full agent execution. Unhandled rejections are caught inside the runner.
  void runDummyAgent(run);

  return NextResponse.json({ runId: run.id });
}
