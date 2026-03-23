import { NextRequest, NextResponse } from "next/server";
import { getAdminOverviewPayload } from "@/server/adminOverview";
import { resolveAdminRequestAuth } from "@/server/adminRequestAuth";

export async function GET(request: NextRequest) {
  try {
    const auth = resolveAdminRequestAuth(request);
    const payload = await getAdminOverviewPayload({
      authorization: auth.upstreamAuthorization,
      skipAdminCheck: auth.skipAdminCheck,
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin overview.";
    const status =
      message.includes("Missing authorization") ? 401 : message.includes("agent key") || message.includes("admin access") ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
