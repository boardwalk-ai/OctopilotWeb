import { NextRequest } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { renderDeckToPptxBuffer } from "@/server/slides/export/pptxRenderer";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  let body: { slides?: unknown; deckTitle?: string } | null = null;
  try {
    body = (await request.json()) as { slides?: unknown; deckTitle?: string };
  } catch {
    body = null;
  }

  const slides = Array.isArray(body?.slides) ? (body!.slides as unknown[]) : null;
  if (!slides) {
    return new Response(JSON.stringify({ error: "slides[] is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // We trust the client shape for MVP export; Phase 2 will load from server state.
  const buffer = await renderDeckToPptxBuffer({
    slides: slides as any,
    deckTitle: typeof body?.deckTitle === "string" ? body.deckTitle : undefined,
  });

  const filename = `${(body?.deckTitle || "octopilotslides").replace(/[^\w-]+/g, "_")}.pptx`;
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

