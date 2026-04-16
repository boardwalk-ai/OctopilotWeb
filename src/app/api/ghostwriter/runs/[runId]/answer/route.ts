import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { answerGhostwriterRun } from "@/server/ghostwriter/engine";
import type { GhostwriterQuestionField } from "@/lib/ghostwriterTypes";

export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { runId } = await context.params;
    const body = await request.json();
    const state = answerGhostwriterRun(runId, {
      field: body.field as GhostwriterQuestionField,
      value: body.value as string | number,
    });
    return NextResponse.json(state, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to answer Ghostwriter question." },
      { status: 500 }
    );
  }
}
