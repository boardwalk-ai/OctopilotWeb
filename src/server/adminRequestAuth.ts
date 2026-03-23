import type { NextRequest } from "next/server";
import { resolveConfiguredUpstreamAuthorization } from "@/server/serviceAuthorization";

export type AdminRequestAuth = {
  mode: "firebase" | "agent" | "public";
  upstreamAuthorization: string;
  skipAdminCheck: boolean;
};

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

    const upstreamAuthorization = resolveConfiguredUpstreamAuthorization(
      "ADMIN_AGENT_UPSTREAM_AUTHORIZATION",
      "ADMIN_SERVICE_AUTHORIZATION",
      "ADMIN_PUBLIC_UPSTREAM_AUTHORIZATION",
    );
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
    const publicAuthorization = resolveConfiguredUpstreamAuthorization(
      "ADMIN_PUBLIC_UPSTREAM_AUTHORIZATION",
      "ADMIN_SERVICE_AUTHORIZATION",
      "ADMIN_AGENT_UPSTREAM_AUTHORIZATION",
    );
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
