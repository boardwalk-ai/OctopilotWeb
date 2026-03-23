import { NextRequest, NextResponse } from "next/server";
import { getAdminOverviewPayload, getOverviewMetricBySlug } from "@/server/adminOverview";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ metric: string }> }
) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json({ error: "Missing authorization header." }, { status: 401 });
  }

  const { metric } = await context.params;

  try {
    const payload = await getAdminOverviewPayload(authorization);
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
    const status = message.includes("admin access") ? 403 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
