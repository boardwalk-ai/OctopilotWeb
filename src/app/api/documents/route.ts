import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { query, withTransaction } from "@/server/db";
import { resolveDocumentUser } from "@/server/documentUser";

export const runtime = "nodejs";

export type DocumentPayload = {
    title?: string;
    format_style?: string;
    word_count?: number;
    preview?: string;
    state?: unknown;
    sources?: { source_ref?: string; title?: string; url?: string; content?: string }[];
    outlines?: {
        outline_ref?: string;
        type?: string;
        title?: string;
        bullets?: { text?: string; sub?: { text?: string }[] }[];
    }[];
};

/** Replace the normalized child rows (sources / outlines / bullets) for a doc. */
export async function writeDocumentChildren(
    client: PoolClient,
    documentId: string,
    payload: DocumentPayload,
): Promise<void> {
    await client.query("DELETE FROM document_sources WHERE document_id = $1", [documentId]);
    await client.query("DELETE FROM document_outlines WHERE document_id = $1", [documentId]); // bullets cascade

    for (let i = 0; i < (payload.sources ?? []).length; i++) {
        const s = payload.sources![i];
        await client.query(
            `INSERT INTO document_sources (document_id, source_ref, title, url, content, position)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [documentId, s.source_ref ?? null, s.title ?? null, s.url ?? null, s.content ?? null, i],
        );
    }

    for (let i = 0; i < (payload.outlines ?? []).length; i++) {
        const o = payload.outlines![i];
        const { rows } = await client.query<{ id: string }>(
            `INSERT INTO document_outlines (document_id, outline_ref, type, title, position)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [documentId, o.outline_ref ?? null, o.type ?? null, o.title ?? null, i],
        );
        const outlineId = rows[0].id;
        const bullets = o.bullets ?? [];
        for (let b = 0; b < bullets.length; b++) {
            const { rows: br } = await client.query<{ id: string }>(
                `INSERT INTO document_outline_bullets (outline_id, parent_bullet_id, text, position)
                 VALUES ($1, NULL, $2, $3) RETURNING id`,
                [outlineId, bullets[b].text ?? "", b],
            );
            const parentId = br[0].id;
            const subs = bullets[b].sub ?? [];
            for (let sb = 0; sb < subs.length; sb++) {
                await client.query(
                    `INSERT INTO document_outline_bullets (outline_id, parent_bullet_id, text, position)
                     VALUES ($1, $2, $3, $4)`,
                    [outlineId, parentId, subs[sb].text ?? "", sb],
                );
            }
        }
    }
}

// ── GET /api/documents — list the caller's documents (for the Save Deck) ──────
export async function GET(request: NextRequest) {
    try {
        const user = await resolveDocumentUser(request);
        if ("response" in user) return user.response;
        const rows = await query(
            `SELECT id, title, format_style, word_count, preview, created_at, updated_at
             FROM documents WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 200`,
            [user.userId],
        );
        return NextResponse.json({ documents: rows });
    } catch (e) {
        console.error("[documents] GET error:", e);
        return NextResponse.json({ error: "Failed to list documents." }, { status: 500 });
    }
}

// ── POST /api/documents — create a new document ───────────────────────────────
export async function POST(request: NextRequest) {
    try {
        const user = await resolveDocumentUser(request);
        if ("response" in user) return user.response;
        const body = (await request.json()) as DocumentPayload;

        const id = await withTransaction(async (client) => {
            const { rows } = await client.query<{ id: string }>(
                `INSERT INTO documents (user_id, title, format_style, word_count, preview, state)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [
                    user.userId,
                    body.title?.trim() || "Untitled document",
                    body.format_style || "none",
                    body.word_count ?? 0,
                    body.preview ?? "",
                    JSON.stringify(body.state ?? {}),
                ],
            );
            const newId = rows[0].id;
            await writeDocumentChildren(client, newId, body);
            return newId;
        });

        return NextResponse.json({ id }, { status: 201 });
    } catch (e) {
        console.error("[documents] POST error:", e);
        return NextResponse.json({ error: "Failed to create document." }, { status: 500 });
    }
}
