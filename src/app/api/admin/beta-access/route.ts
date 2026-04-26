import { NextRequest, NextResponse } from "next/server";
import {
  appendBetaAccessEntry,
  loadBetaAccessList,
  removeBetaAccessEntry,
  SUPPORTED_BETA_FEATURES,
  type BetaFeatureKey,
} from "@/server/betaAccess";
import { requireAdminRequest } from "@/server/routeAuth";

function buildErrorResponse(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;

  try {
    const list = await loadBetaAccessList(auth.authorization);
    return NextResponse.json({ list, supportedFeatures: SUPPORTED_BETA_FEATURES });
  } catch (error) {
    return buildErrorResponse(error, "Failed to load beta access list.");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;

  let body: { email?: string; name?: string; features?: BetaFeatureKey[] };
  try {
    body = (await request.json()) as { email?: string; name?: string; features?: BetaFeatureKey[] };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body?.email || typeof body.email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    const result = await appendBetaAccessEntry(auth.authorization, {
      email: body.email,
      name: typeof body.name === "string" ? body.name : undefined,
      features: Array.isArray(body.features) ? body.features : undefined,
    });

    return NextResponse.json({ list: result.list, added: result.added });
  } catch (error) {
    return buildErrorResponse(error, "Failed to add beta access entry.", 400);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;

  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email query parameter." }, { status: 400 });
  }

  try {
    const list = await removeBetaAccessEntry(auth.authorization, email);
    return NextResponse.json({ list });
  } catch (error) {
    return buildErrorResponse(error, "Failed to remove beta access entry.");
  }
}
