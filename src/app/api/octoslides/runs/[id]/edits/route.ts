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

  const body = (await request.json().catch(() => null)) as { slide?: unknown; name?: unknown; text?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; rot?: unknown; fill?: unknown; animation?: unknown; deleted?: unknown } | null;
  const slide = Number(body?.slide);
  const name = typeof body?.name === "string" ? body.name : "";
  const text = typeof body?.text === "string" ? body.text : null;
  const element = text === null;
  if (!Number.isInteger(slide) || slide < 1 || slide > 500 || !NAME.test(name)) {
    return NextResponse.json({ error: "Send a valid slide and element name." }, { status: 400 });
  }
  if (text !== null && text.length > 5000) return NextResponse.json({ error: "Text is longer than 5,000 characters." }, { status: 400 });
  const geometry = Object.fromEntries((["x", "y", "w", "h", "rot"] as const).filter((key) => body?.[key] !== undefined).map((key) => [key, Number(body?.[key])]));
  if (element && (Object.values(geometry).some((value) => !Number.isFinite(value)) ||
    ["x", "y", "w", "h"].some((key) => key in geometry && (geometry[key] < 0 || geometry[key] > 1)) ||
    ("w" in geometry && geometry.w <= 0) || ("h" in geometry && geometry.h <= 0) ||
    ("rot" in geometry && (geometry.rot < -360 || geometry.rot > 360)) ||
    (body?.fill !== undefined && (typeof body.fill !== "string" || !/^[0-9a-fA-F]{6}$/.test(body.fill))) ||
    (body?.animation !== undefined && !["none", "fade", "rise", "fly", "wipe", "zoom", "pulse", "spin", "grow", "fadeOut"].includes(String(body.animation))) ||
    (body?.deleted !== undefined && typeof body.deleted !== "boolean"))) {
    return NextResponse.json({ error: "Invalid position, size, rotation or color." }, { status: 400 });
  }
  if (element && !Object.keys(geometry).length && body?.fill === undefined && body?.animation === undefined && body?.deleted !== true) return NextResponse.json({ error: "No edit supplied." }, { status: 400 });
  if (run.deckVersion === 0) return NextResponse.json({ error: "There is no deck to edit yet." }, { status: 409 });
  if (!claimRun(run)) return NextResponse.json({ error: "The designer is still working. Try again when it finishes." }, { status: 409 });

  try {
    await applyManualTextEdit(run, text !== null ? { slide, name, text } : { slide, name, ...geometry, ...(typeof body?.fill === "string" ? { fill: body.fill.toUpperCase() } : {}), ...(typeof body?.animation === "string" ? { animation: body.animation } : {}), ...(body?.deleted === true ? { deleted: true } : {}) });
    return NextResponse.json({ ok: true, version: run.deckVersion });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Edit failed." }, { status: 422 });
  }
}
