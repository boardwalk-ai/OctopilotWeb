import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "@/server/db";
import { resolveDocumentUser } from "@/server/documentUser";
import { writeDocumentChildren, type DocumentPayload } from "../route";

export const runtime = "nodejs";

// ── GET /api/documents/[id] — load full document state (owner only) ───────────
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = await resolveDocumentUser(request);
        if ("response" in user) return user.response;
        const { id } = await ctx.params;
        const rows = await query(
            `SELECT id, title, format_style, word_count, preview, state, created_at, updated_at
             FROM documents WHERE id = $1 AND user_id = $2 LIMIT 1`,
            [id, user.userId],
        );
        if (!rows.length) return NextResponse.json({ error: "Document not found." }, { status: 404 });
        return NextResponse.json({ document: rows[0] });
    } catch (e) {
        console.error("[documents/:id] GET error:", e);
        return NextResponse.json({ error: "Failed to load document." }, { status: 500 });
    }
}

// ── PUT /api/documents/[id] — overwrite (save) the document, owner only ────────
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = await resolveDocumentUser(request);
        if ("response" in user) return user.response;
        const { id } = await ctx.params;
        const body = (await request.json()) as DocumentPayload;

        const ok = await withTransaction(async (client) => {
            const { rowCount } = await client.query(
                `UPDATE documents
                 SET title = $1, format_style = $2, word_count = $3, preview = $4, state = $5
                 WHERE id = $6 AND user_id = $7`,
                [
                    body.title?.trim() || "Untitled document",
                    body.format_style || "none",
                    body.word_count ?? 0,
                    body.preview ?? "",
                    JSON.stringify(body.state ?? {}),
                    id,
                    user.userId,
                ],
            );
            if (!rowCount) return false;
            await writeDocumentChildren(client, id, body);
            return true;
        });

        if (!ok) return NextResponse.json({ error: "Document not found." }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[documents/:id] PUT error:", e);
        return NextResponse.json({ error: "Failed to save document." }, { status: 500 });
    }
}

// ── PATCH /api/documents/[id] — rename (title only), owner only ───────────────
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = await resolveDocumentUser(request);
        if ("response" in user) return user.response;
        const { id } = await ctx.params;
        const body = (await request.json()) as { title?: string };
        const title = (body.title ?? "").trim();
        if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

        const rows = await query(
            "UPDATE documents SET title = $1 WHERE id = $2 AND user_id = $3 RETURNING id",
            [title, id, user.userId],
        );
        if (!rows.length) return NextResponse.json({ error: "Document not found." }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[documents/:id] PATCH error:", e);
        return NextResponse.json({ error: "Failed to rename document." }, { status: 500 });
    }
}

// ── DELETE /api/documents/[id] — owner only (children cascade) ────────────────
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const user = await resolveDocumentUser(request);
        if ("response" in user) return user.response;
        const { id } = await ctx.params;
        const rows = await query(
            "DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id",
            [id, user.userId],
        );
        if (!rows.length) return NextResponse.json({ error: "Document not found." }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[documents/:id] DELETE error:", e);
        return NextResponse.json({ error: "Failed to delete document." }, { status: 500 });
    }
}
