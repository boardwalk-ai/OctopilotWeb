import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/server/routeAuth";
import {
  CertificateInputError,
  setCertificateStatus,
  updateCertificate,
  validateCertificateInput,
} from "@/server/certificates";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CertificateInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("[Certificates] admin request failed:", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/**
 * PATCH body is either
 *   { action: "revoke", reason?: string } / { action: "restore" }
 * or the full editable fields (same shape as POST /api/admin/certificates).
 * Certificates are never hard-deleted: a revoked ID keeps verifying as revoked.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    let certificate;
    if (body.action === "revoke" || body.action === "restore") {
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || null : null;
      certificate = await setCertificateStatus(id, body.action === "revoke" ? "revoked" : "valid", reason);
    } else {
      certificate = await updateCertificate(id, validateCertificateInput(body));
    }

    if (!certificate) {
      return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    }
    return NextResponse.json({ certificate });
  } catch (error) {
    return errorResponse(error, "Failed to update certificate.");
  }
}
