import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/server/backendConfig";

export type ValidatedRequestAuthorization =
  | { authorization: string }
  | { response: NextResponse };

async function validateAuthorization(authorization: string, path: string): Promise<Response> {
  return fetch(`${getApiBaseUrl()}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
    cache: "no-store",
  });
}

async function buildFailureResponse(response: Response, fallbackMessage: string) {
  const status = response.status === 403 ? 403 : 401;
  let message = fallbackMessage;

  try {
    const payload = (await response.json()) as { detail?: string; error?: string };
    const detail = payload.detail || payload.error;
    if (typeof detail === "string" && detail.trim()) {
      message = detail;
    }
  } catch {
    // Ignore opaque upstream bodies and keep the fallback message.
  }

  return {
    response: NextResponse.json({ error: message }, { status }),
  } satisfies ValidatedRequestAuthorization;
}

async function requireValidatedAuthorization(
  request: NextRequest,
  path: string,
  fallbackMessage: string,
): Promise<ValidatedRequestAuthorization> {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return {
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  try {
    const response = await validateAuthorization(authorization, path);
    if (!response.ok) {
      return buildFailureResponse(response, fallbackMessage);
    }
  } catch (error) {
    console.error("[RouteAuth] Upstream auth validation failed:", error);
    return {
      response: NextResponse.json({ error: "Unable to verify authentication." }, { status: 500 }),
    };
  }

  return { authorization };
}

export async function requireAuthenticatedRequest(request: NextRequest): Promise<ValidatedRequestAuthorization> {
  return requireValidatedAuthorization(request, "/api/v1/me", "Authentication required.");
}

export async function requireAdminRequest(request: NextRequest): Promise<ValidatedRequestAuthorization> {
  return requireValidatedAuthorization(request, "/api/v1/dashboard/check-admin", "Admin access required.");
}
