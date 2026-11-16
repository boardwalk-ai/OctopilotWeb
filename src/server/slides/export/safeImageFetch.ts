import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Buffer } from "node:buffer";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
    (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function imageMime(bytes: Buffer): "image/png" | "image/jpeg" {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  throw new Error("Only PNG and JPEG images are supported");
}

async function downloadImage(rawUrl: string, redirects = 0): Promise<Buffer> {
  if (redirects > MAX_REDIRECTS) throw new Error("Too many image redirects");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.port || url.username || url.password || isIP(url.hostname)) {
    throw new Error("Image URL must be a public HTTPS hostname on port 443");
  }

  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpv4(address))) {
    throw new Error("Image URL resolves to a non-public address");
  }
  // Connect to the validated address directly, while retaining the hostname for TLS and Host.
  const address = addresses[0].address;
  return new Promise<Buffer>((resolve, reject) => {
    const req = request({
      hostname: address,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      headers: { Host: url.hostname, Accept: "image/png,image/jpeg" },
      timeout: 10_000,
    }, async (res) => {
      try {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          const location = res.headers.location;
          res.resume();
          if (!location) throw new Error("Image redirect has no location");
          resolve(await downloadImage(new URL(location, url).toString(), redirects + 1));
          return;
        }
        if (status !== 200) throw new Error(`Image request failed: ${status}`);
        const contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        if (contentType !== "image/png" && contentType !== "image/jpeg") {
          throw new Error("Image response must be PNG or JPEG");
        }
        if (Number(res.headers["content-length"] ?? 0) > MAX_IMAGE_BYTES) {
          throw new Error("Image is too large");
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of res) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > MAX_IMAGE_BYTES) throw new Error("Image is too large");
          chunks.push(bytes);
        }
        resolve(Buffer.concat(chunks));
      } catch (error) {
        res.destroy();
        reject(error);
      }
    });
    req.on("timeout", () => req.destroy(new Error("Image request timed out")));
    req.on("error", reject);
    req.end();
  });
}

export async function fetchSafeImageData(src: string): Promise<string> {
  let bytes: Buffer;
  if (src.startsWith("data:")) {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(src);
    if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) {
      throw new Error("Invalid or oversized image data URL");
    }
    bytes = Buffer.from(match[2], "base64");
  } else {
    bytes = await downloadImage(src);
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image is too large");
  const mime = imageMime(bytes);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
