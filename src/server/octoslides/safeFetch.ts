import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetches a public https image for the deck. Blocks private, loopback,
 * link-local and metadata addresses (SSRF), follows at most 3 redirects
 * (each re-checked), and caps the size.
 */

const MAX_BYTES = 10 * 1024 * 1024;

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function assertPublicHttps(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("Only https:// image URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error("That host is not a public address.");
  }
  return url;
}

export async function fetchPublicImage(raw: string): Promise<{ data: Uint8Array; contentType: string }> {
  let current = await assertPublicHttps(raw);
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      current = await assertPublicHttps(new URL(response.headers.get("location")!, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Image request failed (${response.status}).`);
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/.test(contentType)) throw new Error(`Not an image (${contentType || "unknown type"}).`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) throw new Error("Image is larger than 10 MB.");
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > MAX_BYTES) throw new Error("Image is larger than 10 MB.");
    return { data, contentType };
  }
  throw new Error("Too many redirects.");
}
