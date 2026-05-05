import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/server/backendConfig";

function url(folderId: string) {
  return `${getApiBaseUrl()}/api/v1/ghostwriter/folders/${encodeURIComponent(folderId)}`;
}
function fwd(req: NextRequest) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: req.headers.get("authorization") ?? "",
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  const body = await req.text();
  const res = await fetch(url(folderId), {
    method: "PATCH",
    headers: fwd(req),
    body,
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  const res = await fetch(url(folderId), {
    method: "DELETE",
    headers: fwd(req),
    cache: "no-store",
  });
  return new NextResponse(null, { status: res.status });
}
