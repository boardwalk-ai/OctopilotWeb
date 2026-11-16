import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { getRun, stopRun } from "@/server/octoslides/runs";

export const dynamic = "force-dynamic";

/** POST — stop the designer now. The deck stays as it was after the last build. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = await getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (!run.active) return NextResponse.json({ ok: true, alreadyIdle: true });
  stopRun(run);
  return NextResponse.json({ ok: true });
}
