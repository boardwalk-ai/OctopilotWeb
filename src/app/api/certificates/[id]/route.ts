import { NextRequest, NextResponse } from "next/server";
import {
  getCertificate,
  isCertificateIdFormat,
  linkedInAddToProfileUrl,
  normalizeCertificateId,
  toPublicCertificate,
  certificateUrl,
} from "@/server/certificates";

// Public: anyone holding a certificate ID can look up its record.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalizeCertificateId(decodeURIComponent(rawId));

  if (!isCertificateIdFormat(id)) {
    return NextResponse.json(
      { error: "That is not a certificate ID. IDs look like OCTO-XXXXXXXX-000001." },
      { status: 400 },
    );
  }

  try {
    const record = await getCertificate(id);
    if (!record) {
      return NextResponse.json({ error: "No certificate matches this ID." }, { status: 404 });
    }
    const certificate = toPublicCertificate(record);
    return NextResponse.json(
      {
        certificate,
        verifyUrl: certificateUrl(certificate.id),
        linkedInUrl: certificate.status === "valid" ? linkedInAddToProfileUrl(certificate) : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Certificates] lookup failed:", error);
    return NextResponse.json({ error: "Certificate lookup is unavailable right now." }, { status: 500 });
  }
}
