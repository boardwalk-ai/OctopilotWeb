/**
 * Best-effort "who did this" for audit columns. Only call it AFTER
 * requireAdminRequest has validated the token upstream: this reads the
 * Firebase ID token's claims without re-verifying the signature.
 */
export function readAdminIdentity(authorization: string): string | null {
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      user_id?: string;
      sub?: string;
    };
    return claims.email || claims.user_id || claims.sub || null;
  } catch {
    return null;
  }
}
