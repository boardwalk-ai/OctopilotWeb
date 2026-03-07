import { NextRequest, NextResponse } from "next/server";

function getAdminBackendBaseUrl() {
  return (process.env.ADMIN_BACKEND_BASE_URL || "http://187.124.92.119:8000").replace(/\/$/, "");
}

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json({ error: "Missing authorization header." }, { status: 401 });
  }

  const { userId } = await context.params;
  const body = await request.json();

  try {
    const response = await fetch(`${getAdminBackendBaseUrl()}/api/v1/dashboard/users/${userId}/credits`, {
      method: "PATCH",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: payload.detail || payload.error || "Failed to update credits." }, { status: response.status });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update credits." },
      { status: 500 }
    );
  }
}
