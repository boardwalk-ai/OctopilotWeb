import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/server/routeAuth";
import { isCertificateIdFormat, normalizeCertificateId, swapCertificateImageUrl } from "@/server/certificates";
import {
  CertificateImageError,
  MAX_UPLOAD_BYTES,
  removeCertificateImage,
  storeCertificateImage,
} from "@/server/certificateImage";

/**
 * PUT    /api/admin/certificates/<id>/image  body: the raw PNG or JPEG bytes
 * DELETE /api/admin/certificates/<id>/image
 * Uploading again replaces the image; the old file is deleted after the swap.
 */

function readId(raw: string) {
  const id = normalizeCertificateId(decodeURIComponent(raw));
  return isCertificateIdFormat(id) ? id : null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;

  const id = readId((await params).id);
  if (!id) return NextResponse.json({ error: "Not a certificate ID." }, { status: 400 });

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "The image is larger than 10 MB." }, { status: 413 });
  }

  let newUrl: string | null = null;
  try {
    const data = new Uint8Array(await request.arrayBuffer());
    newUrl = await storeCertificateImage(id, data);
    const swapped = await swapCertificateImageUrl(id, newUrl);
    if (!swapped) {
      await removeCertificateImage(newUrl);
      return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    }
    if (swapped.previousUrl && swapped.previousUrl !== newUrl) {
      await removeCertificateImage(swapped.previousUrl).catch((error) =>
        console.error("[Certificates] could not delete old image:", error),
      );
    }
    return NextResponse.json({ certificate: swapped.record });
  } catch (error) {
    if (newUrl) await removeCertificateImage(newUrl).catch(() => undefined);
    if (error instanceof CertificateImageError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[Certificates] image upload failed:", error);
    return NextResponse.json({ error: "Upload failed. Nothing was changed." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(request);
  if ("response" in auth) return auth.response;

  const id = readId((await params).id);
  if (!id) return NextResponse.json({ error: "Not a certificate ID." }, { status: 400 });

  try {
    const swapped = await swapCertificateImageUrl(id, null);
    if (!swapped) return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    await removeCertificateImage(swapped.previousUrl).catch((error) =>
      console.error("[Certificates] could not delete image file:", error),
    );
    return NextResponse.json({ certificate: swapped.record });
  } catch (error) {
    console.error("[Certificates] image delete failed:", error);
    return NextResponse.json({ error: "Could not remove the image." }, { status: 500 });
  }
}
