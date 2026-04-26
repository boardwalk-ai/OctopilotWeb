import { NextRequest, NextResponse } from "next/server";
import { fetchBetaAccessForEmail } from "@/server/betaAccess";
import { getApiBaseUrl } from "@/server/backendConfig";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

type MePayload = {
  email?: string | null;
  user?: { email?: string | null } | null;
};

async function fetchAuthenticatedEmail(authorization: string): Promise<string | null> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as MePayload;
    const email = payload?.email ?? payload?.user?.email ?? null;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  const email = await fetchAuthenticatedEmail(auth.authorization);
  if (!email) {
    return NextResponse.json({
      allowed: false,
      features: { ghostwriter: false, octopilotSlides: false },
    });
  }

  const result = await fetchBetaAccessForEmail(email);
  return NextResponse.json({
    email,
    allowed: result.allowed,
    features: result.features,
  });
}
