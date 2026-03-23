import type { NextRequest } from "next/server";

export type AdminRequestAuth = {
  mode: "firebase" | "agent";
  upstreamAuthorization: string;
  skipAdminCheck: boolean;
};

export function resolveAdminRequestAuth(request: NextRequest): AdminRequestAuth {
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

  if (!agentKey) {
    throw new Error("Missing authorization header.");
  }

  if (!expectedAgentKey || agentKey !== expectedAgentKey) {
    throw new Error("Invalid admin agent key.");
  }

  const upstreamAuthorization =
    process.env.ADMIN_AGENT_UPSTREAM_AUTHORIZATION?.trim() || process.env.ADMIN_SERVICE_AUTHORIZATION?.trim() || "";

  if (!upstreamAuthorization) {
    throw new Error("ADMIN_AGENT_UPSTREAM_AUTHORIZATION is not configured.");
  }

  return {
    mode: "agent",
    upstreamAuthorization,
    skipAdminCheck: true,
  };
}
