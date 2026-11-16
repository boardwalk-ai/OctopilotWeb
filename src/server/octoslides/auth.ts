import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/server/backendConfig";
import { fetchBetaAccessForEmail } from "@/server/betaAccess";
import { requireAuthenticatedRequest } from "@/server/routeAuth";

export type OctoUser = { id: string; email: string };

/**
 * Signed-in user with OctopilotSlides beta access, or an error response.
 * Runs are keyed by the backend user id so nobody can read another user's run.
 */
export async function requireOctoSlidesUser(request: NextRequest): Promise<{ user: OctoUser } | { response: NextResponse }> {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth;

  const me = await fetch(`${getApiBaseUrl()}/api/v1/me`, {
    headers: { Accept: "application/json", Authorization: auth.authorization },
    cache: "no-store",
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ id?: string; firebase_uid?: string; email?: string }>) : null))
    .catch(() => null);

  const id = me?.id || me?.firebase_uid;
  const email = me?.email;
  if (!id || !email) return { response: NextResponse.json({ error: "Could not load your account." }, { status: 401 }) };

  const beta = await fetchBetaAccessForEmail(email);
  if (!beta.features.octopilotSlides) {
    return { response: NextResponse.json({ error: "OctoSlides is in beta and not enabled for this account." }, { status: 403 }) };
  }
  return { user: { id, email } };
}
