import { NextRequest, NextResponse } from "next/server";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { deleteRun } from "@/server/octoslides/runs";

export const dynamic = "force-dynamic";

/** DELETE — remove a deck and its files for good. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  const ok = await deleteRun((await params).id, auth.user.id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Deck not found." }, { status: 404 });
}
