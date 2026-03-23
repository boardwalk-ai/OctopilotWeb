import type { NextRequest } from "next/server";

export type AdminRequestAuth = {
  mode: "firebase" | "agent" | "public";
  upstreamAuthorization: string;
  skipAdminCheck: boolean;
};

function resolveServiceAuthorization() {
  const rawValue =
    process.env.ADMIN_PUBLIC_UPSTREAM_AUTHORIZATION?.trim() ||
    process.env.ADMIN_AGENT_UPSTREAM_AUTHORIZATION?.trim() ||
    process.env.ADMIN_SERVICE_AUTHORIZATION?.trim() ||
    "";

  if (!rawValue) {
    return "";
  }

  // Allow a bare token like "brokeoctopus" in env and forward it as a bearer token.
  if (/\s/.test(rawValue)) {
    return rawValue;
  }

  return `Bearer ${rawValue}`;
}

export function resolveAdminRequestAuth(request: NextRequest, options?: { allowPublic?: boolean }): AdminRequestAuth {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization) {
    return {
      mode: "firebase",
      upstreamAuthorization: authorization,
      skipAdminCheck: false,
    };
  }

  const agentKey = request.headers.get("x-admin-agent-key")?.trim();
  const expectedAgentKey = process.env.ADMIN_AGENT_API_KEY?.trim();

  if (agentKey) {
    if (!expectedAgentKey || agentKey !== expectedAgentKey) {
      throw new Error("Invalid admin agent key.");
    }

    const upstreamAuthorization = resolveServiceAuthorization();
    if (!upstreamAuthorization) {
      throw new Error("ADMIN_AGENT_UPSTREAM_AUTHORIZATION is not configured.");
    }

    return {
      mode: "agent",
      upstreamAuthorization,
      skipAdminCheck: true,
    };
  }

  if (options?.allowPublic) {
    const publicAuthorization = resolveServiceAuthorization();
    if (!publicAuthorization) {
      throw new Error("ADMIN_PUBLIC_UPSTREAM_AUTHORIZATION is not configured.");
    }

    return {
      mode: "public",
      upstreamAuthorization: publicAuthorization,
      skipAdminCheck: true,
    };
  }

  throw new Error("Missing authorization header.");
}
