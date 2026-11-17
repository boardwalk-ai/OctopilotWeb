import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { applyManualEdits, type ManualEdit } from "@/server/octoslides/manualEdit";
import { claimRun, getRun } from "@/server/octoslides/runs";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

const NAME = /^[^\u0000-\u001f]{1,200}$/;
const TRANSITIONS = ["fade", "push", "wipe", "dissolve", "zoom", "morph", "none"] as const;
const EFFECTS = ["appear", "fade", "rise", "fly", "wipe", "zoom", "fadeOut", "flyOut", "wipeOut", "zoomOut", "disappear", "pulse", "spin", "grow", "transparency"];
const MAX_BATCH = 60;

type Body = { slide?: unknown; name?: unknown; text?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; rot?: unknown; fill?: unknown; animation?: unknown; animations?: unknown; format?: unknown; transition?: unknown; add?: unknown; deleted?: unknown };

/** One edit from the client, checked; a string is the reason it was refused. */
function parseEdit(body: Body | null): ManualEdit | string {
  const slide = Number(body?.slide);
  const name = typeof body?.name === "string" ? body.name : "";
  const text = typeof body?.text === "string" ? body.text : null;
  const transition = typeof body?.transition === "string" ? body.transition : null;
  const add = body?.add;
  if (!Number.isInteger(slide) || slide < 1 || slide > 500) return "Send a valid slide number.";

  if (add !== undefined) {
    if (add !== "text" && add !== "shape") return "Can add text or shape.";
    // the editor names new elements itself, so they can be edited before they are saved
    const own = typeof body?.name === "string" && new RegExp(`^User ${add} [0-9a-f]{8}$`).test(body.name) ? body.name : null;
    return { slide, add: true, name: own ?? `User ${add} ${randomUUID().slice(0, 8)}`, kind: add, text: add === "text" ? "Text" : "", x: 0.25, y: 0.3, w: add === "text" ? 0.5 : 0.25, h: add === "text" ? 0.16 : 0.2, fill: "4472C4" };
  }
  if (transition !== null) {
    if (!(TRANSITIONS as readonly string[]).includes(transition)) return "Invalid transition.";
    return { slide, transition: transition as (typeof TRANSITIONS)[number] };
  }
  if (!NAME.test(name)) return "Send a valid element name.";
  if (text !== null) {
    if (text.length > 5000) return "Text is longer than 5,000 characters.";
    return { slide, name, text };
  }

  const format = body?.format && typeof body.format === "object" && !Array.isArray(body.format) ? (body.format as Record<string, unknown>) : null;
  if (
    body?.format !== undefined &&
    (!format ||
      Object.keys(format).some((key) => !["bold", "italic", "underline", "align", "color", "size", "font"].includes(key)) ||
      ["bold", "italic", "underline"].some((key) => format[key] !== undefined && typeof format[key] !== "boolean") ||
      (format.align !== undefined && !["left", "center", "right", "justify"].includes(String(format.align))) ||
      (format.color !== undefined && (typeof format.color !== "string" || !/^[0-9a-fA-F]{6}$/.test(format.color))) ||
      (format.size !== undefined && (typeof format.size !== "number" || format.size < 6 || format.size > 200)) ||
      (format.font !== undefined && (typeof format.font !== "string" || !/^[a-zA-Z0-9 ,.-]{1,80}$/.test(format.font))))
  )
    return "Invalid text format.";
  const animations = body?.animations;
  if (
    animations !== undefined &&
    (!Array.isArray(animations) ||
      animations.length > 6 ||
      animations.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          !EFFECTS.includes(String(item.effect)) ||
          (item.trigger !== undefined && !["onClick", "withPrevious", "afterPrevious"].includes(String(item.trigger))) ||
          (item.durationMs !== undefined && (typeof item.durationMs !== "number" || item.durationMs < 100 || item.durationMs > 10000)) ||
          (item.delayMs !== undefined && (typeof item.delayMs !== "number" || item.delayMs < 0 || item.delayMs > 10000)),
      ))
  )
    return "Invalid animation.";
  const geometry = Object.fromEntries((["x", "y", "w", "h", "rot"] as const).filter((key) => body?.[key] !== undefined).map((key) => [key, Number(body?.[key])]));
  if (
    Object.values(geometry).some((value) => !Number.isFinite(value)) ||
    ["x", "y", "w", "h"].some((key) => key in geometry && (geometry[key] < 0 || geometry[key] > 1)) ||
    ("w" in geometry && geometry.w <= 0) ||
    ("h" in geometry && geometry.h <= 0) ||
    ("rot" in geometry && (geometry.rot < -360 || geometry.rot > 360)) ||
    (body?.fill !== undefined && (typeof body.fill !== "string" || !/^[0-9a-fA-F]{6}$/.test(body.fill))) ||
    (body?.animation !== undefined && !["none", "fade", "rise", "fly", "wipe", "zoom", "pulse", "spin", "grow", "fadeOut"].includes(String(body.animation))) ||
    (body?.deleted !== undefined && typeof body.deleted !== "boolean")
  )
    return "Invalid position, size, rotation or color.";
  if (!Object.keys(geometry).length && body?.fill === undefined && body?.animation === undefined && animations === undefined && format === null && body?.deleted !== true) return "No edit supplied.";
  return {
    slide,
    name,
    ...geometry,
    ...(typeof body?.fill === "string" ? { fill: body.fill.toUpperCase() } : {}),
    ...(typeof body?.animation === "string" ? { animation: body.animation } : {}),
    ...(Array.isArray(animations) ? { animations } : {}),
    ...(format ? { format } : {}),
    ...(body?.deleted === true ? { deleted: true } : {}),
  };
}

/**
 * POST one edit ({ slide, name, text | x/y/w/h/rot | fill | format | animations | deleted },
 * { slide, transition } or { slide, add }) or a batch ({ edits: [...] }). A batch is applied
 * with a single rebuild, so many small edits cost one save. No AI is involved.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = await getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as (Body & { edits?: unknown }) | null;
  const raw = Array.isArray(body?.edits) ? (body.edits as Body[]) : [body];
  if (!raw.length || raw.length > MAX_BATCH) return NextResponse.json({ error: `Send between 1 and ${MAX_BATCH} edits.` }, { status: 400 });
  const edits: ManualEdit[] = [];
  for (const item of raw) {
    const parsed = parseEdit(item && typeof item === "object" ? item : null);
    if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
    edits.push(parsed);
  }
  if (run.deckVersion === 0) return NextResponse.json({ error: "There is no deck to edit yet." }, { status: 409 });
  const claimed = await claimRun(run);
  if (claimed !== true) return NextResponse.json({ error: claimed }, { status: 409 });

  try {
    await applyManualEdits(run, edits);
    return NextResponse.json({ ok: true, version: run.deckVersion });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Edit failed." }, { status: 422 });
  }
}
