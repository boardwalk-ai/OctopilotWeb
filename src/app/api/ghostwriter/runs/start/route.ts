import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { createGhostwriterRun } from "@/server/ghostwriter/engine";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const state = createGhostwriterRun({
      prompt: String(body.prompt || ""),
      detectedSettings: typeof body.detectedSettings === "object" && body.detectedSettings !== null
        ? body.detectedSettings as { wordCount?: number; citationStyle?: string }
        : {},
    });
    return NextResponse.json(state, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start Ghostwriter run." },
      { status: 500 }
    );
  }
}
