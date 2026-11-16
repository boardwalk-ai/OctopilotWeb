import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { getRun } from "@/server/octoslides/runs";

export const dynamic = "force-dynamic";

/** POST { answer } — replies to the agent's ask_user question. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const run = getRun((await params).id, auth.user.id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (!run.pendingAnswer) return NextResponse.json({ error: "The designer is not waiting for an answer." }, { status: 409 });

  const body = (await request.json().catch(() => null)) as { answer?: unknown } | null;
  const answer = typeof body?.answer === "string" ? body.answer.trim().slice(0, 4000) : "";
  if (!answer) return NextResponse.json({ error: "Answer is empty." }, { status: 400 });

  run.pendingAnswer(answer);
  return NextResponse.json({ ok: true });
}
