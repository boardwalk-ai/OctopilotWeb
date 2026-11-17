import { NextRequest, NextResponse } from "next/server";
import { continueOctoSlidesRun } from "@/server/octoslides/agent";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { claimRun, emit, finishRun, getRun, steerRun } from "@/server/octoslides/runs";

export const dynamic = "force-dynamic";

/**
 * POST { text, target?: { slide, name } }
 * Idle run: starts a change request. Running run: steers it (the designer folds the
 * message into the work in progress at its next step).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = await getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { text?: unknown; target?: { slide?: unknown; name?: unknown }; editor?: unknown; slide?: unknown } | null;
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
  const editorSlide = body?.editor === true ? Number(body.slide) : null;
  if (editorSlide !== null && (!Number.isInteger(editorSlide) || editorSlide < 1 || editorSlide > 500)) return NextResponse.json({ error: "Invalid editor slide." }, { status: 400 });
  if (run.active) {
    if (run.status === "running" && run.deckVersion === 0 && run.steps === 0 && !run.messages.length) {
      return NextResponse.json({ error: "The designer is starting. Try again in a moment." }, { status: 409 });
    }
    const where = target ? `(about slide ${target.slide}, element "${target.name}") ` : editorSlide ? `(in the editor on slide ${editorSlide}) ` : "";
    const { interrupted } = steerRun(run, `${where}${text}`);
    return NextResponse.json({ ok: true, mode: "steer", interrupted }, { status: 202 });
  }
  const claimed = await claimRun(run);
  if (claimed !== true) return NextResponse.json({ error: claimed }, { status: 409 });

  try {
    await continueOctoSlidesRun(run, text, target, editorSlide ?? undefined);
    return NextResponse.json({ ok: true, mode: "turn" }, { status: 202 });
  } catch (error) {
    emit(run, { type: "error", message: error instanceof Error ? error.message : "Could not continue." });
    finishRun(run, "error");
    return NextResponse.json({ error: "Could not continue." }, { status: 500 });
  }
}
