import { NextRequest, NextResponse } from "next/server";
import { continueOctoSlidesRun } from "@/server/octoslides/agent";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { claimRun, emit, finishRun, getRun } from "@/server/octoslides/runs";

export const dynamic = "force-dynamic";

/** POST { text, target?: { slide, name } } — ask the designer for a change to the deck. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { text?: unknown; target?: { slide?: unknown; name?: unknown } } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "The request is longer than 4,000 characters." }, { status: 400 });
  let target: { slide: number; name: string } | undefined;
  if (body?.target) {
    const slide = Number(body.target.slide);
    const name = typeof body.target.name === "string" ? body.target.name.slice(0, 200) : "";
    if (!Number.isInteger(slide) || slide < 1 || !name) return NextResponse.json({ error: "Invalid target." }, { status: 400 });
    target = { slide, name };
  }
  if (!claimRun(run)) return NextResponse.json({ error: "The designer is still working. Wait for it to finish." }, { status: 409 });

  try {
    await continueOctoSlidesRun(run, text, target);
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    emit(run, { type: "error", message: error instanceof Error ? error.message : "Could not continue." });
    finishRun(run, "error");
    return NextResponse.json({ error: "Could not continue." }, { status: 500 });
  }
}
