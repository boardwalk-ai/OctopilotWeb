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

export type ResolvedUser = { userId: string; firebaseUid: string; plan: string; subscriptionStatus: string };

/** Heuristic: a paid/pro user gets the larger document quota. All current users
 *  are "Guest Plan"/"guest" (free) — this matches paid plans when they appear. */
export function isProPlan(plan?: string | null, subscriptionStatus?: string | null): boolean {
    return /pro|premium|plus|paid/i.test(plan || "") || /active/i.test(subscriptionStatus || "");
}

/** Per-plan cap on saved documents. */
export function documentLimitFor(plan?: string | null, subscriptionStatus?: string | null): number {
    return isProPlan(plan, subscriptionStatus) ? 50 : 10;
}

/** Validate auth and resolve the internal users.id (+ plan) for the caller. */
export async function resolveDocumentUser(
    request: NextRequest,
): Promise<ResolvedUser | { response: NextResponse }> {
    const auth = await requireAuthenticatedRequest(request);
    if ("response" in auth) return { response: auth.response };

    const firebaseUid = decodeFirebaseUid(auth.authorization);
    if (!firebaseUid) {
        return { response: NextResponse.json({ error: "Could not resolve user." }, { status: 401 }) };
    }

    const rows = await query<{ id: string; plan: string | null; subscription_status: string | null }>(
        "SELECT id, plan, subscription_status FROM users WHERE firebase_uid = $1 LIMIT 1",
        [firebaseUid],
    );
    if (!rows.length) {
        return { response: NextResponse.json({ error: "User not found." }, { status: 404 }) };
    }
    return {
        userId: rows[0].id,
        firebaseUid,
        plan: rows[0].plan ?? "",
        subscriptionStatus: rows[0].subscription_status ?? "",
    };
}
