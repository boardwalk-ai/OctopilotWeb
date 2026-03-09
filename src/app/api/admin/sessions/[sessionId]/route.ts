import { NextRequest, NextResponse } from "next/server";

function getAdminBackendBaseUrl() {
  return (process.env.ADMIN_BACKEND_BASE_URL || "http://187.124.92.119:8000").replace(/\/$/, "");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json({ error: "Missing authorization header." }, { status: 401 });
  }

  const { sessionId } = await context.params;

  try {
    const response = await fetch(`${getAdminBackendBaseUrl()}/api/v1/dashboard/sessions/${sessionId}`, {
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: payload.detail || payload.error || "Failed to load session detail." }, { status: response.status });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load session detail." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json({ error: "Missing authorization header." }, { status: 401 });
  }

  const { sessionId } = await context.params;

  try {
    const response = await fetch(`${getAdminBackendBaseUrl()}/api/v1/dashboard/sessions/${sessionId}`, {
      method: "DELETE",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: payload.detail || payload.error || "Failed to delete session." }, { status: response.status });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete session." },
      { status: 500 }
    );
  }
}
