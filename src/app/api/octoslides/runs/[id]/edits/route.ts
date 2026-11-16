import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { applyManualTextEdit } from "@/server/octoslides/manualEdit";
import { claimRun, getRun } from "@/server/octoslides/runs";

export const dynamic = "force-dynamic";

const NAME = /^[^\u0000-\u001f]{1,200}$/;

/** POST { slide, name, text } — replace one element's text directly (no AI). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = await getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { slide?: unknown; name?: unknown; text?: unknown } | null;
  const slide = Number(body?.slide);
  const name = typeof body?.name === "string" ? body.name : "";
  const text = typeof body?.text === "string" ? body.text : null;
  if (!Number.isInteger(slide) || slide < 1 || slide > 500 || !NAME.test(name) || text === null) {
    return NextResponse.json({ error: "Send slide, name and text." }, { status: 400 });
  }
  if (text.length > 5000) return NextResponse.json({ error: "Text is longer than 5,000 characters." }, { status: 400 });
  if (run.deckVersion === 0) return NextResponse.json({ error: "There is no deck to edit yet." }, { status: 409 });
  if (!claimRun(run)) return NextResponse.json({ error: "The designer is still working. Try again when it finishes." }, { status: 409 });

  try {
    await applyManualTextEdit(run, { slide, name, text });
    return NextResponse.json({ ok: true, version: run.deckVersion });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Edit failed." }, { status: 422 });
  }
}
