// POST /api/ghostwriter/answer
//
// Resolves an outstanding `ask_user` tool call on a paused agent run.
// Body: `{ runId: string, field: string, value: unknown }`.
//
// Returns 404 if the run doesn't exist, 409 if no question is pending for the
// given field (the client raced ahead or answered twice). On success the
// agent loop's `waitForAnswer(field)` promise resolves and the loop resumes
// at its next `openRouter.chat(...)` call — all of which the client observes
// via the existing SSE stream.

import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { getRun, resolveAnswer } from "@/server/ghostwriter/agent/runs";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let body: { runId?: string; field?: string; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const runId = typeof body.runId === "string" ? body.runId : "";
  const field = typeof body.field === "string" ? body.field : "";
  if (!runId || !field) {
    return NextResponse.json(
      { error: "runId and field are required" },
      { status: 400 }
    );
  }

  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const resolved = resolveAnswer(run, field, body.value);
  if (!resolved) {
    return NextResponse.json(
      { error: `No pending question for field "${field}"` },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
