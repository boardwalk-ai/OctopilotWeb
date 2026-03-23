import { NextRequest, NextResponse } from "next/server";
import { getAdminOverviewPayload, getOverviewMetricBySlug } from "@/server/adminOverview";
import { resolveAdminRequestAuth } from "@/server/adminRequestAuth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ metric: string }> }
) {
  const { metric } = await context.params;

  try {
    const auth = resolveAdminRequestAuth(request);
    const payload = await getAdminOverviewPayload({
      authorization: auth.upstreamAuthorization,
      skipAdminCheck: auth.skipAdminCheck,
    });
    const metricPayload = getOverviewMetricBySlug(payload, metric);

    if (!metricPayload) {
      return NextResponse.json({ error: "Unknown overview metric." }, { status: 404 });
    }

    return NextResponse.json({
      generatedAt: payload.generatedAt,
      isPartial: payload.isPartial,
      errors: payload.errors,
      metric: metricPayload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin overview metric.";
    const status =
      message.includes("Missing authorization") ? 401 : message.includes("agent key") || message.includes("admin access") ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
