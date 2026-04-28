import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { getRun } from "@/server/ghostwriter/agent/runs";

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

  run.pauseRequested = true;
  return NextResponse.json({ ok: true });
}

