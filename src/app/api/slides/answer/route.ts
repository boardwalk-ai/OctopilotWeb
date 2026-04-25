import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { getDeckRun, resolveAnswer } from "@/server/slides/agent/runs";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let body: { runId?: string; field?: string; value?: unknown };
  try {
    body = (await request.json()) as { runId?: string; field?: string; value?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const runId = typeof body.runId === "string" ? body.runId : "";
  const field = typeof body.field === "string" ? body.field : "";
  if (!runId || !field) {
    return NextResponse.json({ error: "runId and field are required" }, { status: 400 });
  }

  const run = getDeckRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const resolved = resolveAnswer(run, field, body.value);
  if (!resolved) {
    return NextResponse.json({ error: `No pending question for field "${field}"` }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

