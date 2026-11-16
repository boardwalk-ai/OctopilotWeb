import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/server/routeAuth";
import {
  CertificateInputError,
  createCertificate,
  listCertificates,
  validateCertificateInput,
} from "@/server/certificates";
import { readAdminIdentity } from "@/server/adminIdentity";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CertificateInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("[Certificates] admin request failed:", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;

  try {
    const list = await listCertificates();
    return NextResponse.json({ list });
  } catch (error) {
    return errorResponse(error, "Failed to load certificates.");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const input = validateCertificateInput(body);
    const certificate = await createCertificate(input, readAdminIdentity(auth.authorization));
    return NextResponse.json({ certificate }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to issue certificate.");
  }
}
