import { NextRequest, NextResponse } from "next/server";
import { resolveDocumentUser } from "@/server/documentUser";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { activeFacts, forgetFact } from "@/server/octoslides/memory";

export const dynamic = "force-dynamic";

async function userId(request: NextRequest) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return { response: auth.response };
  const doc = await resolveDocumentUser(request);
  if ("response" in doc) return { response: doc.response };
  return { id: doc.userId };
}

/** GET -> what OctoSlides remembers about the caller. */
export async function GET(request: NextRequest) {
  const u = await userId(request);
  if ("response" in u) return u.response;
  return NextResponse.json({ facts: await activeFacts(u.id) });
}

/** DELETE ?id=<fact id> -> forget one fact. */
export async function DELETE(request: NextRequest) {
  const u = await userId(request);
  if ("response" in u) return u.response;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const ok = await forgetFact(u.id, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
