import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { getRun } from "@/server/octoslides/runs";
import { stampDeckBuffer, watermarkState } from "@/server/octoslides/stamp";

export const dynamic = "force-dynamic";

/**
 * GET .../files/deck.pptx          the current deck
 * GET .../files/render/slide-3.png  a rendered preview
 * GET .../files/layout.json         element boxes + text, for click-to-edit
 * Only these shapes are served, and only to the run's owner.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const { id, path } = await params;
  const run = await getRun(id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const rel = path.join("/");
  let file: string;
  let type: string;
  let disposition: string | undefined;
  if (rel === "deck.pptx") {
    file = join(run.dir, "out", "deck.pptx");
    type = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    disposition = `attachment; filename="octoslides-${run.runId.slice(0, 8)}.pptx"`;
  } else if (rel === "layout.json") {
    file = join(run.dir, "out", "layout.json");
    type = "application/json";
  } else if (/^render\/slide-\d{1,3}\.png$/.test(rel)) {
    file = join(run.dir, "out", rel);
    type = "image/png";
  } else {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let data: Buffer | null = await readFile(file).catch(() => null);
  if (!data) return NextResponse.json({ error: "Not built yet." }, { status: 404 });
  if (rel === "deck.pptx") {
    // Marks are re-applied on every download, whatever happened to the file in the workspace.
    const state = await watermarkState(run);
    data = await stampDeckBuffer(data, { watermark: state.enabled, deckId: run.runId });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      ...(disposition ? { "Content-Disposition": disposition } : {}),
    },
  });
}
