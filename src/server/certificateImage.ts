import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { CERTIFICATE_SITE_URL } from "@/server/certificates";

/**
 * Certificate images live on this server under /var/www/octopilot-certificates
 * and nginx serves them at <site>/certificate-images/<file>. Files are named
 * <id>-<version>.<ext> so a replaced image gets a new URL (nginx caches for 30d,
 * LinkedIn caches previews too) and an old URL never shows the new picture.
 */
const IMAGE_DIR = process.env.CERTIFICATE_IMAGE_DIR || "/var/www/octopilot-certificates";
const LOCAL_PREFIX = `${CERTIFICATE_SITE_URL}/certificate-images/`;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MIN_WIDTH = 1000;
const MAX_PIXELS = 12000 * 12000;

export class CertificateImageError extends Error {}

type ImageFormat = "PNG" | "JPEG";

function sniffFormat(data: Uint8Array): ImageFormat | null {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "PNG";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "JPEG";
  return null;
}

/** The file name inside IMAGE_DIR for one of our URLs, or null for any other URL. */
export function localImageFile(imageUrl: string | null): string | null {
  if (!imageUrl || !imageUrl.startsWith(LOCAL_PREFIX)) return null;
  const file = basename(decodeURIComponent(imageUrl.slice(LOCAL_PREFIX.length).split("?")[0]));
  return /^OCTO-[A-Z0-9]{8}-[0-9]{6}(-[a-z0-9]+)?\.(png|jpg)$/.test(file) ? file : null;
}

/**
 * Validates an uploaded certificate picture and stores a clean copy.
 * The bytes are decoded and re-encoded with sharp, which checks the file really
 * is an image, applies EXIF rotation and drops metadata (GPS, editor history).
 */
export async function storeCertificateImage(certificateId: string, data: Uint8Array): Promise<string> {
  if (data.byteLength === 0) throw new CertificateImageError("The file is empty.");
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new CertificateImageError("The image is larger than 10 MB.");
  const format = sniffFormat(data);
  if (!format) throw new CertificateImageError("Upload a PNG or JPEG image.");

  let output: Buffer;
  try {
    const image = sharp(data, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
    const meta = await image.metadata();
    const width = meta.autoOrient?.width ?? meta.width ?? 0;
    const height = meta.autoOrient?.height ?? meta.height ?? 0;
    if (width < MIN_WIDTH) throw new CertificateImageError(`The image is ${width}px wide; use at least ${MIN_WIDTH}px.`);
    if (height > width) throw new CertificateImageError("Certificates are landscape; this image is portrait.");
    output = format === "PNG" ? await image.png({ compressionLevel: 9 }).toBuffer() : await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  } catch (error) {
    if (error instanceof CertificateImageError) throw error;
    throw new CertificateImageError("That file could not be read as an image.");
  }

  await mkdir(IMAGE_DIR, { recursive: true });
  const file = `${certificateId}-${Date.now().toString(36)}${randomBytes(2).toString("hex")}.${format === "PNG" ? "png" : "jpg"}`;
  const tmp = join(IMAGE_DIR, `.${file}.tmp`);
  await writeFile(tmp, output, { mode: 0o644 });
  await rename(tmp, join(IMAGE_DIR, file)); // atomic: nginx never serves a half-written file
  return `${LOCAL_PREFIX}${file}`;
}

/** Deletes one of our stored images. Other URLs (hosted elsewhere) are left alone. */
export async function removeCertificateImage(imageUrl: string | null): Promise<void> {
  const file = localImageFile(imageUrl);
  if (!file) return;
  try {
    await unlink(join(IMAGE_DIR, file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function loadCertificateImage(imageUrl: string): Promise<{ data: Uint8Array; format: ImageFormat }> {
  let data: Uint8Array;
  const file = localImageFile(imageUrl);
  if (file) {
    data = new Uint8Array(await readFile(join(IMAGE_DIR, file)));
  } else {
    const response = await fetch(imageUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Image fetch failed with ${response.status}.`);
    data = new Uint8Array(await response.arrayBuffer());
  }
  if (data.byteLength > 15 * 1024 * 1024) throw new Error("Certificate image is too large.");
  const format = sniffFormat(data);
  if (!format) throw new Error("Certificate image must be PNG or JPEG.");
  return { data, format };
}
