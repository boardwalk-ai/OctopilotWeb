// POST /api/ghostwriter/cancel
//
// Allows the client to abort an in-flight agent run. The loop checks
// `run.status === "cancelled"` at the top of each iteration and exits
// cleanly. Any `waitForAnswer` promise that's pending is rejected by
// `finishRun`, so the loop never hangs after cancel.
//
// Body: { runId: string }
// Response: 200 { ok: true } | 404 { error } | 409 { error }

import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { getRun, finishRun, emit } from "@/server/ghostwriter/agent/runs";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const runId =
    body && typeof body === "object" && "runId" in body
      ? String((body as { runId: unknown }).runId || "")
      : "";

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.finished) {
    return NextResponse.json({ error: "Run already finished" }, { status: 409 });
  }

  emit(run, { type: "fatal", error: "Run cancelled by user." });
  finishRun(run, "cancelled");

  return NextResponse.json({ ok: true });
}
