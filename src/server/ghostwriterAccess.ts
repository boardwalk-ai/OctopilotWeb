import type { NextRequest } from "next/server";

const DEFAULT_ALLOWED_IPS = ["1.38.233.10"];

function normalizeIp(value: string | null | undefined) {
  return (value || "").trim();
}

export function getGhostwriterClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return normalizeIp(forwarded.split(",")[0]);
  }

  return (
    normalizeIp(request.headers.get("cf-connecting-ip")) ||
    normalizeIp(request.headers.get("x-real-ip")) ||
    normalizeIp(request.headers.get("x-client-ip")) ||
    "unknown"
  );
}

export function getGhostwriterAllowedIps() {
  const configured = (process.env.GHOSTWRITER_ALLOWED_IPS || "")
    .split(",")
    .map((value) => normalizeIp(value))
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_ALLOWED_IPS;
}

export function isGhostwriterAllowedRequest(request: NextRequest) {
  const host = normalizeIp(request.headers.get("host"));
  if (host.includes("localhost") || host.startsWith("127.0.0.1")) {
    return true;
  }

  const clientIp = getGhostwriterClientIp(request);
  if (clientIp === "unknown") {
    return false;
  }

  return getGhostwriterAllowedIps().includes(clientIp);
}
