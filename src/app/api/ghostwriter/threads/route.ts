import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/server/backendConfig";

const BASE = () => `${getApiBaseUrl()}/api/v1/ghostwriter/threads`;

function fwd(req: NextRequest) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: req.headers.get("authorization") ?? "",
  };
}

export async function GET(req: NextRequest) {
  const res = await fetch(BASE(), { headers: fwd(req), cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(BASE(), {
    method: "POST",
    headers: fwd(req),
    body,
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
