import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { applyMarks } from "@/server/octoslides/marks";
import { claimRun, emit, finishRun, getRun } from "@/server/octoslides/runs";
import { runInSandbox } from "@/server/octoslides/sandbox";
import { watermarkState } from "@/server/octoslides/stamp";

export const dynamic = "force-dynamic";

/** POST { enabled } — Pro (or admin-exempt) owners switch the Octopilot AI badge on or off. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = await getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "Send enabled: true or false." }, { status: 400 });
  const state = await watermarkState(run);
  if (!state.canToggle) {
    return NextResponse.json({ error: "The Octopilot AI badge stays on Free plan decks. Upgrade to Pro to remove it." }, { status: 403 });
  }
  if (run.deckVersion === 0) {
    run.watermarkOptOut = !body.enabled;
    return NextResponse.json({ ok: true });
  }
  const claimed = await claimRun(run);
  if (claimed !== true) return NextResponse.json({ error: claimed }, { status: 409 });

  try {
    run.watermarkOptOut = !body.enabled;
    await applyMarks(run);
    run.deckVersion += 1;
    const render = await runInSandbox(run.dir, ["deck-render", "100"], { timeoutMs: 120_000, memoryMb: 1536, cpus: 2 });
    if (render.exitCode === 0 && !render.timedOut) {
      const slides = render.stdout.split("\n").map((l) => l.match(/^slide-(\d+)\.png$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
      run.renderedVersion = run.deckVersion;
      if (run.lastValidatedVersion === run.deckVersion - 1) run.lastValidatedVersion = run.deckVersion;
      emit(run, { type: "slides_rendered", slides, version: run.deckVersion });
    }
    return NextResponse.json({ ok: true });
  } finally {
    finishRun(run, "idle");
  }
}
