import { NextRequest, NextResponse } from "next/server";
import { getGhostwriterClientIp, isGhostwriterAllowedRequest } from "@/server/ghostwriterAccess";

export async function GET(request: NextRequest) {
  const clientIp = getGhostwriterClientIp(request);
  const allowed = isGhostwriterAllowedRequest(request);

  return NextResponse.json(
    {
      allowed,
      clientIp,
    },
    { status: 200 }
  );
}
