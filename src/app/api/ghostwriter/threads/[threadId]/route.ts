import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/server/backendConfig";

function url(threadId: string) {
  return `${getApiBaseUrl()}/api/v1/ghostwriter/threads/${encodeURIComponent(threadId)}`;
}
function fwd(req: NextRequest) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: req.headers.get("authorization") ?? "",
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const res = await fetch(url(threadId), { headers: fwd(req), cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const body = await req.text();
  const res = await fetch(url(threadId), {
    method: "PATCH",
    headers: fwd(req),
    body,
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const res = await fetch(url(threadId), {
    method: "DELETE",
    headers: fwd(req),
    cache: "no-store",
  });
  return new NextResponse(null, { status: res.status });
}
