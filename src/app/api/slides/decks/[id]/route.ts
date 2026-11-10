
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/server/db";
import { resolveDocumentUser } from "@/server/documentUser";
import type { DeckState } from "@/types/slides";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

type UpdateDeckPayload = {
  title?: string;
  state?: DeckState;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validState(value: unknown): value is DeckState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.deckId === "string" &&
    state.deckId.trim().length > 0 &&
    Array.isArray(state.slides)
  );
}

// GET /api/slides/decks/:id
export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await resolveDocumentUser(request);
    if ("response" in user) return user.response;

    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: "Invalid deck ID." }, { status: 400 });
    }

    const decks = await query(
      `SELECT id, deck_id, title, state, created_at, updated_at
       FROM slide_decks
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [id, user.userId],
    );

    if (!decks.length) {
      return NextResponse.json(
        { error: "Presentation not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ deck: decks[0] });
  } catch (error) {
    console.error("[slides/decks/:id] GET:", error);
    return NextResponse.json(
      { error: "Failed to load presentation." },
      { status: 500 },
    );
  }
}

// PUT /api/slides/decks/:id
export async function PUT(request: NextRequest, context: Context) {
  try {
    const user = await resolveDocumentUser(request);
    if ("response" in user) return user.response;

    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: "Invalid deck ID." }, { status: 400 });
    }

    const body = (await request.json()) as UpdateDeckPayload;

    if (!validState(body.state)) {
      return NextResponse.json(
        { error: "A valid deck state is required." },
        { status: 400 },
      );
    }

    const title = body.title?.trim() || "Untitled presentation";

    const rows = await query<{ id: string }>(
      `UPDATE slide_decks
       SET title = $1, state = $2::jsonb
       WHERE id = $3 AND user_id = $4 AND deck_id = $5
       RETURNING id`,
      [
        title,
        JSON.stringify(body.state),
        id,
        user.userId,
        body.state.deckId,
      ],
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: "Presentation not found or deck ID mismatch." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[slides/decks/:id] PUT:", error);
    return NextResponse.json(
      { error: "Failed to update presentation." },
      { status: 500 },
    );
  }
}

// DELETE /api/slides/decks/:id
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const user = await resolveDocumentUser(request);
    if ("response" in user) return user.response;

    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: "Invalid deck ID." }, { status: 400 });
    }

    const rows = await query<{ id: string }>(
      `DELETE FROM slide_decks
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, user.userId],
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: "Presentation not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[slides/decks/:id] DELETE:", error);
    return NextResponse.json(
      { error: "Failed to delete presentation." },
      { status: 500 },
    );
  }
}
