import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { applyManualTextEdit } from "@/server/octoslides/manualEdit";
import { claimRun, getRun } from "@/server/octoslides/runs";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const NAME = /^[^\u0000-\u001f]{1,200}$/;

/** POST { slide, name, text } — replace one element's text directly (no AI). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = await getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { slide?: unknown; name?: unknown; text?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; rot?: unknown; fill?: unknown; animation?: unknown; animations?: unknown; format?: unknown; transition?: unknown; add?: unknown; deleted?: unknown } | null;
  const slide = Number(body?.slide);
  const name = typeof body?.name === "string" ? body.name : "";
  const text = typeof body?.text === "string" ? body.text : null;
  const transition = typeof body?.transition === "string" ? body.transition : null;
  const element = text === null;
  if (!Number.isInteger(slide) || slide < 1 || slide > 500 || (transition === null && body?.add !== "text" && body?.add !== "shape" && !NAME.test(name))) {
    return NextResponse.json({ error: "Send a valid slide and element name." }, { status: 400 });
  }
  if (transition !== null && !["fade", "push", "wipe", "dissolve", "zoom", "morph", "none"].includes(transition)) return NextResponse.json({ error: "Invalid transition." }, { status: 400 });
  if (body?.add !== undefined && !["text", "shape"].includes(String(body.add))) return NextResponse.json({ error: "Can add text or shape." }, { status: 400 });
  const format = body?.format && typeof body.format === "object" && !Array.isArray(body.format) ? body.format as Record<string, unknown> : null;
  if (body?.format !== undefined && (!format || Object.keys(format).some((key) => !["bold", "italic", "underline", "align", "color", "size", "font"].includes(key)) ||
    ["bold", "italic", "underline"].some((key) => format[key] !== undefined && typeof format[key] !== "boolean") ||
    (format.align !== undefined && !["left", "center", "right", "justify"].includes(String(format.align))) ||
    (format.color !== undefined && (typeof format.color !== "string" || !/^[0-9a-fA-F]{6}$/.test(format.color))) ||
    (format.size !== undefined && (typeof format.size !== "number" || format.size < 6 || format.size > 200)) ||
    (format.font !== undefined && (typeof format.font !== "string" || !/^[a-zA-Z0-9 ,.-]{1,80}$/.test(format.font))))) return NextResponse.json({ error: "Invalid text format." }, { status: 400 });
  const animations = body?.animations;
  if (animations !== undefined && (!Array.isArray(animations) || animations.length > 6 || animations.some((item) => !item || typeof item !== "object" ||
    !["appear", "fade", "rise", "fly", "wipe", "zoom", "fadeOut", "flyOut", "wipeOut", "zoomOut", "disappear", "pulse", "spin", "grow", "transparency"].includes(String(item.effect)) ||
    (item.trigger !== undefined && !["onClick", "withPrevious", "afterPrevious"].includes(String(item.trigger))) ||
    (item.durationMs !== undefined && (typeof item.durationMs !== "number" || item.durationMs < 100 || item.durationMs > 10000)) ||
    (item.delayMs !== undefined && (typeof item.delayMs !== "number" || item.delayMs < 0 || item.delayMs > 10000))))) return NextResponse.json({ error: "Invalid animation." }, { status: 400 });
  if (text !== null && text.length > 5000) return NextResponse.json({ error: "Text is longer than 5,000 characters." }, { status: 400 });
  const geometry = Object.fromEntries((["x", "y", "w", "h", "rot"] as const).filter((key) => body?.[key] !== undefined).map((key) => [key, Number(body?.[key])]));
  if (transition === null && body?.add === undefined && element && (Object.values(geometry).some((value) => !Number.isFinite(value)) ||
    ["x", "y", "w", "h"].some((key) => key in geometry && (geometry[key] < 0 || geometry[key] > 1)) ||
    ("w" in geometry && geometry.w <= 0) || ("h" in geometry && geometry.h <= 0) ||
    ("rot" in geometry && (geometry.rot < -360 || geometry.rot > 360)) ||
    (body?.fill !== undefined && (typeof body.fill !== "string" || !/^[0-9a-fA-F]{6}$/.test(body.fill))) ||
    (body?.animation !== undefined && !["none", "fade", "rise", "fly", "wipe", "zoom", "pulse", "spin", "grow", "fadeOut"].includes(String(body.animation))) ||
    (body?.deleted !== undefined && typeof body.deleted !== "boolean"))) {
    return NextResponse.json({ error: "Invalid position, size, rotation or color." }, { status: 400 });
  }
  if (transition === null && body?.add === undefined && element && !Object.keys(geometry).length && body?.fill === undefined && body?.animation === undefined && animations === undefined && format === null && body?.deleted !== true) return NextResponse.json({ error: "No edit supplied." }, { status: 400 });
  if (run.deckVersion === 0) return NextResponse.json({ error: "There is no deck to edit yet." }, { status: 409 });
  if (!claimRun(run)) return NextResponse.json({ error: "The designer is still working. Try again when it finishes." }, { status: 409 });

  try {
    await applyManualTextEdit(run, body?.add === "text" || body?.add === "shape" ? { slide, add: true, name: `User ${body.add} ${randomUUID().slice(0, 8)}`, kind: body.add, text: body.add === "text" ? "Text" : "", x: 0.25, y: 0.3, w: body.add === "text" ? 0.5 : 0.25, h: body.add === "text" ? 0.16 : 0.2, fill: "4472C4" }
      : transition !== null ? { slide, transition: transition as "fade" | "push" | "wipe" | "dissolve" | "zoom" | "morph" | "none" }
      : text !== null ? { slide, name, text } : { slide, name, ...geometry, ...(typeof body?.fill === "string" ? { fill: body.fill.toUpperCase() } : {}), ...(typeof body?.animation === "string" ? { animation: body.animation } : {}), ...(Array.isArray(animations) ? { animations } : {}), ...(format ? { format } : {}), ...(body?.deleted === true ? { deleted: true } : {}) });
    return NextResponse.json({ ok: true, version: run.deckVersion });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Edit failed." }, { status: 422 });
  }
}
