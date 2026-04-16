import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { advanceGhostwriterRunWithTool } from "@/server/ghostwriter/engine";
import type { GhostwriterToolName } from "@/lib/ghostwriterTypes";

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { runId } = await context.params;
    const body = await request.json();
    const state = advanceGhostwriterRunWithTool(runId, {
      toolName: body.toolName as GhostwriterToolName,
      result: body.result,
    });
    return NextResponse.json(state, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to advance Ghostwriter run." },
      { status: 500 }
    );
  }
}
