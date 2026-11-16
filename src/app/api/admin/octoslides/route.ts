import { NextRequest, NextResponse } from "next/server";
import { readAdminIdentity } from "@/server/adminIdentity";
import { getWatermarkPolicy, setWatermarkPolicy } from "@/server/octoslides/stamp";
import { requireAdminRequest } from "@/server/routeAuth";

export const dynamic = "force-dynamic";

/** GET / PUT the OctoSlides watermark policy: { freeWatermark, exemptEmails }. */
export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ policy: await getWatermarkPolicy(true) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { freeWatermark?: unknown; exemptEmails?: unknown } | null;
  if (typeof body?.freeWatermark !== "boolean" || !Array.isArray(body.exemptEmails)) {
    return NextResponse.json({ error: "Send freeWatermark (boolean) and exemptEmails (array)." }, { status: 400 });
  }
  try {
    const policy = await setWatermarkPolicy(
      { freeWatermark: body.freeWatermark, exemptEmails: body.exemptEmails.filter((e): e is string => typeof e === "string") },
      readAdminIdentity(request.headers.get("authorization") ?? ""),
    );
    return NextResponse.json({ policy });
  } catch (error) {
    console.error("[OctoSlides] policy update failed:", error);
    return NextResponse.json({ error: "Could not save the policy." }, { status: 500 });
  }
}
