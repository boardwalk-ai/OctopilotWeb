import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { certificateUrl, getCertificate, isCertificateIdFormat, normalizeCertificateId } from "@/server/certificates";
import { loadCertificateImage } from "@/server/certificateImage";

/**
 * GET /verify/<id>/pdf: the certificate image wrapped in an A4 landscape PDF,
 * built on request so no PDF is ever stored on the server.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = normalizeCertificateId(decodeURIComponent(rawId));
  if (!isCertificateIdFormat(id)) {
    return NextResponse.json({ error: "Not a certificate ID." }, { status: 400 });
  }

  try {
    const cert = await getCertificate(id);
    if (!cert || cert.status !== "valid" || !cert.imageUrl) {
      return NextResponse.json({ error: "No downloadable certificate for this ID." }, { status: 404 });
    }

    const image = await loadCertificateImage(cert.imageUrl);

    // A4 landscape is 297 x 210 mm (ratio 1.414); fit the image inside it, centred.
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const props = doc.getImageProperties(image.data);
    const pageW = 297;
    const pageH = 210;
    const scale = Math.min(pageW / props.width, pageH / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    doc.addImage(image.data, image.format, (pageW - w) / 2, (pageH - h) / 2, w, h, undefined, "FAST");
    doc.setProperties({
      title: `${cert.recipientName}, ${cert.title}`,
      subject: `OctoPilot AI certificate ${cert.id}. Verify at ${certificateUrl(cert.id)}`,
      author: "OctoPilot AI",
      creator: "OctoPilot AI",
      keywords: cert.id,
    });
    doc.link((pageW - w) / 2, (pageH - h) / 2, w, h, { url: certificateUrl(cert.id) });

    const pdf = Buffer.from(doc.output("arraybuffer"));
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="OctoPilot-Certificate-${cert.id}.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[Verify] PDF build failed:", error);
    return NextResponse.json({ error: "Could not build the PDF right now." }, { status: 500 });
  }
}
