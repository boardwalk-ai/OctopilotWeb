import { NextRequest } from "next/server";
import { getAdminOverviewPayload } from "@/server/adminOverview";
import { resolveAdminRequestAuth } from "@/server/adminRequestAuth";
import { runPublicOverviewJsonRoute } from "@/server/publicOverviewGuard";

export async function GET(request: NextRequest) {
  return runPublicOverviewJsonRoute(request, "admin-overview:aggregate", async () => {
    try {
      const auth = resolveAdminRequestAuth(request, { allowPublic: true });
      const payload = await getAdminOverviewPayload({
        authorization: auth.upstreamAuthorization,
        skipAdminCheck: auth.skipAdminCheck,
      });

      return {
        status: 200,
        body: payload,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load admin overview.";
      const status =
        message.includes("agent key") || message.includes("admin access")
          ? 403
          : message.includes("authorization header")
            ? 401
            : message.includes("configured")
              ? 500
              : 500;

      return {
        status,
        body: { error: message },
      };
    }
  });
}
