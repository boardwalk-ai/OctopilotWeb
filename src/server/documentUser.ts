import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { query } from "@/server/db";

/** Decode the Firebase uid from an already-verified bearer token. The token's
 *  signature is validated upstream by requireAuthenticatedRequest (/api/v1/me);
 *  here we just read the `user_id`/`sub` claim from the payload. */
function decodeFirebaseUid(authorization: string): string | null {
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
        const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const payload = JSON.parse(json) as { user_id?: string; sub?: string };
        return payload.user_id || payload.sub || null;
    } catch {
        return null;
    }
}

export type ResolvedUser = { userId: string; firebaseUid: string };

/** Validate auth and resolve the internal users.id for the caller. */
export async function resolveDocumentUser(
    request: NextRequest,
): Promise<ResolvedUser | { response: NextResponse }> {
    const auth = await requireAuthenticatedRequest(request);
    if ("response" in auth) return { response: auth.response };

    const firebaseUid = decodeFirebaseUid(auth.authorization);
    if (!firebaseUid) {
        return { response: NextResponse.json({ error: "Could not resolve user." }, { status: 401 }) };
    }

    const rows = await query<{ id: string }>(
        "SELECT id FROM users WHERE firebase_uid = $1 LIMIT 1",
        [firebaseUid],
    );
    if (!rows.length) {
        return { response: NextResponse.json({ error: "User not found." }, { status: 404 }) };
    }
    return { userId: rows[0].id, firebaseUid };
}
