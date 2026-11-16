import { NextRequest, NextResponse } from "next/server";
import { startOctoSlidesRun } from "@/server/octoslides/agent";
import { requireOctoSlidesUser } from "@/server/octoslides/auth";
import { ownsDocument } from "@/server/octoslides/dataTools";
import { createRun, deleteRun, listRuns } from "@/server/octoslides/runs";
import { isProPlan, resolveDocumentUser } from "@/server/documentUser";
import { saveUploadedSources, validateUploadFiles } from "@/server/octoslides/attachments";

export const dynamic = "force-dynamic";

/** GET -> this user's decks still on the server (newest first), to reopen after a reload. */
export async function GET(request: NextRequest) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ runs: await listRuns(auth.user.id) });
}

/** POST { prompt, documentId? } -> { runId }. Then stream GET /api/octoslides/runs/<runId>/events. */
export async function POST(request: NextRequest) {
  const auth = await requireOctoSlidesUser(request);
  if ("response" in auth) return auth.response;

  const multipart = request.headers.get("content-type")?.includes("multipart/form-data") ?? false;
  const form = multipart ? await request.formData().catch(() => null) : null;
  const body = multipart ? { prompt: form?.get("prompt"), documentId: form?.get("documentId") }
    : (await request.json().catch(() => null)) as { prompt?: unknown; documentId?: unknown } | null;
  const files = form?.getAll("files").filter((item): item is File => item instanceof File) ?? [];
  const uploadError = validateUploadFiles(files);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 400 });
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "Describe the deck you want." }, { status: 400 });
  if (prompt.length > 20_000) return NextResponse.json({ error: "The request is longer than 20,000 characters." }, { status: 400 });

  // The Octopilot users.id, for the document tools. Optional: decks work without it.
  const docUser = await resolveDocumentUser(request).catch(() => null);
  const resolved = docUser && !("response" in docUser) ? docUser : null;
  const dataUserId = resolved?.userId ?? null;
  const isPro = resolved ? isProPlan(resolved.plan, resolved.subscriptionStatus) : false;

  let attached: { id: string; title: string } | null = null;
  if (typeof body?.documentId === "string" && body.documentId) {
    attached = dataUserId ? await ownsDocument(dataUserId, body.documentId) : null;
    if (!attached) return NextResponse.json({ error: "That document was not found in your account." }, { status: 404 });
  }

  let createdRunId: string | null = null;
  try {
    const run = await createRun(auth.user.id, prompt, { dataUserId, email: auth.user.email, isPro });
    createdRunId = run.runId;
    const sources = await saveUploadedSources(run, files);
    await startOctoSlidesRun(run, attached, sources);
    return NextResponse.json({ runId: run.runId }, { status: 201 });
  } catch (error) {
    if (createdRunId) await deleteRun(createdRunId, auth.user.id).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start." }, { status: createdRunId ? 400 : 429 });
  }
}
