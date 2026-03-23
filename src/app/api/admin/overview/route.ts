import { NextRequest, NextResponse } from "next/server";
import { getAdminOverviewPayload } from "@/server/adminOverview";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json({ error: "Missing authorization header." }, { status: 401 });
  }

  try {
    const payload = await getAdminOverviewPayload(authorization);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin overview.";
    const status = message.includes("admin access") ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
