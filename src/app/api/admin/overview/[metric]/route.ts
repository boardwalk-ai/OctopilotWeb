import { NextRequest } from "next/server";
import { getAdminOverviewPayload, getOverviewMetricBySlug } from "@/server/adminOverview";
import { resolveAdminRequestAuth } from "@/server/adminRequestAuth";
import { runPublicOverviewJsonRoute } from "@/server/publicOverviewGuard";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ metric: string }> }
) {
  const { metric } = await context.params;

  return runPublicOverviewJsonRoute(request, `admin-overview:metric:${metric}`, async () => {
    try {
      const auth = resolveAdminRequestAuth(request, { allowPublic: true });
      const payload = await getAdminOverviewPayload({
        authorization: auth.upstreamAuthorization,
        skipAdminCheck: auth.skipAdminCheck,
      });
      const metricPayload = getOverviewMetricBySlug(payload, metric);

      if (!metricPayload) {
        return {
          status: 404,
          body: { error: "Unknown overview metric." },
        };
      }

      return {
        status: 200,
        body: {
          generatedAt: payload.generatedAt,
          isPartial: payload.isPartial,
          errors: payload.errors,
          metric: metricPayload,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load admin overview metric.";
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
