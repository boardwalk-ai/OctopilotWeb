import type { NextRequest } from "next/server";
import type { ValidatedRequestAuthorization } from "./routeAuth";
import { requireAuthenticatedRequest } from "./routeAuth";

/**
 * Returns true when this Next.js instance is running as the standalone
 * formatter app (formatter.octopilotai.app).
 * Controlled by the server-only env var STANDALONE_MODE=true.
 */
export function isStandaloneMode(): boolean {
  return process.env.STANDALONE_MODE === "true";
}

/**
 * For formatter/AI routes that should be freely accessible in standalone mode
 * but still require authentication inside the main Octopilot app.
 *
 * Humanizer routes should always call requireAuthenticatedRequest directly —
 * humanization is never free, even in standalone mode.
 */
export async function requireAuthIfNotStandalone(
  request: NextRequest,
): Promise<ValidatedRequestAuthorization> {
  if (isStandaloneMode()) {
    return { authorization: "" };
  }
  return requireAuthenticatedRequest(request);
}
